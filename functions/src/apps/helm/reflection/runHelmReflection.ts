import { randomBytes } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { BATCH_JOBS } from '../../../ai/batchJobs.js';
import {
  collectBatch,
  createBatchClient,
  submitBatch,
  type BatchClient,
} from '../../../ai/batches.js';
import type { Keyring } from '../../../appKeys/keyring.js';
import { isForcedFixture, isRunningInEmulator } from '../../../emulator.js';
import { reserveBatchSpend } from '../aiLimits.js';
import { HELM_MASTER_KEYS } from '../getHelmKey.js';
import { unwrapHelmKey } from '../helmKey.js';
import { ANTHROPIC_API_KEY, loadKeyringOrFail } from '../sortHelmCapture.js';
import {
  buildReflectRequest,
  estimateReflectCost,
  type PreparedReflection,
} from './buildReflectRequest.js';
import {
  OPEN_RUN_STATUSES,
  readRun,
  readState,
  releaseLeaseIn,
  RUNS_PATH,
  statePath,
  type ReflectionRun,
} from './reflectionRuns.js';
import { applyReflectionOutcome } from './writeReflection.js';

if (getApps().length === 0) {
  initializeApp();
}

const HOUR_MS = 3_600_000;
const DUE_LIMIT = 2000;
const CHUNK = 20;
/** A run that has not reached the provider this long after it was made never will. */
const CREATING_LOST_MS = 15 * 60_000;
/** Held while a person's request is built; a run that dies in between frees them when it ends. */
const BUILD_LEASE_MS = 30 * 60_000;
/** A batch answers within its job's longest wait, so a request still open after that is replaced. */
const SUBMITTED_LEASE_MS = (BATCH_JOBS.reflect.maxWaitHours + 1) * HOUR_MS;
/** New people are started only inside this, leaving the rest of the 540 s to submit and collect. */
const BUILD_BUDGET_MS = 300_000;

const newId = (prefix: string, bytes: number) =>
  `${prefix}_${randomBytes(bytes).toString('hex')}`;

export interface ReflectionPass {
  collected: number;
  lost: number;
  submitted: number;
}

interface Prepared extends PreparedReflection {
  uid: string;
  customId: string;
  answersDueAt: number;
  reserved: number;
  replaced: { runId: string | null; customId: string } | null;
}

const toDueAt = (profile: DocumentData) =>
  typeof profile.reflectDueAt === 'number' ? profile.reflectDueAt : 0;

async function takeLease(
  firestore: Firestore,
  uid: string,
  lease: { runId: string; customId: string; answersDueAt: number },
  now: number,
) {
  const ref = firestore.doc(statePath(uid));
  return firestore.runTransaction(async (transaction) => {
    const state = readState((await transaction.get(ref)).data());
    if (state.customId !== null && state.leaseUntil > now) return null;
    transaction.set(ref, {
      ...lease,
      attempts: state.attempts,
      leaseUntil: now + BUILD_LEASE_MS,
      continuation: null,
    });
    return {
      replaced:
        state.customId === null
          ? null
          : { runId: state.runId, customId: state.customId },
    };
  });
}

/** Frees a person's lease and, when told to, their due time too, but only while the lease is still the one that was taken. */
const releaseLease = (
  firestore: Firestore,
  uid: string,
  customId: string,
  clear: { answersDueAt: number } | null,
) =>
  firestore.runTransaction(async (transaction) => {
    const stateSnap = await transaction.get(firestore.doc(statePath(uid)));
    const profileRef = firestore.doc(`apps/helm/users/${uid}`);
    const profileSnap = clear ? await transaction.get(profileRef) : null;
    const state = readState(stateSnap.data());
    if (state.customId === customId)
      releaseLeaseIn(transaction, firestore, uid, state.attempts);
    if (clear && profileSnap?.get('reflectDueAt') === clear.answersDueAt)
      transaction.update(profileRef, { reflectDueAt: null });
  });

async function prepare(
  firestore: Firestore,
  keyring: Keyring,
  doc: QueryDocumentSnapshot,
  runId: string,
  now: number,
): Promise<Prepared | null> {
  const uid = doc.id;
  const profile = doc.data();
  const answersDueAt = toDueAt(profile);
  if (profile.isLearningOn === false) {
    await doc.ref.update({ reflectDueAt: null });
    return null;
  }
  const customId = newId('b', 16);
  const lease = await takeLease(
    firestore,
    uid,
    { runId, customId, answersDueAt },
    now,
  );
  if (!lease) return null;
  try {
    const built = await buildReflectRequest(
      firestore,
      uid,
      await unwrapHelmKey(firestore, keyring, uid),
      profile,
      now,
    );
    if (!built) {
      await releaseLease(firestore, uid, customId, { answersDueAt });
      return null;
    }
    const reserved = estimateReflectCost(built.request);
    if (!(await reserveBatchSpend(firestore, now, reserved))) {
      await releaseLease(firestore, uid, customId, null);
      return null;
    }
    return {
      ...built,
      uid,
      customId,
      answersDueAt,
      reserved,
      replaced: lease.replaced,
    };
  } catch {
    logger.warn('helm.reflect.prepareFailed');
    await releaseLease(firestore, uid, customId, null).catch(() => null);
    return null;
  }
}

async function markLost(
  firestore: Firestore,
  runId: string,
  run: ReflectionRun,
) {
  await Promise.all(
    Object.entries(run.requests).map(([customId, { uid }]) =>
      releaseLease(firestore, uid, customId, null),
    ),
  );
  await firestore.doc(`${RUNS_PATH}/${runId}`).update({
    status: 'lost',
    superseded: Object.keys(run.requests),
    requests: {},
  });
}

async function collectRun(
  firestore: Firestore,
  client: BatchClient,
  keyring: Keyring,
  runId: string,
  run: ReflectionRun,
  now: number,
): Promise<'collected' | 'lost' | 'waiting'> {
  if (run.status === 'creating') {
    if (now - run.createdAt <= CREATING_LOST_MS) return 'waiting';
    await markLost(firestore, runId, run);
    return 'lost';
  }
  if (run.batchId === null) return 'waiting';
  const state = await collectBatch(
    client,
    { jobId: 'reflect', batchId: run.batchId },
    async (customId, outcome) => {
      await applyReflectionOutcome(firestore, keyring, {
        runId,
        customId,
        outcome,
        now,
      });
    },
  );
  if (state === 'pending') return 'waiting';
  await firestore.doc(`${RUNS_PATH}/${runId}`).update({
    status: 'collected',
    collectedAt: now,
    deletedAtProvider: BATCH_JOBS.reflect.deleteAfterCollect ? now : null,
    requests: {},
  });
  return 'collected';
}

async function collectOpenRuns(
  firestore: Firestore,
  client: BatchClient,
  keyring: Keyring,
  now: number,
) {
  const open = await firestore
    .collection(RUNS_PATH)
    .where('status', 'in', OPEN_RUN_STATUSES)
    .get();
  return open.docs.reduce(async (previous, doc) => {
    const totals = await previous;
    const run = readRun(doc.data());
    if (!run) return totals;
    try {
      const result = await collectRun(
        firestore,
        client,
        keyring,
        doc.id,
        run,
        now,
      );
      return { ...totals, [result]: (totals[result] ?? 0) + 1 };
    } catch {
      logger.warn('helm.reflect.collectFailed', { status: run.status });
      return totals;
    }
  }, Promise.resolve<Record<string, number>>({}));
}

async function prepareDue(
  firestore: Firestore,
  keyring: Keyring,
  runId: string,
  now: number,
) {
  const due = await firestore
    .collection('apps/helm/users')
    .where('reflectDueAt', '<=', now)
    .limit(DUE_LIMIT)
    .select('isLearningOn', 'reflectDueAt', 'timeZone', 'forgottenAt')
    .get();
  const startedAt = Date.now();
  const chunks = Array.from(
    { length: Math.ceil(due.size / CHUNK) },
    (_, index) => due.docs.slice(index * CHUNK, (index + 1) * CHUNK),
  );
  return chunks.reduce(async (previous, chunk) => {
    const prepared = await previous;
    if (Date.now() - startedAt > BUILD_BUDGET_MS) return prepared;
    const next = await Promise.all(
      chunk.map((doc) => prepare(firestore, keyring, doc, runId, now)),
    );
    return [...prepared, ...next.filter((entry) => entry !== null)];
  }, Promise.resolve<Prepared[]>([]));
}

async function submitPrepared(
  firestore: Firestore,
  client: BatchClient,
  runId: string,
  prepared: Prepared[],
  now: number,
) {
  const runRef = firestore.doc(`${RUNS_PATH}/${runId}`);
  const requests = Object.fromEntries(
    prepared.map(({ customId, uid, dayKey, answersDueAt, reserved }) => [
      customId,
      { uid, dayKey, answersDueAt, reserved },
    ]),
  );
  await runRef.set({
    status: 'creating',
    batchId: null,
    requests,
    superseded: [],
    createdAt: now,
    submittedAt: null,
    collectedAt: null,
    deletedAtProvider: null,
  });
  await Promise.all(
    prepared.flatMap(({ replaced }) =>
      replaced?.runId
        ? [
            firestore
              .doc(`${RUNS_PATH}/${replaced.runId}`)
              .update({ superseded: FieldValue.arrayUnion(replaced.customId) })
              .catch(() => null),
          ]
        : [],
    ),
  );
  const ids = prepared.map(({ customId }) => customId);
  try {
    const { batchId } = await submitBatch(client, {
      jobId: 'reflect',
      requests: prepared.map(({ request }) => request),
      makeId: () => ids.shift() ?? newId('b', 16),
    });
    await runRef.update({ status: 'submitted', batchId, submittedAt: now });
    const writer = firestore.bulkWriter();
    prepared.forEach(({ uid }) =>
      writer.update(firestore.doc(statePath(uid)), {
        leaseUntil: now + SUBMITTED_LEASE_MS,
      }),
    );
    await writer.close();
    return prepared.length;
  } catch {
    logger.error('helm.reflect.submitFailed');
    await markLost(
      firestore,
      runId,
      readRun((await runRef.get()).data()) as ReflectionRun,
    );
    return 0;
  }
}

/** One hourly pass: finish what earlier runs sent, then send what is newly due. The batch client is injected so a pass can be rehearsed without the provider. */
export async function runHelmReflectionPass(
  firestore: Firestore,
  client: BatchClient,
  keyring: Keyring,
  now = Date.now(),
): Promise<ReflectionPass> {
  const collection = await collectOpenRuns(firestore, client, keyring, now);
  const runId = newId('run', 8);
  const prepared = await prepareDue(firestore, keyring, runId, now);
  const submitted =
    prepared.length === 0
      ? 0
      : await submitPrepared(firestore, client, runId, prepared, now);
  return {
    collected: collection.collected ?? 0,
    lost: collection.lost ?? 0,
    submitted,
  };
}

const readApiKey = () => {
  if (isForcedFixture('anthropic')) return '';
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

export const runHelmReflection = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'UTC',
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
  },
  async () => {
    const apiKey = readApiKey();
    if (!apiKey) {
      if (!isRunningInEmulator()) logger.error('helm.reflect.noModelKey');
      return;
    }
    const pass = await runHelmReflectionPass(
      getFirestore(),
      createBatchClient(apiKey),
      loadKeyringOrFail(),
    );
    logger.info('helm.reflect.run', pass);
  },
);
