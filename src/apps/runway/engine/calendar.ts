import type {
  CalendarPeriod,
  Cents,
  DateOnly,
  FundingRule,
} from '@apps/runway/types';

import { DAY_MS } from './dates';
import { allocate } from './money';

/** A Monday, so a week and a two-week block count from the same day everywhere. */
const WEEK_EPOCH = Date.UTC(1970, 0, 5);
/** Periods walked from the first income day at most, a guard against a runaway span. */
const MAX_PERIODS = 1_200;

interface DayRef {
  dayKey: string;
  on: number;
  sourceId?: string | null;
}

/** Which period an income day falls in, as a whole number that grows by one per period. Weeks start on Monday, two-week blocks count from a fixed Monday, a half-month is the 1st to the 15th or the 16th on. */
export function getPeriodIndex(period: CalendarPeriod, on: DateOnly): number {
  if (period === 'weekly') return Math.floor((on - WEEK_EPOCH) / (7 * DAY_MS));
  if (period === 'every2Weeks') {
    return Math.floor((on - WEEK_EPOCH) / (14 * DAY_MS));
  }
  const date = new Date(on);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (period === 'yearly') return year;
  if (period === 'monthly') return year * 12 + month;
  const result = year * 24 + month * 2 + (date.getUTCDate() >= 16 ? 1 : 0);
  return result;
}

/** The first day of the period `on` falls in. */
export function getPeriodStart(period: CalendarPeriod, on: DateOnly): DateOnly {
  if (period === 'weekly' || period === 'every2Weeks') {
    const length = (period === 'weekly' ? 7 : 14) * DAY_MS;
    return WEEK_EPOCH + getPeriodIndex(period, on) * length;
  }
  const date = new Date(on);
  const year = date.getUTCFullYear();
  if (period === 'yearly') return Date.UTC(year, 0, 1);
  if (period === 'monthly') return Date.UTC(year, date.getUTCMonth(), 1);
  const result = Date.UTC(
    year,
    date.getUTCMonth(),
    date.getUTCDate() >= 16 ? 16 : 1,
  );
  return result;
}

/** A rule's income days: only its source's when it names one. */
export function scopeToSource<D extends { sourceId?: string | null }>(
  funding: Pick<FundingRule, 'sourceId'>,
  days: readonly D[],
): D[] {
  const sourceId = funding.sourceId ?? null;
  const result =
    sourceId === null
      ? [...days]
      : days.filter((day) => day.sourceId === sourceId);
  return result;
}

/**
 * What each income day gets from a calendar rule: the amount for one period, shared out over the
 * income days that fall in that period by largest remainder (ties by day key), so a month's $600
 * over two paydays is $300 each and over three is $200 each. A period with no income day passes its
 * amount to the next period that has one. Days before `startsOn` are not counted, and the period a
 * rule starts in is not prorated. `priorDays` are earlier income days of the same periods (already
 * settled or past): they take their share so the coming days ask only for the rest, and they are
 * not returned. Periods before the first income day given are not walked.
 */
export function spreadCalendarAmount(
  rule: { period: CalendarPeriod; startsOn: DateOnly | null; cents: Cents },
  days: readonly DayRef[],
  priorDays: readonly DayRef[] = [],
): Map<string, Cents> {
  const { period, startsOn, cents } = rule;
  const eligible = [
    ...new Map(
      [...priorDays, ...days]
        .filter((day) => startsOn === null || day.on >= startsOn)
        .map((day) => [day.dayKey, day]),
    ).values(),
  ];
  if (eligible.length === 0) return new Map();

  const byPeriod = eligible.reduce((acc, day) => {
    const index = getPeriodIndex(period, day.on);
    return acc.set(index, [...(acc.get(index) ?? []), day]);
  }, new Map<number, DayRef[]>());
  const indexes = [...byPeriod.keys()];
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);
  const result = new Map<string, Cents>();
  Array.from(
    { length: Math.min(last - first + 1, MAX_PERIODS) },
    (_, offset) => first + offset,
  ).reduce((carry, index) => {
    const group = [...(byPeriod.get(index) ?? [])].sort(
      (a, b) =>
        a.on - b.on || (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0),
    );
    const total = cents + carry;
    if (group.length === 0) return total;
    const shares = allocate(
      total,
      group.map(() => 1),
      group.map((day) => day.dayKey),
    );
    group.forEach((day, position) => result.set(day.dayKey, shares[position]));
    return 0;
  }, 0);
  const asked = new Set(days.map((day) => day.dayKey));
  return new Map([...result].filter(([key]) => asked.has(key)));
}

/** The cents a calendar rule asks of each of the days given; null when the rule is not a calendar rule. */
export function getCalendarCents(
  funding: FundingRule,
  days: readonly DayRef[],
  priorDays: readonly DayRef[] = [],
): Map<string, Cents> | null {
  const { cadence, amount } = funding;
  if (cadence.kind !== 'calendar' || amount.kind !== 'exact') return null;
  const result = spreadCalendarAmount(
    {
      period: cadence.period,
      startsOn: cadence.startsOn,
      cents: amount.cents,
    },
    scopeToSource(funding, days),
    scopeToSource(funding, priorDays),
  );
  return result;
}

/** How far back a draft has to look for the earlier income days of a calendar rule's first period. */
export function getEarliestPeriodStart(
  fundings: readonly FundingRule[],
  firstOn: DateOnly,
): DateOnly | null {
  const starts = fundings.flatMap(({ cadence }) =>
    cadence.kind === 'calendar'
      ? [
          Math.max(
            getPeriodStart(cadence.period, firstOn),
            cadence.startsOn ?? -Infinity,
          ),
        ]
      : [],
  );
  const result = starts.length === 0 ? null : Math.min(...starts);
  return result;
}
