import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import type {
  CardDoc,
  CardSealed,
  OpenCard,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** Every card, archived ones too. A slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startCardsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (cards: OpenCard[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, 'cards'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry): Promise<OpenCard> => {
            const data = entry.data() as CardDoc;
            const payload = await read<CardSealed>(data.sealed);
            return {
              id: entry.id,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              archivedAt: data.archivedAt ?? null,
              issuer: payload.issuer,
              name: payload.name ?? null,
              dueDay: payload.dueDay ?? null,
            };
          }),
        );
        if (current !== sequence.latest || run.isStopped) return;
        onChange(opened);
      } catch (error) {
        if (current === sequence.latest) onError(toError(error));
      }
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
