import {
  collection,
  limit,
  onSnapshot,
  query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import { CONNECTIONS_LIMIT } from '@apps/helm/constants';
import {
  CONNECTION_KINDS,
  CONNECTION_STATUSES,
  type ConnectionSource,
} from '@apps/helm/engine/connections';
import { KIN_KINDS } from '@apps/helm/engine/kinKinds';
import type {
  Connection,
  ConnectionRelation,
  ConnectionSealed,
  OpenConnection,
} from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your connections did not open.');

const SOURCES: ConnectionSource[] = ['said', 'page', 'confirmed', 'refused'];

const toRelation = (value: unknown): ConnectionRelation | null =>
  value === 'friend' ||
  value === 'coworker' ||
  KIN_KINDS.some((entry) => entry.kind === value)
    ? (value as ConnectionRelation)
    : null;

/** A connection that won't open is kept, with no words, so a screen never draws it but a count still sees it. */
export async function openConnection(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenConnection | null> {
  const data = entry.data() as Partial<Connection>;
  const kind = CONNECTION_KINDS.find((one) => one === data.kind);
  const [first, second] = data.whoIds ?? [];
  if (!kind || typeof first !== 'string' || typeof second !== 'string')
    return null;
  const base = {
    id: entry.id,
    whoIds: [first, second] as [string, string],
    kind,
    source: SOURCES.find((one) => one === data.source) ?? 'page',
    createdBy: data.createdBy ?? 'nomos',
    executionId: data.executionId ?? null,
    createdAt: data.createdAt ?? 0,
    lastEditedAt: data.lastEditedAt ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This connection has no sealed words.');
    const payload = await read<Partial<ConnectionSealed>>(data.sealed);
    return {
      ...base,
      fromFirst: toRelation(payload.fromFirst),
      fromSecond: toRelation(payload.fromSecond),
      status:
        kind === 'couple'
          ? (CONNECTION_STATUSES.find((one) => one === payload.status) ?? null)
          : null,
      since: typeof payload.since === 'number' ? payload.since : null,
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      fromFirst: null,
      fromSecond: null,
      status: null,
      since: null,
      isUnreadable: true,
    };
  }
}

/** Every connection between the person's people, refused ones included. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startConnectionsListener(
  uid: string,
  read: SealedReader,
  onChange: (connections: OpenConnection[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'connections'),
      limit(CONNECTIONS_LIMIT),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openConnection(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened.flatMap((connection) => connection ?? []));
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
