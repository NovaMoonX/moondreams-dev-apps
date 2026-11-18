import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { toByWho } from '@apps/helm/store/actions/keyDateIndexStore';
import type { KeyDateIndexSealed } from '@apps/helm/types';
import {
  countEntries,
  INDEX_DOC,
  mergeMonths,
  type ByWho,
} from '@apps/helm/utils/keyDateIndex';

export interface OpenKeyDateIndex {
  byWho: ByWho;
  entryCount: number;
  rebuiltAt: number | null;
}

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your dates did not open.');

/** The sealed index of the yearly dates: the single document, or the twelve month documents once it has split. A document that has not changed is not opened again, so a write elsewhere in the index costs one open. */
export function startKeyDateIndexListener(
  uid: string,
  read: SealedReader,
  onChange: (index: OpenKeyDateIndex) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const opened = new Map<string, { stamp: string; byWho: ByWho }>();

  const stop = onSnapshot(
    collection(db, 'apps', 'helm', 'users', uid, 'meta'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const docs = snapshot.docs.filter(
          (entry) =>
            entry.id === INDEX_DOC || entry.id.startsWith(`${INDEX_DOC}-`),
        );
        const single = docs.find((entry) => entry.id === INDEX_DOC);
        const used = single ? [single] : docs;
        const parts = await Promise.all(
          used.map(async (entry) => {
            const data = entry.data();
            const stamp = `${String(data.lastEditedAt)}:${String(data.entryCount)}`;
            const kept = opened.get(entry.id);
            if (kept?.stamp === stamp) return kept.byWho;
            const payload = await read<Partial<KeyDateIndexSealed>>(
              data.sealed,
            );
            const byWho = toByWho(payload.byWho);
            opened.set(entry.id, { stamp, byWho });
            return byWho;
          }),
        );
        if (current !== sequence.latest || run.isStopped) return;
        const byWho = parts.length === 1 ? parts[0] : mergeMonths(parts);
        const rebuilt = used
          .map((entry) => entry.data().rebuiltAt)
          .filter((value): value is number => typeof value === 'number');
        onChange({
          byWho,
          entryCount: countEntries(byWho),
          rebuiltAt: rebuilt.length > 0 ? Math.max(...rebuilt) : null,
        });
      } catch (error) {
        if (current === sequence.latest && !run.isStopped) {
          onError(toError(error));
        }
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
