import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

import {
  createEmailIngest,
  EMAIL_WEBHOOK_SECRET_NAME,
  type EmailHandlerInput,
  type EmailMail,
} from '../../../email/createEmailIngest.js';
import { toAddress } from '../../../email/emailUtils.js';
import { isGateOpenForUid } from '../../../gates/assertGateOpen.js';
import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import { findInstitutionLogo, toSafeLogo } from '../institutionLogos.js';
import { SEALED_SCHEMA_VERSION } from '../link/linkShared.js';
import { findMerchant } from '../merchantNames.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from '../planKey.js';
import {
  EMAIL_EVENT_KEEP_DAYS,
  EMAIL_ADDRESS_PREFIX,
  EMAIL_PURCHASES_GATE_ID,
  MAX_EMAILS_PER_HOUR,
  emailEventsPath,
  emailFiltersPath,
  emailRatePath,
  emailTokenPath,
  intakePath,
  planPath,
} from './emailShared.js';
import {
  excerptOf,
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
import { AI_HELD, ANTHROPIC_API_KEY } from './askClaude.js';
import {
  AI_UNAVAILABLE,
  readAlertWithAi,
  type StoreEmail,
} from './readAlertWithAi.js';
import {
  buildEmailPurchase,
  isInsideTracking,
  markWithRetry,
  type PurchaseWrite,
} from './emailPurchase.js';
import { unwrapForwarded } from '../../../email/unwrapForwarded.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;

type Outcome =
  | 'purchase'
  | 'notPurchase'
  | 'filtered'
  | 'confirm'
  | 'unread'
  | 'notTracking'
  | 'refund'
  | 'cancel';

interface Filter {
  fromAddress: string | null;
  subjectTemplate: string | null;
  subjectContains: string[];
  bodyContains: string[];
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

const readPlanKey = (firestore: Firestore, uid: string) =>
  unwrapPlanKey(firestore, loadKeyring(), uid);

const lower = (value: string) => value.toLowerCase();

const isEveryTermIn = (terms: string[], haystack: string) =>
  terms.every((term) => haystack.includes(lower(term)));

/** A filter matches when every condition it sets matches and it sets at least one. */
export function isFiltered(filter: Filter, mail: EmailMail): boolean {
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

// A store's order, refund or cancellation reads to the patterns like a bank alert or nothing, so the AI reads it instead.
const STORE_SIGNAL =
  /\b(ordered|order (?:#|no\.?|number|confirm\w*|cancel\w*)|your order|refund(?:ed)?|return (?:received|processed)|cancel(?:led|ed|lation))\b/i;

const isStoreLike = (mail: EmailMail) =>
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
  { firestore, uid, mail: outer, eventId, now }: EmailHandlerInput,
  isConfirmation: boolean,
): Promise<{ outcome: Outcome }> {
  const mail = unwrapForwarded(outer);
  const planKey = await readPlanKey(firestore, uid);
  const eventRef = firestore.doc(`${emailEventsPath(uid)}/${eventId}`);
  const template = subjectTemplate(mail.subject);

  const decide = async (): Promise<Handled> => {
    if (isConfirmation) {
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
    const aiAnswer =
      firstPattern === null
        ? await readAlertWithAi({
            ...mail,
            firestore,
            uid,
            from: toAddress(mail.from),
          })
        : null;
    const byAi =
      aiAnswer === AI_UNAVAILABLE || aiAnswer === AI_HELD ? null : aiAnswer;
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
    const returnOutcome: 'refund' | 'cancel' | null = isStoreReturn
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
    const purchase = await buildEmailPurchase({
      firestore,
      uid,
      planKey,
      alert,
      storeEmail,
      returnOutcome,
      eventId: eventRef.id,
      now,
    });
    return {
      outcome: returnOutcome ?? 'purchase',
      purchase,
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
    result.outcome === 'unread' ||
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
    savedAt: Date.now(),
    addedByPersonAt: null,
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
  if (result.date !== null) {
    await markWithRetry(firestore, uid, result.date, now);
  }
  return { outcome: result.outcome };
}

/**
 * Receives each email the Cloudflare email worker hands over for a Runway forwarding address.
 * The shared secret is optional at deploy time and the endpoint answers 503 until it is set.
 */
export const ingestRunwayEmail = onRequest(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    secrets: [RUNWAY_MASTER_KEYS, ANTHROPIC_API_KEY],
  },
  createEmailIngest({
    app: 'runway',
    prefix: EMAIL_ADDRESS_PREFIX,
    secretName: EMAIL_WEBHOOK_SECRET_NAME,
    legacySecretName: 'RUNWAY_EMAIL_WEBHOOK_SECRET',
    legacySecretHeader: 'x-runway-email-secret',
    tokenPath: emailTokenPath,
    isOpenFor: (uid) =>
      isGateOpenForUid(uid, 'runway', EMAIL_PURCHASES_GATE_ID, 'off'),
    eventPath: (uid, eventId) => `${emailEventsPath(uid)}/${eventId}`,
    ratePath: emailRatePath,
    intakePath,
    maxPerHour: MAX_EMAILS_PER_HOUR,
    handle: (input) => handleMail(input, false),
    confirmationFields: async ({ firestore, uid }, confirmation) => ({
      sealed: sealWithKey(
        await readPlanKey(firestore, uid),
        { ...confirmation },
        SEALED_SCHEMA_VERSION,
      ),
    }),
    onConfirmation: (input) => handleMail(input, true),
  }),
);
