import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  buildComingDays,
  describeDay,
  type ComingDay,
} from '@apps/runway/engine/comingDays';
import { sumConfirmedByItem } from '@apps/runway/engine/confirm';
import {
  getRecordChain,
  toSplit,
  type EffectiveSplit,
} from '@apps/runway/engine/correct';
import { buildDraft, type Draft } from '@apps/runway/engine/draft';
import {
  collectFunded,
  collectPaid,
  NO_PROGRESS,
  type BillProgressInput,
} from '@apps/runway/engine/progress';
import {
  planBillPayments,
  type BillPayment,
} from '@apps/runway/engine/demands';
import { hashOverride, hashText } from '@apps/runway/engine/fingerprint';
import { resolve, resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import { readStance } from '@apps/runway/engine/stance';
import {
  LOOKAHEAD_MONTHS,
  OVERDUE_DAYS,
  PRIORITIES,
} from '@apps/runway/constants';
import { addUtcMonths, DAY_MS } from '@apps/runway/engine/dates';
import type {
  BillVersion,
  DayOverrideSealed,
  DayStatus,
  OpenDay,
  OpenRecord,
  Pairing,
  EnvelopeVersion,
  GoalVersion,
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

export const selectIsDaysLoaded = (state: RootState) =>
  state.runway.isDaysLoaded;

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

const selectSettledKey = (state: RootState) =>
  state.runway.days
    .filter((day) => day.status !== 'draft')
    .map((day) => day.id)
    .sort()
    .join(',');

const toSet = (key: string) => new Set(key === '' ? [] : key.split(','));

/** The income days ahead, computed from schedules each time the plan changes and never stored. A day that is confirmed or marked not arrived is no longer coming. */
export const selectComingDays = createSelector(
  [selectItems, selectVersions, selectOn, selectSettledKey],
  (items, versions, today, settledKey) => {
    const settled = toSet(settledKey);
    const result = buildComingDays(items, versions, today).filter(
      (day) => !settled.has(day.dayKey),
    );
    return result;
  },
);

/** Days from the last weeks that passed without being confirmed or marked, still waiting for the person. */
const buildOverdueDays = (
  items: RootState['runway']['items'],
  versions: RootState['runway']['versions'],
  today: number,
  settled: ReadonlySet<string>,
) =>
  buildComingDays(items, versions, today, today - OVERDUE_DAYS * DAY_MS).filter(
    (day) => day.on < today && !settled.has(day.dayKey),
  );

export type ListedStatus = 'coming' | DayStatus;

export interface ListedDay extends ComingDay {
  status: ListedStatus;
  isOverdue: boolean;
  arrivedOn: number | null;
}

/**
 * Every income day the Days list shows: the ones still to settle (coming, changed, overdue and not
 * arrived) in date order, and the confirmed ones, newest first.
 */
export const selectListedDays = createSelector(
  [
    selectItems,
    selectVersions,
    selectOn,
    (state: RootState) => state.runway.days,
  ],
  (items, versions, today, openDays) => {
    const byId = new Map(openDays.map((day) => [day.id, day]));
    const settled = toSet(
      openDays
        .filter((day) => day.status !== 'draft')
        .map((day) => day.id)
        .join(','),
    );
    const toListed = (day: ComingDay): ListedDay => {
      const doc = byId.get(day.dayKey);
      return {
        ...day,
        status: doc?.status ?? 'coming',
        isOverdue: day.on < today,
        arrivedOn: doc?.arrivedOn ?? null,
      };
    };
    const waiting = [
      ...buildOverdueDays(items, versions, today, settled),
      ...buildComingDays(items, versions, today).filter(
        (day) => !settled.has(day.dayKey),
      ),
    ].map(toListed);
    const fromDocs = (status: DayStatus, since: number) =>
      openDays
        .filter((doc) => doc.status === status && doc.expectedOn >= since)
        .flatMap((doc) => {
          const described = describeDay(versions, {
            payLineId: doc.payLineId,
            sourceId: doc.sourceId,
            expectedOn: doc.expectedOn,
          });
          return described ? [toListed(described)] : [];
        });
    const notArrived = fromDocs('notArrived', today - OVERDUE_DAYS * DAY_MS);
    const open = [...waiting, ...notArrived].sort(
      (a, b) =>
        a.on - b.on || (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0),
    );
    const confirmed = fromDocs('confirmed', 0).sort(
      (a, b) => b.on - a.on || (a.dayKey < b.dayKey ? -1 : 1),
    );
    return { open, confirmed };
  },
);

/** The confirmed days' ids as one string, or null until the days are read; the records listener restarts when it changes. */
export const selectConfirmedDayIds = (state: RootState): string | null =>
  state.runway.isDaysLoaded
    ? state.runway.days
        .filter((day) => day.status === 'confirmed')
        .map((day) => day.id)
        .sort()
        .join(',')
    : null;

/** True once the records of every confirmed day in the window have been read. */
export const selectIsRecordsReady = (state: RootState) => {
  const ids = selectConfirmedDayIds(state);
  return ids !== null && state.runway.recordsFor === ids;
};

const selectRecords = (state: RootState) => state.runway.records;

/** What confirmed days have already given each plan item, from the records read; a goal's held money. */
export const selectConfirmedByItem = createSelector(
  [selectRecords],
  (records) => sumConfirmedByItem(records),
);

const selectMoves = (state: RootState) => state.runway.moves;
const selectOpenDays = (state: RootState) => state.runway.days;

/** What confirmed days set aside for each item and which payments were marked paid, from the records and moves read. */
export const selectBillProgress = createSelector(
  [selectRecords, selectOpenDays, selectMoves],
  (records, days, moves): Record<string, BillProgressInput> => {
    const funded = collectFunded(
      records,
      new Map(days.map((day) => [day.id, day.expectedOn])),
    );
    const paid = collectPaid(moves);
    const ids = new Set([...Object.keys(funded), ...Object.keys(paid)]);
    const result = Object.fromEntries(
      [...ids].map((id) => [
        id,
        { funded: funded[id] ?? [], paid: paid[id] ?? [] },
      ]),
    );
    return result;
  },
);

export const selectIsMovesLoaded = (state: RootState) =>
  state.runway.isMovesLoaded;

export const selectProposedRecord = (state: RootState, dayId: string) => {
  const result = state.runway.records.find(
    (record): record is Extract<OpenRecord, { kind: 'proposed' }> =>
      record.dayId === dayId && record.kind === 'proposed',
  );
  return result ?? null;
};

export const selectConfirmedRecord = (state: RootState, dayId: string) => {
  const result = state.runway.records.find(
    (record): record is Extract<OpenRecord, { kind: 'confirmed' }> =>
      record.dayId === dayId && record.kind === 'confirmed',
  );
  return result ?? null;
};

const selectChainsByDay = createSelector([selectRecords], (records) => {
  const byDay = records.reduce<Map<string, OpenRecord[]>>((acc, record) => {
    acc.set(record.dayId, [...(acc.get(record.dayId) ?? []), record]);
    return acc;
  }, new Map());
  const result = new Map(
    [...byDay].map(([dayId, group]) => [dayId, getRecordChain(group)]),
  );
  return result;
});

const NO_CHAIN: ReturnType<typeof getRecordChain> = [];

/** A day's confirmed record followed by each correction, oldest first; the last is the split the day stands on. */
export const selectRecordChain = (state: RootState, dayId: string) =>
  selectChainsByDay(state).get(dayId) ?? NO_CHAIN;

const selectSplitsByDay = createSelector([selectChainsByDay], (chains) => {
  const result = new Map(
    [...chains].flatMap(([dayId, chain]) =>
      chain.length === 0 ? [] : [[dayId, toSplit(chain[chain.length - 1])]],
    ),
  );
  return result;
});

/** The split a day stands on now: the latest correction no later one supersedes, else the confirmed record. */
export const selectEffectiveSplit = (
  state: RootState,
  dayId: string,
): EffectiveSplit | null => selectSplitsByDay(state).get(dayId) ?? null;

export const selectOpenDay = (
  state: RootState,
  dayId: string,
): OpenDay | null => state.runway.days.find((day) => day.id === dayId) ?? null;

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

export interface ResolvedGoal {
  item: PlanItemDoc;
  version: GoalVersion;
}

const isGoal = (version: OpenVersion): version is GoalVersion =>
  version.kind === 'goal';

/** The goals in the plan on a date, in plan order: Must before Should before Want, then rank, then creation. */
export const selectGoals = createSelector(
  [selectItems, selectVersions, selectOn],
  (items, versions, on): ResolvedGoal[] => {
    const goalVersions = versions.filter(isGoal);
    const result = items
      .filter((item) => item.kind === 'goal' && item.archivedAt === null)
      .flatMap((item) => {
        const version = resolveCurrentOrNext(goalVersions, item.id, on);
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
  /** What the person changed for this day, or null while the day follows the plan. */
  override: DayOverrideSealed | null;
  /** The set that applies when the day has none of its own: the pay line's, else the source's. */
  inheritedPairings: Pairing[];
  draft: Draft;
  /** Names the plan and changes the draft came from; a record keeps it. */
  fingerprint: string;
  /** Names the day's own changes, which confirming compares against what is stored. */
  overrideFingerprint: string;
  /** Names and emoji of the envelopes, goals and bills a draft can name, by item id. */
  items: Record<string, { name: string; emoji: string | null }>;
  sourceNames: Record<string, string>;
}

/** The plan's stance; an unknown or missing one reads as conservative. */
export const selectStance = (state: RootState) =>
  readStance(state.runway.plan?.stance);
const selectDays = (state: RootState) => state.runway.days;
const selectDayKey = (_state: RootState, dayKey: string) => dayKey;
const selectToday = (_state: RootState, _dayKey: string, today: number) =>
  today;
const selectHeldByItem = (state: RootState) => selectConfirmedByItem(state);

const MAX_CACHED_DRAFTS = 24;
const draftCaches = new WeakMap<object, Map<string, DraftView>>();

/**
 * The draft for one coming income day, computed from the plan and never stored. Drafts are kept by a
 * hash of the resolved versions and held against the versions array itself, so an unrelated change
 * returns the same object and a sign-out frees every draft with the plan it came from.
 */
export const selectDraft = createSelector(
  [
    selectItems,
    selectVersions,
    selectStance,
    selectDays,
    selectDayKey,
    selectToday,
    selectHeldByItem,
    selectSettledKey,
    selectBillProgress,
  ],
  (
    items,
    versions,
    stance,
    openDays,
    dayKey,
    today,
    heldByItem,
    settledKey,
    billProgress,
  ): DraftView | null => {
    const settled = toSet(settledKey);
    const coming = buildComingDays(items, versions, today).filter(
      (entry) => !settled.has(entry.dayKey),
    );
    const day =
      coming.find((entry) => entry.dayKey === dayKey) ??
      buildOverdueDays(items, versions, today, settled).find(
        (entry) => entry.dayKey === dayKey,
      );
    if (!day) return null;
    const days = coming.some((entry) => entry.dayKey === dayKey)
      ? coming
      : [day, ...coming];

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
    const resolvedGoals = resolve(
      items.filter((item) => item.kind === 'goal'),
      versions.filter(isGoal),
      day.on,
    );
    const horizon = addUtcMonths(today, LOOKAHEAD_MONTHS);
    const override =
      openDays.find((entry) => entry.id === dayKey)?.override ?? null;
    const payLinePairings =
      resolveCurrentOrNext(versions.filter(isPayLine), day.payLineId, day.on)
        ?.payload.pairings ?? [];
    const sourcePairings =
      day.sourceId === null
        ? []
        : (resolveCurrentOrNext(versions.filter(isSource), day.sourceId, day.on)
            ?.payload.pairings ?? []);
    const key = hashText(
      JSON.stringify([
        override,
        payLinePairings,
        sourcePairings,
        stance,
        dayKey,
        days.map((entry) => [entry.dayKey, entry.amount, entry.stanceOverride]),
        resolved.map(({ version }) => version.id),
        resolvedBills.map(({ version }) => version.id),
        resolvedGoals.map(({ version }) => version.id),
        resolvedGoals.map(({ item }) => heldByItem[item.id] ?? 0),
        resolvedBills.map(({ item }) => billProgress[item.id] ?? null),
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
      amount: version.payload.amount,
      stanceOverride: version.payload.stanceOverride ?? null,
      schedule: version.payload.timing.schedule,
      ending: version.payload.ending,
      fundedBy: version.payload.fundedBy,
      progress: billProgress[item.id] ?? NO_PROGRESS,
    }));
    const goals = resolvedGoals.map(({ item, version }) => ({
      itemId: item.id,
      createdAt: item.createdAt,
      priority: version.payload.priority,
      orderIndex: version.payload.orderIndex,
      funding: version.payload.funding,
      targetCents: version.payload.targetCents,
      heldCents: heldByItem[item.id] ?? 0,
    }));
    const draft = buildDraft({
      days: [
        {
          ...day,
          pairings: {
            day: override?.pairings ?? null,
            payLine: payLinePairings,
            source: sourcePairings,
          },
        },
      ],
      plan: {
        envelopes,
        bills,
        goals,
        horizon,
        incomeDays: days.map((entry) => ({
          dayKey: entry.dayKey,
          on: entry.on,
          amount: entry.amount,
          stanceOverride: entry.stanceOverride,
        })),
      },
      stance,
      overrides: {
        dayCents: {},
        holdResolutions: Object.fromEntries(
          Object.entries(override?.holdResolutions ?? {}).map(
            ([itemId, choice]) => [`${dayKey}:${itemId}`, choice],
          ),
        ),
      },
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
      override,
      inheritedPairings:
        payLinePairings.length > 0 ? payLinePairings : sourcePairings,
      draft,
      fingerprint: key,
      overrideFingerprint: hashOverride({
        pairings: override?.pairings ?? null,
        holdResolutions: override?.holdResolutions ?? {},
      }),
      items: Object.fromEntries(
        [...resolved, ...resolvedBills, ...resolvedGoals].map(
          ({ item, version }) => [
            item.id,
            { name: version.payload.name, emoji: version.payload.emoji },
          ],
        ),
      ),
      sourceNames,
    };
    if (draftCache.size >= MAX_CACHED_DRAFTS) draftCache.clear();
    draftCache.set(key, result);
    return result;
  },
);

/** Every bill's payments with what has been set aside and what is paid, keyed by bill id; the bills screen and the checklist read the same plan. */
export const selectBillPayments = createSelector(
  [selectBills, selectComingDays, selectStance, selectBillProgress, selectOn],
  (
    bills,
    comingDays,
    stance,
    progress,
    today,
  ): Record<string, BillPayment[]> => {
    const horizon = addUtcMonths(today, LOOKAHEAD_MONTHS);
    const result = Object.fromEntries(
      bills.map(({ item, version }) => {
        const { payload } = version;
        return [
          item.id,
          planBillPayments(
            {
              itemId: item.id,
              createdAt: item.createdAt,
              priority: payload.priority,
              orderIndex: payload.orderIndex,
              amount: payload.amount,
              stanceOverride: payload.stanceOverride ?? null,
              schedule: payload.timing.schedule,
              ending: payload.ending,
              fundedBy: payload.fundedBy,
              progress: progress[item.id] ?? NO_PROGRESS,
            },
            comingDays,
            horizon,
            stance,
          ),
        ];
      }),
    );
    return result;
  },
);
