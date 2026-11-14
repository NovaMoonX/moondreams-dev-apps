import type { SealedPayload } from '../../../appKeys/seal.js';
import {
  createOptionMatcher,
  toComparable,
  toDisplayCase,
} from '../../../vendor/optionMatchUtils.js';
import {
  DEFAULT_ASSISTANT_NAME,
  MAX_EFFECTS,
  MAX_NOTES_PER_TURN,
  MAX_OPEN_ASKED,
  NOTE_TOPICS_CAP,
  NOTES_LIMIT,
  type AskCommand,
  type CreateNoteCommand,
  type KeyDateCommand,
  type MediaDecision,
  type MediaTarget,
  type MentionRead,
  type NomosCommand,
  type NoteFactCommand,
  type NoteFactKind,
  type PlaceRead,
  type ProjectCommand,
  type ProcedureCommand,
  type RunCommand,
  type TaskDue,
  type TopicCommand,
} from './commands.js';
import {
  matchProject,
  planProjectRoles,
  settleProjectStart,
  type ExistingProject,
} from './planProjects.js';
import {
  matchPlaces,
  matchWho,
  type KnownPlace,
  type KnownWho,
} from './matchEntities.js';
import {
  planTopicCommands,
  type PlacedTopic,
  type PlannedVersion,
} from './planTopicCommands.js';
import {
  planProcedureCommands,
  type PlannedProcedureCreate,
  type PlannedProcedureVersion,
  type ProcedureTask,
} from './planProcedureCommands.js';
import {
  planRunCommands,
  type PlannedRunCreate,
  type PlannedRunTick,
} from './planRunCommands.js';
import type { LiveProcedure } from '../procedureStore.js';
import type { LiveRun } from '../runStore.js';
import { LET_GO_WINDOW_MS } from '../media/mediaCaps.js';
import {
  fitsTopic,
  markdownTitle,
  readableSections,
} from '../media/markdownSections.js';
import { TOPICS_LIMIT } from '../topicLimits.js';
import { toNoteSource } from '../topicWrite.js';
import type { LiveTopic } from '../topicVersionStore.js';
import { readWhoTier, type WhoTierValue } from './whoTier.js';
import { planKeyDates, type KeyDateRecord } from './planKeyDates.js';
import type { ByWho } from '../keyDateIndex.js';
import { summarizeAnswer, type CaptureAnswer } from './answerGuards.js';
import { AUTOMATIC_LEVEL } from './policy.js';
import { shouldKeepSensitive } from './sensitive.js';
import { buildSpokenAck, toKnownZone } from './spoken.js';
import {
  buildAskedQuestion,
  buildCodeQuestion,
  buildNoteDuplicateLine,
  buildNoteLine,
  buildSpokenNote,
  buildSpokenWhichTopic,
  buildTopicQuestion,
  describeNotes,
  describeProcedureChanges,
  describeRunChanges,
  describeTopicChanges,
  NOTE_KEPT_SPOKEN,
  NOTES_FULL_LINE,
  NOTES_NOT_KEPT_LINE,
  buildPickQuestion,
  buildSpokenPick,
  buildSpokenQuestion,
  buildFactLine,
  buildFactSource,
  buildNotKeptLine,
  buildSpokenWhichIsTrue,
  buildWhichIsTrueQuestion,
  describeFacts,
  describeKeptPhotos,
  buildFileNoteLine,
  buildFileTopicLine,
  FILE_TOPIC_TOO_LONG_LINE,
  describeKeyDates,
  describeProjects,
  summarize,
  type CodeQuestionKind,
  type EffectCounts,
  type HeldLink,
  type PickCandidate,
  type PickKind,
} from './summaries.js';

export interface ExistingTask {
  status: 'open' | 'done';
  due: TaskDue | null;
  isUrgent: boolean;
  title: string;
  whoIds: string[];
  placeIds: string[];
  sealed: Record<string, unknown>;
}

/** A who the person already has, with what the tier rule reads about it. */
export interface KnownWhoState extends KnownWho {
  relation?: string | null;
  species?: string | null;
  organizationKind?: string | null;
  tier: WhoTierValue;
  tierSetBy: 'person' | 'nomos';
  mentionDayKeys: string[];
  taskLinkCount: number;
  hasRole: boolean;
  yearlyDateCount: number;
  momentCount: number;
}

/** The people and places a turn names, with what the person already has to match them against. */
export interface PeopleInput {
  mentions: MentionRead[];
  places: PlaceRead[];
  known: KnownWhoState[];
  knownPlaces: KnownPlace[];
  assistantName: string | null;
  /** Every name the assistant answers to this turn (its own, the one the person said, the default), so none is filed as a person or place. */
  assistantNames: string[];
  /** The day the capture was made, in the person's zone. */
  dayKey: string;
  capturedAt: number;
}

/** A fact the person already has, for the repeat check: its words and subjects. */
export interface ExistingFact {
  id: string;
  status: 'confirmed' | 'inferred';
  statement: string;
  subjectIds: string[];
  kind: NoteFactKind;
  topic: string | null;
  stated: 'personSaid' | 'nomosInferred' | 'personCorrected';
  createdAt: number;
  /** The fact it is in dispute with, until the person settles which is true. */
  disputedWithId: string | null;
}

export interface EffectRef {
  op: 'create' | 'update' | 'delete';
  collection:
    | 'tasks'
    | 'facts'
    | 'who'
    | 'places'
    | 'media'
    | 'profile'
    | 'keyDates'
    | 'projects'
    | 'notes'
    | 'topics'
    | 'procedures'
    | 'procedureRuns';
  docId: string;
}

/** A topic as the turn's transaction read it, for filing a note under it. */
export interface NoteTopicState {
  name: string;
  path: string;
  docState: string;
  pendingNoteIds: string[];
}

/** A note the person already keeps, opened, for the repeat check. */
export interface KeptNote {
  id: string;
  title: string;
  body: string;
}

/** A line of the turn's card that is no change to a record, with the record it opens. */
export interface ResultNote {
  text: string;
  ref: { collection: 'notes' | 'topics'; id: string };
}

/** A topic a note was filed under: it falls behind, with the note waiting to be written in. */
export interface TopicFiling {
  id: string;
  docState: string;
  addPendingIds: string[];
}

/** Behind only from a state that can fall behind; one being written or failed keeps its state and still gains the pending note. */
export const toBehindState = (docState: string) =>
  docState === 'empty' || docState === 'current' || docState === 'behind'
    ? 'behind'
    : docState;

export interface Effect {
  written: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

/** The media a turn sent, as the transaction read them, and what the model decided about each. */
export interface MediaInput {
  decisions: MediaDecision[];
  /** Each photo or file still `received` when the transaction read it, by alias. */
  items: Map<
    string,
    {
      id: string;
      kind: 'photo' | 'pdf' | 'markdown';
      words: Record<string, unknown>;
    }
  >;
  /** Media code let go without a decision: refused over the cap, not opened, unreadable or a recording. */
  letGoIds: string[];
  /** The existing records a keep may name, by `task:id` or `fact:id`, with the title each shows under. */
  titles: Map<string, string>;
  executionId: string;
}

export interface MediaPlan {
  /** Media kept, written in the turn's one execution. */
  kept: { id: string; data: Record<string, unknown> }[];
  /** Media let go, written in the same transaction but never an effect, so Undo cannot bring one back as received. */
  letGo: { id: string; data: Record<string, unknown> }[];
  effectRefs: EffectRef[];
  effects: Effect[];
  keptTitles: string[];
  keptKinds: string[];
}

const toMediaKey = (target: MediaTarget) => `${target.kind}:${target.ref}`;

/** A Markdown file the turn keeps as a note, and as a topic when it can be one. */
export interface FileImport {
  alias: string;
  mediaId: string;
  fileName: string;
  noteId: string;
  noteTitle: string;
  noteData: Record<string, unknown>;
  filedTopicIds: string[];
  topic: {
    id: string;
    name: string;
    data: Record<string, unknown>;
    version: Record<string, unknown>;
  } | null;
  lines: ResultNote[];
  summary: string;
}

const IMPORT_TOPIC_NAME_CAP = 40;

/** Turns each Markdown file the model asked to keep as a note into the note, and, for `asTopic`, a topic at version 1 whose sections are the file's own, each written by the person and citing the file. A file is skipped when the notes, topics or effects have no room; a file too long for a topic stays a note and says so. */
export function planFileKnowledge(input: {
  decisions: MediaDecision[];
  items: MediaInput['items'];
  topics: ReadonlyMap<string, NoteTopicState> | undefined;
  noteCount: number;
  topicCount: number;
  room: number;
  captureId: string;
  executionId: string;
  now: number;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): { imports: FileImport[]; notKept: string[] } {
  const { now, seal } = input;
  return input.decisions.reduce<{
    imports: FileImport[];
    notKept: string[];
    used: number;
  }>(
    (acc, decision) => {
      const item = input.items.get(decision.alias);
      const text = item?.words.text;
      if (
        !item ||
        item.kind !== 'markdown' ||
        !decision.asNote ||
        typeof text !== 'string'
      ) {
        return acc;
      }
      if (input.noteCount + acc.imports.length >= NOTES_LIMIT) {
        return {
          ...acc,
          notKept: acc.notKept.includes(NOTES_FULL_LINE)
            ? acc.notKept
            : [...acc.notKept, NOTES_FULL_LINE],
        };
      }
      const fileName =
        typeof item.words.fileName === 'string' && item.words.fileName
          ? item.words.fileName
          : 'file';
      const sections = readableSections(text);
      const topicsMade = acc.imports.filter((entry) => entry.topic).length;
      const isTopicWanted =
        decision.asTopic && input.topicCount + topicsMade < TOPICS_LIMIT;
      const canBeTopic = isTopicWanted && fitsTopic(sections);
      const filed = decision.topicIds
        .filter((id) => input.topics?.has(id))
        .slice(0, NOTE_TOPICS_CAP);
      const cost = 2 + (canBeTopic ? 1 : 0) + filed.length;
      if (acc.used + cost > input.room) return acc;
      const noteId = input.newId();
      const noteTitle = markdownTitle(text, fileName);
      const topicId = canBeTopic ? input.newId() : null;
      const topicName = noteTitle.slice(0, IMPORT_TOPIC_NAME_CAP).trimEnd();
      const source = {
        kind: 'file' as const,
        mediaId: item.id,
        noteId,
      };
      const topicSections = sections.map((section) => ({
        id: input.newId(),
        heading: section.heading,
        level: section.level,
        markdown: section.markdown,
        writtenBy: 'person' as const,
        sources: [source],
      }));
      const noteLine = buildFileNoteLine(fileName);
      const topicLine = buildFileTopicLine(topicName, fileName);
      return {
        used: acc.used + cost,
        notKept: acc.notKept,
        imports: [
          ...acc.imports,
          {
            alias: decision.alias,
            mediaId: item.id,
            fileName,
            noteId,
            noteTitle,
            filedTopicIds: filed,
            noteData: {
              topicIds: topicId ? [topicId, ...filed] : filed,
              source: 'importedFile',
              isFromGeneralAnswer: false,
              checkedAt: null,
              hasHealthCaution: false,
              sourceCaptureId: input.captureId,
              sourceMediaId: item.id,
              projectIds: [],
              createdBy: 'nomos',
              executionId: input.executionId,
              createdAt: now,
              lastEditedAt: null,
              sealed: seal({ title: noteTitle, body: text }),
            },
            topic: topicId
              ? {
                  id: topicId,
                  name: topicName,
                  data: {
                    parentId: null,
                    depth: 1,
                    projectIds: [],
                    version: 1,
                    docState: 'current',
                    pendingNoteIds: [],
                    writeClaim: null,
                    overviewOf: {},
                    createdBy: 'nomos',
                    executionId: input.executionId,
                    createdAt: now,
                    lastEditedAt: null,
                    lastWrittenAt: now,
                    sealed: seal({
                      name: topicName,
                      emoji: null,
                      overview: null,
                      sections: topicSections,
                    }),
                  },
                  version: {
                    version: 1,
                    restoredFromVersion: null,
                    createdBy: 'nomos',
                    reason: 'imported',
                    noteIds: [noteId],
                    sourceCaptureId: input.captureId,
                    executionId: input.executionId,
                    createdAt: now,
                    sealed: seal({
                      sections: topicSections,
                      changeSummary: `Imported from ${fileName}`,
                      requestQuote: null,
                      parentName: null,
                    }),
                  },
                }
              : null,
            lines: [
              topicId
                ? {
                    text: topicLine,
                    ref: { collection: 'topics', id: topicId },
                  }
                : { text: noteLine, ref: { collection: 'notes', id: noteId } },
              ...(isTopicWanted && !canBeTopic && sections.length > 0
                ? [
                    {
                      text: FILE_TOPIC_TOO_LONG_LINE,
                      ref: { collection: 'notes' as const, id: noteId },
                    },
                  ]
                : []),
            ],
            summary: topicId ? topicLine : noteLine,
          },
        ],
      };
    },
    { imports: [], notKept: [], used: 0 },
  );
}

/** Decides each attachment: a keep goes on the records it names that still resolve (at most what the effects have room for), a Markdown file kept as a note goes on that note, and every other one is let go for a day. */
export function planMediaDecisions(input: {
  media: MediaInput;
  /** A target's record as it will exist after the turn, or null when it does not. */
  resolve: (target: MediaTarget) => { id: string; title: string } | null;
  /** The note each Markdown file kept as a note became, by alias. */
  imported: Map<string, { noteId: string; title: string }>;
  room: number;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): MediaPlan {
  const { media, now } = input;
  const letGoData = {
    status: 'discarded',
    attachedTo: [],
    decidedBy: 'nomos',
    decidedAt: now,
    deleteAfter: now + LET_GO_WINDOW_MS,
  };
  const decided = media.decisions.flatMap((decision) => {
    const item = media.items.get(decision.alias);
    return item ? [{ decision, photo: item }] : [];
  });
  const planned = decided.reduce<{
    kept: MediaPlan['kept'];
    letGo: MediaPlan['letGo'];
    effectRefs: EffectRef[];
    effects: Effect[];
    keptTitles: string[];
    keptKinds: string[];
  }>(
    (acc, { decision, photo }) => {
      const note = input.imported.get(decision.alias);
      const targets = decision.targets.flatMap((target) => {
        const found = input.resolve(target);
        return found
          ? [{ kind: target.kind, id: found.id, title: found.title }]
          : [];
      });
      if (
        !note &&
        (decision.decision !== 'keep' ||
          targets.length === 0 ||
          acc.effects.length >= input.room)
      ) {
        return {
          ...acc,
          letGo: [...acc.letGo, { id: photo.id, data: letGoData }],
        };
      }
      const attachedTo = [
        ...(note ? [{ kind: 'note', id: note.noteId }] : []),
        ...targets.map(({ kind, id }) => ({ kind, id })),
      ];
      const title = note ? note.title : targets[0].title;
      const written = {
        'sealed.title': title,
        status: 'kept',
        role: 'attachment',
        attachedTo,
        decidedBy: 'nomos',
        decidedAt: now,
        deleteAfter: null,
        executionId: media.executionId,
      };
      const previous = {
        'sealed.title': title,
        status: 'received',
        role: 'attachment',
        attachedTo: [],
        decidedBy: null,
        decidedAt: null,
        deleteAfter: null,
        executionId: null,
      };
      return {
        kept: [
          ...acc.kept,
          {
            id: photo.id,
            data: {
              status: 'kept',
              role: 'attachment',
              attachedTo,
              decidedBy: 'nomos',
              decidedAt: now,
              deleteAfter: null,
              executionId: media.executionId,
              sealed: input.seal({ ...photo.words, caption: decision.caption }),
            },
          },
        ],
        letGo: acc.letGo,
        effectRefs: [
          ...acc.effectRefs,
          { op: 'update', collection: 'media', docId: photo.id },
        ],
        effects: [...acc.effects, { written, previous }],
        keptTitles: note ? acc.keptTitles : [...acc.keptTitles, title],
        keptKinds: note ? acc.keptKinds : [...acc.keptKinds, photo.kind],
      };
    },
    {
      kept: [],
      letGo: [],
      effectRefs: [],
      effects: [],
      keptTitles: [],
      keptKinds: [],
    },
  );
  return {
    ...planned,
    letGo: [
      ...planned.letGo,
      ...media.letGoIds.map((id) => ({ id, data: letGoData })),
    ],
  };
}

export interface WritePlan {
  creates: { id: string; data: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  whoCreates: { id: string; data: Record<string, unknown> }[];
  whoUpdates: { id: string; data: Record<string, unknown> }[];
  placeCreates: { id: string; data: Record<string, unknown> }[];
  factCreates: { id: string; data: Record<string, unknown> }[];
  factConfirms: { id: string; data: Record<string, unknown> }[];
  /** Each kept fact a new one disagrees with, marked as in dispute with it. */
  factDisputes: { id: string; data: Record<string, unknown> }[];
  keyDateCreates: { id: string; data: Record<string, unknown> }[];
  keyDateUpdates: { id: string; data: Record<string, unknown> }[];
  keyDateDeletes: string[];
  projectCreates: { id: string; data: Record<string, unknown> }[];
  projectUpdates: { id: string; data: Record<string, unknown> }[];
  noteCreates: { id: string; data: Record<string, unknown> }[];
  /** Photos kept by this turn, and photos let go for a day. */
  mediaKept: { id: string; data: Record<string, unknown> }[];
  mediaLetGo: { id: string; data: Record<string, unknown> }[];
  /** The title of each record a photo or file was kept on, and what each was, for the summary. */
  mediaKeptTitles: string[];
  mediaKeptKinds: string[];
  /** The summary words of each Markdown file kept as a note or topic. */
  fileSummaries: string[];
  /** The version records of topics made from files, by topic id. */
  topicVersionCreates: {
    topicId: string;
    id: string;
    data: Record<string, unknown>;
  }[];
  topicUpdates: TopicFiling[];
  /** The versions the turn writes for topics, each with the placement it carries. */
  topicVersions: PlannedVersion[];
  /** Topics moved with no version of their own: only their place in the tree changes. */
  topicPlacements: { id: string; parentId: string | null; depth: number }[];
  topicCreates: { id: string; data: Record<string, unknown> }[];
  /** Revisions whose topic changed after the model read it. */
  topicRetry: number;
  procedureCreates: PlannedProcedureCreate[];
  procedureVersions: PlannedProcedureVersion[];
  runCreates: PlannedRunCreate[];
  runTicks: PlannedRunTick[];
  /** Notes kept, and the line said aloud for them. */
  notesMade: number;
  spokenNote: string | null;
  /** Lines with a record to open that changed nothing, such as a note already kept. */
  lines: ResultNote[];
  /** Projects started, people given a key or involved role and milestones added, for the summary. */
  projectsMade: number;
  rolesSet: number;
  milestonesAdded: number;
  /** The yearly index after the turn's dates, null when it did not change. */
  keyDateIndex: { byWho: ByWho; entryCount: number } | null;
  /** One line for each private detail the turn did not keep. */
  notKept: string[];
  /** The result line of each change the turn made to a topic. */
  topicLines: string[];
  /** The result line of each procedure the turn made or changed. */
  procedureLines: string[];
  /** The result line of each run the turn started or ticked. */
  runLines: string[];
  /** Every person, pet or organization and place the turn linked, matched or made. */
  linkedWhoIds: string[];
  linkedPlaceIds: string[];
  effectRefs: EffectRef[];
  effects: Effect[];
  counts: EffectCounts;
  /** One "which one?" question for each unsure name a filed task points at, at most MAX_PICK_QUESTIONS. */
  questions: PlannedQuestion[];
}

export interface PlannedQuestion {
  id: string;
  state: QuestionStateEntry;
  sealed: Record<string, unknown>;
  spoken: string;
}

export const MAX_PICK_QUESTIONS = 3;

interface PlanInput {
  commands: NomosCommand[];
  /** The project the turn starts and the roles it gives, each at most as the reply read them. */
  projectCommands?: ProjectCommand[];
  /** The person's active projects, opened. */
  existingProjects?: ExistingProject[];
  existing: Map<string, ExistingTask>;
  captureId: string;
  executionId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  newId: () => string;
  people?: PeopleInput;
  noteFacts?: NoteFactCommand[];
  /** The words of the turn, which a fact's quote must come from. */
  captureText?: string;
  existingFacts?: ExistingFact[];
  /** The person's own who record, which a fact about them is filed under. */
  selfWhoId?: string | null;
  timeZone?: string;
  keyDates?: KeyDateCommand[];
  /** The yearly index as read in the transaction. */
  keyDateIndex?: { byWho: ByWho; entryCount: number };
  /** The index could not be opened, so the turn's date commands are skipped lines and never written over an index taken for empty. */
  isKeyDateIndexUnreadable?: boolean;
  /** The key date documents the commands name by id. */
  existingKeyDates?: Map<string, KeyDateRecord>;
  /** `yearlyDateCount` of each who a date is changed for, when it is not one the turn names. */
  whoCounts?: Map<string, number>;
  /** `momentCount` of each who a date is changed for, when it is not one the turn names. */
  momentCounts?: Map<string, number>;
  /** The birthday or passed-away date each who keeps, by `whoId:kind`. */
  keptKeyDates?: Map<string, { id: string; record: KeyDateRecord }>;
  /** The moments each named who keeps. */
  storedMoments?: Map<string, { id: string; record: KeyDateRecord }[]>;
  /** The key dates an open "which is true now?" question already asks about. */
  openClashIds?: Set<string>;
  notes?: CreateNoteCommand[];
  /** The topics a note may be filed under, by id. */
  topics?: Map<string, NoteTopicState>;
  /** The notes the device ranked for the words, opened. */
  keptNotes?: KeptNote[];
  noteCount?: number;
  topicCommands?: TopicCommand[];
  /** The topics the topic commands name, opened as the transaction read them. */
  liveTopics?: Map<string, LiveTopic>;
  /** Every topic's place in the tree, for a move or a grouping. */
  topicTree?: PlacedTopic[];
  procedureCommands?: ProcedureCommand[];
  /** The procedures the procedure commands revise, opened as the transaction read them; null when gone. */
  liveProcedures?: Map<string, LiveProcedure | null>;
  /** The tasks whose steps a procedure is made from, opened. */
  procedureTasks?: Map<string, ProcedureTask | null>;
  runCommands?: RunCommand[];
  /** The runs the tick commands name, opened as the transaction read them; null when gone. */
  liveRuns?: Map<string, LiveRun | null>;
  /** The unfinished runs of the procedures the start commands name, as the transaction read them. */
  openRuns?: LiveRun[];
  /** The procedures the named runs were made from that no longer exist. */
  goneProcedureIds?: ReadonlySet<string>;
  /** When the capture was said, which a note's mark in a document carries. */
  capturedAt?: number;
  media?: MediaInput;
}

interface Draft {
  id: string;
  title: string;
  whoIds: string[];
  placeIds: string[];
  due: TaskDue | null;
  isUrgent: boolean;
  status: 'open' | 'done';
  projectId: string | null;
}

const union = (left: string[], right: string[]) => [
  ...new Set([...left, ...right]),
];

const NAME_CASE = {
  style: 'title',
  keepAcronyms: true,
  keepMixedCase: true,
} as const;

/** The document a new person, pet or organization is made as, whether a turn or an answered question makes it. */
export const buildWhoDoc = (input: {
  mention: MentionRead;
  name: string;
  tier: WhoTierValue;
  executionId: string;
  lastMentionedAt: number;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): Record<string, unknown> => ({
  kind: input.mention.kind,
  tier: input.tier,
  tierSetBy: 'nomos',
  isSelf: false,
  placeIds: [],
  photoMediaId: null,
  mediaIds: [],
  importedFrom: null,
  importedFields: {},
  lastMentionedAt: input.lastMentionedAt,
  yearlyDateCount: 0,
  momentCount: 0,
  createdBy: 'nomos',
  executionId: input.executionId,
  createdAt: input.now,
  lastEditedAt: null,
  sealed: input.seal({
    name: input.name,
    aliases: [],
    relation: input.mention.relation,
    phone: null,
    email: null,
    notes: null,
    species: input.mention.species
      ? toDisplayCase(input.mention.species)
      : null,
    organizationKind: input.mention.organizationKind
      ? toDisplayCase(input.mention.organizationKind)
      : null,
  }),
});

/** The document a new place is made as. */
export const buildPlaceDoc = (input: {
  name: string;
  executionId: string;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
}): Record<string, unknown> => ({
  isHome: false,
  photoMediaIds: [],
  createdBy: 'nomos',
  executionId: input.executionId,
  createdAt: input.now,
  lastEditedAt: null,
  sealed: input.seal({
    name: input.name,
    aliases: [],
    address: null,
    notes: null,
  }),
});

/** A new name as the person would write it. */
export const toNameCase = (name: string) => toDisplayCase(name, NAME_CASE);

function settleEntities(input: PlanInput) {
  const people = input.people;
  const empty = {
    whoIdOf: new Map<string, string>(),
    placeIdOf: new Map<string, string>(),
    newWho: [] as { id: string; mention: MentionRead }[],
    newPlaces: [] as { id: string; place: PlaceRead }[],
    unsureWho: new Map<
      string,
      { mention: MentionRead; candidateIds: string[] }
    >(),
    unsurePlaces: new Map<
      string,
      { place: PlaceRead; candidateIds: string[] }
    >(),
  };
  if (!people) return empty;
  const whoMatches = matchWho({
    mentions: people.mentions,
    known: people.known,
    assistantNames: people.assistantNames,
  });
  const placeMatches = matchPlaces({
    names: people.places.map((place) => place.name),
    known: people.knownPlaces,
    assistantNames: people.assistantNames,
  });
  const whoSettled = people.mentions.flatMap((mention, index) => {
    const match = whoMatches[index];
    return match.kind === 'match'
      ? [{ mention, id: match.id, isNew: false }]
      : match.kind === 'new'
        ? [{ mention, id: input.newId(), isNew: true }]
        : [];
  });
  const placeSettled = people.places.flatMap((place, index) => {
    const match = placeMatches[index];
    return match.kind === 'match'
      ? [{ place, id: match.id, isNew: false }]
      : match.kind === 'new'
        ? [{ place, id: input.newId(), isNew: true }]
        : [];
  });
  const unsure = <T extends { ref: string }>(
    items: T[],
    matches: { kind: string; candidateIds?: string[] }[],
  ) =>
    items.flatMap((item, index): [string, T, string[]][] => {
      const ids = matches[index].candidateIds;
      return ids && ids.length > 0 ? [[item.ref, item, ids]] : [];
    });
  return {
    unsureWho: new Map(
      unsure(people.mentions, whoMatches).map(
        ([ref, mention, candidateIds]) => [ref, { mention, candidateIds }],
      ),
    ),
    unsurePlaces: new Map(
      unsure(people.places, placeMatches).map(([ref, place, candidateIds]) => [
        ref,
        { place, candidateIds },
      ]),
    ),
    whoIdOf: new Map(whoSettled.map((entry) => [entry.mention.ref, entry.id])),
    placeIdOf: new Map(
      placeSettled.map((entry) => [entry.place.ref, entry.id]),
    ),
    newWho: whoSettled
      .filter((entry) => entry.isNew)
      .map(({ id, mention }) => ({ id, mention })),
    newPlaces: placeSettled
      .filter((entry) => entry.isNew)
      .map(({ id, place }) => ({ id, place })),
  };
}

const idsOf = (refs: string[], idOf: Map<string, string>) => [
  ...new Set(refs.flatMap((ref) => idOf.get(ref) ?? [])),
];

const toLooseText = (text: string) =>
  text.replace(/\s+/g, ' ').trim().toLowerCase();

const toSubjectKey = (ids: string[]) => [...ids].sort().join('|');

const topicMatcher = createOptionMatcher({ foldPlurals: true });

/** A topic files under one the person's facts of that kind already use ("gas stations" under "gas station"); a new one is written in lowercase like the rest. */
const settleTopic = (
  topic: string | null,
  kind: NoteFactKind,
  existing: ExistingFact[],
) => {
  if (!topic) return null;
  const used = [
    ...new Set(
      existing.flatMap((fact) =>
        fact.kind === kind && fact.topic ? [fact.topic] : [],
      ),
    ),
  ];
  return topicMatcher.match(topic, used) ?? topic.trim().toLowerCase();
};

const isOpinion = (kind: NoteFactKind) =>
  kind === 'preference' || kind === 'favorite';

const isSameDue = (a: TaskDue | null, b: TaskDue | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Turns settled commands into the documents to write and the Execution's record of each change; an update to a task made in the same reply folds into that task's create. */
export function planWrites(input: PlanInput): WritePlan {
  const { existing, now, seal } = input;
  const drafts = new Map<string, Draft>();
  const working = new Map<string, ExistingTask>(existing);
  const patches = new Map<string, Record<string, unknown>>();
  const effectRefs: EffectRef[] = [];
  const effects: Effect[] = [];
  const counts: EffectCounts = { made: 0, updated: 0, completed: 0 };

  const entities = settleEntities(input);
  const projectCommands = input.projectCommands ?? [];
  const projectStart = settleProjectStart({
    command:
      projectCommands.find((command) => command.kind === 'createProject') ??
      null,
    existing: input.existingProjects ?? [],
    newId: input.newId,
  });
  const unsureTasks = new Map<string, string[]>();
  const noteUnsure = (taskId: string, refs: string[]) =>
    refs
      .filter(
        (ref) => entities.unsureWho.has(ref) || entities.unsurePlaces.has(ref),
      )
      .forEach((ref) =>
        unsureTasks.set(ref, union(unsureTasks.get(ref) ?? [], [taskId])),
      );

  const record = (
    docId: string,
    op: EffectRef['op'],
    written: Record<string, unknown>,
    previous: Record<string, unknown> | null,
    collection: EffectRef['collection'] = 'tasks',
  ) => {
    effectRefs.push({ op, collection, docId });
    effects.push({ written, previous });
  };

  const patch = (id: string, data: Record<string, unknown>) =>
    patches.set(id, { ...patches.get(id), ...data });

  input.commands.forEach((command) => {
    if (effects.length + drafts.size >= MAX_EFFECTS) return;
    if (command.kind === 'createTask') {
      const id = input.newId();
      noteUnsure(id, [...command.whoRefs, ...command.placeRefs]);
      drafts.set(command.ref, {
        id,
        title: command.title,
        whoIds: idsOf(command.whoRefs, entities.whoIdOf),
        placeIds: idsOf(command.placeRefs, entities.placeIdOf),
        due: command.due,
        isUrgent: command.isUrgent,
        status: 'open',
        projectId: command.projectRef
          ? matchProject(command.projectRef, projectStart.pool)
          : null,
      });
      return;
    }
    const draft = drafts.get(command.taskId);
    if (draft) {
      if (command.kind === 'completeTask') draft.status = 'done';
      else {
        noteUnsure(draft.id, [...command.whoRefs, ...command.placeRefs]);
        draft.title = command.title ?? draft.title;
        if (command.hasDue) draft.due = command.due;
        draft.isUrgent = command.isUrgent ?? draft.isUrgent;
        draft.whoIds = union(
          draft.whoIds,
          idsOf(command.whoRefs, entities.whoIdOf),
        );
        draft.placeIds = union(
          draft.placeIds,
          idsOf(command.placeRefs, entities.placeIdOf),
        );
      }
      return;
    }
    const current = working.get(command.taskId);
    if (!current) return;
    const id = command.taskId;
    if (command.kind === 'updateTask') {
      noteUnsure(id, [...command.whoRefs, ...command.placeRefs]);
    }

    if (command.kind === 'completeTask') {
      if (current.status === 'done') return;
      record(
        id,
        'update',
        { 'sealed.title': current.title, status: 'done', completedAt: now },
        { 'sealed.title': current.title, status: 'open', completedAt: null },
      );
      patch(id, {
        status: 'done',
        completedAt: now,
        clearedAt: null,
        lastEditedAt: now,
      });
      working.set(id, { ...current, status: 'done' });
      counts.completed += 1;
      return;
    }

    const title =
      command.title && command.title !== current.title ? command.title : null;
    const due =
      command.hasDue && !isSameDue(command.due, current.due)
        ? command.due
        : undefined;
    const isUrgent =
      command.isUrgent !== null && command.isUrgent !== current.isUrgent
        ? command.isUrgent
        : null;
    const whoIds = union(
      current.whoIds,
      idsOf(command.whoRefs, entities.whoIdOf),
    );
    const placeIds = union(
      current.placeIds,
      idsOf(command.placeRefs, entities.placeIdOf),
    );
    const hasNewWho = whoIds.length > current.whoIds.length;
    const hasNewPlace = placeIds.length > current.placeIds.length;
    if (
      title === null &&
      due === undefined &&
      isUrgent === null &&
      !hasNewWho &&
      !hasNewPlace
    ) {
      return;
    }
    const written: Record<string, unknown> = {
      'sealed.title': title ?? current.title,
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
      ...(hasNewWho && { whoIds }),
      ...(hasNewPlace && { placeIds }),
    };
    const previous: Record<string, unknown> = {
      'sealed.title': current.title,
      ...(due !== undefined && { due: current.due }),
      ...(isUrgent !== null && { isUrgent: current.isUrgent }),
      ...(hasNewWho && { whoIds: current.whoIds }),
      ...(hasNewPlace && { placeIds: current.placeIds }),
    };
    record(id, 'update', written, previous);
    patch(id, {
      ...(title !== null && {
        sealed: seal({ ...current.sealed, title }),
      }),
      ...(due !== undefined && { due }),
      ...(isUrgent !== null && { isUrgent }),
      ...(hasNewWho && { whoIds }),
      ...(hasNewPlace && { placeIds }),
      lastEditedAt: now,
    });
    working.set(id, {
      ...current,
      whoIds,
      placeIds,
      title: title ?? current.title,
      due: due === undefined ? current.due : due,
      isUrgent: isUrgent ?? current.isUrgent,
    });
    counts.updated += 1;
  });

  const nameOf = new Map<string, string>([
    ...(input.people?.known ?? []).map((who): [string, string] => [
      who.id,
      who.name,
    ]),
    ...(input.people?.knownPlaces ?? []).map((place): [string, string] => [
      place.id,
      place.name,
    ]),
    ...entities.newWho.map(({ id, mention }): [string, string] => [
      id,
      toNameCase(mention.name),
    ]),
    ...entities.newPlaces.map(({ id, place }): [string, string] => [
      id,
      toNameCase(place.name),
    ]),
  ]);
  const keyOf = (
    statement: string,
    subjectIds: string[],
    kind: NoteFactKind,
    topic: string | null,
  ) =>
    `${toLooseText(statement)}#${toSubjectKey(subjectIds)}#${kind}#${toLooseText(topic ?? '')}`;
  const existingByKey = new Map(
    (input.existingFacts ?? []).map((fact) => [
      keyOf(fact.statement, fact.subjectIds, fact.kind, fact.topic),
      fact,
    ]),
  );
  const selfWhoId = input.selfWhoId ?? null;
  const projectPlan = planProjectRoles({
    created: projectStart.created,
    existing: input.existingProjects ?? [],
    pool: projectStart.pool,
    commands: projectCommands.flatMap((command) =>
      command.kind === 'setProjectRole' ? [command] : [],
    ),
    milestones: projectCommands.flatMap((command) =>
      command.kind === 'addMilestone' ? [command] : [],
    ),
    newId: input.newId,
    taskWho: [...drafts.values()].map((draft) => ({
      projectId: draft.projectId,
      whoIds: draft.whoIds.filter((id) => id !== selfWhoId),
    })),
    namedWhoIds: [...entities.whoIdOf.values()].filter(
      (id) => id !== selfWhoId,
    ),
    whoIdOf: entities.whoIdOf,
    nameOf,
    executionId: input.executionId,
    now,
    seal,
  });
  projectPlan.effects.forEach(({ ref, effect }) =>
    record(ref.docId, ref.op, effect.written, effect.previous, ref.collection),
  );
  const captureWords = toLooseText(input.captureText ?? '');
  const capturedAt = input.people?.capturedAt ?? now;
  const assistantName = input.people?.assistantName ?? DEFAULT_ASSISTANT_NAME;
  const zone = toKnownZone(input.timeZone ?? 'UTC');
  const findContradicted = (
    fact: NoteFactCommand,
    subjectIds: string[],
    kind: NoteFactKind,
    topic: string | null,
    taken: string[],
  ) => {
    const candidates = (input.existingFacts ?? []).filter(
      (other) =>
        other.disputedWithId === null &&
        !taken.includes(other.id) &&
        other.subjectIds.some((id) => subjectIds.includes(id)) &&
        toLooseText(other.statement) !== toLooseText(fact.statement),
    );
    return (
      candidates.find((other) => other.id === fact.contradicts) ??
      candidates.find(
        (other) =>
          isOpinion(kind) &&
          other.kind === kind &&
          topic !== null &&
          toLooseText(other.topic ?? '') === toLooseText(topic) &&
          toSubjectKey(other.subjectIds) === toSubjectKey(subjectIds),
      ) ??
      null
    );
  };
  const factSteps = (input.noteFacts ?? []).reduce<{
    seen: string[];
    creates: { id: string; data: Record<string, unknown> }[];
    confirms: { id: string; data: Record<string, unknown> }[];
    disputes: {
      older: ExistingFact;
      newerId: string;
      statement: string;
      isSaid: boolean;
    }[];
    notKept: string[];
  }>(
    (acc, fact) => {
      const reserved =
        effects.length +
        drafts.size +
        entities.newWho.length +
        entities.newPlaces.length;
      if (reserved >= MAX_EFFECTS) return acc;
      const isSure =
        fact.whoRefs.every((ref) => entities.whoIdOf.has(ref)) &&
        fact.placeRefs.every((ref) => entities.placeIdOf.has(ref));
      const isAboutSelf = fact.isAboutMe;
      if (isAboutSelf && !selfWhoId) return acc;
      const whoIds = union(
        idsOf(fact.whoRefs, entities.whoIdOf),
        isAboutSelf && selfWhoId ? [selfWhoId] : [],
      );
      const placeIds = idsOf(fact.placeRefs, entities.placeIdOf);
      const subjectIds = union(whoIds, placeIds);
      const quoted = toLooseText(fact.quote ?? '');
      const isQuestion =
        (fact.quote?.trim().endsWith('?') ?? false) ||
        (quoted !== '' &&
          (input.captureText ?? '')
            .split(/(?<=[.!?])\s+/)
            .some(
              (sentence) =>
                toLooseText(sentence).includes(quoted) &&
                sentence.trim().endsWith('?'),
            ));
      if (!isSure || subjectIds.length === 0 || isQuestion) return acc;
      const topic = settleTopic(
        fact.topic,
        fact.kind,
        input.existingFacts ?? [],
      );
      const repeatKey = keyOf(fact.statement, subjectIds, fact.kind, topic);
      if (acc.seen.includes(repeatKey)) return acc;
      const seen = [...acc.seen, repeatKey];
      const quote =
        fact.quote !== null &&
        toLooseText(fact.quote) !== '' &&
        captureWords.includes(toLooseText(fact.quote))
          ? fact.quote
          : null;
      // A word or two lifted from the capture is too thin to stand for something said outright.
      const isSaid =
        fact.isStated &&
        quote !== null &&
        toLooseText(quote).split(' ').length >= 2 &&
        toLooseText(quote).length >= 8;
      if (
        !shouldKeepSensitive({
          isSensitive: fact.isSensitive,
          provenance: isSaid ? 'personSaid' : 'nomosInferred',
          subjectWhoIds: subjectIds,
          selfWhoId,
        })
      ) {
        return {
          ...acc,
          seen,
          notKept: [
            ...acc.notKept,
            buildNotKeptLine({
              isAboutSelf:
                subjectIds.length === 1 && subjectIds[0] === selfWhoId,
              assistantName,
            }),
          ],
        };
      }
      const existing = existingByKey.get(repeatKey);
      const contradicted =
        existing ||
        acc.disputes.length >= MAX_PICK_QUESTIONS ||
        reserved + 2 > MAX_EFFECTS
          ? null
          : findContradicted(
              fact,
              subjectIds,
              fact.kind,
              topic,
              acc.disputes.map((dispute) => dispute.older.id),
            );
      const line = buildFactLine({
        subjects: subjectIds.map((subjectId) =>
          subjectId === selfWhoId ? 'You' : (nameOf.get(subjectId) ?? ''),
        ),
        isSaid,
        assistantName,
        isDisputed: contradicted !== null,
      });
      // Saying outright what was only a guess confirms the guess instead of filing it twice.
      if (existing) {
        if (existing.status !== 'inferred' || !isSaid) return { ...acc, seen };
        record(
          existing.id,
          'update',
          {
            status: 'confirmed',
            confirmedAt: capturedAt,
            'sealed.title': line,
            'sealed.statement': existing.statement,
          },
          {
            status: 'inferred',
            confirmedAt: null,
            'sealed.title': line,
            'sealed.statement': existing.statement,
          },
          'facts',
        );
        return {
          ...acc,
          seen,
          confirms: [
            ...acc.confirms,
            {
              id: existing.id,
              data: {
                status: 'confirmed',
                confirmedAt: capturedAt,
                lastEditedAt: now,
              },
            },
          ],
        };
      }
      const id = input.newId();
      const status = isSaid ? 'confirmed' : 'inferred';
      const stated = isSaid ? 'personSaid' : 'nomosInferred';
      record(
        id,
        'create',
        {
          status,
          stated,
          'sealed.title': line,
          'sealed.statement': fact.statement,
        },
        null,
        'facts',
      );
      if (contradicted) {
        const olderLine = buildFactLine({
          subjects: contradicted.subjectIds.map((subjectId) =>
            subjectId === selfWhoId ? 'You' : (nameOf.get(subjectId) ?? ''),
          ),
          isSaid: contradicted.stated !== 'nomosInferred',
          assistantName,
          isDisputed: true,
        });
        record(
          contradicted.id,
          'update',
          {
            disputedWithId: id,
            'sealed.title': olderLine,
            'sealed.statement': contradicted.statement,
          },
          {
            disputedWithId: null,
            'sealed.title': olderLine,
            'sealed.statement': contradicted.statement,
          },
          'facts',
        );
      }
      return {
        ...acc,
        seen,
        disputes: contradicted
          ? [
              ...acc.disputes,
              {
                older: contradicted,
                newerId: id,
                statement: fact.statement,
                isSaid,
              },
            ]
          : acc.disputes,
        creates: [
          ...acc.creates,
          {
            id,
            data: {
              status,
              stated,
              kind: fact.kind,
              occurredOn: null,
              sourceCaptureId: input.captureId,
              sourceExecutionId: input.executionId,
              sourceConnection: null,
              aboutField: null,
              whoIds,
              placeIds,
              projectIds: [],
              syncedIds: [],
              subjectIds,
              keptOverSource: null,
              supersedesId: null,
              supersededById: null,
              supersededAt: null,
              disputedWithId: contradicted?.id ?? null,
              createdAt: capturedAt,
              confirmedAt: isSaid ? capturedAt : null,
              lastEditedAt: null,
              sealed: seal({
                statement: fact.statement,
                quote,
                topic,
                value: fact.value,
              }),
            },
          },
        ],
      };
    },
    { seen: [], creates: [], confirms: [], disputes: [], notKept: [] },
  );
  const factCreates = factSteps.creates;
  const factConfirms = factSteps.confirms;
  const factDisputes = factSteps.disputes.map(({ older, newerId }) => ({
    id: older.id,
    data: { disputedWithId: newerId },
  }));
  const keyDatePlan = planKeyDates({
    commands: input.keyDates ?? [],
    whoIdOf: entities.whoIdOf,
    selfWhoId,
    nameOf,
    whoCounts: new Map([
      ...(input.people?.known ?? []).map((who): [string, number] => [
        who.id,
        who.yearlyDateCount,
      ]),
      ...(input.whoCounts ?? []),
    ]),
    momentCounts: new Map([
      ...(input.people?.known ?? []).map((who): [string, number] => [
        who.id,
        who.momentCount,
      ]),
      ...(input.momentCounts ?? []),
    ]),
    existing: input.existingKeyDates ?? new Map(),
    kept: input.keptKeyDates ?? new Map(),
    moments: input.storedMoments,
    openClashIds: input.openClashIds,
    timeZone: zone,
    questionRoom: Math.max(0, MAX_PICK_QUESTIONS - factSteps.disputes.length),
    index: input.keyDateIndex?.byWho ?? {},
    entryCount: input.keyDateIndex?.entryCount ?? 0,
    isIndexUnreadable: input.isKeyDateIndexUnreadable === true,
    captureId: input.captureId,
    executionId: input.executionId,
    now,
    thisYear: new Date(now).getUTCFullYear(),
    seal,
    newId: input.newId,
    room: Math.max(
      0,
      MAX_EFFECTS -
        (effects.length +
          drafts.size +
          entities.newWho.length +
          entities.newPlaces.length),
    ),
  });
  keyDatePlan.effects.forEach(({ ref, effect }) =>
    record(ref.docId, ref.op, effect.written, effect.previous, ref.collection),
  );
  const turnNotes = (input.notes ?? []).slice(0, MAX_NOTES_PER_TURN);
  const noteIds = turnNotes.map(() => input.newId());
  const topicInput = {
    commands: input.topicCommands ?? [],
    topics: input.liveTopics ?? new Map<string, LiveTopic>(),
    tree: input.topicTree ?? [],
    notes: turnNotes.map((note, index) => ({
      id: noteIds[index],
      title: note.title,
      topicIds: note.topicIds,
      source: toNoteSource(
        {
          id: noteIds[index],
          source: 'capture',
          isFromGeneralAnswer: false,
          sourceCaptureId: input.captureId,
          sourceMediaId: null,
          createdAt: now,
        },
        input.capturedAt ?? now,
      ),
    })),
    captureId: input.captureId,
    captureText: input.captureText ?? '',
    executionId: input.executionId,
    now,
    newId: input.newId,
    seal,
    questionRoom: MAX_PICK_QUESTIONS,
  };
  const skipFiling = planTopicCommands({
    ...topicInput,
    madeNoteIds: null,
    room: MAX_EFFECTS,
  }).skipFiling;
  const noteSteps = turnNotes.reduce<{
    creates: { id: string; data: Record<string, unknown> }[];
    lines: ResultNote[];
    notKept: string[];
    seen: string[];
    working: Map<string, { docState: string; pendingNoteIds: string[] }>;
    filings: Map<string, TopicFiling>;
    asks: { noteId: string; title: string; topicIds: string[] }[];
    names: string[][];
  }>(
    (acc, note, noteIndex) => {
      const key = toComparable(note.body);
      const kept = (input.keptNotes ?? []).find(
        (entry) => toComparable(entry.body) === key,
      );
      if (kept) {
        return {
          ...acc,
          lines: [
            ...acc.lines,
            {
              text: buildNoteDuplicateLine(kept.title),
              ref: { collection: 'notes', id: kept.id },
            },
          ],
        };
      }
      if (acc.seen.includes(key)) return acc;
      const seen = [...acc.seen, key];
      if ((input.noteCount ?? 0) + acc.creates.length >= NOTES_LIMIT) {
        return {
          ...acc,
          seen,
          notKept: acc.notKept.includes(NOTES_FULL_LINE)
            ? acc.notKept
            : [...acc.notKept, NOTES_FULL_LINE],
        };
      }
      const known = note.topicIds
        .filter((id) => input.topics?.has(id))
        .slice(0, NOTE_TOPICS_CAP);
      const filedIds = known.length === 1 ? known : [];
      const reserved =
        effects.length +
        drafts.size +
        entities.newWho.length +
        entities.newPlaces.length;
      if (reserved + 1 + filedIds.length > MAX_EFFECTS) {
        return {
          ...acc,
          notKept: acc.notKept.includes(NOTES_NOT_KEPT_LINE)
            ? acc.notKept
            : [...acc.notKept, NOTES_NOT_KEPT_LINE],
        };
      }
      const id = noteIds[noteIndex];
      const topicNames = filedIds.map(
        (topicId) => input.topics?.get(topicId)?.name ?? '',
      );
      const line = buildNoteLine(note.title, topicNames);
      record(id, 'create', { 'sealed.title': line }, null, 'notes');
      const stepped = filedIds
        .filter((topicId) => !skipFiling.has(`${topicId}:${id}`))
        .reduce(
          (state, topicId) => {
            const before = state.working.get(topicId) ?? {
              docState: input.topics?.get(topicId)?.docState ?? 'empty',
              pendingNoteIds: input.topics?.get(topicId)?.pendingNoteIds ?? [],
            };
            const after = {
              docState: toBehindState(before.docState),
              pendingNoteIds: [...before.pendingNoteIds, id],
            };
            record(topicId, 'update', after, before, 'topics');
            const earlier = state.filings.get(topicId);
            return {
              working: new Map(state.working).set(topicId, after),
              filings: new Map(state.filings).set(topicId, {
                id: topicId,
                docState: after.docState,
                addPendingIds: [...(earlier?.addPendingIds ?? []), id],
              }),
            };
          },
          { working: acc.working, filings: acc.filings },
        );
      return {
        creates: [
          ...acc.creates,
          {
            id,
            data: {
              topicIds: filedIds,
              source: 'capture',
              isFromGeneralAnswer: false,
              checkedAt: null,
              hasHealthCaution: false,
              sourceCaptureId: input.captureId,
              sourceMediaId: null,
              projectIds: [],
              createdBy: 'nomos',
              executionId: input.executionId,
              createdAt: now,
              lastEditedAt: null,
              sealed: seal({ title: note.title, body: note.body }),
            },
          },
        ],
        lines: acc.lines,
        notKept: acc.notKept,
        seen,
        working: stepped.working,
        filings: stepped.filings,
        asks:
          known.length > 1
            ? [...acc.asks, { noteId: id, title: note.title, topicIds: known }]
            : acc.asks,
        names: [...acc.names, topicNames],
      };
    },
    {
      creates: [],
      lines: [],
      notKept: [],
      seen: [],
      working: new Map(),
      filings: new Map(),
      asks: [],
      names: [],
    },
  );
  const topicPlan = planTopicCommands({
    ...topicInput,
    madeNoteIds: new Set(noteSteps.creates.map((created) => created.id)),
    room: Math.max(
      0,
      MAX_EFFECTS -
        (effects.length +
          drafts.size +
          entities.newWho.length +
          entities.newPlaces.length),
    ),
  });
  topicPlan.effects.forEach(({ ref, effect }) =>
    record(ref.docId, ref.op, effect.written, effect.previous, ref.collection),
  );
  const procedurePlan = planProcedureCommands({
    commands: input.procedureCommands ?? [],
    live: input.liveProcedures ?? new Map(),
    tasks: input.procedureTasks ?? new Map(),
    captureId: input.captureId,
    executionId: input.executionId,
    now,
    newId: input.newId,
    seal,
    room: Math.max(
      0,
      MAX_EFFECTS -
        (effects.length +
          drafts.size +
          entities.newWho.length +
          entities.newPlaces.length),
    ),
  });
  procedurePlan.effects.forEach(({ ref, effect }) =>
    record(ref.docId, ref.op, effect.written, effect.previous, ref.collection),
  );
  const runPlan = planRunCommands({
    commands: input.runCommands ?? [],
    liveProcedures: input.liveProcedures ?? new Map(),
    liveRuns: input.liveRuns ?? new Map(),
    openRuns: input.openRuns ?? [],
    goneProcedureIds: input.goneProcedureIds ?? new Set(),
    projects: (input.existingProjects ?? []).map(({ id, name }) => ({
      id,
      name,
    })),
    timeZone: input.timeZone ?? 'UTC',
    captureId: input.captureId,
    executionId: input.executionId,
    now,
    newId: input.newId,
    seal,
    room: Math.max(
      0,
      MAX_EFFECTS -
        (effects.length +
          drafts.size +
          entities.newWho.length +
          entities.newPlaces.length),
    ),
  });
  runPlan.effects.forEach(({ ref, effect }) =>
    record(ref.docId, ref.op, effect.written, effect.previous, ref.collection),
  );
  const refiled = [...skipFiling]
    .filter((key) => !topicPlan.skipFiling.has(key))
    .reduce(
      (state, key) => {
        const [topicId, noteId] = key.split(':');
        if (!state.made.has(noteId)) return state;
        const before = state.working.get(topicId) ?? {
          docState: input.topics?.get(topicId)?.docState ?? 'empty',
          pendingNoteIds: input.topics?.get(topicId)?.pendingNoteIds ?? [],
        };
        const after = {
          docState: toBehindState(before.docState),
          pendingNoteIds: [...before.pendingNoteIds, noteId],
        };
        record(topicId, 'update', after, before, 'topics');
        const earlier = state.filings.get(topicId);
        return {
          ...state,
          working: new Map(state.working).set(topicId, after),
          filings: new Map(state.filings).set(topicId, {
            id: topicId,
            docState: after.docState,
            addPendingIds: [...(earlier?.addPendingIds ?? []), noteId],
          }),
        };
      },
      {
        made: new Set(noteSteps.creates.map((created) => created.id)),
        working: noteSteps.working,
        filings: noteSteps.filings,
      },
    );
  const notKept = [
    ...new Set([
      ...factSteps.notKept,
      ...keyDatePlan.notKept,
      ...projectPlan.notKept,
      ...noteSteps.notKept,
      ...topicPlan.notKept,
      ...procedurePlan.notKept,
      ...runPlan.notKept,
    ]),
  ];

  const creates = [...drafts.values()].map((draft) => {
    const isDone = draft.status === 'done';
    record(
      draft.id,
      'create',
      {
        'sealed.title': draft.title,
        due: draft.due,
        isUrgent: draft.isUrgent,
        status: draft.status,
        ...(isDone && { completedAt: now }),
      },
      null,
    );
    counts.made += 1;
    return {
      id: draft.id,
      data: {
        status: draft.status,
        importance: null,
        isUrgent: draft.isUrgent,
        due: draft.due,
        durationMinutes: null,
        energy: null,
        context: null,
        projectId: draft.projectId,
        milestoneId: null,
        whoIds: draft.whoIds,
        placeIds: draft.placeIds,
        notUntil: null,
        waitsOnTaskIds: [],
        waitsOnWhoId: null,
        stepState: {},
        mediaIds: [],
        createdBy: 'nomos',
        sourceCaptureId: input.captureId,
        executionId: input.executionId,
        createdAt: now,
        lastEditedAt: null,
        completedAt: isDone ? now : null,
        clearedAt: null,
        sealed: seal({ title: draft.title, notes: null, steps: {} }),
      },
    };
  });

  const knowledge = input.media
    ? planFileKnowledge({
        decisions: input.media.decisions,
        items: input.media.items,
        topics: input.topics,
        noteCount: (input.noteCount ?? 0) + noteSteps.creates.length,
        topicCount:
          (input.topicTree ?? []).length + topicPlan.parentCreates.length,
        room:
          MAX_EFFECTS -
          (effects.length +
            drafts.size +
            entities.newWho.length +
            entities.newPlaces.length),
        captureId: input.captureId,
        executionId: input.executionId,
        now,
        newId: input.newId,
        seal,
      })
    : { imports: [], notKept: [] };
  const importFilings = knowledge.imports.reduce(
    (state, made) => {
      record(
        made.noteId,
        'create',
        { 'sealed.title': made.summary },
        null,
        'notes',
      );
      if (made.topic) {
        record(
          made.topic.id,
          'create',
          {
            'sealed.title': made.summary,
            'sealed.name': made.topic.name,
            importedVersion: 1,
          },
          null,
          'topics',
        );
      }
      return made.filedTopicIds.reduce((inner, topicId) => {
        const before = inner.working.get(topicId) ?? {
          docState: input.topics?.get(topicId)?.docState ?? 'empty',
          pendingNoteIds: input.topics?.get(topicId)?.pendingNoteIds ?? [],
        };
        const after = {
          docState: toBehindState(before.docState),
          pendingNoteIds: [...before.pendingNoteIds, made.noteId],
        };
        record(topicId, 'update', after, before, 'topics');
        const earlier = inner.filings.get(topicId);
        return {
          working: new Map(inner.working).set(topicId, after),
          filings: new Map(inner.filings).set(topicId, {
            id: topicId,
            docState: after.docState,
            addPendingIds: [...(earlier?.addPendingIds ?? []), made.noteId],
          }),
        };
      }, state);
    },
    { working: refiled.working, filings: refiled.filings },
  );
  const importedByAlias = new Map(
    knowledge.imports.map((made) => [
      made.alias,
      { noteId: made.noteId, title: made.noteTitle },
    ]),
  );

  const mediaPlan: MediaPlan = input.media
    ? planMediaDecisions({
        media: input.media,
        imported: importedByAlias,
        resolve: (target) => {
          const draft =
            target.kind === 'task' ? drafts.get(target.ref) : undefined;
          if (draft) return { id: draft.id, title: draft.title };
          const title = input.media?.titles.get(toMediaKey(target));
          return title ? { id: target.ref, title } : null;
        },
        room: MAX_EFFECTS - effects.length,
        now,
        seal,
      })
    : {
        kept: [],
        letGo: [],
        effectRefs: [],
        effects: [],
        keptTitles: [],
        keptKinds: [],
      };

  const isFiling = effects.length + mediaPlan.effects.length > 0;
  const people = input.people;
  const links = (field: 'whoIds' | 'placeIds') =>
    [
      ...creates.map(({ data }) => data[field] as string[]),
      ...[...patches.values()].flatMap((data) => {
        const ids = data[field];
        return Array.isArray(ids) ? [ids as string[]] : [];
      }),
    ].flat();
  const taskLinks = links('whoIds').reduce(
    (counts, id) => counts.set(id, (counts.get(id) ?? 0) + 1),
    new Map<string, number>(),
  );
  const newWhoIds = new Set(entities.newWho.map((entry) => entry.id));
  const hasNewDate = (id: string) => (keyDatePlan.deltas.get(id) ?? 0) > 0;
  const whoCreates = !isFiling
    ? []
    : entities.newWho.map(({ id, mention }) => {
        const name = toNameCase(mention.name);
        const tier = readWhoTier({
          tier: 'passing',
          tierSetBy: 'nomos',
          mentionDayKeys: [people?.dayKey ?? ''],
          taskLinkCount: taskLinks.get(id) ?? 0,
          hasRole: projectPlan.roleWhoIds.has(id),
          hasKeyDate: hasNewDate(id),
        });
        record(
          id,
          'create',
          { 'sealed.name': name, kind: mention.kind, tier },
          null,
          'who',
        );
        return {
          id,
          data: buildWhoDoc({
            mention,
            name,
            tier,
            executionId: input.executionId,
            lastMentionedAt: people?.capturedAt ?? now,
            now,
            seal,
          }),
        };
      });
  const placeCreates = !isFiling
    ? []
    : entities.newPlaces.map(({ id, place }) => {
        const name = toNameCase(place.name);
        record(id, 'create', { 'sealed.name': name }, null, 'places');
        return {
          id,
          data: buildPlaceDoc({
            name,
            executionId: input.executionId,
            now,
            seal,
          }),
        };
      });
  const whoUpdates = !isFiling
    ? []
    : [...entities.whoIdOf.values()]
        .filter((id) => !newWhoIds.has(id))
        .flatMap((id) => {
          const state = people?.known.find((entry) => entry.id === id);
          if (!state || !people) return [];
          const tier = readWhoTier({
            tier: state.tier,
            tierSetBy: state.tierSetBy,
            mentionDayKeys: [...state.mentionDayKeys, people.dayKey],
            taskLinkCount: state.taskLinkCount + (taskLinks.get(id) ?? 0),
            hasRole: state.hasRole || projectPlan.roleWhoIds.has(id),
            hasKeyDate: hasNewDate(id),
          });
          return [
            {
              id,
              data: {
                lastMentionedAt: people.capturedAt,
                ...(tier !== state.tier && { tier }),
              },
            },
          ];
        });

  const counterFields = (id: string, known: KnownWhoState | undefined) => ({
    ...(keyDatePlan.deltas.has(id) && {
      yearlyDateCount: Math.max(
        0,
        (known?.yearlyDateCount ?? input.whoCounts?.get(id) ?? 0) +
          (keyDatePlan.deltas.get(id) ?? 0),
      ),
    }),
    ...(keyDatePlan.momentDeltas.has(id) && {
      momentCount: Math.max(
        0,
        (known?.momentCount ?? input.momentCounts?.get(id) ?? 0) +
          (keyDatePlan.momentDeltas.get(id) ?? 0),
      ),
    }),
  });
  const hasCounter = (id: string) =>
    keyDatePlan.deltas.has(id) || keyDatePlan.momentDeltas.has(id);
  const countedCreates = whoCreates.map((entry) =>
    hasCounter(entry.id)
      ? {
          ...entry,
          data: { ...entry.data, ...counterFields(entry.id, undefined) },
        }
      : entry,
  );
  const countedIds = new Set(whoUpdates.map((entry) => entry.id));
  const known = (id: string) => people?.known.find((who) => who.id === id);
  const countedUpdates = [
    ...whoUpdates.map((entry) =>
      hasCounter(entry.id)
        ? {
            ...entry,
            data: {
              ...entry.data,
              ...counterFields(entry.id, known(entry.id)),
            },
          }
        : entry,
    ),
    ...(!isFiling
      ? []
      : [
          ...new Set([
            ...keyDatePlan.deltas.keys(),
            ...keyDatePlan.momentDeltas.keys(),
          ]),
        ]
          .filter((id) => !newWhoIds.has(id) && !countedIds.has(id))
          .map((id) => {
            const state = known(id);
            const tier = state
              ? readWhoTier({
                  tier: state.tier,
                  tierSetBy: state.tierSetBy,
                  mentionDayKeys: state.mentionDayKeys,
                  taskLinkCount: state.taskLinkCount,
                  hasRole: state.hasRole || projectPlan.roleWhoIds.has(id),
                  hasKeyDate: hasNewDate(id),
                })
              : null;
            return {
              id,
              data: {
                ...counterFields(id, state),
                ...(state && tier !== state.tier && { tier }),
              },
            };
          })),
  ];

  const disputeQuestions = !isFiling
    ? []
    : factSteps.disputes.map(
        ({ older, newerId, statement, isSaid }): PlannedQuestion => {
          const newer = {
            id: newerId,
            statement,
            detail: buildFactSource({
              stated: isSaid ? 'personSaid' : 'nomosInferred',
              isConfirmed: isSaid,
              assistantName,
              at: capturedAt,
              timeZone: zone,
            }),
          };
          const before = {
            id: older.id,
            statement: older.statement,
            detail: buildFactSource({
              stated: older.stated,
              isConfirmed: older.status === 'confirmed',
              assistantName,
              at: older.createdAt,
              timeZone: zone,
            }),
          };
          return {
            id: input.newId(),
            state: {
              kind: 'whichIsTrue',
              shape: 'pickOne',
              askedAt: now,
              answeredAt: null,
              skippedAt: null,
            },
            sealed: buildWhichIsTrueQuestion({ older: before, newer }),
            spoken: buildSpokenWhichIsTrue(before.statement, newer.statement),
          };
        },
      );
  const clashQuestions = keyDatePlan.questions.map(
    ({ id, sealed, spoken }): PlannedQuestion => ({
      id,
      state: {
        kind: 'whichIsTrue',
        shape: 'pickOne',
        askedAt: now,
        answeredAt: null,
        skippedAt: null,
      },
      sealed,
      spoken,
    }),
  );
  const pickQuestions = !isFiling
    ? []
    : buildPickQuestions({
        entities,
        unsureTasks,
        people,
        newId: input.newId,
        now,
        room:
          MAX_PICK_QUESTIONS - disputeQuestions.length - clashQuestions.length,
      });
  const topicQuestions = !isFiling
    ? []
    : noteSteps.asks
        .slice(
          0,
          Math.max(
            0,
            MAX_PICK_QUESTIONS -
              disputeQuestions.length -
              clashQuestions.length -
              pickQuestions.length,
          ),
        )

        .map(({ noteId, title, topicIds }): PlannedQuestion => {
          const candidates = topicIds.map((id) => ({
            id,
            label:
              input.topics?.get(id)?.path || input.topics?.get(id)?.name || '',
          }));
          return {
            id: input.newId(),
            state: {
              kind: 'whichTopic',
              shape: 'pickSeveral',
              askedAt: now,
              answeredAt: null,
              skippedAt: null,
            },
            sealed: buildTopicQuestion({ noteId, title, candidates }),
            spoken: buildSpokenWhichTopic(
              topicIds.map((id) => input.topics?.get(id)?.name ?? ''),
            ),
          };
        });
  const groupQuestions = topicPlan.questions.slice(
    0,
    Math.max(
      0,
      MAX_PICK_QUESTIONS -
        clashQuestions.length -
        (isFiling
          ? disputeQuestions.length +
            pickQuestions.length +
            topicQuestions.length
          : 0),
    ),
  );
  const questions = [
    ...clashQuestions,
    ...(!isFiling
      ? []
      : [...disputeQuestions, ...pickQuestions, ...topicQuestions]),
    ...groupQuestions,
  ];

  return {
    creates,
    updates: [...patches.entries()].map(([id, data]) => ({ id, data })),
    whoCreates: countedCreates,
    whoUpdates: countedUpdates,
    placeCreates,
    factCreates,
    factConfirms,
    factDisputes,
    keyDateCreates: keyDatePlan.creates,
    keyDateUpdates: keyDatePlan.updates,
    keyDateDeletes: keyDatePlan.deletes,
    projectCreates: projectPlan.creates,
    projectUpdates: projectPlan.updates,
    noteCreates: [
      ...noteSteps.creates,
      ...knowledge.imports.map((made) => ({
        id: made.noteId,
        data: made.noteData,
      })),
    ],
    mediaKept: mediaPlan.kept,
    mediaLetGo: mediaPlan.letGo,
    mediaKeptTitles: mediaPlan.keptTitles,
    mediaKeptKinds: mediaPlan.keptKinds,
    fileSummaries: knowledge.imports.map((made) => made.summary),
    topicVersionCreates: knowledge.imports.flatMap((made) =>
      made.topic
        ? [{ topicId: made.topic.id, id: '1', data: made.topic.version }]
        : [],
    ),
    topicUpdates: [...importFilings.filings.values()],
    topicVersions: topicPlan.versions,
    topicPlacements: topicPlan.placements,
    topicCreates: [
      ...topicPlan.parentCreates,
      ...knowledge.imports.flatMap((made) =>
        made.topic ? [{ id: made.topic.id, data: made.topic.data }] : [],
      ),
    ],
    topicRetry: topicPlan.retry.length,
    procedureCreates: procedurePlan.creates,
    procedureVersions: procedurePlan.versions,
    runCreates: runPlan.creates,
    runTicks: runPlan.ticks,
    notesMade: noteSteps.creates.length,
    spokenNote:
      noteSteps.creates.length === 0
        ? null
        : noteSteps.creates.length === 1
          ? buildSpokenNote(noteSteps.names[0]?.[0] ?? null)
          : `${describeNotes(noteSteps.creates.length)}.`,
    lines: [
      ...noteSteps.lines,
      ...knowledge.imports.flatMap((made) => made.lines),
    ],
    projectsMade: projectPlan.creates.length,
    rolesSet: projectPlan.rolesSet,
    milestonesAdded: projectPlan.milestonesAdded,
    keyDateIndex:
      isFiling && keyDatePlan.changes.length > 0
        ? { byWho: keyDatePlan.byWho, entryCount: keyDatePlan.entryCount }
        : null,
    notKept: [...notKept, ...knowledge.notKept],
    topicLines: topicPlan.topicLines,
    procedureLines: procedurePlan.lines,
    runLines: runPlan.lines,
    linkedWhoIds: isFiling
      ? union(
          [...entities.whoIdOf.values()],
          keyDatePlan.linkedWhoIds.filter((id) => id !== selfWhoId),
        )
      : [],
    linkedPlaceIds: isFiling ? union([], [...entities.placeIdOf.values()]) : [],
    effectRefs: [...effectRefs, ...mediaPlan.effectRefs],
    effects: [...effects, ...mediaPlan.effects],
    counts,
    questions,
  };
}

const KIND_WORDS: Record<string, string> = {
  person: 'Person',
  pet: 'Pet',
  organization: 'Organization',
};

/** What tells a candidate apart: its relation, a pet's species, an organization's kind, else its kind word when the candidates differ in kind. */
const detailOfWho = (state: KnownWhoState, isMixed: boolean): string | null => {
  if (state.relation) return toDisplayCase(state.relation);
  if (state.kind === 'pet' && state.species) {
    return toDisplayCase(state.species);
  }
  if (state.kind === 'organization' && state.organizationKind) {
    return toDisplayCase(state.organizationKind);
  }
  return isMixed ? (KIND_WORDS[state.kind] ?? null) : null;
};

function buildPickQuestions(input: {
  entities: ReturnType<typeof settleEntities>;
  unsureTasks: Map<string, string[]>;
  people: PeopleInput | undefined;
  newId: () => string;
  now: number;
  room: number;
}): PlannedQuestion[] {
  const { entities, unsureTasks, people, now } = input;
  if (!people) return [];
  const comparable = (name: string) => name.trim().toLowerCase();
  const distinct = <T extends { name: string }>(
    entries: {
      ref: string;
      item: T;
      kindKey: string;
      candidateIds: string[];
    }[],
  ) =>
    entries.filter(
      (entry, index) =>
        unsureTasks.has(entry.ref) &&
        entries.findIndex(
          (other) =>
            unsureTasks.has(other.ref) &&
            other.kindKey + comparable(other.item.name) ===
              entry.kindKey + comparable(entry.item.name),
        ) === index,
    );
  const taskIdsFor = (
    entries: { ref: string; item: { name: string }; kindKey: string }[],
    entry: { item: { name: string }; kindKey: string },
  ) =>
    union(
      [],
      entries
        .filter(
          (other) =>
            other.kindKey + comparable(other.item.name) ===
            entry.kindKey + comparable(entry.item.name),
        )
        .flatMap((other) => unsureTasks.get(other.ref) ?? []),
    );
  const whoEntries = [...entities.unsureWho.entries()].map(
    ([ref, { mention, candidateIds }]) => ({
      ref,
      item: mention,
      kindKey: mention.kind,
      candidateIds,
    }),
  );
  const placeEntries = [...entities.unsurePlaces.entries()].map(
    ([ref, { place, candidateIds }]) => ({
      ref,
      item: place,
      kindKey: 'place',
      candidateIds,
    }),
  );
  const whoQuestions = distinct(whoEntries).flatMap((entry) => {
    const states = entry.candidateIds.flatMap(
      (id) => people.known.find((who) => who.id === id) ?? [],
    );
    const isMixed = new Set(states.map((who) => who.kind)).size > 1;
    const candidates: PickCandidate[] = states.map((who) => ({
      id: who.id,
      label: who.name,
      detail: detailOfWho(who, isMixed),
    }));
    const { name, kind, relation, species, organizationKind } = entry.item;
    return [
      {
        kind: 'whichPerson' as PickKind,
        name,
        candidates,
        held: {
          kind: 'linkWho',
          taskIds: taskIdsFor(whoEntries, entry),
          mention: { name, kind, relation, species, organizationKind },
        } as HeldLink,
      },
    ];
  });
  const placeQuestions = distinct(placeEntries).flatMap((entry) => {
    const candidates: PickCandidate[] = entry.candidateIds.flatMap((id) => {
      const place = people.knownPlaces.find((known) => known.id === id);
      return place
        ? [{ id, label: place.name, detail: place.address ?? null }]
        : [];
    });
    return [
      {
        kind: 'whichPlace' as PickKind,
        name: entry.item.name,
        candidates,
        held: {
          kind: 'linkPlace',
          taskIds: taskIdsFor(placeEntries, entry),
          place: { name: entry.item.name },
        } as HeldLink,
      },
    ];
  });
  return [...whoQuestions, ...placeQuestions]
    .filter((question) => question.candidates.length > 0)
    .slice(0, input.room)
    .map((question) => ({
      id: input.newId(),
      state: {
        kind: question.kind,
        shape: 'pickOne',
        askedAt: now,
        answeredAt: null,
        skippedAt: null,
      },
      sealed: buildPickQuestion(question),
      spoken: buildSpokenPick(
        question.name,
        question.candidates.map((candidate) => candidate.label),
        question.kind === 'whichPlace' ? 'a new place' : 'someone new',
      ),
    }));
}

/** How many model-written questions the person still has open across their waiting turns, a skipped one included. */
export const countOpenAsked = (
  states: (Record<string, QuestionStateEntry> | undefined)[],
) =>
  states
    .flatMap((state) => Object.values(state ?? {}))
    .filter((entry) => entry.kind === 'asked' && entry.answeredAt === null)
    .length;

/** Files each model-written question as an open one, up to the room left under the person's cap; `isDeferred` says some were left out for the cap. */
export function planAsks(input: {
  asks: AskCommand[];
  openAsked: number;
  now: number;
  newId: () => string;
}): { questions: PlannedQuestion[]; isDeferred: boolean } {
  const room = Math.max(0, MAX_OPEN_ASKED - input.openAsked);
  const kept = input.asks.slice(0, room);
  return {
    isDeferred: kept.length < input.asks.length,
    questions: kept.map((ask) => {
      const sealed = buildAskedQuestion(ask);
      return {
        id: input.newId(),
        state: {
          kind: 'asked',
          shape: ask.shape,
          askedAt: input.now,
          answeredAt: null,
          skippedAt: null,
        },
        sealed,
        spoken: buildSpokenQuestion(sealed),
      };
    }),
  };
}

export function buildExecution(
  plan: WritePlan,
  input: Pick<PlanInput, 'captureId' | 'now' | 'seal'> & {
    /** The line saying the person is home, added to the summary and the spoken reply. */
    homeLine?: string | null;
    /** The model's own line about the turn, already checked; the summary stays code's. */
    said?: string | null;
    questionRef?: { captureId: string; questionId: string } | null;
    commands: NomosCommand[];
    messageCount?: number;
    inputMode?: string;
    timeZone?: string;
  },
): Record<string, unknown> {
  const created = plan.effectRefs.flatMap((ref, index) => {
    const { written } = plan.effects[index];
    return ref.op === 'create' && ref.collection === 'tasks'
      ? [
          {
            title: String(written['sealed.title'] ?? ''),
            due: (written.due ?? null) as TaskDue | null,
          },
        ]
      : [];
  });
  const { homeLine = null, said = null } = input;
  const ack = buildSpokenAck({
    inputMode: input.inputMode,
    counts: plan.counts,
    messageCount: input.messageCount ?? 1,
    created,
    timeZone: input.timeZone ?? 'UTC',
    now: input.now,
  });
  const spokenHome =
    homeLine && input.inputMode === 'voice' ? `${homeLine}.` : null;
  const projectLine = describeProjects(
    plan.projectsMade,
    plan.rolesSet,
    plan.milestonesAdded,
  );
  const spokenProject =
    projectLine && input.inputMode === 'voice' ? `${projectLine}.` : null;
  const isVoice = input.inputMode === 'voice';
  const spokenNote = isVoice ? plan.spokenNote : null;
  const spokenKept = isVoice && plan.lines.length > 0 ? NOTE_KEPT_SPOKEN : null;
  // Lines only code knows to say (home, a project, a note's name, a duplicate) keep code's summary.
  const own =
    said && !homeLine && !projectLine && !plan.spokenNote && !plan.lines.length
      ? said
      : null;
  return {
    captureId: input.captureId,
    actor: 'nomos',
    category:
      plan.factCreates.length +
        plan.factConfirms.length +
        plan.keyDateCreates.length +
        plan.keyDateUpdates.length +
        plan.keyDateDeletes.length >
        0 &&
      plan.counts.made + plan.counts.updated + plan.counts.completed === 0
        ? 'remember'
        : 'organize',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: plan.effectRefs,
    linkedWhoIds: plan.linkedWhoIds,
    linkedPlaceIds: plan.linkedPlaceIds,
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: input.questionRef ?? null,
    errorCode: null,
    createdAt: input.now,
    decidedAt: input.now,
    finishedAt: input.now,
    sealed: input.seal({
      summary: [
        summarize(plan.counts, input.messageCount),
        describeFacts(plan.factCreates.length + plan.factConfirms.length),
        describeKeyDates(
          plan.effectRefs.flatMap((ref, position) =>
            ref.collection === 'keyDates'
              ? [String(plan.effects[position].written['sealed.title'] ?? '')]
              : [],
          ),
        ),
        describeProjects(
          plan.projectsMade,
          plan.rolesSet,
          plan.milestonesAdded,
        ),
        describeNotes(plan.notesMade),
        describeKeptPhotos(plan.mediaKeptTitles, plan.mediaKeptKinds),
        ...plan.fileSummaries,
        describeTopicChanges(plan.topicLines.length),
        describeProcedureChanges(
          plan.procedureCreates.length,
          plan.procedureVersions.length,
        ),
        describeRunChanges(
          plan.runCreates.length,
          plan.runTicks.reduce((total, tick) => total + tick.stepIds.length, 0),
        ),
        ...plan.notKept,
        homeLine,
      ]
        .filter(Boolean)
        .join('. '),
      said: own,
      commands: input.commands,
      effects: plan.effects,
      lines: plan.lines,
      undoReport: null,
      goneIds: null,
      spoken: withQuestion(
        (own && isVoice
          ? own
          : [ack, spokenProject, spokenNote, spokenKept, spokenHome]
              .filter(Boolean)
              .join(' ')) || null,
        plan.questions[0]?.spoken ?? null,
      ),
    }),
  };
}

const withQuestion = (ack: string | null, question: string | null) =>
  ack && question ? `${ack} ${question}` : ack;

/** An answer writes only the capture's sealed answer, so it has no effects and nothing to undo, unless it noted one fact: then that fact is its one effect and Undo deletes it. A refused fact is recorded as not done. */
export function buildAnswerExecution(input: {
  captureId: string;
  answer: CaptureAnswer;
  spoken: string | null;
  now: number;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  fact?: { effectRef: EffectRef; effect: Effect; note: string } | null;
  notDone?: string[];
}): Record<string, unknown> {
  return {
    captureId: input.captureId,
    actor: 'nomos',
    category: 'answer',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: input.fact ? [input.fact.effectRef] : [],
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: null,
    errorCode: null,
    createdAt: input.now,
    decidedAt: input.now,
    finishedAt: input.now,
    sealed: input.seal({
      summary: input.fact
        ? `${summarizeAnswer(input.answer)} ${input.fact.note}`
        : summarizeAnswer(input.answer),
      commands: [],
      effects: input.fact ? [input.fact.effect] : [],
      notDone: input.notDone ?? [],
      undoReport: null,
      goneIds: null,
      said: null,
      lines: null,
      spoken: input.spoken,
    }),
  };
}

export interface QuestionStateEntry {
  kind: string;
  shape: string;
  askedAt: number;
  answeredAt: number | null;
  skippedAt: number | null;
}

interface SettleInput {
  mode: 'full' | 'rest';
  filed: number;
  hasPlanDay?: boolean;
  /** The turn said the person is home, whether or not a home place exists to file it on. */
  hasHome?: boolean;
  hasFacts?: boolean;
  /** Photos were kept or let go this turn: a turn well taken, not an unread one. */
  hasMedia?: boolean;
  hasMore: boolean;
  executionId: string | null;
  answer?: {
    executionId: string;
    sealed: CaptureAnswer;
    spoken: { text: string; priority: 'reply'; builtBy: 'code' } | null;
  } | null;
  now: number;
  newId: () => string;
  opened: Record<string, unknown>;
  questionState: Record<string, QuestionStateEntry>;
  executionIds: string[];
  questions?: PlannedQuestion[];
  /** The reply asked questions, even ones the cap left out: not "couldn't read". */
  hadAsks?: boolean;
  /** An answer turn that files nothing is a turn well taken, not an unread one. */
  isAnswerTurn?: boolean;
  /** A line to say back when the turn made no answer of its own: the first open question, or why nothing more was asked. */
  line?: string | null;
}

const isPickKind = (kind: string) =>
  kind === 'whichPerson' ||
  kind === 'whichPlace' ||
  kind === 'whichTopic' ||
  kind === 'whichIsTrue' ||
  kind === 'groupTopics' ||
  kind === 'asked';

const isOpenMore = ([, entry]: [string, QuestionStateEntry]) =>
  entry.kind === 'moreToSort' && entry.answeredAt === null;

/** Whether the capture still waits on a "Sort the rest" answer. */
export const hasOpenMoreToSort = (
  questionState: Record<string, QuestionStateEntry> | undefined,
): boolean => Object.entries(questionState ?? {}).some(isOpenMore);

const asked = (kind: CodeQuestionKind, id: string, now: number) => ({
  state: {
    [id]: {
      kind,
      shape: 'pickOne',
      askedAt: now,
      answeredAt: null,
      skippedAt: null,
    },
  },
  sealed: { [id]: buildCodeQuestion(kind) },
});

/** Where a capture lands once a reading is filed: sorted, still more to sort, or nothing could be made of it. The opened payload is spread so its text and reading are never dropped. */
export function settleCapture(input: SettleInput) {
  const { now, mode, opened } = input;
  const oldQuestions = (opened.questions ?? {}) as Record<string, unknown>;
  const closing = Object.entries(input.questionState).filter(isOpenMore);
  const closedState = Object.fromEntries(
    closing.map(([id, entry]) => [id, { ...entry, answeredAt: now }]),
  );
  const closedQuestions = Object.fromEntries(
    closing.map(([id]) => [
      id,
      {
        ...(oldQuestions[id] as Record<string, unknown>),
        answer: {
          by: 'tap',
          at: now,
          turnCaptureId: null,
          shape: 'pickOne',
          optionId: 'sortRest',
          otherText: null,
        },
      },
    ]),
  );
  const isUnread =
    mode === 'full' &&
    input.filed === 0 &&
    !input.hasMore &&
    !input.answer &&
    !input.hasPlanDay &&
    !input.hasHome &&
    !input.hasFacts &&
    !input.hasMedia &&
    !input.hadAsks &&
    !input.isAnswerTurn;
  const next = isUnread
    ? asked('couldNotRead', input.newId(), now)
    : input.hasMore
      ? asked('moreToSort', input.newId(), now)
      : null;
  const pickState = Object.fromEntries(
    (input.questions ?? []).map((question) => [question.id, question.state]),
  );
  const pickSealed = Object.fromEntries(
    (input.questions ?? []).map((question) => [question.id, question.sealed]),
  );
  const isPickOpen = Object.values({
    ...input.questionState,
    ...pickState,
  }).some((entry) => isPickKind(entry.kind) && entry.answeredAt === null);
  const previous =
    typeof opened.sortedThrough === 'number' ? opened.sortedThrough : 0;
  return {
    status: next || isPickOpen ? ('needsYou' as const) : ('sorted' as const),
    questionState: {
      ...input.questionState,
      ...closedState,
      ...pickState,
      ...next?.state,
    },
    sealed: {
      ...opened,
      questions: {
        ...oldQuestions,
        ...closedQuestions,
        ...pickSealed,
        ...next?.sealed,
      },
      sortedThrough: input.hasMore
        ? previous + input.filed
        : (opened.sortedThrough ?? null),
      ...(input.answer
        ? { answer: input.answer.sealed, spoken: input.answer.spoken }
        : input.line
          ? {
              spoken: {
                text: input.line,
                priority: 'reply',
                builtBy: 'code',
              },
            }
          : {}),
    },
    executionIds: [
      ...input.executionIds,
      ...(input.executionId ? [input.executionId] : []),
      ...(input.answer ? [input.answer.executionId] : []),
    ],
  };
}
