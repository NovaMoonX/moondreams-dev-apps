import type { RootState } from '@/store';
import { buildComingDays } from '@apps/runway/engine/comingDays';
import { type BillProgressInput } from '@apps/runway/engine/progress';
import {
  compareDrafts,
  layerVersion,
  type DayEffect,
} from '@apps/runway/engine/whatIf';
import { MAX_PREVIEW_DAYS } from '@apps/runway/constants';
import { computeDraftView } from '@apps/runway/store/selectors/runwaySelectors';
import type { OpenVersion, Stance } from '@apps/runway/types';

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

export interface PreviewDay {
  dayKey: string;
  on: number;
  title: string;
  /** `changed` moves a day's lines or Free to spend; the others are a day the change adds or takes away. */
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
  virtual: PreviewVersion,
): PreviewDay[] {
  const { items, versions, openDays, stance, today } = inputs;
  const layered = layerVersion<OpenVersion>(versions, virtual);
  const settled = new Set(
    inputs.settledKey === '' ? [] : inputs.settledKey.split(','),
  );
  const daysOf = (source: Slice['versions']) =>
    buildComingDays(items, source, today).filter(
      (day) => !settled.has(day.dayKey),
    );
  const draftOf = (source: Slice['versions'], dayKey: string) =>
    computeDraftView(
      items,
      source,
      stance,
      openDays,
      dayKey,
      today,
      inputs.heldByItem,
      inputs.settledKey,
      inputs.billProgress,
    );
  const union = new Map(
    [...daysOf(versions), ...daysOf(layered)].map((day) => [day.dayKey, day]),
  );
  const ordered = [...union.values()].sort(
    (a, b) =>
      a.on - b.on || (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0),
  );

  const effectOf = (day: (typeof ordered)[number]): PreviewDay[] => {
    const before = draftOf(versions, day.dayKey);
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
