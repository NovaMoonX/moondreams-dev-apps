import { formatList } from '@/utils/formatUtils';

function pluralize(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * "3 months and 12 days": how long a membership has run, to its two largest units. Both
 * arguments are date-only (UTC midnight); null when it started today or is still ahead.
 */
export function getMembershipAgeLabel(
  startDate: number,
  todayDay: number,
): string | null {
  if (startDate >= todayDay) {
    return null;
  }

  const start = new Date(startDate);
  const today = new Date(todayDay);
  const monthSpan =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - start.getUTCMonth());
  const anchorMonths =
    today.getUTCDate() >= start.getUTCDate() ? monthSpan : monthSpan - 1;
  const anchor = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth() + anchorMonths,
      start.getUTCDate(),
    ),
  );
  const days = Math.round((todayDay - anchor.getTime()) / 86_400_000);
  const parts = [
    { count: Math.floor(anchorMonths / 12), unit: 'year' },
    { count: anchorMonths % 12, unit: 'month' },
    { count: days, unit: 'day' },
  ]
    .filter(({ count }) => count > 0)
    .slice(0, 2)
    .map(({ count, unit }) => pluralize(count, unit));

  const result = formatList(parts);
  return result;
}
