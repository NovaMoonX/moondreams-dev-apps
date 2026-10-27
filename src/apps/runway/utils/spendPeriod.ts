import { DAY_MS } from '@apps/runway/engine/dates';
import {
  getMonthStart,
  getNextMonth,
  getPreviousMonth,
  isMonthKey,
  toMonthKey,
} from '@apps/runway/engine/closings';
import type { DateOnly } from '@apps/runway/types';

export interface SpendRange {
  /** The first day, as UTC midnight. */
  from: DateOnly;
  /** The first day after the period. */
  to: DateOnly;
  key: string;
}

const monthRange = (month: string): SpendRange => {
  const from = getMonthStart(month);
  const to = getMonthStart(getNextMonth(month));
  return { from, to, key: `${from}:${to}` };
};

const rollingRange = (today: DateOnly, days: number): SpendRange => {
  const from = today - (days - 1) * DAY_MS;
  const to = today + DAY_MS;
  return { from, to, key: `${from}:${to}` };
};

/** The days a Spend period covers: a month, or a stretch ending today. */
export function getSpendRange(period: string, today: DateOnly): SpendRange {
  if (isMonthKey(period)) return monthRange(period);
  if (period === 'lastMonth') {
    return monthRange(getPreviousMonth(toMonthKey(today)));
  }
  if (period === '30') return rollingRange(today, 30);
  if (period === '90') return rollingRange(today, 90);
  return monthRange(toMonthKey(today));
}
