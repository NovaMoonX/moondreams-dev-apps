import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
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
  getMaxFireAttempts,
  getPrStateUpdate,
  getSessionsLeft,
  isBucketDue,
  isClaimable,
  isStuckStarting,
  MAX_FIRE_FAILURES,
  NOT_CONNECTED_NOTE,
  omitIds,
  readUsageDoc,
  registerFailure,
  RUN_BUDGET_MS,
  STUCK_HELD_NOTE,
  toUsageData,
  type PrReport,
  type SessionBucket,
} from './feedbackAutomationPlan.js';

if (getApps().length === 0) {
  initializeApp();
}

const AUTOMATION_UID = 'claude-automation';
const MAX_QUEUED_READ = 100;
const MAX_STARTING_READ = 50;
const usageRef = (firestore: Firestore) =>
  firestore.doc('adminSettings/feedbackAutomationUsage');

const itemRef = (firestore: Firestore, id: string) =>
  firestore.doc(`feedback/${id}`);

const isAutomationOn = async (firestore: Firestore) =>
  (await firestore.doc('adminSettings/feedbackAutomation').get()).data()
    ?.isOn === true;

/** Adds the thread message for a status change and returns the fields the item takes, as `addFeedbackStatusChange` does for the admin's own change. */
function addStatusChange(
  firestore: Firestore,
  set: (ref: DocumentReference, data: object) => unknown,
  feedbackId: string,
  status: string,
  now: number,
) {
  const messageId = randomUUID();
  set(firestore.doc(`feedback/${feedbackId}/messages/${messageId}`), {
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

type ClaimResult =
  | { kind: 'none' }
  | { kind: 'capped' }
  | { kind: 'claimed'; snaps: DocumentSnapshot[] };

/** One transaction decides what a session carries: items no longer queued are skipped, the cap is checked, and the rest are marked `starting` before anything is sent. */
const claimBucket = (firestore: Firestore, ids: string[]) =>
  firestore.runTransaction(async (tx): Promise<ClaimResult> => {
    const at = Date.now();
    const [usageSnap, ...snaps] = await tx.getAll(
      usageRef(firestore),
      ...ids.map((id) => itemRef(firestore, id)),
    );
    const doc = readUsageDoc(usageSnap.data());
    const claimable = snaps.filter((snap) =>
      isClaimable(snap.exists ? toClaimInput(snap) : null),
    );
    if (claimable.length === 0) return { kind: 'none' };
    if (getSessionsLeft(doc.usage, at) === 0) {
      claimable.forEach((snap) =>
        tx.update(snap.ref, {
          agentState: 'held',
          agentNote: CAP_HELD_NOTE,
          isUnreadByAdmin: true,
        }),
      );
      return { kind: 'capped' };
    }
    claimable.forEach((snap) =>
      tx.update(snap.ref, { agentState: 'starting', agentNote: null }),
    );
    tx.set(
      usageRef(firestore),
      toUsageData({
        ...doc,
        usage: addSessionToUsage(doc.usage, at),
        claims: {
          ...doc.claims,
          ...Object.fromEntries(claimable.map((snap) => [snap.id, at])),
        },
      }),
    );
    return { kind: 'claimed', snaps: claimable };
  });

const toClaimInput = (snap: DocumentSnapshot) => ({
  agentState: (snap.data()?.agentState ?? null) as string | null,
  kind: String(snap.data()?.kind),
  status: String(snap.data()?.status),
});

/** The session started: the items still `starting` move to Working with its link, and a deleted one is skipped. */
const settleStarted = (
  firestore: Firestore,
  ids: string[],
  sessionUrl: string,
) =>
  firestore.runTransaction(async (tx: Transaction) => {
    const at = Date.now();
    const [usageSnap, ...snaps] = await tx.getAll(
      usageRef(firestore),
      ...ids.map((id) => itemRef(firestore, id)),
    );
    const doc = readUsageDoc(usageSnap.data());
    snaps
      .filter((snap) => snap.exists && snap.data()?.agentState === 'starting')
      .forEach((snap) => {
        const status = snap.data()?.status;
        tx.update(snap.ref, {
          agentState: 'working',
          agentNote: null,
          claudeSessionUrl: sessionUrl,
          ...(status === 'new' || status === 'planned'
            ? addStatusChange(
                firestore,
                (ref, data) => tx.set(ref, data),
                snap.id,
                'looking',
                at,
              )
            : {}),
        });
      });
    tx.set(
      usageRef(firestore),
      toUsageData({
        ...doc,
        failures: omitIds(doc.failures, ids),
        claims: omitIds(doc.claims, ids),
      }),
    );
  });

/** The session did not start: the items still `starting` go back to the queue, or are held on their third failure. */
const releaseFailed = (firestore: Firestore, ids: string[], reason: string) =>
  firestore.runTransaction(async (tx) => {
    const [usageSnap, ...snaps] = await tx.getAll(
      usageRef(firestore),
      ...ids.map((id) => itemRef(firestore, id)),
    );
    const doc = readUsageDoc(usageSnap.data());
    const starting = snaps.filter(
      (snap) => snap.exists && snap.data()?.agentState === 'starting',
    );
    const next = registerFailure(
      doc.failures,
      starting.map((snap) => snap.id),
    );
    starting.forEach((snap) =>
      tx.update(
        snap.ref,
        next.heldIds.includes(snap.id)
          ? {
              agentState: 'held',
              agentNote: `Claude didn't start after ${MAX_FIRE_FAILURES} tries. ${reason}`,
              isUnreadByAdmin: true,
            }
          : { agentState: 'queued', agentNote: null },
      ),
    );
    tx.set(
      usageRef(firestore),
      toUsageData({
        ...doc,
        failures: next.failures,
        claims: omitIds(doc.claims, ids),
      }),
    );
  });

/** Items left `starting` by a run that was killed may have a session behind them: they are held and never fired again. */
const holdStuckStarting = async (firestore: Firestore) => {
  const ids = (
    await firestore
      .collection('feedback')
      .where('agentState', '==', 'starting')
      .limit(MAX_STARTING_READ)
      .get()
  ).docs.map((snap) => snap.id);
  if (ids.length === 0) return;
  await firestore.runTransaction(async (tx) => {
    const at = Date.now();
    const [usageSnap, ...snaps] = await tx.getAll(
      usageRef(firestore),
      ...ids.map((id) => itemRef(firestore, id)),
    );
    const doc = readUsageDoc(usageSnap.data());
    const stuck = snaps.filter(
      (snap) =>
        snap.exists &&
        snap.data()?.agentState === 'starting' &&
        isStuckStarting(doc.claims[snap.id], at),
    );
    if (stuck.length === 0) return;
    stuck.forEach((snap) =>
      tx.update(snap.ref, {
        agentState: 'held',
        agentNote: STUCK_HELD_NOTE,
        isUnreadByAdmin: true,
      }),
    );
    tx.set(
      usageRef(firestore),
      toUsageData({
        ...doc,
        claims: omitIds(
          doc.claims,
          stuck.map((snap) => snap.id),
        ),
      }),
    );
  });
};

/** Returns whether a session was attempted (the run counts attempts). */
async function runBucket(
  firestore: Firestore,
  bucket: SessionBucket,
  routine: { fireUrl: string; token: string },
): Promise<boolean> {
  const ids = bucket.items.map((item) => item.id);
  const claim = await claimBucket(firestore, ids);
  if (claim.kind !== 'claimed') return false;
  const claimedIds = claim.snaps.map((snap) => snap.id);
  const sessionUrl = await (async () => {
    try {
      const { items, messagesById } = await readHandoffItems(
        firestore,
        claim.snaps,
      );
      return await fireRoutine({
        ...routine,
        text: buildFeedbackHandoffText(items, messagesById, null),
      });
    } catch (error) {
      const reason =
        error instanceof HttpsError ? error.message : 'Something went wrong.';
      logger.error('Automatic Claude session failed', {
        ids: claimedIds,
        reason,
      });
      await releaseFailed(firestore, claimedIds, reason);
      return null;
    }
  })();
  if (sessionUrl !== null) {
    // A failed save leaves the items `starting`; the next run holds them as unknown rather than firing again.
    await settleStarted(firestore, claimedIds, sessionUrl).catch((error) =>
      logger.error('Saved no state after Claude started a session', {
        ids: claimedIds,
        name: (error as Error).name,
      }),
    );
  }
  return true;
}

const clearQueued = async (firestore: Firestore, snaps: DocumentSnapshot[]) => {
  if (snaps.length === 0) return;
  const batch = firestore.batch();
  snaps.forEach((snap) =>
    batch.update(snap.ref, {
      agentState: null,
      agentQueuedAt: null,
      agentNote: null,
    }),
  );
  await batch.commit();
};

const readQueued = async (firestore: Firestore) =>
  (
    await firestore
      .collection('feedback')
      .where('agentState', '==', 'queued')
      .orderBy('agentQueuedAt', 'asc')
      .limit(MAX_QUEUED_READ)
      .get()
  ).docs;

/** Starts the sessions that are due: bugs wait out their batch window, ideas go on the next run, and over the day's cap the items wait for the admin. */
export async function runFeedbackAutomation(firestore: Firestore, now: number) {
  const startedAt = Date.now();
  if (!(await isAutomationOn(firestore))) {
    await clearQueued(firestore, await readQueued(firestore));
    return;
  }
  await holdStuckStarting(firestore);
  const routine = await readClaudeRoutine(firestore);
  const queued = (await readQueued(firestore)).filter((snap) =>
    ['bug', 'idea'].includes(snap.data().kind),
  );
  if (!routine) {
    logger.warn('Feedback automation is on but Claude is not connected');
    const unnoted = queued.filter(
      (snap) => snap.data().agentNote !== NOT_CONNECTED_NOTE,
    );
    if (unnoted.length > 0) {
      const batch = firestore.batch();
      unnoted.forEach((snap) =>
        batch.update(snap.ref, { agentNote: NOT_CONNECTED_NOTE }),
      );
      await batch.commit();
    }
    return;
  }
  const closed = queued.filter((snap) =>
    ['done', 'wont-do'].includes(snap.data().status),
  );
  await clearQueued(firestore, closed);
  const open = queued.filter((snap) => !closed.includes(snap));
  const due = bucketQueued(
    open.map((snap) => ({
      id: snap.id,
      kind: snap.data().kind,
      appId: snap.data().context?.appId ?? null,
      queuedAt: snap.data().agentQueuedAt ?? snap.data().createdAt,
    })),
  ).filter((bucket) => isBucketDue(bucket, now));
  if (due.length === 0) return;

  const { usage } = readUsageDoc((await usageRef(firestore).get()).data());
  const maxAttempts = getMaxFireAttempts(getSessionsLeft(usage, startedAt));
  await due.reduce(async (previous, bucket) => {
    const attempts = await previous;
    if (attempts >= maxAttempts || Date.now() - startedAt > RUN_BUDGET_MS) {
      return attempts;
    }
    try {
      return attempts + ((await runBucket(firestore, bucket, routine)) ? 1 : 0);
    } catch (error) {
      logger.error('Automatic Claude session left a bucket undone', {
        ids: bucket.items.map((item) => item.id),
        name: (error as Error).name,
      });
      return attempts + 1;
    }
  }, Promise.resolve(0));
}

export const runFeedbackAutomationEvery5Minutes = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: 'us-central1',
    maxInstances: 1,
    concurrency: 1,
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
      { fieldMask: ['agentState', 'agentPrUrl', 'agentNote', 'status'] },
    );
    const batch = firestore.batch();
    const changed = snaps.flatMap((snap) => {
      const data = snap.data();
      const update = data
        ? getPrStateUpdate(
            {
              agentState: data.agentState ?? null,
              agentPrUrl: data.agentPrUrl ?? null,
              agentNote: data.agentNote ?? null,
              status: data.status,
            },
            pr,
          )
        : null;
      if (!update) return [];
      batch.update(snap.ref, {
        agentState: update.agentState,
        agentPrUrl: update.agentPrUrl,
        agentNote: update.agentNote,
        ...(update.isUnreadByAdmin ? { isUnreadByAdmin: true } : {}),
        ...(update.isDone
          ? addStatusChange(
              firestore,
              (ref, data) => batch.set(ref, data),
              snap.id,
              'done',
              now,
            )
          : {}),
      });
      return [snap.id];
    });
    if (changed.length > 0) await batch.commit();
  }, Promise.resolve());
}
