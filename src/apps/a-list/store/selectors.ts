import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  PREVIEWS_WINDOW_AFTER_MINUTES,
  PREVIEWS_WINDOW_BEFORE_MINUTES,
  WATCH_PRIORITIES,
  WEEK_STARTS_ON,
} from '@apps/a-list/constants';
import type { Viewing } from '@apps/a-list/types';
import { getFeeChips, getTaxRateChips } from '@apps/a-list/utils/chips';
import { getDayKey, getWeekBounds } from '@apps/a-list/utils/dayKeys';
import { getDaysUntilOpening } from '@apps/a-list/utils/opening';
import { getSavingsSummary } from '@apps/a-list/utils/savings';
import { buildWatchlistRows } from '@apps/a-list/utils/watchlistRows';
import { fromDateInputValue } from '@/utils/dateInputUtils';

export const selectMembership = (state: RootState) =>
  state.aList.membership.membership;

export const selectAListLoadError = (state: RootState) =>
  state.aList.membership.loadError ??
  state.aList.watchlist.loadError ??
  state.aList.viewings.loadError;

export const selectIsAListLoaded = (state: RootState) =>
  state.aList.membership.isLoaded &&
  state.aList.watchlist.isLoaded &&
  state.aList.viewings.isLoaded &&
  state.aList.theatres.isLoaded;

const selectTheatreItems = (state: RootState) => state.aList.theatres.items;

/** The favorite first, then by name. */
export const selectTheatres = createSelector(
  [selectTheatreItems, selectMembership],
  (theatres, membership) => {
    const favoriteId = membership?.favoriteTheatreId ?? null;
    const result = [...theatres].sort((left, right) => {
      if (left.theatreId === favoriteId) return -1;
      if (right.theatreId === favoriteId) return 1;
      return left.name.localeCompare(right.name);
    });
    return result;
  },
);

const selectCalendarShareItems = (state: RootState) =>
  state.aList.calendarShares.items;

/** Newest first. */
export const selectCalendarShares = createSelector(
  [selectCalendarShareItems],
  (shares) => {
    const result = [...shares].sort(
      (left, right) => right.createdAt - left.createdAt,
    );
    return result;
  },
);

export const selectAreCalendarSharesLoaded = (state: RootState) =>
  state.aList.calendarShares.isLoaded;

export const selectCalendarSharesLoadError = (state: RootState) =>
  state.aList.calendarShares.loadError;

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
      watchedMinutes: viewings
        .filter((viewing) => viewing.status === 'SEEN')
        .reduce(
          (total, viewing) => total + (viewing.movie.runtimeMinutes ?? 0),
          0,
        ),
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

export const selectViewingById = (state: RootState, id: string) =>
  state.aList.viewings.items.find((viewing) => viewing.id === id) ?? null;

export const selectFeeChips = createSelector([selectViewingItems], (viewings) =>
  getFeeChips(viewings),
);

export const selectTaxRateChips = createSelector(
  [selectViewingItems, selectMembership],
  (viewings, membership) =>
    getTaxRateChips(viewings, membership?.taxRate ?? null),
);

/** Keyed on the local day rather than `now`, so the clock tick reuses the result; the day becomes UTC midnight like the start date. */
export const selectSavingsSummary = createSelector(
  [
    selectViewingItems,
    selectMembership,
    (_state: RootState, now: number) => getDayKey(now),
  ],
  (viewings, membership, todayKey) => {
    if (!membership) return null;
    const todayDay = fromDateInputValue(todayKey) ?? 0;
    const result = getSavingsSummary(viewings, membership, todayDay);
    return result;
  },
);

/** Seen viewings split by whether a ticket is on record, newest first: what the dashboard's ticket lists read. */
export const selectSeenTicketGroups = createSelector(
  [selectViewingItems],
  (viewings) => {
    const seen = viewings
      .filter((viewing) => viewing.status === 'SEEN')
      .sort((left, right) => right.showtimeAt - left.showtimeAt);
    const result = {
      paid: seen.filter((viewing) => viewing.ticket),
      unpriced: seen.filter((viewing) => !viewing.ticket),
    };
    return result;
  },
);

/** Planned showings that have ended and still need an answer, oldest first. */
export const selectPendingSeenPrompts = createSelector(
  [selectViewingItems, (_state: RootState, now: number) => now],
  (viewings, now) => {
    const result = viewings
      .filter(
        (viewing) => viewing.status === 'PLANNED' && viewing.endsAt <= now,
      )
      .sort((left, right) => left.endsAt - right.endsAt);
    return result;
  },
);

/** The planned showing whose previews are about to run or just started, earliest first if two overlap. */
export const selectPreviewsWindowViewing = createSelector(
  [selectViewingItems, (_state: RootState, now: number) => now],
  (viewings, now): Viewing | null => {
    const result =
      viewings
        .filter(
          (viewing) =>
            viewing.status === 'PLANNED' &&
            viewing.showtimeAt - PREVIEWS_WINDOW_BEFORE_MINUTES * 60_000 <=
              now &&
            now <= viewing.showtimeAt + PREVIEWS_WINDOW_AFTER_MINUTES * 60_000,
        )
        .sort((left, right) => left.showtimeAt - right.showtimeAt)[0] ?? null;
    return result;
  },
);

/** Watchlist items joined with their viewings, in the watchlist's priority order. */
export const selectWatchlistRows = createSelector(
  [
    selectWatchlistItems,
    selectViewingItems,
    (_state: RootState, now: number) => now,
  ],
  (items, viewings, now) => buildWatchlistRows(items, viewings, now),
);

/** Unseen movies opening from today through a week out, soonest first. */
export const selectOpeningRows = createSelector(
  [selectWatchlistRows, (_state: RootState, now: number) => now],
  (rows, now) => {
    const todayDay = fromDateInputValue(getDayKey(now)) ?? 0;
    const result = rows
      .flatMap((row) => {
        const daysUntil = row.isSeen
          ? null
          : getDaysUntilOpening(row.item.movie.releaseDate, todayDay);
        return daysUntil === null ? [] : [{ ...row, daysUntil }];
      })
      .sort((left, right) => left.daysUntil - right.daysUntil);
    return result;
  },
);
