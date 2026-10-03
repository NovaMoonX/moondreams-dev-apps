import { toLocalDateInputValue } from '@/utils/dateInputUtils';

/** The viewer's local calendar day of an instant, "YYYY-MM-DD"; day keys compare correctly as strings. */
export function getDayKey(timestamp: number): string {
  const result = toLocalDateInputValue(timestamp);
  return result;
}
