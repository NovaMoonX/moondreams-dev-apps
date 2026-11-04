import { toDayOrdinal } from '@/utils/formatUtils';
export const LAST_DAY = 31;

/** A day of the month in words: "15th", and "Last day" for the 31st, which a short month clamps to its end. */
export const toOrdinal = (day: number) =>
  day === LAST_DAY ? 'Last day' : toDayOrdinal(day);
