import { useEffect, useState } from 'react';

import { collection, onSnapshot } from 'firebase/firestore';

import type {
  AccountStatus,
  ConnectionAccount,
} from '@/lib/connections/contract';
import { db } from '@lib/firebase/config';

export type ConnectionAccountWithId = ConnectionAccount & { id: string };

const STATUSES: AccountStatus[] = ['live', 'needsReconnect', 'revoked'];

/** An account written before a field existed reads that field as its default; a status this version doesn't know reads as revoked. */
const toAccount = (
  id: string,
  data: Partial<ConnectionAccount>,
): ConnectionAccountWithId => ({
  id,
  provider: 'google',
  email: data.email ?? '',
  label: data.label ?? null,
  grantedScopes: data.grantedScopes ?? [],
  status: STATUSES.find((status) => status === data.status) ?? 'revoked',
  connectedAt: data.connectedAt ?? 0,
  lastError: data.lastError ?? null,
});

interface Loaded {
  uid: string;
  accounts: ConnectionAccountWithId[];
  error: Error | null;
  isServerKnown: boolean;
}

/** The person's connected outside accounts (Google), live, revoked ones left out. */
export function useConnectionAccounts(uid: string | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      collection(db, 'connections', uid, 'accounts'),
      { includeMetadataChanges: true },
      (snapshot) =>
        setLoaded({
          uid,
          accounts: snapshot.docs
            .map((entry) =>
              toAccount(entry.id, entry.data() as Partial<ConnectionAccount>),
            )
            .filter((account) => account.status !== 'revoked'),
          error: null,
          isServerKnown: !(snapshot.empty && snapshot.metadata.fromCache),
        }),
      (error) => {
        console.error('Connection accounts failed', error);
        setLoaded({ uid, accounts: [], error, isServerKnown: false });
      },
    );
  }, [uid]);

  const current = loaded?.uid === uid ? loaded : null;

  return {
    accounts: current?.accounts ?? [],
    isLoading: uid !== null && !current,
    error: current?.error ?? null,
    isKnown: !!current && !current.error && current.isServerKnown,
  };
}
