import { createHash } from 'node:crypto';

import { getFirestore } from 'firebase-admin/firestore';

type CacheCollection = 'searchCache' | 'movieCache';

/** A document id for any cache key (search text can contain characters ids can't). */
export function toCacheId(key: string) {
  const result = createHash('sha256').update(key).digest('hex').slice(0, 40);
  return result;
}

export interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

export async function readCache<T>(collection: CacheCollection, id: string): Promise<CacheEntry<T> | null> {
  const snapshot = await getFirestore().doc(`apps/a-list/${collection}/${id}`).get();
  const cachedAt = snapshot.get('cachedAt') as number | undefined;
  if (!snapshot.exists || typeof cachedAt !== 'number') {
    return null;
  }

  const result = { value: snapshot.get('value') as T, cachedAt };
  return result;
}

export function isFresh(entry: CacheEntry<unknown>, maxAgeMs: number) {
  return Date.now() - entry.cachedAt <= maxAgeMs;
}

export async function writeCache<T>(collection: CacheCollection, id: string, value: T): Promise<void> {
  await getFirestore().doc(`apps/a-list/${collection}/${id}`).set({ value, cachedAt: Date.now() });
}
