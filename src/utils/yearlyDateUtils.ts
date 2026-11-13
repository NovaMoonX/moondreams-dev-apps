const DAY_MS = 86_400_000;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface YearlyDate {
  month: number;
  day: number;
}

function toUtcMs(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function toKey(year: number, month: number, day: number): string {
  const pad = (value: number, size: number) =>
    String(value).padStart(size, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function occurrenceIn(year: number, { month, day }: YearlyDate): string {
  const isMissingLeapDay = month === 2 && day === 29 && !isLeapYear(year);
  return toKey(year, month, isMissingLeapDay ? 28 : day);
}

/** The date key (`YYYY-MM-DD`) on or after `todayKey` that a month and day falls on; 29 February falls on the 28th in a year without one. */
export function nextYearlyOccurrence(
  date: YearlyDate,
  todayKey: string,
): string {
  const year = Number(todayKey.slice(0, 4));
  const thisYear = occurrenceIn(year, date);
  return thisYear >= todayKey ? thisYear : occurrenceIn(year + 1, date);
}

/** Whole calendar days from `todayKey` to `key` (negative when `key` is earlier). */
export function daysUntil(todayKey: string, key: string): number {
  return Math.round((toUtcMs(key) - toUtcMs(todayKey)) / DAY_MS);
}

/** "June 3", "Aug 1984" (no day) or "June 3, 1984". */
export function formatYearlyDate({
  month,
  day,
  year,
}: {
  month: number;
  day: number | null;
  year: number | null;
}): string {
  const name = MONTH_NAMES[month - 1] ?? '';
  if (day == null) return year == null ? name : `${name.slice(0, 3)} ${year}`;
  return year == null ? `${name} ${day}` : `${name} ${day}, ${year}`;
}

/** The age or count on the occurrence `key`; null without a year. */
export function yearsOn(
  { year }: { year: number | null },
  key: string,
): number | null {
  if (year == null) return null;
  return Number(key.slice(0, 4)) - year;
}

export type MomentPrecision = 'day' | 'month' | 'year' | 'decade';

/** A one-time date at the precision it is known: "Aug 3, 2024", "Aug 2024", "1998" or "the 1980s". */
export function formatMoment({
  precision,
  month,
  day,
  year,
}: {
  precision: MomentPrecision;
  month: number | null;
  day: number | null;
  year: number;
}): string {
  if (precision === 'decade') return `the ${Math.floor(year / 10) * 10}s`;
  if (precision === 'year' || month == null) return String(year);
  const name = (MONTH_NAMES[month - 1] ?? '').slice(0, 3);
  if (precision === 'month' || day == null) return `${name} ${year}`;
  return `${name} ${day}, ${year}`;
}
