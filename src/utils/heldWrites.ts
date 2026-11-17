/** A local copy of a write shown over a listener's list until the list shows it; `item` null is a removal. */
export interface HeldWrite<T> {
  id: string;
  item: T | null;
  fingerprint: string;
  /** Which write held it, so only that write settles or drops it. */
  token: string;
  /** When the write was accepted by the server; null while it is in flight. */
  settledAt: number | null;
  /** The fingerprint of the list's copy when the write was made, null when the list had none. */
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

const hasLanded = <T>(
  hold: HeldWrite<T>,
  incoming: T | undefined,
  fingerprintOf: (item: T) => string,
): boolean => {
  if (hold.item === null) return incoming === undefined;
  if (incoming === undefined) return false;
  const seen = fingerprintOf(incoming);
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
  /** When the listener last delivered the list; a stalled listener never lets a hold expire. */
  deliveredAt?: number | null;
}

/**
 * Lays held writes over a listener's list: a hold lets go once the list shows its write, or, once the
 * server accepted it, a copy that differs from the one the write replaced; never merely because the
 * write settled, so a listener that has stalled never flashes the old value back.
 */
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
  const kept = held.filter(
    (hold) =>
      !hasLanded(hold, byId.get(hold.id), fingerprintOf) &&
      !hasExpired(hold, now, deliveredAt),
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
