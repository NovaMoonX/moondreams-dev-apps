import { useCallback, useState } from 'react';

import type { ShoppingItem } from '@apps/pinch/types';

const MAX_REMEMBERED = 200;

const getKey = (uid: string) => `pinch:${uid}:pantry-put-away`;

const readLedger = (uid: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(getKey(uid)) ?? '[]',
    );
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
};

const writeLedger = (uid: string, entries: string[]) => {
  try {
    localStorage.setItem(getKey(uid), JSON.stringify(entries));
  } catch {
    // Only the guard against offering the same line twice is lost.
  }
};

/** A line's stamp changes whenever it is ticked, unticked or edited, so a line put away stays out of the offer until something happens to it again. */
const stampOf = (item: Pick<ShoppingItem, 'id' | 'updatedAt'>) =>
  `${item.id}:${item.updatedAt}`;

/** Remembers on this device which ticked shopping lines were already added to the pantry, so the chip never offers the same cart twice. The pantry itself is the record; this only keeps a second tap from making a second package, and another device does not share it. */
export function useShoppingPutAway(uid: string) {
  const [remembered, setRemembered] = useState<ReadonlySet<string>>(
    () => new Set(readLedger(uid)),
  );

  const isPutAway = useCallback(
    (item: Pick<ShoppingItem, 'id' | 'updatedAt'>) =>
      remembered.has(stampOf(item)),
    [remembered],
  );

  const markPutAway = useCallback(
    (items: Pick<ShoppingItem, 'id' | 'updatedAt'>[]) =>
      setRemembered((current) => {
        const next = [...current, ...items.map(stampOf)].slice(-MAX_REMEMBERED);
        writeLedger(uid, next);
        return new Set(next);
      }),
    [uid],
  );

  return { isPutAway, markPutAway };
}
