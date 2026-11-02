import type { RootState } from '@/store';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import {
  buildComingDays,
  getOneTimePayLineIds,
} from '@apps/runway/engine/comingDays';
import {
  planOverrideCarry,
  type OverrideCarry,
} from '@apps/runway/engine/moved';
import { type BillProgressInput } from '@apps/runway/engine/progress';
import {
  compareDrafts,
  WHAT_IF_VERSION_ID,
  layerVersion,
  type DayEffect,
} from '@apps/runway/engine/whatIf';
import { MAX_PREVIEW_DAYS, LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { addUtcMonths, payLineIdOfDayKey } from '@apps/runway/engine/dates';
import {
  getFixedByBill,
  withFundedBy,
  previewBillShare,
  type BillShareEffect,
} from '@apps/runway/engine/billShare';
import { capEnding } from '@apps/runway/engine/endings';
import {
  planBillPayments,
  type DraftBillInput,
} from '@apps/runway/engine/demands';
import { NO_PROGRESS } from '@apps/runway/engine/progress';
import {
  getVersionStretches,
  resolveCurrentOrNext,
} from '@apps/runway/engine/resolve';
import { selectLookahead } from '@apps/runway/store/selectors/lookaheadSelectors';
import {
  computeDraftView,
  type DraftView,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { ComingDay } from '@apps/runway/engine/comingDays';
import type {
  BillFundedBy,
  BillSealed,
  BillVersion,
  EnvelopeSealed,
  GoalSealed,
  OpenDay,
  OpenVersion,
  Stance,
} from '@apps/runway/types';

type Slice = RootState['runway'];

export interface PreviewInputs {
  items: Slice['items'];
  versions: Slice['versions'];
  openDays: Slice['days'];
  stance: Stance;
  today: number;
  heldByItem: Record<string, number>;
  settledKey: string;
  billProgress: Record<string, BillProgressInput>;
}

export type PreviewVersion = Parameters<typeof layerVersion<OpenVersion>>[1];

/** What is layered over the real plan to see its effect: a version, an item that ends or is archived, or one income day's own payload. */
export type PreviewChange =
  | { kind: 'version'; version: PreviewVersion; unpin?: PreviewUnpin }
  | { kind: 'versions'; versions: PreviewVersion[]; unpin?: PreviewUnpin }
  | { kind: 'end'; itemId: string; endedAt: number }
  | { kind: 'archive'; itemId: string; archivedAt: number }
  | {
      kind: 'day';
      day: Pick<ComingDay, 'dayKey' | 'payLineId' | 'sourceId' | 'on'>;
      itemId: string;
      payload: EnvelopeSealed | GoalSealed;
    }
  | {
      kind: 'dayBill';
      day: Pick<ComingDay, 'dayKey' | 'payLineId' | 'sourceId' | 'on'>;
      billId: string;
      cents: number;
    };

const layerDay = (
  openDays: Slice['days'],
  change: Extract<PreviewChange, { kind: 'day' | 'dayBill' }>,
): OpenDay[] => {
  const { day } = change;
  const existing = openDays.find((entry) => entry.id === day.dayKey);
  const base: OpenDay = existing ?? {
    id: day.dayKey,
    payLineId: day.payLineId,
    sourceId: day.sourceId,
    expectedOn: day.on,
    arrivedOn: null,
    confirmedAt: null,
    status: 'draft',
    doneLineIds: [],
    override: {
      pairings: null,
      holdResolutions: {},
      payloads: {},
      billCents: {},
    },
  };
  const layered: OpenDay = {
    ...base,
    override:
      change.kind === 'day'
        ? {
            ...base.override,
            payloads: {
              ...base.override.payloads,
              [change.itemId]: change.payload,
            },
          }
        : {
            ...base.override,
            billCents: {
              ...base.override.billCents,
              [change.billId]: change.cents,
            },
          },
  };
  return [...openDays.filter((entry) => entry.id !== day.dayKey), layered];
};

/** The open days without the figures set for one bill, as a change that replaces them would leave them. */
/** Which days' figures for one bill a change replaces: from the day it starts, up to where a temporary one ends. */
export interface PreviewUnpin {
  billId: string;
  from: number;
  until: number | null;
}

const unpin = (openDays: Slice['days'], scope: PreviewUnpin | undefined) =>
  scope === undefined
    ? openDays
    : openDays.map((entry) =>
        Object.hasOwn(entry.override.billCents ?? {}, scope.billId) &&
        entry.expectedOn >= scope.from &&
        (scope.until === null || entry.expectedOn < scope.until)
          ? {
              ...entry,
              override: {
                ...entry.override,
                billCents: Object.fromEntries(
                  Object.entries(entry.override.billCents).filter(
                    ([id]) => id !== scope.billId,
                  ),
                ),
              },
            }
          : entry,
      );

const layerPlan = (
  inputs: Pick<PreviewInputs, 'items' | 'versions' | 'openDays'>,
  change: PreviewChange,
) => {
  const { items, versions, openDays } = inputs;
  if (change.kind === 'version') {
    return {
      items,
      versions: layerVersion<OpenVersion>(versions, change.version),
      openDays: unpin(openDays, change.unpin),
    };
  }
  if (change.kind === 'versions') {
    return {
      items,
      versions: [
        ...versions,
        ...change.versions.map((version, index) => ({
          ...layerVersion<OpenVersion>([], version)[0],
          id: `${WHAT_IF_VERSION_ID}-${index}`,
        })),
      ],
      openDays: unpin(openDays, change.unpin),
    };
  }
  if (change.kind === 'end') {
    return {
      items: items.map((item) =>
        item.id === change.itemId ? { ...item, endedAt: change.endedAt } : item,
      ),
      versions,
      openDays,
    };
  }
  if (change.kind === 'archive') {
    return {
      items: items.map((item) =>
        item.id === change.itemId
          ? { ...item, archivedAt: change.archivedAt }
          : item,
      ),
      versions,
      openDays,
    };
  }
  return { items, versions, openDays: layerDay(openDays, change) };
};

export interface PreviewDay {
  dayKey: string;
  on: number;
  title: string;
  /** `changed` moves a day's lines or Free to Spend; the others are a day the change adds or takes away. */
  kind: 'changed' | 'added' | 'removed';
  effect: DayEffect;
  /** Names for the lines, by item id. */
  names: Record<string, { name: string; emoji: string | null }>;
}

const emptyEffect = (
  moneyCents: number,
  freeCents: number,
  side: 'before' | 'after',
): DayEffect => ({
  freeBeforeCents: side === 'before' ? freeCents : 0,
  freeAfterCents: side === 'after' ? freeCents : 0,
  moneyBeforeCents: side === 'before' ? moneyCents : 0,
  moneyAfterCents: side === 'after' ? moneyCents : 0,
  lines: [],
});

/**
 * Each upcoming income day the change moves, from the engine run on the real plan and again with the
 * change layered over it. The saved result is the same computation over the saved version.
 */
export function previewChange(
  inputs: PreviewInputs,
  change: PreviewChange,
): PreviewDay[] {
  const { items, versions, openDays, stance, today } = inputs;
  const layered = layerPlan(inputs, change);
  const settled = new Set(
    inputs.settledKey === '' ? [] : inputs.settledKey.split(','),
  );
  const daysOf = (source: {
    items: Slice['items'];
    versions: Slice['versions'];
  }) =>
    buildComingDays(source.items, source.versions, today).filter(
      (day) => !settled.has(day.dayKey),
    );
  const draftOf = (source: typeof layered, dayKey: string) =>
    computeDraftView(
      source.items,
      source.versions,
      stance,
      source.openDays,
      dayKey,
      today,
      inputs.heldByItem,
      inputs.settledKey,
      inputs.billProgress,
    );
  const real = { items, versions, openDays };
  const union = new Map(
    [...daysOf(real), ...daysOf(layered)].map((day) => [day.dayKey, day]),
  );
  const ordered = [...union.values()].sort(
    (a, b) =>
      a.on - b.on || (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0),
  );

  const effectOf = (day: (typeof ordered)[number]): PreviewDay[] => {
    const before = draftOf(real, day.dayKey);
    const after = draftOf(layered, day.dayKey);
    const title = day.sourceName ?? day.payLineName;
    const names = { ...before?.items, ...after?.items };
    if (before && after) {
      const effect = compareDrafts(before.draft, after.draft);
      return effect
        ? [
            {
              dayKey: day.dayKey,
              on: day.on,
              title,
              kind: 'changed',
              effect,
              names,
            },
          ]
        : [];
    }
    if (after) {
      return [
        {
          dayKey: day.dayKey,
          on: day.on,
          title,
          kind: 'added',
          effect: emptyEffect(
            after.draft.moneyCents,
            after.draft.freeToSpend.cents,
            'after',
          ),
          names,
        },
      ];
    }
    if (before) {
      return [
        {
          dayKey: day.dayKey,
          on: day.on,
          title,
          kind: 'removed',
          effect: emptyEffect(
            before.draft.moneyCents,
            before.draft.freeToSpend.cents,
            'before',
          ),
          names,
        },
      ];
    }
    return [];
  };
  // A change far ahead moves no early day, so the walk goes on until enough moved days are found.
  const collect = (start: number, found: PreviewDay[]): PreviewDay[] => {
    if (found.length >= MAX_PREVIEW_DAYS || start >= ordered.length)
      return found.slice(0, MAX_PREVIEW_DAYS);
    const chunk = ordered.slice(start, start + MAX_PREVIEW_DAYS);
    return collect(start + chunk.length, [
      ...found,
      ...chunk.flatMap(effectOf),
    ]);
  };
  const result = collect(0, []);
  return result;
}

/** How far the plan holds as it stands and with the change layered over it, from the same lookahead Home reads. */
export function previewLookahead(
  state: RootState,
  today: number,
  change: PreviewChange,
): { before: Lookahead; after: Lookahead } {
  const { items, versions, openDays } = layerPlan(
    {
      items: state.runway.items,
      versions: state.runway.versions,
      openDays: state.runway.days,
    },
    change,
  );
  const layeredState = {
    ...state,
    runway: { ...state.runway, items, versions, days: openDays },
  };
  const result = {
    before: selectLookahead(state, today),
    after: selectLookahead(layeredState, today),
  };
  return result;
}

/** Where the days the person changed for themselves go when a change moves their payday; nothing moves for any other change. */
export function previewOverrideCarry(
  inputs: Pick<
    PreviewInputs,
    'items' | 'versions' | 'openDays' | 'today' | 'settledKey'
  >,
  change: PreviewChange,
): OverrideCarry {
  if (change.kind !== 'version' || change.version.kind !== 'payLine') {
    return { carried: [], stranded: [] };
  }
  const { items, versions, openDays, today } = inputs;
  const settled = new Set(
    inputs.settledKey === '' ? [] : inputs.settledKey.split(','),
  );
  const daysOf = (source: readonly OpenVersion[]) =>
    buildComingDays(items, source, today).filter(
      (day) => !settled.has(day.dayKey),
    );
  const result = planOverrideCarry(
    openDays,
    daysOf(versions),
    daysOf(layerVersion<OpenVersion>(versions, change.version)),
  );
  return result;
}

export interface BillShareView {
  share: BillShareEffect;
  /** The bill's own line on each pay in the payment's window, as the day screens draw it, before and after. */
  rows: {
    dayKey: string;
    on: number;
    beforeCents: number;
    afterCents: number;
    isPinned: boolean;
  }[];
  /** Other items whose lines move, one entry per pay. */
  others: {
    itemId: string;
    dayKey: string;
    on: number;
    name: string;
    beforeCents: number;
    afterCents: number;
  }[];
  /** What the pay leaves after its lines, as it is and with the change. */
  leftBeforeCents: number;
  leftAfterCents: number;
  /** What the pay brings in all. */
  dayMoneyCents: number;
  /** What the pay has left for this bill after the lines drawn before it. */
  availableCents: number;
  /** Whether a Paid from rule would give every payment to the horizon exactly one pay to come from. */
  isRuleClean: (rule: Extract<BillFundedBy, { kind: 'pay' }>) => boolean;
}

const beforeCache = new WeakMap<
  object,
  { deps: unknown[]; drafts: Map<string, DraftView | null> }
>();

/** The day drafts as they are now, kept while the plan they were drawn from is the same, so typing a figure redraws only the layered ones. */
const getBeforeDrafts = (
  inputs: PreviewInputs,
  draftOf: (source: Slice['days'], dayKey: string) => DraftView | null,
) => {
  const deps = [
    inputs.items,
    inputs.versions,
    inputs.stance,
    inputs.today,
    inputs.heldByItem,
    inputs.settledKey,
    inputs.billProgress,
  ];
  const known = beforeCache.get(inputs.openDays);
  const entry =
    known && known.deps.every((value, index) => value === deps[index])
      ? known
      : { deps, drafts: new Map<string, DraftView | null>() };
  beforeCache.set(inputs.openDays, entry);
  return (dayKey: string) => {
    if (!entry.drafts.has(dayKey)) {
      entry.drafts.set(dayKey, draftOf(inputs.openDays, dayKey));
    }
    return entry.drafts.get(dayKey) ?? null;
  };
};

/** What setting one pay's share of a bill to `cents` does: each pay of the payment's window as its day screen draws it (the same drafts, before and after), the other items that move and the pay's own leftover. Null when the pay is not in a payment's window. */
export function previewBillShareView(
  inputs: PreviewInputs,
  change: Extract<PreviewChange, { kind: 'dayBill' }>,
): BillShareView | null {
  const { items, versions, openDays, stance, today } = inputs;
  const { day, billId, cents } = change;
  const settled = new Set(
    inputs.settledKey === '' ? [] : inputs.settledKey.split(','),
  );
  const coming = buildComingDays(items, versions, today).filter(
    (entry) => !settled.has(entry.dayKey),
  );
  const item = items.find((entry) => entry.id === billId);
  const version = resolveCurrentOrNext(
    versions.filter((entry) => entry.kind === 'bill'),
    billId,
    day.on,
  );
  if (!item || !version || version.kind !== 'bill') return null;
  const { payload } = version;
  const fixed = getFixedByBill(openDays).get(billId);
  const billInput: DraftBillInput = {
    itemId: item.id,
    createdAt: item.createdAt,
    priority: payload.priority,
    orderIndex: payload.orderIndex,
    amount: payload.amount,
    stanceOverride: payload.stanceOverride ?? null,
    schedule: payload.timing.schedule,
    ending: capEnding(payload.ending, item.endedAt),
    fundedBy: payload.fundedBy,
    fixed,
    oneTimePayLineIds: getOneTimePayLineIds(versions),
    progress: inputs.billProgress[billId] ?? NO_PROGRESS,
  };
  const horizon = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const share = previewBillShare(
    billInput,
    coming,
    horizon,
    stance,
    day.dayKey,
    cents,
    { today },
  );
  if (!share) return null;
  const layered = layerDay(openDays, { ...change, cents: share.cents });
  const draftOf = (source: Slice['days'], dayKey: string) =>
    computeDraftView(
      items,
      versions,
      stance,
      source,
      dayKey,
      today,
      inputs.heldByItem,
      inputs.settledKey,
      inputs.billProgress,
      { isCached: false, coming },
    );
  const beforeOf = getBeforeDrafts(inputs, draftOf);
  const pairs = share.window.map((entry) => ({
    entry,
    before: beforeOf(entry.dayKey),
    after: draftOf(layered, entry.dayKey),
  }));
  const billLine = (view: DraftView | null) =>
    view?.draft.lines.find((line) => line.itemId === billId) ?? null;
  const billCents = (view: DraftView | null) => billLine(view)?.cents ?? 0;
  const rows = pairs
    .map(({ entry, before, after }) => ({
      dayKey: entry.dayKey,
      on: entry.on,
      beforeCents: billCents(before),
      afterCents: billCents(after),
      isPinned:
        entry.dayKey !== day.dayKey &&
        Boolean(fixed?.[entry.dayKey] !== undefined),
    }))
    .filter(
      (row) => row.dayKey === day.dayKey || row.beforeCents !== row.afterCents,
    );
  const others = pairs
    .flatMap(({ entry, before, after }) =>
      before && after
        ? (compareDrafts(before.draft, after.draft)?.lines ?? [])
            .filter((line) => line.itemId !== billId)
            .map((line) => ({
              itemId: line.itemId,
              dayKey: entry.dayKey,
              on: entry.on,
              name: after.items[line.itemId]?.name ?? '',
              beforeCents: line.beforeCents,
              afterCents: line.afterCents,
            }))
        : [],
    )
    .filter((entry) => entry.name !== '');
  const own = pairs.find(({ entry }) => entry.dayKey === day.dayKey);
  const afterSum = pairs.reduce((sum, { after }) => sum + billCents(after), 0);
  const ownLines = own?.before?.draft.lines ?? [];
  const ownIndex = ownLines.findIndex((line) => line.itemId === billId);
  const earlier = (
    ownIndex === -1 ? ownLines : ownLines.slice(0, ownIndex)
  ).reduce((sum, line) => sum + line.cents, 0);
  const result: BillShareView = {
    share: { ...share, shortCents: Math.max(0, share.maxCents - afterSum) },
    rows,
    others,
    dayMoneyCents: own?.before?.draft.moneyCents ?? 0,
    availableCents:
      ownIndex === -1
        ? (own?.before?.draft.freeToSpend.cents ?? 0)
        : Math.max(0, (own?.before?.draft.moneyCents ?? 0) - earlier),
    leftBeforeCents: own?.before?.draft.freeToSpend.cents ?? 0,
    leftAfterCents: own?.after?.draft.freeToSpend.cents ?? 0,
    isRuleClean: (rule) => {
      const plan = (fundedBy: BillFundedBy) =>
        planBillPayments(
          { ...billInput, fundedBy, fixed: undefined },
          coming,
          horizon,
          stance,
          { today },
        );
      const spread = plan({ kind: 'suggested' });
      const oneTime = billInput.oneTimePayLineIds;
      const applicable = plan(rule)
        .map((payment, index) => ({ payment, index }))
        .filter(
          ({ payment, index }) =>
            payment.paid === null &&
            payment.dueOn >= today &&
            (spread[index]?.parts ?? []).some(
              (part) => !oneTime?.has(payLineIdOfDayKey(part.day.dayKey)),
            ),
        );
      if (
        applicable.length === 0 ||
        !applicable.every(({ payment }) => payment.parts.length === 1)
      ) {
        return false;
      }
      const first = applicable[0].payment.parts[0].day;
      const ruled = layerPlan(
        { items, versions, openDays },
        {
          kind: 'versions',
          versions: withFundedBy(
            getVersionStretches<BillVersion, BillSealed>(
              versions.filter(
                (entry): entry is BillVersion => entry.kind === 'bill',
              ),
              billId,
              today,
            ),
            rule,
          ).map(
            (stretch) =>
              ({
                itemId: billId,
                kind: 'bill',
                effectiveFrom: stretch.effectiveFrom,
                effectiveUntil: stretch.effectiveUntil,
                changeId: 'what-if',
                payload: stretch.payload,
              }) as PreviewVersion,
          ),
          unpin: { billId, from: today, until: null },
        },
      );
      const drafted = computeDraftView(
        ruled.items,
        ruled.versions,
        stance,
        ruled.openDays,
        first.dayKey,
        today,
        inputs.heldByItem,
        inputs.settledKey,
        inputs.billProgress,
        { isCached: false, coming },
      )?.draft.lines.find((line) => line.itemId === billId);
      return !drafted || drafted.shortBy === 0;
    },
  };
  return result;
}
