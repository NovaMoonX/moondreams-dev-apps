import { createHash, timingSafeEqual } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { isGateOpenForUid } from '../../../gates/assertGateOpen.js';
import { createOptionalSecretReader } from '../../../imageSearch/optionalSecret.js';
import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import { markClosedMonths } from '../link/syncRunwayLink.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from '../planKey.js';
import {
  EMAIL_EVENT_KEEP_DAYS,
  EMAIL_PURCHASES_GATE_ID,
  EMAIL_SCHEMA_VERSION,
  emailEventsPath,
  emailFiltersPath,
  emailRatePath,
  emailTokenPath,
  intakePath,
  planPath,
  readAddressToken,
} from './emailShared.js';
import {
  htmlToText,
  parseAlertEmail,
  subjectTemplate,
  type ParsedAlert,
} from './parseAlert.js';
import { readAlertWithAi } from './readAlertWithAi.js';

if (getApps().length === 0) {
  initializeApp();
}

const MAX_BODY_BYTES = 500 * 1024;
const MAX_PER_HOUR = 30;
const DAY_MS = 86_400_000;
const SECRET_NAME = 'RUNWAY_EMAIL_WEBHOOK_SECRET';
const GMAIL_SENDER = 'forwarding-noreply@google.com';

const readSecret = createOptionalSecretReader({ fetch: globalThis.fetch });

type Outcome =
  | 'purchase'
  | 'notPurchase'
  | 'filtered'
  | 'confirm'
  | 'unread'
  | 'notTracking';

interface Mail {
  to: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: number;
}

interface Filter {
  fromAddress: string | null;
  subjectTemplate: string | null;
  subjectContains: string[];
  bodyContains: string[];
}

interface Handled {
  outcome: Outcome;
  purchaseId: string | null;
  readBy: 'pattern' | 'ai' | null;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

const isSecretValid = (given: string | undefined, expected: string) =>
  given !== undefined && timingSafeEqual(digest(given), digest(expected));

const asString = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

const toAddress = (value: string) =>
  (/<([^>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();

const hourKey = (now: number) =>
  new Date(now).toISOString().slice(0, 13).replace(/\D/g, '');

async function takeRateSlot(firestore: Firestore, uid: string, now: number) {
  const ref = firestore.doc(emailRatePath(uid, hourKey(now)));
  return firestore.runTransaction(async (transaction) => {
    const count = ((await transaction.get(ref)).data()?.count as number) ?? 0;
    if (count >= MAX_PER_HOUR) return false;
    transaction.set(ref, { count: count + 1 });
    return true;
  });
}

const lower = (value: string) => value.toLowerCase();

const isEveryTermIn = (terms: string[], haystack: string) =>
  terms.every((term) => haystack.includes(lower(term)));

/** A filter matches when every condition it sets matches and it sets at least one. */
export function isFiltered(filter: Filter, mail: Mail): boolean {
  const subject = lower(mail.subject);
  const checks = [
    filter.fromAddress
      ? lower(filter.fromAddress) === toAddress(mail.from)
      : null,
    filter.subjectTemplate
      ? lower(filter.subjectTemplate) === subjectTemplate(mail.subject)
      : null,
    filter.subjectContains.length > 0
      ? isEveryTermIn(filter.subjectContains, subject)
      : null,
    filter.bodyContains.length > 0
      ? isEveryTermIn(filter.bodyContains, lower(mail.text))
      : null,
  ].filter((check): check is boolean => check !== null);
  return checks.length > 0 && checks.every(Boolean);
}

const asFilter = (value: Record<string, unknown>): Filter => ({
  fromAddress: typeof value.fromAddress === 'string' ? value.fromAddress : null,
  subjectTemplate:
    typeof value.subjectTemplate === 'string' ? value.subjectTemplate : null,
  subjectContains: Array.isArray(value.subjectContains)
    ? value.subjectContains.filter((term) => typeof term === 'string')
    : [],
  bodyContains: Array.isArray(value.bodyContains)
    ? value.bodyContains.filter((term) => typeof term === 'string')
    : [],
});

async function loadFilters(
  firestore: Firestore,
  uid: string,
  key: Buffer,
): Promise<Filter[]> {
  const found = await firestore.collection(emailFiltersPath(uid)).get();
  return found.docs.flatMap((entry) => {
    try {
      return [asFilter(openWithKey(key, entry.data().sealed as SealedPayload))];
    } catch {
      return [];
    }
  });
}

const isForwardingConfirmation = (mail: Mail) =>
  toAddress(mail.from) === GMAIL_SENDER &&
  /forwarding confirmation/i.test(mail.subject);

function readConfirmation(mail: Mail) {
  const url = /https:\/\/mail(?:-settings)?\.google\.com\/[^\s"'<>)\]]+/i.exec(
    mail.text,
  )?.[0];
  const code = /code[^0-9]{0,60}(\d{6,9})\b/i.exec(mail.text)?.[1];
  return {
    confirmUrl: url?.replace(/[.,;]+$/, '').slice(0, 2000) ?? null,
    confirmCode: code ?? null,
  };
}

interface Targets {
  paidByCardId: string | null;
  accountId: string | null;
  isLinked: boolean;
}

async function findTargets(
  firestore: Firestore,
  uid: string,
  key: Buffer,
  lastFour: string | null,
): Promise<Targets> {
  const none = { paidByCardId: null, accountId: null, isLinked: false };
  if (lastFour === null) return none;
  const read = async (collection: 'cards' | 'accounts') => {
    const found = await firestore
      .collection(`${planPath(uid)}/${collection}`)
      .get();
    return found.docs.flatMap((entry) => {
      const data = entry.data();
      if (data.archivedAt != null) return [];
      try {
        const sealed = openWithKey(key, data.sealed as SealedPayload);
        return sealed.lastFour === lastFour
          ? [{ id: entry.id, isLinked: typeof data.linkId === 'string' }]
          : [];
      } catch {
        return [];
      }
    });
  };
  const [cards, accounts] = await Promise.all([
    read('cards'),
    read('accounts'),
  ]);
  if (cards.length === 1) {
    return {
      paidByCardId: cards[0].id,
      accountId: null,
      isLinked: cards[0].isLinked,
    };
  }
  if (cards.length === 0 && accounts.length === 1) {
    return {
      paidByCardId: null,
      accountId: accounts[0].id,
      isLinked: accounts[0].isLinked,
    };
  }
  return none;
}

const isInsideTracking = (
  periods: { from: number; to: number | null }[] | undefined,
  date: number,
) => {
  const open = periods?.at(-1);
  return open !== undefined && open.to === null && date >= open.from;
};

const snippetOf = (text: string) =>
  text.replace(/\s+/g, ' ').trim().slice(0, 200);

async function handleMail(
  firestore: Firestore,
  uid: string,
  mail: Mail,
  now: number,
): Promise<Outcome> {
  const planKey = await unwrapPlanKey(firestore, loadKeyring(), uid);
  const eventRef = firestore.collection(emailEventsPath(uid)).doc();
  const intakeRef = firestore.doc(intakePath(uid));
  const template = subjectTemplate(mail.subject);

  const decide = async (): Promise<Handled> => {
    if (isForwardingConfirmation(mail)) {
      await intakeRef.update({
        confirmAt: now,
        updatedAt: now,
        sealed: sealWithKey(
          planKey,
          { ...readConfirmation(mail) },
          EMAIL_SCHEMA_VERSION,
        ),
      });
      return { outcome: 'confirm', purchaseId: null, readBy: null };
    }
    const filters = await loadFilters(firestore, uid, planKey.key);
    if (filters.some((filter) => isFiltered(filter, mail))) {
      return { outcome: 'filtered', purchaseId: null, readBy: null };
    }
    const byPattern = parseAlertEmail(mail);
    const read: { alert: ParsedAlert | null; readBy: 'pattern' | 'ai' } =
      byPattern !== null
        ? { alert: byPattern, readBy: 'pattern' }
        : { alert: await readAlertWithAi(mail), readBy: 'ai' };
    const { alert } = read;
    if (alert === null) {
      return { outcome: 'unread', purchaseId: null, readBy: null };
    }
    if (!alert.isPurchase) {
      return { outcome: 'notPurchase', purchaseId: null, readBy: read.readBy };
    }
    const plan = (await firestore.doc(planPath(uid)).get()).data();
    const date = alert.date as number;
    if (
      !isInsideTracking(
        plan?.trackingPeriods as { from: number; to: number | null }[],
        date,
      )
    ) {
      return { outcome: 'notTracking', purchaseId: null, readBy: read.readBy };
    }
    const targets = await findTargets(
      firestore,
      uid,
      planKey.key,
      alert.lastFour,
    );
    const purchaseRef = firestore
      .collection(`${planPath(uid)}/purchases`)
      .doc();
    const cents = alert.amountCents as number;
    await purchaseRef.create({
      id: purchaseRef.id,
      date,
      source: 'email',
      status: null,
      needsHome: false,
      accountId: targets.accountId,
      dedupeKey: null,
      expenseId: null,
      emailEventId: eventRef.id,
      emailWaiting: targets.isLinked,
      createdAt: now,
      updatedAt: now,
      sealed: sealWithKey(
        planKey,
        {
          amountCents: cents,
          merchant: alert.merchant,
          merchantLogo: null,
          bankName: alert.institution,
          category: null,
          ruleId: null,
          label: null,
          note: null,
          lines: [{ envelopeId: null, cents, via: 'free' }],
          refundOfId: null,
          paidByCardId: targets.paidByCardId,
          link: null,
          receiptText: null,
          costRef: null,
          billRef: null,
          notSameAs: null,
          incomeDayId: null,
          assignedBy: null,
          pairedWithId: null,
          pairKind: null,
          cardPaymentMoveId: null,
          tickedDayKey: null,
        },
        EMAIL_SCHEMA_VERSION,
      ),
    });
    await markClosedMonths(firestore, uid, [date], now);
    return {
      outcome: 'purchase',
      purchaseId: purchaseRef.id,
      readBy: read.readBy,
    };
  };

  const result = await decide();
  await eventRef.create({
    id: eventRef.id,
    receivedAt: mail.receivedAt,
    outcome: result.outcome,
    purchaseId: result.purchaseId,
    expiresAt: Timestamp.fromMillis(now + EMAIL_EVENT_KEEP_DAYS * DAY_MS),
    sealed: sealWithKey(
      planKey,
      {
        from: toAddress(mail.from),
        subject: mail.subject.slice(0, 300),
        subjectTemplate: template,
        snippet: snippetOf(mail.text),
        readBy: result.readBy,
      },
      EMAIL_SCHEMA_VERSION,
    ),
  });
  await intakeRef.update({ lastReceivedAt: now }).catch(() => undefined);
  return result.outcome;
}

/**
 * Receives each email the Cloudflare email worker hands over for a Runway forwarding address. Every answer is a bare status or `{ outcome }`; nothing from the email is echoed.
 * The shared secret is optional at deploy time and the endpoint answers 503 until it is set.
 */
export const ingestRunwayEmail = onRequest(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    secrets: [RUNWAY_MASTER_KEYS],
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }
    const expected = await readSecret(SECRET_NAME, AbortSignal.timeout(4_000));
    if (expected === null) {
      response.status(503).send('Not available');
      return;
    }
    if (!isSecretValid(request.header('x-runway-email-secret'), expected)) {
      logger.warn('runway.email.unauthorized');
      response.status(401).send('Unauthorized');
      return;
    }
    if ((request.rawBody?.length ?? 0) > MAX_BODY_BYTES) {
      response.status(413).send('Too large');
      return;
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const token = readAddressToken(asString(body.to, 320));
    if (token === null) {
      response.status(404).send('No such address');
      return;
    }
    const authentication = [body.spf, body.dkim].map((value) =>
      asString(value, 20).toLowerCase(),
    );
    if (authentication.includes('fail')) {
      logger.warn('runway.email.authFailed', {
        spf: authentication[0],
        dkim: authentication[1],
      });
      response.status(403).send('Rejected');
      return;
    }
    const firestore = getFirestore();
    const owner = await firestore.doc(emailTokenPath(token)).get();
    const uid = owner.data()?.uid;
    if (typeof uid !== 'string' || uid === '') {
      response.status(404).send('No such address');
      return;
    }
    if (
      !(await isGateOpenForUid(uid, 'runway', EMAIL_PURCHASES_GATE_ID, 'off'))
    ) {
      response.status(404).send('No such address');
      return;
    }
    const now = Date.now();
    if (!(await takeRateSlot(firestore, uid, now))) {
      logger.warn('runway.email.rateLimited');
      response.status(429).send('Too many');
      return;
    }
    const html = asString(body.html, MAX_BODY_BYTES);
    const text = asString(body.text, MAX_BODY_BYTES);
    const receivedAt =
      typeof body.receivedAt === 'number' &&
      Number.isFinite(body.receivedAt) &&
      Math.abs(body.receivedAt - now) < 2 * DAY_MS
        ? body.receivedAt
        : now;
    try {
      const outcome = await handleMail(
        firestore,
        uid,
        {
          to: asString(body.to, 320),
          from: asString(body.from, 320),
          subject: asString(body.subject, 1000),
          text: text.trim() !== '' ? text : htmlToText(html),
          receivedAt,
        },
        now,
      );
      logger.info('runway.email.handled', { outcome });
      response.status(200).json({ outcome });
    } catch (error) {
      logger.error('runway.email.failed', {
        name: (error as Error)?.name ?? 'Error',
      });
      response.status(500).send('Failed');
    }
  },
);
