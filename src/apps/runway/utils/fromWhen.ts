import { fromDateInputValue } from '@/utils/dateInputUtils';

export interface FromWhenValue {
  choice: 'now' | 'date';
  /** A date input's text; used when `choice` is `date`. */
  date: string;
}

export const INITIAL_FROM_WHEN: FromWhenValue = { choice: 'now', date: '' };

/** The first day a change applies: today, or the day picked, which has to be after today. Null while the day is missing or has passed. */
export function getEffectiveFrom(
  value: FromWhenValue,
  today: number,
): number | null {
  if (value.choice === 'now') return today;
  const date = fromDateInputValue(value.date);
  const result = date !== undefined && date > today ? date : null;
  return result;
}
