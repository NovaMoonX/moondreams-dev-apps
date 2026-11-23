import { getApps, initializeApp } from 'firebase-admin/app';
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import {
  createEmailIngest,
  EMAIL_WEBHOOK_SECRET_NAME,
  type EmailHandlerInput,
  type EmailMail,
} from '../../../email/createEmailIngest.js';
import {
  snippetOf,
  toAddress,
  withoutEmailAddresses,
} from '../../../email/emailUtils.js';
import { isGateOpenForUid } from '../../../gates/assertGateOpen.js';
import { AMC_API_KEY } from '../amc.js';
import { OMDB_API_KEY, TMDB_API_KEY } from '../movieProvider.js';
import {
  ATTACH_WINDOW_MS,
  CANCEL_WINDOW_MS,
  computeEndsAt,
  findAttachTarget,
  findCancelTarget,
  ticketsLeftAfterRefund,
  refundKey,
} from './emailMatching.js';
import {
  EMAIL_EVENT_KEEP_DAYS,
  EMAIL_ADDRESS_PREFIX,
  EMAIL_TICKETS_GATE_ID,
  MAX_EMAILS_PER_HOUR,
  emailEventsPath,
  emailRatePath,
  emailTokenPath,
  intakePath,
  viewingsPath,
  watchlistPath,
} from './emailPaths.js';
import type { EmailEvent, EmailOutcome, Viewing } from './emailTypes.js';
import {
  isFromAmc,
  looksLikeAmcOrder,
  parseAmcEmail,
  withoutMemberDetails,
  type AmcCancellation,
  type AmcReading,
  type AmcReservation,
} from './parseAmcEmail.js';
import { readAmcEmailWithAi } from './readAmcEmailWithAi.js';
import {
  loadMemberContext,
  resolveMovie,
  resolvePlace,
  resolveTicket,
} from './resolveShowing.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
const DEFAULT_WATCH_PRIORITY = 'WANT_TO_SEE';

interface Result {
  outcome: EmailOutcome;
  /** A trailer push the change leaves pointing at nothing. */
  reminderId: string | null;
}

interface Written {
  outcome: EmailOutcome;
  readBy: 'pattern' | 'ai' | null;
  viewingId: string | null;
  movieTitle: string | null;
  showtimeAt: number | null;
  theatreName: string | null;
  confirmation: string | null;
  ticketCount: number | null;
  removedViewing: Viewing | null;
  priorViewing: Viewing | null;
  watchlistKey: string | null;
}

const NOTHING_WRITTEN = {
  viewingId: null,
  movieTitle: null,
  showtimeAt: null,
  theatreName: null,
  confirmation: null,
  ticketCount: null,
  removedViewing: null,
  priorViewing: null,
  watchlistKey: null,
} satisfies Omit<Written, 'outcome' | 'readBy'>;

const SKIPPED_EXCERPT_MAX = 200;
const READ_EXCERPT_MAX = 300;

const keptText = (text: string, max: number, subject: string, context = '') =>
  snippetOf(
    withoutEmailAddresses(withoutMemberDetails(text, subject, context)),
    max,
  );

const AMC_DOMAIN = /(?:^|\.)amctheatres\.com$/;

/** AMC's own sender address, or only the domain of anyone else's, so a forwarder's address is never kept. */
const keptSender = (from: string) => {
  const address = toAddress(from);
  const domain = address.slice(address.lastIndexOf('@') + 1);
  return AMC_DOMAIN.test(domain) ? address : domain;
};

/** The event document for one email, with everything a handler didn't set left null. It keeps no member name, membership number or email address (a sender other than AMC is kept as its domain); a forwarding confirmation keeps no subject or text (its code and link live only on the intake document), and an email that was skipped keeps a subject and a short excerpt. */
function toEvent(
  { mail, eventId, now }: EmailHandlerInput,
  given: Pick<Written, 'outcome' | 'readBy'> & Partial<Written>,
) {
  const written: Written = { ...NOTHING_WRITTEN, ...given };
  const isConfirmation = written.outcome === 'confirm';
  const isSkipped =
    written.outcome === 'notTicket' || written.outcome === 'unread';
  const event: EmailEvent = {
    id: eventId,
    receivedAt: mail.receivedAt,
    outcome: written.outcome,
    from: keptSender(mail.from),
    subject: isConfirmation
      ? ''
      : keptText(mail.subject, 300, mail.subject, mail.text),
    snippet: isConfirmation
      ? ''
      : keptText(
          mail.text,
          isSkipped ? SKIPPED_EXCERPT_MAX : READ_EXCERPT_MAX,
          mail.subject,
        ),
    readBy: written.readBy,
    viewingId: written.viewingId,
    movieTitle: written.movieTitle,
    showtimeAt: written.showtimeAt,
    theatreName: written.theatreName,
    confirmation: written.confirmation,
    ticketCount: written.ticketCount,
    removedViewing: written.removedViewing,
    priorViewing: written.priorViewing,
    watchlistKey: written.watchlistKey,
    undoneAt: null,
  };
  return {
    ...event,
    expiresAt: Timestamp.fromMillis(now + EMAIL_EVENT_KEEP_DAYS * DAY_MS),
  };
}

async function readEmail(mail: EmailMail): Promise<{
  reading: AmcReading | null;
  readBy: 'pattern' | 'ai' | null;
  outcome: 'notTicket' | 'unread' | null;
}> {
  if (!isFromAmc(mail.from, mail.text)) {
    return { reading: null, readBy: null, outcome: 'notTicket' };
  }
  const byPattern = parseAmcEmail(mail.text);
  if (byPattern !== null) {
    return { reading: byPattern, readBy: 'pattern', outcome: null };
  }
  if (!looksLikeAmcOrder(mail.text)) {
    return { reading: null, readBy: null, outcome: 'notTicket' };
  }
  const byAi = await readAmcEmailWithAi(mail);
  if (byAi === null) return { reading: null, readBy: null, outcome: 'unread' };
  return byAi.reading === null
    ? { reading: null, readBy: 'ai', outcome: 'notTicket' }
    : { reading: byAi.reading, readBy: 'ai', outcome: null };
}

const toViewing = (entry: QueryDocumentSnapshot): Viewing =>
  ({ ...entry.data(), id: entry.id }) as Viewing;

const uniqueById = (viewings: Viewing[]) =>
  Array.from(
    new Map(viewings.map((viewing) => [viewing.id, viewing])).values(),
  );

/** Cancels a pending trailer push the showing no longer needs; a stale one is a lesser problem than a failed email. */
async function cancelTrailerPush(
  firestore: Firestore,
  reminderId: string | null,
) {
  if (!reminderId) return;
  try {
    const ref = firestore.doc(`reminders/${reminderId}`);
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.get('status') === 'pending') {
        transaction.update(ref, { status: 'cancelled' });
      }
    });
  } catch (error) {
    logger.warn('email.reminderCancelFailed', {
      name: (error as Error)?.name ?? 'Error',
    });
  }
}

async function handleReservation(
  input: EmailHandlerInput,
  reading: AmcReservation,
  readBy: 'pattern' | 'ai',
): Promise<{ outcome: EmailOutcome }> {
  const { firestore, uid, now } = input;
  const context = await loadMemberContext(firestore, uid);
  const place = await resolvePlace(uid, context, reading);
  const resolved = await resolveMovie(uid, context, reading, place.showtimeAt);
  const ticket = await resolveTicket(uid, context, reading, place);

  const viewings = firestore.collection(viewingsPath(uid));
  const events = firestore.collection(emailEventsPath(uid));
  const eventRef = firestore.doc(`${emailEventsPath(uid)}/${input.eventId}`);
  const watchRef = firestore.doc(`${watchlistPath(uid)}/${resolved.movieKey}`);
  const base = {
    readBy,
    movieTitle: reading.title,
    showtimeAt: place.showtimeAt,
    theatreName: place.theatre.name,
    confirmation: reading.confirmation,
    ticketCount: reading.ticketCount,
  } as const;

  const result = await firestore.runTransaction(
    async (transaction: Transaction): Promise<Result> => {
      const [held, nearby, canceled, watch] = await Promise.all([
        transaction.get(
          viewings.where('amcConfirmation', '==', reading.confirmation),
        ),
        transaction.get(
          viewings
            .where('showtimeAt', '>=', place.showtimeAt - ATTACH_WINDOW_MS)
            .where('showtimeAt', '<=', place.showtimeAt + ATTACH_WINDOW_MS),
        ),
        transaction.get(
          events
            .where('confirmation', '==', reading.confirmation)
            .where('outcome', '==', 'canceled')
            .limit(1),
        ),
        transaction.get(watchRef),
      ]);
      if (!held.empty || !canceled.empty) {
        transaction.create(
          eventRef,
          toEvent(input, {
            ...base,
            outcome: 'alreadyHandled',
            viewingId: held.docs[0]?.id ?? null,
          }),
        );
        return { outcome: 'alreadyHandled', reminderId: null };
      }
      const target = findAttachTarget(nearby.docs.map(toViewing), {
        movieKey: resolved.movieKey,
        title: reading.title,
        theatre: place.theatre,
        showtimeAt: place.showtimeAt,
      });
      if (target !== null) {
        const isMoved = target.showtimeAt !== place.showtimeAt;
        transaction.update(viewings.doc(target.id), {
          ...(ticket === null ? {} : { ticket }),
          theatre: place.theatre,
          showtimeAt: place.showtimeAt,
          endsAt: computeEndsAt(place.showtimeAt, target.movie.runtimeMinutes),
          ...(isMoved ? { trailerReminderId: null } : {}),
          amcConfirmation: reading.confirmation,
          amcTicketCount: reading.ticketCount,
          amcRefundedOrders: null,
          emailEventId: input.eventId,
          lastEditedAt: now,
        });
        transaction.create(
          eventRef,
          toEvent(input, {
            ...base,
            outcome: 'attached',
            viewingId: target.id,
            priorViewing: target,
          }),
        );
        return {
          outcome: 'attached',
          reminderId: isMoved ? (target.trailerReminderId ?? null) : null,
        };
      }
      const viewingRef: DocumentReference = viewings.doc();
      const endsAt = computeEndsAt(
        place.showtimeAt,
        resolved.movie.runtimeMinutes,
      );
      const viewing: Viewing = {
        id: viewingRef.id,
        movieKey: resolved.movieKey,
        movie: resolved.movie,
        showtimeAt: place.showtimeAt,
        endsAt,
        status: endsAt <= now ? 'SEEN' : 'PLANNED',
        ticket,
        theatre: place.theatre,
        purchase: null,
        rating: null,
        trailerReminderId: null,
        amcConfirmation: reading.confirmation,
        amcTicketCount: reading.ticketCount,
        amcRefundedOrders: null,
        emailEventId: input.eventId,
        createdAt: now,
        lastEditedAt: now,
      };
      const isNewWatch = !watch.exists;
      if (isNewWatch) {
        transaction.set(watchRef, {
          movieKey: resolved.movieKey,
          movie: resolved.movie,
          priority: DEFAULT_WATCH_PRIORITY,
          preferredFormat: null,
          archivedAt: null,
          archiveReason: null,
          createdAt: now,
          lastEditedAt: now,
        });
      }
      transaction.set(viewingRef, viewing);
      transaction.create(
        eventRef,
        toEvent(input, {
          ...base,
          outcome: 'added',
          viewingId: viewingRef.id,
          watchlistKey: isNewWatch ? resolved.movieKey : null,
        }),
      );
      return { outcome: 'added', reminderId: null };
    },
  );
  await cancelTrailerPush(firestore, result.reminderId);
  return { outcome: result.outcome };
}

async function handleCancellation(
  input: EmailHandlerInput,
  reading: AmcCancellation,
  readBy: 'pattern' | 'ai',
): Promise<{ outcome: EmailOutcome }> {
  const { firestore, uid } = input;
  const context = await loadMemberContext(firestore, uid);
  const place = await resolvePlace(uid, context, reading);
  const viewings = firestore.collection(viewingsPath(uid));
  const events = firestore.collection(emailEventsPath(uid));
  const eventRef = firestore.doc(`${emailEventsPath(uid)}/${input.eventId}`);
  const base = {
    readBy,
    movieTitle: reading.title,
    showtimeAt: place.showtimeAt,
    theatreName: place.theatre.name,
    confirmation: reading.confirmation,
  } as const;

  const result = await firestore.runTransaction(
    async (transaction: Transaction): Promise<Result> => {
      const [held, nearby, confirmed] = await Promise.all([
        transaction.get(
          viewings.where('amcConfirmation', '==', reading.confirmation),
        ),
        transaction.get(
          viewings
            .where('showtimeAt', '>=', place.showtimeAt - CANCEL_WINDOW_MS)
            .where('showtimeAt', '<=', place.showtimeAt + CANCEL_WINDOW_MS),
        ),
        transaction.get(
          events.where('confirmation', '==', reading.confirmation).limit(50),
        ),
      ]);
      const isCanceledBefore = confirmed.docs.some(
        (entry) => entry.get('outcome') === 'canceled',
      );
      const target = findCancelTarget(
        uniqueById([...held.docs, ...nearby.docs].map(toViewing)),
        {
          confirmation: reading.confirmation,
          title: reading.title,
          theatreName: place.theatre.name,
          showtimeAt: place.showtimeAt,
        },
      );
      const key = refundKey(reading);
      const counted = target?.amcRefundedOrders ?? [];
      if (target !== null && counted.includes(key)) {
        transaction.create(
          eventRef,
          toEvent(input, {
            ...base,
            outcome: 'alreadyHandled',
            viewingId: target.id,
          }),
        );
        return { outcome: 'alreadyHandled', reminderId: null };
      }
      const left = ticketsLeftAfterRefund(
        target?.amcTicketCount ?? null,
        reading.refundedCount,
      );
      if (target !== null && left !== null) {
        transaction.update(viewings.doc(target.id), {
          amcTicketCount: left,
          amcRefundedOrders: [...counted, key],
        });
        transaction.create(
          eventRef,
          toEvent(input, {
            ...base,
            outcome: 'partlyCanceled',
            viewingId: target.id,
            ticketCount: reading.refundedCount,
          }),
        );
        return { outcome: 'partlyCanceled', reminderId: null };
      }
      if (target === null) {
        const outcomeWhenGone: EmailOutcome = isCanceledBefore
          ? 'alreadyHandled'
          : 'cancelNotFound';
        transaction.create(
          eventRef,
          toEvent(input, { ...base, outcome: outcomeWhenGone }),
        );
        return { outcome: outcomeWhenGone, reminderId: null };
      }
      transaction.delete(viewings.doc(target.id));
      transaction.create(
        eventRef,
        toEvent(input, {
          ...base,
          outcome: 'canceled',
          viewingId: target.id,
          removedViewing: target,
        }),
      );
      return {
        outcome: 'canceled',
        reminderId: target.trailerReminderId ?? null,
      };
    },
  );
  await cancelTrailerPush(firestore, result.reminderId);
  return { outcome: result.outcome };
}

async function handleMail(
  input: EmailHandlerInput,
): Promise<{ outcome: EmailOutcome }> {
  const read = await readEmail(input.mail);
  if (read.reading === null || read.readBy === null) {
    const outcome = read.outcome ?? 'notTicket';
    await input.firestore
      .doc(`${emailEventsPath(input.uid)}/${input.eventId}`)
      .create(toEvent(input, { outcome, readBy: read.readBy }));
    return { outcome };
  }
  return read.reading.kind === 'reservation'
    ? handleReservation(input, read.reading, read.readBy)
    : handleCancellation(input, read.reading, read.readBy);
}

/**
 * Receives each AMC email the Cloudflare email worker hands over for a member's forwarding address: a reservation goes on the calendar with its ticket, a cancellation takes its showing off.
 * The shared secret is optional at deploy time and the endpoint answers 503 until it is set.
 */
export const ingestAListEmail = onRequest(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    secrets: [AMC_API_KEY, TMDB_API_KEY, OMDB_API_KEY],
  },
  createEmailIngest({
    app: 'a-list',
    prefix: EMAIL_ADDRESS_PREFIX,
    secretName: EMAIL_WEBHOOK_SECRET_NAME,
    tokenPath: emailTokenPath,
    isOpenFor: (uid) =>
      isGateOpenForUid(uid, 'a-list', EMAIL_TICKETS_GATE_ID, 'off'),
    eventPath: (uid, eventId) => `${emailEventsPath(uid)}/${eventId}`,
    ratePath: emailRatePath,
    intakePath,
    maxPerHour: MAX_EMAILS_PER_HOUR,
    handle: handleMail,
    onConfirmation: async (input) => {
      await input.firestore
        .doc(`${emailEventsPath(input.uid)}/${input.eventId}`)
        .create(toEvent(input, { outcome: 'confirm', readBy: null }));
      return { outcome: 'confirm' };
    },
  }),
);
