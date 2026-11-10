import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type DocumentData,
  type Transaction,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { openJson, sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  KeyDateIndexSealed,
  Sealed,
} from '@apps/helm/types';
import {
  countEntries,
  INDEX_DOC,
  mergeMonths,
  MONTH_DOC_IDS,
  planIndexWrite,
  type ByWho,
  type IndexEntry,
} from '@apps/helm/utils/keyDateIndex';

export interface IndexState {
  byWho: ByWho;
  entryCount: number;
  rebuiltAt: number | null;
  /** The index documents that exist now, so a write can delete the ones it replaces. */
  existingIds: string[];
}

const metaOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'meta');

const isEntry = (value: unknown): value is IndexEntry =>
  Array.isArray(value) &&
  typeof value[0] === 'string' &&
  typeof value[2] === 'number';

/** Keeps the entries that are shaped like one; a damaged one is left out rather than failing the whole index. */
export const toByWho = (raw: unknown): ByWho =>
  Object.fromEntries(
    Object.entries((raw ?? {}) as Record<string, unknown>).flatMap(
      ([whoId, entries]) => {
        const kept = Array.isArray(entries) ? entries.filter(isEntry) : [];
        return kept.length > 0 ? [[whoId, kept]] : [];
      },
    ),
  );

interface IndexSnap {
  id: string;
  exists: () => boolean;
  data: () => DocumentData | undefined;
}

const toState = async (
  snaps: IndexSnap[],
  encryption: HelmEncryption,
): Promise<IndexState> => {
  const present = snaps.filter((snap) => snap.exists());
  if (present.length === 0) {
    return { byWho: {}, entryCount: 0, rebuiltAt: null, existingIds: [] };
  }
  const parts = await Promise.all(
    present.map(async (snap) =>
      toByWho(
        (
          await openJson<Partial<KeyDateIndexSealed>>(
            snap.data()?.sealed as Sealed,
            encryption,
          )
        ).byWho,
      ),
    ),
  );
  const byWho = parts.length === 1 ? parts[0] : mergeMonths(parts);
  const rebuilt = present
    .map((snap) => snap.data()?.rebuiltAt)
    .filter((value): value is number => typeof value === 'number');
  return {
    byWho,
    entryCount: countEntries(byWho),
    rebuiltAt: rebuilt.length > 0 ? Math.max(...rebuilt) : null,
    existingIds: present.map((snap) => snap.id),
  };
};

/** Reads the index inside a transaction: the single document, else the twelve month documents. */
export async function readIndexIn(
  transaction: Transaction,
  uid: string,
  encryption: HelmEncryption,
): Promise<IndexState> {
  const meta = metaOf(uid);
  const first = await transaction.get(doc(meta, INDEX_DOC));
  if (first.exists()) return toState([first], encryption);
  const rest = await Promise.all(
    MONTH_DOC_IDS.map((id) => transaction.get(doc(meta, id))),
  );
  return toState(rest, encryption);
}

/** Reads the index outside a transaction. */
export async function readIndexOnce(
  uid: string,
  encryption: HelmEncryption,
): Promise<IndexState> {
  const meta = metaOf(uid);
  const first = await getDoc(doc(meta, INDEX_DOC));
  if (first.exists()) return toState([first], encryption);
  const rest = await Promise.all(
    MONTH_DOC_IDS.map((id) => getDoc(doc(meta, id))),
  );
  return toState(rest, encryption);
}

/** Writes the index in the same transaction as the change: one document, or twelve once it passes the split, deleting what it replaces. */
export async function writeIndexIn(
  transaction: Transaction,
  uid: string,
  encryption: HelmEncryption,
  input: {
    byWho: ByWho;
    rebuiltAt: number | null;
    existingIds: string[];
    now: number;
  },
) {
  const meta = metaOf(uid);
  const plan = planIndexWrite(input.byWho);
  const sealedDocs = await Promise.all(
    plan.docs.map(async (entry) => ({
      entry,
      sealed: await sealJson<KeyDateIndexSealed>(
        { byWho: entry.byWho },
        encryption,
      ),
    })),
  );
  sealedDocs.forEach(({ entry, sealed }) =>
    transaction.set(doc(meta, entry.id), {
      entryCount: entry.entryCount,
      rebuiltAt: input.rebuiltAt,
      lastEditedAt: input.now,
      sealed,
    }),
  );
  plan.deleteIds
    .filter((id) => input.existingIds.includes(id))
    .forEach((id) => transaction.delete(doc(meta, id)));
}

/** Every yearly date, read once, for a repair when the index and the people's counters disagree. */
export const readYearlyDateDocs = (uid: string) =>
  getDocs(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'keyDates'),
      where('shape', '==', 'yearly'),
    ),
  );
