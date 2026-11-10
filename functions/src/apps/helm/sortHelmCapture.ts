import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Transaction,
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
  type EarlierTurn,
} from './nomos/buildContext.js';
import {
  FILE_RESULTS_TOOL,
  toReading,
  type AnswerCommand,
  type CaptureReading,
  type NomosCommand,
  type TaskDue,
} from './nomos/commands.js';
import { buildAnswer } from './nomos/answerGuards.js';
import {
  buildAnswerExecution,
  buildExecution,
  hasOpenMoreToSort,
  planWrites,
  settleCapture,
  type ExistingTask,
  type QuestionStateEntry,
} from './nomos/executeCommands.js';
import { readContextSynced, toKnownZone } from './syncedCopies.js';
import { createFixtureProvider } from './nomos/fixtureProvider.js';
import {
  combineMessages,
  interpretWithJoins,
  type JoinedMessage,
  type JoinedRead,
} from './nomos/joinedTurn.js';
import {
  normalizeNomosReply,
  NomosReplyError,
} from './nomos/normalizeNomosReply.js';
import { decide } from './nomos/policy.js';
import {
  HAND_OVER_TOOL,
  pickRoute,
  runRouted,
  type Route,
} from './nomos/route.js';
import { sanitizeScreen, type ScreenRefs } from './nomos/sanitizeScreen.js';
import {
  INTERRUPTED_PROMPT,
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
const EARLIER_TURNS = 6;
const EARLIER_EXECUTIONS = 3;
const EARLIER_RECORDS = 10;
const MAX_JOINED = 9;
const MAX_LISTED = 50;
const LOOP_LIMITS = { maxTurns: 6, maxToolCalls: 12, maxMillis: 40_000 };
// Leaves the rest of the call for a hand-over; a restart with less than this plus a full run's minimum left skips the quick route.
const QUICK_LOOP_MILLIS = 15_000;
const CALL_BUDGET_MS = 55_000;
const RESTART_MARGIN_MS = 5_000;
const MIN_RESTART_MS = 22_000;
const SETTLE_QUIET_MS = 1_000;
const SETTLE_MAX_MS = 3_000;

type SortMode = 'full' | 'rest';

interface SortResult {
  status: 'sorted' | 'received' | 'failed' | 'needsYou';
  executionId: string | null;
  releasedIds: string[];
  hasAnswer: boolean;
  spoken: string | null;
}

const toResult = (
  status: SortResult['status'],
  executionId: string | null = null,
  releasedIds: string[] = [],
  answer: Pick<SortResult, 'hasAnswer' | 'spoken'> = {
    hasAnswer: false,
    spoken: null,
  },
): SortResult => ({ status, executionId, releasedIds, ...answer });

const readAnswered = (stored: unknown, captureId: string) => {
  const answered = readStoredResult<Partial<SortResult> & SortResult>(
    stored as { captureId?: unknown; result?: SortResult } | undefined,
    captureId,
  );
  return answered
    ? {
        ...answered,
        releasedIds: answered.releasedIds ?? [],
        hasAnswer: answered.hasAnswer ?? false,
        spoken: answered.spoken ?? null,
      }
    : null;
};

interface CaptureDoc {
  status: string;
  attempts?: number;
  claimId?: string | null;
  claimedAt?: number | null;
  executionIds?: string[];
  questionState?: Record<string, QuestionStateEntry>;
  sessionId?: string;
  turnIndex?: number;
  turnLeadId?: string | null;
  inputMode?: string;
  route?: Route | null;
  joinedCaptureIds?: string[];
  screen?: unknown;
  interruptedCaptureId: string | null;
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

const readLeadHold = async (
  transaction: Transaction,
  ref: DocumentReference,
  capture: CaptureDoc,
) => {
  const leadId = capture.turnLeadId;
  if (typeof leadId !== 'string' || !ID_RE.test(leadId)) return false;
  if (leadId === ref.id) return false;
  const lead = (await transaction.get(ref.parent.doc(leadId))).data() as
    CaptureDoc | undefined;
  return (
    !!lead &&
    (lead.status === 'received' || lead.status === 'interpreting') &&
    (lead.joinedCaptureIds ?? []).includes(ref.id)
  );
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
    if (mode === 'full' && (await readLeadHold(transaction, ref, capture))) {
      return null;
    }
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
    const ownTurn = capture.turnLeadId ? { turnLeadId: null } : {};
    if (hasMore) {
      transaction.update(ref, {
        ...ownTurn,
        status: 'needsYou',
        claimId: null,
        claimedAt: null,
      });
      return 'needsYou' as const;
    }
    const attempts = claimAttempts(capture.attempts ?? 0);
    if (attempts === null) {
      transaction.update(ref, {
        ...ownTurn,
        status: 'failed',
        lastErrorCode: 'attemptsSpent',
        claimId: null,
        claimedAt: null,
      });
      return 'failed' as const;
    }
    const claimId = crypto.randomUUID();
    transaction.update(ref, {
      ...ownTurn,
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
  startedAt: number;
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

/** The tasks a page showed, read again under the capture's own account: a missing one or one that won't open is left out. */
async function readScreenTasks(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  refs: ScreenRefs | null,
) {
  const ids = refs
    ? [
        ...new Set([
          ...(refs.focusId ? [refs.focusId] : []),
          ...refs.visible.map((entry) => entry.id),
        ]),
      ]
    : [];
  if (!refs || ids.length === 0) return null;
  const snapshots = await firestore.getAll(
    ...ids.map((id) => firestore.doc(`${base}/tasks/${id}`)),
  );
  const tasks = new Map(
    snapshots.flatMap((snapshot): [string, ContextTask][] => {
      const task = snapshot.data() as TaskDoc | undefined;
      const words = task ? openTitle(key, task.sealed) : null;
      return task && words?.title
        ? [
            [
              snapshot.id,
              { id: snapshot.id, title: words.title, due: task.due },
            ],
          ]
        : [];
    }),
  );
  return {
    view: refs.view,
    focus: (refs.focusId && tasks.get(refs.focusId)) || null,
    visible: refs.visible.flatMap(({ id, position }) => {
      const task = tasks.get(id);
      return task ? [{ ...task, position }] : [];
    }),
  };
}

/** The last turns of this turn's conversation, oldest first: what was said, the summary of what was done and the tasks it touched. A turn from before conversations were kept has none. */
async function readEarlierTurns(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  capture: CaptureDoc,
): Promise<EarlierTurn[]> {
  if (typeof capture.sessionId !== 'string') return [];
  if (typeof capture.turnIndex !== 'number') return [];
  const earlier = await firestore
    .collection(`${base}/captures`)
    .where('sessionId', '==', capture.sessionId)
    .where('turnIndex', '<', capture.turnIndex)
    .orderBy('turnIndex', 'desc')
    .limit(EARLIER_TURNS * 2)
    .get();
  const fetched = new Set(earlier.docs.map((doc) => doc.id));
  const readSaid = (data: CaptureDoc) => {
    const said = openTitle(key, data.sealed)?.sealed.text;
    return typeof said === 'string' && said ? said : null;
  };
  const isFolded = (data: CaptureDoc) =>
    typeof data.turnLeadId === 'string' && fetched.has(data.turnLeadId);
  const foldedWords = new Map(
    earlier.docs
      .slice()
      .reverse()
      .flatMap((doc): [string, string][] => {
        const data = doc.data() as CaptureDoc;
        const words = readSaid(data);
        return isFolded(data) && words
          ? [[data.turnLeadId as string, words]]
          : [];
      })
      .reduce(
        (all, [leadId, words]) =>
          all.set(leadId, [...(all.get(leadId) ?? []), words]),
        new Map<string, string[]>(),
      ),
  );
  const turns = await Promise.all(
    earlier.docs
      .filter((doc) => {
        const data = doc.data() as CaptureDoc;
        return !isFolded(data) && !!readSaid(data);
      })
      .slice(0, EARLIER_TURNS)
      .map(async (doc): Promise<EarlierTurn[]> => {
        const data = doc.data() as CaptureDoc;
        const own = readSaid(data) as string;
        const said = [own, ...(foldedWords.get(doc.id) ?? [])].join('\n');
        const executions = await Promise.all(
          (data.executionIds ?? [])
            .slice(0, EARLIER_EXECUTIONS)
            .map((id) => firestore.doc(`${base}/executions/${id}`).get()),
        );
        const done = executions.flatMap((snapshot) => {
          const execution = snapshot.data() as
            { effectRefs?: unknown; sealed: SealedPayload } | undefined;
          const summary = execution
            ? openTitle(key, execution.sealed)?.sealed.summary
            : null;
          const refs = Array.isArray(execution?.effectRefs)
            ? (execution.effectRefs as {
                collection?: unknown;
                docId?: unknown;
              }[])
            : [];
          return [
            {
              summary: typeof summary === 'string' ? summary : null,
              ids: refs.flatMap((ref) =>
                ref?.collection === 'tasks' && typeof ref.docId === 'string'
                  ? [ref.docId]
                  : [],
              ),
            },
          ];
        });
        const summaries = done.flatMap((entry) => entry.summary ?? []);
        return [
          {
            said,
            did: summaries.length ? summaries.join('. ') : null,
            taskIds: [...new Set(done.flatMap((entry) => entry.ids))].slice(
              0,
              EARLIER_RECORDS,
            ),
          },
        ];
      }),
  );
  return turns.flat().reverse();
}

async function sortClaimed(claimed: Claimed): Promise<SortResult> {
  const { firestore, uid, capture, mode } = claimed;
  const base = `apps/helm/users/${uid}`;
  const key = await unwrapHelmKey(firestore, claimed.keyring, uid).catch(() => {
    logger.error('helm.sort.keyUnavailable');
    throw new SortFailure('noKey', false);
  });
  const opened = openForHelm(key, capture.sealed);
  const leadText = typeof opened.text === 'string' ? opened.text : null;
  if (!leadText) throw new SortFailure('unreadable');
  const leadMessage: JoinedMessage = {
    text: leadText,
    reading: toReading(opened.reading),
  };

  const profileRead = firestore.doc(base).get();
  const [profile, openTasks, alreadyMade, screen, earlierTurns, synced] =
    await Promise.all([
      profileRead,
      firestore
        .collection(`${base}/tasks`)
        .where('status', '==', 'open')
        .orderBy('createdAt', 'desc')
        .limit(MAX_CONTEXT_TASKS)
        .get(),
      mode === 'rest'
        ? readAlreadyMade(firestore, base, key, capture.executionIds ?? [])
        : Promise.resolve(undefined),
      readScreenTasks(firestore, base, key, sanitizeScreen(capture.screen)),
      readEarlierTurns(firestore, base, key, capture),
      profileRead.then((snapshot) =>
        readContextSynced(
          firestore,
          uid,
          key,
          capture.createdAt,
          toKnownZone(
            (snapshot.data()?.timeZone as string | undefined) ?? 'UTC',
          ),
        ),
      ),
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

  const readJoined = async (): Promise<
    JoinedRead & { messages: JoinedMessage[]; isSpoken: boolean }
  > => {
    const lead = (await claimed.captureRef.get()).data() as
      CaptureDoc | undefined;
    const listed = (lead?.joinedCaptureIds ?? []).filter(
      (id) => typeof id === 'string' && ID_RE.test(id),
    );
    const wanted = [...new Set(listed)].slice(0, MAX_JOINED);
    const snapshots = wanted.length
      ? await firestore.getAll(
          ...wanted.map((id) => firestore.doc(`${base}/captures/${id}`)),
        )
      : [];
    const joined = snapshots.filter((snapshot) => {
      const data = snapshot.data() as CaptureDoc | undefined;
      return (
        data?.turnLeadId === claimed.captureRef.id &&
        (data.status === 'received' ||
          (mode === 'rest' && data.status === 'sorted'))
      );
    });
    const messages = joined.flatMap((snapshot): JoinedMessage[] => {
      const joinedOpened = openTitle(
        key,
        (snapshot.data() as CaptureDoc).sealed,
      )?.sealed;
      return typeof joinedOpened?.text === 'string' && joinedOpened.text
        ? [
            {
              text: joinedOpened.text,
              reading: toReading(joinedOpened.reading),
            },
          ]
        : [];
    });
    return {
      ids: mode === 'rest' ? [] : joined.map((snapshot) => snapshot.id),
      joinedCount: listed.length,
      messages: [leadMessage, ...messages],
      // A turn is spoken when any of its messages was, so a spoken message joined behind a typed one still hears its reply.
      isSpoken:
        lead?.inputMode === 'voice' ||
        joined.some(
          (snapshot) => (snapshot.data() as CaptureDoc).inputMode === 'voice',
        ),
    };
  };

  const run = async (
    read: JoinedRead & { messages: JoinedMessage[]; isSpoken: boolean },
    signal: AbortSignal,
    isRestart: boolean,
  ) => {
    const timeLeft = () =>
      claimed.startedAt + CALL_BUDGET_MS - Date.now() - RESTART_MARGIN_MS;
    const combined = combineMessages(read.messages);
    const context = buildContext({
      text: combined.text,
      texts: combined.texts,
      reading: combined.reading,
      createdAt: capture.createdAt,
      timeZone,
      tasks,
      synced,
      alreadyMade,
      screen,
      earlierTurns,
    });
    const provider = pickProvider(combined.text, combined.reading);
    const system = [
      SYSTEM_PROMPT,
      mode === 'rest' ? REST_PROMPT : null,
      typeof capture.interruptedCaptureId === 'string' &&
      capture.interruptedCaptureId !== ''
        ? INTERRUPTED_PROMPT
        : null,
    ]
      .filter((part) => part !== null)
      .join('\n\n');
    const runOn = async (role: 'quick' | 'interpret', canHandOver: boolean) => {
      const mcp = await createHelmMcpServer({
        uid,
        key,
        aliases: context.aliases,
        synced: context.synced,
        timeZone,
        firestore,
      });
      const maxMillis = canHandOver ? QUICK_LOOP_MILLIS : LOOP_LIMITS.maxMillis;
      const loop = await provider
        .runToolLoop({
          role,
          system,
          messages: [{ role: 'user', content: context.message }],
          mcpClient: mcp.client,
          terminalTool: FILE_RESULTS_TOOL,
          extraTerminalTools: canHandOver ? [HAND_OVER_TOOL] : [],
          limits: {
            ...LOOP_LIMITS,
            maxMillis: Math.min(maxMillis, timeLeft()),
          },
          signal,
          onUsage: async (usage) => {
            const cost = getUsageCost(role, usage);
            if (cost <= 0) return;
            await recordAiSpend(firestore, Date.now(), cost).catch(() =>
              logger.error('helm.ai.spendNotRecorded'),
            );
          },
        })
        .finally(() => mcp.close().catch(() => undefined));
      const handedOver =
        canHandOver &&
        ((loop.endedBy === 'terminal' &&
          loop.terminalName === HAND_OVER_TOOL.name) ||
          loop.endedBy === 'limit');
      logger.info('helm.ai.call', {
        role,
        endedBy: loop.endedBy,
        errorCode: loop.errorCode,
        toolCalls: loop.toolCalls,
        messages: read.messages.length,
        handedOver,
        handOverReasonLength: handedOver
          ? String(
              (loop.terminalInput as { reason?: unknown } | null)?.reason ?? '',
            ).length
          : null,
        ...loop.usage,
      });
      return { handedOver, value: loop };
    };
    const routed = await runRouted({
      route:
        isRestart && timeLeft() < QUICK_LOOP_MILLIS + MIN_RESTART_MS
          ? 'full'
          : pickRoute({ text: combined.text, mode }),
      runOn,
      reserve: (route) => reserveAiCall(firestore, uid, Date.now(), route),
      isAborted: () => signal.aborted,
    });
    if ('held' in routed) {
      await failClaim(
        firestore,
        claimed.captureRef,
        claimed.claimId,
        new SortFailure('held', false),
        { heldReason: routed.held, lastErrorCode: null },
        mode,
      );
      throw new HttpsError(
        'resource-exhausted',
        'This will be sorted a little later.',
        { heldReason: routed.held },
      );
    }
    const loop = routed.value;
    return {
      endedBy: routed.aborted ? ('aborted' as const) : loop.endedBy,
      loop,
      context,
      combined,
      route: routed.route,
    };
  };

  const { read, result } = await interpretWithJoins({
    readJoined,
    run,
    canRestart: () =>
      claimed.startedAt + CALL_BUDGET_MS - Date.now() >= MIN_RESTART_MS,
    watchJoins: (readCount, onGrow) => {
      const seen = { count: readCount };
      return claimed.captureRef.onSnapshot(
        (snapshot) => {
          const listed = (snapshot.data() as CaptureDoc | undefined)
            ?.joinedCaptureIds;
          const count = listed?.length ?? 0;
          if (count <= seen.count) return;
          seen.count = count;
          onGrow();
        },
        () => undefined,
      );
    },
    quietMs: SETTLE_QUIET_MS,
    maxWaitMs: SETTLE_MAX_MS,
  });
  const { loop, context, combined, route } = result;
  if (loop.endedBy !== 'terminal') {
    throw toFailure(
      loop.endedBy === 'error'
        ? (loop.errorCode ?? 'modelError')
        : loop.endedBy,
    );
  }

  const reply = normalizeNomosReply(loop.terminalInput, {
    reading: combined.reading,
    aliases: context.aliases,
    synced: context.synced,
    alreadyMade,
  });
  const answer = mode === 'full' ? reply.answer : null;
  const commands = reply.commands.filter(
    (command) => decide(command) === 'automatic',
  );

  return writeResult({
    ...claimed,
    key,
    commands,
    answer,
    hasMore: reply.hasMore,
    base,
    joinedIds: read.ids,
    messageCount: mode === 'rest' ? 1 : read.messages.length,
    route,
    timeZone,
    isSpoken: read.isSpoken,
  });
}

async function writeResult(
  input: Claimed & {
    key: HelmKey;
    commands: NomosCommand[];
    answer: AnswerCommand | null;
    hasMore: boolean;
    base: string;
    joinedIds: string[];
    messageCount: number;
    route: Route;
    timeZone: string;
    isSpoken: boolean;
  },
): Promise<SortResult> {
  const {
    firestore,
    captureRef,
    requestRef,
    claimId,
    key,
    commands,
    answer,
    hasMore,
    base,
    mode,
    joinedIds,
    messageCount,
    route,
    timeZone,
    isSpoken,
  } = input;
  const tasksPath = `${base}/tasks`;
  const built = answer
    ? buildAnswer(answer, (code) =>
        logger.info('helm.answer.dropped', { code }),
      )
    : null;
  const spokenLine = built && isSpoken ? built.spoken : null;
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
    const answered = readAnswered(requestSnap.data(), captureRef.id);
    if (answered) return answered;
    const capture = captureSnap.data() as CaptureDoc | undefined;
    if (
      !capture ||
      capture.claimId !== claimId ||
      capture.status !== 'interpreting'
    ) {
      return null;
    }
    const joinedRefs = (ids: string[]) =>
      ids.map((id) => captureRef.parent.doc(id));
    const listedNow = [
      ...new Set(
        (capture.joinedCaptureIds ?? []).filter(
          (id) => typeof id === 'string' && ID_RE.test(id),
        ),
      ),
    ].slice(0, MAX_LISTED);
    const lateIds =
      mode === 'full' ? listedNow.filter((id) => !joinedIds.includes(id)) : [];
    const [readSnaps, lateSnaps] = await Promise.all(
      [mode === 'full' ? joinedIds : [], lateIds].map((ids) =>
        Promise.all(joinedRefs(ids).map((ref) => transaction.get(ref))),
      ),
    );
    const isStillJoined = (snapshot: { data(): unknown }) => {
      const data = snapshot.data() as CaptureDoc | undefined;
      return data?.turnLeadId === captureRef.id && data.status === 'received';
    };
    const sortedJoined = readSnaps.filter(isStillJoined);
    const releasedJoined = lateSnaps.filter(isStillJoined);
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
    if (!isFiling && commands.length > 0 && mode === 'full' && !built) {
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
        buildExecution(plan, {
          commands,
          captureId: captureRef.id,
          now,
          seal,
          messageCount,
          inputMode: isSpoken ? 'voice' : capture.inputMode,
          timeZone,
        }),
      );
    }
    const answerExecutionRef = built
      ? firestore.collection(`${base}/executions`).doc()
      : null;
    if (built && answerExecutionRef) {
      transaction.create(
        answerExecutionRef,
        buildAnswerExecution({
          captureId: captureRef.id,
          answer: built.answer,
          spoken: spokenLine,
          now,
          seal,
        }),
      );
    }
    const settled = settleCapture({
      mode,
      filed: isFiling ? commands.length : 0,
      hasMore,
      executionId: isFiling ? executionRef.id : null,
      answer:
        built && answerExecutionRef
          ? {
              executionId: answerExecutionRef.id,
              sealed: built.answer,
              spoken: spokenLine
                ? { text: spokenLine, priority: 'reply', builtBy: 'code' }
                : null,
            }
          : null,
      now,
      newId: () => crypto.randomUUID(),
      opened: openForHelm(key, capture.sealed),
      questionState: capture.questionState ?? {},
      executionIds: capture.executionIds ?? [],
    });
    if (mode === 'full') {
      sortedJoined.forEach((snapshot) =>
        transaction.update(snapshot.ref, {
          status: 'sorted',
          sortedAt: now,
          claimId: null,
          claimedAt: null,
        }),
      );
      releasedJoined.forEach((snapshot) =>
        transaction.update(snapshot.ref, { turnLeadId: null }),
      );
    }
    transaction.update(captureRef, {
      ...(mode === 'full'
        ? { joinedCaptureIds: joinedIds, turnLeadId: null }
        : {}),
      status: settled.status,
      sortedAt: now,
      executionIds: settled.executionIds,
      questionState: settled.questionState,
      sealed: seal(settled.sealed),
      route,
      claimId: null,
      claimedAt: null,
      heldReason: null,
      lastErrorCode: null,
      seenAt: null,
    });
    const sorted = toResult(
      settled.status,
      isFiling ? executionRef.id : (answerExecutionRef?.id ?? null),
      releasedJoined.map((snapshot) => snapshot.id),
      { hasAnswer: built !== null, spoken: spokenLine },
    );
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
      hasAnswer: built !== null,
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
    const startedAt = Date.now();
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
    const answered = readAnswered(stored.data(), captureId);
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
      startedAt,
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
