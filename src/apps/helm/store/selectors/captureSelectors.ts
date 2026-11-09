import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenCapture, OpenExecution, OpenTask } from '@apps/helm/types';

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

export const selectIsCapturesLoaded = (state: RootState) =>
  state.helm.recentCaptures.isLoaded;

const selectRecentExecutions = (state: RootState) =>
  state.helm.recentExecutions.items;
const selectEarlierExecutions = (state: RootState) =>
  state.helm.earlierExecutions;

/** Every execution home has loaded, by id. */
export const selectExecutionsById = createSelector(
  [selectRecentExecutions, selectEarlierExecutions],
  (recent, earlier): Map<string, OpenExecution> =>
    new Map([...earlier, ...recent].map((entry) => [entry.id, entry])),
);

const selectOpenTasks = (state: RootState) => state.helm.openTasks.items;

export const selectOpenTasksById = createSelector(
  [selectOpenTasks],
  (tasks): Map<string, OpenTask> =>
    new Map(tasks.map((task) => [task.id, task])),
);
