import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import {
  buildComingDays,
  describeDay,
  type ComingDay,
} from '@apps/runway/engine/comingDays';
import {
  deriveBillProgress,
  deriveHeldByItem,
} from '@apps/runway/engine/closings';
import {
  selectClosingBase,
  selectIsWindowLoaded,
  selectRecentFrom,
} from '@apps/runway/store/selectors/historySelectors';
import {
  getRecordChain,
  toSplit,
  type EffectiveSplit,
} from '@apps/runway/engine/correct';
import { getEarliestPeriodStart } from '@apps/runway/engine/calendar';
import { buildDraft, type Draft } from '@apps/runway/engine/draft';
import {
  NO_PROGRESS,
  type BillProgressInput,
} from '@apps/runway/engine/progress';
import {
  planBillPayments,
  type BillPayment,
} from '@apps/runway/engine/demands';
import { resolveItemEmoji } from '@apps/runway/utils/purposeEmoji';
import { hashOverride, hashText } from '@apps/runway/engine/fingerprint';
import { capEnding, findReachedEnding } from '@apps/runway/engine/endings';
import { findReturning } from '@apps/runway/engine/stretch';
import {
  resolve,
  resolveCurrentOrNext,
  resolveVersion,
} from '@apps/runway/engine/resolve';
import { readStance } from '@apps/runway/engine/stance';
import {
  LOOKAHEAD_MONTHS,
  OVERDUE_DAYS,
  PRIORITIES,
} from '@apps/runway/constants';
import { addUtcMonths, DAY_MS, toDayKey } from '@apps/runway/engine/dates';
import type {
  BillVersion,
  DayOverrideSealed,
  DayStatus,
  OpenDay,
  OpenRecord,
  Pairing,
  EnvelopeSealed,
  EnvelopeVersion,
  FundingAmount,
  FundingRule,
  GoalSealed,
  GoalVersion,
  GroupVersion,
  OpenVersion,
  PayLineVersion,
  PlanItemDoc,
  SourceVersion,
  Stance,
} from '@apps/runway/types';

const selectItems = (state: RootState) => state.runway.items;

/** On the lists on `on`: not archived and not ended before it. An older day still resolves what has since gone. */
const isListed = (item: PlanItemDoc, on: number) =>
  (item.archivedAt === null || on < item.archivedAt) &&
  (item.endedAt === null || on <= item.endedAt);
const selectVersions = (state: RootState) => state.runway.versions;
const selectOn = (_state: RootState, on: number) => on;

/** Every item the plan has had, by the name on its newest version, in name order. */
export const selectItemNames = createSelector([selectVersions], (versions) => {
  const newest = versions.reduce<Map<string, OpenVersion>>((acc, version) => {
    const seen = acc.get(version.itemId);
    return seen && seen.createdAt >= version.createdAt
      ? acc
      : acc.set(version.itemId, version);
  }, new Map());
  const result = [...newest.values()]
    .map((version) => ({ id: version.itemId, name: version.payload.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return result;
});

export const selectIsPlanItemsLoaded = (state: RootState) =>
  state.runway.isItemsLoaded && state.runway.isVersionsLoaded;

export const selectIsDaysLoaded = (state: RootState) => {
  const from = selectRecentFrom(state);
  return from !== null && state.runway.daysFrom === from;
};

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
      .filter((item) => isListed(item, on))
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

export interface PairedBy {
  sourceName: string;
  amount: FundingAmount;
}

/** For each bill, envelope or goal a pairing names, the sources that send it money and how much: a pairing replaces the item's own rule on that source's income days. */
export const selectPairedBy = createSelector(
  [selectResolvedPlan],
  (plan): Record<string, PairedBy[]> => {
    const entries = plan.flatMap(({ version, payLines }) => {
      const sets = payLines.map(({ version: line }) =>
        line.payload.pairings.length > 0
          ? line.payload.pairings
          : version.payload.pairings,
      );
      const used = sets.length > 0 ? sets : [version.payload.pairings];
      return used.flatMap((pairings) =>
        pairings.map((pairing) => ({
          targetItemId: pairing.targetItemId,
          sourceName: version.payload.name,
          amount: pairing.amount,
        })),
      );
    });
    const result = entries.reduce<Record<string, PairedBy[]>>(
      (acc, { targetItemId, sourceName, amount }) => {
        const own = acc[targetItemId] ?? [];
        const key = JSON.stringify([sourceName, amount]);
        const isSeen = own.some(
          (entry) => JSON.stringify([entry.sourceName, entry.amount]) === key,
        );
        return isSeen
          ? acc
          : { ...acc, [targetItemId]: [...own, { sourceName, amount }] };
      },
      {},
    );
    return result;
  },
);

export const selectSettledKey = (state: RootState) =>
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

/** The confirmed days of the older month Days has open, newest first. Read-only and never summed into a balance. */
export const selectHistoryListedDays = createSelector(
  [selectVersions, selectOn, (state: RootState) => state.runway.historyDays],
  (versions, today, historyDays): ListedDay[] =>
    historyDays
      .filter((doc) => doc.status === 'confirmed')
      .flatMap((doc) => {
        const described = describeDay(versions, {
          payLineId: doc.payLineId,
          sourceId: doc.sourceId,
          expectedOn: doc.expectedOn,
        });
        return described
          ? [
              {
                ...described,
                status: doc.status,
                isOverdue: described.on < today,
                arrivedOn: doc.arrivedOn ?? null,
              },
            ]
          : [];
      })
      .sort((a, b) => b.on - a.on || (a.dayKey < b.dayKey ? -1 : 1)),
);

/** The confirmed days' ids as one string, or null until the days are read; the records listener restarts when it changes. */
export const selectConfirmedDayIds = (state: RootState): string | null =>
  selectIsDaysLoaded(state)
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

const selectMoves = (state: RootState) => state.runway.moves;
const selectStartDate = (state: RootState) =>
  state.runway.plan?.startDate ?? null;

const selectOpenDays = (state: RootState) => state.runway.days;

/** The records a starting amount does not already include: those of days whose money arrived on or after the starting day. */
const selectRecordsSinceStart = createSelector(
  [selectRecords, selectOpenDays, selectStartDate],
  (records, days, startDate) => {
    if (startDate === null) return records;
    const arrivedOn = new Map(
      days.map((day) => [day.id, day.arrivedOn ?? day.expectedOn]),
    );
    return records.filter(
      (record) => (arrivedOn.get(record.dayId) ?? 0) >= startDate,
    );
  },
);

/** What each plan item holds from the ledger: its starting amount plus what confirmed days gave it; a goal's held money. */
export const selectHeldByItem = createSelector(
  [selectRecordsSinceStart, selectMoves, selectStartDate, selectClosingBase],
  deriveHeldByItem,
);
/** What confirmed days set aside for each item and which payments were marked paid, from the records and moves read. */
export const selectBillProgress = createSelector(
  [
    selectRecordsSinceStart,
    selectOpenDays,
    selectMoves,
    selectStartDate,
    selectClosingBase,
  ],
  (
    records,
    days,
    moves,
    startDate,
    closing,
  ): Record<string, BillProgressInput> =>
    deriveBillProgress(
      records,
      new Map(days.map((day) => [day.id, day.expectedOn])),
      moves,
      startDate,
      closing,
    ),
);

/** The ledger the balances are summed from is read: the moves and the purchases of the window that follows the closing, and the cards that say which starting amounts are debts. */
export const selectIsMovesLoaded = (state: RootState) =>
  selectIsWindowLoaded(state) && state.runway.isCardsLoaded;

const selectHistoryRecords = (state: RootState) => state.runway.historyRecords;

/** A day's records are found in the recent window first, then in the older month Days has open; the balances never read the older ones. */
const findRecord = <Kind extends OpenRecord['kind']>(
  state: RootState,
  dayId: string,
  kind: Kind,
) => {
  const matches = (
    record: OpenRecord,
  ): record is Extract<OpenRecord, { kind: Kind }> =>
    record.dayId === dayId && record.kind === kind;
  return (
    state.runway.records.find(matches) ??
    state.runway.historyRecords.find(matches) ??
    null
  );
};

export const selectProposedRecord = (state: RootState, dayId: string) =>
  findRecord(state, dayId, 'proposed');

export const selectConfirmedRecord = (state: RootState, dayId: string) =>
  findRecord(state, dayId, 'confirmed');

const toChainsByDay = (records: readonly OpenRecord[]) => {
  const byDay = records.reduce<Map<string, OpenRecord[]>>((acc, record) => {
    acc.set(record.dayId, [...(acc.get(record.dayId) ?? []), record]);
    return acc;
  }, new Map());
  const result = new Map(
    [...byDay].map(([dayId, group]) => [dayId, getRecordChain(group)]),
  );
  return result;
};

const selectChainsByDay = createSelector([selectRecords], toChainsByDay);
const selectHistoryChainsByDay = createSelector(
  [selectHistoryRecords],
  toChainsByDay,
);

const NO_CHAIN: ReturnType<typeof getRecordChain> = [];

/** A day's confirmed record followed by each correction, oldest first; the last is the split the day stands on. */
export const selectRecordChain = (state: RootState, dayId: string) =>
  selectChainsByDay(state).get(dayId) ??
  selectHistoryChainsByDay(state).get(dayId) ??
  NO_CHAIN;

const toSplitsByDay = (chains: ReturnType<typeof toChainsByDay>) => {
  const result = new Map(
    [...chains].flatMap(([dayId, chain]) =>
      chain.length === 0 ? [] : [[dayId, toSplit(chain[chain.length - 1])]],
    ),
  );
  return result;
};

const selectSplitsByDay = createSelector([selectChainsByDay], toSplitsByDay);
const selectHistorySplitsByDay = createSelector(
  [selectHistoryChainsByDay],
  toSplitsByDay,
);

/** The split a day stands on now: the latest correction no later one supersedes, else the confirmed record. */
export const selectEffectiveSplit = (
  state: RootState,
  dayId: string,
): EffectiveSplit | null =>
  selectSplitsByDay(state).get(dayId) ??
  selectHistorySplitsByDay(state).get(dayId) ??
  null;

/** A day of the recent window, else one of the older month Days has open. */
export const selectOpenDay = (
  state: RootState,
  dayId: string,
): OpenDay | null =>
  state.runway.days.find((day) => day.id === dayId) ??
  state.runway.historyDays.find((day) => day.id === dayId) ??
  null;

/** True once the days and the records of the older month Days has open are read. */
export const selectIsHistoryReady = (state: RootState, key: string) => {
  const ids = state.runway.historyDays
    .filter((day) => day.status === 'confirmed')
    .map((day) => day.id)
    .sort()
    .join(',');
  return (
    state.runway.historyFor === key && state.runway.historyRecordsFor === ids
  );
};

/** The date a day key names (its `yyyymmdd` stamp), as UTC midnight. */
const getDayKeyDate = (dayKey: string) => {
  const stamp = dayKey.slice(-8);
  return Date.UTC(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)),
  );
};

/** True when the key names a day before the recent window, which is read on demand and only looked at. */
export const selectIsDayOlderThanRecent = (
  state: RootState,
  dayKey: string,
) => {
  const recentFrom = selectRecentFrom(state);
  return recentFrom !== null && getDayKeyDate(dayKey) < recentFrom;
};

/** True for a day inside the recent window, the only days a correction is offered for. */
export const selectIsDayCorrectable = (state: RootState, dayKey: string) => {
  const recentFrom = selectRecentFrom(state);
  const day = selectOpenDay(state, dayKey);
  return recentFrom !== null && day !== null && day.expectedOn >= recentFrom;
};

/** The records of a day are read: the recent window's, or the older month's when the day is one of its days. */
export const selectIsDayRecordsReady = (state: RootState, dayKey: string) =>
  state.runway.historyDays.some((day) => day.id === dayKey)
    ? selectIsHistoryReady(state, state.runway.historyFor ?? '')
    : selectIsRecordsReady(state);

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
      .filter((item) => item.kind === 'envelope' && isListed(item, on))
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
      .filter((item) => item.kind === 'bill' && isListed(item, on))
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

export interface ResolvedGroup {
  item: PlanItemDoc;
  version: GroupVersion;
}

const isGroup = (version: OpenVersion): version is GroupVersion =>
  version.kind === 'group';

/** The groups on the Bills list on a date, by name; an archived group is gone and its bills list without one. */
export const selectGroups = createSelector(
  [selectItems, selectVersions, selectOn],
  (items, versions, on): ResolvedGroup[] => {
    const groupVersions = versions.filter(isGroup);
    const result = items
      .filter((item) => item.kind === 'group' && isListed(item, on))
      .flatMap((item) => {
        const version = resolveCurrentOrNext(groupVersions, item.id, on);
        return version ? [{ item, version }] : [];
      })
      .sort(
        (a, b) =>
          a.version.payload.name.localeCompare(b.version.payload.name) ||
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
      .filter((item) => item.kind === 'goal' && isListed(item, on))
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

const progressHashes = new WeakMap<object, string>();

/** Names what a bill's confirmed days and payments say, once per progress object: a draft's key then reads a short name for each bill, not the lists behind it. */
const hashProgress = (progress: BillProgressInput | undefined) => {
  if (!progress) return '';
  const known = progressHashes.get(progress);
  if (known !== undefined) return known;
  const result = hashText(JSON.stringify(progress));
  progressHashes.set(progress, result);
  return result;
};

const MAX_CACHED_DRAFTS = 24;
const draftCaches = new WeakMap<object, Map<string, DraftView>>();

const priorDayCaches = new WeakMap<object, Map<string, ComingDay[]>>();

/** The income days before the ones listed that fall in the first period of a calendar rule, which take their share of a period's amount first; none when no rule is on the calendar. */
export function getPriorDays(
  items: RootState['runway']['items'],
  versions: RootState['runway']['versions'],
  today: number,
  days: readonly { dayKey: string; on: number }[],
  fundings: readonly FundingRule[],
): ComingDay[] {
  if (days.length === 0) return [];
  const firstOn = days.reduce(
    (first, day) => Math.min(first, day.on),
    Infinity,
  );
  const from = getEarliestPeriodStart(fundings, firstOn);
  if (from === null) return [];
  const cache = priorDayCaches.get(versions) ?? new Map<string, ComingDay[]>();
  priorDayCaches.set(versions, cache);
  const cacheKey = `${today}:${from}`;
  const generated =
    cache.get(cacheKey) ?? buildComingDays(items, versions, today, from);
  cache.set(cacheKey, generated);
  const listed = new Set(days.map((day) => day.dayKey));
  const result = generated.filter((day) => !listed.has(day.dayKey));
  return result;
}

export interface DraftViewOptions {
  /** The coming days when the caller already has them, so a walk over many days builds them once. */
  coming?: readonly ComingDay[];
  /** False for a draft that is used once and not kept, such as one step of a lookahead. */
  isCached?: boolean;
}

export function computeDraftView(
  items: RootState['runway']['items'],
  versions: RootState['runway']['versions'],
  stance: Stance,
  openDays: RootState['runway']['days'],
  dayKey: string,
  today: number,
  heldByItem: Record<string, number>,
  settledKey: string,
  billProgress: Record<string, BillProgressInput>,
  options: DraftViewOptions = {},
): DraftView | null {
  const settled = toSet(settledKey);
  const coming =
    options.coming ??
    buildComingDays(items, versions, today).filter(
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
  ).filter(({ version }) => (version.payload.state ?? 'active') === 'active');
  const horizon = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const override =
    openDays.find((entry) => entry.id === dayKey)?.override ?? null;
  const dayPayloads = override?.payloads ?? {};
  const previousOn = days.reduce(
    (latest, entry) =>
      entry.on < day.on ? Math.max(latest, entry.on) : latest,
    day.on - OVERDUE_DAYS * DAY_MS,
  );
  const returning = findReturning(
    versions,
    [...resolved, ...resolvedGoals].map(({ item }) => item.id),
    day.on,
    previousOn,
  );
  const payLinePairings =
    resolveCurrentOrNext(versions.filter(isPayLine), day.payLineId, day.on)
      ?.payload.pairings ?? [];
  const sourcePairings =
    day.sourceId === null
      ? []
      : (resolveCurrentOrNext(versions.filter(isSource), day.sourceId, day.on)
          ?.payload.pairings ?? []);
  const priorDays = getPriorDays(
    items,
    versions,
    today,
    days,
    [...resolved, ...resolvedGoals]
      .map(({ version }) => version.payload.funding)
      .concat(Object.values(dayPayloads).map((payload) => payload.funding)),
  );
  const isCached = options.isCached ?? true;
  const key = !isCached
    ? ''
    : hashText(
        JSON.stringify([
          override,
          payLinePairings,
          sourcePairings,
          stance,
          dayKey,
          days.map((entry) => [
            entry.dayKey,
            entry.amount,
            entry.stanceOverride,
          ]),
          resolved.map(({ version }) => version.id),
          resolvedBills.map(({ version }) => version.id),
          resolvedGoals.map(({ version }) => version.id),
          resolvedGoals.map(({ item }) => heldByItem[item.id] ?? 0),
          [...returning].sort(),
          hashText(priorDays.map((entry) => entry.dayKey).join(',')),
          resolvedBills.map(({ item }) => [
            item.endedAt,
            hashProgress(billProgress[item.id]),
          ]),
          horizon,
        ]),
      );
  const draftCache = draftCaches.get(versions) ?? new Map<string, DraftView>();
  if (isCached) draftCaches.set(versions, draftCache);
  const cached = isCached ? draftCache.get(key) : undefined;
  if (cached) return cached;

  const payloadOf = <P extends EnvelopeSealed | GoalSealed>(
    itemId: string,
    own: P,
  ): P =>
    Object.hasOwn(dayPayloads, itemId) ? (dayPayloads[itemId] as P) : own;
  const envelopes = resolved.map(({ item, version }) => {
    const payload = payloadOf(item.id, version.payload);
    return {
      itemId: item.id,
      createdAt: item.createdAt,
      priority: payload.priority,
      orderIndex: payload.orderIndex,
      funding: payload.funding,
    };
  });
  const bills = resolvedBills.map(({ item, version }) => ({
    itemId: item.id,
    createdAt: item.createdAt,
    priority: version.payload.priority,
    orderIndex: version.payload.orderIndex,
    amount: version.payload.amount,
    stanceOverride: version.payload.stanceOverride ?? null,
    schedule: version.payload.timing.schedule,
    ending: capEnding(version.payload.ending, item.endedAt),
    fundedBy: version.payload.fundedBy,
    progress: billProgress[item.id] ?? NO_PROGRESS,
  }));
  const goals = resolvedGoals.map(({ item, version }) => {
    const payload = payloadOf(item.id, version.payload);
    return {
      itemId: item.id,
      createdAt: item.createdAt,
      priority: payload.priority,
      orderIndex: payload.orderIndex,
      funding: payload.funding,
      targetCents: version.payload.targetCents,
      heldCents: heldByItem[item.id] ?? 0,
    };
  });
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
      returns: [...returning].map((itemId) => `${dayKey}:${itemId}`),
      incomeDays: days.map((entry) => ({
        dayKey: entry.dayKey,
        on: entry.on,
        amount: entry.amount,
        stanceOverride: entry.stanceOverride,
        sourceId: entry.sourceId,
      })),
      priorIncomeDays: priorDays,
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
      payloads: override?.payloads,
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
  if (!isCached) return result;
  if (draftCache.size >= MAX_CACHED_DRAFTS) draftCache.clear();
  draftCache.set(key, result);
  return result;
}

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
  computeDraftView,
);

/** Every bill's payments with what has been set aside and what is paid, keyed by bill id; the bills screen and the checklist read the same plan. */
export const selectBillPayments = createSelector(
  [
    selectBills,
    selectComingDays,
    selectStance,
    selectBillProgress,
    selectOn,
    selectStartDate,
  ],
  (
    bills,
    comingDays,
    stance,
    progress,
    today,
    startDate,
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
              ending: capEnding(payload.ending, item.endedAt),
              fundedBy: payload.fundedBy,
              progress: progress[item.id] ?? NO_PROGRESS,
            },
            comingDays,
            horizon,
            stance,
            { today, startDate },
          ),
        ];
      }),
    );
    return result;
  },
);

const CHANGEABLE_KINDS = new Set(['envelope', 'goal', 'bill']);
const changeableCache = new WeakMap<object, ReadonlySet<string>>();

/** The ids of the envelopes, goals and bills a draft line can open to change; one set per items array. */
export const selectChangeableKey = (state: RootState): ReadonlySet<string> => {
  const items = state.runway.items;
  const cached = changeableCache.get(items);
  if (cached) return cached;
  const result = new Set(
    items
      .filter((item) => CHANGEABLE_KINDS.has(item.kind))
      .map((item) => item.id),
  );
  changeableCache.set(items, result);
  return result;
};

/** Whether the plan has an income source that is still paying: the one thing every other screen waits for. */
export const selectHasIncome = (state: RootState, today: number) =>
  state.runway.items.some(
    (item) =>
      item.kind === 'payLine' &&
      item.archivedAt === null &&
      (item.endedAt === null || item.endedAt >= today),
  );

/** Whether the plan has ever had an income source, ended or archived included: a first run has none, and every screen but Home waits for one. */
export const selectHasEverHadIncome = (state: RootState) =>
  state.runway.items.some((item) => item.kind === 'payLine');

/** The pay lines whose ending has been reached and whose header is not yet marked ended, as JSON of `[itemId, lastDay, name]` rows ('' when none), so a consumer re-runs only when the set changes. */
export const selectReachedEndingsKey = (state: RootState, today: number) => {
  const { items, versions, days } = state.runway;
  const confirmed = new Set(
    days.filter((day) => day.status === 'confirmed').map((day) => day.id),
  );
  const candidates = items.filter(
    (item) =>
      item.kind === 'payLine' &&
      item.endedAt === null &&
      item.archivedAt === null,
  );
  const payLineVersions =
    candidates.length === 0 ? [] : versions.filter(isPayLine);
  const rows = candidates.flatMap((item) => {
    const own = payLineVersions.filter((v) => v.itemId === item.id);
    const version =
      resolveVersion(own, item.id, today) ??
      [...own].sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];
    if (!version || own.some((entry) => entry.effectiveFrom > today)) return [];
    const last = findReachedEnding(
      version.payload.schedule,
      version.payload.ending,
      today,
      (on) => confirmed.has(toDayKey(item.id, on)),
    );
    return last === null ? [] : [[item.id, last, version.payload.name]];
  });
  const result = rows.length === 0 ? '' : JSON.stringify(rows);
  return result;
};

/** Each purpose's newest emoji and whether it is archived, as one string, so the maps below only rebuild when one of those changes. */
const selectPurposeEmojiKey = createSelector(
  [selectItems, selectVersions],
  (items, versions): string => {
    const archived = new Map(
      items
        .filter((item) => item.kind === 'group')
        .map((item) => [item.id, item.archivedAt !== null] as const),
    );
    const newest = versions
      .filter(isGroup)
      .reduce<Map<string, GroupVersion>>((acc, version) => {
        const seen = acc.get(version.itemId);
        return seen && seen.createdAt >= version.createdAt
          ? acc
          : acc.set(version.itemId, version);
      }, new Map());
    const entries = [...newest.entries()]
      .flatMap(([id, { payload }]) =>
        payload.emoji === null || !archived.has(id)
          ? []
          : [[id, payload.emoji, archived.get(id)] as const],
      )
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    return JSON.stringify(entries);
  },
);

const readPurposeEmojiKey = (key: string) =>
  JSON.parse(key) as [string, string, boolean][];

/** The emoji each live purpose has chosen, by id, for lists of live items; a purpose without one, or archived, is absent. */
export const selectPurposeEmojis = createSelector(
  [selectPurposeEmojiKey],
  (key): ReadonlyMap<string, string> =>
    new Map(
      readPurposeEmojiKey(key).flatMap(([id, emoji, isArchived]) =>
        isArchived ? [] : [[id, emoji] as const],
      ),
    ),
);

/** The emoji every purpose has chosen, archived ones too, so history keeps the look it had. */
export const selectAllPurposeEmojis = createSelector(
  [selectPurposeEmojiKey],
  (key): ReadonlyMap<string, string> =>
    new Map(readPurposeEmojiKey(key).map(([id, emoji]) => [id, emoji])),
);

/** Every item's name and emoji by id, from its newest version (a bill's or envelope's own emoji, else its purpose's), so a purchase still names an envelope that was renamed or archived. */
export const selectItemLooks = createSelector(
  [selectVersions, selectAllPurposeEmojis],
  (versions, purposeEmojis) => {
    const newest = versions.reduce<Map<string, OpenVersion>>((acc, version) => {
      const seen = acc.get(version.itemId);
      return seen && seen.createdAt >= version.createdAt
        ? acc
        : acc.set(version.itemId, version);
    }, new Map());
    const result = new Map(
      [...newest.entries()].map(([id, version]) => [
        id,
        {
          name: version.payload.name,
          emoji: resolveItemEmoji(
            'emoji' in version.payload ? version.payload.emoji : null,
            'groupId' in version.payload ? version.payload.groupId : null,
            purposeEmojis,
          ),
        },
      ]),
    );
    return result;
  },
);

const selectPurchases = (state: RootState) => state.runway.purchases;
const selectPeriodPurchases = (state: RootState) =>
  state.runway.periodPurchases;

/** The recent window's purchases and those of the period Spend is showing, newest day first and, within a day, the last one added first. */
export const selectSpendPurchases = createSelector(
  [selectPurchases, selectPeriodPurchases],
  (purchases, periodPurchases) => {
    const known = new Set(purchases.map((purchase) => purchase.id));
    const result = [
      ...purchases,
      ...periodPurchases.filter((purchase) => !known.has(purchase.id)),
    ].sort(
      (a, b) =>
        b.date - a.date ||
        b.createdAt - a.createdAt ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    return result;
  },
);

const selectCardList = (state: RootState) => state.runway.cards;

/** Every card, archived ones too, oldest first. */
export const selectAllCards = createSelector([selectCardList], (cards) =>
  [...cards].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  ),
);

const selectExpenseList = (state: RootState) => state.runway.expenses;

/** Every expense group, most recently updated first. */
export const selectExpenses = createSelector([selectExpenseList], (expenses) =>
  [...expenses].sort(
    (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
  ),
);

/** The cards that can take a new charge, oldest first. */
export const selectCards = createSelector([selectAllCards], (cards) =>
  cards.filter((card) => card.archivedAt === null),
);
