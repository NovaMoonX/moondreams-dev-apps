/** A device's own write shown over a listener's list until the list shows it; `item` null is a removal. */
export interface HeldWrite<T> {
  id: string;
  item: T | null;
  fingerprint: string;
  token: string;
  /** Null while the write is in flight. */
  settledAt: number | null;
  /** The fields the write set; another device's change to any other field never holds it back. */
  fields: string[];
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

const pickFields = (value: unknown, fields: readonly string[]): unknown =>
  Object.fromEntries(
    fields.map((field) => [field, (value as Record<string, unknown>)[field]]),
  );

/** A hold of `item` that waits for the list to show the given fields as they are in it. */
export const toHeldWrite = <T>(
  id: string,
  item: T | null,
  fields: readonly string[],
  token: string,
): HeldWrite<T> => ({
  id,
  item,
  fingerprint: item === null ? '' : toFingerprint(pickFields(item, fields)),
  token,
  settledAt: null,
  fields: [...fields],
});

const hasLanded = <T>(hold: HeldWrite<T>, incoming: T | undefined): boolean => {
  if (hold.item === null) return incoming === undefined;
  if (incoming === undefined) return false;
  return toFingerprint(pickFields(incoming, hold.fields)) === hold.fingerprint;
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

export interface ApplyHeldOptions {
  now?: number;
  /** A listener that has delivered nothing since a write settled never lets its hold expire. */
  deliveredAt?: number | null;
}

/** Lays held writes over a listener's list; a hold lets go when the list shows it, never merely because it settled. */
export function applyHeldWrites<T>(
  incoming: readonly T[],
  held: readonly HeldWrite<T>[],
  idOf: (item: T) => string,
  { now = Date.now(), deliveredAt = null }: ApplyHeldOptions = {},
): { list: T[]; held: HeldWrite<T>[] } {
  const byId = new Map(incoming.map((item) => [idOf(item), item]));
  const kept = held.filter(
    (hold) =>
      !hasLanded(hold, byId.get(hold.id)) &&
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
    return {
      ...toHeldWrite(hold.id, item, hold.fields, hold.token),
      settledAt: hold.settledAt,
    };
  });

const holdKey = <T>(hold: HeldWrite<T>) => `${hold.id}/${hold.token}`;

/** A hold stays only in a list its item belongs to; in any other it is a removal, which lands at once. */
export const forHeldList = <T>(
  held: readonly HeldWrite<T>[],
  belongs: (item: T) => boolean,
): HeldWrite<T>[] =>
  held.map((hold) =>
    hold.item === null || belongs(hold.item)
      ? hold
      : { ...hold, item: null, fields: [], fingerprint: '' },
  );

export interface HeldListInput<T> {
  incoming: readonly T[];
  /** Null until the list's listener has delivered once. */
  deliveredAt: number | null;
  belongs: (item: T) => boolean;
}

export interface LayHeldListsInput<T, L extends string> {
  lists: Record<L, HeldListInput<T>>;
  held: readonly HeldWrite<T>[];
  /** The lists each hold (`id/token`) has already landed in; a hold never comes back over one of them. */
  landed: Readonly<Record<string, readonly L[]>>;
  idOf: (item: T) => string;
  now?: number;
}

/** Several lists that read one kind of record, each with the holds laid over it; a hold stays while any list still waits for it, and a list that hasn't delivered never counts it as shown. */
export function layHeldLists<T, L extends string>({
  lists,
  held,
  landed,
  idOf,
  now,
}: LayHeldListsInput<T, L>): {
  lists: Record<L, T[]>;
  held: HeldWrite<T>[];
  landed: Record<string, L[]>;
} {
  const results = (Object.entries(lists) as [L, HeldListInput<T>][]).map(
    ([name, { incoming, deliveredAt, belongs }]) => {
      const waiting = forHeldList(held, belongs).filter(
        (hold) => !landed[holdKey(hold)]?.includes(name),
      );
      const result = applyHeldWrites(incoming, waiting, idOf, {
        deliveredAt,
        now,
      });
      const kept = new Set(result.held.map(holdKey));
      return {
        name,
        list: result.list,
        kept,
        landedNow:
          deliveredAt === null
            ? []
            : waiting.map(holdKey).filter((key) => !kept.has(key)),
      };
    },
  );
  const keptHeld = held.filter((hold) =>
    results.some((result) => result.kept.has(holdKey(hold))),
  );
  return {
    lists: Object.fromEntries(
      results.map((result) => [result.name, result.list]),
    ) as Record<L, T[]>,
    held: keptHeld,
    landed: Object.fromEntries(
      keptHeld.map((hold) => {
        const key = holdKey(hold);
        return [
          key,
          [
            ...(landed[key] ?? []),
            ...results.flatMap((result) =>
              result.landedNow.includes(key) ? [result.name] : [],
            ),
          ],
        ];
      }),
    ),
  };
}
