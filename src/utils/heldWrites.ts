/** A device's own write shown over a listener's list until the list shows it; `item` null is a removal. */
export interface HeldWrite<T> {
  id: string;
  item: T | null;
  fingerprint: string;
  token: string;
  /** Null while the write is in flight. */
  settledAt: number | null;
  /** The list's copy the write replaces (null when it had none); followed while in flight, frozen once settled. */
  baseline: string | null;
}

/** A settled hold the list never shows, though the list has been delivered since, lets go after this long. */
export const HELD_WRITE_SETTLED_MS = 15_000;

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
};

/** A key-order-free text of a plain value, so a held item and the listener's copy of it compare equal. */
export const toFingerprint = (value: unknown): string =>
  JSON.stringify(sortKeys(value));

const hasLanded = <T>(hold: HeldWrite<T>, seen: string | null): boolean => {
  if (hold.item === null) return seen === null;
  if (seen === null) return false;
  if (seen === hold.fingerprint) return true;
  return hold.settledAt !== null && seen !== hold.baseline;
};

const hasExpired = <T>(
  hold: HeldWrite<T>,
  now: number,
  deliveredAt: number | null,
): boolean =>
  hold.settledAt !== null &&
  deliveredAt !== null &&
  deliveredAt >= hold.settledAt &&
  now - hold.settledAt >= HELD_WRITE_SETTLED_MS;

export interface ApplyHeldOptions<T> {
  fingerprintOf?: (item: T) => string;
  now?: number;
  /** A listener that has delivered nothing since a write settled never lets its hold expire. */
  deliveredAt?: number | null;
}

/** Lays held writes over a listener's list; a hold lets go when the list shows it, never merely because it settled. */
export function applyHeldWrites<T>(
  incoming: readonly T[],
  held: readonly HeldWrite<T>[],
  idOf: (item: T) => string,
  {
    fingerprintOf = toFingerprint,
    now = Date.now(),
    deliveredAt = null,
  }: ApplyHeldOptions<T> = {},
): { list: T[]; held: HeldWrite<T>[] } {
  const byId = new Map(incoming.map((item) => [idOf(item), item]));
  const seenOf = (id: string) => {
    const item = byId.get(id);
    return item === undefined ? null : fingerprintOf(item);
  };
  const kept = held
    .filter(
      (hold) =>
        !hasLanded(hold, seenOf(hold.id)) &&
        !hasExpired(hold, now, deliveredAt),
    )
    .map((hold) =>
      hold.settledAt === null ? { ...hold, baseline: seenOf(hold.id) } : hold,
    );
  if (kept.length === 0) return { list: [...incoming], held: [] };
  const holdById = new Map(kept.map((hold) => [hold.id, hold]));
  const list = [
    ...incoming.flatMap((item) => {
      const hold = holdById.get(idOf(item));
      if (hold === undefined) return [item];
      return hold.item === null ? [] : [hold.item];
    }),
    ...kept.flatMap((hold) =>
      hold.item !== null && !byId.has(hold.id) ? [hold.item] : [],
    ),
  ];
  return { list, held: kept };
}

/** The newest write of a record replaces an older hold of it. */
export const addHeldWrites = <T>(
  held: readonly HeldWrite<T>[],
  added: readonly HeldWrite<T>[],
): HeldWrite<T>[] => {
  const ids = new Set(added.map((hold) => hold.id));
  return [...held.filter((hold) => !ids.has(hold.id)), ...added];
};

export const settleHeldWrites = <T>(
  held: readonly HeldWrite<T>[],
  token: string,
  now: number = Date.now(),
): HeldWrite<T>[] =>
  held.map((hold) =>
    hold.token === token && hold.settledAt === null
      ? { ...hold, settledAt: now }
      : hold,
  );

export const dropHeldWrites = <T>(
  held: readonly HeldWrite<T>[],
  token: string,
): HeldWrite<T>[] => held.filter((hold) => hold.token !== token);

/** Lays a plain write's fields over a record's hold, so the hold shows it too. */
export const patchHeldWrite = <T>(
  held: readonly HeldWrite<T>[],
  id: string,
  fields: Record<string, unknown>,
): HeldWrite<T>[] =>
  held.map((hold) => {
    if (hold.id !== id || hold.item === null) return hold;
    const item = { ...hold.item, ...fields } as T;
    return { ...hold, item, fingerprint: toFingerprint(item) };
  });
