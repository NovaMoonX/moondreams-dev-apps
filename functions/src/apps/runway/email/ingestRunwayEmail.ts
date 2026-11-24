import { getApps, initializeApp } from 'firebase-admin/app';
import {
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
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
  parseAlertEmail,
  readableBody,
  subjectTemplate,
  type ParsedAlert,
} from './parseAlert.js';
import { readAlertWithAi } from './readAlertWithAi.js';

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
  | 'notTracking';

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
}

const readPlanKey = (firestore: Firestore, uid: string) =>
  unwrapPlanKey(firestore, loadKeyring(), uid);

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

async function handleMail(
  { firestore, uid, mail, eventId, now }: EmailHandlerInput,
  isConfirmation: boolean,
): Promise<{ outcome: Outcome }> {
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
      };
    }
    const byPattern = parseAlertEmail(mail);
    const read: { alert: ParsedAlert | null; readBy: 'pattern' | 'ai' } =
      byPattern !== null
        ? { alert: byPattern, readBy: 'pattern' }
        : { alert: await readAlertWithAi(mail), readBy: 'ai' };
    const { alert } = read;
    if (alert === null) {
      return {
        outcome: 'unread',
        purchase: null,
        date: null,
        readBy: null,
        found: null,
      };
    }
    if (!alert.isPurchase) {
      return {
        outcome: 'notPurchase',
        purchase: null,
        date: null,
        readBy: read.readBy,
        found: alert,
      };
    }
    const plan = (await firestore.doc(planPath(uid)).get()).data();
    const date = alert.date as number;
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
    const cents = alert.amountCents as number;
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
      emailWaiting: targets.isLinked,
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
        SEALED_SCHEMA_VERSION,
      ),
    };
    return {
      outcome: 'purchase',
      purchase: { ref: purchaseRef, data },
      date,
      readBy: read.readBy,
      found: alert,
    };
  };

  const result = await decide();
  const readText = readableBody(mail.text);
  const isBankEmail =
    result.outcome === 'purchase' ||
    result.outcome === 'notPurchase' ||
    result.outcome === 'notTracking';
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
    receivedAt: mail.receivedAt,
    outcome: result.outcome,
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
    secrets: [RUNWAY_MASTER_KEYS],
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
