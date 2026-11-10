import { useEffect, useMemo, useState } from 'react';

import { collection, onSnapshot, query, where } from 'firebase/firestore';

import type {
  ConnectionGrant,
  ConnectorId,
  GrantStatus,
} from '@/lib/connections/contract';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@lib/firebase/config';

export type ConnectionGrantWithId = ConnectionGrant & { id: string };

const STATUSES: GrantStatus[] = ['live', 'needsReconnect', 'noAccess', 'ended'];

/** A grant written before a field existed reads that field as its default; a status this version doesn't know reads as ended. */
const toGrant = (
  id: string,
  data: Partial<ConnectionGrant>,
): ConnectionGrantWithId => ({
  id,
  readerAppId: data.readerAppId ?? '',
  connectorId: data.connectorId ?? ('app:' as ConnectorId),
  accountId: data.accountId ?? '',
  categories: data.categories ?? {},
  options: data.options ?? null,
  status: STATUSES.find((status) => status === data.status) ?? 'ended',
  categoryState: data.categoryState ?? {},
  errors: data.errors ?? [],
  newCategoryIds: data.newCategoryIds ?? [],
  lastSyncAt: data.lastSyncAt ?? null,
  syncLeaseUntil: data.syncLeaseUntil ?? null,
  keptCopies: data.keptCopies ?? null,
  createdAt: data.createdAt ?? 0,
  updatedAt: data.updatedAt ?? 0,
  endedAt: data.endedAt ?? null,
});

interface Loaded {
  key: string;
  grants: ConnectionGrantWithId[];
  error: Error | null;
}

/** The person's grants for one reader app, live; ended ones only with `includeEnded`. */
export function useConnections({
  readerAppId,
  includeEnded = false,
}: {
  readerAppId: string;
  includeEnded?: boolean;
}) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const key = uid ? `${uid}:${readerAppId}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!uid || !key) return;
    return onSnapshot(
      query(
        collection(db, 'connections', uid, 'grants'),
        where('readerAppId', '==', readerAppId),
      ),
      (snapshot) =>
        setLoaded({
          key,
          grants: snapshot.docs.map((entry) =>
            toGrant(entry.id, entry.data() as Partial<ConnectionGrant>),
          ),
          error: null,
        }),
      (error) => {
        console.error('Connections list failed', error);
        setLoaded({ key, grants: [], error });
      },
    );
  }, [uid, key, readerAppId]);

  const current = loaded?.key === key ? loaded : null;
  const grants = useMemo(
    () =>
      (current?.grants ?? []).filter(
        (grant) => includeEnded || grant.status !== 'ended',
      ),
    [current, includeEnded],
  );

  return {
    grants,
    isLoading: key !== null && !current,
    error: current?.error ?? null,
  };
}
