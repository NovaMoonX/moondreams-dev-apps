import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { buildComingDays } from '@apps/runway/engine/comingDays';
import { resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import { PRIORITIES } from '@apps/runway/constants';
import type {
  EnvelopeVersion,
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

export interface ResolvedEnvelope {
  item: PlanItemDoc;
  version: EnvelopeVersion;
}

const isEnvelope = (version: OpenVersion): version is EnvelopeVersion =>
  version.kind === 'envelope';

/** The envelopes in the plan on a date, in plan order: Must before Should before Want, then rank, then creation. */
export const selectEnvelopes = createSelector(
  [selectItems, selectVersions, selectOn],
  (items, versions, on): ResolvedEnvelope[] => {
    const envelopeVersions = versions.filter(isEnvelope);
    const result = items
      .filter((item) => item.kind === 'envelope' && item.archivedAt === null)
      .flatMap((item) => {
        const version = resolveCurrentOrNext(envelopeVersions, item.id, on);
        return version ? [{ item, version }] : [];
      })
      .sort(
        (a, b) =>
          PRIORITIES.indexOf(a.version.payload.priority) -
            PRIORITIES.indexOf(b.version.payload.priority) ||
          a.version.payload.orderIndex - b.version.payload.orderIndex ||
          a.item.createdAt - b.item.createdAt ||
          a.item.id.localeCompare(b.item.id),
      );
    return result;
  },
);
