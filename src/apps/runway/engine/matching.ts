import { toComparable } from '@/utils/optionMatchUtils';
import { DAY_MS } from '@apps/runway/engine/dates';
import { getRefundableCents } from '@apps/runway/engine/purchases';
import type {
  Cents,
  DateOnly,
  MoneyRange,
  OpenPurchase,
  PayerMemorySealed,
  PurchasePairKind,
  RouteMemorySealed,
} from '@apps/runway/types';

const MATCH_DAYS = 3;
/** A typed amount this close to the bank's (a tip added when it posted) is offered, never merged on its own. */
const NEAR_SHARE = 0.25;

export interface PurchaseMatches {
  /** Bank purchase id → the one typed purchase it is clearly the same as. */
  clear: Map<string, string>;
  /** Bank purchase id → typed purchases it may be, nearest day first; only for a bank purchase without a clear match. */
  offers: Map<string, string[]>;
}

/** A bank charge waiting in Needs a home. */
export const isWaitingCharge = (purchase: OpenPurchase) =>
  purchase.source === 'link' &&
  purchase.needsHome &&
  purchase.amountCents > 0 &&
  (purchase.billRef ?? null) === null;

/** A typed purchase can stand in for a bank one only when nothing else points at it: no cost it pays, no refund of or for it. */
const getTypedCandidates = (purchases: readonly OpenPurchase[]) => {
  const refunded = new Set(
    purchases.flatMap((purchase) =>
      purchase.refundOfId === null ? [] : [purchase.refundOfId],
    ),
  );
  return purchases.filter(
    (purchase) =>
      purchase.source !== 'link' &&
      !purchase.needsHome &&
      purchase.amountCents > 0 &&
      purchase.refundOfId === null &&
      (purchase.costRef ?? null) === null &&
      !refunded.has(purchase.id),
  );
};

const isSameSide = (bank: OpenPurchase, typed: OpenPurchase) =>
  (bank.paidByCardId ?? null) === (typed.paidByCardId ?? null);

const byNearest = (bank: OpenPurchase) => (a: OpenPurchase, b: OpenPurchase) =>
  Math.abs(a.date - bank.date) - Math.abs(b.date - bank.date) ||
  a.createdAt - b.createdAt ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Pairs bank charges waiting in Needs a home (or the ones `isBank` picks) with purchases typed by hand on the same card (or off any card) within three days. A bank charge is clearly one typed purchase when that is its only one at the same amount and no other bank charge has it too; otherwise the same-amount ones, or failing those the near-amount ones, are offered. The result does not depend on the order of the input. */
export function findPurchaseMatches(
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
  isBank: (purchase: OpenPurchase) => boolean = isWaitingCharge,
): PurchaseMatches {
  const typed = getTypedCandidates(purchases);
  const banks = waiting.filter(isBank);
  const nearby = new Map(
    banks.map((bank) => [
      bank.id,
      typed
        .filter(
          (entry) =>
            isSameSide(bank, entry) &&
            Math.abs(entry.date - bank.date) <= MATCH_DAYS * DAY_MS &&
            !(entry.notSameAs ?? []).includes(bank.id),
        )
        .sort(byNearest(bank)),
    ]),
  );
  const exact = new Map(
    banks.map((bank) => [
      bank.id,
      (nearby.get(bank.id) ?? []).filter(
        (entry) => entry.amountCents === bank.amountCents,
      ),
    ]),
  );
  const claims = [...exact.values()]
    .flat()
    .reduce(
      (counts, entry) => counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1),
      new Map<string, number>(),
    );
  const clear = new Map(
    banks.flatMap((bank): [string, string][] => {
      const same = exact.get(bank.id) ?? [];
      return same.length === 1 && claims.get(same[0].id) === 1
        ? [[bank.id, same[0].id]]
        : [];
    }),
  );
  const taken = new Set(clear.values());
  const offers = new Map(
    banks.flatMap((bank): [string, string[]][] => {
      if (clear.has(bank.id)) return [];
      const same = (exact.get(bank.id) ?? []).filter(
        (entry) => !taken.has(entry.id),
      );
      const near = (nearby.get(bank.id) ?? []).filter(
        (entry) =>
          !taken.has(entry.id) &&
          Math.abs(entry.amountCents - bank.amountCents) <=
            bank.amountCents * NEAR_SHARE,
      );
      const offered = same.length > 0 ? same : near;
      return offered.length > 0
        ? [[bank.id, offered.map((entry) => entry.id)]]
        : [];
    }),
  );
  return { clear, offers };
}

const DEPOSIT_DAYS = 3;
/** A person choosing by hand sees pay days this far from the deposit. */
const OFFER_DAYS = 14;
/** An exact amount this close to the deposit (overtime, a changed deduction) still matches. */
const DEPOSIT_SHARE = 0.15;
/** A pay day further than this from the deposit's amount is never offered: it cannot be that pay. */
const OFFER_SHARE = 0.5;

/** An income day a deposit may be: coming or confirmed, never one marked not arrived. A confirmed day's amount is the one it was confirmed at, as a range of one figure. */
export interface DepositDay {
  dayKey: string;
  expectedOn: DateOnly;
  arrivedOn: DateOnly | null;
  amount: MoneyRange;
  payLineId: string;
}

export interface DepositMatches {
  /** Deposit id → the one income day it clearly is. */
  clear: Map<string, string>;
  /** Deposit id → pay days it may be, those the amount fits first, then nearest; a day more than half its pay away is left out. Only for a deposit without a clear day. */
  offers: Map<string, string[]>;
}

const isWaitingDeposit = (purchase: OpenPurchase) =>
  purchase.source === 'link' &&
  purchase.needsHome &&
  purchase.amountCents < 0 &&
  purchase.status === 'posted' &&
  purchase.accountId !== null &&
  purchase.incomeDayId === null;

const getDepositDate = (day: DepositDay) => day.arrivedOn ?? day.expectedOn;

const fitsAmount = (cents: Cents, { lowCents, highCents }: MoneyRange) =>
  lowCents === highCents
    ? Math.abs(cents - lowCents) <= lowCents * DEPOSIT_SHARE
    : cents >= lowCents && cents <= highCents;

const getAmountGap = (cents: Cents, { lowCents, highCents }: MoneyRange) =>
  cents < lowCents
    ? lowCents - cents
    : cents > highCents
      ? cents - highCents
      : 0;

/** Nearest day, then closest amount (zero inside a range), then the earliest expected day. */
const getRank = (cents: Cents, deposit: OpenPurchase, day: DepositDay) =>
  [
    Math.abs(getDepositDate(day) - deposit.date),
    getAmountGap(cents, day.amount),
    day.expectedOn,
  ] as const;

const compareRanks = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((diff, part, index) => diff || part - b[index], 0);

const compareKeys = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Pairs posted deposits waiting in Needs a home with the income day each clearly is: a day within three days, its amount inside the range (or within 15% of an exact one), the nearest day then the closest amount then the earliest expected day. A tie, no candidate, or a day another deposit also picks leaves the deposit asking, with the pay days within two weeks offered (those the amount fits first, none more than half its pay away). A day with a deposit linked to it, a pending deposit and a deposit the person already sent back are never matched on their own. A payer the person linked by hand before settles what the amount or a tie leaves open: when no day is clear, the one free day of that payer's pay line within the same three days and half its pay of the amount is the pick (a raise or a short check is accepted). The result does not depend on the order of the input. */
export function findDepositDays(
  waiting: readonly OpenPurchase[],
  days: readonly DepositDay[],
  purchases: readonly OpenPurchase[],
  payers: readonly Pick<PayerMemorySealed, 'merchantKey' | 'payLineId'>[] = [],
): DepositMatches {
  const linked = new Set(
    purchases.flatMap((purchase) =>
      purchase.incomeDayId === null ? [] : [purchase.incomeDayId],
    ),
  );
  const free = [...days]
    .filter((day) => !linked.has(day.dayKey))
    .sort((a, b) => compareKeys(a.dayKey, b.dayKey));
  const deposits = waiting
    .filter(isWaitingDeposit)
    .sort((a, b) => compareKeys(a.id, b.id));
  const nearest = (deposit: OpenPurchase, reach: number) => {
    const cents = -deposit.amountCents;
    return free
      .filter(
        (day) => Math.abs(getDepositDate(day) - deposit.date) <= reach * DAY_MS,
      )
      .sort(
        (a, b) =>
          compareRanks(
            getRank(cents, deposit, a),
            getRank(cents, deposit, b),
          ) || compareKeys(a.dayKey, b.dayKey),
      );
  };
  const picks = deposits.flatMap((deposit): [string, string][] => {
    if (deposit.assignedBy !== null) return [];
    const cents = -deposit.amountCents;
    const [best, next] = nearest(deposit, DEPOSIT_DAYS).filter((day) =>
      fitsAmount(cents, day.amount),
    );
    const isTied =
      next !== undefined &&
      compareRanks(
        getRank(cents, deposit, best),
        getRank(cents, deposit, next),
      ) === 0;
    if (best !== undefined && !isTied) return [[deposit.id, best.dayKey]];
    const merchantKey = toComparable(deposit.merchant ?? '');
    const lineIds = payers.flatMap((payer) =>
      merchantKey !== '' && payer.merchantKey === merchantKey
        ? [payer.payLineId]
        : [],
    );
    const remembered = nearest(deposit, DEPOSIT_DAYS).filter(
      (day) =>
        lineIds.includes(day.payLineId) &&
        getAmountGap(cents, day.amount) <= day.amount.highCents * OFFER_SHARE,
    );
    return remembered.length === 1 ? [[deposit.id, remembered[0].dayKey]] : [];
  });
  const claims = picks.reduce(
    (counts, [, dayKey]) => counts.set(dayKey, (counts.get(dayKey) ?? 0) + 1),
    new Map<string, number>(),
  );
  const clear = new Map(picks.filter(([, dayKey]) => claims.get(dayKey) === 1));
  const taken = new Set(clear.values());
  const offers = new Map(
    deposits.flatMap((deposit): [string, string[]][] => {
      if (clear.has(deposit.id)) return [];
      const cents = -deposit.amountCents;
      const offered = nearest(deposit, OFFER_DAYS)
        .filter(
          (day) =>
            !taken.has(day.dayKey) &&
            getAmountGap(cents, day.amount) <=
              day.amount.highCents * OFFER_SHARE,
        )
        .sort(
          (a, b) =>
            Number(!fitsAmount(cents, a.amount)) -
            Number(!fitsAmount(cents, b.amount)),
        )
        .map((day) => day.dayKey);
      return offered.length > 0 ? [[deposit.id, offered]] : [];
    }),
  );
  return { clear, offers };
}

// The bank's detailed kinds for money that only moves between a person's own accounts or pays their card; a payment to a person or a cash withdrawal is not one.
const OWN_MOVE_CATEGORIES = new Set([
  'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
  'TRANSFER_IN_ACCOUNT_TRANSFER',
  'TRANSFER_OUT_ACCOUNT_TRANSFER',
  'TRANSFER_IN_SAVINGS',
  'TRANSFER_OUT_SAVINGS',
  'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
  'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
]);

/** A synced purchase the bank calls a card payment or a move between the person's own accounts, still waiting and unpaired: not spending until the person says it is. */
export const isBankMove = (purchase: OpenPurchase) =>
  purchase.source === 'link' &&
  // Once the person has answered (unpaired it, undone a choice), their answer wins over the bank's.
  purchase.assignedBy !== 'person' &&
  purchase.needsHome &&
  purchase.pairedWithId === null &&
  purchase.incomeDayId === null &&
  (purchase.billRef ?? null) === null &&
  OWN_MOVE_CATEGORIES.has(purchase.category ?? '');

/** Money in that is a refund: one tied to a purchase, one typed by hand, or a credit on a card the bank doesn't call a payment or a move. Money paired as a move or linked to a pay is never one. */
export const isRefundLike = (purchase: OpenPurchase) =>
  purchase.amountCents < 0 &&
  purchase.pairedWithId === null &&
  purchase.incomeDayId === null &&
  !OWN_MOVE_CATEGORIES.has(purchase.category ?? '') &&
  (purchase.refundOfId !== null ||
    purchase.source !== 'link' ||
    (purchase.paidByCardId ?? null) !== null);

/** How far back a bank refund looks for the purchase it returns. */
export const REFUND_LOOKBACK_DAYS = 120;

const getMerchantKey = (purchase: Pick<OpenPurchase, 'merchant' | 'label'>) =>
  toComparable(purchase.merchant?.trim() || purchase.label?.trim() || '')
    .split(' ')
    .filter((word) => !/^\d+$/.test(word))
    .join('');

// A bank adds store numbers and suffixes ("KOHLS #1234", "TARGET T-0456"), so one name starting with the other is the same store.
const isSameMerchant = (a: string, b: string) =>
  Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a));

/** Whether two merchant names (or labels) name the same store, store numbers, spacing and punctuation aside. */
export const isSameStore = (a: string | null, b: string | null) =>
  isSameMerchant(
    getMerchantKey({ merchant: a, label: null }),
    getMerchantKey({ merchant: b, label: null }),
  );

/** A purchase a refund could return: posted money out that is not a move between the person's own accounts. */
export const isRefundCandidate = (purchase: OpenPurchase) =>
  purchase.amountCents > 0 &&
  purchase.status !== 'pending' &&
  purchase.pairedWithId === null &&
  !OWN_MOVE_CATEGORIES.has(purchase.category ?? '');

/** The one purchase a waiting bank refund most likely returns, when that purchase went to an envelope or goal: same merchant (store numbers and suffixes aside), on or before the refund's day within `REFUND_LOOKBACK_DAYS`, with at least the refund left to return; the newest wins. Null when none does, since a refund of a Free to Spend purchase already counts where it belongs. */
export function findRefundOriginal(
  refund: OpenPurchase,
  purchases: readonly OpenPurchase[],
): OpenPurchase | null {
  const key = getMerchantKey(refund);
  if (refund.amountCents >= 0 || key.length < 3) return null;
  const result =
    purchases
      .filter(
        (purchase) =>
          purchase.id !== refund.id &&
          purchase.amountCents > 0 &&
          purchase.date <= refund.date &&
          purchase.date >= refund.date - REFUND_LOOKBACK_DAYS * DAY_MS &&
          purchase.lines.some(
            (line) => line.cents > 0 && line.envelopeId !== null,
          ) &&
          isSameMerchant(getMerchantKey(purchase), key) &&
          getRefundableCents(purchase, purchases) >= -refund.amountCents,
      )
      .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)[0] ?? null;
  return result;
}

/** The two sides of a move between the person's own accounts are paired only this close in date. */
export const PAIR_DAYS = 3;

export interface AccountPair {
  inId: string;
  kind: PurchasePairKind;
}

export interface AccountPairMatches {
  /** Money-out purchase id → the one money-in purchase it clearly is the other side of. */
  clear: Map<string, AccountPair>;
  /** Purchase id (either side) → the purchases it may be paired with, nearest day first, for each purchase not in a clear pair (every purchase when `isOffer`). */
  offers: Map<string, { otherId: string; kind: PurchasePairKind }[]>;
}

const CARD_PAYMENT_CATEGORY = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';

const isPairCandidate = (purchase: OpenPurchase, isOffer: boolean) =>
  purchase.source === 'link' &&
  purchase.needsHome &&
  purchase.status === 'posted' &&
  (isOffer || purchase.assignedBy === null) &&
  purchase.pairedWithId === null &&
  purchase.incomeDayId === null &&
  (purchase.billRef ?? null) === null;

/** Money out of a linked account and the same amount in to another linked account (a transfer) or a linked card (a card payment), never money out of a card. */
const getPairKind = (
  out: OpenPurchase,
  into: OpenPurchase,
): PurchasePairKind | null => {
  if (
    out.amountCents <= 0 ||
    out.amountCents !== -into.amountCents ||
    Math.abs(out.date - into.date) > PAIR_DAYS * DAY_MS ||
    out.accountId === null ||
    (out.paidByCardId ?? null) !== null
  ) {
    return null;
  }
  if ((into.paidByCardId ?? null) !== null) return 'cardPayment';
  return into.accountId !== null && into.accountId !== out.accountId
    ? 'transfer'
    : null;
};

/** Pairs posted money out of a linked account waiting in Needs a home with the same amount in to another linked account or a linked card within three days. A pair is clear only when a route the person paired by hand before settles it (each side has several but exactly one of its own is on the route, so one remembered of two settles it, both or neither leaves it asking), or when it is a card payment both sides of which the bank flags as one and each has no other such card candidate, or when the money out has that one money in and the money in has that one money out; routes win over the card, the card over plain uniqueness, and no purchase is in two clear pairs; otherwise both sides are offered each other, nearest day first (as offers, a clear pair is offered too). Pending purchases and ones already paired or linked to a pay day never pair, and neither do ones the person already answered, except as offers (`isOffer`): a send-back stops only the automatic pass, never the person pairing them again. The result does not depend on the order of the input. */
export function findAccountPairs(
  waiting: readonly OpenPurchase[],
  isOffer = false,
  routes: readonly RouteMemorySealed[] = [],
): AccountPairMatches {
  const candidates = waiting
    .filter((purchase) => isPairCandidate(purchase, isOffer))
    .sort((a, b) => compareKeys(a.id, b.id));
  const outs = candidates.filter((purchase) => purchase.amountCents > 0);
  const ins = candidates.filter((purchase) => purchase.amountCents < 0);
  const links = outs.flatMap((out) =>
    ins.flatMap((into) => {
      const kind = getPairKind(out, into);
      return kind === null ? [] : [{ out, into, kind }];
    }),
  );
  const isRouted = ({ out, into }: (typeof links)[number]) =>
    routes.some(
      (route) =>
        route.fromAccountId === out.accountId &&
        ((into.paidByCardId ?? null) !== null
          ? route.toCardId === into.paidByCardId
          : route.toAccountId === into.accountId),
    );
  const routed = links.filter(isRouted);
  const byLinks = links.flatMap(
    ({ out, into, kind }): [string, AccountPair][] =>
      links.filter((link) => link.out.id === out.id).length === 1 &&
      links.filter((link) => link.into.id === into.id).length === 1
        ? [[out.id, { inId: into.id, kind }]]
        : [],
  );
  const byRoutes = routed.flatMap(
    ({ out, into, kind }): [string, AccountPair][] =>
      routed.filter((link) => link.out.id === out.id).length === 1 &&
      routed.filter((link) => link.into.id === into.id).length === 1
        ? [[out.id, { inId: into.id, kind }]]
        : [],
  );
  const isCardLink = ({ out, into, kind }: (typeof links)[number]) =>
    kind === 'cardPayment' &&
    out.category === CARD_PAYMENT_CATEGORY &&
    into.category === CARD_PAYMENT_CATEGORY;
  const cardLinks = links.filter(isCardLink);
  const byCard = cardLinks.flatMap(
    ({ out, into, kind }): [string, AccountPair][] =>
      cardLinks.filter((link) => link.out.id === out.id).length === 1 &&
      cardLinks.filter((link) => link.into.id === into.id).length === 1
        ? [[out.id, { inId: into.id, kind }]]
        : [],
  );
  const addFree = (
    picked: Map<string, AccountPair>,
    [outId, pair]: [string, AccountPair],
  ) =>
    picked.has(outId) ||
    [...picked.values()].some(({ inId }) => inId === pair.inId)
      ? picked
      : picked.set(outId, pair);
  const clear = [byRoutes, byCard, byLinks].reduce(
    (picked, picks) => picks.reduce(addFree, picked),
    new Map<string, AccountPair>(),
  );
  const taken = new Set([
    ...clear.keys(),
    ...[...clear.values()].map(({ inId }) => inId),
  ]);
  const sides = links
    .filter(
      ({ out, into }) => isOffer || (!taken.has(out.id) && !taken.has(into.id)),
    )
    .flatMap(({ out, into, kind }) => {
      const gap = Math.abs(out.date - into.date);
      return [
        { id: out.id, otherId: into.id, kind, gap },
        { id: into.id, otherId: out.id, kind, gap },
      ];
    });
  const grouped = sides.reduce(
    (byId, side) => byId.set(side.id, [...(byId.get(side.id) ?? []), side]),
    new Map<string, typeof sides>(),
  );
  const offers = new Map(
    [...grouped].map(([id, list]) => [
      id,
      [...list]
        .sort((a, b) => a.gap - b.gap || compareKeys(a.otherId, b.otherId))
        .map(({ otherId, kind }) => ({ otherId, kind })),
    ]),
  );
  return { clear, offers };
}

/** Whether two purchases are the two sides of one pair: each points at the other and the amounts cancel. */
export const isPairIntact = (a: OpenPurchase, b: OpenPurchase) =>
  a.pairedWithId === b.id &&
  b.pairedWithId === a.id &&
  a.amountCents === -b.amountCents;

/** The purchases whose pair is broken: the other side is gone (only judged when it would fall inside what has been read, `readFrom`), points elsewhere, or no longer cancels it because the bank repriced one. Both sides of a repriced pair are returned. */
export function findLostPairs(
  purchases: readonly OpenPurchase[],
  readFrom: DateOnly,
): OpenPurchase[] {
  const all = new Map(purchases.map((purchase) => [purchase.id, purchase]));
  return [...all.values()].filter((purchase) => {
    if (purchase.pairedWithId === null) return false;
    const other = all.get(purchase.pairedWithId);
    return other === undefined
      ? purchase.date - PAIR_DAYS * DAY_MS >= readFrom
      : !isPairIntact(purchase, other);
  });
}

/** Posted money in that may be the other side of a pending money out (same amount, another account or a card, within three days), by the money in's id. Both wait: a pending purchase gets a new id when it posts, so it is never paired itself. */
export function findPendingMoveHolds(
  purchases: readonly OpenPurchase[],
): Map<string, string> {
  const sorted = [...purchases].sort((a, b) => compareKeys(a.id, b.id));
  const pendingOuts = sorted.filter(
    (purchase) =>
      purchase.source === 'link' &&
      purchase.status === 'pending' &&
      purchase.amountCents > 0 &&
      purchase.accountId !== null &&
      (purchase.paidByCardId ?? null) === null,
  );
  return new Map(
    sorted
      .filter(
        (into) =>
          into.source === 'link' &&
          into.status === 'posted' &&
          into.amountCents < 0 &&
          into.pairedWithId === null &&
          into.needsHome &&
          into.incomeDayId === null &&
          ((into.paidByCardId ?? null) !== null || into.accountId !== null),
      )
      .flatMap((into): [string, string][] => {
        const out = pendingOuts.find(
          (candidate) =>
            candidate.amountCents === -into.amountCents &&
            (candidate.accountId !== into.accountId ||
              (into.paidByCardId ?? null) !== null) &&
            Math.abs(candidate.date - into.date) <= PAIR_DAYS * DAY_MS,
        );
        return out === undefined ? [] : [[into.id, out.id]];
      }),
  );
}
