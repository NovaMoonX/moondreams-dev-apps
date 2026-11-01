import type {
  BillFundedBy,
  Cents,
  DayOverrideSealed,
  DayStatus,
  Stance,
} from '@apps/runway/types';

import { payLineIdOfDayKey } from './dates';
import {
  getEligibleDays,
  planBillPayments,
  type DraftBillInput,
  type IncomeDayRef,
} from './demands';

/** The share a draft day was given for each bill by the person, by bill id and then day key; only days still open to change count, since a settled day's share is in the records. */
export function getFixedByBill(
  days: readonly {
    id: string;
    status: DayStatus;
    override: Pick<DayOverrideSealed, 'billCents'>;
  }[],
): Map<string, Record<string, Cents>> {
  const result = days.reduce((acc, day) => {
    if (day.status !== 'draft') return acc;
    Object.entries(day.override.billCents ?? {}).forEach(([billId, cents]) => {
      acc.set(billId, { ...acc.get(billId), [day.id]: cents });
    });
    return acc;
  }, new Map<string, Record<string, Cents>>());
  return result;
}

export interface BillShareEffect {
  dueOn: number;
  totalCents: Cents;
  /** The most this pay can put in: what the payment still needs. */
  maxCents: Cents;
  /** The figure after the cap. */
  cents: Cents;
  /** Each pay in the payment's window whose share moves, plus this one, in day order. */
  rows: { dayKey: string; on: number; beforeCents: Cents; afterCents: Cents }[];
  /** What no pay in the window would carry after the change. */
  shortCents: Cents;
  /** Every pay in the payment's window, and the pays that carry something after the change. */
  window: IncomeDayRef[];
  carriers: { dayKey: string; cents: Cents }[];
}

/**
 * What setting one pay's share of a bill's payment to `cents` does to the payment: this pay, every
 * other pay in the same window and whatever would be left with no pay to carry it. Null when the
 * pay is not in a payment's window.
 */
export function previewBillShare(
  bill: DraftBillInput,
  days: readonly IncomeDayRef[],
  horizon: number,
  stance: Stance,
  dayKey: string,
  cents: Cents,
  options: { today?: number; startDate?: number | null } = {},
): BillShareEffect | null {
  const plan = (input: DraftBillInput) =>
    planBillPayments(input, days, horizon, stance, options);
  const before = plan(bill).find((payment) =>
    payment.parts.some((part) => part.day.dayKey === dayKey),
  );
  if (!before) return null;
  const maxCents = Math.max(0, before.totalCents - before.fundedCents);
  const capped = Math.min(Math.max(0, cents), maxCents);
  const after = plan({
    ...bill,
    fixed: { ...bill.fixed, [dayKey]: capped },
  }).find((payment) => payment.dueOn === before.dueOn);
  if (!after) return null;
  const centsOf = (parts: typeof before.parts, key: string) =>
    parts.find((part) => part.day.dayKey === key)?.cents ?? 0;
  const keys = new Map(
    [...before.parts, ...after.parts].map((part) => [
      part.day.dayKey,
      part.day.on,
    ]),
  );
  const rows = [...keys.entries()]
    .map(([key, on]) => ({
      dayKey: key,
      on,
      beforeCents: centsOf(before.parts, key),
      afterCents: centsOf(after.parts, key),
    }))
    .filter(
      (row) => row.dayKey === dayKey || row.beforeCents !== row.afterCents,
    )
    .sort((a, b) => a.on - b.on);
  const given = after.parts.reduce((sum, part) => sum + part.cents, 0);
  const result: BillShareEffect = {
    dueOn: before.dueOn,
    totalCents: before.totalCents,
    maxCents,
    cents: capped,
    rows,
    shortCents: Math.max(0, maxCents - given),
    window: before.parts.map((part) => part.day),
    carriers: after.parts
      .filter((part) => part.cents > 0)
      .map((part) => ({ dayKey: part.day.dayKey, cents: part.cents })),
  };
  return result;
}

/**
 * The Paid from rule that says what one change to a pay's share says for every paycheck: the pay
 * set to nothing while exactly one other pay carries the whole rest, or the pay set to the whole
 * payment. Null when the change is not one pay doing it all, or the rule would pick other pays too.
 */
export function findPayRule(
  effect: BillShareEffect,
  dayKey: string,
  getMonthDay: (payLineId: string, on: number) => number | null,
): Extract<BillFundedBy, { kind: 'pay' }> | null {
  const only = effect.carriers.length === 1 ? effect.carriers[0] : null;
  const targetKey =
    effect.cents === 0 && only && only.dayKey !== dayKey
      ? only.dayKey
      : effect.cents > 0 && effect.cents === effect.maxCents
        ? dayKey
        : null;
  const target = effect.window.find((day) => day.dayKey === targetKey);
  if (!target || only?.cents !== effect.maxCents) return null;
  const payLineId = payLineIdOfDayKey(target.dayKey);
  const rule: Extract<BillFundedBy, { kind: 'pay' }> = {
    kind: 'pay',
    payLineId,
    monthDay: getMonthDay(payLineId, target.on),
  };
  const picked = getEligibleDays(effect.window, rule);
  return picked.length === 1 && picked[0].dayKey === target.dayKey
    ? rule
    : null;
}
