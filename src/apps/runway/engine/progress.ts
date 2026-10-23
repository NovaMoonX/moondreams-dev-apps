import type { Cents, DateOnly, OpenMove, OpenRecord } from '@apps/runway/types';

import { toDayStamp } from './dates';

/** What a confirmed day set aside for a bill. */
export interface FundedDay {
  dayKey: string;
  on: DateOnly;
  cents: Cents;
}

/** A payment the person marked paid and has not undone. */
export interface PaidPayment {
  moveId: string;
  dueOn: DateOnly;
  amountCents: Cents;
  paidOn: DateOnly;
  fromFreeCents: Cents;
}

/** Everything confirmed records and moves say about one bill. */
export interface BillProgressInput {
  funded: FundedDay[];
  paid: PaidPayment[];
}

export const NO_PROGRESS: BillProgressInput = { funded: [], paid: [] };

/** The id of the nth time a payment is marked paid: the first is `paid_<bill>_<due>`, a mark after an undo adds `_<n>`. */
export function getPaidMoveId(billId: string, dueOn: DateOnly, marks: number) {
  const base = `paid_${billId}_${toDayStamp(dueOn)}`;
  const result = marks === 0 ? base : `${base}_${marks + 1}`;
  return result;
}

/** Undoing a mark names the move it reverses, so a second undo of it is the same id. */
export const getUndoMoveId = (paidMoveId: string) => `unpaid_${paidMoveId}`;

/** Each bill's paid payments: the `billPaid` moves that no later move reverses. */
export function collectPaid(
  moves: readonly OpenMove[],
): Record<string, PaidPayment[]> {
  const reversed = new Set(
    moves.flatMap((move) => (move.reversesMoveId ? [move.reversesMoveId] : [])),
  );
  const result = moves.reduce<Record<string, PaidPayment[]>>((acc, move) => {
    if (move.kind !== 'billPaid' || move.reversesMoveId || !move.refId)
      return acc;
    if (reversed.has(move.id)) return acc;
    const paid: PaidPayment = {
      moveId: move.id,
      dueOn: move.date,
      amountCents: move.payload.amountCents,
      paidOn: move.payload.paidOn,
      fromFreeCents: move.payload.fromFreeCents,
    };
    return { ...acc, [move.refId]: [...(acc[move.refId] ?? []), paid] };
  }, {});
  return result;
}

/** How many times a payment has been marked paid, undone ones included, which is what the next mark's id counts. */
export const countMarks = (
  moves: readonly OpenMove[],
  billId: string,
  dueOn: DateOnly,
) =>
  moves.filter(
    (move) =>
      move.kind === 'billPaid' &&
      !move.reversesMoveId &&
      move.refId === billId &&
      move.date === dueOn,
  ).length;

/** What the confirmed days' lines gave each plan item, with the day each line was for; `onByDay` is a day's scheduled date. */
export function collectFunded(
  records: readonly OpenRecord[],
  onByDay: ReadonlyMap<string, DateOnly>,
): Record<string, FundedDay[]> {
  const result = records.reduce<Record<string, FundedDay[]>>((acc, record) => {
    const on = onByDay.get(record.dayId);
    if (record.kind !== 'confirmed' || on === undefined) return acc;
    return record.payload.lines.reduce(
      (sums, line) => ({
        ...sums,
        [line.itemId]: [
          ...(sums[line.itemId] ?? []),
          { dayKey: record.dayId, on, cents: line.cents },
        ],
      }),
      acc,
    );
  }, {});
  return result;
}

/** The confirmed days that fund a payment: those after `after` through `through`. */
export const fundedInWindow = (
  funded: readonly FundedDay[],
  after: number,
  through: number,
) => funded.filter((entry) => entry.on > after && entry.on <= through);

export const sumFunded = (funded: readonly FundedDay[]) =>
  funded.reduce((sum, entry) => sum + entry.cents, 0);
