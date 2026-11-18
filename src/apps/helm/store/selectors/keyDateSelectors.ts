import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { TODAY_WINDOW_DAYS, COMING_UP_DAYS } from '@apps/helm/constants';
import { selectWhoById } from '@apps/helm/store/selectors/whoSelectors';
import { listUpcoming, orderForToday } from '@apps/helm/utils/keyDateUpcoming';

const selectByWho = (state: RootState) => state.helm.keyDateIndex.byWho;
const selectTodayKey = (_state: RootState, todayKey: string) => todayKey;

/** The dates that come back in the next 7 days, today included: close people first, then regular, soonest first within each; passing people and organizations never. */
export const selectUpcomingKeyDates = createSelector(
  [selectByWho, selectWhoById, selectTodayKey],
  (byWho, whoById, todayKey) =>
    orderForToday(
      listUpcoming({
        byWho,
        whoById,
        todayKey,
        withinDays: TODAY_WINDOW_DAYS - 1,
        forToday: true,
      }),
    ),
);

/** Everyone's dates for the next 12 months, soonest first with close people ahead of regular within a day; the view leaves out passing people unless asked. */
export const selectComingUp = createSelector(
  [selectByWho, selectWhoById, selectTodayKey],
  (byWho, whoById, todayKey) =>
    listUpcoming({
      byWho,
      whoById,
      todayKey,
      withinDays: COMING_UP_DAYS,
      forToday: false,
    }),
);

export const selectHasKeyDates = (state: RootState) =>
  state.helm.keyDateIndex.entryCount > 0;
