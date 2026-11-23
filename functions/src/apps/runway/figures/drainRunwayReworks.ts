import { createHash } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { loadKeyring, RUNWAY_MASTER_KEYS } from '../getRunwayKey.js';
import type { Keyring } from '../planKey.js';
import { reworkPlan } from './reworkPlan.js';
import {
  afterFailure,
  afterRun,
  MINUTE_MS,
  reworkPath,
  type ReworkState,
} from './reworkState.js';

if (getApps().length === 0) {
  initializeApp();
}

const BATCH_LIMIT = 100;
const PARALLEL = 10;
const LEASE_MS = 5 * MINUTE_MS;

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

type Outcome = 'done' | 'gone' | 'failed' | 'skipped';

async function drainOne(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  now: number,
): Promise<Outcome> {
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
    return 'done';
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
    timeoutSeconds: 300,
    maxInstances: 1,
    secrets: [RUNWAY_MASTER_KEYS],
  },
  async () => {
    const now = Date.now();
    const firestore = getFirestore();
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
    ).reduce<Promise<Outcome[]>>(
      async (done, batch) => [
        ...(await done),
        ...(await Promise.all(
          batch.map((uid) => drainOne(firestore, keyring, uid, now)),
        )),
      ],
      Promise.resolve([]),
    );
    logger.info('runway.rework.drained', {
      due: uids.length,
      ...Object.fromEntries(
        [...new Set(outcomes)].map((outcome) => [
          outcome,
          outcomes.filter((entry) => entry === outcome).length,
        ]),
      ),
    });
  },
);
