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
  /** The card it was charged to; null when it was paid in cash. */
  cardId: string | null;
}

/** A card payment not undone. */
export interface CardPaid {
  moveId: string;
  on: DateOnly;
  cents: Cents;
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
    (acc[move.refId] ??= []).push({
      moveId: move.id,
      dueOn: move.date,
      amountCents: move.payload.amountCents,
      paidOn: move.payload.paidOn,
      fromFreeCents: move.payload.fromFreeCents,
      cardId: move.payload.cardId ?? null,
    });
    return acc;
  }, {});
  return result;
}

/** Each card's payments: the `cardPayment` moves that no later move reverses. */
export function collectCardPaid(
  moves: readonly OpenMove[],
): Record<string, CardPaid[]> {
  const reversed = new Set(
    moves.flatMap((move) => (move.reversesMoveId ? [move.reversesMoveId] : [])),
  );
  const result = moves.reduce<Record<string, CardPaid[]>>((acc, move) => {
    if (move.kind !== 'cardPayment' || move.reversesMoveId || !move.refId)
      return acc;
    if (reversed.has(move.id)) return acc;
    (acc[move.refId] ??= []).push({
      moveId: move.id,
      on: move.date,
      cents: move.payload.amountCents,
    });
    return acc;
  }, {});
  return result;
}

/** One transfer that no later move reverses and that is not dated before the starting day. */
export interface TransferEntry {
  moveId: string;
  on: DateOnly;
  /** Null is Free to Spend. */
  fromId: string | null;
  /** Null is Free to Spend. */
  toId: string | null;
  cents: Cents;
}

export function collectTransferEntries(
  moves: readonly OpenMove[],
  startDate: DateOnly | null,
): TransferEntry[] {
  const reversed = new Set(
    moves.flatMap((move) => (move.reversesMoveId ? [move.reversesMoveId] : [])),
  );
  return moves.flatMap((move) =>
    move.kind !== 'transfer' ||
    move.reversesMoveId ||
    reversed.has(move.id) ||
    startDate === null ||
    move.date < startDate
      ? []
      : [
          {
            moveId: move.id,
            on: move.date,
            fromId: move.payload.fromId,
            toId: move.payload.toId,
            cents: move.payload.cents,
          },
        ],
  );
}

/** What transfers added to (positive) or took from (negative) each item. */
export function sumTransfers(
  entries: readonly TransferEntry[],
): Record<string, Cents> {
  return entries.reduce<Record<string, Cents>>((sums, entry) => {
    if (entry.fromId !== null) {
      sums[entry.fromId] = (sums[entry.fromId] ?? 0) - entry.cents;
    }
    if (entry.toId !== null) {
      sums[entry.toId] = (sums[entry.toId] ?? 0) + entry.cents;
    }
    return sums;
  }, {});
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
  const result = getEffectiveSplits(records)
    .flatMap((split) => {
      const on = onByDay.get(split.dayId);
      return on === undefined
        ? []
        : split.lines.map((line) => ({
            itemId: line.itemId,
            entry: { dayKey: split.dayId, on, cents: line.cents },
          }));
    })
    .reduce<Record<string, FundedDay[]>>((sums, { itemId, entry }) => {
      (sums[itemId] ??= []).push(entry);
      return sums;
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

/**
 * The payments as the bill's money stands now: a payment uses at most what the bill held by the later
 * of its due date and the day it was paid, after the payments before it, and the rest came from Free to
 * spend, so a correction that lowers a day a paid payment used moves the cut to Free to Spend instead of
 * leaving the bill below zero, and money set aside after the due date pays a late payment once.
 */
export function settlePaid(
  funded: readonly FundedDay[],
  paid: readonly PaidPayment[],
): PaidPayment[] {
  const order = [...paid].sort(
    (a, b) => a.dueOn - b.dueOn || a.paidOn - b.paidOn,
  );
  const settled = order.reduce<{ used: Cents; byId: Map<string, Cents> }>(
    (acc, payment) => {
      const held =
        sumFunded(
          funded.filter(
            (entry) => entry.on <= Math.max(payment.dueOn, payment.paidOn),
          ),
        ) - acc.used;
      const fromBill = Math.min(
        payment.amountCents - payment.fromFreeCents,
        Math.max(0, held),
      );
      acc.byId.set(payment.moveId, payment.amountCents - fromBill);
      return { used: acc.used + fromBill, byId: acc.byId };
    },
    { used: 0, byId: new Map() },
  );
  const result = paid.map((payment) => ({
    ...payment,
    fromFreeCents: settled.byId.get(payment.moveId) ?? payment.fromFreeCents,
  }));
  return result;
}

/** What a payment marked paid on `paidOn` would use from what the bill holds, as `settlePaid` reads it; the rest of `amountCents` comes from Free to Spend. */
export function getHeldForPayment(
  progress: BillProgressInput,
  payment: { dueOn: DateOnly; amountCents: Cents; paidOn: DateOnly },
  startDate: DateOnly | null,
): Cents {
  const probe: PaidPayment = {
    ...payment,
    moveId: '',
    fromFreeCents: 0,
    cardId: null,
  };
  const counted = progress.paid.filter(
    (entry) => startDate === null || entry.paidOn >= startDate,
  );
  const settled = settlePaid(progress.funded, [...counted, probe]);
  const fromFree =
    settled.find((entry) => entry.moveId === '')?.fromFreeCents ??
    payment.amountCents;
  const result = payment.amountCents - fromFree;
  return result;
}
