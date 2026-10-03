import { formatDateUTC } from '@/utils/formatUtils';

/** "Opens March 1" / "Released March 1"; both arguments are date-only (UTC midnight). */
export function getReleaseLabel(
  releaseDate: number | null,
  todayDay: number,
): string {
  if (releaseDate === null) return 'Release date not announced';
  if (releaseDate >= todayDay) return `Opens ${formatDateUTC(releaseDate)}`;
  return `Released ${formatDateUTC(releaseDate)}`;
}
