import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import type { OpenProcedure } from '@apps/helm/types';

const selectItems = (state: RootState) => state.helm.procedures.items;

/** Procedures, the most recently changed first. */
export const selectProcedures = createSelector([selectItems], (procedures) =>
  [...procedures].sort(
    (left, right) =>
      (right.lastEditedAt ?? right.createdAt) -
      (left.lastEditedAt ?? left.createdAt),
  ),
);

export const selectProcedureById = createSelector(
  [selectItems],
  (procedures): Map<string, OpenProcedure> =>
    new Map(procedures.map((procedure) => [procedure.id, procedure])),
);

export const selectHasProcedures = (state: RootState) =>
  state.helm.procedures.items.length > 0;
