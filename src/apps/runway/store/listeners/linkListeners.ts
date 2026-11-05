import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import type {
  AccountBalanceDoc,
  LinkDoc,
  LinkSealed,
  OpenAccountBalance,
  OpenLink,
  RunwayEncryption,
} from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** Opens every document of one collection under the plan, keeping the newest snapshot and dropping a slow one that lands late. */
function startOpenedListener<TDoc extends { id: string }, TOpen>(
  uid: string,
  collectionName: string,
  open: (data: TDoc) => Promise<TOpen>,
  onChange: (opened: TOpen[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, collectionName),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      try {
        const opened = await Promise.all(
          snapshot.docs.map((entry) => open(entry.data() as TDoc)),
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

/** Every link the bank sign-ins made; Functions write them, this only reads. */
export function startLinksListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (links: OpenLink[]) => void,
  onError: (error: Error) => void,
) {
  const read = createSealedReader(encryption);
  return startOpenedListener<LinkDoc, OpenLink>(
    uid,
    'links',
    async (data) => {
      const payload = await read<Partial<LinkSealed>>(data.sealed);
      return {
        id: data.id,
        status: data.status,
        lastSyncAt: data.lastSyncAt ?? null,
        createdAt: data.createdAt,
        institutionName: payload.institutionName ?? '',
        providerAccounts: (payload.providerAccounts ?? []).map((entry) => ({
          ...entry,
          mask: entry.mask ?? null,
          accountId: entry.accountId ?? null,
          cardId: entry.cardId ?? null,
          isSkipped: entry.isSkipped ?? false,
        })),
      };
    },
    onChange,
    onError,
  );
}

/** What the bank last said each linked account or card holds, keyed by the account or card id. */
export function startAccountBalancesListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (balances: OpenAccountBalance[]) => void,
  onError: (error: Error) => void,
) {
  const read = createSealedReader(encryption);
  return startOpenedListener<AccountBalanceDoc, OpenAccountBalance>(
    uid,
    'accountBalances',
    async (data) => {
      const payload = await read<{ cents: number }>(data.sealed);
      return { id: data.id, asOf: data.asOf, cents: payload.cents };
    },
    onChange,
    onError,
  );
}
