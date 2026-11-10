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
  | 'connection';

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
  createdAt: number;
  lastEditedAt: number | null;
}

export type CaptureStatus =
  'received' | 'interpreting' | 'sorted' | 'needsYou' | 'failed';

export type HeldReason =
  'offline' | 'aiUnavailable' | 'dailyLimit' | 'budgetReached' | 'recentLimit';

export type QuestionKind = 'couldNotRead' | 'moreToSort' | (string & {});

/** The readable state of one question; its words are sealed and never needed on the device. */
export interface QuestionState {
  kind: QuestionKind;
  shape: string;
  askedAt: number;
  answeredAt: number | null;
  skippedAt: number | null;
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
  createdAt: number;
  sortedAt: number | null;
  /** The page it was asked from; null from home and on turns made before pages could be asked about. */
  screen: ScreenContext | null;
  sealed: Sealed;
}

export interface CaptureSealed {
  text: string;
  reading: CaptureReading;
}

/** A turn after its words are opened; one that would not open keeps `isUnreadable` and empty words. */
export interface OpenCapture extends Omit<Capture, 'sealed'> {
  id: string;
  text: string;
  reading: CaptureReading;
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
  sealed: Sealed;
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
  'organize' | 'remember' | 'plan' | 'draft' | 'answer' | 'undo' | 'outbound';

/** 1 and 2 act inside Helm; 3 and 4 (acting outside without asking) are not built. */
export type AutonomyLevel = 1 | 2 | 3 | 4;

export interface EffectRef {
  /** `delete` appears only in the executions an undo writes. */
  op: 'create' | 'update' | 'delete';
  collection: string;
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
  /** Set when the connection ended and the copy was kept. */
  connectionEndedAt: number | null;
  deleteAfter: number | null;
  sealed: SyncedContent;
}
