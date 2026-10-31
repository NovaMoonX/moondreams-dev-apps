import { formatDateShort } from './formatUtils';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "Just now", "5m ago", "3h ago", "2d ago", then the short date for anything older than a week. */
export function formatTimeAgo(timestamp: number, now: number) {
  const age = Math.max(0, now - timestamp);
  if (age < MINUTE_MS) return 'Just now';
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)}m ago`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)}h ago`;
  if (age < 7 * DAY_MS) return `${Math.floor(age / DAY_MS)}d ago`;
  return formatDateShort(timestamp);
}
