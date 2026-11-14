import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenCapture, OpenExecution, OpenTask } from '@apps/helm/types';
import { toHeldItems } from '@apps/helm/utils/heldCaptures';
import { isOutsideTurn } from '@apps/helm/utils/outsideTurns';

const selectRecentRaw = (state: RootState) =>
  state.helm.recentCaptures.captures;
const selectOutside = (state: RootState) => state.helm.outsideCaptures.captures;
const selectEarlierRaw = (state: RootState) => state.helm.earlier.captures;

const toHomeTurns = (captures: OpenCapture[]) =>
  captures.filter((capture) => !isOutsideTurn(capture));

// Home's thread, counts and Needs you all read these; an outside assistant's turn is dropped here and nowhere else.
const selectRecent = createSelector([selectRecentRaw], toHomeTurns);
const selectUnseen = createSelector(
  [(state: RootState) => state.helm.unseenCaptures.captures],
  toHomeTurns,
);
const selectEarlier = createSelector([selectEarlierRaw], toHomeTurns);

const toTurnsById = (captures: OpenCapture[]) => {
  const byId = new Map(captures.map((capture) => [capture.id, capture]));
  return [...byId.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.turnIndex - b.turnIndex,
  );
};

/** Every turn home has loaded once, oldest first, without an outside assistant's; a turn in both sets takes the live snapshot. */
export const selectAllCaptures = createSelector(
  [selectEarlier, selectRecent],
  (earlier, recent): OpenCapture[] => toTurnsById([...earlier, ...recent]),
);

/** Every turn loaded, an outside assistant's included, for a screen that looks one up by id (Activity, a result sheet, a source line). */
export const selectEveryCapture = createSelector(
  [selectEarlierRaw, selectRecentRaw, selectOutside],
  (earlier, recent, outside): OpenCapture[] =>
    toTurnsById([...earlier, ...recent, ...outside]),
);

/** Every turn an outside assistant sent, oldest first. */
export const selectOutsideCaptures = createSelector(
  [selectOutside],
  (outside): OpenCapture[] => toTurnsById(outside),
);

/** Turns not seen yet, newest first. */
export const selectUnseenCaptures = createSelector(
  [selectUnseen],
  (unseen): OpenCapture[] =>
    [...unseen].sort((a, b) => b.createdAt - a.createdAt),
);

const selectWaiting = createSelector(
  [(state: RootState) => state.helm.waitingCaptures.captures],
  toHomeTurns,
);

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

/** Whether "From your assistants" has anything to offer: an outside turn arrived, or an assistant is connected. */
export const selectHasOutsideSource = (state: RootState) =>
  state.helm.outsideCaptures.captures.length > 0 ||
  state.helm.assistants.items.length > 0;
