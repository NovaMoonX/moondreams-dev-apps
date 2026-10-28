import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { buildComingDays } from '@apps/runway/engine/comingDays';
import { resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import type {
  OpenVersion,
  PayLineVersion,
  PlanItemDoc,
  SourceVersion,
} from '@apps/runway/types';

const selectItems = (state: RootState) => state.runway.items;
const selectVersions = (state: RootState) => state.runway.versions;
const selectOn = (_state: RootState, on: number) => on;

export const selectIsPlanItemsLoaded = (state: RootState) =>
  state.runway.isItemsLoaded && state.runway.isVersionsLoaded;

export interface ResolvedPayLine {
  item: PlanItemDoc;
  version: PayLineVersion;
}

export interface ResolvedSource {
  item: PlanItemDoc;
  version: SourceVersion;
  payLines: ResolvedPayLine[];
}

const isPayLine = (version: OpenVersion): version is PayLineVersion =>
  version.kind === 'payLine';
const isSource = (version: OpenVersion): version is SourceVersion =>
  version.kind === 'source';

/** The income in the plan on a date, each source with its pay lines: what is in force then, or the first version that starts later. */
export const selectResolvedPlan = createSelector(
  [selectItems, selectVersions, selectOn],
  (items, versions, on): ResolvedSource[] => {
    const sourceVersions = versions.filter(isSource);
    const payLineVersions = versions.filter(isPayLine);
    const live = [...items]
      .filter((item) => item.archivedAt === null)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

    const result = live
      .filter((item) => item.kind === 'source')
      .flatMap((item) => {
        const version = resolveCurrentOrNext(sourceVersions, item.id, on);
        if (!version) return [];
        const payLines = live
          .filter(
            (line) => line.kind === 'payLine' && line.parentId === item.id,
          )
          .flatMap((line) => {
            const lineVersion = resolveCurrentOrNext(
              payLineVersions,
              line.id,
              on,
            );
            return lineVersion ? [{ item: line, version: lineVersion }] : [];
          });
        return [{ item, version, payLines }];
      });
    return result;
  },
);

/** The income days ahead, computed from schedules each time the plan changes and never stored. */
export const selectComingDays = createSelector(
  [selectItems, selectVersions, selectOn],
  (items, versions, today) => buildComingDays(items, versions, today),
);
