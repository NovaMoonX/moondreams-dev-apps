import { doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { generateUuid } from '@/utils';

import { addFeedbackStatusChange } from './feedbackWrites';
import type { Feedback, FeedbackGroup, FeedbackStatus } from './types';

const groupRef = (id: string) => doc(db, 'feedbackGroups', id);
const feedbackRef = (id: string) => doc(db, 'feedback', id);

/** Admin only: makes a group holding the given feedback and returns its id. */
export async function createFeedbackGroup({
  name,
  feedbackIds,
}: {
  name: string;
  feedbackIds: string[];
}): Promise<string> {
  const id = generateUuid();
  const now = Date.now();
  const group: FeedbackGroup = {
    id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    claudeSessionUrl: null,
  };
  const batch = writeBatch(db);
  batch.set(groupRef(id), group);
  feedbackIds.forEach((feedbackId) =>
    batch.update(feedbackRef(feedbackId), { groupId: id }),
  );
  await batch.commit();
  return id;
}

/** Admin only. */
export async function renameFeedbackGroup({
  groupId,
  name,
}: {
  groupId: string;
  name: string;
}): Promise<void> {
  const batch = writeBatch(db);
  batch.update(groupRef(groupId), { name: name.trim(), updatedAt: Date.now() });
  await batch.commit();
}

/** Admin only: puts the feedback in a group, or takes it out of any with a null `groupId`. */
export async function moveFeedbackToGroup({
  feedbackIds,
  groupId,
}: {
  feedbackIds: string[];
  groupId: string | null;
}): Promise<void> {
  const batch = writeBatch(db);
  feedbackIds.forEach((feedbackId) =>
    batch.update(feedbackRef(feedbackId), { groupId }),
  );
  if (groupId) batch.update(groupRef(groupId), { updatedAt: Date.now() });
  await batch.commit();
}

/** Admin only: ungroups the items the group holds and deletes the group; the feedback stays. */
export async function deleteFeedbackGroup({
  groupId,
  feedbackIds,
}: {
  groupId: string;
  feedbackIds: string[];
}): Promise<void> {
  const batch = writeBatch(db);
  feedbackIds.forEach((feedbackId) =>
    batch.update(feedbackRef(feedbackId), { groupId: null }),
  );
  batch.delete(groupRef(groupId));
  await batch.commit();
}

/** Admin only: gives every item not already at the status the same message and update a single change makes. */
export async function setGroupStatus({
  group,
  items,
  uid,
  status,
}: {
  group: FeedbackGroup;
  items: Feedback[];
  uid: string;
  status: FeedbackStatus;
}): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  items
    .filter((item) => item.status !== status)
    .forEach((feedback) =>
      addFeedbackStatusChange({ batch, feedback, uid, status, now }),
    );
  batch.update(groupRef(group.id), { updatedAt: now });
  await batch.commit();
}
