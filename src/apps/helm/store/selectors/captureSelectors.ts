import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenCapture, OpenExecution, OpenTask } from '@apps/helm/types';
import { toHeldItems } from '@apps/helm/utils/heldCaptures';

const selectRecent = (state: RootState) => state.helm.recentCaptures.captures;
const selectUnseen = (state: RootState) => state.helm.unseenCaptures.captures;
const selectEarlier = (state: RootState) => state.helm.earlier.captures;

/** Every turn home has loaded once, oldest first; a turn in both sets takes the live snapshot. */
export const selectAllCaptures = createSelector(
  [selectRecent, selectEarlier],
  (recent, earlier): OpenCapture[] => {
    const byId = new Map(
      [...earlier, ...recent].map((capture) => [capture.id, capture]),
    );
    return [...byId.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.turnIndex - b.turnIndex,
    );
  },
);

/** Turns not seen yet, newest first. */
export const selectUnseenCaptures = createSelector(
  [selectUnseen],
  (unseen): OpenCapture[] =>
    [...unseen].sort((a, b) => b.createdAt - a.createdAt),
);

const selectWaiting = (state: RootState) => state.helm.waitingCaptures.captures;

/** The turns that need the person and the ones that only wait, oldest first. */
export const selectHeldItems = createSelector([selectWaiting], toHeldItems);

/** Turns not seen yet, leaving out the ones Needs you lists above, which stay unseen until they are dealt with. */
export const selectNewSinceLooked = createSelector(
  [selectUnseenCaptures, selectHeldItems],
  (unseen, held): OpenCapture[] => {
    const listed = new Set(
      [...held.needsYou, ...held.waiting].map((item) => item.capture.id),
    );
    return unseen.filter((capture) => !listed.has(capture.id));
  },
);

export const selectIsCapturesLoaded = (state: RootState) =>
  state.helm.recentCaptures.isLoaded;

const selectRecentExecutions = (state: RootState) =>
  state.helm.recentExecutions.items;
const selectEarlierExecutions = (state: RootState) =>
  state.helm.earlierExecutions;

const selectActivityItems = (state: RootState) => state.helm.activity.items;

/** Every execution loaded, by id: home's, the ones fetched on their own and Activity's. */
export const selectExecutionsById = createSelector(
  [selectRecentExecutions, selectEarlierExecutions, selectActivityItems],
  (recent, earlier, activity): Map<string, OpenExecution> =>
    new Map(
      [...earlier, ...activity, ...recent].map((entry) => [entry.id, entry]),
    ),
);

const selectOpenTasks = (state: RootState) => state.helm.openTasks.items;

export const selectOpenTasksById = createSelector(
  [selectOpenTasks],
  (tasks): Map<string, OpenTask> =>
    new Map(tasks.map((task) => [task.id, task])),
);
