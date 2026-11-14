import { getApps, initializeApp } from 'firebase-admin/app';
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import {
  isUnattendedTurn,
  maskPrivateNames,
  readPrivacyFacts,
  type PrivacyFacts,
  type PrivateParent,
} from './privacy.js';
import { toContextTask, type MaskedName } from './nomos/unattended.js';
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';

import { createAnthropicProvider } from '../../ai/providers/anthropic.js';
import type { ModelProvider, ToolLoopContent } from '../../ai/modelProvider.js';
import { getUsageCost } from '../../ai/models.js';
import type { Keyring } from '../../appKeys/keyring.js';
import type { SealedPayload } from '../../appKeys/seal.js';
import { isForcedFixture, isRunningInEmulator } from '../../emulator.js';
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
import type { LiveGrant, SiteLiveGrant } from '../../connections/liveRouter.js';
import {
  readContextKeyDates,
  readIndexIn,
  writeIndexIn,
} from './keyDateStore.js';
import {
  KEY_DATE_KINDS,
  KEY_DATE_PRECISIONS,
  MAX_MOMENTS_PER_WHO,
} from './nomos/commands.js';
import { namedMomentWhoIds, type KeyDateRecord } from './nomos/planKeyDates.js';
import { readActiveProjectsIn, readContextProjects } from './projectStore.js';
import {
  openTopicRecord,
  readContextTopics,
  readHintedNotes,
  type HintedNote,
  type OpenTopicRecord,
} from './noteStore.js';
import {
  blocksOf,
  openLiveProcedure,
  openTaskSteps,
  readContextProcedures,
  readFocusedProcedure,
  readProcedureVersionNumbers,
  writeProcedureVersionIn,
  type LiveProcedure,
} from './procedureStore.js';
import {
  openLiveRun,
  openRunDocs,
  procedureOpenRunsQuery,
  readLiveProcedureIds,
  readOpenRuns,
  toContextRun,
} from './runStore.js';
import { createHelmMcpServer } from './mcp/server.js';
import {
  openMedia,
  type OpenedMedia,
  type UnreadableReason,
} from './media/openMedia.js';
import { sweepExpiredMedia } from './media/sweepMedia.js';
import {
  createQuoteBook,
  createSearchedLog,
  type SearchedLog,
} from './nomos/aliases.js';
import {
  buildContext,
  readMadeTitles,
  topicDocumentFor,
  type ContextFact,
  type ContextFocusedTopic,
  type ContextProcedure,
  MAX_CONTEXT_PROCEDURES,
  type ContextSelfFact,
  type ContextTask,
  type EarlierTurn,
} from './nomos/buildContext.js';
import {
  CLOSE_CONVERSATION_TOOL,
  isShortEnoughToClose,
  FILE_RESULTS_TOOL,
  MENTION_KINDS,
  toReading,
  type AnswerCommand,
  type AskCommand,
  type CaptureReading,
  type CreateNoteCommand,
  type MediaDecision,
  type MentionRead,
  type NoteFactCommand,
  type KeyDateCommand,
  type ProjectCommand,
  MAX_CONTEXT_PROJECTS,
  MAX_CONTEXT_TOPICS,
  MAX_HINT_NOTES,
  type NomosCommand,
  type TopicCommand,
  type ProcedureCommand,
  type RunCommand,
  type PlaceRead,
  type PlanDayCommand,
  type RememberCommand,
  type SetCurrentPlaceCommand,
  type TaskDue,
  DEFAULT_ASSISTANT_NAME,
} from './nomos/commands.js';
import { buildFactWrite, settleRemember } from './nomos/remember.js';
import {
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
  answerQuietLine,
  ownLineStands,
  buildPhotosNotOpenedLine,
  buildFileNotReadLine,
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
  type KeptNote,
  type KnownWhoState,
  type MediaInput,
  type NoteTopicState,
  type PeopleInput,
  type QuestionStateEntry,
} from './nomos/executeCommands.js';
import {
  getLocalDay,
  MAX_CONTEXT_TRIPS,
  readContextSynced,
  readSyncedTrips,
  toKnownZone,
} from './syncedCopies.js';
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
  isNamedIn,
  normalizeNomosReply,
  NomosReplyError,
} from './nomos/normalizeNomosReply.js';
import { refreshRevisions } from './reviseAgain.js';
import {
  openLiveTopic,
  readVersionNumbers,
  writeTopicVersionIn,
  type LiveTopic,
} from './topicVersionStore.js';
import type { PlacedTopic } from './nomos/planTopicCommands.js';
import { decide } from './nomos/policy.js';
import {
  HAND_OVER_TOOL,
  hasReviseCue,
  hasProcedureCue,
  hasProcedureReviseCue,
  isQuestion,
  pickRoute,
  runRouted,
  type Route,
} from './nomos/route.js';
import { readAssistantName } from './assistantName.js';
import { toStyleNotes, toStyleWords } from './styleLearner.js';
import { sanitizeScreen, type ScreenRefs } from './nomos/sanitizeScreen.js';
import {
  INTERRUPTED_PROMPT,
  APP_RECORDS_PROMPT,
  MAIL_PROMPT,
  MAX_CONTEXT_TASKS,
  MEDIA_PROMPT,
  REST_PROMPT,
  STYLE_PROMPT,
  SYSTEM_PROMPT,
  toPersonaPrompt,
  TOPIC_PROMPT,
  PROCEDURE_PROMPT,
} from './nomos/prompt.js';
import { renderWhereBlock } from './nomos/whereThingsLive.js';

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
  attachmentIds?: string[];
  route?: Route | null;
  presence?: {
    startedByWake?: boolean;
    isHidden?: boolean;
    isUntouched?: boolean;
  } | null;
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
  projectId?: string | null;
  privacy?: string | null;
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
  if (isForcedFixture('anthropic')) return '';
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

const readSiteGrants = (firestore: Firestore, uid: string) =>
  import('../../connections/liveRouter.js')
    .then(({ listSiteLiveGrants }) =>
      listSiteLiveGrants(firestore, uid, 'helm'),
    )
    .catch((error): SiteLiveGrant[] => {
      logger.warn('helm.live.siteGrantsFailed', {
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

/** The general style's descriptions for a turn's free writing; nothing when it is missing or will not open. */
const readStyleNotes = (firestore: Firestore, base: string, key: HelmKey) =>
  firestore
    .doc(`${base}/style/general`)
    .get()
    .then((snapshot) =>
      snapshot.exists
        ? toStyleNotes(
            toStyleWords(
              openForHelm(key, snapshot.get('sealed') as SealedPayload),
            ),
          )
        : null,
    )
    .catch(() => null);

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
  /** The notes the device ranked for what was typed, ids only; the rest of the call reads them under the caller's own uid. */
  noteIds: string[];
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
    calledAs: string | null;
    timeZone: string;
    capturedAt: number;
  },
): Promise<PeopleInput | undefined> {
  const { firestore, base, key, captureRef, mentions, places } = input;
  const assistantNames = [
    input.assistantName,
    input.calledAs,
    DEFAULT_ASSISTANT_NAME,
  ].filter((name) => name !== null);
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
        yearlyDateCount: Number.isFinite(doc.get('yearlyDateCount'))
          ? Number(doc.get('yearlyDateCount'))
          : 0,
        momentCount: Number.isFinite(doc.get('momentCount'))
          ? Number(doc.get('momentCount'))
          : 0,
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
    matchWho({ mentions, known, assistantNames }).flatMap((match) =>
      match.kind === 'match' ? [match.id] : [],
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
    assistantNames,
    dayKey: String(getDayIn(input.capturedAt, zone)),
    capturedAt: input.capturedAt,
  };
}

const MAX_KEPT_READS = 20;

export const openKeyDate = (
  key: HelmKey,
  snap: { id: string; get: (field: string) => unknown },
): [string, KeyDateRecord] | null => {
  try {
    const words = openForHelm(key, snap.get('sealed') as SealedPayload);
    const kind = KEY_DATE_KINDS.find((entry) => entry === words.kind);
    const month = typeof words.month === 'number' ? words.month : null;
    const shape = snap.get('shape') === 'moment' ? 'moment' : 'yearly';
    if (
      typeof snap.get('whoId') !== 'string' ||
      !kind ||
      (shape === 'yearly' && month === null)
    ) {
      return null;
    }
    const precision = KEY_DATE_PRECISIONS.find(
      (entry) => entry === words.precision,
    );
    return [
      snap.id,
      {
        whoId: snap.get('whoId') as string,
        shape,
        source: snap.get('source') as KeyDateRecord['source'],
        createdAt: Number(snap.get('createdAt') ?? 0),
        sealed: {
          kind,
          label: typeof words.label === 'string' ? words.label : null,
          month,
          day: typeof words.day === 'number' ? words.day : null,
          year: typeof words.year === 'number' ? words.year : null,
          precision: precision ?? null,
          captureId:
            typeof words.captureId === 'string' ? words.captureId : null,
        },
      },
    ];
  } catch {
    return null;
  }
};

/** The yearly index, the key date documents the commands name, the birthday and passed-away date each person the turn may mean keeps, and the counters of the people they belong to, read in the turn's transaction. */
async function readKeyDateState(
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
  input: {
    keyDates: KeyDateCommand[];
    selfWhoId: string | null;
    candidateWhoIds: string[];
    momentWhoIds: string[];
  },
) {
  const index = await readIndexIn(transaction, firestore, base, key).catch(
    (error: unknown) => {
      logger.error('helm.keyDates.indexUnreadable', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    },
  );
  if (!index) {
    return {
      index: null,
      existing: new Map<string, KeyDateRecord>(),
      kept: new Map<string, { id: string; record: KeyDateRecord }>(),
      moments: new Map<string, { id: string; record: KeyDateRecord }[]>(),
      whoCounts: new Map<string, number>(),
      momentCounts: new Map<string, number>(),
    };
  }
  const candidates = [
    ...new Set([
      ...input.candidateWhoIds,
      ...(input.selfWhoId ? [input.selfWhoId] : []),
    ]),
  ].slice(0, MAX_KEPT_READS);
  const setKinds = input.keyDates.flatMap((command) =>
    command.kind === 'setKeyDate' ? [command.keyKind] : [],
  );
  const birthdayIds = setKinds.includes('birthday')
    ? candidates.flatMap((whoId) =>
        (index.byWho[whoId] ?? [])
          .filter((entry) => entry[1] === 'birthday')
          .map((entry) => entry[0]),
      )
    : [];
  const ids = [
    ...new Set([
      ...input.keyDates.flatMap((command) =>
        command.kind === 'removeKeyDate'
          ? [command.keyDateId]
          : command.keyDateId
            ? [command.keyDateId]
            : [],
      ),
      ...birthdayIds,
    ]),
  ];
  const [snaps, momentSnaps] = await Promise.all([
    ids.length > 0
      ? transaction.getAll(
          ...ids.map((id) => firestore.doc(`${base}/keyDates/${id}`)),
        )
      : [],
    input.momentWhoIds.length > 0
      ? Promise.all(
          input.momentWhoIds
            .slice(0, MAX_KEPT_READS)
            .map((whoId) =>
              transaction.get(
                firestore
                  .collection(`${base}/keyDates`)
                  .where('whoId', '==', whoId)
                  .where('shape', '==', 'moment')
                  .limit(MAX_MOMENTS_PER_WHO),
              ),
            ),
        )
      : [],
  ]);
  const existing = new Map(
    snaps.flatMap((snap): [string, KeyDateRecord][] => {
      const opened = snap.exists ? openKeyDate(key, snap) : null;
      return opened ? [opened] : [];
    }),
  );
  const storedMoments = momentSnaps
    .flatMap((result) => result.docs)
    .flatMap((snap) => {
      const opened = openKeyDate(key, snap);
      return opened ? [{ id: opened[0], record: opened[1] }] : [];
    });
  const moments = storedMoments.reduce(
    (byWho, entry) =>
      byWho.set(entry.record.whoId, [
        ...(byWho.get(entry.record.whoId) ?? []),
        entry,
      ]),
    new Map<string, { id: string; record: KeyDateRecord }[]>(),
  );
  const kept = new Map(
    [
      ...[...existing.entries()].filter(
        ([, record]) => record.sealed.kind === 'birthday',
      ),
      ...storedMoments
        .filter(({ record }) => record.sealed.kind === 'passedAway')
        .map(({ id, record }): [string, KeyDateRecord] => [id, record]),
    ].map(([id, record]): [string, { id: string; record: KeyDateRecord }] => [
      `${record.whoId}:${record.sealed.kind}`,
      { id, record },
    ]),
  );
  const whoIds = [
    ...new Set([
      ...[...existing.values()].map((record) => record.whoId),
      ...(input.selfWhoId ? [input.selfWhoId] : []),
    ]),
  ];
  const whoSnaps =
    whoIds.length > 0
      ? await transaction.getAll(
          ...whoIds.map((id) => firestore.doc(`${base}/who/${id}`)),
        )
      : [];
  const countsOf = (field: string) =>
    new Map(
      whoSnaps.flatMap((snap): [string, number][] =>
        snap.exists
          ? [
              [
                snap.id,
                Number.isFinite(snap.get(field)) ? Number(snap.get(field)) : 0,
              ],
            ]
          : [],
      ),
    );
  return {
    index,
    existing,
    kept,
    moments,
    whoCounts: countsOf('yearlyDateCount'),
    momentCounts: countsOf('momentCount'),
  };
}

const MAX_CONTEXT_FACTS = 20;
const MAX_SELF_FACTS = 30;
const MAX_CONTEXT_SUBJECTS = 10;
const MAX_CONTEXT_SUBJECT_READS = 100;

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What the person's records hold about themself, and about the people and places the words name, for the model to answer from: confirmed facts as said, inferred ones as guesses. A failed read gives none, so a turn never waits on it. */
async function readContextFacts(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  text: string,
  selfWhoId: string | null,
): Promise<{ facts: ContextFact[]; selfFacts: ContextSelfFact[] }> {
  try {
    const factSnap = await firestore
      .collection(`${base}/facts`)
      .where('status', 'in', ['confirmed', 'inferred'])
      .orderBy('createdAt', 'desc')
      .limit(MAX_REPEAT_FACTS_READ)
      .get();
    const subjectIdsOf = (doc: QueryDocumentSnapshot) => {
      const ids: unknown = doc.get('subjectIds');
      return isStringList(ids) ? ids : [];
    };
    const byOf = (doc: QueryDocumentSnapshot) =>
      doc.get('status') === 'confirmed' ? 'said' : 'inferred';
    const selfFacts = selfWhoId
      ? factSnap.docs
          .flatMap((doc): ContextSelfFact[] => {
            const kind: unknown = doc.get('kind');
            if (
              (kind !== 'preference' &&
                kind !== 'favorite' &&
                kind !== 'identity') ||
              !subjectIdsOf(doc).includes(selfWhoId)
            ) {
              return [];
            }
            try {
              const words = openForHelm(
                key,
                doc.get('sealed') as SealedPayload,
              );
              return typeof words.statement === 'string'
                ? [
                    {
                      id: doc.id,
                      kind,
                      topic:
                        typeof words.topic === 'string' ? words.topic : null,
                      value:
                        typeof words.value === 'string' ? words.value : null,
                      statement: words.statement,
                      by: byOf(doc),
                    },
                  ]
                : [];
            } catch {
              return [];
            }
          })
          .slice(0, MAX_SELF_FACTS)
      : [];
    const selfIds = new Set(selfFacts.map((fact) => fact.id));
    const subjectIds = [
      ...new Set(
        factSnap.docs
          .filter((doc) => !selfIds.has(doc.id))
          .flatMap(subjectIdsOf),
      ),
    ].slice(0, MAX_CONTEXT_SUBJECT_READS);
    if (subjectIds.length === 0) return { facts: [], selfFacts };
    const subjectSnaps = await firestore.getAll(
      ...subjectIds.flatMap((id) => [
        firestore.doc(`${base}/who/${id}`),
        firestore.doc(`${base}/places/${id}`),
      ]),
    );
    const named = subjectSnaps
      .filter((doc) => doc.exists)
      .flatMap((doc) => {
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
      })
      .slice(0, MAX_CONTEXT_SUBJECTS);
    if (named.length === 0) return { facts: [], selfFacts };
    const facts = factSnap.docs
      .flatMap((doc): ContextFact[] => {
        if (selfIds.has(doc.id)) return [];
        const ids = subjectIdsOf(doc);
        const subject = named.find((entry) => ids.includes(entry.id));
        if (!subject) return [];
        try {
          const words = openForHelm(key, doc.get('sealed') as SealedPayload);
          return typeof words.statement === 'string'
            ? [
                {
                  id: doc.id,
                  subject: subject.name,
                  statement: words.statement,
                  by: byOf(doc),
                },
              ]
            : [];
        } catch {
          return [];
        }
      })
      .slice(0, MAX_CONTEXT_FACTS);
    return { facts, selfFacts };
  } catch (error) {
    logger.warn('helm.sort.factsUnread', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return { facts: [], selfFacts: [] };
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
      const status: unknown = doc.get('status');
      const kind: unknown = doc.get('kind');
      const stated: unknown = doc.get('stated');
      const disputedWithId: unknown = doc.get('disputedWithId');
      const createdAt: unknown = doc.get('createdAt');
      return typeof words.statement === 'string' &&
        isStringList(subjectIds) &&
        (status === 'confirmed' || status === 'inferred')
        ? [
            {
              id: doc.id,
              status,
              statement: words.statement,
              subjectIds,
              kind:
                kind === 'preference' ||
                kind === 'favorite' ||
                kind === 'identity'
                  ? kind
                  : 'world',
              topic: typeof words.topic === 'string' ? words.topic : null,
              stated:
                stated === 'personSaid' || stated === 'personCorrected'
                  ? stated
                  : 'nomosInferred',
              createdAt: typeof createdAt === 'number' ? createdAt : 0,
              disputedWithId:
                typeof disputedWithId === 'string' ? disputedWithId : null,
            },
          ]
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
  mask: { isOn: boolean; timeZone: string; names: MaskedName[] },
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
              toContextTask(
                snapshot.id,
                task,
                { title: words.title, sealed: words.sealed },
                mask,
              ),
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

async function readFocusedTopic(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  topicId: string | null,
): Promise<ContextFocusedTopic | null> {
  if (!topicId) return null;
  try {
    const data = (
      await firestore.doc(`${base}/topics/${topicId}`).get()
    ).data();
    if (!data) return null;
    const words = openForHelm(key, data.sealed as SealedPayload);
    const sections = Array.isArray(words.sections)
      ? (words.sections as {
          id: string;
          heading: string | null;
          markdown: string;
          writtenBy: 'nomos' | 'person';
          sources: { noteId?: string | null }[];
        }[])
      : [];
    return typeof words.name === 'string'
      ? {
          id: topicId,
          name: words.name,
          version: typeof data.version === 'number' ? data.version : 0,
          sections: sections.map((section) => ({
            id: section.id,
            heading: section.heading,
            markdown: section.markdown,
            writtenBy: section.writtenBy === 'person' ? 'person' : 'nomos',
            noteIds: section.sources.flatMap((source) =>
              typeof source.noteId === 'string' ? [source.noteId] : [],
            ),
          })),
        }
      : null;
  } catch {
    return null;
  }
}

async function readCitedNotes(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  topic: ContextFocusedTopic | null,
  already: HintedNote[],
): Promise<HintedNote[]> {
  const known = new Set(already.map((note) => note.id));
  const ids = [
    ...new Set(topic?.sections.flatMap((section) => section.noteIds) ?? []),
  ].filter((id) => !known.has(id));
  const room = MAX_HINT_NOTES - already.length;
  return room > 0 && ids.length > 0
    ? (await readHintedNotes(firestore, base, key, ids.slice(0, room))).map(
        (note) => ({ ...note, body: '' }),
      )
    : [];
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

/** The key dates the open "which is true now?" questions of one capture ask about. */
const openClashIdsOf = (asked: AskedCapture | null): string[] => {
  const questions = asked?.opened.questions;
  return !asked || typeof questions !== 'object' || questions === null
    ? []
    : Object.entries(questions).flatMap(([id, question]) => {
        const held: unknown = (question as { heldCommands?: unknown })
          .heldCommands;
        const first: unknown = Array.isArray(held) ? held[0] : null;
        const keyDateId =
          typeof first === 'object' &&
          first !== null &&
          (first as { kind?: unknown }).kind === 'settleKeyDate'
            ? (first as { keyDateId?: unknown }).keyDateId
            : null;
        return asked.questionState[id]?.answeredAt === null &&
          typeof keyDateId === 'string'
          ? [keyDateId]
          : [];
      });
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
  const hasAttachments =
    mode === 'full' && (capture.attachmentIds ?? []).length > 0;
  if (leadText === null || (!leadText && !hasAttachments)) {
    throw new SortFailure('unreadable');
  }
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
      keyDates: [],
      projects: [],
      notes: [],
      topicCommands: [],
      procedureCommands: [],
      runCommands: [],
      topics: [],
      hinted: [],
      captureText: '',
      planDay: null,
      setCurrentPlace: null,
      asks: [],
      answerTurn,
      replyLine: null,
      mentions: [],
      places: [],
      assistantName: null,
      calledAs: null,
      searched: createSearchedLog(),
      hasMore: false,
      base,
      joinedIds: [],
      messageCount: 1,
      route: 'quick',
      timeZone: 'UTC',
      isSpoken: capture.inputMode === 'voice',
      media: null,
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

  const answersAQuestion = answerTurn !== null;
  const attached =
    hasAttachments && !answersAQuestion
      ? await openMedia({
          firestore,
          bucket: getStorage().bucket(),
          base,
          uid,
          key,
          captureId: claimed.captureRef.id,
          listed: capture.attachmentIds,
        })
      : {
          media: [],
          voiceIds: [],
          unreadable: [],
          unopened: [],
          refused: [],
        };

  const profileRead = firestore.doc(base).get();
  const screenMaskNames: MaskedName[] = [];
  const [profile, openTasks, alreadyMade, screen, earlierTurns, synced, style] =
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
      profileRead.then((snapshot) =>
        readScreenTasks(firestore, base, key, sanitizeScreen(capture.screen), {
          isOn: isUnattendedTurn(
            capture.presence?.startedByWake === true,
            capture.presence
              ? {
                  isHidden: capture.presence.isHidden === true,
                  isUntouched: capture.presence.isUntouched === true,
                }
              : null,
          ),
          timeZone: (snapshot.data()?.timeZone as string | undefined) ?? 'UTC',
          names: screenMaskNames,
        }),
      ),
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
      mode === 'rest' ? null : readStyleNotes(firestore, base, key),
    ]);
  const timeZone = (profile.data()?.timeZone as string | undefined) ?? 'UTC';
  const unattendedMask = {
    isOn: isUnattendedTurn(
      capture.presence?.startedByWake === true,
      capture.presence
        ? {
            isHidden: capture.presence.isHidden === true,
            isUntouched: capture.presence.isUntouched === true,
          }
        : null,
    ),
    timeZone,
    names: [] as MaskedName[],
  };
  const tasks = openTasks.docs.flatMap((doc): ContextTask[] => {
    const words = openTitle(key, (doc.data() as TaskDoc).sealed);
    if (!words?.title) {
      logger.warn('helm.sort.taskUnreadable', { taskId: doc.id });
      return [];
    }
    return [
      toContextTask(
        doc.id,
        doc.data() as TaskDoc,
        { title: words.title, sealed: words.sealed },
        unattendedMask,
      ),
    ];
  });
  const assistantName =
    readAssistantName(profile.data()?.assistantName) ?? DEFAULT_ASSISTANT_NAME;

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
    const { facts, selfFacts } =
      mode === 'rest'
        ? { facts: [], selfFacts: [] }
        : await readContextFacts(
            firestore,
            base,
            key,
            combined.text,
            (profile.data()?.selfWhoId as string | null | undefined) ?? null,
          );
    const selfWhoId =
      (profile.data()?.selfWhoId as string | null | undefined) ?? null;
    const { keyDates: contextKeyDates, upcoming } =
      mode === 'rest'
        ? { keyDates: [], upcoming: [] }
        : await readContextKeyDates(firestore, base, key, {
            text: combined.text,
            selfWhoId,
            todayKey: new Date(
              getDayIn(capture.createdAt, toKnownZone(timeZone)),
            )
              .toISOString()
              .slice(0, 10),
          });
    const projects =
      mode === 'rest'
        ? []
        : await readContextProjects(
            firestore,
            base,
            key,
            MAX_CONTEXT_PROJECTS,
          ).catch((error): Awaited<ReturnType<typeof readContextProjects>> => {
            logger.warn('helm.sort.projectsUnreadable', {
              cause: error instanceof Error ? error.name : 'error',
            });
            return [];
          });
    const [
      topics,
      hintedNotes,
      focusedTopic,
      procedureRecords,
      focusedLive,
      openRunRecords,
    ] =
      mode === 'rest'
        ? [[], [], null, [], null, []]
        : await Promise.all([
            readContextTopics(firestore, base, key, MAX_CONTEXT_TOPICS),
            readHintedNotes(firestore, base, key, claimed.noteIds),
            readFocusedTopic(
              firestore,
              base,
              key,
              sanitizeScreen(capture.screen)?.topicId ?? null,
            ),
            readContextProcedures(firestore, base, key, MAX_CONTEXT_PROCEDURES),
            readFocusedProcedure(
              firestore,
              base,
              key,
              sanitizeScreen(capture.screen)?.procedureId ?? null,
            ),
            readOpenRuns(
              firestore,
              base,
              key,
              sanitizeScreen(capture.screen)?.runId ?? null,
            ),
          ]);
    const screenRunId = sanitizeScreen(capture.screen)?.runId ?? null;
    const contextRuns = [...openRunRecords]
      .sort(
        (a, b) => Number(b.id === screenRunId) - Number(a.id === screenRunId),
      )
      .map((run) => toContextRun(run, run.id === screenRunId));
    const trips =
      mode !== 'rest' && procedureRecords.length > 0
        ? await readSyncedTrips(firestore, uid, key, {
            firstDay: getLocalDay(capture.createdAt, toKnownZone(timeZone)),
            limit: MAX_CONTEXT_TRIPS,
          }).catch((error): Awaited<ReturnType<typeof readSyncedTrips>> => {
            logger.warn('helm.sort.tripsUnreadable', {
              cause: error instanceof Error ? error.name : 'error',
            });
            return [];
          })
        : [];
    const contextSynced = [
      ...synced,
      ...trips.filter((trip) => !synced.some((copy) => copy.id === trip.id)),
    ];
    const contextProcedures: ContextProcedure[] = procedureRecords.map(
      (procedure) => ({
        id: procedure.id,
        title: procedure.title,
        stepCount: Object.keys(procedure.steps).length,
      }),
    );
    const topicDocument = topicDocumentFor(
      combined.text,
      focusedTopic !== null,
    );
    const hinted = [
      ...hintedNotes,
      ...(await readCitedNotes(
        firestore,
        base,
        key,
        topicDocument === 'whole' ? focusedTopic : null,
        hintedNotes,
      )),
    ];
    const context = buildContext({
      text: combined.text,
      texts: combined.texts,
      reading: combined.reading,
      createdAt: capture.createdAt,
      timeZone,
      tasks,
      synced: contextSynced,
      alreadyMade,
      screen,
      earlierTurns,
      answeredQuestion,
      facts,
      selfFacts,
      keyDates: contextKeyDates,
      upcoming,
      projects,
      topics,
      style,
      notes: toContextNotes(hinted, combined.text),
      focusedTopic: topicDocument ? focusedTopic : null,
      topicDocument,
      procedures: contextProcedures,
      focusedProcedure: focusedLive
        ? {
            id: focusedLive.id,
            title: focusedLive.title,
            version: focusedLive.version,
            blocks: blocksOf(focusedLive),
          }
        : null,
      runs: contextRuns,
      attachments: attached.media.map((item) => ({
        alias: item.alias,
        kind: item.kind,
      })),
      files: attached.media.flatMap((item) => (item.file ? [item.file] : [])),
    });
    const topicVersions = new Map<string, number>(
      focusedTopic && topicDocument === 'whole' && hasReviseCue(combined.text)
        ? [[focusedTopic.id, focusedTopic.version]]
        : [],
    );
    const isOtherTopicNamed =
      hasReviseCue(combined.text) &&
      topics.some(
        (topic) =>
          topic.id !== focusedTopic?.id && isNamedIn(combined.text, topic.name),
      );
    const procedureVersions = new Map<string, number>(
      focusedLive && hasProcedureReviseCue(combined.text)
        ? [[focusedLive.id, focusedLive.version]]
        : [],
    );
    const procedureNames = new Map<string, string>([
      ...procedureRecords.map((procedure): [string, string] => [
        procedure.id,
        procedure.title,
      ]),
      ...(focusedLive
        ? [[focusedLive.id, focusedLive.title] as [string, string]]
        : []),
    ]);
    const procedureTitleByTask = new Map<string, string>(
      procedureRecords.flatMap((procedure): [string, string][] =>
        procedure.sourceTaskId
          ? [[procedure.sourceTaskId, procedure.title]]
          : [],
      ),
    );
    const isProcedureSearchOffered =
      procedureRecords.length > 0 &&
      hasProcedureReviseCue(combined.text) &&
      (hasProcedureCue(combined.text) ||
        procedureRecords.some(
          (procedure) =>
            procedure.id !== focusedLive?.id &&
            isNamedIn(combined.text, procedure.title),
        ));
    const provider = pickProvider(combined.text, combined.reading);
    const liveGrants =
      mode !== 'rest' && isQuestion(combined.text.trim())
        ? await readLiveGrants(firestore, uid)
        : [];
    const siteGrants =
      mode !== 'rest' && isQuestion(combined.text.trim())
        ? await readSiteGrants(firestore, uid)
        : [];
    const quotes = createQuoteBook();
    const searched = createSearchedLog();
    const system = [
      SYSTEM_PROMPT,
      renderWhereBlock([
        ...liveGrants.map((grant) => grant.connectorId),
        ...siteGrants.map((grant) => grant.connectorId),
      ]),
      liveGrants.length > 0 ? MAIL_PROMPT : null,
      siteGrants.length > 0 ? APP_RECORDS_PROMPT : null,
      topics.length > 0 ? TOPIC_PROMPT : null,
      style ? STYLE_PROMPT : null,
      mode !== 'rest' &&
      (procedureRecords.length > 0 ||
        contextRuns.length > 0 ||
        focusedLive !== null ||
        hasProcedureCue(combined.text))
        ? PROCEDURE_PROMPT
        : null,
      mode === 'rest' ? REST_PROMPT : null,
      attached.media.length > 0 ? MEDIA_PROMPT : null,
      typeof capture.interruptedCaptureId === 'string' &&
      capture.interruptedCaptureId !== ''
        ? INTERRUPTED_PROMPT
        : null,
      toPersonaPrompt(assistantName, profile.data()?.assistantTone),
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
        siteGrants,
        quotes,
        searched,
        topicRead: isOtherTopicNamed
          ? {
              topics: context.topics,
              sections: context.sections,
              versions: topicVersions,
            }
          : undefined,
        procedureRead: isProcedureSearchOffered
          ? {
              procedures: context.procedures,
              steps: context.procedureSteps,
              versions: procedureVersions,
              names: procedureNames,
            }
          : undefined,
      });
      const maxMillis = canHandOver ? QUICK_LOOP_MILLIS : LOOP_LIMITS.maxMillis;
      const loop = await provider
        .runToolLoop({
          role,
          system,
          messages: [
            {
              role: 'user',
              content: toMessageContent(context.message, attached.media),
            },
          ],
          mcpClient: mcp.client,
          terminalTool: FILE_RESULTS_TOOL,
          extraTerminalTools: [
            ...(canHandOver ? [HAND_OVER_TOOL] : []),
            ...(mode === 'full' ? [CLOSE_CONVERSATION_TOOL] : []),
          ],
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
              hasTopicFocus: focusedTopic !== null,
              hasProcedureFocus: focusedLive !== null,
              hasMedia:
                attached.media.length +
                  attached.voiceIds.length +
                  attached.unreadable.length >
                0,
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
      topics,
      hinted,
      topicVersions,
      focusedTopicId: focusedTopic?.id ?? null,
      procedureVersions,
      procedureNames,
      procedureTitleByTask,
      focusedProcedureId: focusedLive?.id ?? null,
      focusedTaskId: screen?.focus?.id ?? null,
      keyDateNames: new Map(
        contextKeyDates.map((date) => [
          date.id,
          [date.who, `${date.who}s`, date.label ?? '', date.kind],
        ]),
      ),
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
  const {
    loop,
    context,
    combined,
    route,
    quotes,
    searched,
    topics,
    hinted,
    topicVersions,
    focusedTopicId,
    procedureVersions,
    procedureNames,
    procedureTitleByTask,
    focusedProcedureId,
    focusedTaskId,
    keyDateNames,
  } = result;
  if (loop.endedBy !== 'terminal') {
    throw toFailure(
      loop.endedBy === 'error'
        ? (loop.errorCode ?? 'modelError')
        : loop.endedBy,
    );
  }

  if (
    mode === 'full' &&
    loop.terminalName === CLOSE_CONVERSATION_TOOL.name &&
    isShortEnoughToClose(combined.text, combined.reading)
  ) {
    return writeClose({ ...claimed, joinedIds: read.ids });
  }

  const isRefusedClose = loop.terminalName === CLOSE_CONVERSATION_TOOL.name;
  const reply = normalizeNomosReply(
    isRefusedClose ? { commands: [] } : loop.terminalInput,
    {
      reading: combined.reading,
      aliases: context.aliases,
      synced: context.synced,
      facts: context.facts,
      keyDates: context.keyDates,
      topics: context.topics,
      notes: context.notes,
      parts: context.parts,
      sections: context.sections,
      topicNames: new Map(topics.map((topic) => [topic.id, topic.name])),
      focusedTopicId,
      topicVersions,
      procedures: context.procedures,
      procedureSteps: context.procedureSteps,
      procedureNames,
      procedureTitleByTask,
      focusedProcedureId,
      focusedTaskId,
      procedureVersions,
      runSteps: context.runSteps,
      captureText: combined.text,
      keyDateNames,
      quotes,
      alreadyMade,
      timeZone,
      attachments: attached.media.map((item) => ({
        alias: item.alias,
        kind: item.kind,
      })),
    },
  );
  reply.mediaDropped.forEach((code) =>
    logger.info('helm.media.dropped', { code }),
  );
  reply.askDropped.forEach((code) => logger.info('helm.ask.dropped', { code }));
  const rawLine = (loop.terminalInput as { replyLine?: unknown } | null)
    ?.replyLine;
  logger.info('helm.reply.line', {
    written: typeof rawLine === 'string',
    kept: reply.replyLine !== null,
  });
  reply.noteDropped.forEach((code) =>
    logger.info('helm.sort.noteDropped', { code }),
  );
  reply.topicDropped.forEach((code) =>
    logger.info('helm.topic.dropped', { code }),
  );
  reply.procedureDropped.forEach((code) =>
    logger.info('helm.procedure.dropped', { code }),
  );
  reply.runDropped.forEach((code) => logger.info('helm.run.dropped', { code }));
  const maskedNames = [...unattendedMask.names, ...screenMaskNames];
  const hide = (text: string | null) =>
    text === null || maskedNames.length === 0
      ? text
      : maskPrivateNames(text, maskedNames);
  const answer =
    mode === 'full' && reply.answer
      ? {
          ...reply.answer,
          fromRecordsText: hide(reply.answer.fromRecordsText),
          generalText: hide(reply.answer.generalText),
          generalSpoken: hide(reply.answer.generalSpoken),
        }
      : null;
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
    keyDates: mode === 'full' ? reply.keyDates : [],
    projects: mode === 'full' ? reply.projects : [],
    notes: mode === 'full' ? reply.notes : [],
    topicCommands: mode === 'full' ? reply.topicCommands : [],
    procedureCommands: mode === 'full' ? reply.procedureCommands : [],
    runCommands: mode === 'full' ? reply.runCommands : [],
    topics,
    hinted,
    media: {
      items: attached.media,
      decisions: reply.media,
      letGoIds: [
        ...attached.unopened,
        ...attached.refused,
        ...attached.voiceIds,
        ...attached.unreadable.map((entry) => entry.id),
      ],
      unopenedCount: attached.unopened.length,
      unreadable: attached.unreadable.map(({ name, reason }) => ({
        name,
        reason,
      })),
    },
    captureText: combined.text,
    planDay: mode === 'full' ? reply.planDay : null,
    setCurrentPlace: mode === 'full' ? reply.setCurrentPlace : null,
    asks: mode === 'full' ? reply.asks : [],
    answerTurn,
    replyLine: ownLineStands(
      reply.mediaDropped,
      reply.askDropped,
      reply.noteDropped,
      reply.topicDropped,
      reply.procedureDropped,
      reply.runDropped,
      commands.length < reply.commands.length,
    )
      ? hide(reply.replyLine)
      : null,
    mentions: reply.mentions,
    places: reply.places,
    assistantName,
    calledAs: combined.reading.addressedAs?.text ?? null,
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

/** The photos and files a turn sent, as the call read them, and what the model decided about each. */
interface SentMedia {
  items: OpenedMedia[];
  decisions: MediaDecision[];
  /** Media code lets go without a decision: refused over the cap, not opened, unreadable, or a recording. */
  letGoIds: string[];
  unopenedCount: number;
  unreadable: { name: string; reason: UnreadableReason }[];
}

const toMessageContent = (
  message: string,
  media: OpenedMedia[],
): string | ToolLoopContent[] =>
  media.every((item) => item.blocks.length === 0)
    ? message
    : [
        { type: 'text', text: message },
        ...media.flatMap((item): ToolLoopContent[] =>
          item.blocks.length === 0
            ? []
            : [
                {
                  type: 'text',
                  text: `${item.kind === 'photo' ? 'Photo' : 'File'} ${item.alias}:`,
                },
                ...item.blocks,
              ],
        ),
      ];

const TITLE_SHOWN_CHARS = 80;

/** The title each existing task or fact a keep names shows under, read in the transaction; one that is gone or won't open has none, so a keep on it is let go. */
const readMediaTitles = async (
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
  decisions: MediaDecision[],
): Promise<Map<string, string>> => {
  const wanted = [
    ...new Map(
      decisions
        .filter((decision) => decision.decision === 'keep')
        .flatMap((decision) => decision.targets)
        .filter((target) => !target.ref.startsWith('$new'))
        .map((target) => [`${target.kind}:${target.ref}`, target]),
    ).entries(),
  ];
  const snapshots = await Promise.all(
    wanted.map(([, target]) =>
      transaction.get(
        firestore.doc(
          `${base}/${target.kind === 'task' ? 'tasks' : 'facts'}/${target.ref}`,
        ),
      ),
    ),
  );
  return new Map(
    wanted.flatMap(([mapKey, target], index): [string, string][] => {
      const sealed = snapshots[index].get('sealed') as
        SealedPayload | undefined;
      if (!sealed) return [];
      try {
        const words = openForHelm(key, sealed);
        const text = target.kind === 'task' ? words.title : words.statement;
        return typeof text === 'string' && text
          ? [[mapKey, text.slice(0, TITLE_SHOWN_CHARS)]]
          : [];
      } catch {
        return [];
      }
    }),
  );
};

async function writeResult(
  input: Claimed & {
    key: HelmKey;
    commands: NomosCommand[];
    answer: AnswerCommand | null;
    remember: RememberCommand[];
    noteFacts: NoteFactCommand[];
    keyDates: KeyDateCommand[];
    projects: ProjectCommand[];
    notes: CreateNoteCommand[];
    topicCommands: TopicCommand[];
    procedureCommands: ProcedureCommand[];
    runCommands: RunCommand[];
    topics: OpenTopicRecord[];
    hinted: HintedNote[];
    captureText: string;
    planDay: PlanDayCommand | null;
    setCurrentPlace: SetCurrentPlaceCommand | null;
    asks: AskCommand[];
    answerTurn: AnswerTurn | null;
    replyLine: string | null;
    mentions: MentionRead[];
    places: PlaceRead[];
    assistantName: string | null;
    calledAs: string | null;
    searched: SearchedLog;
    hasMore: boolean;
    base: string;
    joinedIds: string[];
    messageCount: number;
    route: Route;
    timeZone: string;
    isSpoken: boolean;
    media: SentMedia | null;
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
    keyDates,
    projects: projectCommands,
    notes,
    topicCommands: requestedTopicCommands,
    procedureCommands,
    runCommands,
    topics: contextTopics,
    hinted,
    captureText,
    planDay: requestedPlanDay,
    setCurrentPlace: requestedHome,
    asks,
    answerTurn,
    replyLine,
    mentions,
    places,
    assistantName,
    calledAs,
    searched,
    hasMore,
    base,
    mode,
    joinedIds,
    messageCount,
    route,
    timeZone,
    isSpoken,
    media: sentMedia,
  } = input;
  const tasksPath = `${base}/tasks`;
  const built = answer
    ? buildAnswer(
        answer,
        (code) => logger.info('helm.answer.dropped', { code }),
        searched.entries(),
        undefined,
        new Map(
          hinted.map((note) => {
            const topic = note.topicIds
              .map((id) => contextTopics.find((entry) => entry.id === id))
              .find((entry) => entry !== undefined);
            return [
              note.id,
              {
                title: note.title,
                topicPath: topic?.path || null,
                topicEmoji: topic?.emoji ?? null,
              },
            ];
          }),
        ),
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
  const isClashable = keyDates.some(
    (command) =>
      command.kind === 'setKeyDate' &&
      (command.keyKind === 'birthday' || command.keyKind === 'passedAway'),
  );
  const askedRef = answerTurn
    ? captureRef.parent.doc(answerTurn.ref.captureId)
    : null;
  const topicCommands = await refreshRevisions(
    firestore,
    {
      uid: input.uid,
      base,
      key,
      apiKey: readApiKey(),
      captureText,
      now: Date.now(),
    },
    requestedTopicCommands,
  );
  const touchedTopicIds = [
    ...new Set([
      ...notes.flatMap((note) => note.topicIds),
      ...topicCommands.flatMap((command) =>
        command.kind === 'createParentTopic'
          ? command.childIds
          : command.kind === 'moveTopic'
            ? [command.topicId, ...(command.parentId ? [command.parentId] : [])]
            : [command.topicId],
      ),
    ]),
  ];
  const reviseIds = [
    ...new Set(
      procedureCommands.flatMap((command) =>
        command.kind === 'reviseProcedure' ? [command.procedureId] : [],
      ),
    ),
  ];
  const runProcedureIds = [
    ...new Set(
      runCommands.flatMap((command) =>
        command.kind === 'startRun' ? [command.procedureId] : [],
      ),
    ),
  ];
  const tickRunIds = [
    ...new Set(
      runCommands.flatMap((command) =>
        command.kind === 'tickRun'
          ? command.steps.map((step) => step.runId)
          : [],
      ),
    ),
  ];
  const fromTaskIds = [
    ...new Set(
      procedureCommands.flatMap((command) =>
        command.kind === 'createProcedure' && command.fromTaskId
          ? [command.fromTaskId]
          : [],
      ),
    ),
  ];
  const needsTree = topicCommands.some(
    (command) =>
      command.kind === 'moveTopic' || command.kind === 'createParentTopic',
  );
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
      noteCountSnap,
      topicSnaps,
      treeSnap,
      procedureSnaps,
      procedureTaskSnaps,
      runSnaps,
      openRunsSnaps,
      ...targetSnaps
    ] = await Promise.all([
      transaction.get(captureRef),
      transaction.get(requestRef),
      askedRef ? transaction.get(askedRef) : Promise.resolve(null),
      asks.length > 0 || isClashable
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
      requestedHome || noteFacts.length > 0 || keyDates.length > 0
        ? transaction.get(firestore.doc(base))
        : Promise.resolve(null),
      notes.length > 0
        ? transaction.get(firestore.collection(`${base}/notes`).count())
        : Promise.resolve(null),
      Promise.all(
        touchedTopicIds.map((id) =>
          transaction.get(firestore.doc(`${base}/topics/${id}`)),
        ),
      ),
      needsTree
        ? transaction.get(
            firestore
              .collection(`${base}/topics`)
              .select('parentId', 'depth')
              .limit(MAX_CONTEXT_TOPICS),
          )
        : Promise.resolve(null),
      Promise.all(
        [...new Set([...reviseIds, ...runProcedureIds])].map((id) =>
          transaction.get(firestore.doc(`${base}/procedures/${id}`)),
        ),
      ),
      Promise.all(
        fromTaskIds.map((id) =>
          transaction.get(firestore.doc(`${tasksPath}/${id}`)),
        ),
      ),
      Promise.all(
        tickRunIds.map((id) =>
          transaction.get(firestore.doc(`${base}/procedureRuns/${id}`)),
        ),
      ),
      Promise.all(
        runProcedureIds.map((id) =>
          transaction.get(procedureOpenRunsQuery(firestore, base, id)),
        ),
      ),
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
      (commands.length > 0 ||
        noteFacts.length > 0 ||
        keyDates.length > 0 ||
        projectCommands.length > 0) &&
      !isStale
        ? await readPeople(transaction, {
            firestore,
            base,
            key,
            captureRef,
            mentions,
            places,
            assistantName,
            calledAs,
            timeZone,
            capturedAt: capture.createdAt,
          })
        : undefined;
    const existingProjects =
      (projectCommands.length > 0 ||
        runCommands.some(
          (command) => command.kind === 'startRun' && command.projectRef,
        ) ||
        commands.some(
          (command) => command.kind === 'createTask' && command.projectRef,
        )) &&
      !isStale
        ? await readActiveProjectsIn(transaction, firestore, base, key)
        : [];
    const existingFacts =
      noteFacts.length > 0 && !isStale
        ? await readSubjectFacts(transaction, firestore, base, key)
        : [];
    const selfWhoId = (profileSnap?.get('selfWhoId') as string | null) ?? null;
    const keyDateRead =
      keyDates.length > 0 && !isStale
        ? await readKeyDateState(transaction, firestore, base, key, {
            keyDates,
            selfWhoId,
            candidateWhoIds: (people?.known ?? []).map((who) => who.id),
            momentWhoIds: namedMomentWhoIds({
              commands: keyDates,
              whoIdOf: new Map(
                people
                  ? matchWho({
                      mentions: people.mentions,
                      known: people.known,
                      assistantNames: people.assistantNames,
                    }).flatMap((match, index): [string, string][] =>
                      match.kind === 'match'
                        ? [[people.mentions[index].ref, match.id]]
                        : [],
                    )
                  : [],
              ),
              selfWhoId,
            }),
          })
        : null;
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
    const privateTargets = new Set(
      commands.flatMap((command) =>
        command.kind === 'setPrivate' ? [command.taskId] : [],
      ),
    );
    const parentSnaps = new Map(
      await Promise.all(
        targetSnaps.flatMap((snapshot) => {
          const task = snapshot.data() as TaskDoc | undefined;
          if (!task || !privateTargets.has(snapshot.id)) return [];
          return [
            ...(task.projectId ? [['projects', task.projectId]] : []),
            ...(task.whoIds ?? []).map((id) => ['who', id]),
            ...(task.placeIds ?? []).map((id) => ['places', id]),
          ]
            .filter(([, id]) => ID_RE.test(id))
            .map(async ([collection, id]) => {
              const parent = await transaction.get(
                firestore.doc(
                  `${base}/${collection}/${id}` as `${string}/${string}`,
                ),
              );
              return [`${collection}/${id}` as string, parent] as [
                string,
                typeof parent,
              ];
            });
        }),
      ),
    );
    const readParents = (task: TaskDoc): PrivateParent[] =>
      [
        ...(task.projectId ? [`projects/${task.projectId}`] : []),
        ...(task.whoIds ?? []).map((id) => `who/${id}`),
        ...(task.placeIds ?? []).map((id) => `places/${id}`),
      ].flatMap((path) => {
        const parent = parentSnaps.get(path);
        const data = parent?.data() as
          (Partial<PrivacyFacts> & { sealed: SealedPayload }) | undefined;
        if (!parent || !data) return [];
        const opened = openTitle(key, data.sealed)?.sealed;
        const name = typeof opened?.name === 'string' ? opened.name : '';
        return [
          {
            id: parent.id,
            name,
            facts: readPrivacyFacts({
              privateMark: (opened?.privateMark ??
                null) as PrivacyFacts['privateMark'],
              isPrivacyCleared: opened?.isPrivacyCleared === true,
            }),
          },
        ];
      });
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
              privacyFacts: readPrivacyFacts({
                privateMark: (words.sealed.privateMark ??
                  null) as PrivacyFacts['privateMark'],
                isPrivacyCleared: words.sealed.isPrivacyCleared === true,
              }),
              privateParents: readParents(task),
            },
          ],
        ];
      }),
    );
    const mediaIds = sentMedia
      ? [
          ...new Set([
            ...sentMedia.items.map((item) => item.id),
            ...sentMedia.letGoIds,
          ]),
        ]
      : [];
    const [mediaSnaps, mediaTitles] = await Promise.all([
      Promise.all(
        mediaIds.map((id) =>
          transaction.get(firestore.doc(`${base}/media/${id}`)),
        ),
      ),
      sentMedia && !isStale
        ? readMediaTitles(
            transaction,
            firestore,
            base,
            key,
            sentMedia.decisions,
          )
        : Promise.resolve(new Map<string, string>()),
    ]);
    const stillReceived = new Set(
      mediaSnaps
        .filter(
          (snapshot) =>
            snapshot.get('status') === 'received' &&
            snapshot.get('sourceCaptureId') === captureRef.id,
        )
        .map((snapshot) => snapshot.id),
    );
    const executionRef = firestore.collection(`${base}/executions`).doc();
    const seal = (fields: Record<string, unknown>) => sealForHelm(key, fields);
    const homeDoc = profileSnap?.exists ? homeSnap?.docs[0] : undefined;
    const homeWords =
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
            saidAt: capture.createdAt,
            now,
            timeZone,
          })
        : null;
    const home = typeof homeWords === 'string' ? null : homeWords;
    const homeRefusal = typeof homeWords === 'string' ? homeWords : null;
    const topicStates = new Map<string, NoteTopicState>(
      topicSnaps.flatMap((snapshot): [string, NoteTopicState][] => {
        const data = snapshot.data();
        const topic = data ? openTopicRecord(key, snapshot.id, data) : null;
        return topic
          ? [
              [
                snapshot.id,
                {
                  name: topic.name,
                  path:
                    contextTopics.find((entry) => entry.id === snapshot.id)
                      ?.path ?? topic.name,
                  docState: topic.docState,
                  pendingNoteIds: topic.pendingNoteIds,
                },
              ],
            ]
          : [];
      }),
    );
    const keptNotes: KeptNote[] = hinted;
    const liveTopics = new Map<string, LiveTopic>(
      topicSnaps.flatMap((snapshot): [string, LiveTopic][] => {
        const data = snapshot.data();
        const topic = data ? openLiveTopic(key, snapshot.id, data) : null;
        return topic ? [[snapshot.id, topic]] : [];
      }),
    );
    const treeRows = new Map<
      string,
      { parentId: string | null; depth: number }
    >(
      (treeSnap?.docs ?? []).map((doc) => [
        doc.id,
        {
          parentId:
            typeof doc.get('parentId') === 'string'
              ? (doc.get('parentId') as string)
              : null,
          depth: Number(doc.get('depth') ?? 1),
        },
      ]),
    );
    const topicTree: PlacedTopic[] = [
      ...new Map(
        [
          ...contextTopics.map((topic): PlacedTopic => ({
            id: topic.id,
            name: topic.name,
            parentId: topic.parentId,
            depth: topic.path.split(' › ').length,
          })),
          ...[...liveTopics.values()].map((topic): PlacedTopic => ({
            id: topic.id,
            name: topic.name,
            parentId: topic.parentId,
            depth: topic.depth,
          })),
        ].map((topic): [string, PlacedTopic] => [
          topic.id,
          { ...topic, ...treeRows.get(topic.id) },
        ]),
      ).values(),
    ];
    const liveProcedures = new Map<string, LiveProcedure | null>(
      procedureSnaps.map((snapshot) => {
        const data = snapshot.data();
        return [
          snapshot.id,
          data ? openLiveProcedure(key, snapshot.id, data) : null,
        ];
      }),
    );
    const liveRuns = new Map(
      runSnaps.map((snapshot) => {
        const data = snapshot.data();
        return [snapshot.id, data ? openLiveRun(key, snapshot.id, data) : null];
      }),
    );
    const tickedProcedureIds = [...liveRuns.values()].flatMap((run) =>
      run ? [run.procedureId] : [],
    );
    const stillThere = await readLiveProcedureIds(
      firestore,
      base,
      tickedProcedureIds,
      (refs) => transaction.getAll(...refs),
    );
    const goneProcedureIds = new Set(
      tickedProcedureIds.filter((id) => !stillThere.has(id)),
    );
    const procedureTasks = new Map(
      procedureTaskSnaps.map((snapshot) => {
        const data = snapshot.data();
        return [snapshot.id, data ? openTaskSteps(key, data) : null];
      }),
    );
    const written = planWrites({
      notes: isStale ? [] : notes,
      topics: topicStates,
      keptNotes,
      noteCount: noteCountSnap?.data().count ?? 0,
      commands: isStale ? [] : commands,
      topicCommands: isStale ? [] : topicCommands,
      procedureCommands: isStale ? [] : procedureCommands,
      liveProcedures,
      procedureTasks,
      runCommands: isStale ? [] : runCommands,
      liveRuns,
      openRuns: openRunDocs(
        key,
        openRunsSnaps.flatMap((snapshot) => snapshot.docs),
      ),
      goneProcedureIds,
      liveTopics,
      topicTree,
      capturedAt: capture.createdAt,
      projectCommands: isStale ? [] : projectCommands,
      existingProjects,
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
      timeZone,
      selfWhoId,
      media:
        sentMedia && !isStale
          ? ({
              decisions: sentMedia.decisions,
              items: new Map(
                sentMedia.items
                  .filter((item) => stillReceived.has(item.id))
                  .map((item) => [
                    item.alias,
                    { id: item.id, kind: item.kind, words: item.words },
                  ]),
              ),
              letGoIds: sentMedia.letGoIds.filter((id) =>
                stillReceived.has(id),
              ),
              titles: mediaTitles,
              executionId: executionRef.id,
            } satisfies MediaInput)
          : undefined,
      keyDates: isStale ? [] : keyDates,
      keyDateIndex: keyDateRead?.index ?? undefined,
      isKeyDateIndexUnreadable:
        keyDateRead !== null && keyDateRead.index === null,
      existingKeyDates: keyDateRead?.existing,
      whoCounts: keyDateRead?.whoCounts,
      momentCounts: keyDateRead?.momentCounts,
      keptKeyDates: keyDateRead?.kept,
      storedMoments: keyDateRead?.moments,
      openClashIds: new Set(
        (openAskedSnap?.docs ?? []).flatMap((doc) =>
          openClashIdsOf(toAskedCapture(key, doc.data() as CaptureDoc)),
        ),
      ),
    });
    const withHome = home
      ? {
          ...written,
          effectRefs: [...written.effectRefs, home.ref],
          effects: [...written.effects, home.effect],
        }
      : written;
    const plan = sentMedia
      ? {
          ...withHome,
          notKept: [
            ...withHome.notKept,
            ...(sentMedia.unopenedCount > 0
              ? [buildPhotosNotOpenedLine(sentMedia.unopenedCount)]
              : []),
            ...sentMedia.unreadable.map((entry) =>
              buildFileNotReadLine(entry.name, entry.reason),
            ),
          ],
        }
      : withHome;
    const isFiling = plan.effects.length > 0 || plan.lines.length > 0;
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
    const questions = [...plan.questions, ...askPlan.questions];
    const firstQuestion = isSpoken ? (questions[0]?.spoken ?? null) : null;
    const versionNumbers = await Promise.all(
      [...new Set(plan.topicVersions.map((version) => version.topicId))].map(
        async (topicId): Promise<[string, number[]]> => [
          topicId,
          await readVersionNumbers(
            transaction,
            firestore.doc(`${base}/topics/${topicId}`),
          ),
        ],
      ),
    );

    const procedureVersionNumbers = new Map<string, number[]>(
      await Promise.all(
        [
          ...new Set(
            plan.procedureVersions.map((version) => version.procedureId),
          ),
        ].map(async (id): Promise<[string, number[]]> => [
          id,
          await readProcedureVersionNumbers(
            transaction,
            firestore.doc(`${base}/procedures/${id}`),
          ),
        ]),
      ),
    );

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
      [...plan.factConfirms, ...plan.factDisputes].forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/facts/${id}`), data),
      );
      plan.projectCreates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${base}/projects/${id}`), data),
      );
      plan.projectUpdates.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/projects/${id}`), data),
      );
      plan.keyDateCreates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${base}/keyDates/${id}`), data),
      );
      plan.keyDateUpdates.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/keyDates/${id}`), data),
      );
      plan.keyDateDeletes.forEach((id) =>
        transaction.delete(firestore.doc(`${base}/keyDates/${id}`)),
      );
      plan.noteCreates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${base}/notes/${id}`), data),
      );
      plan.mediaKept.forEach(({ id, data }) =>
        transaction.update(firestore.doc(`${base}/media/${id}`), data),
      );
      const versionsWritten = new Map<string, number[]>(versionNumbers);
      plan.topicVersions.forEach((version) => {
        const live = liveTopics.get(version.topicId);
        if (!live) return;
        const newVersion = writeTopicVersionIn(transaction, {
          topicRef: firestore.doc(`${base}/topics/${version.topicId}`),
          currentVersion: version.currentVersion,
          existingVersions: versionsWritten.get(version.topicId) ?? [],
          currentWords: live.words,
          sections: version.sections,
          reason: version.reason,
          noteIds: version.noteIds,
          sourceCaptureId: version.sourceCaptureId,
          executionId: version.executionId,
          changeSummary: version.changeSummary,
          requestQuote: version.requestQuote,
          parentName: version.parentName,
          docState: version.docState,
          pendingNoteIds: version.pendingNoteIds,
          topicFields: version.topicFields,
          now,
          seal,
        });
        versionsWritten.set(version.topicId, [
          ...(versionsWritten.get(version.topicId) ?? []),
          newVersion,
        ]);
      });
      plan.procedureCreates.forEach(({ id, doc, version1 }) => {
        const ref = firestore.doc(`${base}/procedures/${id}`);
        transaction.create(ref, doc);
        transaction.create(ref.collection('versions').doc('1'), version1);
      });
      plan.procedureVersions.forEach((planned) =>
        writeProcedureVersionIn(transaction, {
          procedureRef: firestore.doc(
            `${base}/procedures/${planned.procedureId}`,
          ),
          planned,
          existingVersions:
            procedureVersionNumbers.get(planned.procedureId) ?? [],
          now,
          seal,
        }),
      );
      plan.runCreates.forEach(({ id, doc }) =>
        transaction.create(firestore.doc(`${base}/procedureRuns/${id}`), doc),
      );
      plan.runTicks.forEach(({ runId, stepIds }) =>
        transaction.update(firestore.doc(`${base}/procedureRuns/${runId}`), {
          ...Object.fromEntries(
            stepIds.map((stepId) => [`stepState.${stepId}.doneAt`, now]),
          ),
          lastEditedAt: now,
        }),
      );
      plan.topicPlacements.forEach(({ id, parentId, depth }) =>
        transaction.update(firestore.doc(`${base}/topics/${id}`), {
          parentId,
          depth,
        }),
      );
      plan.topicCreates.forEach(({ id, data }) =>
        transaction.create(firestore.doc(`${base}/topics/${id}`), data),
      );
      plan.topicVersionCreates.forEach(({ topicId, id, data }) =>
        transaction.create(
          firestore.doc(`${base}/topics/${topicId}/versions/${id}`),
          data,
        ),
      );
      plan.topicUpdates.forEach(({ id, docState, addPendingIds }) =>
        transaction.update(firestore.doc(`${base}/topics/${id}`), {
          docState,
          pendingNoteIds: FieldValue.arrayUnion(...addPendingIds),
        }),
      );
      if (plan.keyDateIndex && keyDateRead?.index) {
        writeIndexIn(transaction, firestore, base, {
          byWho: plan.keyDateIndex.byWho,
          rebuiltAt: keyDateRead.index.rebuiltAt,
          existingIds: keyDateRead.index.existingIds,
          now,
          seal,
        });
      }
      if (home) transaction.update(firestore.doc(base), home.data);
      transaction.create(
        executionRef,
        buildExecution(
          { ...plan, questions },
          {
            homeLine: home?.line ?? homeRefusal?.replace(/\.$/, '') ?? null,
            said: ownLineStands(
              plan.notKept,
              plan.questions,
              questions,
              plan.lines,
              noted.refused,
              liveRefused,
              askPlan.isDeferred,
              hasMore,
              Boolean(homeRefusal),
            )
              ? replyLine
              : null,
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
    plan.mediaLetGo.forEach(({ id, data }) =>
      transaction.update(firestore.doc(`${base}/media/${id}`), data),
    );
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
          : (homeRefusal ??
            firstQuestion ??
            (reply
              ? null
              : plan.notKept.length > 0
                ? plan.notKept.join('. ')
                : answerTurn
                  ? answerQuietLine({
                      commandCount: commands.length,
                      isApply: turn?.kind === 'apply',
                      replyLine,
                    })
                  : null));
    const settled = settleCapture({
      mode,
      filed: isFiling ? commands.length : 0,
      hasPlanDay: planDayKey !== null,
      hasHome: requestedHome !== null,
      hasFacts:
        noteFacts.length +
          keyDates.length +
          notes.length +
          topicCommands.length +
          procedureCommands.length +
          runCommands.length +
          written.projectCreates.length +
          written.projectUpdates.length >
          0 && !isStale,
      hasMedia:
        !isStale &&
        !!sentMedia &&
        sentMedia.items.length + sentMedia.letGoIds.length > 0,
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
      ...(plan.isPrivate && { touchesPrivate: true }),
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

/** Settles a turn the model closed with `closeConversation`: nothing is made and no Execution is written. The device applies the same close it applies to a phrase it matched itself. */
async function writeClose(
  input: Claimed & { joinedIds: string[] },
): Promise<SortResult> {
  const { firestore, captureRef, requestRef, claimId, joinedIds } = input;
  const result = await firestore.runTransaction(async (transaction) => {
    const [captureSnap, requestSnap, ...joinedSnaps] = await Promise.all([
      transaction.get(captureRef),
      transaction.get(requestRef),
      ...joinedIds.map((id) => transaction.get(captureRef.parent.doc(id))),
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
    const now = Date.now();
    joinedSnaps
      .filter((snapshot) => {
        const data = snapshot.data() as CaptureDoc | undefined;
        return data?.turnLeadId === captureRef.id && data.status === 'received';
      })
      .forEach((snapshot) =>
        transaction.update(snapshot.ref, {
          status: 'sorted',
          sortedAt: now,
          claimId: null,
          claimedAt: null,
        }),
      );
    transaction.update(captureRef, {
      joinedCaptureIds: joinedIds,
      turnLeadId: null,
      status: 'sorted',
      endedConversation: true,
      sortedAt: now,
      claimId: null,
      claimedAt: null,
      heldReason: null,
      lastErrorCode: null,
      seenAt: now,
    });
    const sorted = toResult('sorted');
    transaction.set(requestRef, {
      result: sorted,
      captureId: captureRef.id,
      createdAt: now,
    });
    logger.info('helm.sort.closed');
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
    noteIds?: unknown;
  };
  const mode = input.mode ?? 'full';
  const noteIds = input.noteIds ?? [];
  if (
    (mode !== 'full' && mode !== 'rest') ||
    !Array.isArray(noteIds) ||
    noteIds.length > MAX_HINT_NOTES ||
    !noteIds.every((id) => typeof id === 'string' && ID_RE.test(id)) ||
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
    noteIds: noteIds as string[],
  };
};

/** The hinted notes as the model sees them: bodies only when the turn is a question, titles alone otherwise. */
export const toContextNotes = (hinted: HintedNote[], text: string) =>
  isQuestion(text.trim())
    ? hinted
    : hinted.map(({ id, title }) => ({ id, title }));

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
    try {
      return await sortRequest(request);
    } finally {
      const uid = request.auth?.uid;
      if (uid) {
        await sweepExpiredMedia({
          firestore: getFirestore(),
          bucket: getStorage().bucket(),
          uid,
          now: Date.now(),
        }).catch((error: unknown) =>
          logger.warn('helm.media.sweepUnavailable', {
            cause: error instanceof Error ? error.name : 'error',
          }),
        );
      }
    }
  },
);

async function sortRequest(request: CallableRequest): Promise<SortResult> {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
  }
  const startedAt = Date.now();
  const { captureId, requestKey, mode, noteIds } = readInput(request.data);
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
    noteIds,
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
    if (failure.code === 'unexpected' && error instanceof Error) {
      logger.error('helm.sort.unexpected', {
        name: error.name,
        at: error.stack?.split('\n').slice(1, 4).join(' | ') ?? null,
      });
    }
    return failClaim(firestore, captureRef, claim.claimId, failure, {}, mode);
  });
}
