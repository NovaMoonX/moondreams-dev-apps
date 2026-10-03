import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { WATCH_PRIORITIES, WEEK_STARTS_ON } from '@apps/a-list/constants';
import type { Viewing } from '@apps/a-list/types';
import { getDayKey, getWeekBounds } from '@apps/a-list/utils/dayKeys';

export const selectMembership = (state: RootState) =>
  state.aList.membership.membership;

export const selectAListLoadError = (state: RootState) =>
  state.aList.membership.loadError ??
  state.aList.watchlist.loadError ??
  state.aList.viewings.loadError;

export const selectIsAListLoaded = (state: RootState) =>
  state.aList.membership.isLoaded &&
  state.aList.watchlist.isLoaded &&
  state.aList.viewings.isLoaded;

const selectWatchlistState = (state: RootState) => state.aList.watchlist.items;

/** By priority, then release date (undated last), then title. */
export const selectWatchlistItems = createSelector(
  [selectWatchlistState],
  (items) => {
    const result = [...items].sort((left, right) => {
      const byPriority =
        WATCH_PRIORITIES.indexOf(left.priority) -
        WATCH_PRIORITIES.indexOf(right.priority);
      if (byPriority !== 0) return byPriority;
      const leftDate = left.movie.releaseDate ?? Number.POSITIVE_INFINITY;
      const rightDate = right.movie.releaseDate ?? Number.POSITIVE_INFINITY;
      if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
      return left.movie.title.localeCompare(right.movie.title);
    });
    return result;
  },
);

const selectViewingItems = (state: RootState) => state.aList.viewings.items;

/** Day key → that day's viewings in showtime order: what each calendar cell and the day panel read. */
export const selectViewingsByDay = createSelector(
  [selectViewingItems],
  (viewings) => {
    const sorted = [...viewings].sort(
      (left, right) => left.showtimeAt - right.showtimeAt,
    );
    const result = sorted.reduce<Record<string, Viewing[]>>(
      (byDay, viewing) => {
        const dayKey = getDayKey(viewing.showtimeAt);
        return { ...byDay, [dayKey]: [...(byDay[dayKey] ?? []), viewing] };
      },
      {},
    );
    return result;
  },
);

/** movieKey → how many times it has been seen. */
export const selectSeenCountByMovieKey = createSelector(
  [selectViewingItems],
  (viewings) => {
    const result = viewings
      .filter((viewing) => viewing.status === 'SEEN')
      .reduce<Record<string, number>>(
        (counts, viewing) => ({
          ...counts,
          [viewing.movieKey]: (counts[viewing.movieKey] ?? 0) + 1,
        }),
        {},
      );
    return result;
  },
);

/** Seen viewings only, bucketed by the viewer's local day; a rewatch counts again. */
export const selectCounters = createSelector(
  [
    selectViewingItems,
    selectMembership,
    (_state: RootState, now: number) => now,
  ],
  (viewings, membership, now) => {
    const seenDayKeys = viewings
      .filter((viewing) => viewing.status === 'SEEN')
      .map((viewing) => getDayKey(viewing.showtimeAt));
    const { startKey, endKey } = getWeekBounds(now, WEEK_STARTS_ON);
    const monthPrefix = getDayKey(now).slice(0, 7);
    const thisWeek = seenDayKeys.filter(
      (key) => key >= startKey && key <= endKey,
    ).length;
    const thisMonth = seenDayKeys.filter((key) =>
      key.startsWith(monthPrefix),
    ).length;
    const weeklyGoal = membership?.weeklyGoal ?? null;
    const monthlyGoal = membership?.monthlyGoal ?? null;

    const result = {
      watched: seenDayKeys.length,
      thisWeek,
      thisMonth,
      weeklyGoal,
      monthlyGoal,
      isWeeklyGoalMet: weeklyGoal !== null && thisWeek >= weeklyGoal,
      isMonthlyGoalMet: monthlyGoal !== null && thisMonth >= monthlyGoal,
    };
    return result;
  },
);
