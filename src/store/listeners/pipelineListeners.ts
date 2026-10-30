import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  type Unsubscribe,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  PipelineInbox,
  PipelineSession,
  PipelineSessionCost,
} from '@/lib/admin/pipelineTypes';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';

/** Admin only: the Claude Code sessions that report their state. */
export function startPipelineSessionsListener(
  onChange: (sessions: PipelineSession[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<PipelineSession>({
    query: collection(db, 'pipelineSessions'),
    normalize: (_id, data) => data as PipelineSession,
    onData: onChange,
    onError,
  });
}

/** Admin only: every session's token use that was updated since `sinceMs`. */
export async function fetchPipelineCosts(
  sinceMs: number,
): Promise<PipelineSessionCost[]> {
  const snapshot = await getDocs(
    query(collection(db, 'pipelineCost'), where('updatedAt', '>=', sinceMs)),
  );
  return snapshot.docs.map((item) => item.data() as PipelineSessionCost);
}

/** Admin only: the one document that lists the open pull requests and what each needs. */
export function startPipelineInboxListener(
  onChange: (inbox: PipelineInbox | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'pipeline', 'inbox'),
    (snapshot) =>
      onChange(snapshot.exists() ? (snapshot.data() as PipelineInbox) : null),
    onError,
  );
}
