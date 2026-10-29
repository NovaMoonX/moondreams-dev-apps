import type { Priority } from '@apps/runway/types';

import { ENVELOPE_ORDER_STEP } from '@apps/runway/constants';

import { compareText, TIER_RANK } from './demands';
import type { Draft } from './draft';
import { resolveVersion, type Versioned } from './resolve';

export type PriorityKind = 'bill' | 'envelope' | 'goal';

/** One bill, envelope or goal as the funding order sees it. */
export interface PriorityItem {
  itemId: string;
  kind: PriorityKind;
  tier: Priority;
  orderIndex: number;
  createdAt: number;
  /** Asks for whatever is left, so it is funded last in its tier. */
  isRest: boolean;
  /** Its next payment is due before the pay after the next one, so the engine funds it first in its tier. */
  isDueFirst: boolean;
}

export interface PrioritySection {
  tier: Priority;
  items: PriorityItem[];
  /** Where the tier's first item sits in the whole list. */
  start: number;
}

export interface PriorityOrder {
  sections: PrioritySection[];
  /** The money runs out above this position in the whole list; null when no item is short. */
  cutIndex: number | null;
}

/** The funding order of the engine's `compareDemands`, for items rather than one day's demands. */
export const comparePriorityItems = (a: PriorityItem, b: PriorityItem) =>
  TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
  Number(a.isRest) - Number(b.isRest) ||
  Number(b.isDueFirst) - Number(a.isDueFirst) ||
  a.orderIndex - b.orderIndex ||
  a.createdAt - b.createdAt ||
  compareText(a.itemId, b.itemId);

const TIERS: readonly Priority[] = ['must', 'should', 'want'];

/**
 * The items in funding order by tier, and where one income day's money runs out: above the first
 * item whose own line is short (a pairing's line is not the item's own ask). An item with no line
 * that day sits where its sort key puts it.
 */
export function orderPriorities(
  items: readonly PriorityItem[],
  draft: {
    lines: readonly { itemId: string; shortBy: number; pairing: unknown }[];
  } | null,
): PriorityOrder {
  const sorted = [...items].sort(comparePriorityItems);
  const sections = TIERS.reduce<PrioritySection[]>((acc, tier) => {
    const last = acc.at(-1);
    const start = last ? last.start + last.items.length : 0;
    return [
      ...acc,
      { tier, items: sorted.filter((item) => item.tier === tier), start },
    ];
  }, []);
  const position = new Map(sorted.map((item, index) => [item.itemId, index]));
  const shortPositions = (draft?.lines ?? [])
    .filter((line) => line.pairing === null && line.shortBy > 0)
    .flatMap((line) => position.get(line.itemId) ?? []);
  return {
    sections,
    cutIndex: shortPositions.length === 0 ? null : Math.min(...shortPositions),
  };
}

/** A rank between two neighbours; a missing neighbour is the end of the tier. */
export function placeBetween(prev: number | null, next: number | null) {
  if (prev !== null && next !== null) return (prev + next) / 2;
  if (prev !== null) return prev + 1;
  if (next !== null) return next - 1;
  return 1;
}

/** `count` ranks strictly between two bounds, evenly; an open bound steps by one. */
const spread = (lower: number | null, upper: number | null, count: number) =>
  Array.from({ length: count }, (_, index) => {
    if (lower !== null && upper !== null)
      return lower + ((upper - lower) * (index + 1)) / (count + 1);
    if (lower !== null) return lower + index + 1;
    if (upper !== null) return upper - (count - index);
    return index + 1;
  });

export interface PriorityAssignment {
  itemId: string;
  tier: Priority;
  orderIndex: number;
}

/** Whether the person can place the item: one funded first (a bill due before the next pay) or last (what is left) holds its place whatever its rank. */
export const isMovable = (item: PriorityItem) =>
  !item.isDueFirst && !item.isRest;

/**
 * The reorder working copy against the plan as it is now. `snapshot` is each tier's movable ids as the
 * person left them; an id that is gone or no longer movable drops out, an unplaced item whose tier changed
 * elsewhere leaves its old tier, and a movable item the snapshot never saw goes unmoved at the end of its tier.
 */
export function reconcileWorking(
  snapshot: Readonly<Record<Priority, readonly string[]>>,
  sections: readonly PrioritySection[],
  moved: ReadonlySet<string>,
): Record<Priority, string[]> {
  const live = new Map(
    sections
      .flatMap((section) => section.items)
      .filter(isMovable)
      .map((item) => [item.itemId, item]),
  );
  const kept = Object.fromEntries(
    TIERS.map((tier) => [
      tier,
      snapshot[tier].filter((id) => {
        const item = live.get(id);
        return item !== undefined && (moved.has(id) || item.tier === tier);
      }),
    ]),
  ) as Record<Priority, string[]>;
  const placed = new Set(Object.values(kept).flat());
  return Object.fromEntries(
    TIERS.map((tier) => [
      tier,
      [
        ...kept[tier],
        ...(sections.find((section) => section.tier === tier)?.items ?? [])
          .filter((item) => isMovable(item) && !placed.has(item.itemId))
          .map((item) => item.itemId),
      ],
    ]),
  ) as Record<Priority, string[]>;
}

/**
 * The new tier and rank of every item a reorder changes. `working` is each tier's movable items in
 * the order the person left them, `moved` the ones they placed. A placed item takes the middle of its
 * neighbours' ranks. When its neighbours share a rank, it keeps that rank if the engine's tie-breaks
 * already put it between them; otherwise only the smaller side of the tied run is ranked again, the
 * placed item beside it. An item that was not placed is written only when a tie moves its rank.
 */
export function planReorder(
  original: readonly PrioritySection[],
  working: Readonly<Record<Priority, readonly string[]>>,
  moved: ReadonlySet<string>,
): PriorityAssignment[] {
  const byId = new Map(
    original
      .flatMap((section) => section.items)
      .map((item) => [item.itemId, item]),
  );
  const orig = (id: string) => (byId.get(id) as PriorityItem).orderIndex;
  const assigned = new Map<string, number>();
  const valueOf = (id: string) => assigned.get(id) ?? orig(id);
  const listOf = (tier: Priority) =>
    working[tier].filter(
      (id) => byId.has(id) && isMovable(byId.get(id) as PriorityItem),
    );

  TIERS.forEach((tier) => {
    const list = listOf(tier);
    const asRanked = (id: string, orderIndex: number): PriorityItem => ({
      ...(byId.get(id) as PriorityItem),
      tier,
      orderIndex,
    });
    const firstUnmoved = (from: number) =>
      list.findIndex((id, at) => at >= from && !moved.has(id));
    const lastMoved = (from: number): number =>
      from + 1 < list.length && moved.has(list[from + 1])
        ? lastMoved(from + 1)
        : from;
    const runEnd = (from: number, rank: number): number =>
      from < list.length && (moved.has(list[from]) || orig(list[from]) === rank)
        ? runEnd(from + 1, rank)
        : from;
    const runStart = (from: number, rank: number): number =>
      from >= 0 && !moved.has(list[from]) && orig(list[from]) === rank
        ? runStart(from - 1, rank)
        : from;
    const place = (ids: string[], ranks: number[]) =>
      ids.forEach((id, at) => assigned.set(id, ranks[at]));

    const settleTie = (
      index: number,
      prev: number | null,
      next: number,
    ): number => {
      const groupEnd = lastMoved(index);
      const group = list.slice(index, groupEnd + 1);
      const chain = [
        ...(index === 0
          ? []
          : [asRanked(list[index - 1], valueOf(list[index - 1]))]),
        ...group.map((id) => asRanked(id, next)),
        asRanked(list[groupEnd + 1], next),
      ];
      const isOrdered = chain.every(
        (item, at) => at === 0 || comparePriorityItems(chain[at - 1], item) < 0,
      );
      if (prev === next && isOrdered) {
        place(
          group,
          group.map(() => next),
        );
        return groupEnd + 1;
      }
      const before = prev === next ? runStart(index - 1, next) : index - 1;
      const left = list.slice(before + 1, index);
      const afterEnd = runEnd(groupEnd + 1, next);
      const right = list.slice(groupEnd + 1, afterEnd);
      if (prev === next && left.length <= right.length) {
        const ids = [...left, ...group];
        place(
          ids,
          spread(before < 0 ? null : valueOf(list[before]), next, ids.length),
        );
        return groupEnd + 1;
      }
      const ids = [...group, ...right];
      place(
        ids,
        spread(
          prev,
          afterEnd < list.length ? orig(list[afterEnd]) : null,
          ids.length,
        ),
      );
      return afterEnd;
    };

    const walk = (index: number): void => {
      if (index >= list.length) return;
      const id = list[index];
      if (!moved.has(id) || assigned.has(id)) return walk(index + 1);
      const prev = index === 0 ? null : valueOf(list[index - 1]);
      const nextAt = firstUnmoved(index + 1);
      const next = nextAt < 0 ? null : orig(list[nextAt]);
      const isInPlace =
        byId.get(id)?.tier === tier &&
        (prev === null || orig(id) > prev) &&
        (next === null || orig(id) < next);
      if (isInPlace) {
        assigned.set(id, orig(id));
        return walk(index + 1);
      }
      const middle = placeBetween(prev, next);
      const hasRoom =
        prev === null || next === null || (prev < middle && middle < next);
      if (hasRoom) {
        assigned.set(id, middle);
        return walk(index + 1);
      }
      return walk(settleTie(index, prev, next as number));
    };
    walk(0);
  });

  return TIERS.flatMap((tier) =>
    listOf(tier).flatMap((id) => {
      const item = byId.get(id) as PriorityItem;
      const orderIndex = valueOf(id);
      if (moved.has(id)) {
        return item.tier === tier && orderIndex === item.orderIndex
          ? []
          : [{ itemId: id, tier, orderIndex }];
      }
      return orderIndex === item.orderIndex
        ? []
        : [{ itemId: id, tier: item.tier, orderIndex }];
    }),
  );
}

/** The rank after the highest in a tier across every kind of item, since bills, envelopes and goals share one scale. */
export const getNextTierRank = (
  items: readonly {
    version: { payload: { priority: Priority; orderIndex: number } };
  }[],
  priority: Priority,
) =>
  Math.max(
    0,
    ...items
      .filter(({ version }) => version.payload.priority === priority)
      .map(({ version }) => version.payload.orderIndex),
  ) + ENVELOPE_ORDER_STEP;

/** Whether a bill's own line on a short day is due before the next income day after it; null when the bill has no such line that day. */
export function isDueBeforeNext(
  draft: Pick<Draft, 'lines'>,
  itemId: string,
  nextOn: number,
): boolean | null {
  const line = draft.lines.find(
    (entry) =>
      entry.itemId === itemId && entry.pairing === null && entry.bill !== null,
  );
  return line?.bill ? line.bill.dueOn < nextOn : null;
}

export interface RankSegment<P> {
  payload: P;
  effectiveFrom: number;
  effectiveUntil: number | null;
}

/**
 * The stretches from `today` on over which an item's resolved version stays the same, each with that
 * version's payload. A new rank is written once per stretch, so a stretch change or a change ahead keeps
 * its amounts and its dates; an item with one version in force is one stretch.
 */
export function getRankSegments<
  V extends Versioned & { id: string; payload: P },
  P,
>(versions: readonly V[], itemId: string, today: number): RankSegment<P>[] {
  const own = versions.filter((version) => version.itemId === itemId);
  const breaks = [
    ...new Set([
      today,
      ...own.flatMap((version) =>
        [version.effectiveFrom, version.effectiveUntil].filter(
          (on): on is number => on !== null && on > today,
        ),
      ),
    ]),
  ].sort((a, b) => a - b);
  const stretches = breaks.map((on, index) => ({
    version: resolveVersion(own, itemId, on),
    effectiveFrom: on,
    effectiveUntil: breaks[index + 1] ?? null,
  }));
  const merged = stretches.reduce<typeof stretches>((acc, stretch) => {
    const last = acc[acc.length - 1];
    if (last && last.version?.id === stretch.version?.id) {
      return [
        ...acc.slice(0, -1),
        { ...last, effectiveUntil: stretch.effectiveUntil },
      ];
    }
    return [...acc, stretch];
  }, []);
  return merged.flatMap(({ version, effectiveFrom, effectiveUntil }) =>
    version
      ? [{ payload: version.payload, effectiveFrom, effectiveUntil }]
      : [],
  );
}

export interface PriorityMove<P> {
  itemId: string;
  kind: PriorityKind;
  segments: RankSegment<P>[];
  priority: Priority;
  orderIndex: number;
}

/** What a reorder writes, for the preview and the save alike: every assignment with one segment per stretch its item's version covers from `today`. */
export function buildMoves<
  V extends Versioned & { id: string; kind: PriorityKind; payload: unknown },
>(
  assignments: readonly PriorityAssignment[],
  versions: readonly V[],
  today: number,
): PriorityMove<V['payload']>[] {
  return assignments.flatMap((assignment) => {
    const kind = versions.find(
      (version) => version.itemId === assignment.itemId,
    )?.kind;
    const segments = getRankSegments<V, V['payload']>(
      versions,
      assignment.itemId,
      today,
    );
    return kind === undefined || segments.length === 0
      ? []
      : [
          {
            itemId: assignment.itemId,
            kind,
            segments,
            priority: assignment.tier,
            orderIndex: assignment.orderIndex,
          },
        ];
  });
}
