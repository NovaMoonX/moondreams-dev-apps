import { toLocalDateInputValue } from '@/utils/dateInputUtils';

/** The viewer's local calendar day of an instant, "YYYY-MM-DD"; day keys compare correctly as strings. */
export function getDayKey(timestamp: number): string {
  const result = toLocalDateInputValue(timestamp);
  return result;
}

/** The viewer's local week containing `now`, as inclusive day keys. */
export function getWeekBounds(
  now: number,
  weekStartsOn: number,
): { startKey: string; endKey: string } {
  const today = new Date(now);
  const offset = (today.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - offset,
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
  );
  const result = {
    startKey: getDayKey(start.getTime()),
    endKey: getDayKey(end.getTime()),
  };
  return result;
}
