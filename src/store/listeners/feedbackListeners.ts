import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type {
  Feedback,
  FeedbackGroup,
  FeedbackMessage,
} from '@/lib/feedback/types';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';

// The badge counts up to this many; the UI shows the cap as "99+".
export const UNREAD_FEEDBACK_LIMIT = 100;
export const ALL_FEEDBACK_LIMIT = 300;

const normalize = (id: string, data: unknown): Feedback => {
  const stored = data as Partial<Feedback>;
  return {
    ...(data as Feedback),
    id,
    groupId: stored.groupId ?? null,
    claudeSessionUrl: stored.claudeSessionUrl ?? null,
    agentState: stored.agentState ?? null,
    agentQueuedAt: stored.agentQueuedAt ?? null,
    agentPrUrl: stored.agentPrUrl ?? null,
    agentNote: stored.agentNote ?? null,
  };
};

/** Everything the signed-in person has sent, newest activity first. */
export function startMyFeedbackListener(
  uid: string,
  onChange: (feedback: Feedback[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<Feedback>({
    query: query(
      collection(db, 'feedback'),
      where('uid', '==', uid),
      orderBy('lastActivityAt', 'desc'),
    ),
    normalize,
    onData: onChange,
    onError,
  });
}

/** The feedback the admin hasn't seen; only the count is kept. Admin only. */
export function startAdminUnreadFeedbackListener(
  onChange: (count: number) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<Feedback>({
    query: query(
      collection(db, 'feedback'),
      where('isUnreadByAdmin', '==', true),
      limit(UNREAD_FEEDBACK_LIMIT),
    ),
    normalize,
    onData: (items) => onChange(items.length),
    onError,
  });
}

/** Every feedback, newest activity first. Admin only. */
export function startAllFeedbackListener(
  onChange: (feedback: Feedback[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<Feedback>({
    query: query(
      collection(db, 'feedback'),
      orderBy('lastActivityAt', 'desc'),
      limit(ALL_FEEDBACK_LIMIT),
    ),
    normalize,
    onData: onChange,
    onError,
  });
}

/** One feedback's thread, oldest first. */
export function startFeedbackMessagesListener(
  feedbackId: string,
  onChange: (messages: FeedbackMessage[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<FeedbackMessage>({
    query: query(
      collection(db, 'feedback', feedbackId, 'messages'),
      orderBy('createdAt', 'asc'),
    ),
    normalize: (id, data) => ({ ...(data as FeedbackMessage), id }),
    onData: onChange,
    onError,
  });
}

/** Every feedback group, most recently touched first. Admin only. */
export function startFeedbackGroupsListener(
  onChange: (groups: FeedbackGroup[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return createFirestoreCollectionListener<FeedbackGroup>({
    query: query(
      collection(db, 'feedbackGroups'),
      orderBy('updatedAt', 'desc'),
    ),
    normalize: (id, data) => ({
      ...(data as FeedbackGroup),
      id,
      claudeSessionUrl:
        (data as Partial<FeedbackGroup>).claudeSessionUrl ?? null,
    }),
    onData: onChange,
    onError,
  });
}

/** Whether a Claude routine is connected; the token itself is never readable. Admin only. */
export function startClaudeRoutineStatusListener(
  onChange: (isConnected: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'adminSettings', 'claudeRoutineStatus'),
    (snapshot) => onChange(snapshot.data()?.isConnected === true),
    onError,
  );
}

/** Whether Claude works on feedback by itself. Admin only. */
export function startFeedbackAutomationListener(
  onChange: (isOn: boolean) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'adminSettings', 'feedbackAutomation'),
    (snapshot) => onChange(snapshot.data()?.isOn === true),
    onError,
  );
}
