import type { MomentPrecision } from '@/utils/yearlyDateUtils';
import type { ExtraValue, SharedKind } from '@/lib/connections/contract';
import type { AppEncryption, EncryptedFieldPayload } from '@lib/security';

export type { SharedKind };

/** The views that have a screen so far; each later issue adds its own. */
export type HelmView =
  | 'home'
  | 'today'
  | 'inbox'
  | 'tasks'
  | 'settings'
  | 'activity'
  | 'connectedApps'
  | 'connection'
  | 'people'
  | 'who'
  | 'place'
  | 'projects'
  | 'project'
  | 'knowledge'
  | 'topic'
  | 'howNomosSeesYou'
  | 'comingUp';

export type Sealed = EncryptedFieldPayload;

export type HelmEncryption = AppEncryption<'helm'>;

export type VoiceMode = 'cloudWhenOnline' | 'deviceOnly';

export interface HelmProfile {
  /** IANA zone, set from the device on first open. */
  timeZone: string;
  /** Floating "HH:mm": the earliest a slot may start. */
  dayStartTime: string;
  dayEndTime: string;
  /** Share of free time the planner may fill. */
  planFillPercent: number;
  /** "{accountId}/{calendarId}" of each calendar marked as shifts. */
  shiftCalendarIds: string[];
  /** Synced ids of all-day events the person said block their day. */
  busyAllDayEventRefs: string[];
  /** When the person folded the Today offer to connect a calendar. */
  calendarOfferFoldedAt: number | null;
  /** The first-capture AI line was shown. */
  hasSeenAiNotice: boolean;
  /** Whether listening may use the cloud voice service while online. */
  voiceMode: VoiceMode;
  /** This browser listens for "Hey {name}" while Helm is open on screen. */
  isWakeWordOn: boolean;
  /** After a spoken reply, listening stays open for a few seconds so the person can answer without a tap. */
  isHandsFreeOn: boolean;
  /** The line saying who hears what was shown. */
  hasSeenVoiceNotice: boolean;
  /** The person's own who, made on first open; null on a profile from before people. */
  selfWhoId: string | null;
  /** Where the person said they are, holding for a few hours from when they said it; never the device's location. */
  currentPlace: { placeId: string; saidAt: number } | null;
  createdAt: number;
  lastEditedAt: number | null;
}

export type CaptureStatus =
  'received' | 'interpreting' | 'sorted' | 'needsYou' | 'failed';

export type HeldReason =
  'offline' | 'aiUnavailable' | 'dailyLimit' | 'budgetReached' | 'recentLimit';

export type QuestionKind =
  | 'couldNotRead'
  | 'moreToSort'
  | 'whichPerson'
  | 'whichPlace'
  | 'whichIsTrue'
  | 'asked'
  | (string & {});

export type QuestionShape =
  | 'pickOne'
  | 'pickSeveral'
  | 'yesNo'
  | 'freeText'
  | 'dateTime'
  | 'pickRecord'
  | 'number';

/** The readable state of one question; its words are sealed and never needed on the device. */
export interface QuestionState {
  kind: QuestionKind;
  shape: string;
  askedAt: number;
  answeredAt: number | null;
  skippedAt: number | null;
}

/** One choice of a question; `new` and `none` carry no ref. */
export interface QuestionOption {
  id: string;
  label: string;
  detail: string | null;
  ref:
    | { collection: 'who' | 'places'; id: string }
    | { collection: 'facts'; id: string }
    | { collection: 'keyDates'; id: string }
    | null;
}

/** The structured answer to one question, by shape. `isMoney` numbers are integer cents. */
export type QuestionAnswerValue =
  | { shape: 'pickOne'; optionId: string; otherText: string | null }
  | { shape: 'yesNo'; optionId: string; otherText: string | null }
  | { shape: 'pickSeveral'; optionIds: string[] }
  | { shape: 'freeText'; text: string }
  | { shape: 'dateTime'; date: number | null; time: string | null }
  | {
      shape: 'pickRecord';
      ref: { collection: 'who' | 'places'; id: string } | null;
      newName: string | null;
    }
  | { shape: 'number'; value: number };

export type QuestionAnswer = {
  by: 'tap' | 'voice';
  at: number;
  turnCaptureId: string | null;
} & QuestionAnswerValue;

export interface QuestionNumber {
  min: number | null;
  max: number | null;
  unit: string | null;
  isMoney: boolean;
  decimals: 0 | 1 | 2;
}

/** An opened sealed question, built by code (which person or place) or written by the assistant; a code-built one's link is held until it is answered. */
export interface HelmQuestion {
  kind: 'whichPerson' | 'whichPlace' | 'whichIsTrue' | 'asked';
  builtBy: 'code' | 'model';
  shape: QuestionShape;
  prompt: string;
  options: QuestionOption[];
  allowsSomethingElse: boolean;
  noneOption: boolean;
  recordKinds: ('who' | 'place')[];
  dateMode: 'date' | 'time' | 'dateTime' | null;
  number: QuestionNumber | null;
  aboutRef: { collection: string; id: string } | null;
  answer: QuestionAnswer | null;
}

export type CaptureRoute = 'quick' | 'full';

/** A day (UTC midnight of its calendar day) or a moment (an instant). */
export type TaskDue =
  { kind: 'day'; date: number } | { kind: 'moment'; at: number };

/** A stretch of the turn's words, by offsets into the text. */
export interface Token {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface DateSpan extends Token {
  due: TaskDue;
  /** How much of the date the words give when it is a month, a year or a decade ("March 2015", "in 1998", "in the 80s"); null for a day or a time. A coarse span's `due` is the first day of it. */
  precision: 'month' | 'year' | 'decade' | null;
}

/** What Helm read in a turn for certain. A reader of an older turn defaults every field, so none is optional. */
export interface CaptureReading {
  people: Token[];
  places: Token[];
  documents: Token[];
  commands: Token[];
  isUrgent: boolean;
  dates: DateSpan[];
  addressedAs: Token | null;
}

/** A record a screen shows, by id only; the server re-reads it under the caller's uid. Tasks only so far. */
export interface RecordRef {
  collection: 'tasks';
  id: string;
}

/** What a content page shows, sent with a turn asked from it. Focus 1, visible 20. */
export interface ScreenContext {
  view: HelmView;
  focus: RecordRef | null;
  visible: RecordRef[];
  v: 1;
}

/** One turn: what the person said, with the words sealed. */
export interface Capture {
  inputMode: 'typed' | 'voice' | 'attachment';
  /** Which listener wrote a spoken turn ('browser'); null on every other turn. */
  sttProvider: string | null;
  /** The capture whose spoken reply the person talked over to say this; null on every other turn. */
  interruptedCaptureId: string | null;
  /** The question this turn answers, when it answers one the assistant wrote; null on every other turn and on one made before questions had shapes. */
  answersQuestion: { captureId: string; questionId: string } | null;
  /** Which voice said the turn's spoken line ('natural' or 'system'); null until one did. */
  ttsProvider: string | null;
  medium: 'web';
  sessionId: string;
  turnIndex: number;
  route: CaptureRoute | null;
  status: CaptureStatus;
  heldReason: HeldReason | null;
  claimId: string | null;
  claimedAt: number | null;
  attempts: number;
  lastErrorCode: string | null;
  questionState: Record<string, QuestionState>;
  executionIds: string[];
  /** Set on a message that joined an earlier one's turn; null on a lead and on any other turn. */
  turnLeadId: string | null;
  /** On a lead, the messages that joined it in order, at most 9. */
  joinedCaptureIds: string[];
  seenAt: number | null;
  /** `"{connectorId}|{accountId}"` of each connection an answer quoted; empty on a turn that quoted none and on one made before quotes. */
  quotedSourceKeys: string[];
  /** The who and places this turn named, once the assistant has read it. */
  whoIds: string[];
  placeIds: string[];
  createdAt: number;
  sortedAt: number | null;
  /** Set when the assistant was asked to plan a day: "YYYY-MM-DD", which the device plans on sight. */
  planDayKey: string | null;
  /** The page it was asked from; null from home and on turns made before pages could be asked about. */
  screen: ScreenContext | null;
  sealed: Sealed;
}

export type SourceRef =
  | {
      kind:
        | 'fact'
        | 'note'
        | 'task'
        | 'project'
        | 'who'
        | 'place'
        | 'procedure'
        | 'media'
        | 'topic';
      id: string;
    }
  | { kind: 'event'; eventRef: string; title: string; startAt: number }
  | {
      kind: 'synced';
      id: string;
      connectorId: string;
      title: string | null;
      startAt: number | null;
    }
  | {
      kind: 'connection';
      connectorId: string;
      accountId: string;
      name: string;
      label: string | null;
    };

export interface AnswerQuote {
  id: string;
  connectorId: string;
  accountId: string;
  sourceLabel: string;
  /** When the quoted message was sent; null on quotes kept before it was recorded. */
  at: number | null;
  text: string | null;
  deepLink: string | null;
  deletedAt: number | null;
}

export interface SearchedSource {
  connectorId: string;
  accountId: string;
  label: string;
  at: number;
  found: number;
  failed: string | null;
}

export type AnswerScope = 'yourThings' | 'theWorld' | 'both';

/** What a question was answered with: the records part and its sources, and general knowledge kept apart. */
export interface CaptureAnswer {
  question: string;
  scope: AnswerScope;
  fromRecords: string | null;
  sources: SourceRef[];
  general: string | null;
  isHealth: boolean;
  generalDiffersFrom: { noteId: string; says: string } | null;
  suggestedTopicId: string | null;
  quotes: AnswerQuote[];
  searched: SearchedSource[];
}

export interface CaptureSealed {
  text: string;
  reading: CaptureReading;
  answer: CaptureAnswer | null;
  /** The questions the turn asked, by id; only the readable ones carry words here. */
  questions?: Record<string, unknown>;
  /** On a turn that answers a question, the structured answer; null when a spoken one could not be placed. A turn made before answers had shapes reads as null. */
  questionAnswer: QuestionAnswerValue | null;
  /** The line the server wrote for the person to hear and read; absent until it wrote one. */
  spoken?: { text: string } | null;
}

/** A turn after its words are opened; one that would not open keeps `isUnreadable` and empty words. */
export interface OpenCapture extends Omit<Capture, 'sealed'> {
  id: string;
  text: string;
  reading: CaptureReading;
  /** Null on a turn that asked nothing, and on one made before answers were kept. */
  answer: CaptureAnswer | null;
  /** The questions the turn asked, by id, once opened. */
  questions: Record<string, HelmQuestion>;
  /** The server's line for the turn, read aloud and shown on its card; null until it wrote one, and on one that would not open. */
  line: string | null;
  isUnreadable: boolean;
  /** The write has not reached the server yet, so it waits for a connection. */
  hasPendingWrites: boolean;
}

export type TaskStatus = 'open' | 'done';
export type Importance = 'must' | 'should' | 'could';
export type Energy = 'low' | 'medium' | 'high';
export type TaskContext = 'atHome' | 'out' | 'atComputer' | 'onPhone';

export interface Task {
  status: TaskStatus;
  importance: Importance | null;
  isUrgent: boolean;
  due: TaskDue | null;
  durationMinutes: number | null;
  energy: Energy | null;
  context: TaskContext | null;
  projectId: string | null;
  milestoneId: string | null;
  whoIds: string[];
  placeIds: string[];
  notUntil: number | null;
  waitsOnTaskIds: string[];
  waitsOnWhoId: string | null;
  stepState: Record<string, { order: number; doneAt: number | null }>;
  mediaIds: string[];
  createdBy: 'person' | 'nomos';
  sourceCaptureId: string | null;
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  completedAt: number | null;
  /** Set when the person clears the done tasks of a project: hidden from its done fold, still found by search. */
  clearedAt: number | null;
  sealed: Sealed;
}

export type WhoKind = 'person' | 'pet' | 'organization';

export type WhoTier = 'close' | 'regular' | 'passing';

/** `apps/helm/users/{uid}/who/{whoId}`: a person, pet or organization, made on first mention. */
export interface Who {
  kind: WhoKind;
  tier: WhoTier;
  /** The assistant never changes a tier the person set. */
  tierSetBy: 'person' | 'nomos';
  isSelf: boolean;
  placeIds: string[];
  photoMediaId: string | null;
  mediaIds: string[];
  importedFrom: {
    connectorId: 'google:contacts';
    accountId: string;
    resourceName: string;
    importedAt: number;
  } | null;
  importedFields: Record<string, string>;
  /** The newest capture that named it. */
  lastMentionedAt: number | null;
  yearlyDateCount: number;
  momentCount: number;
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface WhoSealed {
  name: string;
  aliases: string[];
  /** "my sister", "our vet clinic". */
  relation: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  /** Pets only ("Cat"). */
  species: string | null;
  /** Organizations only ("Bakery"). */
  organizationKind: string | null;
}

/** A who after its words are opened; one that would not open keeps `isUnreadable` and an empty name. */
export interface OpenWho extends Omit<Who, 'sealed'>, WhoSealed {
  id: string;
  isUnreadable: boolean;
}

/** `birthday`, `anniversary` and `custom` (when it comes back) are yearly; every other kind, and a custom one that does not come back, is a moment. */
export type KeyDateKind =
  | 'birthday'
  | 'anniversary'
  | 'custom'
  | 'passedAway'
  | 'met'
  | 'adopted'
  | 'startedJob'
  | 'leftJob'
  | 'moved'
  | 'graduated';

export type KeyDateShape = 'yearly' | 'moment';

export type { MomentPrecision } from '@/utils/yearlyDateUtils';

/** `apps/helm/users/{uid}/keyDates/{id}`: only `whoId` and `shape` are readable; the date itself is sealed. */
export interface KeyDate {
  whoId: string;
  shape: KeyDateShape;
  source: 'person' | 'nomos' | 'google:contacts';
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface KeyDateSealed {
  kind: KeyDateKind;
  /** Required for `custom` (up to 60); otherwise an optional note. */
  label: string | null;
  month: number | null;
  day: number | null;
  /** The first year; null when unknown. A moment always has one. */
  year: number | null;
  /** Moments only; a date that comes back reads null. */
  precision: MomentPrecision | null;
  captureId: string | null;
}

export interface OpenKeyDate extends Omit<KeyDate, 'sealed'>, KeyDateSealed {
  id: string;
}

/** `[keyDateId, kind, month, day, year, label]`: a tuple keeps the document small; label for custom only. */
export type KeyDateIndexEntry = [
  keyDateId: string,
  kind: 'birthday' | 'anniversary' | 'custom',
  month: number,
  day: number | null,
  year: number | null,
  label: string | null,
];

export interface KeyDateIndexSealed {
  byWho: Record<string, KeyDateIndexEntry[]>;
}

/** `apps/helm/users/{uid}/meta/keyDateIndex` (or `keyDateIndex-01` to `-12` once split). */
export interface KeyDateIndex {
  /** Readable: the cap check and a repair's comparison, nothing else. */
  entryCount: number;
  rebuiltAt: number | null;
  lastEditedAt: number;
  sealed: Sealed;
}

/** `apps/helm/users/{uid}/places/{placeId}`: a place named in a turn; never coordinates. */
export interface Place {
  isHome: boolean;
  photoMediaIds: string[];
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface PlaceSealed {
  name: string;
  aliases: string[];
  address: string | null;
  notes: string | null;
}

export interface OpenPlace extends Omit<Place, 'sealed'>, PlaceSealed {
  id: string;
  isUnreadable: boolean;
}

export type ProjectRole = 'key' | 'involved' | 'mentioned';

/** `apps/helm/users/{uid}/projects/{projectId}`: something with several steps. Its words are sealed; the roles are ids and an enum only. */
export interface Project {
  /** Date-only, UTC midnight. */
  targetDate: number | null;
  status: 'active' | 'finished';
  milestoneState: Record<
    string,
    { date: number | null; order: number; doneAt: number | null }
  >;
  whoRoles: Record<string, ProjectRole>;
  mediaIds: string[];
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  finishedAt: number | null;
  sealed: Sealed;
}

export interface ProjectSealed {
  name: string;
  emoji: string | null;
  objective: string | null;
  milestones: Record<string, { title: string }>;
  /** whoId to a short note ("florist"). */
  roleNotes: Record<string, string>;
}

export interface OpenProject extends Omit<Project, 'sealed'>, ProjectSealed {
  id: string;
  isUnreadable: boolean;
}

export type NoteSource =
  'typed' | 'capture' | 'savedAnswer' | 'importedFile' | 'assistantDraft';

/** `apps/helm/users/{uid}/notes/{id}`: one piece of knowledge, in any number of topics or none. */
export interface Note {
  topicIds: string[];
  source: NoteSource;
  isFromGeneralAnswer: boolean;
  checkedAt: number | null;
  hasHealthCaution: boolean;
  sourceCaptureId: string | null;
  sourceMediaId: string | null;
  projectIds: string[];
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface NoteSealed {
  title: string;
  body: string;
}

export interface OpenNote extends Omit<Note, 'sealed'>, NoteSealed {
  id: string;
  isUnreadable: boolean;
}

export type TopicDepth = 1 | 2 | 3;

export type TopicSource =
  | { kind: 'note'; noteId: string }
  | { kind: 'message'; captureId: string; at: number }
  | { kind: 'file'; mediaId: string; noteId: string | null }
  | { kind: 'general'; noteId: string }
  | { kind: 'person'; at: number };

export interface TopicSection {
  id: string;
  heading: string | null;
  level: 1 | 2 | 3;
  markdown: string;
  writtenBy: 'nomos' | 'person';
  sources: TopicSource[];
}

/** `apps/helm/users/{uid}/topics/{id}`: a place notes are filed under. */
export interface Topic {
  parentId: string | null;
  depth: TopicDepth;
  projectIds: string[];
  version: number;
  docState: 'empty' | 'current' | 'behind' | 'writing' | 'failed';
  pendingNoteIds: string[];
  writeClaim: { claimId: string; at: number } | null;
  overviewOf: Record<string, number>;
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  lastWrittenAt: number | null;
  sealed: Sealed;
}

export interface TopicSealed {
  name: string;
  emoji: string | null;
  overview: string | null;
  sections: TopicSection[];
}

export interface OpenTopic extends Omit<Topic, 'sealed'>, TopicSealed {
  id: string;
  isUnreadable: boolean;
}

export type MediaStatus = 'uploading' | 'received' | 'kept' | 'discarded';

/** A record a medium shows on, by id. */
export interface MediaAttachment {
  kind: 'who' | 'place';
  id: string;
}

/** `apps/helm/users/{uid}/media/{mediaId}`: a photo whose sealed bytes are in Storage. Only the fields photos use so far; the rest of the shape arrives with the media a turn attaches. */
export interface Media {
  kind: 'photo';
  /** A who's or place's picture, as opposed to a file a turn brought in. */
  role: 'attachment' | 'photo';
  status: MediaStatus;
  /** Of the original, before sealing. */
  mimeType: string;
  hasThumb: boolean;
  attachedTo: MediaAttachment[];
  decidedBy: 'nomos' | 'person' | null;
  createdAt: number;
  decidedAt: number | null;
  /** A discarded medium is deleted after this; an upload that never finished too. */
  deleteAfter: number | null;
  sealed: Sealed;
}

export interface MediaSealed {
  bytesNonce: string;
  thumbNonce: string | null;
  /** The data key that sealed the bytes. */
  keyId: string;
}

/** A medium after its nonces are opened; one that would not open keeps `isUnreadable` and cannot be shown. */
export interface OpenMedia extends Omit<Media, 'sealed'>, MediaSealed {
  id: string;
  isUnreadable: boolean;
}

export interface TaskSealed {
  title: string;
  notes: string | null;
  steps: Record<string, { text: string }>;
}

/** A task after its words are opened; one that would not open keeps `isUnreadable` and an empty title. */
export interface OpenTask extends Omit<Task, 'sealed'> {
  id: string;
  title: string;
  notes: string | null;
  steps: Record<string, { text: string }>;
  isUnreadable: boolean;
}

export type ExecutionState =
  | 'proposed'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'executing'
  | 'verificationRequired';

export type ActionCategory =
  | 'organize'
  | 'remember'
  | 'plan'
  | 'draft'
  | 'answer'
  | 'undo'
  | 'outbound'
  | 'import';

/** 1 and 2 act inside Helm; 3 and 4 (acting outside without asking) are not built. */
export type AutonomyLevel = 1 | 2 | 3 | 4;

export interface EffectRef {
  /** `delete` appears only in the executions an undo writes. */
  op: 'create' | 'update' | 'delete';
  collection:
    | 'tasks'
    | 'facts'
    | 'who'
    | 'places'
    | 'media'
    | 'profile'
    | 'keyDates'
    | 'projects';
  docId: string;
}

export interface ExecutionEffect {
  written: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

export interface Execution {
  captureId: string | null;
  actor: 'nomos' | 'person';
  category: ActionCategory;
  autonomyLevel: AutonomyLevel;
  state: ExecutionState;
  effectRefs: EffectRef[];
  /** Who and places the execution linked, matched or made; ids only. */
  linkedWhoIds: string[];
  linkedPlaceIds: string[];
  undoesExecutionId: string | null;
  undoneByExecutionId: string | null;
  questionRef: { captureId: string; questionId: string } | null;
  errorCode: string | null;
  createdAt: number;
  decidedAt: number | null;
  finishedAt: number | null;
  sealed: Sealed;
}

export interface ExecutionSealed {
  summary: string;
  commands: unknown[];
  effects: ExecutionEffect[];
  undoReport: string | null;
  /** The line said aloud after a spoken turn, code-built; null for a typed turn, an undo and anything made before voice. */
  spoken: string | null;
  /** The records an undo found deleted, by id; null on every other execution. */
  goneIds: string[] | null;
}

/** An execution after its payload is opened; one that would not open keeps `isUnreadable` and says nothing. */
export interface OpenExecution extends Omit<Execution, 'sealed'> {
  id: string;
  summary: string;
  effects: ExecutionEffect[];
  undoReport: string | null;
  spoken: string | null;
  goneIds: string[] | null;
  isUnreadable: boolean;
}

export type TaskActivity =
  | { kind: 'active' }
  | { kind: 'notYet'; until: number }
  | { kind: 'waiting'; onTaskIds: string[]; onWhoId: string | null };

export type TaskWordsChange =
  | { kind: 'title'; title: string }
  | { kind: 'notes'; notes: string | null }
  | { kind: 'addStep'; stepId: string; text: string }
  | { kind: 'editStep'; stepId: string; text: string }
  | { kind: 'removeStep'; stepId: string };

export type TaskPlainFields = Partial<
  Pick<
    Task,
    | 'importance'
    | 'isUrgent'
    | 'due'
    | 'durationMinutes'
    | 'energy'
    | 'context'
    | 'notUntil'
    | 'waitsOnTaskIds'
    | 'waitsOnWhoId'
  >
>;

/** What a synced copy's sealed payload holds once opened (the contract's shared record minus its readable fields). */
export interface SyncedContent {
  title: string;
  subtitle: string | null;
  detail: string | null;
  placeLabel: string | null;
  amountCents: number | null;
  currency: string | null;
  /** An internal route in the source app. */
  deepLink: string | null;
  extra: Record<string, ExtraValue>;
}

/** A copy of another app's record, written only by the platform's Helm sink and opened on the device. */
export interface SyncedRecord {
  id: string;
  connectorId: string;
  accountId: string;
  grantId: string;
  category: string;
  kind: SharedKind;
  sourceRef: string;
  startAt: number | null;
  endAt: number | null;
  isAllDay: boolean;
  dueAt: number | null;
  calendarKey: string | null;
  isBusy: boolean | null;
  sourceUpdatedAt: number | null;
  syncedAt: number;
  transformVersion: number;
  /** What the copy said when it was last written; null on a copy made before it was kept. */
  contentHash: string | null;
  /** Set when the connection ended and the copy was kept. */
  connectionEndedAt: number | null;
  deleteAfter: number | null;
  sealed: SyncedContent;
}

export type FactStatus = 'inferred' | 'confirmed' | 'superseded';
export type FactStated = 'personSaid' | 'nomosInferred' | 'personCorrected';
export type FactKind = 'world' | 'preference' | 'favorite' | 'identity';
export type FactField = 'startAt' | 'endAt' | 'place';

export interface Fact {
  status: FactStatus;
  stated: FactStated;
  /** A fact written before kinds existed has none and reads as `world`. */
  kind: FactKind;
  occurredOn: number | null;
  sourceCaptureId: string | null;
  sourceExecutionId: string | null;
  sourceConnection: {
    connectorId: string;
    accountId: string;
    quoteId: string;
  } | null;
  aboutField: FactField | null;
  whoIds: string[];
  placeIds: string[];
  projectIds: string[];
  /** The synced copies the fact is about. */
  syncedIds: string[];
  subjectIds: string[];
  /** Set when the person said the source is right, so the disagreement stops showing for that copy as it was. */
  keptOverSource: { syncedId: string; contentHash: string } | null;
  supersedesId: string | null;
  supersededById: string | null;
  supersededAt: number | null;
  /** The fact it disagrees with until the person settles which is true. */
  disputedWithId: string | null;
  createdAt: number;
  confirmedAt: number | null;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface FactSealed {
  statement: string;
  quote: string | null;
  /** What a preference or favorite is about ("gas station", "movies"); a fact written before topics existed has none. */
  topic: string | null;
  /** The shown text of what the fact says about its field, such as "2:00 PM", or the preferred or favorite thing ("Shell"). */
  value: string | null;
}

/** A fact after its words are opened; one that would not open is left out. */
export interface OpenFact extends Omit<Fact, 'sealed'> {
  id: string;
  statement: string;
  quote: string | null;
  topic: string | null;
  value: string | null;
}

export type PlanSlotStatus = 'suggested' | 'kept' | 'notToday';

export interface PlanSlot {
  taskId: string;
  /** Instant; null means "any time today", as planned with no calendar. */
  startAt: number | null;
  endAt: number | null;
  status: PlanSlotStatus;
  source: 'nomos' | 'person';
  decidedAt: number | null;
}

export interface PlanCalendarEntry {
  eventRef: string;
  title: string;
  startAt: number;
  endAt: number;
  isAllDay: boolean;
}

export interface PlanDaySealed {
  /** Slot id to its rule-built reason ("20 min · fits before the tasting"). */
  reasons: Record<string, string>;
  calendarSnapshot: PlanCalendarEntry[];
}

/** One local day's plan; its id is "YYYY-MM-DD" in the profile's zone. */
export interface PlanDay {
  id: string;
  /** Date-only, UTC midnight. */
  date: number;
  slots: Record<string, PlanSlot>;
  isRestDay: boolean;
  restDayOverriddenAt: number | null;
  generatedAt: number | null;
  calendarReadAt: number | null;
  reasons: Record<string, string>;
  calendarSnapshot: PlanCalendarEntry[];
  isUnreadable: boolean;
}
