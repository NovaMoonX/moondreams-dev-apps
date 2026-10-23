import { DAY_MS } from './dates';
import { resolveVersion, type Versioned } from './resolve';

/**
 * The date a change for the next `count` income days stops covering: the day after the last of them.
 * Null when fewer than `count` income days from `from` are known.
 */
export function getStretchEnd(
  days: readonly { on: number }[],
  from: number,
  count: number,
): number | null {
  const ahead = days
    .map((day) => day.on)
    .filter((on) => on >= from)
    .sort((a, b) => a - b);
  const last = count >= 1 ? ahead[count - 1] : undefined;
  const result = last === undefined ? null : last + DAY_MS;
  return result;
}

/**
 * The items whose stretch ran out between `previousOn` and `on`, so `on` is the first income day
 * they are back to what they were. The earlier amount returns because the stretch no longer covers
 * the date, and nothing is written for it.
 */
export function findReturning<V extends Versioned & { id: string }>(
  versions: readonly V[],
  itemIds: readonly string[],
  on: number,
  previousOn: number,
): Set<string> {
  const result = new Set(
    itemIds.filter((itemId) =>
      versions.some(
        (version) =>
          version.itemId === itemId &&
          version.effectiveUntil !== null &&
          version.effectiveUntil > previousOn &&
          version.effectiveUntil <= on &&
          resolveVersion(versions, itemId, version.effectiveUntil - DAY_MS)
            ?.id === version.id &&
          resolveVersion(versions, itemId, on)?.id !== version.id,
      ),
    ),
  );
  return result;
}
