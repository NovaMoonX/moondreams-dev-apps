import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenCapture } from '@apps/helm/types';

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
