import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { SEALED_SCHEMA_VERSION } from '../link/linkShared.js';
import { markClosedMonths } from '../link/syncRunwayLink.js';
import { findMerchants } from '../merchantNames.js';
import {
  openWithKey,
  sealWithKey,
  unwrapPlanKey,
  type SealedPayload,
} from '../planKey.js';
import { planPath } from './emailShared.js';
import {
  companyFromAddress,
  isKnownInstitutionSender,
  toShopName,
  type ParsedAlert,
} from './parseAlert.js';
import type { StoreEmail } from './readAlertWithAi.js';

type PlanKey = Awaited<ReturnType<typeof unwrapPlanKey>>;

export interface PurchaseWrite {
  ref: DocumentReference;
  data: Record<string, unknown>;
}

/** Marks the month of a purchase dated into a closed month, retried once; a second failure is logged, never thrown. */
export async function markWithRetry(
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

interface Targets {
  paidByCardId: string | null;
  accountId: string | null;
  isLinked: boolean;
  /** Any live card or account comes from a bank link, so a store order naming no card can wait for its charge. */
  hasAnyLink: boolean;
}

// A store order that names no card waits for a same-store charge on any card or account.
const isWaitingForBank = (targets: Targets, storeEmail: StoreEmail | null) =>
  targets.isLinked ||
  (storeEmail?.kind === 'order' &&
    targets.paidByCardId === null &&
    targets.accountId === null &&
    targets.hasAnyLink);

async function findTargets(
  firestore: Firestore,
  uid: string,
  key: Buffer,
  lastFour: string | null,
): Promise<Targets> {
  const read = async (collection: 'cards' | 'accounts') => {
    const found = await firestore
      .collection(`${planPath(uid)}/${collection}`)
      .get();
    return found.docs.flatMap((entry) => {
      const data = entry.data();
      if (data.archivedAt != null) return [];
      const isLinked = typeof data.linkId === 'string';
      if (lastFour === null)
        return [{ id: entry.id, isLinked, isMatch: false }];
      try {
        const sealed = openWithKey(key, data.sealed as SealedPayload);
        return [
          { id: entry.id, isLinked, isMatch: sealed.lastFour === lastFour },
        ];
      } catch {
        return [{ id: entry.id, isLinked, isMatch: false }];
      }
    });
  };
  const [allCards, allAccounts] = await Promise.all([
    read('cards'),
    read('accounts'),
  ]);
  const hasAnyLink = [...allCards, ...allAccounts].some(
    (entry) => entry.isLinked,
  );
  const cards = allCards.filter((entry) => entry.isMatch);
  const accounts = allAccounts.filter((entry) => entry.isMatch);
  if (cards.length === 1) {
    return {
      paidByCardId: cards[0].id,
      accountId: null,
      isLinked: cards[0].isLinked,
      hasAnyLink,
    };
  }
  if (cards.length === 0 && accounts.length === 1) {
    return {
      paidByCardId: null,
      accountId: accounts[0].id,
      isLinked: accounts[0].isLinked,
      hasAnyLink,
    };
  }
  return { paidByCardId: null, accountId: null, isLinked: false, hasAnyLink };
}

/** Whether a day falls inside the open tracking period. */
export const isInsideTracking = (
  periods: { from: number; to: number | null }[] | undefined,
  date: number,
) => {
  const open = periods?.at(-1);
  return open !== undefined && open.to === null && date >= open.from;
};

/** The shop list's entry for an email's purchase: the name as read, then without a web address, then the store that sent it (never a bank's address). */
async function findEmailShop(
  firestore: Firestore,
  merchant: string | null,
  from: string,
) {
  const named = merchant === null ? null : toShopName(merchant);
  const sender = isKnownInstitutionSender(from)
    ? null
    : companyFromAddress(from);
  const candidates = [merchant, named, sender];
  const found = await findMerchants(firestore, candidates);
  const known =
    candidates.flatMap((text) => {
      const entry = text === null ? undefined : found?.get(text);
      return entry === undefined ? [] : [entry];
    })[0] ?? null;
  return { known, name: named };
}

/** The purchase document an email becomes: the same whether Runway read it on arrival or the person said it was one. */
export async function buildEmailPurchase({
  firestore,
  uid,
  planKey,
  alert,
  storeEmail,
  returnOutcome,
  eventId,
  now,
  from,
}: {
  firestore: Firestore;
  uid: string;
  planKey: PlanKey;
  alert: ParsedAlert;
  storeEmail: StoreEmail | null;
  returnOutcome: 'refund' | 'cancel' | null;
  eventId: string;
  now: number;
  /** The sender's address, naming the store when the shop list doesn't know the name as read. */
  from: string;
}): Promise<PurchaseWrite> {
  const date = alert.date as number;
  const targets = await findTargets(
    firestore,
    uid,
    planKey.key,
    alert.lastFour,
  );
  const purchaseRef = firestore.collection(`${planPath(uid)}/purchases`).doc();
  const cents =
    returnOutcome === null
      ? (alert.amountCents as number)
      : -(alert.amountCents as number);
  const { known, name } = await findEmailShop(firestore, alert.merchant, from);
  const data = {
    id: purchaseRef.id,
    date,
    source: 'email',
    status: null,
    needsHome: true,
    accountId: targets.accountId,
    dedupeKey: null,
    expenseId: null,
    emailEventId: eventId,
    emailWaiting:
      returnOutcome === null && isWaitingForBank(targets, storeEmail),
    emailWaitUntil: null,
    createdAt: now,
    updatedAt: now,
    sealed: sealWithKey(
      planKey,
      {
        amountCents: cents,
        merchant: known?.name ?? name,
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
  return { ref: purchaseRef, data };
}
