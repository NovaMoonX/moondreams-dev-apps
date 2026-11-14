import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import type {
  Execution,
  ExecutionSealed,
  OpenExecution,
} from '@apps/helm/types';

const executionsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'executions');

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your activity did not open.');

/** An execution that won't open is kept, saying nothing, so its turn can say it couldn't be opened. */
export async function openExecution(
  entry: DocumentSnapshot,
  read: SealedReader,
): Promise<OpenExecution> {
  const data = (entry.data() ?? {}) as Partial<Execution>;
  const base = {
    id: entry.id,
    captureId: data.captureId ?? null,
    actor: data.actor ?? 'nomos',
    category: data.category ?? 'organize',
    autonomyLevel: data.autonomyLevel ?? 2,
    state: data.state ?? 'succeeded',
    effectRefs: data.effectRefs ?? [],
    linkedWhoIds: data.linkedWhoIds ?? [],
    linkedPlaceIds: data.linkedPlaceIds ?? [],
    undoesExecutionId: data.undoesExecutionId ?? null,
    undoneByExecutionId: data.undoneByExecutionId ?? null,
    questionRef: data.questionRef ?? null,
    errorCode: data.errorCode ?? null,
    createdAt: data.createdAt ?? 0,
    decidedAt: data.decidedAt ?? null,
    finishedAt: data.finishedAt ?? null,
  } as const;
  try {
    if (!data.sealed) throw new Error('This execution has no sealed payload.');
    const payload = await read<Partial<ExecutionSealed>>(data.sealed);
    return {
      ...base,
      summary: payload.summary ?? '',
      said: payload.said ?? null,
      effects: payload.effects ?? [],
      undoReport: payload.undoReport ?? null,
      spoken: payload.spoken ?? null,
      goneIds: payload.goneIds ?? null,
      lines: payload.lines ?? [],
      isUnreadable: false,
    };
  } catch {
    return {
      ...base,
      summary: '',
      said: null,
      effects: [],
      undoReport: null,
      spoken: null,
      goneIds: null,
      lines: [],
      isUnreadable: true,
    };
  }
}

const openExecutions = (docs: QueryDocumentSnapshot[], read: SealedReader) =>
  Promise.all(docs.map((entry) => openExecution(entry, read)));

/** Executions made from `windowStart` on, the window home's turns cover. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startRecentExecutionsListener(
  uid: string,
  read: SealedReader,
  windowStart: number,
  onChange: (executions: OpenExecution[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      executionsOf(uid),
      where('createdAt', '>=', windowStart),
      orderBy('createdAt', 'asc'),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await openExecutions(snapshot.docs, read);
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

/** The newest `count` executions, live. A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startActivityListener(
  uid: string,
  read: SealedReader,
  count: number,
  onChange: (executions: OpenExecution[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(executionsOf(uid), orderBy('createdAt', 'desc'), limit(count)),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await openExecutions(snapshot.docs, read);
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => {
      if (!run.isStopped) onError(toError(error));
    },
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

/** The executions with these ids, for turns whose execution isn't in the store; an id that is missing or won't open comes back as failed, one that couldn't be fetched (offline) as neither. */
export async function fetchExecutionsById(
  uid: string,
  read: SealedReader,
  ids: string[],
) {
  const results = await Promise.all(
    ids.map((id) =>
      getDoc(doc(executionsOf(uid), id)).then(
        (snapshot) =>
          snapshot.exists() ? openExecution(snapshot, read) : null,
        () => undefined,
      ),
    ),
  );
  return {
    opened: results.flatMap((result) =>
      result && !result.isUnreadable ? [result] : [],
    ),
    failedIds: ids.filter((_id, index) => {
      const result = results[index];
      return result === null || (result !== undefined && result.isUnreadable);
    }),
  };
}
