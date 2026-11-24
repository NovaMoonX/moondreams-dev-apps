import type { Cents, DateOnly, OpenPurchase } from '@apps/runway/types';

import { getGoalPart, type BalancesInput } from './balances';
import { getEffectiveSplits } from './correct';
import {
  collectCostPaid,
  collectStarted,
  collectTransferEntries,
} from './progress';

/** One thing that moved money into or out of an item; `cents` is what it did to the item, plus in and minus out. */
export type ItemMoneyEntry =
  | { kind: 'start'; id: string; on: DateOnly; cents: Cents }
  | {
      kind: 'pay';
      id: string;
      on: DateOnly;
      cents: Cents;
      dayId: string;
      payLineId: string | null;
    }
  | {
      kind: 'purchase';
      id: string;
      on: DateOnly;
      cents: Cents;
      purchase: OpenPurchase;
    }
  | {
      kind: 'move';
      id: string;
      on: DateOnly;
      cents: Cents;
      /** The other side; null is Free to Spend, or outside the plan when `isOutside`. */
      otherId: string | null;
      isOutside: boolean;
    }
  | {
      kind: 'paid';
      id: string;
      on: DateOnly;
      cents: Cents;
      /** The Horizon item the payment was marked on: this item, or the item a goal helped pay. */
      ownerId: string;
      costId: string;
    }
  | {
      kind: 'earlier';
      id: string;
      on: DateOnly;
      cents: Cents;
      /** The first day the list holds; everything before it is summed in this row. */
      before: DateOnly;
    };

export type ItemMoneyRow = ItemMoneyEntry & { heldAfterCents: Cents };

const newestFirst = (a: ItemMoneyEntry, b: ItemMoneyEntry) =>
  b.on - a.on || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** What moved one item's money in the loaded ledger, newest first, from the inputs the balances sum; a bill's payments are not in it. */
export function collectItemMoney(
  itemId: string,
  input: Pick<
    BalancesInput,
    'startDate' | 'moves' | 'records' | 'arrivedOn' | 'purchases'
  > & { payLineByDay?: ReadonlyMap<string, string> },
): ItemMoneyEntry[] {
  const { startDate } = input;
  if (startDate === null) return [];
  const startCents = collectStarted(input.moves, startDate).byItem[itemId];
  const start: ItemMoneyEntry[] =
    startCents === undefined || startCents === 0
      ? []
      : [
          {
            kind: 'start',
            id: `start_${itemId}`,
            on: startDate,
            cents: startCents,
          },
        ];
  const pays = getEffectiveSplits(input.records).flatMap(
    (split): ItemMoneyEntry[] => {
      const on = input.arrivedOn.get(split.dayId) ?? 0;
      const cents = split.lines
        .filter((line) => line.itemId === itemId)
        .reduce((sum, line) => sum + line.cents, 0);
      return on < startDate || cents === 0
        ? []
        : [
            {
              kind: 'pay',
              id: `pay_${split.dayId}`,
              on,
              cents,
              dayId: split.dayId,
              payLineId: input.payLineByDay?.get(split.dayId) ?? null,
            },
          ];
    },
  );
  const purchases = (input.purchases ?? []).flatMap(
    (purchase): ItemMoneyEntry[] => {
      const lineCents = purchase.lines
        .filter((line) => line.envelopeId === itemId)
        .reduce((sum, line) => sum + line.cents, 0);
      return purchase.date < startDate ||
        !purchase.lines.some((line) => line.envelopeId === itemId) ||
        lineCents === 0
        ? []
        : [
            {
              kind: 'purchase',
              id: purchase.id,
              on: purchase.date,
              cents: -lineCents,
              purchase,
            },
          ];
    },
  );
  const moves = collectTransferEntries(input.moves, startDate).flatMap(
    (entry): ItemMoneyEntry[] => {
      if (entry.fromId === entry.toId) return [];
      if (entry.toId === itemId) {
        return [
          {
            kind: 'move',
            id: entry.moveId,
            on: entry.on,
            cents: entry.cents,
            otherId: entry.fromId,
            isOutside: entry.isOutside,
          },
        ];
      }
      if (entry.fromId === itemId) {
        return [
          {
            kind: 'move',
            id: entry.moveId,
            on: entry.on,
            cents: -entry.cents,
            otherId: entry.toId,
            isOutside: entry.isOutside,
          },
        ];
      }
      return [];
    },
  );
  const paid = Object.entries(collectCostPaid(input.moves)).flatMap(
    ([ownerId, entries]) =>
      entries.flatMap((entry): ItemMoneyEntry[] => {
        if (entry.paidOn < startDate || entry.mark !== 'item') return [];
        const fromGoal = getGoalPart(entry);
        const fromFree = Math.min(
          Math.max(0, entry.fromFreeCents),
          entry.amountCents,
        );
        const cents =
          ownerId === itemId
            ? entry.amountCents - fromFree - fromGoal
            : entry.goalId === itemId
              ? fromGoal
              : 0;
        return cents === 0
          ? []
          : [
              {
                kind: 'paid',
                id: `${entry.moveId}_${itemId}`,
                on: entry.paidOn,
                cents: -cents,
                ownerId,
                costId: entry.costId,
              },
            ];
      }),
  );
  const result = [...start, ...pays, ...purchases, ...moves, ...paid].sort(
    newestFirst,
  );
  return result;
}

/** Each entry with what the item held after it, worked back from what it holds now, so the newest row always matches the item's figure however far back the list is cut. */
export function withHeldAfter(
  entries: readonly ItemMoneyEntry[],
  heldNowCents: Cents,
): ItemMoneyRow[] {
  return entries.reduce<{ rows: ItemMoneyRow[]; held: Cents }>(
    (acc, entry) => {
      acc.rows.push({ ...entry, heldAfterCents: acc.held });
      acc.held -= entry.cents;
      return acc;
    },
    { rows: [], held: heldNowCents },
  ).rows;
}

/** The rows with one row for whatever days summed away (a closing) did, placed where those days fall, so every total adds up to the item's figure. */
export function withBroughtForward(
  rows: readonly ItemMoneyRow[],
  heldNowCents: Cents,
  itemId: string,
  before: DateOnly | null,
): ItemMoneyRow[] {
  const gap = heldNowCents - rows.reduce((sum, row) => sum + row.cents, 0);
  if (before === null || gap === 0) return [...rows];
  const olderAt = rows.findIndex((row) => row.on < before);
  const cut = olderAt === -1 ? rows.length : olderAt;
  return withHeldAfter(
    [
      ...rows.slice(0, cut),
      {
        kind: 'earlier',
        id: `earlier_${itemId}`,
        on: before - 1,
        cents: gap,
        before,
      },
      ...rows.slice(cut),
    ],
    heldNowCents,
  );
}
