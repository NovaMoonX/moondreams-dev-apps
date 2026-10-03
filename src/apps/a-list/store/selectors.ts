import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { WATCH_PRIORITIES } from '@apps/a-list/constants';

export const selectMembership = (state: RootState) =>
  state.aList.membership.membership;

export const selectAListLoadError = (state: RootState) =>
  state.aList.membership.loadError ?? state.aList.watchlist.loadError;

export const selectIsAListLoaded = (state: RootState) =>
  state.aList.membership.isLoaded && state.aList.watchlist.isLoaded;

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
