import {
  collection,
  doc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { PipelineInbox, PipelineSession } from '@/lib/admin/pipelineTypes';
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
