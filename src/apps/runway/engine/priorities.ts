import type { Priority } from '@apps/runway/types';

import { compareText, TIER_RANK } from './demands';
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

/**
 * The new tier and rank of every item a reorder changes. `working` is each tier's movable items in
 * the order the person left them, `moved` the ones they placed. A placed item takes the middle of its
 * neighbours' ranks; when its neighbours share one rank, the run that shares it is spread out again
 * with the placed item inside it, so nothing else moves.
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
  const forced = new Set<string>();
  const valueOf = (id: string) => assigned.get(id) ?? orig(id);

  TIERS.forEach((tier) => {
    const list = working[tier];
    const nextFixed = (from: number) => {
      const found = list.slice(from).find((id) => !moved.has(id));
      return found === undefined ? null : orig(found);
    };
    const walk = (index: number) => {
      if (index >= list.length) return;
      const id = list[index];
      if (!moved.has(id)) return walk(index + 1);
      const prev = index === 0 ? null : valueOf(list[index - 1]);
      const next = nextFixed(index + 1);
      if (prev !== null && next !== null && prev >= next) {
        const isInRun = (at: number) =>
          moved.has(list[at]) || orig(list[at]) === next;
        const reach = (at: number, step: 1 | -1): number =>
          at + step >= 0 && at + step < list.length && isInRun(at + step)
            ? reach(at + step, step)
            : at;
        const start = reach(index, -1);
        const end = reach(index, 1);
        const ranks = spread(
          start === 0 ? null : valueOf(list[start - 1]),
          end === list.length - 1 ? null : orig(list[end + 1]),
          end - start + 1,
        );
        list.slice(start, end + 1).forEach((member, offset) => {
          assigned.set(member, ranks[offset]);
          if (moved.has(member)) forced.add(member);
        });
        return walk(end + 1);
      }
      const isInPlace =
        byId.get(id)?.tier === tier &&
        (prev === null || orig(id) > prev) &&
        (next === null || orig(id) < next);
      assigned.set(id, isInPlace ? orig(id) : placeBetween(prev, next));
      return walk(index + 1);
    };
    walk(0);
  });

  return TIERS.flatMap((tier) =>
    working[tier].flatMap((id) => {
      const item = byId.get(id) as PriorityItem;
      const orderIndex = valueOf(id);
      return item.tier === tier &&
        orderIndex === item.orderIndex &&
        !forced.has(id)
        ? []
        : [{ itemId: id, tier, orderIndex }];
    }),
  );
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
