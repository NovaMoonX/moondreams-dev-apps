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
import type { LiveGrant } from '../../connections/liveRouter.js';
import { createHelmMcpServer } from './mcp/server.js';
import {
  createQuoteBook,
  createSearchedLog,
  type SearchedLog,
} from './nomos/aliases.js';
import {
  buildContext,
  readMadeTitles,
  type ContextFact,
  type ContextTask,
  type EarlierTurn,
} from './nomos/buildContext.js';
import {
  FILE_RESULTS_TOOL,
  MENTION_KINDS,
  toReading,
  type AnswerCommand,
  type AskCommand,
  type CaptureReading,
  type MentionRead,
  type NoteFactCommand,
  type NomosCommand,
  type PlaceRead,
  type PlanDayCommand,
  type RememberCommand,
  type SetCurrentPlaceCommand,
  type TaskDue,
  DEFAULT_ASSISTANT_NAME,
} from './nomos/commands.js';
import { buildFactWrite, settleRemember } from './nomos/remember.js';
import {
  NO_HOME_LINE,
  planSetCurrentPlace,
  type CurrentPlace,
} from './nomos/currentPlace.js';
import { buildAnswer, settleLiveTurn } from './nomos/answerGuards.js';
import {
  describeAnsweredQuestion,
  planAnswerTurn,
  type AskedCapture,
} from './nomos/answerTurn.js';
import {
  ALREADY_ANSWERED_LINE,
  ASK_DEFERRED_LINE,
  NOTHING_CHANGED_LINE,
  buildAnswerKeptLine,
} from './nomos/summaries.js';
import {
  buildAnswerExecution,
  buildExecution,
  countOpenAsked,
  hasOpenMoreToSort,
  planAsks,
  planWrites,
  settleCapture,
  type ExistingFact,
  type ExistingTask,
  type KnownWhoState,
  type PeopleInput,
  type QuestionStateEntry,
} from './nomos/executeCommands.js';
import { readContextSynced, toKnownZone } from './syncedCopies.js';
import { getDayIn } from './nomos/spoken.js';
import { matchWho } from './nomos/matchEntities.js';
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
  isQuestion,
  pickRoute,
  runRouted,
  type Route,
} from './nomos/route.js';
import { sanitizeScreen, type ScreenRefs } from './nomos/sanitizeScreen.js';
import {
  INTERRUPTED_PROMPT,
  MAIL_PROMPT,
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
const MAX_OPEN_ASKED_READ = 200;

const readPlaceName = (key: HelmKey, sealed: unknown) => {
  try {
    const words = openForHelm(key, sealed as SealedPayload);
    return typeof words.name === 'string' && words.name ? words.name : 'Home';
  } catch {
    return 'Home';
  }
};

const toCurrentPlace = (value: unknown): CurrentPlace | null => {
  const { placeId, saidAt } = (value ?? {}) as Partial<CurrentPlace>;
  return typeof placeId === 'string' && typeof saidAt === 'number'
    ? { placeId, saidAt }
    : null;
};
const MAX_FACTS_READ = 20;
const MAX_REPEAT_FACTS_READ = 300;
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
  whoIds?: string[];
  placeIds?: string[];
  questionState?: Record<string, QuestionStateEntry>;
  sessionId?: string;
  turnIndex?: number;
  turnLeadId?: string | null;
  inputMode?: string;
  route?: Route | null;
  answersQuestion?: { captureId?: unknown; questionId?: unknown } | null;
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
  whoIds?: string[];
  placeIds?: string[];
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

const readLiveGrants = (firestore: Firestore, uid: string) =>
  import('../../connections/liveRouter.js')
    .then(({ listLiveGrants }) => listLiveGrants(firestore, uid, 'helm'))
    .catch((error): LiveGrant[] => {
      logger.warn('helm.live.grantsFailed', {
        cause: error instanceof Error ? error.name : 'error',
      });
      return [];
    });

function pickProvider(text: string, reading: CaptureReading): ModelProvider {
  const apiKey = readApiKey();
  if (apiKey) return createAnthropicProvider(apiKey);
  if (isRunningInEmulator()) return createFixtureProvider(text, reading);
  throw new SortFailure('noModelKey', false);
}

export function loadKeyringOrFail(): Keyring {
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

const MAX_PEOPLE_READ = 5_000;
const MAX_MENTION_DAYS_READ = 10;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** The person's who and places, opened, with the mention history the tier rule reads for each who a mention matches that is still passing. Undefined when the turn names none. */
async function readPeople(
  transaction: Transaction,
  input: {
    firestore: Firestore;
    base: string;
    key: HelmKey;
    captureRef: DocumentReference;
    mentions: MentionRead[];
    places: PlaceRead[];
    assistantName: string | null;
    timeZone: string;
    capturedAt: number;
  },
): Promise<PeopleInput | undefined> {
  const { firestore, base, key, captureRef, mentions, places } = input;
  if (mentions.length === 0 && places.length === 0) return undefined;
  const [whoSnap, placeSnap] = await Promise.all(
    ['who', 'places'].map((name) =>
      transaction.get(
        firestore.collection(`${base}/${name}`).limit(MAX_PEOPLE_READ),
      ),
    ),
  );
  const open = (sealed: unknown) => {
    try {
      return openForHelm(key, sealed as SealedPayload);
    } catch {
      return null;
    }
  };
  const aliasesOf = (words: Record<string, unknown>) =>
    isStringList(words.aliases) ? words.aliases : [];
  const unreadable = { who: 0, places: 0 };
  const known = whoSnap.docs.flatMap((doc): KnownWhoState[] => {
    const words = open(doc.get('sealed'));
    const kind = MENTION_KINDS.find((entry) => entry === doc.get('kind'));
    if (!words || typeof words.name !== 'string' || !kind) {
      unreadable.who += 1;
      return [];
    }
    return [
      {
        id: doc.id,
        kind,
        name: words.name,
        aliases: aliasesOf(words),
        lastMentionedAt: Number.isFinite(doc.get('lastMentionedAt'))
          ? Number(doc.get('lastMentionedAt'))
          : null,
        relation: typeof words.relation === 'string' ? words.relation : null,
        species: typeof words.species === 'string' ? words.species : null,
        organizationKind:
          typeof words.organizationKind === 'string'
            ? words.organizationKind
            : null,
        tier: doc.get('tier'),
        tierSetBy: doc.get('tierSetBy'),
        mentionDayKeys: [],
        taskLinkCount: 0,
        hasRole: false,
      },
    ];
  });
  const knownPlaces = placeSnap.docs.flatMap((doc) => {
    const words = open(doc.get('sealed'));
    if (!words || typeof words.name !== 'string') {
      unreadable.places += 1;
      return [];
    }
    return [
      {
        id: doc.id,
        name: words.name,
        aliases: aliasesOf(words),
        address: typeof words.address === 'string' ? words.address : null,
      },
    ];
  });
  if (unreadable.who + unreadable.places > 0) {
    logger.warn('helm.sort.peopleUnreadable', unreadable);
  }
  const matched = new Set(
    matchWho({ mentions, known, assistantName: input.assistantName }).flatMap(
      (match) => (match.kind === 'match' ? [match.id] : []),
    ),
  );
  const zone = toKnownZone(input.timeZone);
  const withHistory = await Promise.all(
    known.map(async (who) => {
      if (
        !matched.has(who.id) ||
        who.tier !== 'passing' ||
        who.tierSetBy !== 'nomos'
      ) {
        return who;
      }
      const [captures, tasks] = await Promise.all([
        transaction.get(
          captureRef.parent
            .where('whoIds', 'array-contains', who.id)
            .limit(MAX_MENTION_DAYS_READ),
        ),
        transaction.get(
          firestore
            .collection(`${base}/tasks`)
            .where('whoIds', 'array-contains', who.id)
            .limit(1),
        ),
      ]);
      return {
        ...who,
        mentionDayKeys: captures.docs
          .filter((doc) => doc.id !== captureRef.id)
          .map((doc) => String(getDayIn(Number(doc.get('createdAt')), zone))),
        taskLinkCount: tasks.size,
      };
    }),
  );
  return {
    mentions,
    places,
    known: withHistory,
    knownPlaces,
    assistantName: input.assistantName,
    dayKey: String(getDayIn(input.capturedAt, zone)),
    capturedAt: input.capturedAt,
  };
}

const MAX_CONTEXT_FACTS = 20;
const MAX_CONTEXT_SUBJECTS = 10;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the person's records hold about the people and places the words name, for the model to answer from: confirmed facts as said, inferred ones as guesses. A failed read gives none, so a turn never waits on it. */
async function readContextFacts(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  text: string,
): Promise<ContextFact[]> {
  try {
    const [whoSnap, placeSnap] = await Promise.all(
      ['who', 'places'].map((name) =>
        firestore.collection(`${base}/${name}`).limit(MAX_PEOPLE_READ).get(),
      ),
    );
    const subjects = [...whoSnap.docs, ...placeSnap.docs].flatMap((doc) => {
      try {
        const words = openForHelm(key, doc.get('sealed') as SealedPayload);
        const names = [
          words.name,
          ...(isStringList(words.aliases) ? words.aliases : []),
        ].filter((name): name is string => typeof name === 'string');
        const isNamed = names.some(
          (name) =>
            name.trim() !== '' &&
            new RegExp(
              `(^|[^\\p{L}\\p{N}])${escapeRegExp(name.trim())}($|[^\\p{L}\\p{N}])`,
              'iu',
            ).test(text),
        );
        return isNamed && typeof words.name === 'string'
          ? [{ id: doc.id, name: words.name }]
          : [];
      } catch {
        return [];
      }
    });
    const named = subjects.slice(0, MAX_CONTEXT_SUBJECTS);
    if (named.length === 0) return [];
    const factSnap = await firestore
      .collection(`${base}/facts`)
      .where(
        'subjectIds',
        'array-contains-any',
        named.map((s) => s.id),
      )
      .limit(MAX_CONTEXT_FACTS * 3)
      .get();
    return factSnap.docs
      .flatMap((doc): (ContextFact & { createdAt: number })[] => {
        const status: unknown = doc.get('status');
        if (status !== 'confirmed' && status !== 'inferred') return [];
        try {
          const words = openForHelm(key, doc.get('sealed') as SealedPayload);
          const ids: unknown = doc.get('subjectIds');
          const subject = named.find(
            (entry) => isStringList(ids) && ids.includes(entry.id),
          );
          return typeof words.statement === 'string' && subject
            ? [
                {
                  subject: subject.name,
                  statement: words.statement,
                  by: status === 'confirmed' ? 'said' : 'inferred',
                  createdAt: Number(doc.get('createdAt')) || 0,
                },
              ]
            : [];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_CONTEXT_FACTS)
      .map(({ subject, statement, by }) => ({ subject, statement, by }));
  } catch (error) {
    logger.warn('helm.sort.factsUnread', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return [];
  }
}

/** The person's confirmed and inferred facts, newest first and opened, for the repeat check; one that won't open is left out. */
async function readSubjectFacts(
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
): Promise<ExistingFact[]> {
  const snapshot = await transaction.get(
    firestore
      .collection(`${base}/facts`)
      .where('status', 'in', ['confirmed', 'inferred'])
      .orderBy('createdAt', 'desc')
      .limit(MAX_REPEAT_FACTS_READ),
  );
  return snapshot.docs.flatMap((doc): ExistingFact[] => {
    try {
      const words = openForHelm(key, doc.get('sealed') as SealedPayload);
      const subjectIds: unknown = doc.get('subjectIds');
      return typeof words.statement === 'string' && isStringList(subjectIds)
        ? [{ statement: words.statement, subjectIds }]
        : [];
    } catch {
      return [];
    }
  });
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

interface AnswerTurn {
  ref: { captureId: string; questionId: string };
  value: unknown;
  words: string;
}

/** The turn and question an answer turn points at, when both ids are well formed. */
const readAnswersQuestion = (capture: CaptureDoc) => {
  const ref = capture.answersQuestion;
  return ref &&
    typeof ref.captureId === 'string' &&
    ID_RE.test(ref.captureId) &&
    typeof ref.questionId === 'string' &&
    ID_RE.test(ref.questionId)
    ? { captureId: ref.captureId, questionId: ref.questionId }
    : null;
};

const toAskedCapture = (
  key: HelmKey,
  data: CaptureDoc | undefined,
): AskedCapture | null => {
  const words = data ? openTitle(key, data.sealed) : null;
  return data && words
    ? {
        status: data.status,
        questionState: data.questionState ?? {},
        opened: words.sealed,
      }
    : null;
};

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
  const answersQuestion = readAnswersQuestion(capture);
  const answerTurn: AnswerTurn | null = answersQuestion
    ? {
        ref: answersQuestion,
        value: opened.questionAnswer ?? null,
        words: leadText,
      }
    : null;
  const askedBefore = answersQuestion
    ? toAskedCapture(
        key,
        (
          await firestore
            .doc(`${base}/captures/${answersQuestion.captureId}`)
            .get()
        ).data() as CaptureDoc | undefined,
      )
    : null;
  const answeredPlan = answerTurn
    ? planAnswerTurn({
        asked: askedBefore,
        questionId: answerTurn.ref.questionId,
        value: answerTurn.value,
        words: answerTurn.words,
        by: 'tap',
        turnCaptureId: claimed.captureRef.id,
        now: Date.now(),
      })
    : null;
  if (answerTurn && answeredPlan?.kind === 'stale') {
    return writeResult({
      ...claimed,
      key,
      commands: [],
      answer: null,
      remember: [],
      noteFacts: [],
      captureText: '',
      planDay: null,
      setCurrentPlace: null,
      asks: [],
      answerTurn,
      mentions: [],
      places: [],
      assistantName: null,
      searched: createSearchedLog(),
      hasMore: false,
      base,
      joinedIds: [],
      messageCount: 1,
      route: 'quick',
      timeZone: 'UTC',
      isSpoken: capture.inputMode === 'voice',
    });
  }
  const answeredQuestion =
    answerTurn && answersQuestion
      ? describeAnsweredQuestion(
          (
            (askedBefore?.opened.questions ?? {}) as Record<
              string,
              { prompt: string; options: { label: string }[] }
            >
          )[answersQuestion.questionId],
          leadText,
        )
      : null;
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
        mode === 'rest'
          ? []
          : readContextSynced(
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
    const facts =
      mode === 'rest'
        ? []
        : await readContextFacts(firestore, base, key, combined.text);
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
      answeredQuestion,
      facts,
    });
    const provider = pickProvider(combined.text, combined.reading);
    const liveGrants =
      mode !== 'rest' && isQuestion(combined.text.trim())
        ? await readLiveGrants(firestore, uid)
        : [];
    const quotes = createQuoteBook();
    const searched = createSearchedLog();
    const system = [
      SYSTEM_PROMPT,
      liveGrants.length > 0 ? MAIL_PROMPT : null,
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
        liveGrants,
        quotes,
        searched,
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
          : pickRoute({
              text: combined.text,
              mode,
              isAnswer: answerTurn !== null,
            }),
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
      quotes,
      searched,
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
  const { loop, context, combined, route, quotes, searched } = result;
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
    quotes,
    alreadyMade,
    timeZone,
  });
  reply.askDropped.forEach((code) => logger.info('helm.ask.dropped', { code }));
  const answer = mode === 'full' ? reply.answer : null;
  const commands = reply.commands.filter(
    (command) => decide(command) === 'automatic',
  );

  return writeResult({
    ...claimed,
    key,
    commands,
    answer,
    remember: mode === 'full' ? reply.remember : [],
    noteFacts: mode === 'full' ? reply.noteFacts : [],
    captureText: combined.text,
    planDay: mode === 'full' ? reply.planDay : null,
    setCurrentPlace: mode === 'full' ? reply.setCurrentPlace : null,
    asks: mode === 'full' ? reply.asks : [],
    answerTurn,
    mentions: reply.mentions,
    places: reply.places,
    assistantName: combined.reading.addressedAs?.text ?? DEFAULT_ASSISTANT_NAME,
    searched,
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
    remember: RememberCommand[];
    noteFacts: NoteFactCommand[];
    captureText: string;
    planDay: PlanDayCommand | null;
    setCurrentPlace: SetCurrentPlaceCommand | null;
    asks: AskCommand[];
    answerTurn: AnswerTurn | null;
    mentions: MentionRead[];
    places: PlaceRead[];
    assistantName: string | null;
    searched: SearchedLog;
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
    answer,
    remember,
    noteFacts,
    captureText,
    planDay: requestedPlanDay,
    setCurrentPlace: requestedHome,
    asks,
    answerTurn,
    mentions,
    places,
    assistantName,
    searched,
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
    ? buildAnswer(
        answer,
        (code) => logger.info('helm.answer.dropped', { code }),
        searched.entries(),
      )
    : null;
  const { commands, refused: settledRefused } = settleLiveTurn(
    input.commands,
    searched.entries().length,
  );
  const liveRefused =
    searched.entries().length > 0 && requestedPlanDay
      ? [...settledRefused, 'live-turn-command']
      : settledRefused;
  const planDayKey =
    searched.entries().length === 0 && requestedPlanDay
      ? new Date(requestedPlanDay.date.date).toISOString().slice(0, 10)
      : null;
  const aboutId = remember[0]?.about?.id ?? null;
  const targetIds = [
    ...new Set(
      commands.flatMap((command) =>
        command.kind !== 'createTask' && !command.taskId.startsWith('$new')
          ? [command.taskId]
          : [],
      ),
    ),
  ];
  const askedRef = answerTurn
    ? captureRef.parent.doc(answerTurn.ref.captureId)
    : null;
  const result = await firestore.runTransaction(async (transaction) => {
    const [
      captureSnap,
      requestSnap,
      askedSnap,
      openAskedSnap,
      factsSnap,
      copySnap,
      homeSnap,
      profileSnap,
      ...targetSnaps
    ] = await Promise.all([
      transaction.get(captureRef),
      transaction.get(requestRef),
      askedRef ? transaction.get(askedRef) : Promise.resolve(null),
      asks.length > 0
        ? transaction.get(
            captureRef.parent
              .where('status', '==', 'needsYou')
              .limit(MAX_OPEN_ASKED_READ),
          )
        : Promise.resolve(null),
      aboutId
        ? transaction.get(
            firestore
              .collection(`${base}/facts`)
              .where('syncedIds', 'array-contains', aboutId)
              .limit(MAX_FACTS_READ),
          )
        : Promise.resolve(null),
      aboutId
        ? transaction.get(firestore.doc(`${base}/synced/${aboutId}`))
        : Promise.resolve(null),
      requestedHome
        ? transaction.get(
            firestore
              .collection(`${base}/places`)
              .where('isHome', '==', true)
              .limit(1),
          )
        : Promise.resolve(null),
      requestedHome
        ? transaction.get(firestore.doc(base))
        : Promise.resolve(null),
      ...targetIds.map((id) =>
        transaction.get(firestore.doc(`${tasksPath}/${id}`)),
      ),
    ]);
    const answered = readAnswered(requestSnap.data(), captureRef.id);
    if (answered) return answered;
    const copyHash: unknown = copySnap?.get('contentHash');
    const noted = settleRemember({
      remember,
      built,
      timeZone,
      existingFacts: (factsSnap?.docs ?? []).map((doc) => ({
        status: String(doc.get('status')),
        aboutField: (doc.get('aboutField') as string | null) ?? null,
        keptOverSource: doc.get('keptOverSource') ?? null,
      })),
      contentHash: typeof copyHash === 'string' ? copyHash : null,
    });
    noted.refused.forEach((code) =>
      logger.info('helm.answer.dropped', { code }),
    );
    liveRefused.forEach((code) => logger.info('helm.answer.dropped', { code }));
    const capture = captureSnap.data() as CaptureDoc | undefined;
    if (
      !capture ||
      capture.claimId !== claimId ||
      capture.status !== 'interpreting'
    ) {
      return null;
    }
    const now = Date.now();
    const turn = answerTurn
      ? planAnswerTurn({
          asked: toAskedCapture(
            key,
            askedSnap?.data() as CaptureDoc | undefined,
          ),
          questionId: answerTurn.ref.questionId,
          value: answerTurn.value,
          words: answerTurn.words,
          by: capture.inputMode === 'voice' ? 'voice' : 'tap',
          turnCaptureId: captureRef.id,
          now,
        })
      : null;
    const isStale = turn?.kind === 'stale';
    const reply = isStale ? null : built;
    const asksNow = isStale ? [] : asks;
    const people =
      (commands.length > 0 || noteFacts.length > 0) && !isStale
        ? await readPeople(transaction, {
            firestore,
            base,
            key,
            captureRef,
            mentions,
            places,
            assistantName,
            timeZone,
            capturedAt: capture.createdAt,
          })
        : undefined;
    const existingFacts =
      noteFacts.length > 0 && !isStale
        ? await readSubjectFacts(transaction, firestore, base, key)
        : [];
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
              whoIds: task.whoIds ?? [],
              placeIds: task.placeIds ?? [],
              sealed: words.sealed,
            },
          ],
        ];
      }),
    );
    const executionRef = firestore.collection(`${base}/executions`).doc();
    const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);
    const homeDoc = homeSnap?.docs[0];
    const home =
      requestedHome && !isStale
        ? planSetCurrentPlace({
            profileId: firestore.doc(base).id,
            home: homeDoc
              ? {
                  id: homeDoc.id,
                  name: readPlaceName(key, homeDoc.get('sealed')),
                }
              : null,
            previous: toCurrentPlace(profileSnap?.get('currentPlace')),
            now,
            timeZone,
          })
        : null;
    const written = planWrites({
      commands: isStale ? [] : commands,
      existing,
      captureId: captureRef.id,
      executionId: executionRef.id,
      now,
      seal,
      newId: () => firestore.collection(tasksPath).doc().id,
      people,
      noteFacts: isStale ? [] : noteFacts,
      captureText,
      existingFacts,
    });
    const plan = home
      ? {
          ...written,
          effectRefs: [...written.effectRefs, home.ref],
          effects: [...written.effects, home.effect],
        }
      : written;
    const isFiling = plan.effects.length > 0;
    if (
      !isFiling &&
      commands.length > 0 &&
      mode === 'full' &&
      !built &&
      !answerTurn
    ) {
      throw new SortFailure('nothingToFile');
    }
    const askPlan = planAsks({
      asks: asksNow,
      openAsked: openAskedSnap
        ? countOpenAsked(
            openAskedSnap.docs.map((doc) => doc.get('questionState')),
          )
        : 0,
      now,
      newId: () => crypto.randomUUID(),
    });
    const questions = [
      ...(isFiling ? plan.questions : []),
      ...askPlan.questions,
    ];
    const firstQuestion = isSpoken ? (questions[0]?.spoken ?? null) : null;

    if (isFiling) {
      plan.creates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${tasksPath}/${id}`), data),
      );
      plan.updates.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${tasksPath}/${id}`), data),
      );
      plan.whoCreates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${base}/who/${id}`), data),
      );
      plan.whoUpdates.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/who/${id}`), data),
      );
      plan.placeCreates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${base}/places/${id}`), data),
      );
      plan.factCreates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${base}/facts/${id}`), data),
      );
      if (home) transaction.update(firestore.doc(base), home.data);
      transaction.create(
        executionRef,
        buildExecution(
          { ...plan, questions },
          {
            homeLine: home?.line ?? null,
            questionRef: answerTurn?.ref ?? null,
            commands,
            captureId: captureRef.id,
            now,
            seal,
            messageCount,
            inputMode: isSpoken ? 'voice' : capture.inputMode,
            timeZone,
          },
        ),
      );
    }
    const spokenAnswer = reply && isSpoken ? reply.spoken : null;
    const spokenLine =
      spokenAnswer && !isFiling && firstQuestion
        ? `${spokenAnswer} ${firstQuestion}`
        : spokenAnswer;
    const answerExecutionRef = reply
      ? firestore.collection(`${base}/executions`).doc()
      : null;
    if (reply && answerExecutionRef) {
      const factRef = firestore.collection(`${base}/facts`).doc();
      const factWrite = noted.fact
        ? buildFactWrite({
            fact: noted.fact,
            captureId: captureRef.id,
            executionId: answerExecutionRef.id,
            factId: factRef.id,
            now,
            seal,
          })
        : null;
      if (factWrite) transaction.create(factRef, factWrite.data);
      transaction.create(
        answerExecutionRef,
        buildAnswerExecution({
          captureId: captureRef.id,
          answer: reply.answer,
          spoken: spokenLine,
          now,
          seal,
          fact: factWrite,
          notDone: [...noted.refused, ...liveRefused],
        }),
      );
    }
    const quietLine = isStale
      ? ALREADY_ANSWERED_LINE
      : askPlan.isDeferred
        ? ASK_DEFERRED_LINE
        : isFiling
          ? null
          : ((requestedHome ? NO_HOME_LINE : null) ??
            firstQuestion ??
            (reply
              ? null
              : answerTurn && commands.length > 0
                ? NOTHING_CHANGED_LINE
                : answerTurn && turn?.kind === 'apply'
                  ? buildAnswerKeptLine(answerTurn.words)
                  : null));
    const settled = settleCapture({
      mode,
      filed: isFiling ? commands.length : 0,
      hasPlanDay: planDayKey !== null,
      hasHome: requestedHome !== null,
      hasFacts: plan.factCreates.length > 0,
      hasMore,
      executionId: isFiling ? executionRef.id : null,
      answer:
        reply && answerExecutionRef
          ? {
              executionId: answerExecutionRef.id,
              sealed: reply.answer,
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
      questions,
      hadAsks: asksNow.length > 0,
      isAnswerTurn: answerTurn !== null,
      line: quietLine,
    });
    if (askedRef && turn?.kind === 'apply') {
      transaction.update(askedRef, {
        questionState: turn.questionState,
        sealed: seal(turn.sealed),
        status: turn.status,
        ...(turn.status === 'sorted' &&
          askedSnap?.get('status') !== 'sorted' && { sortedAt: now }),
      });
    }
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
        ? {
            joinedCaptureIds: joinedIds,
            turnLeadId: null,
            quotedSourceKeys: reply?.quotedSourceKeys ?? [],
            planDayKey,
          }
        : {}),
      ...(plan.linkedWhoIds.length > 0 && {
        whoIds: [...new Set([...(capture.whoIds ?? []), ...plan.linkedWhoIds])],
      }),
      ...(plan.linkedPlaceIds.length > 0 && {
        placeIds: [
          ...new Set([...(capture.placeIds ?? []), ...plan.linkedPlaceIds]),
        ],
      }),
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
      {
        hasAnswer: reply !== null,
        spoken: isSpoken ? (spokenLine ?? quietLine) : null,
      },
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
      hasAnswer: reply !== null,
      hasFact: noted.fact !== null,
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
