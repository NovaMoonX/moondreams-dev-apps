import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import type {
  MemoryDoc,
  MemorySealed,
  OpenMemory,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** Every memory. A slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startMemoriesListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (memories: OpenMemory[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, 'memories'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry): Promise<OpenMemory> => {
            const data = entry.data() as MemoryDoc;
            return {
              ...(await read<MemorySealed>(data.sealed)),
              id: entry.id,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
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
