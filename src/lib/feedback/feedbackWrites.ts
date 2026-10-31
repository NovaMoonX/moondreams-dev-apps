import type { User } from 'firebase/auth';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

import { SITE_VERSION } from '@lib/app';
import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils';

import type {
  Feedback,
  FeedbackContext,
  FeedbackKind,
  FeedbackMessage,
  FeedbackStatus,
} from './types';

const feedbackRef = (id: string) => doc(db, 'feedback', id);
const messageRef = (feedbackId: string, messageId: string) =>
  doc(db, 'feedback', feedbackId, 'messages', messageId);

/** Where the person is right now, gathered so they never have to describe it. */
export function buildFeedbackContext({
  appId,
  path,
}: {
  appId: string | null;
  path: string;
}): FeedbackContext {
  return {
    appId,
    path,
    siteVersion: SITE_VERSION,
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

/** Sends a new bug, idea or question and returns its id. */
export async function sendFeedback({
  user,
  kind,
  text,
  context,
}: {
  user: User;
  kind: FeedbackKind;
  text: string;
  context: FeedbackContext;
}): Promise<string> {
  const id = generateUuid();
  const now = Date.now();
  const feedback: Feedback = {
    id,
    uid: user.uid,
    authorName:
      user.displayName && !user.displayName.includes('@')
        ? user.displayName
        : null,
    authorEmail: user.email ?? null,
    kind,
    text: text.trim(),
    status: 'new',
    context,
    isUnreadBySender: false,
    isUnreadByAdmin: true,
    createdAt: now,
    lastActivityAt: now,
  };
  await setDoc(feedbackRef(id), feedback);
  return id;
}

/** A reply from either side; flags the other side's inbox. */
export async function replyToFeedback({
  feedback,
  uid,
  isAdmin,
  text,
}: {
  feedback: Feedback;
  uid: string;
  isAdmin: boolean;
  text: string;
}): Promise<void> {
  const messageId = generateUuid();
  const now = Date.now();
  const message: FeedbackMessage = {
    id: messageId,
    kind: 'reply',
    fromUid: uid,
    isFromAdmin: isAdmin,
    text: text.trim(),
    status: null,
    createdAt: now,
  };
  const batch = writeBatch(db);
  batch.set(messageRef(feedback.id, messageId), message);
  batch.update(
    feedbackRef(feedback.id),
    isAdmin
      ? { lastActivityAt: now, isUnreadBySender: true }
      : { lastActivityAt: now, isUnreadByAdmin: true },
  );
  await batch.commit();
}

/** Admin only: records the change as a message so the sender's thread shows it. */
export async function setFeedbackStatus({
  feedback,
  uid,
  status,
}: {
  feedback: Feedback;
  uid: string;
  status: FeedbackStatus;
}): Promise<void> {
  const messageId = generateUuid();
  const now = Date.now();
  const message: FeedbackMessage = {
    id: messageId,
    kind: 'status',
    fromUid: uid,
    isFromAdmin: true,
    text: null,
    status,
    createdAt: now,
  };
  const batch = writeBatch(db);
  batch.set(messageRef(feedback.id, messageId), message);
  batch.update(feedbackRef(feedback.id), {
    status,
    lastActivityAt: now,
    isUnreadBySender: true,
  });
  await batch.commit();
}

/** Clears one side's unread flag; the caller only calls it when the flag is set. */
export async function markFeedbackSeen({
  feedbackId,
  as,
}: {
  feedbackId: string;
  as: 'sender' | 'admin';
}): Promise<void> {
  await updateDoc(
    feedbackRef(feedbackId),
    as === 'sender' ? { isUnreadBySender: false } : { isUnreadByAdmin: false },
  );
}
