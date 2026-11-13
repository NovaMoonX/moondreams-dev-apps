import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenRun, RunAttachment } from '@apps/helm/types';

const selectItems = (state: RootState) => state.helm.openRuns.items;

/** Runs still going, the most recently started first. */
export const selectOpenRuns = createSelector([selectItems], (runs) =>
  [...runs].sort((left, right) => right.startedAt - left.startedAt),
);

export const selectOpenRunById = createSelector(
  [selectOpenRuns],
  (runs): Map<string, OpenRun> => new Map(runs.map((run) => [run.id, run])),
);

/** The runs among `runs` that are for one project, trip or event, whichever of its copies' ids they name. */
export const getRunsAttachedTo = (runs: OpenRun[], attachedIds: string[]) =>
  runs.filter(
    (run) => run.attachedTo !== null && attachedIds.includes(run.attachedTo.id),
  );

/** The open run of one procedure for the same thing (any of its copies' ids), or an open run of it that is for nothing when `attachment` is null. */
export const findOpenRunFor = (
  runs: OpenRun[],
  procedureId: string,
  attachment: RunAttachment,
  alsoIds: string[] = [],
) =>
  runs.find(
    (run) =>
      run.procedureId === procedureId &&
      (attachment === null
        ? run.attachedTo === null
        : run.attachedTo !== null &&
          [attachment.id, ...alsoIds].includes(run.attachedTo.id)),
  ) ?? null;
