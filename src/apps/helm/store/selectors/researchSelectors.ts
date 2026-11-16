import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  readLearnOffers,
  type LearnOfferReading,
} from '@apps/helm/engine/learnLater';
import type { OpenResearch } from '@apps/helm/types';

const selectItems = (state: RootState) => state.helm.research.items;

/** Every research item whose words opened, newest first. */
export const selectResearch = createSelector([selectItems], (items) =>
  items.filter((one) => !one.isUnreadable),
);

const selectLearnItems = (state: RootState) => state.helm.learnLater.items;

/** What is saved to learn later and still open (not done, removed or folded into another), newest first. */
export const selectLearnLater = createSelector([selectLearnItems], (items) =>
  items.filter(
    (one) =>
      one.mode === 'learnLater' &&
      !one.isUnreadable &&
      one.status !== 'done' &&
      one.status !== 'dismissed',
  ),
);

export const selectLearnById = createSelector([selectLearnItems], (items) => {
  const byId = new Map(items.map((one) => [one.id, one]));
  return (id: string | null) => (id === null ? null : (byId.get(id) ?? null));
});

/** The saved questions Today may offer, best first. An item offered on an earlier day and left unanswered is offered again, and one question is offered a day: any answer given today ends it. */
export function pickLearnOffers(
  items: OpenResearch[],
  todayKey: string,
  timeZone: string,
): LearnOfferReading[] {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const isAnsweredToday = items.some((one) => {
    const last = one.offers[one.offers.length - 1];
    return (
      last !== undefined && formatter.format(new Date(last.at)) === todayKey
    );
  });
  return isAnsweredToday
    ? []
    : readLearnOffers({
        items: items.map((one) =>
          one.offeredOn === todayKey ? one : { ...one, offeredOn: null },
        ),
        todayKey,
        timeZone,
      });
}
