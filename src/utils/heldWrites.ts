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
  /** A change to a record that already existed: it never brings back a record the list no longer has. */
  isEdit?: boolean;
  /** An edit's record as it was before, so a list it newly enters (a filtered window) shows it rather than reading it as deleted. */
  before?: T | null;
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
  isEdit = false,
  before: T | null = null,
): HeldWrite<T> => ({
  id,
  item,
  fingerprint: item === null ? '' : toFingerprint(pickFields(item, fields)),
  token,
  settledAt: null,
  fields: [...fields],
  isEdit,
  before,
});

const rehold = <T>(
  hold: HeldWrite<T>,
  item: T,
  fields: readonly string[],
): HeldWrite<T> => ({
  ...hold,
  item,
  fields: [...fields],
  fingerprint: toFingerprint(pickFields(item, fields)),
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

/** Lays held writes over a listener's list, a record's holds in the order they were made; a hold shows only the fields it wrote, so a later write to another field shows through, and lets go when the list shows it, never merely because it settled. */
export function applyHeldWrites<T>(
  incoming: readonly T[],
  held: readonly HeldWrite<T>[],
  idOf: (item: T) => string,
  { now = Date.now(), deliveredAt = null }: ApplyHeldOptions = {},
): { list: T[]; held: HeldWrite<T>[] } {
  const byId = new Map(incoming.map((item) => [idOf(item), item]));
  const live = held.filter(
    (hold) =>
      !hasLanded(hold, byId.get(hold.id)) &&
      !hasExpired(hold, now, deliveredAt),
  );
  const adds = new Set(
    live.filter((hold) => hold.isEdit !== true).map((hold) => hold.id),
  );
  const kept = live.filter(
    (hold) =>
      !(hold.isEdit === true && !byId.has(hold.id) && !adds.has(hold.id)),
  );
  if (kept.length === 0) return { list: [...incoming], held: [] };
  const holdsById = kept.reduce(
    (sum, hold) => sum.set(hold.id, [...(sum.get(hold.id) ?? []), hold]),
    new Map<string, HeldWrite<T>[]>(),
  );
  const layOver = (item: T | undefined, holds: HeldWrite<T>[]) =>
    holds.reduce<T | undefined>((shown, hold) => {
      if (hold.item === null) return undefined;
      if (shown === undefined) return hold.item;
      return { ...shown, ...(pickFields(hold.item, hold.fields) as T) };
    }, item);
  const list = [
    ...incoming.flatMap((item) => {
      const holds = holdsById.get(idOf(item));
      if (holds === undefined) return [item];
      const shown = layOver(item, holds);
      return shown === undefined ? [] : [shown];
    }),
    ...[...holdsById].flatMap(([id, holds]) => {
      if (byId.has(id)) return [];
      const shown = layOver(undefined, holds);
      return shown === undefined ? [] : [shown];
    }),
  ];
  return { list, held: kept };
}

/**
 * A write's holds join the others in order. A newer hold takes over the fields it writes from a record's older holds,
 * so an Undo that puts a field back never leaves the older value showing; an older hold keeps only the fields it alone wrote, its item carrying the newer values.
 */
export const addHeldWrites = <T>(
  held: readonly HeldWrite<T>[],
  added: readonly HeldWrite<T>[],
): HeldWrite<T>[] => {
  const takenCreates = new Set<string>();
  const kept = held.flatMap((hold): HeldWrite<T>[] => {
    const newer = added.filter((entry) => entry.id === hold.id);
    if (newer.length === 0) return [hold];
    if (newer.some((entry) => entry.token === hold.token)) return [];
    if (hold.item === null || newer.some((entry) => entry.item === null)) {
      return [];
    }
    const taken = new Set(newer.flatMap((entry) => entry.fields));
    const fields = hold.fields.filter((field) => !taken.has(field));
    if (fields.length === 0) {
      if (hold.isEdit !== true) takenCreates.add(hold.id);
      return [];
    }
    const item = newer.reduce<T>(
      (sum, entry) => ({
        ...sum,
        ...(pickFields(entry.item, entry.fields) as T),
      }),
      hold.item,
    );
    return [rehold(hold, item, fields)];
  });
  return [
    ...kept,
    ...added.map((entry) =>
      takenCreates.has(entry.id) ? { ...entry, isEdit: false } : entry,
    ),
  ];
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
    return rehold(hold, { ...hold.item, ...fields } as T, hold.fields);
  });

const holdKey = <T>(hold: HeldWrite<T>) => `${hold.id}/${hold.token}`;

/** A hold stays only in a list its item belongs to; in any other it is a removal, which lands at once. An edit of a record the list never held enters it as new. */
export const forHeldList = <T>(
  held: readonly HeldWrite<T>[],
  belongs: (item: T) => boolean,
): HeldWrite<T>[] =>
  held.map((hold) => {
    if (hold.item !== null && !belongs(hold.item)) {
      return { ...hold, item: null, fields: [], fingerprint: '' };
    }
    if (hold.isEdit === true && hold.before != null && !belongs(hold.before)) {
      return { ...hold, isEdit: false };
    }
    return hold;
  });

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
