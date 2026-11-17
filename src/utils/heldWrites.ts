/** A local copy of a write shown over a listener's list until the list shows it; `item` null is a removal. */
export interface HeldWrite<T> {
  id: string;
  item: T | null;
  fingerprint: string;
  /** Which write held it, so only that write settles or drops it. */
  token: string;
  /** When the write was accepted by the server; null while it is in flight. */
  settledAt: number | null;
}

/** A settled hold the list never shows (a window that moved, a field the server rewrote) lets go after this long. */
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

const hasLanded = <T>(
  hold: HeldWrite<T>,
  incoming: T | undefined,
  fingerprintOf: (item: T) => string,
): boolean => {
  if (hold.item === null) return incoming === undefined;
  if (incoming === undefined) return false;
  return hold.settledAt !== null || fingerprintOf(incoming) === hold.fingerprint;
};

/**
 * Lays held writes over a listener's list: a hold lets go once the list shows its write (or, once the
 * server accepted it, any copy of the record), never merely because the write settled.
 */
export function applyHeldWrites<T>(
  incoming: readonly T[],
  held: readonly HeldWrite<T>[],
  idOf: (item: T) => string,
  fingerprintOf: (item: T) => string = toFingerprint,
  now: number = Date.now(),
): { list: T[]; held: HeldWrite<T>[] } {
  const byId = new Map(incoming.map((item) => [idOf(item), item]));
  const kept = held.filter(
    (hold) =>
      !hasLanded(hold, byId.get(hold.id), fingerprintOf) &&
      (hold.settledAt === null || now - hold.settledAt < HELD_WRITE_SETTLED_MS),
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

/** Adds holds, the newest write of a record replacing an older hold of it. */
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
