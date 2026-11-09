import type { DateOnly, HorizonLink, HorizonSealed } from '@apps/runway/types';

import { DAY_MS } from './dates';
import { resolveVersion, type Versioned } from './resolve';

type LinkVersion = Versioned & { id: string; changeId: string };

/** A change to an item that has not started: the version that starts on `on`, the one it replaces, and whether it is the earlier version coming back after a stretch. */
export interface ComingChange<V> {
  on: DateOnly;
  version: V;
  before: V;
  isReturn: boolean;
}

/** The changes to an item still ahead of `today`, soonest first, each against the version in force just before it. An item that has not begun has none: its first version is a start. */
export function listComingChanges<V extends LinkVersion>(
  versions: readonly V[],
  itemId: string,
  today: DateOnly,
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
  return breaks.reduce<{ before: V | null; found: ComingChange<V>[] }>(
    (walk, on) => {
      const version = resolveVersion(own, itemId, on);
      if (!version || version.id === walk.before?.id) return walk;
      if (walk.before === null) return { before: version, found: walk.found };
      return {
        before: version,
        found: [
          ...walk.found,
          {
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
}

/** The days a linked change covers: the day it starts and, for a stretch that goes back, the last day it holds. */
export interface LinkSpan<V> {
  startsOn: DateOnly;
  lastDay: DateOnly | null;
  /** The version the change started with and the one in force just before it; null when the item began with it. */
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

/** What a link points at in the versions loaded; null when none of the change's versions are there. */
export function getLinkSpan<V extends LinkVersion>(
  versions: readonly V[],
  link: HorizonLink,
  stops: Readonly<Record<string, DateOnly>> = {},
): LinkSpan<V> | null {
  const own = versions
    .filter(
      (version) =>
        version.itemId === link.itemId && version.changeId === link.changeId,
    )
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom);
  if (own.length === 0) return null;
  const first = own[0];
  const ends = own.map(({ effectiveUntil }) => effectiveUntil);
  const isStretch = ends.every((until) => until !== null);
  return {
    startsOn: first.effectiveFrom,
    lastDay: isStretch
      ? Math.max(...ends.map((until) => until ?? 0)) - DAY_MS
      : null,
    version: first,
    before: resolveVersion(versions, link.itemId, first.effectiveFrom - DAY_MS),
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

/** The links of an event in date order; a link whose versions are not loaded keeps its place last. */
export function sortLinksByDate<V extends LinkVersion>(
  links: readonly HorizonLink[],
  versions: readonly V[],
) {
  const dated = links.map((link) => ({
    link,
    on: getLinkSpan(versions, link)?.startsOn ?? Infinity,
  }));
  return dated.sort((a, b) => a.on - b.on).map(({ link }) => link);
}

/** The day an open event with no costs is over: the day its last live linked change has happened, once every one has happened; null while any is ahead, when none is live, or when it is not that kind of event. Derived each time, never stored. */
export function getChangesOnlyDoneOn<V extends LinkVersion>(
  horizon: Pick<HorizonSealed, 'costs' | 'links' | 'state'>,
  versions: readonly V[],
  today: DateOnly,
  stops: Readonly<Record<string, DateOnly>> = {},
): DateOnly | null {
  if (
    horizon.state !== 'open' ||
    horizon.costs.length > 0 ||
    horizon.links.length === 0
  )
    return null;
  const days = horizon.links.flatMap((link) => {
    const span = getLinkSpan(versions, link, stops);
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
