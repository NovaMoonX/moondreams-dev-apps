import { OPENING_WINDOW_DAYS } from '@apps/a-list/constants';

const DAY_MS = 86_400_000;

/**
 * Days from `todayDay` until a release, when it falls in the Opening window (today through
 * seven days out, inclusive); otherwise null. Both are date-only (UTC midnight), so it's plain math.
 */
export function getDaysUntilOpening(
  releaseDate: number | null,
  todayDay: number,
): number | null {
  if (
    releaseDate === null ||
    releaseDate < todayDay ||
    releaseDate > todayDay + OPENING_WINDOW_DAYS * DAY_MS
  ) {
    return null;
  }

  const result = Math.round((releaseDate - todayDay) / DAY_MS);
  return result;
}
