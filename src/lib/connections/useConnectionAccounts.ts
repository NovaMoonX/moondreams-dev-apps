import { useCallback, useSyncExternalStore } from 'react';

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
  accounts: ConnectionAccountWithId[];
  error: Error | null;
  isServerKnown: boolean;
}

interface Shared {
  loaded: Loaded | null;
  watchers: Set<() => void>;
  stop: () => void;
}

const shared = new Map<string, Shared>();

const start = (uid: string, entry: Shared) => {
  const publish = (loaded: Loaded) => {
    entry.loaded = loaded;
    entry.watchers.forEach((notify) => notify());
  };
  return onSnapshot(
    collection(db, 'connections', uid, 'accounts'),
    { includeMetadataChanges: true },
    (snapshot) =>
      publish({
        accounts: snapshot.docs
          .map((doc) =>
            toAccount(doc.id, doc.data() as Partial<ConnectionAccount>),
          )
          .filter((account) => account.status !== 'revoked'),
        error: null,
        isServerKnown: !(snapshot.empty && snapshot.metadata.fromCache),
      }),
    (error) => {
      console.error('Connection accounts failed', error);
      publish({ accounts: [], error, isServerKnown: false });
    },
  );
};

/** One listener per person however many screens watch it; it stops with its last watcher. */
const subscribeTo = (uid: string, notify: () => void) => {
  const entry: Shared = shared.get(uid) ?? {
    loaded: null,
    watchers: new Set(),
    stop: () => {},
  };
  if (!shared.has(uid)) {
    shared.set(uid, entry);
    entry.stop = start(uid, entry);
  }
  entry.watchers.add(notify);
  return () => {
    entry.watchers.delete(notify);
    if (entry.watchers.size > 0) return;
    entry.stop();
    shared.delete(uid);
  };
};

const NO_ACCOUNTS: ConnectionAccountWithId[] = [];

/** The person's connected outside accounts (Google), live, revoked ones left out. */
export function useConnectionAccounts(uid: string | null) {
  const subscribe = useCallback(
    (notify: () => void) => (uid ? subscribeTo(uid, notify) : () => {}),
    [uid],
  );
  const current = useSyncExternalStore(
    subscribe,
    () => (uid ? (shared.get(uid)?.loaded ?? null) : null),
    () => null,
  );

  return {
    accounts: current?.accounts ?? NO_ACCOUNTS,
    isLoading: uid !== null && !current,
    error: current?.error ?? null,
    isKnown: !!current && !current.error && current.isServerKnown,
  };
}
