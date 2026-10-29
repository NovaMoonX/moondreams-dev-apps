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

/** The version in force on `on`, else the item's earliest one that starts later (an income that has not begun). */
export function resolveCurrentOrNext<V extends Versioned & { id: string }>(
  versions: readonly V[],
  itemId: string,
  on: number,
): V | null {
  const current = resolveVersion(versions, itemId, on);
  if (current) return current;
  const later = versions
    .filter(
      (version) => version.itemId === itemId && version.effectiveFrom > on,
    )
    .sort(
      (a, b) => a.effectiveFrom - b.effectiveFrom || byCreatedAtThenId(a, b),
    );
  const result = later[0] ?? null;
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
