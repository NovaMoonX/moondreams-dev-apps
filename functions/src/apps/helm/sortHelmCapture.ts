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
import {
  claimAttempts,
  isTransientCode,
  readStoredResult,
  restFailureFields,
  settleAttempts,
} from './sortAttempts.js';
import { createHelmMcpServer } from './mcp/server.js';
import {
  buildContext,
  readMadeTitles,
  type ContextTask,
} from './nomos/buildContext.js';
import {
  FILE_RESULTS_TOOL,
  toReading,
  type CaptureReading,
  type NomosCommand,
  type TaskDue,
} from './nomos/commands.js';
import {
  buildExecution,
  hasOpenMoreToSort,
  planWrites,
  settleCapture,
  type ExistingTask,
  type QuestionStateEntry,
} from './nomos/executeCommands.js';
import { createFixtureProvider } from './nomos/fixtureProvider.js';
import {
  normalizeNomosReply,
  NomosReplyError,
} from './nomos/normalizeNomosReply.js';
import { decide } from './nomos/policy.js';
import {
  MAX_CONTEXT_TASKS,
  REST_PROMPT,
  SYSTEM_PROMPT,
} from './nomos/prompt.js';

if (getApps().length === 0) {
  initializeApp();
}

export const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

const LEASE_MS = 90_000;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const LOOP_LIMITS = { maxTurns: 6, maxToolCalls: 12, maxMillis: 40_000 };

type SortMode = 'full' | 'rest';

interface SortResult {
  status: 'sorted' | 'received' | 'failed' | 'needsYou';
  executionId: string | null;
}

const toResult = (
  status: SortResult['status'],
  executionId: string | null = null,
): SortResult => ({ status, executionId });

interface CaptureDoc {
  status: string;
  attempts?: number;
  claimId?: string | null;
  claimedAt?: number | null;
  executionIds?: string[];
  questionState?: Record<string, QuestionStateEntry>;
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

const toFailure = (code: string) =>
  new SortFailure(code, !isTransientCode(code));

const isLeaseOpen = (capture: CaptureDoc, now: number) =>
  capture.status === 'received' ||
  (capture.status === 'interpreting' &&
    now - (capture.claimedAt ?? 0) >= LEASE_MS);

/** What a call answers when the capture is not for it to read: already sorted, waiting on the person, failed, or in another call's hands. */
const readEarlyAnswer = (
  capture: CaptureDoc,
  now: number,
  mode: SortMode,
): SortResult | null => {
  if (isLeaseOpen(capture, now)) return null;
  if (mode === 'rest' && capture.status === 'needsYou') return null;
  if (capture.status === 'failed') return toResult('failed');
  if (capture.status === 'interpreting') return toResult('received');
  return toResult(
    capture.status === 'needsYou' ? 'needsYou' : 'sorted',
    capture.executionIds?.[0] ?? null,
  );
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
      sealed: opened as Record<string, unknown>,
    };
  } catch {
    return null;
  }
};

async function claimCapture(
  firestore: Firestore,
  ref: DocumentReference,
  now: number,
  mode: SortMode,
) {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const capture = snapshot.data() as CaptureDoc | undefined;
    if (!capture) return null;
    const hasMore = hasOpenMoreToSort(capture.questionState);
    if (mode === 'rest') {
      if (!hasMore) return null;
      if (capture.status !== 'needsYou' && !isLeaseOpen(capture, now)) {
        return null;
      }
      const claimId = crypto.randomUUID();
      transaction.update(ref, {
        status: 'interpreting',
        heldReason: null,
        claimId,
        claimedAt: now,
      });
      return { claimId, capture };
    }
    if (!isLeaseOpen(capture, now)) return null;
    if (hasMore) {
      transaction.update(ref, {
        status: 'needsYou',
        claimId: null,
        claimedAt: null,
      });
      return 'needsYou' as const;
    }
    const attempts = claimAttempts(capture.attempts ?? 0);
    if (attempts === null) {
      transaction.update(ref, {
        status: 'failed',
        lastErrorCode: 'attemptsSpent',
        claimId: null,
        claimedAt: null,
      });
      return 'failed' as const;
    }
    const claimId = crypto.randomUUID();
    transaction.update(ref, {
      status: 'interpreting',
      attempts,
      heldReason: null,
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
  extra: Record<string, unknown> = {},
  mode: SortMode = 'full',
): Promise<SortResult> {
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const capture = snapshot.data() as CaptureDoc | undefined;
    if (!capture || capture.claimId !== claimId) return toResult('received');
    if (mode === 'rest') {
      transaction.update(ref, restFailureFields(failure.code, extra));
      return toResult('needsYou');
    }
    const { attempts, status } = settleAttempts(
      capture.attempts ?? 0,
      failure.countsAttempt,
    );
    transaction.update(ref, {
      status,
      attempts,
      lastErrorCode: failure.code,
      claimId: null,
      claimedAt: null,
      ...extra,
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
  mode: SortMode;
}

async function readAlreadyMade(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  executionIds: string[],
) {
  const snapshots = await Promise.all(
    executionIds.map((id) => firestore.doc(`${base}/executions/${id}`).get()),
  );
  const readable = snapshots.flatMap((snapshot) => {
    const data = snapshot.data() as
      { effectRefs?: unknown; sealed: SealedPayload } | undefined;
    const words = data ? openTitle(key, data.sealed) : null;
    return data && words ? [readMadeTitles(data.effectRefs, words.sealed)] : [];
  });
  if (readable.length < executionIds.length) {
    logger.warn('helm.sort.alreadyMadeUnreadable', {
      unreadable: executionIds.length - readable.length,
      executions: executionIds.length,
    });
  }
  return readable.flat();
}

async function sortClaimed(claimed: Claimed): Promise<SortResult> {
  const { firestore, uid, capture, mode } = claimed;
  const base = `apps/helm/users/${uid}`;
  const key = await unwrapHelmKey(firestore, claimed.keyring, uid).catch(() => {
    logger.error('helm.sort.keyUnavailable');
    throw new SortFailure('noKey', false);
  });
  const opened = openForHelm(key, capture.sealed);
  const text = typeof opened.text === 'string' ? opened.text : null;
  if (!text) throw new SortFailure('unreadable');
  const reading = toReading(opened.reading);

  const [profile, openTasks, alreadyMade] = await Promise.all([
    firestore.doc(base).get(),
    firestore
      .collection(`${base}/tasks`)
      .where('status', '==', 'open')
      .orderBy('createdAt', 'desc')
      .limit(MAX_CONTEXT_TASKS)
      .get(),
    mode === 'rest'
      ? readAlreadyMade(firestore, base, key, capture.executionIds ?? [])
      : Promise.resolve(undefined),
  ]);
  const tasks = openTasks.docs.flatMap((doc): ContextTask[] => {
    const words = openTitle(key, (doc.data() as TaskDoc).sealed);
    if (!words?.title) {
      logger.warn('helm.sort.taskUnreadable', { taskId: doc.id });
      return [];
    }
    return [
      { id: doc.id, title: words.title, due: (doc.data() as TaskDoc).due },
    ];
  });
  const timeZone = (profile.data()?.timeZone as string | undefined) ?? 'UTC';
  const context = buildContext({
    text,
    reading,
    createdAt: capture.createdAt,
    timeZone,
    tasks,
    alreadyMade,
  });

  const provider = pickProvider(text, reading);
  const held = await reserveAiCall(firestore, uid, Date.now());
  if (held) {
    await failClaim(
      firestore,
      claimed.captureRef,
      claimed.claimId,
      new SortFailure('held', false),
      { heldReason: held, lastErrorCode: null },
      mode,
    );
    throw new HttpsError(
      'resource-exhausted',
      'This will be sorted a little later.',
      { heldReason: held },
    );
  }
  const mcp = await createHelmMcpServer({
    uid,
    key,
    aliases: context.aliases,
    firestore,
  });
  const loop = await provider
    .runToolLoop({
      role: 'interpret',
      system:
        mode === 'rest' ? `${SYSTEM_PROMPT}\n\n${REST_PROMPT}` : SYSTEM_PROMPT,
      messages: [{ role: 'user', content: context.message }],
      mcpClient: mcp.client,
      terminalTool: FILE_RESULTS_TOOL,
      limits: LOOP_LIMITS,
      onUsage: async (usage) => {
        const cost = getUsageCost('interpret', usage);
        if (cost <= 0) return;
        await recordAiSpend(firestore, Date.now(), cost).catch(() =>
          logger.error('helm.ai.spendNotRecorded'),
        );
      },
    })
    .finally(() => mcp.close().catch(() => undefined));

  logger.info('helm.ai.call', {
    role: 'interpret',
    endedBy: loop.endedBy,
    errorCode: loop.errorCode,
    toolCalls: loop.toolCalls,
    ...loop.usage,
  });
  if (loop.endedBy !== 'terminal') {
    throw toFailure(
      loop.endedBy === 'error'
        ? (loop.errorCode ?? 'modelError')
        : loop.endedBy,
    );
  }

  const reply = normalizeNomosReply(loop.terminalInput, {
    reading,
    aliases: context.aliases,
    alreadyMade,
  });
  const commands = reply.commands.filter(
    (command) => decide(command) === 'automatic',
  );

  return writeResult({
    ...claimed,
    key,
    commands,
    hasMore: reply.hasMore,
    base,
  });
}

async function writeResult(
  input: Claimed & {
    key: HelmKey;
    commands: NomosCommand[];
    hasMore: boolean;
    base: string;
  },
): Promise<SortResult> {
  const {
    firestore,
    captureRef,
    requestRef,
    claimId,
    key,
    commands,
    hasMore,
    base,
    mode,
  } = input;
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
    const answered = readStoredResult<SortResult>(
      requestSnap.data(),
      captureRef.id,
    );
    if (answered) return answered;
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
        if (!task) return [];
        const words = openTitle(key, task.sealed);
        if (!words?.title) {
          logger.warn('helm.sort.taskUnreadable', { taskId: snapshot.id });
          return [];
        }
        return [
          [
            snapshot.id,
            {
              status: task.status,
              due: task.due,
              isUrgent: task.isUrgent,
              title: words.title,
              sealed: words.sealed,
            },
          ],
        ];
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
    const isFiling = plan.effects.length > 0;
    if (!isFiling && commands.length > 0 && mode === 'full') {
      throw new SortFailure('nothingToFile');
    }

    if (isFiling) {
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
    }
    const settled = settleCapture({
      mode,
      filed: isFiling ? commands.length : 0,
      hasMore,
      executionId: isFiling ? executionRef.id : null,
      now,
      newId: () => crypto.randomUUID(),
      opened: openForHelm(key, capture.sealed),
      questionState: capture.questionState ?? {},
      executionIds: capture.executionIds ?? [],
    });
    transaction.update(captureRef, {
      status: settled.status,
      sortedAt: now,
      executionIds: settled.executionIds,
      questionState: settled.questionState,
      sealed: seal(settled.sealed),
      route: 'full',
      claimId: null,
      claimedAt: null,
      heldReason: null,
      lastErrorCode: null,
      seenAt: null,
    });
    const sorted = toResult(settled.status, isFiling ? executionRef.id : null);
    transaction.set(requestRef, {
      result: sorted,
      captureId: captureRef.id,
      createdAt: now,
    });
    logger.info('helm.sort.done', {
      mode,
      status: settled.status,
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
  const input = (data ?? {}) as {
    captureId?: unknown;
    requestKey?: unknown;
    mode?: unknown;
  };
  const mode = input.mode ?? 'full';
  if (
    (mode !== 'full' && mode !== 'rest') ||
    typeof input.captureId !== 'string' ||
    typeof input.requestKey !== 'string' ||
    !ID_RE.test(input.captureId) ||
    !ID_RE.test(input.requestKey)
  ) {
    throw new HttpsError('invalid-argument', 'This capture could not be read.');
  }
  return {
    captureId: input.captureId,
    requestKey: input.requestKey,
    mode: mode as SortMode,
  };
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
    const { captureId, requestKey, mode } = readInput(request.data);
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
    const answered = readStoredResult<SortResult>(stored.data(), captureId);
    if (answered) return answered;
    const early = snapshot.data() as CaptureDoc | undefined;
    if (!early) throw new HttpsError('not-found', 'This capture is gone.');
    if (mode === 'rest' && !hasOpenMoreToSort(early.questionState)) {
      throw new HttpsError(
        'failed-precondition',
        'There is nothing left to sort here.',
      );
    }
    const answer = readEarlyAnswer(early, Date.now(), mode);
    if (answer) return answer;

    const keyring = loadKeyringOrFail();
    const claim = await claimCapture(firestore, captureRef, Date.now(), mode);
    if (!claim) return toResult('received');
    if (claim === 'failed' || claim === 'needsYou') return toResult(claim);

    return sortClaimed({
      firestore,
      uid,
      keyring,
      captureRef,
      requestRef,
      mode,
      ...claim,
    }).catch((error: unknown) => {
      if (error instanceof HttpsError) throw error;
      const failure =
        error instanceof SortFailure
          ? error
          : new SortFailure(
              error instanceof NomosReplyError ? error.code : 'unexpected',
            );
      logger.warn('helm.sort.failed', { code: failure.code });
      return failClaim(firestore, captureRef, claim.claimId, failure, {}, mode);
    });
  },
);
