import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import type {
  AccountDoc,
  AccountSealed,
  OpenAccount,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** Every account, archived ones too. A slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startAccountsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (accounts: OpenAccount[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };
  const read = createSealedReader(encryption);

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, 'accounts'),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map(async (entry): Promise<OpenAccount> => {
            const data = entry.data() as AccountDoc;
            const payload = await read<Partial<AccountSealed>>(data.sealed);
            return {
              id: entry.id,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              archivedAt: data.archivedAt ?? null,
              linkId: data.linkId ?? null,
              name: payload.name ?? '',
              institution: payload.institution ?? '',
              kind: payload.kind ?? 'checking',
              countedTowardTotal: payload.countedTowardTotal ?? false,
              isPullAccount: payload.isPullAccount ?? false,
              lastFour: payload.lastFour ?? null,
              balanceCents: payload.balanceCents ?? null,
              balanceOn: payload.balanceOn ?? null,
              holds: payload.holds ?? [],
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
