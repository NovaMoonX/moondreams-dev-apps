import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createAnthropicProvider } from '../../ai/providers/anthropic.js';
import type { ModelProvider } from '../../ai/modelProvider.js';
import { getUsageCost } from '../../ai/models.js';
import type { Keyring } from '../../appKeys/keyring.js';
import type { SealedPayload } from '../../appKeys/seal.js';
import { isRunningInEmulator } from '../../emulator.js';
import { HELM_MASTER_KEYS, loadHelmKeyring } from './getHelmKey.js';
import {
  openForHelm,
  sealForHelm,
  unwrapHelmKey,
  type HelmKey,
} from './helmKey.js';
import { recordAiSpend, reserveAiCall } from './aiLimits.js';
import { createHelmMcpServer } from './mcp/server.js';
import { buildContext, type ContextTask } from './nomos/buildContext.js';
import {
  FILE_RESULTS_TOOL,
  toReading,
  type CaptureReading,
  type NomosCommand,
  type TaskDue,
} from './nomos/commands.js';
import {
  buildExecution,
  planWrites,
  type ExistingTask,
} from './nomos/executeCommands.js';
import { createFixtureProvider } from './nomos/fixtureProvider.js';
import {
  normalizeNomosReply,
  NomosReplyError,
} from './nomos/normalizeNomosReply.js';
import { decide } from './nomos/policy.js';
import { MAX_CONTEXT_TASKS, SYSTEM_PROMPT } from './nomos/prompt.js';

if (getApps().length === 0) {
  initializeApp();
}

export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const LEASE_MS = 90_000;
const MAX_ATTEMPTS = 3;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const LOOP_LIMITS = { maxTurns: 6, maxToolCalls: 12, maxMillis: 40_000 };

interface SortResult {
  status: 'sorted' | 'received' | 'failed';
  executionId: string | null;
  heldReason: 'dailyLimit' | 'budgetReached' | null;
}

const toResult = (
  status: SortResult['status'],
  executionId: string | null = null,
): SortResult => ({ status, executionId, heldReason: null });

interface CaptureDoc {
  status: string;
  attempts?: number;
  claimId?: string | null;
  claimedAt?: number | null;
  executionIds?: string[];
  createdAt: number;
  sealed: SealedPayload;
}

interface TaskDoc {
  status: 'open' | 'done';
  due: TaskDue | null;
  isUrgent: boolean;
  createdAt: number;
  sealed: SealedPayload;
}

/** A reading that failed in a way a later try may fix; the capture goes back to be sorted again. */
class SortFailure extends Error {
  constructor(
    readonly code: string,
    readonly countsAttempt = true,
  ) {
    super(code);
  }
}

const isLeaseOpen = (capture: CaptureDoc, now: number) =>
  capture.status === 'received' ||
  (capture.status === 'interpreting' &&
    now - (capture.claimedAt ?? 0) >= LEASE_MS);

/** What a call answers when the capture is not for it to read: already sorted, failed, or in another call's hands. */
const readEarlyAnswer = (
  capture: CaptureDoc,
  now: number,
): SortResult | null => {
  if (isLeaseOpen(capture, now)) return null;
  if (capture.status === 'failed') return toResult('failed');
  if (capture.status === 'interpreting') return toResult('received');
  return toResult('sorted', capture.executionIds?.[0] ?? null);
};

const readApiKey = () => {
  try {
    return ANTHROPIC_API_KEY.value();
  } catch {
    return '';
  }
};

function pickProvider(text: string, reading: CaptureReading): ModelProvider {
  const apiKey = readApiKey();
  if (apiKey) return createAnthropicProvider(apiKey);
  if (isRunningInEmulator()) return createFixtureProvider(text, reading);
  throw new SortFailure('noModelKey', false);
}

function loadKeyringOrFail(): Keyring {
  try {
    return loadHelmKeyring();
  } catch {
    logger.error('helm.keys.keyringInvalid');
    throw new HttpsError(
      'failed-precondition',
      "Helm can't open your things right now.",
    );
  }
}

const openTitle = (key: HelmKey, sealed: SealedPayload) => {
  try {
    const opened = openForHelm(key, sealed);
    return {
      title: typeof opened.title === 'string' ? opened.title : null,
      notes: typeof opened.notes === 'string' ? opened.notes : null,
      steps: (opened.steps ?? {}) as Record<string, { text: string }>,
    };
  } catch {
    return null;
  }
};

async function claimCapture(
  firestore: Firestore,
  ref: DocumentReference,
  now: number,
) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const capture = snapshot.data() as CaptureDoc | undefined;
    if (!capture || !isLeaseOpen(capture, now)) return null;
    const claimId = crypto.randomUUID();
    transaction.update(ref, {
      status: 'interpreting',
      claimId,
      claimedAt: now,
    });
    return { claimId, capture };
  });
}

async function failClaim(
  firestore: Firestore,
  ref: DocumentReference,
  claimId: string,
  failure: SortFailure,
): Promise<SortResult> {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const capture = snapshot.data() as CaptureDoc | undefined;
    if (!capture || capture.claimId !== claimId) return toResult('received');
    const attempts = (capture.attempts ?? 0) + (failure.countsAttempt ? 1 : 0);
    const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'received';
    transaction.update(ref, {
      status,
      attempts,
      lastErrorCode: failure.code,
      claimId: null,
      claimedAt: null,
    });
    return toResult(status);
  });
}

interface Claimed {
  firestore: Firestore;
  uid: string;
  keyring: Keyring;
  captureRef: DocumentReference;
  requestRef: DocumentReference;
  claimId: string;
  capture: CaptureDoc;
}

async function sortClaimed(claimed: Claimed): Promise<SortResult> {
  const { firestore, uid, capture } = claimed;
  const base = `apps/helm/users/${uid}`;
  const key = await unwrapHelmKey(firestore, claimed.keyring, uid).catch(() => {
    logger.error('helm.sort.keyUnavailable');
    throw new SortFailure('noKey', false);
  });
  const opened = openForHelm(key, capture.sealed);
  const text = typeof opened.text === 'string' ? opened.text : null;
  if (!text) throw new SortFailure('unreadable');
  const reading = toReading(opened.reading);

  const [profile, openTasks] = await Promise.all([
    firestore.doc(base).get(),
    firestore
      .collection(`${base}/tasks`)
      .where('status', '==', 'open')
      .orderBy('createdAt', 'desc')
      .limit(MAX_CONTEXT_TASKS)
      .get(),
  ]);
  const tasks = openTasks.docs.flatMap((doc): ContextTask[] => {
    const words = openTitle(key, (doc.data() as TaskDoc).sealed);
    return words?.title
      ? [{ id: doc.id, title: words.title, due: (doc.data() as TaskDoc).due }]
      : [];
  });
  const timeZone = (profile.data()?.timeZone as string | undefined) ?? 'UTC';
  const context = buildContext({
    text,
    reading,
    createdAt: capture.createdAt,
    timeZone,
    tasks,
  });

  const provider = pickProvider(text, reading);
  const mcp = await createHelmMcpServer({
    uid,
    key,
    aliases: context.aliases,
    firestore,
  });
  const loop = await provider
    .runToolLoop({
      role: 'interpret',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context.message }],
      mcpClient: mcp.client,
      terminalTool: FILE_RESULTS_TOOL,
      limits: LOOP_LIMITS,
    })
    .finally(() => mcp.close().catch(() => undefined));

  const cost = getUsageCost('interpret', loop.usage);
  if (cost > 0) await recordAiSpend(firestore, Date.now(), cost);
  logger.info('helm.ai.call', {
    role: 'interpret',
    endedBy: loop.endedBy,
    errorCode: loop.errorCode,
    toolCalls: loop.toolCalls,
    ...loop.usage,
  });
  if (loop.endedBy !== 'terminal') {
    throw new SortFailure(
      loop.endedBy === 'error'
        ? (loop.errorCode ?? 'modelError')
        : loop.endedBy,
    );
  }

  const commands = normalizeNomosReply(loop.terminalInput, {
    reading,
    aliases: context.aliases,
  }).filter((command) => decide(command) === 'automatic');

  return writeResult({ ...claimed, key, commands, base });
}

async function writeResult(
  input: Claimed & { key: HelmKey; commands: NomosCommand[]; base: string },
): Promise<SortResult> {
  const { firestore, captureRef, requestRef, claimId, key, commands, base } =
    input;
  const tasksPath = `${base}/tasks`;
  const targetIds = [
    ...new Set(
      commands.flatMap((command) =>
        command.kind !== 'createTask' && !command.taskId.startsWith('$new')
          ? [command.taskId]
          : [],
      ),
    ),
  ];
  const result = await firestore.runTransaction(async (transaction) => {
    const [captureSnap, requestSnap, ...targetSnaps] = await Promise.all([
      transaction.get(captureRef),
      transaction.get(requestRef),
      ...targetIds.map((id) =>
        transaction.get(firestore.doc(`${tasksPath}/${id}`)),
      ),
    ]);
    if (requestSnap.exists) return requestSnap.data()?.result as SortResult;
    const capture = captureSnap.data() as CaptureDoc | undefined;
    if (
      !capture ||
      capture.claimId !== claimId ||
      capture.status !== 'interpreting'
    ) {
      return null;
    }
    const existing = new Map<string, ExistingTask>(
      targetSnaps.flatMap((snapshot): [string, ExistingTask][] => {
        const task = snapshot.data() as TaskDoc | undefined;
        const words = task ? openTitle(key, task.sealed) : null;
        return task && words?.title
          ? [
              [
                snapshot.id,
                {
                  status: task.status,
                  due: task.due,
                  isUrgent: task.isUrgent,
                  title: words.title,
                  notes: words.notes,
                  steps: words.steps,
                },
              ],
            ]
          : [];
      }),
    );
    const now = Date.now();
    const executionRef = firestore.collection(`${base}/executions`).doc();
    const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);
    const plan = planWrites({
      commands,
      existing,
      captureId: captureRef.id,
      executionId: executionRef.id,
      now,
      seal,
      newId: () => firestore.collection(tasksPath).doc().id,
    });
    if (plan.effects.length === 0) throw new SortFailure('nothingToFile');

    plan.creates.forEach(({ id, data }) =>
      transaction.create(firestore.doc(`${tasksPath}/${id}`), data),
    );
    plan.updates.forEach(({ id, data }) =>
      transaction.update(firestore.doc(`${tasksPath}/${id}`), data),
    );
    transaction.create(
      executionRef,
      buildExecution(plan, { commands, captureId: captureRef.id, now, seal }),
    );
    transaction.update(captureRef, {
      status: 'sorted',
      sortedAt: now,
      executionIds: [executionRef.id],
      route: 'full',
      claimId: null,
      claimedAt: null,
      heldReason: null,
      lastErrorCode: null,
      seenAt: null,
    });
    const sorted = toResult('sorted', executionRef.id);
    transaction.create(requestRef, { result: sorted, createdAt: now });
    logger.info('helm.sort.done', {
      commands: commands.length,
      effects: plan.effects.length,
      ...plan.counts,
    });
    return sorted;
  });
  if (!result) {
    logger.info('helm.sort.leaseLost');
    return toResult('received');
  }
  return result;
}

const readInput = (data: unknown) => {
  const input = (data ?? {}) as { captureId?: unknown; requestKey?: unknown };
  if (
    typeof input.captureId !== 'string' ||
    typeof input.requestKey !== 'string' ||
    !ID_RE.test(input.captureId) ||
    !ID_RE.test(input.requestKey)
  ) {
    throw new HttpsError('invalid-argument', 'This capture could not be read.');
  }
  return { captureId: input.captureId, requestKey: input.requestKey };
};

export const sortHelmCapture = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    minInstances: 0,
    timeoutSeconds: 60,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<SortResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const { captureId, requestKey } = readInput(request.data);
    const firestore = getFirestore();
    const captureRef = firestore.doc(
      `apps/helm/users/${uid}/captures/${captureId}`,
    );
    const requestRef = firestore.doc(
      `apps/helm/server/${uid}/sortRequests/${requestKey}`,
    );

    const [stored, snapshot] = await Promise.all([
      requestRef.get(),
      captureRef.get(),
    ]);
    if (stored.exists) return stored.data()?.result as SortResult;
    const early = snapshot.data() as CaptureDoc | undefined;
    if (!early) throw new HttpsError('not-found', 'This capture is gone.');
    const answer = readEarlyAnswer(early, Date.now());
    if (answer) return answer;

    const held = await reserveAiCall(firestore, uid, Date.now());
    if (held) {
      if (early.status === 'received') {
        await captureRef.update({ heldReason: held });
      }
      throw new HttpsError(
        'resource-exhausted',
        'Helm will sort this a little later.',
      );
    }

    const keyring = loadKeyringOrFail();
    const claim = await claimCapture(firestore, captureRef, Date.now());
    if (!claim) return toResult('received');

    return sortClaimed({
      firestore,
      uid,
      keyring,
      captureRef,
      requestRef,
      ...claim,
    }).catch((error: unknown) => {
      const failure =
        error instanceof SortFailure
          ? error
          : new SortFailure(
              error instanceof NomosReplyError ? error.code : 'unexpected',
            );
      logger.warn('helm.sort.failed', { code: failure.code });
      return failClaim(firestore, captureRef, claim.claimId, failure);
    });
  },
);
