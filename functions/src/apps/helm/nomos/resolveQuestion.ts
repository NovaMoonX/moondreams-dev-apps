import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  KEY_DATE_PRECISIONS,
  MAX_EFFECTS,
  NOTE_TOPICS_CAP,
  type MentionRead,
} from './commands.js';
import {
  buildPlaceDoc,
  buildWhoDoc,
  toBehindState,
  toNameCase,
  type Effect,
  type EffectRef,
  type NoteTopicState,
  type QuestionStateEntry,
  type TopicFiling,
} from './executeCommands.js';
import { normalizeKin } from './kin.js';
import { KIN_KINDS, type KinOrder } from './kinKinds.js';
import { AUTOMATIC_LEVEL } from './policy.js';
import {
  buildNoteFiledLine,
  buildSettledDateLine,
  buildSettledLine,
  buildSettledNoneLine,
  joinNames,
  KEY_DATE_INCOMING_ID,
  SETTLE_LINES,
} from './summaries.js';
import {
  checkKeyDateParts,
  checkMomentParts,
  partsPaths,
  toIndexEntry,
  type KeyDateParts,
  type KeyDateRecord,
  type MomentParts,
} from './planKeyDates.js';
import type { IndexChange } from '../keyDateIndex.js';
import { getDayIn, toKnownZone } from './spoken.js';
import { readWhoTier, type WhoTierValue } from './whoTier.js';
import {
  planGroupTopics,
  type PlacedTopic,
  type PlannedVersion,
} from './planTopicCommands.js';
import type { TopicPlacement } from '../topicTree.js';
import type { LiveTopic } from '../topicVersionStore.js';

export interface ResolveTask {
  title: string;
  whoIds: string[];
  placeIds: string[];
}

/** A fact a "which is true now?" question holds, with its words opened. */
export interface ResolveFact {
  status: string;
  kind: string;
  statement: string;
  topic: string | null;
  createdAt: number;
  confirmedAt: number | null;
  supersedesId: string | null;
  supersededById: string | null;
  supersededAt: number | null;
  disputedWithId: string | null;
  whoIds: string[];
  placeIds: string[];
  projectIds: string[];
  syncedIds: string[];
  subjectIds: string[];
}

/** A note a "which topics?" question holds, as it is now. */
export interface ResolveNote {
  title: string;
  topicIds: string[];
}

export const FACT_TEXT_MAX = 500;

export interface ResolveInput {
  captureId: string;
  questionId: string;
  optionId: string;
  /** The topics ticked on a "which topics?" question; empty for every other. */
  optionIds?: string[];
  by: 'tap' | 'voice';
  now: number;
  timeZone: string;
  executionId: string;
  capture: {
    status: string;
    createdAt: number;
    whoIds: string[];
    placeIds: string[];
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  /** The capture's opened payload. */
  opened: Record<string, unknown>;
  /** The tasks that still exist and open, by id. */
  tasks: Map<string, ResolveTask>;
  /** The facts a held settleFact names that still exist, by id. */
  facts: Map<string, ResolveFact>;
  /** The key date a held settleKeyDate names, opened, or null when it is gone. */
  keyDate: {
    id: string;
    record: KeyDateRecord & { lastEditedAt: number | null };
  } | null;
  /** The corrected statement, with the answer "none" to a "which is true now?" question. */
  text: string | null;
  /** The name typed for a new person, with the answer "new" to a family question that has none to pick. */
  newName?: string | null;
  /** The who or place the option names, or null when it is gone; its tier and last mention are read. */
  chosen: {
    tier: WhoTierValue;
    tierSetBy: 'person' | 'nomos';
    lastMentionedAt: number | null;
  } | null;
  /** The people a held alias or family question names, opened, by id; one that is gone is missing. */
  whos?: Map<string, { opened: Record<string, unknown> }>;
  /** The note a held fileNote names, or null when it is gone. */
  note?: ResolveNote | null;
  /** The topics that still exist, by id. */
  topics?: Map<string, NoteTopicState>;
  /** The topics a held grouping names, whole, and the tree they sit in. */
  group?: { topics: Map<string, LiveTopic>; tree: PlacedTopic[] };
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}

export type ResolveRefusal =
  | 'answered'
  | 'unknown'
  | 'gone'
  | 'changed'
  | 'noteGone'
  | 'topicGone'
  | 'groupChanged';

export interface ResolvePlan {
  taskUpdates: { id: string; data: Record<string, unknown> }[];
  whoCreate: { id: string; data: Record<string, unknown> } | null;
  placeCreate: { id: string; data: Record<string, unknown> } | null;
  factCreate: { id: string; data: Record<string, unknown> } | null;
  factUpdates: { id: string; data: Record<string, unknown> }[];
  /** The key date a settled date rewrote, and the index change that goes with it when it is a yearly one. */
  keyDateUpdate: {
    id: string;
    data: Record<string, unknown>;
    indexChange: IndexChange | null;
  } | null;
  whoUpdate: { id: string; data: Record<string, unknown> } | null;
  /** People whose sealed words an answer rewrote (a nickname saved, a refusal remembered, an order kept). */
  whoRewrites?: { id: string; data: Record<string, unknown> }[];
  /** A note filed by the answer: its new topic list; its words and edit time stay as they were. */
  noteUpdate: { id: string; data: Record<string, unknown> } | null;
  topicUpdates: TopicFiling[];
  /** A grouping the answer made: the parent, the moves and the versions that say where each topic went. */
  groupWrite?: {
    parentCreate: { id: string; data: Record<string, unknown> };
    placements: TopicPlacement[];
    versions: PlannedVersion[];
  } | null;
  execution: Record<string, unknown> | null;
  capture: Record<string, unknown>;
  /** True when the question was closed without writing, because its facts changed since. */
  isStale: boolean;
}

interface PickOption {
  id: string;
  label: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isHeld = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) &&
  (typeof value.noteId === 'string' ||
    Array.isArray(value.taskIds) ||
    Array.isArray(value.childIds) ||
    Array.isArray(value.factIds) ||
    typeof value.keyDateId === 'string');

const isOption = (value: unknown): value is PickOption =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string';

/** Whether the option is a person or place the question listed, rather than "new" or "none". */
const isRecordOption = (optionId: string) =>
  optionId !== 'new' && optionId !== 'none';

const hasNewDetails = (
  held: Record<string, unknown>,
  isPlace: boolean,
  newName: string | null,
) =>
  isPlace
    ? isRecord(held.place) &&
      typeof held.place.name === 'string' &&
      held.place.name.trim() !== ''
    : isRecord(held.mention) &&
      (held.mention.kin
        ? (newName ?? '').trim() !== ''
        : typeof held.mention.name === 'string' &&
          held.mention.name.trim() !== '');

const union = (left: string[], right: string[]) => [
  ...new Set([...left, ...right]),
];

const ALIASES_CAP = 10;
const REFUSED_ALIASES_CAP = 20;

const toStrings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const isSameWord = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const KIN_ORDER_LIST: KinOrder[] = [
  'older',
  'younger',
  'oldest',
  'youngest',
  'twin',
];

const OPPOSITE: Partial<Record<KinOrder, KinOrder>> = {
  older: 'younger',
  younger: 'older',
};

/** Closes a "which is true now?" question whose facts are no longer in dispute with each other, marked stale; a survivor still pointing at a partner that is gone or no longer points back is freed, and nothing else is written. */
function closeStale(
  input: ResolveInput,
  question: Record<string, unknown>,
  oldQuestions: Record<string, unknown>,
  ids: string[],
): ResolvePlan {
  const { questionId, now, capture } = input;
  const freed = ids.flatMap((id, index) => {
    const fact = input.facts.get(id);
    const partnerId = ids[1 - index];
    return fact &&
      fact.disputedWithId === partnerId &&
      input.facts.get(partnerId)?.disputedWithId !== id
      ? [{ id, data: { disputedWithId: null } }]
      : [];
  });
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...capture.questionState[questionId], answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    taskUpdates: [],
    whoCreate: null,
    placeCreate: null,
    factCreate: null,
    factUpdates: freed,
    keyDateUpdate: null,
    whoUpdate: null,
    noteUpdate: null,
    topicUpdates: [],
    execution: null,
    isStale: true,
    capture: {
      questionState,
      sealed: {
        ...input.opened,
        questions: {
          ...oldQuestions,
          [questionId]: {
            ...question,
            answer: {
              by: input.by,
              at: now,
              turnCaptureId: null,
              shape: 'pickOne',
              optionId: 'none',
              otherText: null,
              isStale: true,
            },
          },
        },
      },
      status:
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
      executionIds: capture.executionIds,
    },
  };
}

/** What answering "which is true now?" writes: the pick is confirmed and the other kept as superseded, or "none" with a statement makes a corrected fact that supersedes both. Both must still be in dispute with each other. */
function planSettle(
  input: ResolveInput,
  question: Record<string, unknown>,
  held: Record<string, unknown>,
  oldQuestions: Record<string, unknown>,
): { refused: ResolveRefusal } | { refused: null; plan: ResolvePlan } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const ids = (held.factIds as unknown[]).filter(
    (id): id is string => typeof id === 'string',
  );
  const text = input.text?.trim() ?? '';
  if (ids.length !== 2 || (optionId === 'none' && !text)) {
    return { refused: 'unknown' };
  }
  const first = input.facts.get(ids[0]);
  const second = input.facts.get(ids[1]);
  if (
    !first ||
    !second ||
    first.disputedWithId !== ids[1] ||
    second.disputedWithId !== ids[0]
  ) {
    return {
      refused: null,
      plan: closeStale(input, question, oldQuestions, ids),
    };
  }
  const [older, newer] =
    first.createdAt <= second.createdAt
      ? [
          { id: ids[0], fact: first },
          { id: ids[1], fact: second },
        ]
      : [
          { id: ids[1], fact: second },
          { id: ids[0], fact: first },
        ];
  const isNone = optionId === 'none';
  const correctedId = isNone ? input.newId() : null;
  const kept = older.id === optionId ? older : newer;
  const dropped = kept === older ? newer : older;
  const label = (statement: string, line: string) => ({
    'sealed.title': line,
    'sealed.statement': statement,
  });
  const supersede = (
    target: typeof older,
    byId: string,
  ): { id: string; data: Record<string, unknown>; effect: Effect } => ({
    id: target.id,
    data: {
      disputedWithId: null,
      status: 'superseded',
      supersededById: byId,
      supersededAt: now,
    },
    effect: {
      written: {
        disputedWithId: null,
        status: 'superseded',
        supersededById: byId,
        supersededAt: now,
        ...label(target.fact.statement, SETTLE_LINES.replaced),
      },
      previous: {
        disputedWithId: target.fact.disputedWithId,
        status: target.fact.status,
        supersededById: target.fact.supersededById,
        supersededAt: target.fact.supersededAt,
        ...label(target.fact.statement, SETTLE_LINES.replaced),
      },
    },
  });
  const links = isNone
    ? [
        supersede(older, correctedId as string),
        supersede(newer, correctedId as string),
      ]
    : [supersede(dropped, kept.id)];
  const isKeptNewer = kept === newer;
  const adopts = isKeptNewer && kept.fact.supersedesId === null;
  const confirmedAt = kept.fact.confirmedAt ?? now;
  const confirm = isNone
    ? null
    : {
        id: kept.id,
        data: {
          disputedWithId: null,
          status: 'confirmed',
          confirmedAt,
          lastEditedAt: now,
          ...(adopts && { supersedesId: dropped.id }),
        },
        effect: {
          written: {
            disputedWithId: null,
            status: 'confirmed',
            confirmedAt,
            ...(adopts && { supersedesId: dropped.id }),
            ...label(kept.fact.statement, SETTLE_LINES.kept),
          },
          previous: {
            disputedWithId: kept.fact.disputedWithId,
            status: kept.fact.status,
            confirmedAt: kept.fact.confirmedAt,
            ...(adopts && { supersedesId: null }),
            ...label(kept.fact.statement, SETTLE_LINES.kept),
          },
        } as Effect,
      };
  const factCreate = correctedId
    ? {
        id: correctedId,
        data: {
          status: 'confirmed',
          stated: 'personCorrected',
          kind: newer.fact.kind,
          occurredOn: null,
          sourceCaptureId: null,
          sourceExecutionId: null,
          sourceConnection: null,
          aboutField: null,
          whoIds: union(older.fact.whoIds, newer.fact.whoIds),
          placeIds: union(older.fact.placeIds, newer.fact.placeIds),
          projectIds: union(older.fact.projectIds, newer.fact.projectIds),
          syncedIds: [],
          subjectIds: union(older.fact.subjectIds, newer.fact.subjectIds),
          keptOverSource: null,
          supersedesId: newer.id,
          supersededById: null,
          supersededAt: null,
          disputedWithId: null,
          createdAt: now,
          confirmedAt: now,
          lastEditedAt: null,
          sealed: input.seal({
            statement: text,
            quote: null,
            topic: newer.fact.topic,
            value: null,
          }),
        },
      }
    : null;
  const entries = [
    ...(factCreate
      ? [
          {
            ref: {
              op: 'create',
              collection: 'facts',
              docId: factCreate.id,
            } as EffectRef,
            effect: {
              written: {
                status: 'confirmed',
                stated: 'personCorrected',
                ...label(text, SETTLE_LINES.corrected),
              },
              previous: null,
            } as Effect,
          },
        ]
      : []),
    ...[...(confirm ? [confirm] : []), ...links].map((entry) => ({
      ref: { op: 'update', collection: 'facts', docId: entry.id } as EffectRef,
      effect: entry.effect,
    })),
  ];
  const execution = {
    captureId: input.captureId,
    actor: 'nomos',
    category: 'remember',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: entries.map(({ ref }) => ref),
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: { captureId: input.captureId, questionId },
    errorCode: null,
    createdAt: now,
    decidedAt: now,
    finishedAt: now,
    sealed: input.seal({
      summary: isNone
        ? buildSettledNoneLine(text)
        : buildSettledLine(kept.fact.statement),
      commands: [],
      effects: entries.map(({ effect }) => effect),
      undoReport: null,
      abilityOffer: null,
      awayZoneOffer: null,
      goneIds: null,
      said: null,
      lines: null,
      spoken: null,
    }),
  };
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    refused: null,
    plan: {
      taskUpdates: [],
      whoCreate: null,
      placeCreate: null,
      factCreate,
      factUpdates: [...(confirm ? [confirm] : []), ...links].map(
        ({ id, data }) => ({ id, data }),
      ),
      keyDateUpdate: null,
      whoUpdate: null,
      noteUpdate: null,
      topicUpdates: [],
      execution,
      isStale: false,
      capture: {
        questionState,
        sealed: {
          ...input.opened,
          questions: {
            ...oldQuestions,
            [questionId]: {
              ...question,
              answer: {
                by: input.by,
                at: now,
                turnCaptureId: null,
                shape: 'pickOne',
                optionId,
                otherText: null,
              },
            },
          },
        },
        status:
          !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
        executionIds: [...capture.executionIds, input.executionId],
      },
    },
  };
}

/** What answering "which is true now?" about a birthday or passed-away date writes: the kept date and "Neither" write nothing, the new date rewrites the kept one's parts (and its index entry when it comes back each year). A date that is gone is refused. */
function planSettleKeyDate(
  input: ResolveInput,
  question: Record<string, unknown>,
  held: Record<string, unknown>,
  oldQuestions: Record<string, unknown>,
  options: PickOption[],
): { refused: ResolveRefusal } | { refused: null; plan: ResolvePlan } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const target = input.keyDate;
  if (!target) return { refused: 'gone' };
  const { record } = target;
  const heldParts = isRecord(held.parts) ? held.parts : null;
  const num = (value: unknown) => (typeof value === 'number' ? value : null);
  const keptParts = isRecord(held.keptParts) ? held.keptParts : null;
  const hasKeptChanged =
    keptParts !== null &&
    (num(keptParts.month) !== record.sealed.month ||
      num(keptParts.day) !== record.sealed.day ||
      num(keptParts.year) !== record.sealed.year ||
      (keptParts.precision ?? null) !== (record.sealed.precision ?? null));
  if (hasKeptChanged) return { refused: 'changed' };
  const precision =
    KEY_DATE_PRECISIONS.find((entry) => entry === heldParts?.precision) ?? null;
  const next = {
    ...record.sealed,
    month: num(heldParts?.month),
    day: num(heldParts?.day),
    year: num(heldParts?.year),
    precision: record.shape === 'moment' ? precision : null,
  };
  const thisYear = new Date(now).getUTCFullYear();
  const isValid =
    heldParts !== null &&
    (record.shape === 'moment'
      ? next.year !== null &&
        next.precision !== null &&
        checkMomentParts(
          {
            ...next,
            year: next.year,
            precision: next.precision,
          } as Omit<MomentParts, 'captureId'>,
          thisYear,
        ) === null
      : next.month !== null &&
        checkKeyDateParts(
          { ...next, month: next.month } as Omit<KeyDateParts, 'captureId'>,
          thisYear,
        ) === null);
  if (!isValid) return { refused: 'unknown' };
  const isNew = optionId === KEY_DATE_INCOMING_ID;
  const label = options.find((option) => option.id === optionId)?.label ?? '';
  const effect: Effect = {
    written: { 'sealed.title': label, ...partsPaths(next) },
    previous: { 'sealed.title': label, ...partsPaths(record.sealed) },
  };
  const ref = {
    op: 'update',
    collection: 'keyDates',
    docId: target.id,
  } as EffectRef;
  const keyDateUpdate = isNew
    ? {
        id: target.id,
        data: {
          sealed: input.seal({ ...next }),
          lastEditedAt: now,
        },
        indexChange:
          record.shape === 'yearly'
            ? ({
                op: 'upsert',
                whoId: record.whoId,
                entry: toIndexEntry(target.id, {
                  ...next,
                  kind: next.kind as KeyDateParts['kind'],
                  month: next.month ?? 1,
                }),
              } as IndexChange)
            : null,
      }
    : null;
  const execution = !isNew
    ? null
    : {
        captureId: input.captureId,
        actor: 'nomos',
        category: 'remember',
        autonomyLevel: AUTOMATIC_LEVEL,
        state: 'succeeded',
        effectRefs: [ref],
        linkedWhoIds: [record.whoId],
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        questionRef: { captureId: input.captureId, questionId },
        errorCode: null,
        createdAt: now,
        decidedAt: now,
        finishedAt: now,
        sealed: input.seal({
          summary: buildSettledDateLine(label),
          commands: [],
          effects: [effect],
          undoReport: null,
          abilityOffer: null,
          awayZoneOffer: null,
          goneIds: null,
          said: null,
          lines: null,
          spoken: null,
        }),
      };
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    refused: null,
    plan: {
      taskUpdates: [],
      whoCreate: null,
      placeCreate: null,
      factCreate: null,
      factUpdates: [],
      keyDateUpdate,
      whoUpdate: null,
      noteUpdate: null,
      topicUpdates: [],
      execution,
      isStale: false,
      capture: {
        questionState,
        sealed: {
          ...input.opened,
          questions: {
            ...oldQuestions,
            [questionId]: {
              ...question,
              answer: {
                by: input.by,
                at: now,
                turnCaptureId: null,
                shape: 'pickOne',
                optionId,
                otherText: null,
              },
            },
          },
        },
        status:
          !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
        executionIds: execution
          ? [...capture.executionIds, input.executionId]
          : capture.executionIds,
      },
    },
  };
}

/** What answering "which topics?" writes: the note's topics become what it had plus the ticked ones that still exist (at most 10), and each of those topics falls behind with the note waiting. The note's words and edit time are left alone. */
function planFileNote(
  input: ResolveInput,
  question: Record<string, unknown>,
  held: Record<string, unknown>,
  oldQuestions: Record<string, unknown>,
  options: PickOption[],
): { refused: ResolveRefusal } | { refused: null; plan: ResolvePlan } {
  const { questionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const noteId = typeof held.noteId === 'string' ? held.noteId : '';
  const known = input.topics ?? new Map<string, NoteTopicState>();
  const ticked = [...new Set(input.optionIds ?? [])];
  if (
    ticked.length === 0 ||
    ticked.some((id) => !options.some((option) => option.id === id))
  ) {
    return { refused: 'unknown' };
  }
  const note = input.note ?? null;
  if (!note) return { refused: 'noteGone' };
  const picked = ticked.filter((id) => known.has(id));
  if (picked.length === 0) return { refused: 'topicGone' };
  const topicIds = union(note.topicIds, picked).slice(0, NOTE_TOPICS_CAP);
  const added = topicIds.filter((id) => !note.topicIds.includes(id));
  const topicNames = topicIds.map((id) => known.get(id)?.name ?? '');
  const line = buildNoteFiledLine(note.title, topicNames);
  const filings = added.map((id): TopicFiling => {
    const topic = known.get(id) as NoteTopicState;
    return {
      id,
      docState: toBehindState(topic.docState),
      addPendingIds: topic.pendingNoteIds.includes(noteId) ? [] : [noteId],
    };
  });
  const entries =
    added.length === 0
      ? []
      : [
          {
            ref: {
              op: 'update',
              collection: 'notes',
              docId: noteId,
            } as EffectRef,
            effect: {
              written: { topicIds, 'sealed.title': line },
              previous: { topicIds: note.topicIds, 'sealed.title': line },
            } as Effect,
          },
          ...filings.map(({ id, docState, addPendingIds }) => {
            const topic = known.get(id) as NoteTopicState;
            return {
              ref: {
                op: 'update',
                collection: 'topics',
                docId: id,
              } as EffectRef,
              effect: {
                written: {
                  docState,
                  pendingNoteIds: [...topic.pendingNoteIds, ...addPendingIds],
                },
                previous: {
                  docState: topic.docState,
                  pendingNoteIds: topic.pendingNoteIds,
                },
              } as Effect,
            };
          }),
        ];
  const execution =
    entries.length === 0
      ? null
      : {
          captureId: input.captureId,
          actor: 'nomos',
          category: 'organize',
          autonomyLevel: AUTOMATIC_LEVEL,
          state: 'succeeded',
          effectRefs: entries.map(({ ref }) => ref),
          linkedWhoIds: [],
          linkedPlaceIds: [],
          undoesExecutionId: null,
          undoneByExecutionId: null,
          questionRef: { captureId: input.captureId, questionId },
          errorCode: null,
          createdAt: now,
          decidedAt: now,
          finishedAt: now,
          sealed: input.seal({
            summary: line,
            commands: [],
            effects: entries.map(({ effect }) => effect),
            undoReport: null,
            abilityOffer: null,
            awayZoneOffer: null,
            goneIds: null,
            said: null,
            lines: null,
            spoken: null,
          }),
        };
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    refused: null,
    plan: {
      taskUpdates: [],
      whoCreate: null,
      placeCreate: null,
      factCreate: null,
      factUpdates: [],
      keyDateUpdate: null,
      whoUpdate: null,
      noteUpdate:
        added.length === 0 ? null : { id: noteId, data: { topicIds } },
      topicUpdates: filings,
      execution,
      isStale: false,
      capture: {
        questionState,
        sealed: {
          ...input.opened,
          questions: {
            ...oldQuestions,
            [questionId]: {
              ...question,
              answer: {
                by: input.by,
                at: now,
                turnCaptureId: null,
                shape: 'pickSeveral',
                optionIds: picked,
              },
            },
          },
        },
        status:
          !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
        executionIds: execution
          ? [...capture.executionIds, input.executionId]
          : capture.executionIds,
      },
    },
  };
}

/** Answering a grouping question: "no" closes it and writes nothing, "yes" makes the parent and moves the topics, unless they changed since it was asked. */
function planGroup(
  input: ResolveInput,
  question: Record<string, unknown>,
  held: Record<string, unknown>,
  oldQuestions: Record<string, unknown>,
): { refused: ResolveRefusal } | { refused: null; plan: ResolvePlan } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  if (optionId !== 'yes' && optionId !== 'no') return { refused: 'unknown' };
  const name = typeof held.name === 'string' ? held.name : '';
  const childIds = (held.childIds as unknown[]).filter(
    (id): id is string => typeof id === 'string',
  );
  const grouped =
    optionId === 'no' || !input.group
      ? null
      : planGroupTopics({
          name,
          childIds,
          topics: input.group.topics,
          tree: input.group.tree,
          captureId: input.captureId,
          executionId: input.executionId,
          now,
          newId: input.newId,
          seal: input.seal,
          room: MAX_EFFECTS,
        });
  if (optionId === 'yes' && !grouped) return { refused: 'topicGone' };
  if (grouped?.kind === 'refused') {
    return {
      refused: grouped.reason === 'topicGone' ? 'topicGone' : 'groupChanged',
    };
  }
  const made = grouped?.kind === 'grouped' ? grouped : null;
  const execution = !made
    ? null
    : {
        captureId: input.captureId,
        actor: 'nomos',
        category: 'organize',
        autonomyLevel: AUTOMATIC_LEVEL,
        state: 'succeeded',
        effectRefs: made.effects.map(({ ref }) => ref),
        linkedWhoIds: [],
        linkedPlaceIds: [],
        undoesExecutionId: null,
        undoneByExecutionId: null,
        questionRef: { captureId: input.captureId, questionId },
        errorCode: null,
        createdAt: now,
        decidedAt: now,
        finishedAt: now,
        sealed: input.seal({
          summary: made.line,
          commands: [],
          effects: made.effects.map(({ effect }) => effect),
          undoReport: null,
          abilityOffer: null,
          awayZoneOffer: null,
          goneIds: null,
          said: null,
          lines: null,
          spoken: null,
        }),
      };
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    refused: null,
    plan: {
      taskUpdates: [],
      whoCreate: null,
      placeCreate: null,
      factCreate: null,
      factUpdates: [],
      keyDateUpdate: null,
      whoUpdate: null,
      noteUpdate: null,
      topicUpdates: [],
      groupWrite: made
        ? {
            parentCreate: made.parentCreate,
            placements: made.placements,
            versions: made.versions,
          }
        : null,
      execution,
      isStale: false,
      capture: {
        questionState,
        sealed: {
          ...input.opened,
          questions: {
            ...oldQuestions,
            [questionId]: {
              ...question,
              answer: {
                by: input.by,
                at: now,
                turnCaptureId: null,
                shape: 'yesNo',
                optionId,
                otherText: null,
              },
            },
          },
        },
        status:
          !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
        executionIds: execution
          ? [...capture.executionIds, input.executionId]
          : capture.executionIds,
      },
    },
  };
}

/** A nickname the answer saves on the person asked about (Yes), or the one it will not suggest again (No); null when it changes nothing. */
function planAliasChange(
  optionId: string,
  whoId: string,
  alias: string,
  opened: Record<string, unknown>,
): { field: string; previous: unknown; next: string[] } | null {
  if (alias === '') return null;
  if (optionId === whoId) {
    const aliases = toStrings(opened.aliases);
    return aliases.some((word) => isSameWord(word, alias)) ||
      isSameWord(String(opened.name ?? ''), alias) ||
      aliases.length >= ALIASES_CAP
      ? null
      : { field: 'aliases', previous: aliases, next: [...aliases, alias] };
  }
  if (optionId !== 'none') return null;
  const refused = toStrings(opened.refusedAliases);
  return refused.some((word) => isSameWord(word, alias))
    ? null
    : {
        field: 'refusedAliases',
        previous: opened.refusedAliases ?? null,
        next: [...refused, alias].slice(-REFUSED_ALIASES_CAP),
      };
}

/** Why a Yes saved no nickname, said in the turn's result line; null when it saved one or was not a Yes. */
function readAliasRefusal(
  optionId: string,
  whoId: string,
  alias: string,
  opened: Record<string, unknown>,
): string | null {
  if (alias === '' || optionId !== whoId) return null;
  const name = String(opened.name ?? '');
  const aliases = toStrings(opened.aliases);
  if (isSameWord(name, alias)) return `${alias} is already ${name}'s name.`;
  if (aliases.some((word) => isSameWord(word, alias))) {
    return `${name} is already called ${alias}.`;
  }
  return aliases.length >= ALIASES_CAP
    ? `${name} already has ${ALIASES_CAP} other names, so ${alias} wasn't saved.`
    : null;
}

/** What answering an order question writes: each person asked about keeps the order the answer gave them, and the ones it picked get the held tasks. */
function planSettleKin(
  input: ResolveInput,
  question: Record<string, unknown>,
  held: Record<string, unknown>,
  oldQuestions: Record<string, unknown>,
): { refused: ResolveRefusal } | { refused: null; plan: ResolvePlan } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const mode =
    held.mode === 'several' || held.mode === 'extreme' ? held.mode : 'one';
  const wanted = KIN_ORDER_LIST.find((order) => order === held.wanted);
  const asked = toStrings(held.whoIds);
  if (!wanted || asked.length === 0) return { refused: 'unknown' };
  const ticked =
    mode === 'several' ? [...new Set(input.optionIds ?? [])] : [optionId];
  const isNone = ticked.length === 1 && ticked[0] === 'none';
  const isValid =
    ticked.length > 0 &&
    (mode === 'one'
      ? optionId === 'yes' || optionId === 'no'
      : isNone || ticked.every((id) => asked.includes(id)));
  if (!isValid) return { refused: 'unknown' };
  const matched =
    mode === 'one' ? (optionId === 'yes' ? asked : []) : isNone ? [] : ticked;
  const nextOrder = (id: string): KinOrder | null =>
    matched.includes(id) ? wanted : (OPPOSITE[wanted] ?? null);
  const whos = input.whos ?? new Map();
  const rewrites = asked.flatMap((id) => {
    const opened = whos.get(id)?.opened;
    const kin = opened?.kin as
      { kind?: unknown; order?: unknown } | null | undefined;
    const entry = KIN_KINDS.find((known) => known.kind === kin?.kind);
    const order = nextOrder(id);
    return opened && kin && entry?.canOrder && order && kin.order !== order
      ? [{ id, opened, previous: kin, next: { kind: entry.kind, order } }]
      : [];
  });
  if (matched.length > 0 && matched.some((id) => !whos.has(id))) {
    return { refused: 'gone' };
  }
  const liveTasks = toStrings(held.taskIds).flatMap((id) =>
    input.tasks.has(id)
      ? [{ id, task: input.tasks.get(id) as ResolveTask }]
      : [],
  );
  const toLink = liveTasks.filter(({ task }) =>
    matched.some((id) => !task.whoIds.includes(id)),
  );
  const taskEffects = toLink.map(({ id, task }) => {
    const whoIds = union(task.whoIds, matched);
    return {
      ref: { op: 'update', collection: 'tasks', docId: id } as EffectRef,
      effect: {
        written: { 'sealed.title': task.title, whoIds },
        previous: { 'sealed.title': task.title, whoIds: task.whoIds },
      } as Effect,
      update: { id, data: { whoIds, lastEditedAt: now } },
    };
  });
  const whoEffects = rewrites.map(({ id, previous, next }) => ({
    ref: { op: 'update', collection: 'who', docId: id } as EffectRef,
    effect: {
      written: { 'sealed.kin': next },
      previous: { 'sealed.kin': previous },
    } as Effect,
  }));
  const allEffects = [...taskEffects, ...whoEffects];
  const nameOf = (id: string) => String(whos.get(id)?.opened.name ?? '');
  const [first] = liveTasks;
  const summary =
    toLink.length > 0
      ? `Linked ${joinNames(matched.map(nameOf))} to ${
          liveTasks.length === 1
            ? first.task.title
            : `${liveTasks.length} tasks`
        }`
      : rewrites.length > 0
        ? `Saved ${joinNames(rewrites.map(({ id }) => nameOf(id)))} as ${
            mode === 'extreme' ? `your ${wanted}` : `${wanted} than you`
          }`
        : null;
  const execution =
    allEffects.length === 0 || summary === null
      ? null
      : {
          captureId: input.captureId,
          actor: 'nomos',
          category: 'organize',
          autonomyLevel: AUTOMATIC_LEVEL,
          state: 'succeeded',
          effectRefs: allEffects.map(({ ref }) => ref),
          linkedWhoIds: matched,
          linkedPlaceIds: [],
          undoesExecutionId: null,
          undoneByExecutionId: null,
          questionRef: { captureId: input.captureId, questionId },
          errorCode: null,
          createdAt: now,
          decidedAt: now,
          finishedAt: now,
          sealed: input.seal({
            summary,
            commands: [],
            effects: allEffects.map(({ effect }) => effect),
            undoReport: null,
            abilityOffer: null,
            awayZoneOffer: null,
            goneIds: null,
            said: null,
            lines: null,
            spoken: null,
          }),
        };
  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    refused: null,
    plan: {
      taskUpdates: taskEffects.map(({ update }) => update),
      whoCreate: null,
      placeCreate: null,
      factCreate: null,
      factUpdates: [],
      keyDateUpdate: null,
      whoUpdate: null,
      whoRewrites: rewrites.map(({ id, opened, next }) => ({
        id,
        data: {
          sealed: input.seal({ ...opened, kin: next }),
          lastEditedAt: now,
        },
      })),
      noteUpdate: null,
      topicUpdates: [],
      execution,
      isStale: false,
      capture: {
        questionState,
        sealed: {
          ...input.opened,
          questions: {
            ...oldQuestions,
            [questionId]: {
              ...question,
              answer:
                mode === 'several'
                  ? {
                      by: input.by,
                      at: now,
                      turnCaptureId: null,
                      shape: 'pickSeveral',
                      optionIds: ticked,
                    }
                  : {
                      by: input.by,
                      at: now,
                      turnCaptureId: null,
                      shape: 'pickOne',
                      optionId,
                      otherText: null,
                    },
            },
          },
        },
        status:
          !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
        ...(matched.length > 0 && { whoIds: union(capture.whoIds, matched) }),
        executionIds: execution
          ? [...capture.executionIds, input.executionId]
          : capture.executionIds,
      },
    },
  };
}

/** Decides what answering a "which one?" question writes, without touching a database: a pick links the held tasks, "new" makes the person or place first, "none" links nothing, and an answered or unknown question is refused. */
export function planResolve(
  input: ResolveInput,
): { refused: ResolveRefusal } | { refused: null; plan: ResolvePlan } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const oldQuestions = isRecord(input.opened.questions)
    ? input.opened.questions
    : {};
  const question = oldQuestions[questionId];
  if (!state || !isRecord(question)) return { refused: 'unknown' };
  if (state.answeredAt !== null) return { refused: 'answered' };
  if ((state.leftAt ?? null) !== null) return { refused: 'gone' };
  const options = Array.isArray(question.options)
    ? question.options.filter(isOption)
    : [];
  const held = Array.isArray(question.heldCommands)
    ? question.heldCommands.find(isHeld)
    : null;
  if (!held) return { refused: 'unknown' };
  if (held.kind === 'fileNote') {
    return planFileNote(input, question, held, oldQuestions, options);
  }
  if (held.kind === 'settleKin') {
    return planSettleKin(input, question, held, oldQuestions);
  }
  const isKinSearch =
    held.kind === 'linkWho' &&
    isRecord(held.mention) &&
    !!held.mention.kin &&
    question.shape === 'pickRecord';
  if (
    !options.some((option) => option.id === optionId) &&
    !(isKinSearch && isRecordOption(optionId))
  ) {
    return { refused: 'unknown' };
  }
  if (held.kind === 'groupTopics') {
    return planGroup(input, question, held, oldQuestions);
  }
  if (held.kind === 'settleFact') {
    return planSettle(input, question, held, oldQuestions);
  }
  if (held.kind === 'settleKeyDate') {
    return planSettleKeyDate(input, question, held, oldQuestions, options);
  }
  const isPlace = held.kind === 'linkPlace';
  if (
    optionId === 'new' &&
    !hasNewDetails(held, isPlace, input.newName ?? null)
  ) {
    return { refused: 'unknown' };
  }
  if (isRecordOption(optionId) && !input.chosen) return { refused: 'gone' };

  const field = isPlace ? 'placeIds' : 'whoIds';
  const liveTasks = (held.taskIds as unknown[]).flatMap((id) =>
    typeof id === 'string' && input.tasks.has(id)
      ? [{ id, task: input.tasks.get(id) as ResolveTask }]
      : [],
  );
  const isLinking = optionId !== 'none' && liveTasks.length > 0;
  const mention = isRecord(held.mention)
    ? (held.mention as unknown as MentionRead)
    : null;
  const placeName = isRecord(held.place) ? String(held.place.name ?? '') : '';
  const targetId = !isLinking
    ? null
    : optionId === 'new'
      ? input.newId()
      : optionId;
  const toLink = liveTasks.filter(
    ({ task }) => targetId !== null && !task[field].includes(targetId),
  );
  const name = isPlace
    ? toNameCase(placeName)
    : toNameCase(isKinSearch ? (input.newName ?? '') : (mention?.name ?? ''));

  const effects = toLink.map(({ id, task }) => ({
    ref: { op: 'update', collection: 'tasks', docId: id } as EffectRef,
    effect: {
      written: {
        'sealed.title': task.title,
        [field]: [...task[field], targetId],
      },
      previous: { 'sealed.title': task.title, [field]: task[field] },
    } as Effect,
  }));
  const taskUpdates = toLink.map(({ id, task }) => ({
    id,
    data: { [field]: [...task[field], targetId], lastEditedAt: now },
  }));

  const isNew = isLinking && optionId === 'new';
  const dayKey = String(
    getDayIn(capture.createdAt, toKnownZone(input.timeZone)),
  );
  const newTier = readWhoTier({
    tier: 'passing',
    tierSetBy: 'nomos',
    mentionDayKeys: [dayKey],
    taskLinkCount: liveTasks.length,
    hasRole: false,
  });
  const whoCreate =
    isNew && !isPlace && mention && targetId
      ? {
          id: targetId,
          data: buildWhoDoc({
            mention,
            name,
            tier: newTier,
            executionId: input.executionId,
            lastMentionedAt: capture.createdAt,
            now,
            seal: input.seal,
          }),
        }
      : null;
  const placeCreate =
    isNew && isPlace && targetId
      ? {
          id: targetId,
          data: buildPlaceDoc({
            name,
            executionId: input.executionId,
            now,
            seal: input.seal,
          }),
        }
      : null;
  const created = whoCreate ?? placeCreate;
  const createEffects =
    created && whoCreate
      ? [
          {
            ref: {
              op: 'create',
              collection: 'who',
              docId: whoCreate.id,
            } as EffectRef,
            effect: {
              written: {
                'sealed.name': name,
                kind: mention?.kind,
                tier: newTier,
              },
              previous: null,
            } as Effect,
          },
        ]
      : created
        ? [
            {
              ref: {
                op: 'create',
                collection: 'places',
                docId: created.id,
              } as EffectRef,
              effect: { written: { 'sealed.name': name }, previous: null },
            },
          ]
        : [];

  const chosen = input.chosen;
  const tier =
    chosen && !isPlace && isLinking && targetId === optionId
      ? readWhoTier({
          ...chosen,
          mentionDayKeys: [dayKey],
          taskLinkCount: liveTasks.length,
          hasRole: false,
        })
      : null;
  const whoUpdate =
    chosen && !isPlace && isLinking && targetId === optionId
      ? {
          id: targetId,
          data: {
            lastMentionedAt: Math.max(
              capture.createdAt,
              chosen.lastMentionedAt ?? 0,
            ),
            ...(tier && tier !== chosen.tier && { tier }),
          },
        }
      : null;

  const alias = isRecord(held.alias) ? held.alias : null;
  const aliasWhoId = typeof alias?.whoId === 'string' ? alias.whoId : null;
  const aliasName = typeof alias?.name === 'string' ? alias.name : '';
  const aliasOpened = aliasWhoId ? input.whos?.get(aliasWhoId)?.opened : null;
  if (aliasWhoId && !aliasOpened && optionId === aliasWhoId) {
    return { refused: 'gone' };
  }
  const aliasChange =
    aliasWhoId && aliasOpened
      ? planAliasChange(optionId, aliasWhoId, aliasName, aliasOpened)
      : null;
  const aliasEffects =
    aliasChange && aliasWhoId
      ? [
          {
            ref: {
              op: 'update',
              collection: 'who',
              docId: aliasWhoId,
            } as EffectRef,
            effect: {
              written: { [`sealed.${aliasChange.field}`]: aliasChange.next },
              previous: {
                [`sealed.${aliasChange.field}`]: aliasChange.previous,
              },
            } as Effect,
          },
        ]
      : [];
  const aliasRewrites =
    aliasChange && aliasWhoId && aliasOpened
      ? [
          {
            id: aliasWhoId,
            data: {
              sealed: input.seal({
                ...aliasOpened,
                [aliasChange.field]: aliasChange.next,
              }),
              lastEditedAt: now,
            },
          },
        ]
      : [];

  const kinRef = isKinSearch ? normalizeKin(mention?.kin) : null;
  const pickedOpened =
    kinRef && isRecordOption(optionId)
      ? input.whos?.get(optionId)?.opened
      : null;
  if (kinRef && isRecordOption(optionId) && !pickedOpened) {
    return { refused: 'gone' };
  }
  const previousKin = normalizeKin(pickedOpened?.kin);
  const isKinChanged =
    kinRef !== null &&
    pickedOpened != null &&
    (previousKin?.kind !== kinRef.kind || previousKin?.order !== kinRef.order);
  const kinEffects =
    isKinChanged && pickedOpened
      ? [
          {
            ref: {
              op: 'update',
              collection: 'who',
              docId: optionId,
            } as EffectRef,
            effect: {
              written: { 'sealed.kin': kinRef },
              previous: { 'sealed.kin': pickedOpened.kin ?? null },
            } as Effect,
          },
        ]
      : [];
  const kinRewrites =
    isKinChanged && pickedOpened
      ? [
          {
            id: optionId,
            data: {
              sealed: input.seal({ ...pickedOpened, kin: kinRef }),
              lastEditedAt: now,
            },
          },
        ]
      : [];
  const allEffects = [
    ...effects,
    ...createEffects,
    ...aliasEffects,
    ...kinEffects,
  ];
  const whoRewrites = [...aliasRewrites, ...kinRewrites];
  const label =
    aliasWhoId && optionId === aliasWhoId && aliasOpened
      ? String(aliasOpened.name ?? name)
      : isKinSearch && pickedOpened
        ? String(pickedOpened.name ?? name)
        : isRecordOption(optionId)
          ? (options.find((option) => option.id === optionId)?.label ?? name)
          : name;
  const [first] = liveTasks;
  const whoLabel = String(aliasOpened?.name ?? '');
  const aliasRefusal =
    aliasWhoId && aliasOpened && !aliasChange
      ? readAliasRefusal(optionId, aliasWhoId, aliasName, aliasOpened)
      : null;
  const summary =
    liveTasks.length > 0 && isLinking
      ? [
          liveTasks.length === 1
            ? `Linked ${label} to ${first.task.title}`
            : `Linked ${label} to ${liveTasks.length} tasks`,
          ...(aliasRefusal ? [aliasRefusal] : []),
        ].join('. ')
      : aliasChange?.field === 'aliases'
        ? `Saved ${aliasName} as another name for ${whoLabel}`
        : `Noted that ${aliasName} is not ${whoLabel}`;
  const execution =
    allEffects.length === 0
      ? null
      : {
          captureId: input.captureId,
          actor: 'nomos',
          category: 'organize',
          autonomyLevel: AUTOMATIC_LEVEL,
          state: 'succeeded',
          effectRefs: allEffects.map(({ ref }) => ref),
          linkedWhoIds: isPlace || !targetId ? [] : [targetId],
          linkedPlaceIds: isPlace && targetId ? [targetId] : [],
          undoesExecutionId: null,
          undoneByExecutionId: null,
          questionRef: {
            captureId: input.captureId,
            questionId,
          },
          errorCode: null,
          createdAt: now,
          decidedAt: now,
          finishedAt: now,
          sealed: input.seal({
            summary,
            commands: [],
            effects: allEffects.map(({ effect }) => effect),
            undoReport: null,
            abilityOffer: null,
            awayZoneOffer: null,
            goneIds: null,
            said: null,
            lines: null,
            spoken: null,
          }),
        };

  const questionState = {
    ...capture.questionState,
    [questionId]: { ...state, answeredAt: now },
  };
  const isOpen = Object.values(questionState).some(
    (entry) => entry.answeredAt === null && (entry.leftAt ?? null) === null,
  );
  return {
    refused: null,
    plan: {
      taskUpdates,
      whoCreate,
      placeCreate,
      factCreate: null,
      factUpdates: [],
      keyDateUpdate: null,
      whoUpdate,
      whoRewrites,
      noteUpdate: null,
      topicUpdates: [],
      execution,
      isStale: false,
      capture: {
        questionState,
        sealed: {
          ...input.opened,
          questions: {
            ...oldQuestions,
            [questionId]: {
              ...question,
              answer: {
                by: input.by,
                at: now,
                turnCaptureId: null,
                shape: 'pickOne',
                optionId,
                otherText: null,
              },
            },
          },
        },
        status:
          !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
        ...(targetId &&
          !isPlace && { whoIds: union(capture.whoIds, [targetId]) }),
        ...(targetId &&
          isPlace && {
            placeIds: union(capture.placeIds, [targetId]),
          }),
        executionIds: execution
          ? [...capture.executionIds, input.executionId]
          : capture.executionIds,
      },
    },
  };
}
