import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  buildComingDays,
  type ComingDay,
} from '@apps/runway/engine/comingDays';
import { buildDraft, type Draft } from '@apps/runway/engine/draft';
import { hashText } from '@apps/runway/engine/fingerprint';
import { resolve, resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import { LOOKAHEAD_MONTHS, PRIORITIES } from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import type {
  BillVersion,
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

export interface ResolvedBill {
  item: PlanItemDoc;
  version: BillVersion;
}

const isBill = (version: OpenVersion): version is BillVersion =>
  version.kind === 'bill';

/** The bills in the plan on a date, in plan order: Must before Should before Want, then rank, then creation. */
export const selectBills = createSelector(
  [selectItems, selectVersions, selectOn],
  (items, versions, on): ResolvedBill[] => {
    const billVersions = versions.filter(isBill);
    const result = items
      .filter((item) => item.kind === 'bill' && item.archivedAt === null)
      .flatMap((item) => {
        const version = resolveCurrentOrNext(billVersions, item.id, on);
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

export interface DraftView {
  day: ComingDay;
  draft: Draft;
  /** Names and emoji of the envelopes and bills a draft can name, by item id. */
  items: Record<string, { name: string; emoji: string | null }>;
  sourceNames: Record<string, string>;
}

const selectStance = (state: RootState) =>
  state.runway.plan?.stance ?? 'conservative';
const selectDayKey = (_state: RootState, dayKey: string) => dayKey;
const selectToday = (_state: RootState, _dayKey: string, today: number) =>
  today;

const MAX_CACHED_DRAFTS = 24;
const draftCaches = new WeakMap<object, Map<string, DraftView>>();

/**
 * The draft for one coming income day, computed from the plan and never stored. Drafts are kept by a
 * hash of the resolved versions and held against the versions array itself, so an unrelated change
 * returns the same object and a sign-out frees every draft with the plan it came from.
 */
export const selectDraft = createSelector(
  [selectItems, selectVersions, selectStance, selectDayKey, selectToday],
  (items, versions, stance, dayKey, today): DraftView | null => {
    const days = buildComingDays(items, versions, today);
    const day = days.find((entry) => entry.dayKey === dayKey);
    if (!day) return null;

    const resolved = resolve(
      items.filter((item) => item.kind === 'envelope'),
      versions.filter(isEnvelope),
      day.on,
    );
    const resolvedBills = resolve(
      items.filter((item) => item.kind === 'bill'),
      versions.filter(isBill),
      day.on,
    );
    const horizon = addUtcMonths(today, LOOKAHEAD_MONTHS);
    const key = hashText(
      JSON.stringify([
        stance,
        dayKey,
        days.map((entry) => [entry.dayKey, entry.amount]),
        resolved.map(({ version }) => version.id),
        resolvedBills.map(({ version }) => version.id),
        horizon,
      ]),
    );
    const draftCache =
      draftCaches.get(versions) ?? new Map<string, DraftView>();
    draftCaches.set(versions, draftCache);
    const cached = draftCache.get(key);
    if (cached) return cached;

    const envelopes = resolved.map(({ item, version }) => ({
      itemId: item.id,
      createdAt: item.createdAt,
      priority: version.payload.priority,
      orderIndex: version.payload.orderIndex,
      funding: version.payload.funding,
    }));
    const bills = resolvedBills.map(({ item, version }) => ({
      itemId: item.id,
      createdAt: item.createdAt,
      priority: version.payload.priority,
      orderIndex: version.payload.orderIndex,
      amountCents: version.payload.amount.highCents,
      schedule: version.payload.timing.schedule,
      ending: version.payload.ending,
      fundedBy: version.payload.fundedBy,
    }));
    const draft = buildDraft({
      days: [day],
      plan: { envelopes, bills, horizon, incomeDays: days },
      stance,
      overrides: { dayCents: {} },
    });
    const sourceNames = days.reduce<Record<string, string>>(
      (acc, entry) =>
        entry.sourceId !== null && entry.sourceName !== null
          ? { ...acc, [entry.sourceId]: entry.sourceName }
          : acc,
      {},
    );
    const result: DraftView = {
      day,
      draft,
      items: Object.fromEntries(
        [...resolved, ...resolvedBills].map(({ item, version }) => [
          item.id,
          { name: version.payload.name, emoji: version.payload.emoji },
        ]),
      ),
      sourceNames,
    };
    if (draftCache.size >= MAX_CACHED_DRAFTS) draftCache.clear();
    draftCache.set(key, result);
    return result;
  },
);
