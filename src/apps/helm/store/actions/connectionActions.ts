import { collection, doc, type DocumentData } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { runHeldTransaction } from '@apps/helm/store/actions/heldTransaction';

import {
  buildConnection,
  isShownConnection,
  toConnectionId,
  type ConnectionGenders,
  type ConnectionKind,
  type ConnectionRelation,
  type ConnectionWords,
  type CoupleStatus,
} from '@apps/helm/engine/connections';
import { openJson, sealJson } from '@apps/helm/security';
import type {
  Connection,
  ConnectionSealed,
  HelmEncryption,
  Sealed,
} from '@apps/helm/types';

const connectionsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'connections');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

export type ConnectionResult =
  'saved' | 'offline' | 'missing' | 'unreadable' | 'duplicate';

export interface NewConnection {
  firstId: string;
  secondId: string;
  kind: ConnectionKind;
  /** What `firstId` is to `secondId`; ignored for a couple, a friend and work. */
  relationOfFirstToSecond: ConnectionRelation | null;
  status: CoupleStatus | null;
  since: number | null;
  genders: ConnectionGenders;
}

/** An existing pair and kind is refused as `duplicate` inside the transaction; a refused proposal is replaced. Needs a connection. */
export async function addConnection(
  uid: string,
  encryption: HelmEncryption,
  input: NewConnection,
): Promise<Exclude<ConnectionResult, 'unreadable'>> {
  if (!navigator.onLine) return 'offline';
  if (input.firstId === input.secondId) return 'missing';
  const record = buildConnection(
    input.firstId,
    input.secondId,
    input.kind,
    input.relationOfFirstToSecond,
    input.status,
    input.since,
    input.genders,
  );
  const ref = doc(
    connectionsOf(uid),
    toConnectionId(input.firstId, input.secondId, input.kind),
  );
  const whoRefs = record.whoIds.map((id) =>
    doc(db, 'apps', 'helm', 'users', uid, 'who', id),
  );
  const sealed = await sealJson<ConnectionSealed>(
    {
      fromFirst: record.fromFirst,
      fromSecond: record.fromSecond,
      status: record.status,
      since: record.since,
    },
    encryption,
  );
  const now = Date.now();
  const connection: Connection = {
    whoIds: record.whoIds,
    kind: record.kind,
    source: 'page',
    createdBy: 'person',
    executionId: null,
    createdAt: now,
    lastEditedAt: null,
    sealed,
  };
  try {
    return await runHeldTransaction(uid, async (transaction) => {
      const [existing, ...whos] = await Promise.all([
        transaction.get(ref),
        ...whoRefs.map((whoRef) => transaction.get(whoRef)),
      ]);
      if (whos.some((who) => !who.exists())) return 'missing';
      if (existing.exists() && isShownConnection(existing.data() as Connection))
        return 'duplicate';
      transaction.set(ref, connection);
      return 'saved';
    });
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

export interface ConnectionChange {
  /** A family word, said as what `fromId` is to the other person; the other side is worked out again. */
  relation?: { fromId: string; word: ConnectionRelation | null };
  /** A couple's status; ignored for any other kind. */
  status?: CoupleStatus | null;
  since?: number | null;
  genders: ConnectionGenders;
}

/** Re-reads the document so the other side is worked out from what is stored; `before` is what Undo hands to `setConnectionWords`. Needs a connection. */
export async function updateConnection(
  uid: string,
  encryption: HelmEncryption,
  id: string,
  change: ConnectionChange,
): Promise<{ result: ConnectionResult; before: ConnectionWords | null }> {
  if (!navigator.onLine) return { result: 'offline', before: null };
  const ref = doc(connectionsOf(uid), id);
  try {
    return await runHeldTransaction(uid, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists())
        return { result: 'missing' as const, before: null };
      const current = snapshot.data() as Connection;
      const opened = await openJson<ConnectionSealed>(
        current.sealed as Sealed,
        encryption,
      ).catch(() => null);
      if (!opened) return { result: 'unreadable' as const, before: null };
      const [first, second] = current.whoIds;
      const status =
        change.status === undefined ? opened.status : change.status;
      const since = change.since === undefined ? opened.since : change.since;
      const next = change.relation
        ? buildConnection(
            change.relation.fromId,
            change.relation.fromId === first ? second : first,
            current.kind,
            change.relation.word,
            status,
            since,
            change.genders,
          )
        : {
            fromFirst: opened.fromFirst,
            fromSecond: opened.fromSecond,
            status: current.kind === 'couple' ? status : null,
            since,
          };
      transaction.update(ref, {
        sealed: await sealJson<ConnectionSealed>(
          {
            fromFirst: next.fromFirst,
            fromSecond: next.fromSecond,
            status: next.status,
            since: next.since,
          },
          encryption,
        ),
        lastEditedAt: Date.now(),
      });
      return {
        result: 'saved' as const,
        before: {
          fromFirst: opened.fromFirst,
          fromSecond: opened.fromSecond,
          status: opened.status,
          since: opened.since,
        },
      };
    });
  } catch (error) {
    if (isUnavailable(error)) return { result: 'offline', before: null };
    throw error;
  }
}

/** Undo of a change. */
export async function setConnectionWords(
  uid: string,
  encryption: HelmEncryption,
  id: string,
  words: ConnectionWords,
): Promise<ConnectionResult> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(connectionsOf(uid), id);
  try {
    return await runHeldTransaction(uid, async (transaction) => {
      if (!(await transaction.get(ref)).exists()) return 'missing';
      transaction.update(ref, {
        sealed: await sealJson<ConnectionSealed>(words, encryption),
        lastEditedAt: Date.now(),
      });
      return 'saved';
    });
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

export interface RemovedConnection {
  id: string;
  data: DocumentData;
}

/** Needs a connection. */
export async function removeConnection(
  uid: string,
  id: string,
): Promise<RemovedConnection | null> {
  const ref = doc(connectionsOf(uid), id);
  return runHeldTransaction(uid, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) return null;
    transaction.delete(ref);
    return { id, data: snapshot.data() };
  });
}

/** Not put back when the same pair and kind was made again meanwhile. */
export async function restoreConnection(
  uid: string,
  removed: RemovedConnection,
): Promise<'restored' | 'exists'> {
  const ref = doc(connectionsOf(uid), removed.id);
  return runHeldTransaction(uid, async (transaction) => {
    if ((await transaction.get(ref)).exists()) return 'exists';
    transaction.set(ref, { ...removed.data, lastEditedAt: Date.now() });
    return 'restored';
  });
}
