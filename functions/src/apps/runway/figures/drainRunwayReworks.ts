import { createHash } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import type { Keyring } from '../planKey.js';
import { ENGINE_VERSION } from '../engine/engineConstants.js';
import { reworkPlan } from './reworkPlan.js';
import {
  afterFailure,
  afterRun,
  MINUTE_MS,
  newReworkState,
  reworkPath,
  type ReworkState,
} from './reworkState.js';

if (getApps().length === 0) {
  initializeApp();
}

const BATCH_LIMIT = 100;
const PARALLEL = 10;
const TIMEOUT_SECONDS = 300;
// A lease lasts the whole timeout, so a run can only lose its lease once it is dead and two runs never hold one plan.
const LEASE_MS = TIMEOUT_SECONDS * 1000;
/** No new batch starts after this, so a batch never runs into the timeout and charges its plans a failure. */
const START_BUDGET_MS = 4 * MINUTE_MS;

const hashOf = (uid: string) =>
  createHash('sha256').update(uid).digest('hex').slice(0, 12);

/** Takes the plan's lease and returns its state as it stood, or null when another run holds it or it is no longer due. */
const takeLease = (firestore: Firestore, uid: string, now: number) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(reworkPath(uid));
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const state = snapshot.data() as ReworkState;
    if (state.leaseUntil > now || state.dueAt > now) return null;
    // A lease that ran out without being settled is a run that died (out of memory, a timeout): it backs off like a failure.
    if (state.leaseUntil !== 0) {
      transaction.set(ref, afterFailure(state, now));
      return null;
    }
    transaction.update(ref, { leaseUntil: now + LEASE_MS });
    return state;
  });

/** Writes the state a run leaves, from the document as it stands then, so a write that came during the run is seen. A deleted document stays deleted. */
const settle = (
  firestore: Firestore,
  uid: string,
  next: (current: ReworkState) => ReworkState,
) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(reworkPath(uid));
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    transaction.set(ref, next(snapshot.data() as ReworkState));
  });

const SWEEP_PATH = 'apps/runway/server/_reworkSweep';

/**
 * Once per engine version (the first deploy included) marks every plan due, so a plan nobody has written
 * to since gets figures, and figures from older maths, which the phone ignores, are worked out again.
 */
async function sweepOnNewEngine(firestore: Firestore, now: number) {
  const marker = firestore.doc(SWEEP_PATH);
  if ((await marker.get()).get('engineVersion') === ENGINE_VERSION) return;
  const plans = await firestore.collection('apps/runway/plans').select().get();
  const refs = plans.docs.map((entry) => firestore.doc(reworkPath(entry.id)));
  const states = refs.length === 0 ? [] : await firestore.getAll(...refs);
  const writer = firestore.bulkWriter();
  states.forEach((state, index) => {
    const uid = plans.docs[index].id;
    if (state.exists) {
      writer.update(state.ref, { dueAt: now }).catch(() => undefined);
      return;
    }
    writer
      .set(state.ref, { ...newReworkState(uid), dueAt: now })
      .catch(() => undefined);
  });
  await writer.close();
  await marker.set({ engineVersion: ENGINE_VERSION, at: now });
  logger.info('runway.rework.swept', { plans: refs.length });
}

type Outcome = 'done' | 'waiting' | 'gone' | 'failed' | 'skipped';

async function drainOne(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
): Promise<Outcome> {
  const now = Date.now();
  const leased = await takeLease(firestore, uid, now);
  if (leased === null) return 'skipped';
  try {
    const outcome = await reworkPlan(firestore, keyring, uid, now);
    if (outcome.kind === 'gone') {
      await firestore.doc(reworkPath(uid)).delete();
      return 'gone';
    }
    await settle(firestore, uid, (current) =>
      afterRun(current, leased.seq, now, outcome.zone),
    );
    return outcome.kind;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    logger.warn('runway.rework.failed', {
      uidHash: hashOf(uid),
      code: typeof code === 'string' || typeof code === 'number' ? code : null,
    });
    await settle(firestore, uid, (current) => afterFailure(current, now)).catch(
      () => undefined,
    );
    return 'failed';
  }
}

/** Works out the figures of every plan that is due, a minute at a time. */
export const drainRunwayReworks = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    timeoutSeconds: TIMEOUT_SECONDS,
    memory: '512MiB',
    maxInstances: 1,
    secrets: [RUNWAY_MASTER_KEYS],
  },
  async () => {
    const now = Date.now();
    const firestore = getFirestore();
    await sweepOnNewEngine(firestore, now);
    const due = await firestore
      .collection('apps/runway/reworks')
      .where('dueAt', '<=', now)
      .orderBy('dueAt')
      .limit(BATCH_LIMIT)
      .select()
      .get();
    if (due.empty) return;
    const keyring = loadKeyring();
    const uids = due.docs.map((entry) => entry.id);
    const outcomes = await Array.from(
      { length: Math.ceil(uids.length / PARALLEL) },
      (_, index) => uids.slice(index * PARALLEL, (index + 1) * PARALLEL),
    ).reduce<Promise<Outcome[]>>(async (done, batch) => {
      const before = await done;
      if (Date.now() - now > START_BUDGET_MS) return before;
      return [
        ...before,
        ...(await Promise.all(
          batch.map((uid) => drainOne(firestore, keyring, uid)),
        )),
      ];
    }, Promise.resolve([]));
    logger.info('runway.rework.drained', {
      due: uids.length,
      unstarted: uids.length - outcomes.length,
      ...Object.fromEntries(
        [...new Set(outcomes)].map((outcome) => [
          outcome,
          outcomes.filter((entry) => entry === outcome).length,
        ]),
      ),
    });
  },
);
