import { DAY_MS } from './dates';

export interface Versioned {
  itemId: string;
  createdAt: number;
  effectiveFrom: number;
  effectiveUntil: number | null;
}

export interface ItemHeader {
  id: string;
  createdAt: number;
  endedAt: number | null;
  archivedAt: number | null;
}

const byCreatedAtThenId = (
  a: { createdAt: number; id?: string },
  b: { createdAt: number; id?: string },
) => a.createdAt - b.createdAt || (a.id ?? '').localeCompare(b.id ?? '');

/**
 * Of an item's versions covering `on`, the one made last; `knownAt` keeps only versions made before
 * that day ends. Null when the item has no version for that date.
 */
export function resolveVersion<V extends Versioned & { id: string }>(
  versions: readonly V[],
  itemId: string,
  on: number,
  knownAt?: number,
): V | null {
  const covering = versions
    .filter(
      (version) =>
        version.itemId === itemId &&
        version.effectiveFrom <= on &&
        (version.effectiveUntil === null || on < version.effectiveUntil) &&
        (knownAt === undefined || version.createdAt < knownAt + DAY_MS),
    )
    .sort(byCreatedAtThenId);
  const result = covering[covering.length - 1] ?? null;
  return result;
}

/** The version in force on `on`, else the one in force on the item's earliest later start (an income that has not begun). */
export function resolveCurrentOrNext<V extends Versioned & { id: string }>(
  versions: readonly V[],
  itemId: string,
  on: number,
): V | null {
  const current = resolveVersion(versions, itemId, on);
  if (current) return current;
  const starts = versions
    .filter(
      (version) => version.itemId === itemId && version.effectiveFrom > on,
    )
    .map((version) => version.effectiveFrom);
  const result =
    starts.length === 0
      ? null
      : resolveVersion(versions, itemId, Math.min(...starts));
  return result;
}

export interface ResolvedItem<I, V> {
  item: I;
  version: V;
}

/**
 * The plan on `on`: each item that is not archived or ended before that date, with the version that
 * covers it. Output order depends only on the data, never on the order it arrives in.
 */
export function resolve<
  I extends ItemHeader,
  V extends Versioned & { id: string },
>(
  items: readonly I[],
  versions: readonly V[],
  on: number,
  knownAt?: number,
): ResolvedItem<I, V>[] {
  const result = [...items]
    .sort(byCreatedAtThenId)
    .filter(
      (item) =>
        (item.archivedAt === null || on < item.archivedAt) &&
        (item.endedAt === null || on <= item.endedAt),
    )
    .flatMap((item) => {
      const version = resolveVersion(versions, item.id, on, knownAt);
      return version ? [{ item, version }] : [];
    });
  return result;
}

/**
 * The next change to an item that has been made but has not started: the earliest version after `on`
 * that wins on its own first day. Null when nothing is scheduled, or when the item has not begun, since
 * its first version is a start and not a change.
 */
export function resolveNextChange<V extends Versioned & { id: string }>(
  versions: readonly V[],
  itemId: string,
  on: number,
): V | null {
  const own = versions.filter((version) => version.itemId === itemId);
  if (!resolveVersion(own, itemId, on)) return null;
  const result =
    own
      .filter((version) => version.effectiveFrom > on)
      .sort(
        (a, b) => a.effectiveFrom - b.effectiveFrom || byCreatedAtThenId(a, b),
      )
      .find(
        (version) =>
          resolveVersion(own, itemId, version.effectiveFrom)?.id === version.id,
      ) ?? null;
  return result;
}

export interface VersionStretch<P> {
  payload: P;
  effectiveFrom: number;
  effectiveUntil: number | null;
}

/**
 * The stretches from `today` on over which an item's resolved version stays the same, each with that
 * version's payload. A change to one field is written once per stretch, so a stretch change or a
 * change ahead keeps its amounts and its dates; an item with one version in force is one stretch.
 */
export function getVersionStretches<
  V extends Versioned & { id: string; payload: P },
  P,
>(versions: readonly V[], itemId: string, today: number): VersionStretch<P>[] {
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

const canonical = (value: unknown): unknown => {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, canonical(entry)] as const)
      .filter(([, entry]) => entry !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
};

/** Whether two values hold the same thing: key order does not matter and a missing field equals null. */
export const isSameValue = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** The fields whose values differ between two payloads. */
export function getChangedKeys<P extends object>(
  before: P,
  after: P,
): (keyof P)[] {
  const keys = Object.keys({ ...before, ...after }) as (keyof P)[];
  return keys.filter((key) => !isSameValue(before[key], after[key]));
}

/** Carries only the fields a change touched onto each stretch, so every other field of a later version stays as it was. */
export function applyFieldChanges<P extends object>(
  stretches: readonly VersionStretch<P>[],
  current: P,
  candidate: P,
): VersionStretch<P>[] {
  const changed = getChangedKeys(current, candidate);
  return stretches.map((stretch) => ({
    ...stretch,
    payload: {
      ...stretch.payload,
      ...Object.fromEntries(changed.map((key) => [key, candidate[key]])),
    },
  }));
}

export interface ReplacedChange<P> {
  effectiveFrom: number;
  /** Where a bounded change ends and what held before returns; null when it lasts. */
  effectiveUntil: number | null;
  /** The later version as it stands, with only the changed fields taken from the stretch before it. */
  before: P;
  after: P;
}

export interface StretchPlan<P> {
  /** What is written: one version per stretch, each keeping its own end. */
  written: VersionStretch<P>[];
  /** Later scheduled changes to the same field the edit sets, which it replaces. */
  replaced: ReplacedChange<P>[];
}

/**
 * The versions an edit from a day on (or over a window) writes: one per stretch of the item's
 * versions in that span, each taking only the fields the edit changed, so a later change to another
 * field survives. A scheduled change to the field being edited is replaced and listed in `replaced`.
 */
export function planStretches<
  V extends Versioned & { id: string; payload: P },
  P extends object,
>(
  versions: readonly V[],
  itemId: string,
  span: { effectiveFrom: number; effectiveUntil: number | null },
  current: P,
  candidate: P,
): StretchPlan<P> {
  const { effectiveFrom, effectiveUntil } = span;
  const base = getVersionStretches<V, P>(versions, itemId, effectiveFrom);
  const clipped =
    effectiveUntil === null
      ? base
      : base
          .filter((stretch) => stretch.effectiveFrom < effectiveUntil)
          .map((stretch) => ({
            ...stretch,
            effectiveUntil:
              stretch.effectiveUntil === null ||
              stretch.effectiveUntil > effectiveUntil
                ? effectiveUntil
                : stretch.effectiveUntil,
          }));
  if (clipped.length === 0) {
    return {
      written: [{ payload: candidate, effectiveFrom, effectiveUntil }],
      replaced: [],
    };
  }
  const changed = getChangedKeys(current, candidate);
  const holds = (index: number, other: number) =>
    changed.every((key) =>
      isSameValue(clipped[index].payload[key], clipped[other].payload[key]),
    );
  const isChange = (index: number) =>
    index > 0 &&
    changed.some(
      (key) =>
        !isSameValue(
          clipped[index].payload[key],
          clipped[index - 1].payload[key],
        ) && !isSameValue(clipped[index].payload[key], candidate[key]),
    );
  /** The stretch after a bounded change that only brings back what held before it. */
  const isReturn = (index: number) =>
    index > 1 && isChange(index - 1) && holds(index, index - 2);
  const replaced = clipped.flatMap((stretch, index): ReplacedChange<P>[] => {
    if (!isChange(index) || isReturn(index)) return [];
    const previous = clipped[index - 1];
    const next = clipped[index + 1];
    return [
      {
        effectiveFrom: stretch.effectiveFrom,
        effectiveUntil: next && isReturn(index + 1) ? next.effectiveFrom : null,
        before: {
          ...stretch.payload,
          ...Object.fromEntries(
            changed.map((key) => [key, previous.payload[key]]),
          ),
        },
        after: stretch.payload,
      },
    ];
  });
  return {
    written: applyFieldChanges(clipped, current, candidate),
    replaced,
  };
}
