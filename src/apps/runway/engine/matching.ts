import { DAY_MS } from '@apps/runway/engine/dates';
import type { OpenPurchase } from '@apps/runway/types';

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
