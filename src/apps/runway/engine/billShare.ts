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

export interface BillPin {
  dayKey: string;
  payLineId: string;
  sourceId: string | null;
  expectedOn: number;
  cents: Cents;
}

/** The days still open to change on or after `from` where the person set what a pay puts toward one bill: the one list a count and a clear both use. */
export function getBillPins(
  days: readonly {
    id: string;
    payLineId: string;
    sourceId: string | null;
    expectedOn: number;
    status: DayStatus;
    override: Pick<DayOverrideSealed, 'billCents'>;
  }[],
  billId: string,
  from: number,
): BillPin[] {
  const result = days
    .filter(
      (day) =>
        day.status === 'draft' &&
        day.expectedOn >= from &&
        Object.hasOwn(day.override.billCents ?? {}, billId),
    )
    .map((day) => ({
      dayKey: day.id,
      payLineId: day.payLineId,
      sourceId: day.sourceId,
      expectedOn: day.expectedOn,
      cents: day.override.billCents[billId],
    }))
    .sort((a, b) => a.expectedOn - b.expectedOn);
  return result;
}

/** A bill's stretches with only Paid from changed, so a later version and its end are kept. */
export function withFundedBy<P extends { fundedBy: BillFundedBy }>(
  stretches: readonly {
    payload: P;
    effectiveFrom: number;
    effectiveUntil: number | null;
  }[],
  fundedBy: BillFundedBy,
) {
  const result = stretches.map((stretch) => ({
    ...stretch,
    payload: { ...stretch.payload, fundedBy },
  }));
  return result;
}

const fixedCache = new WeakMap<object, Map<string, Record<string, Cents>>>();

/** The share a draft day was given for each bill by the person, by bill id and then day key; only days still open to change count, since a settled day's share is in the records. Read once per list of days, since a walk over every income day asks again and again. */
export function getFixedByBill(
  days: readonly {
    id: string;
    status: DayStatus;
    override: Pick<DayOverrideSealed, 'billCents'>;
  }[],
): Map<string, Record<string, Cents>> {
  const known = fixedCache.get(days);
  if (known) return known;
  const result = days.reduce((acc, day) => {
    if (day.status !== 'draft') return acc;
    Object.entries(day.override.billCents ?? {}).forEach(([billId, cents]) => {
      acc.set(billId, { ...acc.get(billId), [day.id]: cents });
    });
    return acc;
  }, new Map<string, Record<string, Cents>>());
  fixedCache.set(days, result);
  return result;
}

export interface BillShareEffect {
  dueOn: number;
  totalCents: Cents;
  /** The most this pay can put in: what the payment still needs. */
  maxCents: Cents;
  /** What confirmed days already set aside for the payment. */
  fundedCents: Cents;
  /** The figure after the cap. */
  cents: Cents;
  /** Each pay in the payment's window whose share moves, plus this one, in day order. */
  rows: {
    dayKey: string;
    on: number;
    beforeCents: Cents;
    afterCents: Cents;
    /** Another pay the person pinned whose figure the change cuts. */
    isPinned: boolean;
  }[];
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
      isPinned:
        key !== dayKey &&
        bill.fixed !== undefined &&
        Object.hasOwn(bill.fixed, key),
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
    fundedCents: before.fundedCents,
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
 * The Paid from rule that says what one change to a pay's share says for every paycheck: a pay set to
 * nothing while exactly one other repeating pay is in the window, or a pay set to the whole payment.
 * One-time pays are never part of a rule. Null when the change does not name one pay, or the rule
 * would pick other pays too.
 */
export function findPayRule(
  effect: BillShareEffect,
  dayKey: string,
  getMonthDay: (payLineId: string, on: number) => number | null,
  isOneTime: (payLineId: string) => boolean,
): Extract<BillFundedBy, { kind: 'pay' }> | null {
  const repeating = effect.window.filter(
    (day) => !isOneTime(payLineIdOfDayKey(day.dayKey)),
  );
  if (!repeating.some((day) => day.dayKey === dayKey)) return null;
  const others = repeating.filter((day) => day.dayKey !== dayKey);
  const target =
    effect.cents === 0 && others.length === 1
      ? others[0]
      : effect.cents > 0 && effect.cents === effect.maxCents
        ? repeating.find((day) => day.dayKey === dayKey)
        : undefined;
  if (!target) return null;
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
