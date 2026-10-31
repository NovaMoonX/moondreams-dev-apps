import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type QueryDocumentSnapshot,
  type Firestore,
  type WriteBatch,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  buildFeedbackHandoffText,
  fireRoutine,
  readClaudeRoutine,
  readHandoffItems,
} from './claudeHandoff.js';
import {
  addSessionToUsage,
  bucketQueued,
  CAP_HELD_NOTE,
  getPrStateUpdate,
  getSessionsLeft,
  isBucketDue,
  MAX_FIRE_FAILURES,
  registerFailure,
  type PrReport,
  type SessionBucket,
  type SessionUsage,
} from './feedbackAutomationPlan.js';

if (getApps().length === 0) {
  initializeApp();
}

const AUTOMATION_UID = 'claude-automation';
const MAX_QUEUED_READ = 100;
const usageRef = (firestore: Firestore) =>
  firestore.doc('adminSettings/feedbackAutomationUsage');

const isAutomationOn = async (firestore: Firestore) =>
  (await firestore.doc('adminSettings/feedbackAutomation').get()).data()
    ?.isOn === true;

/** Adds the thread message for a status change and returns the fields the item takes, as `addFeedbackStatusChange` does for the admin's own change. */
function addStatusChange(
  firestore: Firestore,
  batch: WriteBatch,
  feedbackId: string,
  status: string,
  now: number,
) {
  const messageId = randomUUID();
  batch.set(firestore.doc(`feedback/${feedbackId}/messages/${messageId}`), {
    id: messageId,
    kind: 'status',
    fromUid: AUTOMATION_UID,
    isFromAdmin: true,
    text: null,
    status,
    createdAt: now,
  });
  return { status, lastActivityAt: now, isUnreadBySender: true };
}

/** Queues a new bug, or an idea the admin just marked Planned, while the switch is on. Questions never. */
export const queueFeedbackForAutomation = onDocumentWritten(
  { document: 'feedback/{feedbackId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!event.data || !after || (after.agentState ?? null) !== null) return;
    const isNewBug = !before && after.kind === 'bug';
    const isNewlyPlannedIdea =
      !!before &&
      after.kind === 'idea' &&
      before.status !== 'planned' &&
      after.status === 'planned';
    if (!isNewBug && !isNewlyPlannedIdea) return;
    const firestore = getFirestore();
    if (!(await isAutomationOn(firestore))) return;
    await event.data.after.ref.update({
      agentState: 'queued',
      agentQueuedAt: Date.now(),
      agentNote: null,
    });
  },
);

interface RunState {
  usage: SessionUsage | null;
  failures: Record<string, number>;
}

const holdItems = async (firestore: Firestore, ids: string[], note: string) => {
  const batch = firestore.batch();
  ids.forEach((id) =>
    batch.update(firestore.doc(`feedback/${id}`), {
      agentState: 'held',
      agentNote: note,
      isUnreadByAdmin: true,
    }),
  );
  await batch.commit();
};

async function fireBucket({
  firestore,
  bucket,
  snaps,
  routine,
  state,
  now,
}: {
  firestore: Firestore;
  bucket: SessionBucket;
  snaps: Map<string, QueryDocumentSnapshot>;
  routine: { fireUrl: string; token: string };
  state: RunState;
  now: number;
}): Promise<RunState> {
  const ids = bucket.items.map((item) => item.id);
  const bucketSnaps = ids.flatMap((id) => snaps.get(id) ?? []);
  try {
    const { items, messagesById } = await readHandoffItems(
      firestore,
      bucketSnaps,
    );
    const sessionUrl = await fireRoutine({
      ...routine,
      text: buildFeedbackHandoffText(items, messagesById, null),
    });
    const usage = addSessionToUsage(state.usage, now);
    const failures = Object.fromEntries(
      Object.entries(state.failures).filter(([id]) => !ids.includes(id)),
    );
    const batch = firestore.batch();
    items.forEach((item) =>
      batch.update(firestore.doc(`feedback/${item.id}`), {
        agentState: 'working',
        agentNote: null,
        claudeSessionUrl: sessionUrl,
        ...(item.status === 'new' || item.status === 'planned'
          ? addStatusChange(firestore, batch, item.id, 'looking', now)
          : {}),
      }),
    );
    batch.set(usageRef(firestore), { ...usage, failures });
    await batch.commit();
    return { usage, failures };
  } catch (error) {
    const reason =
      error instanceof HttpsError ? error.message : 'Something went wrong.';
    logger.error('Automatic Claude session failed', { ids, reason });
    const next = registerFailure(state.failures, ids);
    await usageRef(firestore).set({
      ...(state.usage ?? { day: '', count: 0 }),
      failures: next.failures,
    });
    if (next.heldIds.length > 0) {
      await holdItems(
        firestore,
        next.heldIds,
        `Claude didn't start after ${MAX_FIRE_FAILURES} tries. ${reason}`,
      );
    }
    return { usage: state.usage, failures: next.failures };
  }
}

/** Starts the sessions that are due: bugs wait out their batch window, ideas go on the next run, and over the day's cap the items wait for the admin. */
export async function runFeedbackAutomation(firestore: Firestore, now: number) {
  if (!(await isAutomationOn(firestore))) return;
  const routine = await readClaudeRoutine(firestore);
  if (!routine) {
    logger.warn('Feedback automation is on but Claude is not connected');
    return;
  }
  const queued = (
    await firestore
      .collection('feedback')
      .where('agentState', '==', 'queued')
      .limit(MAX_QUEUED_READ)
      .get()
  ).docs;
  const closed = queued.filter((snap) =>
    ['done', 'wont-do'].includes(snap.data().status),
  );
  if (closed.length > 0) {
    const batch = firestore.batch();
    closed.forEach((snap) =>
      batch.update(snap.ref, { agentState: null, agentQueuedAt: null }),
    );
    await batch.commit();
  }
  const open = queued.filter((snap) => !closed.includes(snap));
  const snaps = new Map(open.map((snap) => [snap.id, snap]));
  const due = bucketQueued(
    open.map((snap) => ({
      id: snap.id,
      kind: snap.data().kind,
      appId: snap.data().context?.appId ?? null,
      queuedAt: snap.data().agentQueuedAt ?? snap.data().createdAt,
    })),
  ).filter((bucket) => isBucketDue(bucket, now));
  if (due.length === 0) return;

  const stored = (await usageRef(firestore).get()).data();
  const initial: RunState = {
    usage:
      typeof stored?.day === 'string' && typeof stored.count === 'number'
        ? { day: stored.day, count: stored.count }
        : null,
    failures: stored?.failures ?? {},
  };
  await due.reduce(async (previous, bucket) => {
    const state = await previous;
    if (getSessionsLeft(state.usage, now) === 0) {
      await holdItems(
        firestore,
        bucket.items.map((item) => item.id),
        CAP_HELD_NOTE,
      );
      return state;
    }
    return fireBucket({ firestore, bucket, snaps, routine, state, now });
  }, Promise.resolve(initial));
}

export const runFeedbackAutomationEvery5Minutes = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
    maxInstances: 1,
    timeoutSeconds: 300,
  },
  async () => {
    await runFeedbackAutomation(getFirestore(), Date.now());
  },
);

export interface FeedbackPrReport extends PrReport {
  feedbackIds: string[];
}

/** Moves the items an automatic session works on as their draft PR moves: ready, waiting on the admin, merged (then Done for the sender). */
export async function applyFeedbackPrStates(
  firestore: Firestore,
  prs: FeedbackPrReport[],
  now = Date.now(),
) {
  await prs.reduce(async (previous, pr) => {
    await previous;
    if (pr.feedbackIds.length === 0) return;
    const snaps = await firestore.getAll(
      ...pr.feedbackIds.map((id) => firestore.doc(`feedback/${id}`)),
      { fieldMask: ['agentState', 'agentPrUrl', 'status'] },
    );
    const batch = firestore.batch();
    const changed = snaps.flatMap((snap) => {
      const data = snap.data();
      const update = data
        ? getPrStateUpdate(
            {
              agentState: data.agentState ?? null,
              agentPrUrl: data.agentPrUrl ?? null,
              status: data.status,
            },
            pr,
          )
        : null;
      if (!update) return [];
      batch.update(snap.ref, {
        agentState: update.agentState,
        agentPrUrl: update.agentPrUrl,
        ...(update.isUnreadByAdmin ? { isUnreadByAdmin: true } : {}),
        ...(update.isDone
          ? addStatusChange(firestore, batch, snap.id, 'done', now)
          : {}),
      });
      return [snap.id];
    });
    if (changed.length > 0) await batch.commit();
  }, Promise.resolve());
}
