import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import type {
  ExpenseDoc,
  ExpenseSealed,
  OpenExpense,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** Every expense group. A slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startExpensesListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (expenses: OpenExpense[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, 'expenses'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry): Promise<OpenExpense> => {
            const data = entry.data() as ExpenseDoc;
            const payload = await read<ExpenseSealed>(data.sealed);
            return {
              id: entry.id,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              name: payload.name,
              note: payload.note ?? null,
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
