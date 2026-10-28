import type { Cents, DateOnly, OpenMove, OpenRecord } from '@apps/runway/types';

import { START_DAY_KEY } from '@apps/runway/constants';

import { getEffectiveSplits } from './correct';
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

/** What each goal or bill held on the starting day: the latest start move for it on that day, and none while no start is recorded. */
export function collectStarted(
  moves: readonly OpenMove[],
  startDate: DateOnly | null,
): { money: Cents | null; byItem: Record<string, Cents> } {
  const latest = new Map<string, Extract<OpenMove, { kind: 'start' }>>();
  moves.forEach((move) => {
    if (move.kind !== 'start' || startDate === null || move.date !== startDate)
      return;
    const key = move.refId ?? '';
    const held = latest.get(key);
    if (!held || move.createdAt >= held.createdAt) latest.set(key, move);
  });
  const money = latest.get('')?.payload.amountCents ?? null;
  const byItem = Object.fromEntries(
    [...latest.entries()]
      .filter(([key]) => key !== '')
      .map(([key, move]) => [key, move.payload.amountCents]),
  );
  return { money, byItem };
}

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

/** What the confirmed days' lines gave each plan item (a corrected day's latest split), with the day each line was for; `onByDay` is a day's scheduled date. */
export function collectFunded(
  records: readonly OpenRecord[],
  onByDay: ReadonlyMap<string, DateOnly>,
): Record<string, FundedDay[]> {
  const result = getEffectiveSplits(records).reduce<
    Record<string, FundedDay[]>
  >((acc, split) => {
    const on = onByDay.get(split.dayId);
    if (on === undefined) return acc;
    return split.lines.reduce(
      (sums, line) => ({
        ...sums,
        [line.itemId]: [
          ...(sums[line.itemId] ?? []),
          { dayKey: split.dayId, on, cents: line.cents },
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

/** The days that really set money aside, not the starting amount. */
export const countFundedDays = (funded: readonly FundedDay[]) =>
  funded.filter((entry) => entry.dayKey !== START_DAY_KEY).length;

export const sumFunded = (funded: readonly FundedDay[]) =>
  funded.reduce((sum, entry) => sum + entry.cents, 0);
