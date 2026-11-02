import type { RootState } from '@/store';
import type { Lookahead } from '@apps/runway/engine/lookahead';
import { buildComingDays } from '@apps/runway/engine/comingDays';
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
import { MAX_PREVIEW_DAYS } from '@apps/runway/constants';
import { selectLookahead } from '@apps/runway/store/selectors/lookaheadSelectors';
import { computeDraftView } from '@apps/runway/store/selectors/runwaySelectors';
import type { ComingDay } from '@apps/runway/engine/comingDays';
import type {
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
  | { kind: 'version'; version: PreviewVersion }
  | { kind: 'versions'; versions: PreviewVersion[] }
  | { kind: 'end'; itemId: string; endedAt: number }
  | { kind: 'archive'; itemId: string; archivedAt: number }
  | {
      kind: 'day';
      day: Pick<ComingDay, 'dayKey' | 'payLineId' | 'sourceId' | 'on'>;
      itemId: string;
      payload: EnvelopeSealed | GoalSealed;
    };

const layerDay = (
  openDays: Slice['days'],
  change: Extract<PreviewChange, { kind: 'day' }>,
): OpenDay[] => {
  const { day, itemId, payload } = change;
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
    override: { pairings: null, holdResolutions: {}, payloads: {} },
  };
  const layered: OpenDay = {
    ...base,
    override: {
      ...base.override,
      payloads: { ...base.override.payloads, [itemId]: payload },
    },
  };
  return [...openDays.filter((entry) => entry.id !== day.dayKey), layered];
};

const layerPlan = (
  inputs: Pick<PreviewInputs, 'items' | 'versions' | 'openDays'>,
  change: PreviewChange,
) => {
  const { items, versions, openDays } = inputs;
  if (change.kind === 'version') {
    return {
      items,
      versions: layerVersion<OpenVersion>(versions, change.version),
      openDays,
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
      openDays,
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
  const written =
    change.kind === 'version'
      ? [change.version]
      : change.kind === 'versions'
        ? change.versions
        : [];
  if (
    written.length === 0 ||
    written.some((entry) => entry.kind !== 'payLine')
  ) {
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
    daysOf(layerPlan({ items, versions, openDays }, change).versions),
  );
  return result;
}
