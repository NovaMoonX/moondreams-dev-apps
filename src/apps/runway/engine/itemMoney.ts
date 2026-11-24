import type { Cents, DateOnly, OpenPurchase } from '@apps/runway/types';

import type { BalancesInput } from './balances';
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
    };

export type ItemMoneyRow = ItemMoneyEntry & { heldAfterCents: Cents };

const newestFirst = (a: ItemMoneyEntry, b: ItemMoneyEntry) =>
  b.on - a.on || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** What a Horizon item's own paid mark, or a goal that helped pay one, gave up. */
const getGoalPart = (entry: {
  amountCents: Cents;
  fromFreeCents: Cents;
  fromGoalCents: Cents;
}) =>
  Math.min(
    Math.max(0, entry.fromGoalCents),
    Math.max(0, entry.amountCents - Math.max(0, entry.fromFreeCents)),
  );

/**
 * Everything the loaded ledger holds that moved one item's money, newest first, from the same inputs
 * the balances sum: its starting amount, each confirmed day's lines for it, its purchase lines, moves
 * in and out, and paid marks it gave money to. A bill's payments are not in it.
 */
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
  const result = entries.reduce<ItemMoneyRow[]>((rows, entry) => {
    const newer = rows.at(-1);
    const heldAfterCents =
      newer === undefined ? heldNowCents : newer.heldAfterCents - newer.cents;
    return [...rows, { ...entry, heldAfterCents }];
  }, []);
  return result;
}
