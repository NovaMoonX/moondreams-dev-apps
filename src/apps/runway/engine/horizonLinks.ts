import type { DateOnly, HorizonLink, HorizonSealed } from '@apps/runway/types';

import { DAY_MS } from './dates';
import { isSameValue, resolveVersion, type Versioned } from './resolve';
import { occurrences } from './schedule';

type LinkVersion = Versioned & {
  id: string;
  changeId: string;
  kind?: string;
  payload?: unknown;
};

/** What a linked or coming change is: a version that changes an item, the day an item stops, or the day an item starts taking money. */
export type LinkKind = 'change' | 'stop' | 'start';

/** The id of the change entry an item's ending writes; a link with this id and the item's id points at the item's last day, not at a version. */
export const getEndChangeId = (itemId: string) => `ended_${itemId}`;

/** Whether a link points at an item's ending. */
export const isStopLink = (link: HorizonLink) =>
  link.changeId === getEndChangeId(link.itemId);

const isIdleStart = (version: LinkVersion) => {
  const payload = version.payload as
    { funding?: { cadence?: { kind?: string } } } | undefined;
  return (
    (version.kind === 'envelope' || version.kind === 'goal') &&
    payload?.funding?.cadence?.kind === 'none'
  );
};

/** Whether `version` is where an envelope or goal that began asking for nothing starts taking money: it replaces the item's first version. A new one that starts later is written this way, so the lists show it before it starts. */
export const isStartingVersion = <V extends LinkVersion>(
  own: readonly V[],
  version: V,
  before: V | null,
) =>
  before !== null &&
  isIdleStart(before) &&
  !isIdleStart(version) &&
  !own.some(({ createdAt }) => createdAt < before.createdAt);

/** The first day a version's item has money to give or take: a bill's first due day, otherwise the day the version starts. */
export function getFirstMoneyDay(version: LinkVersion): DateOnly {
  const payload = version.payload as
    | {
        timing?: { schedule?: Parameters<typeof occurrences>[0] };
        ending?: Parameters<typeof occurrences>[1];
      }
    | undefined;
  const schedule = payload?.timing?.schedule;
  if (version.kind !== 'bill' || !schedule || !payload?.ending)
    return version.effectiveFrom;
  return (
    occurrences(
      schedule,
      payload.ending,
      version.effectiveFrom,
      version.effectiveFrom + 800 * DAY_MS,
    )[0] ?? version.effectiveFrom
  );
}

/** A change to an item that has not started: the version that starts on `on`, the one it replaces, and whether it is the earlier version coming back after a stretch. A stop is the day after the item's last day, with the version in force on that last day as both versions. */
export interface ComingChange<V> {
  kind: LinkKind;
  /** The id a link to it carries: the version's change, or `ended_<itemId>` for a stop. */
  changeId: string;
  on: DateOnly;
  version: V;
  before: V;
  isReturn: boolean;
}

/** Whether a coming change or linked span can still be cancelled: it has not started, and a stretch's return is not a change of its own. */
export const canCancelChange = (
  change: { on: DateOnly; isReturn?: boolean } | { startsOn: DateOnly },
  today: DateOnly,
) =>
  !('isReturn' in change && change.isReturn === true) &&
  ('on' in change ? change.on : change.startsOn) > today;

/** One stretch of a cancelled change's days, with what was in force there before the change was made. */
export interface CancelSegment {
  kind: string | undefined;
  payload: unknown;
  effectiveFrom: DateOnly;
  effectiveUntil: DateOnly | null;
}

/** What cancelling a coming change writes: history is append-only, so a version change is cancelled by new versions that restore, over each of its days, what held before it; `versionIds` are the versions being superseded, which the write re-reads. An end is cancelled by clearing the header's `endedAt`. */
export type CancelTarget =
  | {
      kind: 'versions';
      versionIds: string[];
      startsOn: DateOnly;
      segments: CancelSegment[];
    }
  | { kind: 'stop'; startsOn: DateOnly };

/** The id of the change entry an ending writes: `ended_<itemId>`, or with `now` added once that id is taken (an ending that was cancelled, then made again), since an entry is never overwritten. */
export const getEndEntryId = (itemId: string, isTaken: boolean, now: number) =>
  isTaken ? `${getEndChangeId(itemId)}_${now}` : getEndChangeId(itemId);

const winsAnywhere = <V extends LinkVersion>(
  own: readonly V[],
  itemId: string,
  made: readonly V[],
  changeId: string,
) =>
  made.some((version) =>
    [
      version.effectiveFrom,
      ...own.flatMap((other) =>
        [other.effectiveFrom, other.effectiveUntil].filter(
          (on): on is number =>
            on !== null &&
            on > version.effectiveFrom &&
            (version.effectiveUntil === null || on < version.effectiveUntil),
        ),
      ),
    ].some((on) => resolveVersion(own, itemId, on)?.changeId === changeId),
  );

/** What cancelling `changeId` would write, read from the versions loaded; null when it is not there, has started, was already cancelled (it wins on none of its days), or has no earlier version under part of its days (an item's own first version is cancelled by archiving it). A restored segment is made one millisecond after the change, so it wins over the change and still loses to anything made after it. */
export function getCancelTarget<V extends LinkVersion>(
  versions: readonly V[],
  item: { id: string; endedAt: DateOnly | null },
  changeId: string,
  today: DateOnly,
): CancelTarget | null {
  if (changeId === getEndChangeId(item.id)) {
    if (item.endedAt === null) return null;
    const startsOn = item.endedAt + DAY_MS;
    return startsOn > today ? { kind: 'stop', startsOn } : null;
  }
  const own = versions.filter(({ itemId }) => itemId === item.id);
  const made = own.filter((version) => version.changeId === changeId);
  if (made.length === 0) return null;
  const startsOn = Math.min(...made.map(({ effectiveFrom }) => effectiveFrom));
  const madeAt = Math.max(...made.map(({ createdAt }) => createdAt));
  if (startsOn <= today || !winsAnywhere(own, item.id, made, changeId))
    return null;
  const before = own.filter(
    (version) => version.changeId !== changeId && version.createdAt <= madeAt,
  );
  const pieces = made.flatMap((version) => {
    const until = version.effectiveUntil;
    const points = [
      ...new Set([
        version.effectiveFrom,
        ...before.flatMap((other) =>
          [other.effectiveFrom, other.effectiveUntil].filter(
            (on): on is number =>
              on !== null &&
              on > version.effectiveFrom &&
              (until === null || on < until),
          ),
        ),
      ]),
    ].sort((a, b) => a - b);
    return points.map((from, index) => ({
      from,
      until: points[index + 1] ?? until,
      held: resolveVersion(before, item.id, from),
    }));
  });
  if (pieces.some(({ held }) => held === null)) return null;
  const segments = pieces.reduce<
    { id: string | undefined; segment: CancelSegment }[]
  >((acc, { from, until, held }) => {
    const last = acc[acc.length - 1];
    return last && last.id === held?.id && last.segment.effectiveUntil === from
      ? [
          ...acc.slice(0, -1),
          {
            id: last.id,
            segment: { ...last.segment, effectiveUntil: until },
          },
        ]
      : [
          ...acc,
          {
            id: held?.id,
            segment: {
              kind: held?.kind,
              payload: held?.payload,
              effectiveFrom: from,
              effectiveUntil: until,
            },
          },
        ];
  }, []);
  return {
    kind: 'versions',
    versionIds: made.map(({ id }) => id),
    startsOn,
    segments: segments.map(({ segment }) => segment),
  };
}

/** The event that holds a link, from the events loaded (every state); null when none does. */
export const findLinkHolder = <
  E extends { version: { payload: Pick<HorizonSealed, 'links'> } },
>(
  events: readonly E[],
  link: HorizonLink,
): E | null =>
  events.find(({ version }) =>
    version.payload.links.some(
      ({ changeId, itemId }) =>
        changeId === link.changeId && itemId === link.itemId,
    ),
  ) ?? null;

/** The changes to an item still ahead of `today`, soonest first, each against the version in force just before it, and its ending when `endedAt` is a coming day (a change after the last day is left out). An item that has not begun has no change: its first version is a start. */
export function listComingChanges<V extends LinkVersion>(
  versions: readonly V[],
  itemId: string,
  today: DateOnly,
  endedAt: DateOnly | null = null,
): ComingChange<V>[] {
  const own = versions.filter((version) => version.itemId === itemId);
  const breaks = [
    ...new Set(
      own.flatMap((version) =>
        [version.effectiveFrom, version.effectiveUntil].filter(
          (on): on is number => on !== null && on > today,
        ),
      ),
    ),
  ].sort((a, b) => a - b);
  const start = resolveVersion(own, itemId, today);
  const changes = breaks.reduce<{ before: V | null; found: ComingChange<V>[] }>(
    (walk, on) => {
      const version = resolveVersion(own, itemId, on);
      if (!version || version.id === walk.before?.id) return walk;
      if (walk.before === null) return { before: version, found: walk.found };
      if (
        version.payload !== undefined &&
        isSameValue(version.payload, walk.before.payload)
      )
        return { before: version, found: walk.found };
      return {
        before: version,
        found: [
          ...walk.found,
          {
            kind: isStartingVersion(own, version, walk.before)
              ? 'start'
              : 'change',
            changeId: version.changeId,
            on,
            version,
            before: walk.before,
            isReturn: version.effectiveFrom !== on,
          },
        ],
      };
    },
    { before: start, found: [] },
  ).found;
  if (endedAt === null) return changes;
  const last = resolveVersion(own, itemId, endedAt);
  const stop: ComingChange<V>[] =
    endedAt + DAY_MS > today && last
      ? [
          {
            kind: 'stop',
            changeId: getEndChangeId(itemId),
            on: endedAt + DAY_MS,
            version: last,
            before: last,
            isReturn: false,
          },
        ]
      : [];
  return [...changes.filter(({ on }) => on <= endedAt), ...stop];
}

/** The days a linked change covers: the day it starts and, for a stretch that goes back, the last day it holds. */
export interface LinkSpan<V> {
  /** What it is, so a screen can word it: a change to an item, its last day, or the day it starts taking money. */
  kind: LinkKind;
  /** The first day it takes effect. A stop starts the day after the item's last day; a start is the item's first money day. */
  startsOn: DateOnly;
  lastDay: DateOnly | null;
  /** The version the change started with, or for a stop the one in force on the item's last day; and the one in force just before it, null when the item began with it. */
  version: V;
  before: V | null;
  /** False once it will never take effect: its item stopped before it began, or a later change from the same day replaced it. */
  isLive: boolean;
}

/** The day each stopped item stops counting: its archive day, or the day after its last day, whichever comes first. */
export const getItemStops = (
  items: readonly {
    id: string;
    endedAt: DateOnly | null;
    archivedAt: number | null;
  }[],
): Readonly<Record<string, DateOnly>> =>
  Object.fromEntries(
    items.flatMap(({ id, endedAt, archivedAt }) => {
      const ends = [
        ...(archivedAt === null ? [] : [archivedAt]),
        ...(endedAt === null ? [] : [endedAt + DAY_MS]),
      ];
      return ends.length === 0 ? [] : [[id, Math.min(...ends)]];
    }),
  );

/** The first day each ended item is gone: the day after its last day. A stop link resolves from it, and is live only while the item still has that last day. */
export const getItemEnds = (
  items: readonly { id: string; endedAt: DateOnly | null }[],
): Readonly<Record<string, DateOnly>> =>
  Object.fromEntries(
    items.flatMap(({ id, endedAt }) =>
      endedAt === null ? [] : [[id, endedAt + DAY_MS]],
    ),
  );

/** What a link points at in the versions loaded; null when none of the change's versions are there, or for a stop link when its item no longer has that last day (`ends`, from `getItemEnds`). A stop is dead only when its item was archived before it took effect. */
export function getLinkSpan<V extends LinkVersion>(
  versions: readonly V[],
  link: HorizonLink,
  stops: Readonly<Record<string, DateOnly>> = {},
  ends: Readonly<Record<string, DateOnly>> = {},
): LinkSpan<V> | null {
  if (isStopLink(link)) {
    const startsOn = ends[link.itemId];
    const last =
      startsOn === undefined
        ? null
        : resolveVersion(versions, link.itemId, startsOn - DAY_MS);
    return startsOn === undefined || last === null
      ? null
      : {
          kind: 'stop',
          startsOn,
          lastDay: null,
          version: last,
          before: last,
          isLive: (stops[link.itemId] ?? Infinity) >= startsOn,
        };
  }
  const own = versions
    .filter(
      (version) =>
        version.itemId === link.itemId && version.changeId === link.changeId,
    )
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
  if (own.length === 0) return null;
  const first = own[0];
  const untils = own.map(({ effectiveUntil }) => effectiveUntil);
  const isStretch = untils.every((until) => until !== null);
  const earlier = versions.filter(
    ({ changeId, createdAt }) =>
      changeId !== link.changeId && createdAt < first.createdAt,
  );
  const before =
    resolveVersion(earlier, link.itemId, first.effectiveFrom - DAY_MS) ??
    resolveVersion(earlier, link.itemId, first.effectiveFrom);
  const isStart =
    before === null ||
    isStartingVersion(
      versions.filter(({ itemId }) => itemId === link.itemId),
      first,
      before,
    );
  return {
    kind: isStart ? 'start' : 'change',
    startsOn: before === null ? getFirstMoneyDay(first) : first.effectiveFrom,
    lastDay: isStretch
      ? Math.max(...untils.map((until) => until ?? 0)) - DAY_MS
      : null,
    version: first,
    before,
    isLive:
      resolveVersion(versions, link.itemId, first.effectiveFrom)?.changeId ===
        link.changeId &&
      !((stops[link.itemId] ?? Infinity) <= first.effectiveFrom),
  };
}

/** The day a linked change has happened: the day it starts, or for a stretch the day after its last day, when it is back. */
export const getLinkDoneOn = (
  span: Pick<LinkSpan<unknown>, 'startsOn' | 'lastDay'>,
) => (span.lastDay === null ? span.startsOn : span.lastDay + DAY_MS);

/** Whether a linked change has happened by `today`. */
export const hasLinkHappened = (
  span: Pick<LinkSpan<unknown>, 'startsOn' | 'lastDay'>,
  today: DateOnly,
) => getLinkDoneOn(span) <= today;

/** The links calling off an event can ask about: live, not started (it starts after `today`) and with something left to write when cancelled, each with what cancelling writes. A link that has happened, is dead or whose item is gone is not among them. */
export function listCancellableLinks<V extends LinkVersion>(
  links: readonly HorizonLink[],
  versions: readonly V[],
  items: readonly {
    id: string;
    endedAt: DateOnly | null;
    archivedAt: number | null;
  }[],
  today: DateOnly,
): { link: HorizonLink; target: CancelTarget }[] {
  const stops = getItemStops(items);
  const ends = getItemEnds(items);
  return links.flatMap((link) => {
    const item = items.find(({ id }) => id === link.itemId);
    const span = getLinkSpan(versions, link, stops, ends);
    if (!item || !span || !span.isLive || !canCancelChange(span, today))
      return [];
    const target = getCancelTarget(versions, item, link.changeId, today);
    return target === null ? [] : [{ link, target }];
  });
}

/** The links of an event in date order; a link whose versions are not loaded keeps its place last. */
export function sortLinksByDate<V extends LinkVersion>(
  links: readonly HorizonLink[],
  versions: readonly V[],
  ends: Readonly<Record<string, DateOnly>> = {},
) {
  const dated = links.map((link) => ({
    link,
    on: getLinkSpan(versions, link, {}, ends)?.startsOn ?? Infinity,
  }));
  return dated.sort((a, b) => a.on - b.on).map(({ link }) => link);
}

/** The day an open event with no costs is over: the day its last live linked change has happened, once every one has happened; null while any is ahead, when none is live, or when it is not that kind of event. Derived each time, never stored. */
export function getChangesOnlyDoneOn<V extends LinkVersion>(
  horizon: Pick<HorizonSealed, 'costs' | 'links' | 'state'>,
  versions: readonly V[],
  today: DateOnly,
  stops: Readonly<Record<string, DateOnly>> = {},
  ends: Readonly<Record<string, DateOnly>> = {},
): DateOnly | null {
  if (
    horizon.state !== 'open' ||
    horizon.costs.length > 0 ||
    horizon.links.length === 0
  )
    return null;
  const days = horizon.links.flatMap((link) => {
    const span = getLinkSpan(versions, link, stops, ends);
    return span?.isLive ? [getLinkDoneOn(span)] : [];
  });
  if (days.length === 0) return null;
  const last = Math.max(...days);
  return last <= today ? last : null;
}

/** The event with one linked change let go; the change itself stays in the item's plan. */
export const removeLink = (
  horizon: HorizonSealed,
  changeId: string,
): HorizonSealed => ({
  ...horizon,
  links: horizon.links.filter((link) => link.changeId !== changeId),
});

/** The event with several linked changes let go. */
export const removeLinks = (
  horizon: HorizonSealed,
  changeIds: readonly string[],
): HorizonSealed => ({
  ...horizon,
  links: horizon.links.filter((link) => !changeIds.includes(link.changeId)),
});

/** The event with a change linked, replacing any earlier link to the same change. */
export const addLink = (
  horizon: HorizonSealed,
  link: HorizonLink,
): HorizonSealed => ({
  ...horizon,
  links: [
    ...horizon.links.filter(({ changeId }) => changeId !== link.changeId),
    link,
  ],
});
