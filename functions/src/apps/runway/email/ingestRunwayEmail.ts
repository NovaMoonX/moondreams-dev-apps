import { createHash, timingSafeEqual } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { isGateOpenForUid } from '../../../gates/assertGateOpen.js';
import { createOptionalSecretReader } from '../../../imageSearch/optionalSecret.js';
import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import { findInstitutionLogo, toSafeLogo } from '../institutionLogos.js';
import { SEALED_SCHEMA_VERSION } from '../link/linkShared.js';
import { markClosedMonths } from '../link/syncRunwayLink.js';
import { findMerchant } from '../merchantNames.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from '../planKey.js';
import {
  EMAIL_EVENT_KEEP_DAYS,
  EMAIL_PURCHASES_GATE_ID,
  emailEventsPath,
  emailFiltersPath,
  emailRatePath,
  emailTokenPath,
  intakePath,
  planPath,
  readAddressToken,
  toAddress,
} from './emailShared.js';
import {
  confirmProviderOf,
  followConfirmLink,
  readConfirmation,
} from './forwardingConfirmation.js';
import {
  excerptOf,
  htmlToText,
  isInstitutionHost,
  isKnownInstitution,
  isKnownInstitutionSender,
  isMerchantHost,
  parseAlertEmail,
  readableBody,
  subjectTemplate,
  type ParsedAlert,
  type SenderKind,
} from './parseAlert.js';
import { readAlertWithAi, type StoreEmail } from './readAlertWithAi.js';
import { isHandForwarded, unwrapForwarded } from './unwrapForwarded.js';

if (getApps().length === 0) {
  initializeApp();
}

const MAX_BODY_BYTES = 500 * 1024;
const MAX_PER_HOUR = 30;
const RATE_KEEP_MS = 2 * 86_400_000;
const DAY_MS = 86_400_000;
const SECRET_NAME = 'RUNWAY_EMAIL_WEBHOOK_SECRET';

const readSecret = createOptionalSecretReader({ fetch: globalThis.fetch });

type Outcome =
  | 'purchase'
  | 'notPurchase'
  | 'filtered'
  | 'confirm'
  | 'unread'
  | 'notTracking'
  | 'refund'
  | 'cancel';

interface Mail {
  to: string;
  from: string;
  subject: string;
  text: string;
  receivedAt: number;
  isDkimPassed: boolean;
  dkimDomain: string | null;
}

interface Filter {
  fromAddress: string | null;
  subjectTemplate: string | null;
  subjectContains: string[];
  bodyContains: string[];
}

interface PurchaseWrite {
  ref: DocumentReference;
  data: Record<string, unknown>;
}

interface Handled {
  outcome: Outcome;
  purchase: PurchaseWrite | null;
  date: number | null;
  readBy: 'pattern' | 'ai' | null;
  found: ParsedAlert | null;
  senderKind: SenderKind | null;
  storeEmail?: StoreEmail | null;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

const isSecretValid = (given: string | undefined, expected: string) =>
  given !== undefined && timingSafeEqual(digest(given), digest(expected));

const asString = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';

const asDomain = (value: unknown) => {
  const domain = asString(value, 255).toLowerCase();
  return /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(domain) ? domain : null;
};

const eventIdFor = (uid: string, messageId: string) =>
  createHash('sha256').update(`${uid}:${messageId}`).digest('hex').slice(0, 32);

const hourKey = (now: number) =>
  new Date(now).toISOString().slice(0, 13).replace(/\D/g, '');

async function takeRateSlot(firestore: Firestore, uid: string, now: number) {
  const ref = firestore.doc(emailRatePath(uid, hourKey(now)));
  return firestore.runTransaction(async (transaction) => {
    const count = ((await transaction.get(ref)).data()?.count as number) ?? 0;
    if (count >= MAX_PER_HOUR) return false;
    transaction.set(ref, {
      count: count + 1,
      expiresAt: Timestamp.fromMillis(now + RATE_KEEP_MS),
    });
    return true;
  });
}

async function markWithRetry(
  firestore: Firestore,
  uid: string,
  date: number,
  now: number,
) {
  const attempt = async () => {
    try {
      await markClosedMonths(firestore, uid, [date], now);
      return null;
    } catch (error) {
      return (error as Error)?.name ?? 'Error';
    }
  };
  const failed = (await attempt()) !== null ? await attempt() : null;
  if (failed !== null) {
    logger.error('runway.email.closingMarkFailed', { name: failed });
  }
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

// A store's order, refund or cancellation reads to the patterns like a bank alert or nothing, so the AI reads it instead.
const STORE_SIGNAL =
  /\b(order (?:#|no\.?|number|confirm\w*|cancel\w*)|your order|refund(?:ed)?|return (?:received|processed)|cancel(?:led|ed|lation))\b/i;

const isStoreLike = (mail: Mail) =>
  !isKnownInstitutionSender(mail.from) &&
  STORE_SIGNAL.test(`${mail.subject} ${mail.text.slice(0, 600)}`);

// The patterns are written for bank alerts, so what they read is a bank's.
const senderKindOf = (
  alert: ParsedAlert,
  readBy: 'pattern' | 'ai',
  aiKind: SenderKind | null,
  from: string,
): SenderKind =>
  readBy === 'ai' && aiKind !== null
    ? aiKind
    : alert.isPurchase ||
        alert.institution !== null ||
        isKnownInstitutionSender(from)
      ? 'bank'
      : 'other';

interface SenderCompany {
  company: string | null;
  logo: string | null;
}

// Sealed into every event the list shows, so a long picture can't weigh on 50 of them.
const MAX_SENDER_LOGO = 30_000;

const toSenderLogo = (logo: string | null) =>
  logo !== null && logo.length <= MAX_SENDER_LOGO ? toSafeLogo(logo) : null;

/** The company an email is from, only when the sender's own address says so: a store the shop list knows whose name the host carries, or a bank whose own host sent the alert. A name in a subject, body or display name proves nothing. */
async function readSenderCompany(
  firestore: Firestore,
  senderKind: SenderKind | null,
  found: ParsedAlert | null,
  address: string,
): Promise<SenderCompany> {
  const none = { company: null, logo: null };
  if (found === null) return none;
  if (senderKind === 'store') {
    if (found.merchant === null || !isMerchantHost(address, found.merchant)) {
      return none;
    }
    const store = await findMerchant(firestore, found.merchant);
    return store === null
      ? none
      : { company: store.name, logo: toSenderLogo(store.logo) };
  }
  if (
    senderKind !== 'bank' ||
    found.institution === null ||
    !isKnownInstitution(found.institution) ||
    !isInstitutionHost(address, found.institution)
  ) {
    return none;
  }
  const bank = await findInstitutionLogo(firestore, found.institution);
  return bank === null
    ? { company: found.institution, logo: null }
    : { company: bank.name, logo: toSenderLogo(bank.logo) };
}

async function handleMail(
  firestore: Firestore,
  uid: string,
  outer: Mail,
  messageId: string | null,
  now: number,
): Promise<Outcome> {
  const mail = unwrapForwarded(outer);
  const planKey = await unwrapPlanKey(firestore, loadKeyring(), uid);
  const events = firestore.collection(emailEventsPath(uid));
  const eventRef =
    messageId === null ? events.doc() : events.doc(eventIdFor(uid, messageId));
  const intakeRef = firestore.doc(intakePath(uid));
  const template = subjectTemplate(mail.subject);

  const decide = async (): Promise<Handled> => {
    const confirmProvider = confirmProviderOf(outer);
    if (confirmProvider !== null) {
      const confirmation = readConfirmation(outer);
      const followed = await followConfirmLink(
        confirmation.confirmUrl,
        confirmProvider,
      );
      const log = followed.autoConfirm === 'failed' ? logger.warn : logger.info;
      log('runway.email.autoConfirm', {
        provider: confirmProvider,
        result: followed.autoConfirm,
        status: followed.status,
        errorName: followed.errorName,
      });
      await intakeRef.update({
        confirmAt: now,
        updatedAt: now,
        autoConfirm: followed.autoConfirm,
        confirmProvider,
        sealed: sealWithKey(
          planKey,
          { ...confirmation },
          SEALED_SCHEMA_VERSION,
        ),
      });
      return {
        outcome: 'confirm',
        purchase: null,
        date: null,
        readBy: null,
        found: null,
        senderKind: null,
      };
    }
    const filters = await loadFilters(firestore, uid, planKey.key);
    if (filters.some((filter) => isFiltered(filter, mail))) {
      return {
        outcome: 'filtered',
        purchase: null,
        date: null,
        readBy: null,
        found: null,
        senderKind: isKnownInstitutionSender(mail.from) ? 'bank' : null,
      };
    }
    const isStore = isStoreLike(mail);
    const firstPattern = isStore ? null : parseAlertEmail(mail);
    const byAi = firstPattern === null ? await readAlertWithAi(mail) : null;
    // A bank the sender list doesn't know can still write "refund"; its alert falls back to the patterns.
    const byPattern =
      firstPattern ??
      (isStore && (byAi === null || byAi.storeEmail === null)
        ? parseAlertEmail(mail)
        : null);
    const read: {
      alert: ParsedAlert | null;
      readBy: 'pattern' | 'ai';
      aiKind: SenderKind | null;
      storeEmail: StoreEmail | null;
    } =
      byPattern !== null
        ? {
            alert: byPattern,
            readBy: 'pattern',
            aiKind: null,
            storeEmail: null,
          }
        : {
            alert: byAi,
            readBy: 'ai',
            aiKind: byAi?.senderKind ?? null,
            storeEmail: byAi?.storeEmail ?? null,
          };
    const { alert, storeEmail } = read;
    if (alert === null) {
      return {
        outcome: 'unread',
        purchase: null,
        date: null,
        readBy: null,
        found: null,
        senderKind: isKnownInstitutionSender(mail.from) ? 'bank' : null,
      };
    }
    const senderKind = senderKindOf(alert, read.readBy, read.aiKind, mail.from);
    const isStoreReturn = storeEmail !== null && storeEmail.kind !== 'order';
    if (!alert.isPurchase && !isStoreReturn) {
      return {
        outcome: 'notPurchase',
        purchase: null,
        date: null,
        readBy: read.readBy,
        found: alert,
        senderKind,
      };
    }
    const plan = (await firestore.doc(planPath(uid)).get()).data();
    const date = alert.date as number;
    const returnOutcome: Outcome | null = isStoreReturn
      ? (storeEmail.kind as 'refund' | 'cancel')
      : null;
    if (
      !isInsideTracking(
        plan?.trackingPeriods as { from: number; to: number | null }[],
        date,
      )
    ) {
      return {
        outcome: 'notTracking',
        purchase: null,
        date: null,
        readBy: read.readBy,
        found: alert,
        senderKind,
        storeEmail,
      };
    }
    if (returnOutcome !== null && alert.amountCents === null) {
      return {
        outcome: returnOutcome,
        purchase: null,
        date: null,
        readBy: read.readBy,
        found: alert,
        senderKind,
        storeEmail,
      };
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
    const cents =
      returnOutcome === null
        ? (alert.amountCents as number)
        : -(alert.amountCents as number);
    const known = await findMerchant(firestore, alert.merchant);
    const data = {
      id: purchaseRef.id,
      date,
      source: 'email',
      status: null,
      needsHome: true,
      accountId: targets.accountId,
      dedupeKey: null,
      expenseId: null,
      emailEventId: eventRef.id,
      emailWaiting: returnOutcome === null ? targets.isLinked : false,
      createdAt: now,
      updatedAt: now,
      sealed: sealWithKey(
        planKey,
        {
          amountCents: cents,
          merchant: known?.name ?? alert.merchant,
          merchantLogo: known?.logo ?? null,
          bankName: alert.institution,
          category: known?.category ?? null,
          ruleId: null,
          label: null,
          note: null,
          lines:
            returnOutcome === null
              ? [{ envelopeId: null, cents, via: 'free' }]
              : [],
          storeEmail,
          orderLog: null,
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
        SEALED_SCHEMA_VERSION,
      ),
    };
    return {
      outcome: returnOutcome ?? 'purchase',
      purchase: { ref: purchaseRef, data },
      date,
      readBy: read.readBy,
      found: alert,
      senderKind,
      storeEmail,
    };
  };

  const result = await decide();
  const sender = await readSenderCompany(
    firestore,
    result.senderKind,
    result.found,
    toAddress(mail.from),
  );
  const readText = readableBody(mail.text);
  const isBankEmail =
    result.outcome === 'purchase' ||
    result.outcome === 'notPurchase' ||
    result.outcome === 'notTracking' ||
    result.outcome === 'refund' ||
    result.outcome === 'cancel';
  const bodyText = isBankEmail ? readText : null;
  const snippet =
    result.outcome === 'confirm'
      ? ''
      : excerptOf(
          readText,
          result.found ?? { amountCents: null, merchant: null },
        );
  const batch = firestore.batch();
  if (result.purchase !== null) {
    batch.create(result.purchase.ref, result.purchase.data);
  }
  batch.create(eventRef, {
    id: eventRef.id,
    receivedAt: outer.receivedAt,
    outcome: result.outcome,
    senderKind: result.senderKind,
    purchaseId: result.purchase?.ref.id ?? null,
    expiresAt: Timestamp.fromMillis(now + EMAIL_EVENT_KEEP_DAYS * DAY_MS),
    sealed: sealWithKey(
      planKey,
      {
        from: toAddress(mail.from),
        subject: mail.subject.slice(0, 300),
        subjectTemplate: template,
        snippet,
        bodyText,
        readBy: result.readBy,
        storeEmail: result.storeEmail ?? null,
        senderLogo: sender.logo,
        senderCompany: sender.company,
      },
      SEALED_SCHEMA_VERSION,
    ),
  });
  await batch.commit();
  // The providers that ask to confirm (Gmail, Yahoo, Proton) forward with the subject untouched, so such an email shows the confirm went through.
  const isAutoForwarded =
    result.outcome !== 'confirm' && !isHandForwarded(outer);
  await intakeRef
    .update({
      lastReceivedAt: now,
      ...(isAutoForwarded ? { forwardedAt: now } : {}),
    })
    .catch((error: unknown) =>
      logger.warn('runway.email.intakeUpdateFailed', {
        name: error instanceof Error ? error.name : 'unknown',
      }),
    );
  if (result.date !== null) {
    await markWithRetry(firestore, uid, result.date, now);
  }
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
    const [spf, dkim] = [body.spf, body.dkim].map((value) =>
      asString(value, 20).toLowerCase(),
    );
    if (dkim === 'fail') {
      logger.warn('runway.email.authFailed', { spf, dkim });
      response.status(403).send('Rejected');
      return;
    }
    if (dkim !== 'pass') {
      logger.info('runway.email.authUnverified', { spf, dkim });
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
    const messageId = asString(body.messageId, 998).trim() || null;
    if (
      messageId !== null &&
      (
        await firestore
          .doc(`${emailEventsPath(uid)}/${eventIdFor(uid, messageId)}`)
          .get()
      ).exists
    ) {
      response.status(200).json({ outcome: 'duplicate' });
      return;
    }
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
          isDkimPassed: dkim === 'pass',
          dkimDomain: dkim === 'pass' ? asDomain(body.dkimDomain) : null,
        },
        messageId,
        now,
      );
      logger.info('runway.email.handled', { outcome });
      response.status(200).json({ outcome });
    } catch (error) {
      if ((error as { code?: unknown })?.code === 6) {
        response.status(200).json({ outcome: 'duplicate' });
        return;
      }
      logger.error('runway.email.failed', {
        name: (error as Error)?.name ?? 'Error',
      });
      response.status(500).send('Failed');
    }
  },
);
