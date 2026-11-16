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

import {
  createAnthropicBatchProvider,
  type BatchProvider,
} from '../../../ai/batch.js';
import type { Keyring } from '../../../appKeys/keyring.js';
import { isForcedFixture, isRunningInEmulator } from '../../../emulator.js';
import { recordAiSpendIn, reserveBatchSpend } from '../aiLimits.js';
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
  REFLECT_BATCH,
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
const SUBMITTED_LEASE_MS = (REFLECT_BATCH.maxWaitHours + 1) * HOUR_MS;
/** A submitted batch past its job's longest wait plus this is given up on, so its reservation returns to the day's budget. */
const SUBMITTED_GRACE_MS = 2 * HOUR_MS;
/** Collecting stops starting runs after this, leaving the rest of the 540 s to build and submit. */
const COLLECT_BUDGET_MS = 240_000;
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

class OutOfTime extends Error {}

const toCode = (error: unknown) =>
  (error as { code?: unknown } | null)?.code ?? null;

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
      lastDayKey: state.lastDayKey,
      leaseUntil: now + BUILD_LEASE_MS,
      continuation: null,
    });
    return {
      lastDayKey: state.lastDayKey,
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
      releaseLeaseIn(
        transaction,
        firestore,
        uid,
        state.attempts,
        state.lastDayKey,
      );
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
    if (lease.lastDayKey === built.dayKey) {
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
  } catch (error) {
    logger.warn('helm.reflect.prepareFailed', { runId, code: toCode(error) });
    await releaseLease(firestore, uid, customId, null).catch(() => null);
    return null;
  }
}

/** Closes a run that will never answer, in one transaction with returning what its unsettled requests reserved; a run already closed is left alone. */
async function markLost(firestore: Firestore, runId: string): Promise<void> {
  const runRef = firestore.doc(`${RUNS_PATH}/${runId}`);
  const run = readRun((await runRef.get()).data());
  if (!run) return;
  await Promise.all(
    Object.entries(run.requests).map(([customId, { uid }]) =>
      releaseLease(firestore, uid, customId, null),
    ),
  );
  await firestore.runTransaction(async (transaction) => {
    const current = readRun((await transaction.get(runRef)).data());
    if (!current || !OPEN_RUN_STATUSES.includes(current.status)) return;
    const refund = Object.values(current.requests).reduce(
      (sum, request) => sum + request.reserved,
      0,
    );
    if (refund > 0)
      recordAiSpendIn(transaction, firestore, current.createdAt, -refund);
    transaction.update(runRef, {
      status: 'lost',
      superseded: Object.keys(current.requests),
      requests: {},
    });
  });
}

/** Closes a collected run, returning what any request that got no result had reserved. */
async function closeCollected(
  firestore: Firestore,
  runId: string,
  now: number,
) {
  const runRef = firestore.doc(`${RUNS_PATH}/${runId}`);
  const leftover = readRun((await runRef.get()).data())?.requests ?? {};
  await Promise.all(
    Object.entries(leftover).map(([customId, { uid }]) =>
      releaseLease(firestore, uid, customId, null),
    ),
  );
  await firestore.runTransaction(async (transaction) => {
    const current = readRun((await transaction.get(runRef)).data());
    if (!current || !OPEN_RUN_STATUSES.includes(current.status)) return;
    const refund = Object.values(current.requests).reduce(
      (sum, request) => sum + request.reserved,
      0,
    );
    if (refund > 0)
      recordAiSpendIn(transaction, firestore, current.createdAt, -refund);
    transaction.update(runRef, {
      status: 'collected',
      collectedAt: now,
      deletedAtProvider: REFLECT_BATCH.deleteAfterCollect ? now : null,
      requests: {},
    });
  });
}

const isExpired = (run: ReflectionRun, now: number) =>
  now - (run.submittedAt ?? run.createdAt) >
  REFLECT_BATCH.maxWaitHours * HOUR_MS + SUBMITTED_GRACE_MS;

async function collectRun(
  firestore: Firestore,
  client: BatchProvider,
  keyring: Keyring,
  runId: string,
  run: ReflectionRun,
  now: number,
  deadline: number,
): Promise<'collected' | 'lost' | 'waiting'> {
  if (run.status === 'creating') {
    if (now - run.createdAt <= CREATING_LOST_MS) return 'waiting';
    await markLost(firestore, runId);
    return 'lost';
  }
  if (run.batchId === null) {
    if (!isExpired(run, now)) return 'waiting';
    await markLost(firestore, runId);
    return 'lost';
  }
  const results = await client.collect(run.batchId);
  if (results === null) {
    if (!isExpired(run, now)) return 'waiting';
    await markLost(firestore, runId);
    return 'lost';
  }
  await results.reduce(async (previous, result) => {
    await previous;
    if (Date.now() > deadline) throw new OutOfTime();
    await applyReflectionOutcome(firestore, keyring, {
      runId,
      customId: result.customId,
      result,
      now,
    });
  }, Promise.resolve());
  if (REFLECT_BATCH.deleteAfterCollect) await client.remove(run.batchId);
  await closeCollected(firestore, runId, now);
  return 'collected';
}

async function collectOpenRuns(
  firestore: Firestore,
  client: BatchProvider,
  keyring: Keyring,
  now: number,
) {
  const open = await firestore
    .collection(RUNS_PATH)
    .where('status', 'in', OPEN_RUN_STATUSES)
    .get();
  const deadline = Date.now() + COLLECT_BUDGET_MS;
  return open.docs.reduce(async (previous, doc) => {
    const totals = await previous;
    const run = readRun(doc.data());
    if (!run || Date.now() > deadline) return totals;
    try {
      const result = await collectRun(
        firestore,
        client,
        keyring,
        doc.id,
        run,
        now,
        deadline,
      );
      return { ...totals, [result]: (totals[result] ?? 0) + 1 };
    } catch (error) {
      if (!(error instanceof OutOfTime))
        logger.warn('helm.reflect.collectFailed', {
          runId: doc.id,
          status: run.status,
          code: toCode(error),
        });
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
    .select(
      'isLearningOn',
      'reflectDueAt',
      'timeZone',
      'forgottenAt',
      'seenAsRebuiltAt',
    )
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
  client: BatchProvider,
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
  const sent = await client
    .submit(
      prepared.map(({ customId, request }) => ({
        customId,
        role: 'reflect' as const,
        system: request.system,
        message: request.prompt,
        schema: request.schema,
        maxTokens: request.maxTokens,
        isSystemCached: true,
      })),
    )
    .catch(async (error: unknown) => {
      logger.error('helm.reflect.submitFailed', { runId, code: toCode(error) });
      await markLost(firestore, runId).catch((lostError: unknown) =>
        logger.error('helm.reflect.markLostFailed', {
          runId,
          code: toCode(lostError),
        }),
      );
      return null;
    });
  if (!sent) return 0;
  await runRef
    .update({ status: 'submitted', batchId: sent, submittedAt: now })
    .catch((error: unknown) =>
      logger.error('helm.reflect.submittedUpdateFailed', {
        runId,
        code: toCode(error),
      }),
    );
  const writer = firestore.bulkWriter();
  prepared.forEach(({ uid }) =>
    writer
      .update(firestore.doc(statePath(uid)), {
        leaseUntil: now + SUBMITTED_LEASE_MS,
      })
      .catch((error: unknown) =>
        logger.warn('helm.reflect.leaseExtendFailed', {
          runId,
          code: toCode(error),
        }),
      ),
  );
  await writer.close().catch(() => null);
  return prepared.length;
}

/** One hourly pass: finish what earlier runs sent, then send what is newly due. The batch provider is injected so a pass can be rehearsed without the provider. */
export async function runHelmReflectionPass(
  firestore: Firestore,
  client: BatchProvider,
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
      createAnthropicBatchProvider(apiKey),
      loadKeyringOrFail(),
    );
    logger.info('helm.reflect.run', pass);
  },
);
