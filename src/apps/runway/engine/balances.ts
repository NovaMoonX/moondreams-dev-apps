import type { Cents, DateOnly, OpenMove, OpenRecord } from '@apps/runway/types';

import { getEffectiveSplits } from './correct';
import { collectPaid, collectStarted } from './progress';

export interface BalancesInput {
  startDate: DateOnly | null;
  moves: readonly OpenMove[];
  records: readonly OpenRecord[];
  /** The day each confirmed day's money arrived, by day id; a split of a day that arrived before the start is not counted. */
  arrivedOn: ReadonlyMap<string, DateOnly>;
  /** Which plan items are goals and which are bills, by item id. */
  kinds: Readonly<Record<string, 'goal' | 'bill' | 'envelope'>>;
}

export interface Balances {
  /** A starting point exists. */
  isStarted: boolean;
  /** The person said how much money they have; without it Free to spend is unknown, never zero. */
  hasMoney: boolean;
  /** The starting money, plus what arrived since, less the bills paid. */
  moneyOnHandCents: Cents;
  /** Money that has a job, by item: its starting amount plus what confirmed days gave it, less a paid bill's set-aside. */
  assignedByItem: Record<string, Cents>;
  assignedToBillsCents: Cents;
  assignedToGoalsCents: Cents;
  assignedToEnvelopesCents: Cents;
  /** Money on hand less everything assigned; below zero when more is assigned than is held. */
  freeToSpendCents: Cents;
  startMoneyCents: Cents;
  arrivedCents: Cents;
  paidCents: Cents;
}

/**
 * Every figure, summed from the ledger since the starting point: the start moves, the confirmed days'
 * latest splits and the bills marked paid. Nothing is stored, so the same inputs always give the same
 * figures.
 */
export function deriveBalances(input: BalancesInput): Balances {
  const { startDate } = input;
  const started = collectStarted(input.moves, startDate);
  const splits = getEffectiveSplits(input.records).filter(
    (split) =>
      startDate !== null &&
      (input.arrivedOn.get(split.dayId) ?? 0) >= startDate,
  );
  const arrivedCents = splits.reduce(
    (sum, split) => sum + split.arrivedCents,
    0,
  );

  const given = splits.reduce<Record<string, Cents>>(
    (acc, split) =>
      split.lines.reduce(
        (sums, line) => ({
          ...sums,
          [line.itemId]: (sums[line.itemId] ?? 0) + line.cents,
        }),
        acc,
      ),
    {},
  );

  const paidByBill = Object.entries(collectPaid(input.moves)).map(
    ([billId, payments]) => {
      const counted =
        startDate === null
          ? []
          : payments.filter((payment) => payment.paidOn >= startDate);
      return {
        billId,
        amountCents: counted.reduce((sum, p) => sum + p.amountCents, 0),
        fromFreeCents: counted.reduce((sum, p) => sum + p.fromFreeCents, 0),
      };
    },
  );
  const paidCents = paidByBill.reduce((sum, bill) => sum + bill.amountCents, 0);
  const consumed = Object.fromEntries(
    paidByBill.map((bill) => [
      bill.billId,
      bill.amountCents - bill.fromFreeCents,
    ]),
  );

  const itemIds = new Set([
    ...Object.keys(given),
    ...Object.keys(started.byItem),
  ]);
  const assignedByItem = Object.fromEntries(
    [...itemIds].map((id) => [
      id,
      (started.byItem[id] ?? 0) + (given[id] ?? 0) - (consumed[id] ?? 0),
    ]),
  );
  const sumKind = (kind: 'goal' | 'bill' | 'envelope') =>
    Object.entries(assignedByItem)
      .filter(([id]) => input.kinds[id] === kind)
      .reduce((sum, [, cents]) => sum + cents, 0);
  const assignedToBillsCents = sumKind('bill');
  const assignedToGoalsCents = sumKind('goal');
  const assignedToEnvelopesCents = sumKind('envelope');

  const startMoneyCents = started.money ?? 0;
  const moneyOnHandCents = startMoneyCents + arrivedCents - paidCents;
  const result: Balances = {
    isStarted: startDate !== null,
    hasMoney: started.money !== null,
    moneyOnHandCents,
    assignedByItem,
    assignedToBillsCents,
    assignedToGoalsCents,
    assignedToEnvelopesCents,
    freeToSpendCents:
      moneyOnHandCents -
      assignedToBillsCents -
      assignedToGoalsCents -
      assignedToEnvelopesCents,
    startMoneyCents,
    arrivedCents,
    paidCents,
  };
  return result;
}

/** How the Free to spend figure reads: the amount, over-assigned, or not known yet. */
export type FreeToSpendFigure =
  | { kind: 'amount'; cents: Cents }
  | { kind: 'over'; cents: Cents }
  | { kind: 'unknown' };

export function getFreeToSpendFigure(balances: Balances): FreeToSpendFigure {
  if (!balances.isStarted || !balances.hasMoney) return { kind: 'unknown' };
  if (balances.freeToSpendCents < 0) {
    return { kind: 'over', cents: -balances.freeToSpendCents };
  }
  return { kind: 'amount', cents: balances.freeToSpendCents };
}

/** The figures as they stood at the start of `day`: days whose money arrived, and bills paid, from that day on are left out, because a start dated `day` adds them again. */
export function deriveBalancesBefore(
  input: BalancesInput,
  day: DateOnly,
): Balances {
  const dropped = new Set(
    input.moves.flatMap((move) =>
      move.kind === 'billPaid' &&
      !move.reversesMoveId &&
      move.payload.paidOn >= day
        ? [move.id]
        : [],
    ),
  );
  const result = deriveBalances({
    ...input,
    moves: input.moves.filter(
      (move) =>
        !dropped.has(move.id) &&
        !(move.reversesMoveId && dropped.has(move.reversesMoveId)),
    ),
    records: input.records.filter(
      (record) => (input.arrivedOn.get(record.dayId) ?? 0) < day,
    ),
  });
  return result;
}
