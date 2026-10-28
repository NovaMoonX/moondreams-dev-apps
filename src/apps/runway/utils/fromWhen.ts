import { fromDateInputValue } from '@/utils/dateInputUtils';
import { MAX_CHANGE_DAYS_AHEAD } from '@apps/runway/constants';
import { addUtcDays } from '@apps/runway/engine/dates';

export interface FromWhenValue {
  choice: 'now' | 'date';
  /** A date input's text; used when `choice` is `date`. */
  date: string;
}

export const INITIAL_FROM_WHEN: FromWhenValue = { choice: 'now', date: '' };

/** The first day a change applies: today, or the day picked, which has to be after today and within `MAX_CHANGE_DAYS_AHEAD`. Null while the day is missing, has passed or is too far ahead. */
export function getEffectiveFrom(
  value: FromWhenValue,
  today: number,
): number | null {
  if (value.choice === 'now') return today;
  const date = fromDateInputValue(value.date);
  const result =
    date !== undefined &&
    date > today &&
    date <= addUtcDays(today, MAX_CHANGE_DAYS_AHEAD)
      ? date
      : null;
  return result;
}
