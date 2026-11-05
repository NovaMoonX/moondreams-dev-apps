import { DAY_MS } from '@apps/runway/engine/dates';
import type {
  Cents,
  DateOnly,
  MoneyRange,
  OpenPurchase,
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

const isWaitingCharge = (purchase: OpenPurchase) =>
  purchase.source === 'link' && purchase.needsHome && purchase.amountCents > 0;

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

/** Pairs bank charges waiting in Needs a home with purchases typed by hand on the same card (or off any card) within three days. A bank charge is clearly one typed purchase when that is its only one at the same amount and no other bank charge has it too; otherwise the same-amount ones, or failing those the near-amount ones, are offered. The result does not depend on the order of the input. */
export function findPurchaseMatches(
  waiting: readonly OpenPurchase[],
  purchases: readonly OpenPurchase[],
): PurchaseMatches {
  const typed = getTypedCandidates(purchases);
  const banks = waiting.filter(isWaitingCharge);
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

/** Pairs posted deposits waiting in Needs a home with the income day each clearly is: a day within three days, its amount inside the range (or within 15% of an exact one), the nearest day then the closest amount then the earliest expected day. A tie, no candidate, or a day another deposit also picks leaves the deposit asking, with the pay days within two weeks offered (those the amount fits first, none more than half its pay away). A day with a deposit linked to it, a pending deposit and a deposit the person already sent back are never matched on their own. The result does not depend on the order of the input. */
export function findDepositDays(
  waiting: readonly OpenPurchase[],
  days: readonly DepositDay[],
  purchases: readonly OpenPurchase[],
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
    return best !== undefined && !isTied ? [[deposit.id, best.dayKey]] : [];
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
