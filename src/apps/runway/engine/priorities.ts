import type { Priority, PriorityExtra } from '@apps/runway/types';

import { ENVELOPE_ORDER_STEP } from '@apps/runway/constants';

import { compareText, TIER_RANK } from './demands';
import type { Draft } from './draft';
import { getExtras } from './parts';
import {
  getVersionStretches,
  type VersionStretch,
  type Versioned,
} from './resolve';

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
  /** How a draft line names this row when it is not the item id: the item and an extra's level. */
  lineKey?: string;
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

/** A row of the funding order: an item's own amount is its id, an extra is the id and its place among the item's extras (1 first). */
export const toPartRowId = (itemId: string, index: number) =>
  index === 0 ? itemId : `${itemId}:${index}`;

export const readPartRowId = (rowId: string) => {
  const [itemId, index] = rowId.split(':');
  return { itemId, index: index === undefined ? 0 : Number(index) };
};

/** How a draft line names the row it funds: its item, or its item and the extra's level. */
export const getPartLineKey = (itemId: string, part?: Priority | null) =>
  (part ?? null) === null ? itemId : `${itemId}@${part}`;

/** An envelope's or goal's extras as rows after its own amount, each with its row id and the key its draft lines carry. */
export function getPartRows<
  T extends {
    priority: Priority;
    orderIndex: number;
    funding: Parameters<typeof getExtras>[0]['funding'];
    extras?: readonly PriorityExtra[] | null;
  },
>(itemId: string, payload: T) {
  const result = getExtras(payload).map((extra, index) => ({
    rowId: toPartRowId(itemId, index + 1),
    lineKey: getPartLineKey(itemId, extra.tier),
    tier: extra.tier,
    orderIndex: extra.orderIndex,
    cents: extra.cents,
  }));
  return result;
}

/**
 * Whether a row may sit in `tier`: an item's parts keep their order (its own amount above its first
 * extra, that above the second), so each sits strictly between its neighbours' levels.
 */
export function canPlacePart(
  rowId: string,
  tier: Priority,
  tierOf: (rowId: string) => Priority | undefined,
): boolean {
  const { itemId, index } = readPartRowId(rowId);
  const rank = TIER_RANK[tier];
  const above =
    index === 0 ? undefined : tierOf(toPartRowId(itemId, index - 1));
  const below = tierOf(toPartRowId(itemId, index + 1));
  return (
    (above === undefined || TIER_RANK[above] < rank) &&
    (below === undefined || rank < TIER_RANK[below])
  );
}

/**
 * The items in funding order by tier, and where one income day's money runs out: above the first
 * item whose own line is short (a pairing's line is not the item's own ask). An item with no line
 * that day sits where its sort key puts it.
 */
export function orderPriorities(
  items: readonly PriorityItem[],
  draft: {
    lines: readonly {
      itemId: string;
      part?: Priority | null;
      shortBy: number;
      pairing: unknown;
    }[];
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
  const position = new Map(
    sorted.map((item, index) => [item.lineKey ?? item.itemId, index]),
  );
  const shortPositions = (draft?.lines ?? [])
    .filter((line) => line.pairing === null && line.shortBy > 0)
    .flatMap(
      (line) => position.get(getPartLineKey(line.itemId, line.part)) ?? [],
    );
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

/** The rank after the highest in a tier across every kind of item and every extra, since they all share one scale. */
export const getNextTierRank = (
  items: readonly {
    version: {
      payload: {
        priority: Priority;
        orderIndex: number;
        extras?: readonly { tier: Priority; orderIndex: number }[] | null;
      };
    };
  }[],
  priority: Priority,
) =>
  Math.max(
    0,
    ...items.flatMap(({ version }) => [
      ...(version.payload.priority === priority
        ? [version.payload.orderIndex]
        : []),
      ...(version.payload.extras ?? [])
        .filter((extra) => extra.tier === priority)
        .map((extra) => extra.orderIndex),
    ]),
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

export interface PriorityMove<P> {
  itemId: string;
  kind: PriorityKind;
  segments: VersionStretch<P>[];
  /** The item's own level and rank; null keeps each segment's. */
  priority: Priority | null;
  orderIndex: number | null;
  /** Extras that moved: the level each is at today, and the level and rank it moves to. */
  extras: { fromTier: Priority; tier: Priority; orderIndex: number }[];
}

/** A segment's payload with a move applied: the item's own level and rank, and each moved extra's. */
export function applyMove<P>(
  payload: P,
  move: Pick<PriorityMove<P>, 'priority' | 'orderIndex' | 'extras'>,
): P {
  const own = payload as P & {
    priority: Priority;
    orderIndex: number;
    funding?: Parameters<typeof getExtras>[0]['funding'];
    extras?: PriorityExtra[] | null;
  };
  const priority = move.priority ?? own.priority;
  const orderIndex = move.orderIndex ?? own.orderIndex;
  if (own.funding === undefined || move.extras.length === 0)
    return { ...own, priority, orderIndex };
  const extras = (own.extras ?? []).map((extra) => {
    const moved = move.extras.find((entry) => entry.fromTier === extra.tier);
    return moved
      ? { ...extra, tier: moved.tier, orderIndex: moved.orderIndex }
      : extra;
  });
  return { ...own, priority, orderIndex, extras };
}

/** What a reorder writes, for the preview and the save alike: one move per item its assignments touch, with one segment per stretch its version covers from `today`. */
export function buildMoves<
  V extends Versioned & { id: string; kind: PriorityKind; payload: unknown },
>(
  assignments: readonly PriorityAssignment[],
  versions: readonly V[],
  today: number,
): PriorityMove<V['payload']>[] {
  const byItem = assignments.reduce((acc, assignment) => {
    const { itemId } = readPartRowId(assignment.itemId);
    return acc.set(itemId, [...(acc.get(itemId) ?? []), assignment]);
  }, new Map<string, PriorityAssignment[]>());
  return [...byItem.entries()].flatMap(([itemId, list]) => {
    const kind = versions.find((version) => version.itemId === itemId)?.kind;
    const segments = getVersionStretches<V, V['payload']>(
      versions,
      itemId,
      today,
    );
    const own = list.find((entry) => entry.itemId === itemId) ?? null;
    const current = segments[0]?.payload as
      Parameters<typeof getExtras>[0] | undefined;
    const currentExtras =
      current?.funding === undefined ? [] : getExtras(current);
    return kind === undefined || segments.length === 0
      ? []
      : [
          {
            itemId,
            kind,
            segments,
            priority: own?.tier ?? null,
            orderIndex: own?.orderIndex ?? null,
            extras: list
              .filter((entry) => entry.itemId !== itemId)
              .flatMap((entry) => {
                const from =
                  currentExtras[readPartRowId(entry.itemId).index - 1];
                return from
                  ? [
                      {
                        fromTier: from.tier,
                        tier: entry.tier,
                        orderIndex: entry.orderIndex,
                      },
                    ]
                  : [];
              }),
          },
        ];
  });
}
