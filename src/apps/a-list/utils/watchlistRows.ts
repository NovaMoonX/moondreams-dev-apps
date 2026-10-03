import type { Viewing, WatchlistItem } from '@apps/a-list/types';

export interface WatchlistRowData {
  item: WatchlistItem;
  isSeen: boolean;
  seenCount: number;
  /** The earliest planned showing still ahead, if any. */
  nextPlannedAt: number | null;
  /** The latest seen showing, if any. */
  lastWatchedAt: number | null;
}

/** Joins each item with its viewings; "seen" is derived, never stored, so it can't drift. */
export function buildWatchlistRows(
  items: WatchlistItem[],
  viewings: Viewing[],
  now: number,
): WatchlistRowData[] {
  const byMovie = viewings.reduce<Record<string, Viewing[]>>(
    (groups, viewing) => ({
      ...groups,
      [viewing.movieKey]: [...(groups[viewing.movieKey] ?? []), viewing],
    }),
    {},
  );

  const result = items.map((item) => {
    const movieViewings = byMovie[item.movieKey] ?? [];
    const seenTimes = movieViewings
      .filter((viewing) => viewing.status === 'SEEN')
      .map((viewing) => viewing.showtimeAt);
    const plannedTimes = movieViewings
      .filter(
        (viewing) => viewing.status === 'PLANNED' && viewing.showtimeAt >= now,
      )
      .map((viewing) => viewing.showtimeAt);
    return {
      item,
      isSeen: seenTimes.length > 0,
      seenCount: seenTimes.length,
      nextPlannedAt: plannedTimes.length > 0 ? Math.min(...plannedTimes) : null,
      lastWatchedAt: seenTimes.length > 0 ? Math.max(...seenTimes) : null,
    };
  });
  return result;
}
