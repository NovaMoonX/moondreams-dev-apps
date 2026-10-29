import {
  DEFAULT_PAY_LINE_NAME,
  LOOKAHEAD_MONTHS,
} from '@apps/runway/constants';
import {
  addUtcMonths,
  daysInUtcMonth,
  DAY_MS,
} from '@apps/runway/engine/dates';
import type {
  BudgetBill,
  BudgetEnvelope,
  BudgetGoal,
  BudgetIncome,
} from '@apps/runway/lib/normalizeBudgetReading';
import type { CreateIncomeInput } from '@apps/runway/store/actions/itemActions';
import type {
  BillSealed,
  EnvelopeSealed,
  GoalSealed,
  MoneyRange,
  Schedule,
} from '@apps/runway/types';

export type BudgetKind = 'income' | 'bill' | 'envelope' | 'goal';

export interface BudgetValues {
  income: CreateIncomeInput;
  bill: BillSealed;
  envelope: EnvelopeSealed;
  goal: GoalSealed;
}

/** The date `count` months after `date` when that month has the same day of the month, else null. */
const sameDayAfter = (date: number, count: number) => {
  const moved = addUtcMonths(date, count);
  return new Date(moved).getUTCDate() === new Date(date).getUTCDate()
    ? moved
    : null;
};

/** The first day on or after today that the same schedule lands on, or null when a one-time date has passed. A monthly one keeps its written day, skipping months too short to hold it. */
const rollForward = (anchor: number, kind: string, today: number) => {
  if (anchor >= today) return anchor;
  if (kind === 'weekly' || kind === 'everyOtherWeek') {
    const step = (kind === 'weekly' ? 7 : 14) * DAY_MS;
    return anchor + Math.ceil((today - anchor) / step) * step;
  }
  if (kind === 'monthly') {
    const from = new Date(anchor);
    const now = new Date(today);
    const behind =
      (now.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      from.getUTCMonth();
    return (
      Array.from({ length: 24 }, (_, index) => Math.max(1, behind) + index)
        .map((count) => sameDayAfter(anchor, count))
        .find((date) => date !== null && date >= today) ?? null
    );
  }
  return null;
};

/** The next time a day of the month comes round; a month too short to hold the day is skipped, so the 31st stays the 31st. */
const nextDayOfMonth = (day: number, today: number) => {
  const now = new Date(today);
  return (
    Array.from({ length: 14 }, (_, offset) => {
      const first = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
      );
      const length = daysInUtcMonth(
        first.getUTCFullYear(),
        first.getUTCMonth(),
      );
      return day > length
        ? null
        : Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day);
    }).find((date) => date !== null && date >= today) ?? today
  );
};

const toRange = (low: number | null, high: number | null): MoneyRange => ({
  lowCents: low ?? 0,
  highCents: high ?? low ?? 0,
});

const monthDaysFor = (kind: string, anchor: number | null) =>
  kind === 'monthly' && anchor !== null ? [new Date(anchor).getUTCDate()] : [];

export function toIncomeValue(
  item: BudgetIncome,
  today: number,
): CreateIncomeInput {
  const kind = item.scheduleKind ?? 'irregular';
  const twice = kind === 'twiceMonthly' && item.monthDays.length === 2;
  const anchor = twice
    ? Math.min(...item.monthDays.map((day) => nextDayOfMonth(day, today)))
    : item.nextOn === null
      ? null
      : rollForward(item.nextOn, kind, today);
  const schedule: Schedule = {
    kind,
    anchor,
    monthDays: twice ? item.monthDays : monthDaysFor(kind, anchor),
  };
  return {
    sourceId: null,
    sourceName: item.name,
    payLineName: DEFAULT_PAY_LINE_NAME,
    amount: toRange(item.amountCents, null),
    stanceOverride: null,
    schedule,
    ending: { onDate: null, afterCount: null },
    startDate: anchor ?? today,
  };
}

export function toBillValue(item: BudgetBill, today: number): BillSealed {
  const kind =
    item.repeats ?? (item.dayOfMonth === null ? 'irregular' : 'monthly');
  const anchor =
    item.dueOn !== null
      ? rollForward(item.dueOn, kind, today)
      : item.dayOfMonth !== null
        ? nextDayOfMonth(item.dayOfMonth, today)
        : null;
  return {
    name: item.name,
    emoji: null,
    priority: 'should',
    orderIndex: 0,
    amount: toRange(item.amountCents, item.highCents),
    timing: {
      kind: 'date',
      schedule: { kind, anchor, monthDays: monthDaysFor(kind, anchor) },
    },
    ending: { onDate: null, afterCount: null },
    fundedBy: { kind: 'suggested' },
    stanceOverride: null,
  };
}

export function toEnvelopeValue(
  item: BudgetEnvelope,
  today: number,
): EnvelopeSealed {
  const period = item.period ?? 'monthly';
  return {
    name: item.name,
    emoji: null,
    priority: 'should',
    orderIndex: 0,
    funding: {
      amount: { kind: 'exact', cents: item.amountCents ?? 0 },
      cadence:
        period === 'perPay'
          ? { kind: 'everyIncomeDay' }
          : { kind: 'calendar', period, startsOn: today },
    },
  };
}

export function toGoalValue(item: BudgetGoal, today: number): GoalSealed {
  const lastDay = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const isUsable =
    item.targetDate !== null &&
    item.targetDate >= today &&
    item.targetDate <= lastDay;
  return {
    name: item.name,
    emoji: null,
    priority: 'should',
    orderIndex: 0,
    targetCents: item.targetCents ?? 0,
    targetDate: isUsable ? item.targetDate : null,
    funding: {
      amount: { kind: 'exact', cents: 0 },
      cadence: { kind: 'none' },
    },
    startingCents: item.currentCents,
    state: 'active',
  };
}

/** Every question a proposal still needs answered before it can be added, as the form names them, in the order the form asks; empty when it is complete. */
export function getMissingSteps(
  kind: BudgetKind,
  value: BudgetValues[BudgetKind],
): string[] {
  if (kind === 'income') {
    const income = value as CreateIncomeInput;
    const { schedule } = income;
    const amount = income.amount.lowCents <= 0 ? ['amount'] : [];
    if (schedule.kind === 'irregular') return [...amount, 'often'];
    const isNoDate =
      schedule.anchor === null ||
      (schedule.kind === 'twiceMonthly' && schedule.monthDays.length < 2);
    return isNoDate ? [...amount, 'schedule'] : amount;
  }
  if (kind === 'bill') {
    const bill = value as BillSealed;
    const { schedule } = bill.timing;
    const amount = bill.amount.lowCents <= 0 ? ['amount'] : [];
    if (schedule.kind === 'irregular') return [...amount, 'repeats'];
    return schedule.anchor === null ? [...amount, 'due'] : amount;
  }
  if (kind === 'envelope') {
    const { amount } = (value as EnvelopeSealed).funding;
    return amount.kind === 'exact' && amount.cents <= 0 ? ['amount'] : [];
  }
  return (value as GoalSealed).targetCents <= 0 ? ['target'] : [];
}

/** The first question a proposal still needs answered, as the form names it; null when it is complete. */
export const getMissingStep = (
  kind: BudgetKind,
  value: BudgetValues[BudgetKind],
) => getMissingSteps(kind, value)[0] ?? null;

/** Whether the missing piece is the amount, which a row says in words. */
export const isAmountStep = (step: string | null) =>
  step === 'amount' || step === 'target';
