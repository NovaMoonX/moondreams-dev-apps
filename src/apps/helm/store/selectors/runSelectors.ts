import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenRun } from '@apps/helm/types';

const selectItems = (state: RootState) => state.helm.openRuns.items;

/** Runs still going, the most recently started first. */
export const selectOpenRuns = createSelector([selectItems], (runs) =>
  [...runs].sort((left, right) => right.startedAt - left.startedAt),
);

export const selectOpenRunById = createSelector(
  [selectOpenRuns],
  (runs): Map<string, OpenRun> => new Map(runs.map((run) => [run.id, run])),
);

/** The runs among `runs` that are for one project, trip or event. */
export const getRunsAttachedTo = (runs: OpenRun[], attachedId: string) =>
  runs.filter((run) => run.attachedTo?.id === attachedId);
