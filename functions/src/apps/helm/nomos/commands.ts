import type { TerminalTool } from '../../../ai/modelProvider.js';
import {
  MAX_OBSERVATIONS_PER_TURN,
  OBSERVATION_KINDS,
  OBSERVATION_QUOTE_CAP,
  TURN_INTENTS,
} from './actNow.js';
import { OBSERVATION_TAGS } from './said.js';
import {
  QUESTIONS_MAX,
  QUESTION_CAP as TASK_QUESTION_CAP,
} from './questionsTask.js';
import { LEAD_QUESTIONS_MAX, type LeadQuestion } from './researchAhead.js';
import type { QuoteEntry } from './aliases.js';
import type { SyncedCopy } from '../syncedCopies.js';
import { toPlainText } from '../../../vendor/speechText.js';
import { SENSITIVE_CATEGORIES } from './sensitive.js';
import type { MomentPrecision } from '../../../vendor/yearlyDateUtils.js';
import type { ModelChange } from '../topicWrite.js';
import {
  WHY_CLEANED_CAP,
  WHY_SUMMARY_CAP,
  WHY_TAGS_CAP,
  WHY_VERBATIM_CAP,
} from '../goalWhy.js';
import { MEDIA_CAPTION_CAP } from '../media/mediaCaps.js';
import { KIN_KINDS, KIN_ORDERS, type WhoKin } from './kinKinds.js';
import { CONTACT_LABEL_CAP, CONTACT_VALUE_CAP } from './contactPoints.js';
import type { Cadence } from '../../../vendor/cadenceUtils.js';
import type { DayPart } from './habitDay.js';
import {
  CONNECTION_KINDS,
  CONNECTION_STATUSES,
  type ConnectionKind,
  type ConnectionRelation,
  type CoupleStatus,
} from './connections.js';

export type TaskDue =
  { kind: 'day'; date: number } | { kind: 'moment'; at: number };

export const MEETS_HOWS = ['inPerson', 'video', 'phone'] as const;
export type MeetsHow = (typeof MEETS_HOWS)[number];

/** What a task stores about how it meets; a missing or odd field reads as none. */
export const readMeets = (
  value: unknown,
): { how: MeetsHow; setBy: 'person' | 'calendar' } | null => {
  const entry = value as { how?: unknown; setBy?: unknown } | null | undefined;
  const how = MEETS_HOWS.find((known) => known === entry?.how);
  return how
    ? { how, setBy: entry?.setBy === 'calendar' ? 'calendar' : 'person' }
    : null;
};

export interface Token {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface DateSpan extends Token {
  due: TaskDue;
  /** How exactly the words said it: a bare year, a decade or a month with no day; null for a day or a time. */
  precision: Exclude<MomentPrecision, 'day'> | null;
}

export interface CaptureReading {
  people: Token[];
  places: Token[];
  documents: Token[];
  commands: Token[];
  isUrgent: boolean;
  dates: DateSpan[];
  addressedAs: Token | null;
}

export const COMMAND_KINDS = [
  'createTask',
  'updateTask',
  'completeTask',
  'remember',
  'planDay',
  'setCurrentPlace',
  'setWhereabouts',
  'noteFact',
  'setKeyDate',
  'removeKeyDate',
  'createProject',
  'setProjectRole',
  'addMilestone',
  'offerResearch',
  'createNote',
  'setPrivate',
] as const;

/** Commands that delete a record. A deleting command is kept only when its subject is still named once every closing phrase is taken out of the turn's words. */
export const DELETING_COMMANDS = ['removeKeyDate'] as const;

/** A terminal tool beside `file_results`: the turn only ends the conversation. It carries no command, so a close can never delete or change anything. */
export const CLOSE_CONVERSATION_TOOL: TerminalTool = {
  name: 'closeConversation',
  description:
    'Ends the conversation when the whole turn only says to stop or leave it ("ugh, doesn\'t matter", "forget the whole thing") and asks for nothing. kind is dismiss to drop what was pending, finish when it only wraps up. Call it instead of file_results.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind'],
    properties: {
      kind: { type: 'string', enum: ['dismiss', 'finish'] },
    },
  },
};

const MAX_CLOSE_WORDS = 8;

/** A model's close is accepted only for a turn this short; a longer turn is filed as usual. */
/** Whether a turn may end on the model's close: short, and naming no one, no place, no date and no command, so a request said alongside "doesn't matter" is filed. */
export const isShortEnoughToClose = (
  turnText: string,
  reading: CaptureReading,
) =>
  toPlainText(turnText).split(' ').filter(Boolean).length <= MAX_CLOSE_WORDS &&
  [reading.people, reading.places, reading.dates, reading.commands].every(
    (found) => found.length === 0,
  );

/** The kinds the reply may carry that change a topic; like a note, each is read from its own list and is no `NomosCommand`. */
export const TOPIC_COMMAND_KINDS = [
  'addToTopic',
  'reviseTopic',
  'moveTopic',
  'createParentTopic',
] as const;

/** The kinds the reply may carry that make or change a procedure; each is read from its own list and is no `NomosCommand`. */
export const PROCEDURE_COMMAND_KINDS = [
  'createProcedure',
  'reviseProcedure',
] as const;

export const PROCEDURE_STEPS_MAX = 60;
export const PROCEDURE_STEP_TEXT_CAP = 200;
export const PROCEDURE_STEP_DETAIL_CAP = 500;
export const PROCEDURE_TITLE_CAP = 80;
export const PROCEDURE_GROUPS_MAX = 12;
export const PROCEDURE_GROUP_NAME_CAP = 40;
export const PROCEDURE_SUMMARY_CAP = 200;

/** The kinds the reply may carry that start a run of a procedure or tick its steps; each is read from its own list and is no `NomosCommand`. */
export const RUN_COMMAND_KINDS = ['startRun', 'tickRun'] as const;

/** A spelled correction of a heard name; read from its own list and is no `NomosCommand`. */
export const SOUNDS_LIKE_COMMAND_KINDS = ['noteSoundsLike'] as const;

/** A phone number or email the person says for someone they have; read from its own list and is no `NomosCommand`. */
export const CONTACT_COMMAND_KINDS = ['addContactPoint'] as const;

/** Read from their own list; none is a `NomosCommand`. */
export const CONNECTION_COMMAND_KINDS = [
  'connect',
  'updateConnection',
  'disconnect',
] as const;

export const MAX_CONNECTIONS_PER_TURN = 3;

/** Why the person wants something taken back, read from their words. */
export const UNDO_REASONS = [
  'wrongThing',
  'wrongDetails',
  'tooHasty',
  'changedMind',
  'unclear',
] as const;

export type UndoReason = (typeof UNDO_REASONS)[number];

export const MAX_UNDO_OFFERS = 4;
export const UNDO_QUOTE_CAP = 200;

/** An offer to take back part or all of an earlier turn, read from the reply and still to be checked against the records. */
export interface UndoOffer {
  executionId: string;
  lineNumbers: number[] | 'all';
  reason: UndoReason;
  quote: string | null;
}

export const RUN_STEPS_MAX = 80;
export const RUN_EXTRA_MAX = 20;
export const RUN_EXTRA_TEXT_CAP = 200;
export const MAX_TICKS_PER_TURN = 20;

/** The kinds the reply may carry that make or change a scheduled action; each is read from its own list and is no `NomosCommand`. */
export const SCHEDULE_COMMAND_KINDS = [
  'scheduleAction',
  'changeScheduledAction',
] as const;

/** Read from its own list; the one kind that starts a live web look-up and is no `NomosCommand`. */
export const RESEARCH_COMMAND_KINDS = ['research'] as const;

export const RESEARCH_QUESTION_CAP = 400;
export const RESEARCH_SUBJECT_CAP = 60;
export const MAX_RESEARCH_PER_TURN = 1;

/** A look-up on the web the person asked for. `depth` is what they said ("look into it properly" is thorough), null when they didn't. */
export interface ResearchCommand {
  kind: 'research';
  question: string;
  subject: string;
  depth: 'light' | 'thorough' | null;
  /** True when the answer will feed a choice the person is making, which is when asking how deep is worth a question. */
  isDecision: boolean;
}

/** Read from their own lists: the kinds that save a question to learn later, put one off, relate two, offer a skill as a goal or offer a document's questions as a task. None is a `NomosCommand`. */
export const LEARN_COMMAND_KINDS = [
  'saveForLater',
  'declineLearn',
  'relatedLearn',
  'offerLearnGoal',
  'offerQuestionTask',
] as const;

export const LEARN_QUESTION_CAP = 400;
export const LEARN_SUBJECT_CAP = 60;
export const LEARN_CONTEXT_CAP = 60;
export const LEARN_NAME_CAP = 80;
export const MAX_SAVES_PER_TURN = 3;
export const LEARN_DECLINE_REASONS = [
  'timing',
  'lostInterest',
  'changedMind',
] as const;

export type LearnDeclineReason = (typeof LEARN_DECLINE_REASONS)[number];

/** A question the person wants to learn about later; `practise` says whether it is something to read up on, a skill to practise (a goal) or unclear, which code asks about. `quote` is the person's own words, kept only when the capture holds them. */
export interface SaveForLaterCommand {
  kind: 'saveForLater';
  question: string;
  subject: string;
  contextLine: string | null;
  needsLiveFacts: boolean;
  practise: 'read' | 'goal' | 'unclear';
  quote: string | null;
}

/** The person puts a saved question off (`timing`), lets it go (`lostInterest`) or asks for it differently (`changedMind`, the only one that carries words). `itemId` is the saved question it names. */
export interface DeclineLearnCommand {
  kind: 'declineLearn';
  itemId: string;
  reason: LearnDeclineReason;
  question: string | null;
  subject: string | null;
}

/** Two saved questions that are one subject, with the subject they would share. */
export interface RelatedLearnCommand {
  kind: 'relatedLearn';
  firstId: string;
  secondId: string;
  together: string;
}

/** A clear skill to practise ("learn piano"), offered as a goal. */
export interface OfferLearnGoalCommand {
  kind: 'offerLearnGoal';
  name: string;
  quote: string | null;
}

/** The meeting a task's questions are for, settled from a synced event that starts later. */
export interface QuestionsMeeting {
  syncedId: string;
  startAt: number;
  label: string;
}

/** Questions for someone found in a document read this turn, offered as a task. `documentKey` is a hash of the Drive file's stable key, so one document is offered once; `who` is the names the questions are for. */
export interface OfferQuestionsCommand {
  kind: 'offerQuestionTask';
  title: string;
  questions: string[];
  who: string[];
  /** The people the questions are for that the person already has, by id; new names are not here. */
  whoIds: string[];
  meeting: QuestionsMeeting | null;
  documentKey: string;
}

export type LearnCommand =
  | SaveForLaterCommand
  | DeclineLearnCommand
  | RelatedLearnCommand
  | OfferLearnGoalCommand
  | OfferQuestionsCommand;

/** What code asks when it cannot tell reading from practising: the words to save and the goal's name. */
export interface LearnAsk {
  question: string;
  subject: string;
  contextLine: string | null;
  needsLiveFacts: boolean;
  goalName: string | null;
}

export const SCHEDULE_CHANGES = [
  'skip',
  'move',
  'pause',
  'resume',
  'end',
  'reschedule',
] as const;

export const SCHEDULE_SCOPES = ['thisOne', 'thisAndFollowing'] as const;

export const SCHEDULE_FREQS = ['daily', 'weekly', 'monthly', 'yearly'] as const;

export const SCHEDULE_TITLE_CAP = 80;
export const SCHEDULE_INSTRUCTION_CAP = 400;
export const MAX_HELD_COMMANDS = 3;
export const MAX_SCHEDULE_COMMANDS_PER_TURN = 3;

/** The command kinds a scheduled run may write while only Helm's own kinds are allowed. */
export const SCHEDULED_OWN_KINDS = [
  'createTask',
  'updateTask',
  'planDay',
] as const;

/** Kinds that reach outside Helm; a scheduled action may not hold one until the approval queue exists. */
export const SCHEDULED_OUTBOUND_KINDS = [
  'addCalendarEvent',
  'sendMessage',
  'sendEmail',
] as const;

export const SCHEDULED_ALLOWED_ENUM = [
  ...SCHEDULED_OWN_KINDS,
  ...SCHEDULED_OUTBOUND_KINDS,
] as const;

export interface ScheduleRepeatRead {
  freq: (typeof SCHEDULE_FREQS)[number] | 'subDaily' | null;
  interval: number;
  weekdays: ('MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU')[];
  monthBy: 'day' | 'nthWeekday' | 'lastDay' | null;
  nth: 1 | 2 | 3 | 4 | -1 | null;
  endsKind: 'never' | 'on' | 'after';
  /** A day key. */
  until: string | null;
  count: number | null;
}

export interface HeldScheduleCommand {
  kind: (typeof SCHEDULED_ALLOWED_ENUM)[number];
  title: string | null;
}

/** Something the assistant does for the person at a set time. Dates and times come from the reading's spans, never the model's words. */
export interface ScheduleActionCommand {
  kind: 'scheduleAction';
  title: string;
  repeat: ScheduleRepeatRead;
  /** A day key; null means the first day the rule gives from today. */
  startsOn: string | null;
  /** Floating "HH:mm". */
  time: string | null;
  /** Every time of day the turn's words name, in order; what "at 8 and at 6" splits into. */
  times: string[];
  instruction: string | null;
  held: HeldScheduleCommand[];
  allowedKinds: string[];
  quote: string;
}

/** Skip, move, pause, resume, end or change one scheduled action, or the runs from one on. */
export interface ChangeScheduledActionCommand {
  kind: 'changeScheduledAction';
  actionId: string;
  scope: (typeof SCHEDULE_SCOPES)[number];
  change: (typeof SCHEDULE_CHANGES)[number];
  /** The original day key of the run named; null means the next run. */
  fromKey: string | null;
  /** A move's new day, and a reschedule's new first day. */
  toDay: string | null;
  time: string | null;
  repeat: ScheduleRepeatRead | null;
  quote: string;
}

/** The kinds the reply may carry that make or change a habit, tick it or mark it care; each is read from its own list and is no `NomosCommand`. */
export const HABIT_COMMAND_KINDS = [
  'createHabit',
  'updateHabit',
  'checkIn',
  'setCare',
] as const;

export const HABIT_PARTS = [
  'morning',
  'midday',
  'afternoon',
  'evening',
  'bedtime',
] as const;
export const HABIT_CADENCE_KINDS = [
  'everyDay',
  'onWeekdays',
  'timesPerWeek',
  'everyNDays',
] as const;
export const HABIT_CHANGES = [
  'pause',
  'resume',
  'end',
  'reschedule',
  'retire',
  'bringBack',
] as const;
export const HABIT_CHECK_DAYS = ['today', 'yesterday'] as const;
export const HABIT_CHECK_STATUSES = ['done', 'skipped'] as const;
export const HABIT_NAME_CAP = 60;
export const HABIT_LABEL_CAP = 30;
export const HABIT_WINDOWS_MAX = 4;
export const HABIT_TIMES_PER_DAY_MAX = 20;
export const ACTIVE_HABITS_MAX = 30;
export const HABIT_NOTE_CAP = 500;
export const HABIT_HISTORY_MAX = 30;
export const MAX_HABITS_PER_TURN = 3;
export const MAX_CHECKINS_PER_TURN = 10;
export const MAX_CARE_PER_TURN = 3;
export const MAX_HABIT_CANDIDATES = 4;
export const MAX_IMPORTANCE_PER_TURN = 3;
export const MAX_CONTEXT_IMPORTANCE = 30;

/** The kind the reply may carry that places a project or habit in the person's order of what matters; read from its own list and no `NomosCommand`. */
export const IMPORTANCE_COMMAND_KINDS = ['setImportance'] as const;

export const IMPORTANCE_RELATIONS = [
  'most',
  'above',
  'below',
  'same',
  'matters',
  'canWait',
  'clear',
] as const;

export const MAX_CONTEXT_HABITS = 30;

/** One window of a new or rescheduled habit: a named part of the day, or times from the reading; code settles both to "HH:mm". */
export interface HabitWindowRead {
  part: DayPart | null;
  start: string | null;
  end: string | null;
  label: string | null;
}

export interface CreateHabitCommand {
  kind: 'createHabit';
  name: string;
  emoji: string | null;
  cadence: Cadence;
  windows: HabitWindowRead[];
  timesPerDay: number | null;
  /** The who it is kept for; null is the person themself. */
  forWhoId: string | null;
  isCare: boolean;
  isPrivate: boolean;
  /** The words of the turn the habit was made from, for its dose and its private mark. */
  words: string;
}

export interface UpdateHabitCommand {
  kind: 'updateHabit';
  habitId: string;
  change: (typeof HABIT_CHANGES)[number];
  cadence: Cadence | null;
  windows: HabitWindowRead[] | null;
  /** Date-only: the day a pause ends. */
  until: number | null;
  requestQuote: string;
}

/** A tick, a "not today" or one more on a tally; `habitIds` holds the one habit named, or up to four the model could not choose between. */
export interface CheckInCommand {
  kind: 'checkIn';
  habitIds: string[];
  windowKey: string | null;
  day: (typeof HABIT_CHECK_DAYS)[number];
  status: (typeof HABIT_CHECK_STATUSES)[number];
  note: string | null;
}

export interface SetCareCommand {
  kind: 'setCare';
  habitId: string;
  isCare: boolean;
  requestQuote: string;
}

/** Built by code from the answer to "Which medicine is it?", never read from the model. */
export interface SetMedicineCommand {
  kind: 'setMedicine';
  habitId: string;
  name: string;
  dose: string | null;
}

/** One sentence about what matters: `subjectId` placed by `relation` to `otherId`, in words copied from the capture. A name no project has comes as `unknownName`. */
export interface SetImportanceCommand {
  kind: 'setImportance';
  subjectId: string | null;
  unknownName: string | null;
  relation: (typeof IMPORTANCE_RELATIONS)[number];
  otherId: string | null;
  words: string;
  until: number | null;
}

export type HabitCommand =
  | CreateHabitCommand
  | UpdateHabitCommand
  | CheckInCommand
  | SetCareCommand
  | SetMedicineCommand;

export const REMEMBER_FIELDS = ['startAt', 'endAt', 'place'] as const;

export type RememberField = (typeof REMEMBER_FIELDS)[number];

export const ANSWER_SCOPES = ['yourThings', 'theWorld', 'both'] as const;

export type AnswerScope = (typeof ANSWER_SCOPES)[number];

export const MENTION_KINDS = ['person', 'pet', 'organization'] as const;

export type MentionKind = (typeof MENTION_KINDS)[number];

/** The assistant's name until the person can rename it; a who never takes it. */
export const DEFAULT_ASSISTANT_NAME = 'Nomos';

export const MAX_COMMANDS = 20;
export const MAX_MENTIONS = 10;
export const MAX_PLACES = 5;
export const NAME_CAP = 80;
export const PLAN_DAY_AHEAD = 6;
export const MAX_EFFECTS = 40;
export const MAX_MEDIA_TARGETS = 3;
/** Most effects a whole turn records: its commands, then the people and places they name, the home effect and a photo's keeps. The device's undo reads every one in one transaction. */
export const MAX_EXECUTION_EFFECTS =
  MAX_EFFECTS + MAX_MENTIONS + MAX_PLACES + 1 + MAX_MEDIA_TARGETS;
export const MAX_MEDIA_TOPICS = 10;
export const TITLE_CAP = 200;
export const QUESTION_CAP = 200;
export const ANSWER_TEXT_CAP = 1_200;
export const MAX_QUOTES = 5;
export const QUOTE_CAP = 300;
export const STATEMENT_CAP = 500;
export const FACT_QUOTE_CAP = 280;
export const MAX_NOTED_FACTS = 5;
export const TOPIC_CAP = 40;
export const MAX_KEY_DATES = 5;
export const PROJECT_NAME_CAP = 80;
export const PROJECT_OBJECTIVE_CAP = 200;
export const PROJECT_ROLE_NOTE_CAP = 40;
export const MAX_PROJECT_ROLES = 5;
export const MAX_CONTEXT_PROJECTS = 20;
export const NOTE_TITLE_CAP = 80;
export const NOTE_BODY_CAP = 20_000;
export const NOTES_LIMIT = 1_000;
export const NOTE_TOPICS_CAP = 10;
export const MAX_NOTES_PER_TURN = 3;
export const MAX_TOPIC_ADDS_PER_TURN = 3;
export const MAX_TOPIC_ADD_CHARS = 2_000;
export const MAX_PARENT_CHILDREN = 20;
export const MIN_PARENT_CHILDREN = 2;
export const PARENT_NAME_CAP = 40;
export const MAX_CONTEXT_TOPICS = 100;
export const MAX_HINT_NOTES = 8;
export const NOTES_CONTEXT_CHARS = 6_000;
export const DIFFERS_SAYS_CAP = 80;
export const MILESTONE_TITLE_CAP = 80;
export const MAX_MILESTONES_PER_TURN = 3;
export const MAX_MILESTONES_PER_PROJECT = 30;
export const MAX_CONTEXT_MILESTONES = 10;
export const PROJECT_ROLES = ['key', 'involved'] as const;
export const KEY_DATE_LABEL_CAP = 60;
export const MAX_MOMENTS_PER_WHO = 500;
export const KEY_DATE_PRECISIONS = ['day', 'month', 'year', 'decade'] as const;
export const KEY_DATE_KINDS = [
  'birthday',
  'anniversary',
  'custom',
  'passedAway',
  'met',
  'adopted',
  'startedJob',
  'leftJob',
  'moved',
  'graduated',
] as const;

export type KeyDateKind = (typeof KEY_DATE_KINDS)[number];

/** Whether a kind is a one-time event; a custom date is one only when it does not come back. */
export const isMomentKind = (kind: KeyDateKind) =>
  kind !== 'birthday' && kind !== 'anniversary' && kind !== 'custom';
export const FACT_KINDS = [
  'world',
  'preference',
  'favorite',
  'identity',
] as const;

export type NoteFactKind = (typeof FACT_KINDS)[number];
export const VALUE_CAP = 80;
export const ANSWER_SPOKEN_CAP = 200;
export const REPLY_LINE_CAP = 80;
export const MAX_ASKS = 5;
export const MAX_OPEN_ASKED = 20;
export const OPTION_CAP = 80;
export const UNIT_CAP = 20;
export const NUMBER_LIMIT = 1e9;
export const FREE_TEXT_CAP = 500;

export const ASK_SHAPES = [
  'pickOne',
  'pickSeveral',
  'yesNo',
  'freeText',
  'dateTime',
  'pickRecord',
  'number',
] as const;

export type AskShape = (typeof ASK_SHAPES)[number];

export const ASK_RECORD_KINDS = ['who', 'place'] as const;

export const ASK_DATE_MODES = ['date', 'time', 'dateTime'] as const;

export interface AskOption {
  id: string;
  label: string;
  detail: string | null;
  ref: { collection: 'who' | 'places'; id: string } | null;
}

/** A question the model asked, checked by shape: the options carry their code-added closers and every record settled to a reference. */
export interface AskCommand {
  shape: AskShape;
  prompt: string;
  options: AskOption[];
  allowsSomethingElse: boolean;
  noneOption: boolean;
  recordKinds: (typeof ASK_RECORD_KINDS)[number][];
  dateMode: (typeof ASK_DATE_MODES)[number] | null;
  number: {
    min: number | null;
    max: number | null;
    unit: string | null;
    isMoney: boolean;
    decimals: 0 | 1 | 2;
  } | null;
  aboutRef: { collection: 'tasks'; id: string } | null;
}

/** A command whose every reference is settled: a task id from the context, a `$new` ref made in the same reply, or a due the reading made. */
export type NomosCommand =
  | {
      kind: 'createTask';
      ref: string;
      title: string;
      due: TaskDue | null;
      isUrgent: boolean;
      whoRefs: string[];
      placeRefs: string[];
      /** A project's name as the person said it; code matches it. */
      projectRef: string | null;
      /** Questions to ask someone, each one a step; empty for any other task. */
      questions: string[];
      meeting: QuestionsMeeting | null;
      /** People already settled by id, for a task made from an answer rather than a reply's mentions. */
      whoIds?: string[];
      /** How the task meets; absent or null means it was not said. */
      meetsHow?: MeetsHow | null;
    }
  | {
      kind: 'updateTask';
      taskId: string;
      title: string | null;
      due: TaskDue | null;
      hasDue: boolean;
      isUrgent: boolean | null;
      whoRefs: string[];
      placeRefs: string[];
      /** Absent leaves it as it is; null clears it. */
      meetsHow?: MeetsHow | null;
    }
  | { kind: 'completeTask'; taskId: string }
  | { kind: 'setPrivate'; taskId: string; isPrivate: boolean };

/** A person, pet or organization the reply names. */
export interface MentionRead {
  ref: string;
  name: string;
  kind: MentionKind;
  relation: string | null;
  species: string | null;
  organizationKind: string | null;
  /** The family word the person said for this one ("my sister Dana"), already checked against the fixed list. */
  kin?: WhoKin | null;
  /** A mention that is only a family word ("my younger brother"), settled by code against the people the person has. */
  kinRef?: WhoKin | null;
  /** The person this name may be another name of, as the model linked it; code asks before saving it. */
  proposedWhoId?: string | null;
}

/** A location the reply names, its ref `$p1`, `$p2`, …. */
export interface PlaceRead {
  ref: string;
  name: string;
}

/** A record an answer rests on, as stored with the answer. */
export type SourceRef =
  | { kind: 'task' | 'fact' | 'topic'; id: string }
  | {
      kind: 'note';
      id: string;
      title: string;
      topicPath: string | null;
      topicEmoji: string | null;
    }
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

/** One noted fact from a live lookup, its aliases resolved; the guards decide whether it is written. Null where an alias named nothing offered. */
export interface RememberCommand {
  statement: string | null;
  quote: QuoteEntry | null;
  about: SyncedCopy | null;
  aboutField: RememberField | null;
  value: string | null;
}

/** Something true about a person, pet, organization or place the capture named, its refs settled to the reply's mentions and places; code decides whether it is stated or inferred. */
export interface NoteFactCommand {
  statement: string;
  quote: string | null;
  isStated: boolean;
  whoRefs: string[];
  placeRefs: string[];
  kind: NoteFactKind;
  topic: string | null;
  value: string | null;
  isSensitive: boolean;
  isAboutMe: boolean;
  /** The id of a fact in context this one disagrees with, settled from the alias the model wrote. */
  contradicts: string | null;
}

/** A date for someone or the person, its month, day, year and precision settled from a resolved date span by code. */
export interface SetKeyDateCommand {
  kind: 'setKeyDate';
  whoRefs: string[];
  isAboutMe: boolean;
  /** The date being changed, settled from its alias; null adds one. */
  keyDateId: string | null;
  keyKind: KeyDateKind;
  label: string | null;
  /** A year or a decade has no month or day; a decade's year is its first. */
  date: {
    month: number | null;
    day: number | null;
    year: number | null;
  } | null;
  /** How exactly the span said the date; null when it gave none. */
  precision: MomentPrecision | null;
  comesBack: boolean | null;
  quote: string | null;
}

export interface RemoveKeyDateCommand {
  kind: 'removeKeyDate';
  keyDateId: string;
}

export type KeyDateCommand = SetKeyDateCommand | RemoveKeyDateCommand;

/** The person starts something with several steps; its date is date-only (UTC midnight). */
export interface CreateProjectCommand {
  kind: 'createProject';
  name: string;
  emoji: string | null;
  objective: string | null;
  targetDate: number | null;
  projectKind: 'project' | 'goal';
  /** For a goal only: the person's own words copied from the capture, and the model's tidy-up, summary and tags, each already cut. */
  why: {
    verbatim: string;
    cleaned: string | null;
    summary: string | null;
    tags: string[];
  } | null;
}

/** A person is key to or involved in a project, named by words code matches; it only raises a role. */
export interface SetProjectRoleCommand {
  kind: 'setProjectRole';
  projectRef: string;
  whoRefs: string[];
  role: (typeof PROJECT_ROLES)[number];
  note: string | null;
}

/** A dated point in a project, named by words code matches; its date is date-only (UTC midnight). */
export interface AddMilestoneCommand {
  kind: 'addMilestone';
  projectRef: string;
  title: string;
  date: number | null;
}

export const OFFER_SUBJECT_CAP = 60;
export const OFFER_QUESTION_CAP = 300;
export const OFFER_WHY_CAP = 120;
export const OFFER_LABEL_CAP = 40;
export const OFFER_OPTION_CAP = 40;
export const OFFER_OPTIONS_MAX = 8;
export const OFFER_FROM_CAP = 60;
export const OFFER_PREFILL_CAP = 200;
export const MAX_OFFERS_PER_TURN = 2;

/** A question the offer will ask before looking, as the model wrote it; code gives it its id. */
export type OfferQuestionInput = Omit<LeadQuestion, 'id'>;

/** Research to offer ahead of a project's date, from the project's date and what needs finding out first; the offer's words are sealed on the project. */
export interface OfferResearchCommand {
  kind: 'offerResearch';
  projectRef: string;
  subject: string;
  question: string;
  whyNow: string | null;
  leadDays: number;
  isDecision: boolean;
  questions: OfferQuestionInput[];
}

export type ProjectCommand =
  | CreateProjectCommand
  | SetProjectRoleCommand
  | AddMilestoneCommand
  | OfferResearchCommand;

/** Something general to remember that is about no person, pet, place or project, its topics settled to ids of ones the person already has. */
export interface CreateNoteCommand {
  kind: 'createNote';
  title: string;
  body: string;
  topicIds: string[];
}

/** A new part for a topic's document, written from a note this turn makes (`noteIndex` is its place among the turn's notes), put after one part or at the end. */
export interface AddToTopicCommand {
  kind: 'addToTopic';
  topicId: string;
  noteIndex: number;
  afterSectionId: string | null;
  heading: string | null;
  markdown: string;
}

/** A change to a topic's document the person asked for in words, checked against the version the model read. */
export interface ReviseTopicCommand {
  kind: 'reviseTopic';
  topicId: string;
  changes: ModelChange[];
  changeSummary: string;
  requestQuote: string;
  seenVersion: number;
}

/** A topic goes under another, or to the top level when `parentId` is null. */
export interface MoveTopicCommand {
  kind: 'moveTopic';
  topicId: string;
  parentId: string | null;
}

/** Topics gathered under a new parent; `isAsked` is true only when the person's words asked for it. */
export interface CreateParentTopicCommand {
  kind: 'createParentTopic';
  name: string;
  childIds: string[];
  isAsked: boolean;
}

export type TopicCommand =
  | AddToTopicCommand
  | ReviseTopicCommand
  | MoveTopicCommand
  | CreateParentTopicCommand;

/** One step of a procedure as the model wrote it; a step with an id is one already there, kept by id. */
export interface ModelProcedureStep {
  stepId: string | null;
  text: string;
  detail: string | null;
  group: string | null;
}

/** A new procedure from the person's words, or from the focused task's steps when `fromTaskId` is set (the model's steps are then ignored); `isTruncated` is true when steps past the cap were cut. */
export interface CreateProcedureCommand {
  kind: 'createProcedure';
  title: string;
  steps: ModelProcedureStep[];
  fromTaskId: string | null;
  requestQuote: string;
  isTruncated: boolean;
}

/** A change to a procedure the person asked for in words: its whole new list of steps, checked against the version the model read; `isOverCap` is true when the list passes the cap. */
export interface ReviseProcedureCommand {
  kind: 'reviseProcedure';
  procedureId: string;
  title: string | null;
  steps: ModelProcedureStep[];
  changeSummary: string;
  requestQuote: string;
  seenVersion: number;
  isOverCap: boolean;
}

/** A make request for a task that already has a procedure; it makes nothing and only says so. */
export interface ProcedureExistsCommand {
  kind: 'procedureExists';
  title: string;
}

export type ProcedureCommand =
  CreateProcedureCommand | ReviseProcedureCommand | ProcedureExistsCommand;

/** A new run of a procedure, for a synced trip or event (`about`), a project named in words (`projectRef`), or for nothing; a synced copy wins over a project. */
export interface StartRunCommand {
  kind: 'startRun';
  procedureId: string;
  about: SyncedCopy | null;
  projectRef: string | null;
  requestQuote: string;
}

/** Steps of open runs the person said are done; each is one the context listed as not yet done. */
export interface TickRunCommand {
  kind: 'tickRun';
  steps: { runId: string; stepId: string }[];
  requestQuote: string;
}

export type RunCommand = StartRunCommand | TickRunCommand;

/** How a spelled correction names the heard form and the person it belongs to. */
export interface NoteSoundsLikeCommand {
  kind: 'noteSoundsLike';
  whoId: string;
  heardSpan: string;
}

/** A number or address said for a person, with the word the person used for it. */
export interface AddContactPointCommand {
  kind: 'addContactPoint';
  whoId: string;
  contactKind: 'phone' | 'email';
  value: string;
  /** Null when none was said; the plan files it as Other. */
  label: string | null;
}

/** `firstWhoId` is `relation` to `secondWhoId` ("Joan is Dana's mother"); a null id is the person themself; `since` is date-only. */
export interface ConnectCommand {
  kind: 'connect';
  firstWhoId: string | null;
  secondWhoId: string | null;
  connectionKind: ConnectionKind;
  relation: ConnectionRelation | null;
  status: CoupleStatus | null;
  since: number | null;
  requestQuote: string;
}

/** A null part is left as it is. */
export interface UpdateConnectionCommand {
  kind: 'updateConnection';
  firstWhoId: string | null;
  secondWhoId: string | null;
  /** Null names the only shown link the pair has. */
  connectionKind: ConnectionKind | null;
  relation: ConnectionRelation | null;
  status: CoupleStatus | null;
  since: number | null;
  requestQuote: string;
}

export interface DisconnectCommand {
  kind: 'disconnect';
  firstWhoId: string | null;
  secondWhoId: string | null;
  connectionKind: ConnectionKind | null;
  requestQuote: string;
}

export type ConnectionCommand =
  ConnectCommand | UpdateConnectionCommand | DisconnectCommand;

/** A request to lay out one day, its date already settled to a calendar day in the person's zone; the device makes the plan, so it files no effect. */
export interface PlanDayCommand {
  kind: 'planDay';
  date: Extract<TaskDue, { kind: 'day' }>;
}

/** The person said they are home; the device's profile holds it for a few hours. Only home can be said so. */
export interface SetCurrentPlaceCommand {
  kind: 'setCurrentPlace';
  place: 'home';
}

export const WHEREABOUTS_CHANGES = ['home', 'away', 'back'] as const;

export const WHEREABOUTS_CITY_CAP = 60;
export const WHEREABOUTS_LABEL_CAP = 60;

/** Where someone lives, or where they will be for some days, or that the person is back: a who (null is the person themself), a city name code looks up, and dates taken from the reading's date spans. */
export interface SetWhereaboutsCommand {
  kind: 'setWhereabouts';
  whoId: string | null;
  change: (typeof WHEREABOUTS_CHANGES)[number];
  cityName: string | null;
  /** Date-only, inclusive; away only. */
  from: number | null;
  to: number | null;
  label: string | null;
  quote: string;
}

/** The model's answer to a question, every source alias already resolved; the guards decide what of it is kept. */
export interface AnswerCommand {
  scope: AnswerScope;
  question: string;
  isHealth: boolean;
  fromRecordsText: string | null;
  sources: SourceRef[];
  quotes: QuoteEntry[];
  syncedKeys: string[];
  generalText: string | null;
  generalSpoken: string | null;
  /** Notes the answer cites, resolved from the context's note aliases. */
  noteIds: string[];
  differsFromNoteId: string | null;
  differsSays: string | null;
  suggestedTopicId: string | null;
}

const NAMED_BY_REF = (name: string) => ({
  type: ['array', 'null'],
  items: { type: 'string' },
  description: name,
});

const nullable = (type: string, description: string) => ({
  type: [type, 'null'],
  description,
});

const KIN_SCHEMA = (description: string) => ({
  type: ['object', 'null'],
  description,
  additionalProperties: false,
  required: ['kind', 'order'],
  properties: {
    kind: { type: 'string', enum: KIN_KINDS.map((entry) => entry.kind) },
    order: { type: ['string', 'null'], enum: [...KIN_ORDERS, null] },
  },
});

/** A record a photo may be kept on: an existing one by id, or a task this reply makes by its `$new` ref. */
export interface MediaTarget {
  kind: 'task' | 'fact';
  ref: string;
}

/** What code accepts of the model's word on one photo: a keep always has a target. */
export interface MediaDecision {
  alias: string;
  decision: 'keep' | 'discard';
  caption: string | null;
  targets: MediaTarget[];
  /** A Markdown file only: kept as a note, and as a topic too when `asTopic`. */
  asNote: boolean;
  asTopic: boolean;
  /** The topics the note is filed to, as ids. */
  topicIds: string[];
}

/** One flat object per command, every field required and nullable; sent non-strict (too many nullable fields for strict mode), so `normalizeNomosReply` checks the reply's shape. */
export const buildFileResultsTool = ({
  isLearningOn,
}: {
  isLearningOn: boolean;
}): TerminalTool => ({
  name: 'file_results',
  description:
    'Files what the capture asks for as commands. Call it once, last, with every command.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'commands', 'replyLine'],
    properties: {
      intent: {
        type: 'string',
        enum: [...TURN_INTENTS],
        description:
          'question: the person asks something and your answer command answers it. request: the person asks you to do something. remark: the person only says how things are going or went, asking for nothing.',
      },
      ...(isLearningOn
        ? {
            observations: {
              type: 'array',
              description: `At most ${MAX_OBSERVATIONS_PER_TURN}. What the person said about how a habit, project, task or their day felt or went, only when they said it themselves. Never a guess, a diagnosis or a mood they did not name. Empty when they said nothing of the kind.`,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['aboutAlias', 'kind', 'tags', 'quote'],
                properties: {
                  aboutAlias: nullable(
                    'string',
                    'The habit (h1…), project (p1…) or task (t1…) it is about; null when it is about their day.',
                  ),
                  kind: { type: 'string', enum: [...OBSERVATION_KINDS] },
                  tags: {
                    type: 'array',
                    description: '1 to 3 from the list.',
                    items: { type: 'string', enum: [...OBSERVATION_TAGS] },
                  },
                  quote: {
                    type: 'string',
                    description: `The person's own words, copied exactly from the turn, at most ${OBSERVATION_QUOTE_CAP} characters.`,
                  },
                },
              },
            },
          }
        : {}),
      media: {
        type: 'array',
        description:
          'One entry for each photo, PDF or Markdown file in <attachments>, none for a turn with none. Keep one only when it is worth seeing again on a task or a fact; otherwise discard it. A recording is never listed.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'alias',
            'decision',
            'caption',
            'attachTo',
            'asNote',
            'asTopic',
            'topicAliases',
          ],
          properties: {
            alias: {
              type: 'string',
              description: 'An attachment alias such as m1.',
            },
            decision: { type: 'string', enum: ['keep', 'discard'] },
            caption: nullable(
              'string',
              `keep: one plain line saying what the photo shows, at most ${MEDIA_CAPTION_CAP} characters; null for discard.`,
            ),
            attachTo: {
              type: 'array',
              description: `keep: at most ${MAX_MEDIA_TARGETS} of a task alias from <open_tasks>, a $new ref of a createTask in this reply, or a fact alias from <known_facts>; empty for discard or for a file kept as a note or topic.`,
              items: { type: 'string' },
            },
            asNote: {
              type: 'boolean',
              description:
                'Markdown file only: keep its text as a note. false for anything else.',
            },
            asTopic: {
              type: 'boolean',
              description:
                'Markdown file only: also make a topic from it. Only when the person asks for a topic or the file plainly is a document to keep. false for anything else.',
            },
            topicAliases: {
              type: 'array',
              description: `Markdown file kept as a note: at most ${MAX_MEDIA_TOPICS} topic aliases from <your_topics> to file the note to; empty otherwise.`,
              items: { type: 'string' },
            },
          },
        },
      },
      commands: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'kind',
            'ref',
            'taskAlias',
            'title',
            'dueSpanId',
            'isUrgent',
            'meetsHow',
            'isPrivate',
            'scope',
            'question',
            'isHealth',
            'fromRecordsText',
            'sourceAliases',
            'quoteAliases',
            'generalText',
            'generalSpoken',
            'differsFromNoteAlias',
            'differsSays',
            'suggestedTopicAlias',
            'statement',
            'quoteAlias',
            'aboutAlias',
            'aboutField',
            'value',
            'whoRefs',
            'placeRefs',
            'place',
            'change',
            'cityName',
            'fromSpanId',
            'toSpanId',
            'labelSpanId',
            'shape',
            'prompt',
            'options',
            'allowsSomethingElse',
            'recordKinds',
            'dateMode',
            'numberMin',
            'numberMax',
            'unit',
            'isMoney',
            'decimals',
            'quote',
            'isStated',
            'factKind',
            'topic',
            'isSensitive',
            'isAboutMe',
            'contradicts',
            'keyDateAlias',
            'keyDateKind',
            'keyDateLabel',
            'dateSpanId',
            'comesBack',
            'projectRef',
            'projectEmoji',
            'objective',
            'projectKind',
            'whyQuote',
            'whyCleaned',
            'whySummary',
            'whyTags',
            'role',
            'roleNote',
            'bodyQuote',
            'topicAliases',
            'topicAlias',
            'parentAlias',
            'childAliases',
            'noteRef',
            'afterSectionAlias',
            'heading',
            'markdown',
            'changeSummary',
            'requestQuote',
            'topicChanges',
            'procedureAlias',
            'procedureSteps',
            'fromTaskAlias',
            'runStepAliases',
            'whoAlias',
            'heardSpan',
            'contactKind',
            'contactValue',
            'contactLabel',
            'otherWhoAlias',
            'connectionKind',
            'connectionRelation',
            'coupleStatus',
            'habitAlias',
            'cadence',
            'windows',
            'timesPerDay',
            'isCare',
            'habitChange',
            'windowKey',
            'candidateAliases',
            'checkDay',
            'checkStatus',
            'subjectAlias',
            'otherAlias',
            'importanceRelation',
            'subjectName',
            'repeat',
            'startsSpanId',
            'timeSpanId',
            'instruction',
            'heldCommands',
            'allowedKinds',
            'actionAlias',
            'undoTurn',
            'undoLines',
            'undoReason',
            'undoQuote',
            'offerSubject',
            'offerQuestion',
            'offerWhyNow',
            'offerLeadDays',
            'offerIsDecision',
            'offerQuestionTask',
            'researchQuestion',
            'researchSubject',
            'researchDepth',
            'researchIsDecision',
            'learnQuestion',
            'learnSubject',
            'learnContext',
            'learnNeedsLiveFacts',
            'learnPractise',
            'learnQuote',
            'learnAlias',
            'learnOtherAlias',
            'learnTogether',
            'learnReason',
            'learnGoalName',
            'questions',
          ],
          properties: {
            kind: {
              type: 'string',
              enum: [
                ...COMMAND_KINDS,
                ...TOPIC_COMMAND_KINDS,
                ...PROCEDURE_COMMAND_KINDS,
                ...RUN_COMMAND_KINDS,
                ...SCHEDULE_COMMAND_KINDS,
                ...RESEARCH_COMMAND_KINDS,
                ...LEARN_COMMAND_KINDS,
                ...HABIT_COMMAND_KINDS,
                ...IMPORTANCE_COMMAND_KINDS,
                ...SOUNDS_LIKE_COMMAND_KINDS,
                ...CONTACT_COMMAND_KINDS,
                ...CONNECTION_COMMAND_KINDS,
                'offerUndo',
                'answer',
                'ask',
              ],
            },
            ref: nullable(
              'string',
              'createTask: a name for the new task such as $new1, so a later command can point at it; null otherwise.',
            ),
            taskAlias: nullable(
              'string',
              'updateTask, completeTask and setPrivate: the alias of an open task from the context or a search result, or a $new ref from this reply; null for createTask.',
            ),
            title: nullable(
              'string',
              `createTask: the task in plain words, keeping every @, # and ^ name from the capture as written. updateTask: the new title, or null to keep it. createProject: its name the way the person said it, at most 80 characters. addMilestone: the milestone in the person's words, at most ${MILESTONE_TITLE_CAP} characters. createNote: a short name for the note, at most ${NOTE_TITLE_CAP} characters. createParentTopic: the new topic's name, at most ${PARENT_NAME_CAP} characters. createProcedure: the procedure's name, at most ${PROCEDURE_TITLE_CAP} characters. reviseProcedure: the new name, or null to keep it. createHabit: the habit's name ("Evening pills", "Water"), at most ${HABIT_NAME_CAP} characters. offerQuestionTask: the task's name ("Questions for Priya and Sam").`,
            ),
            dueSpanId: nullable(
              'string',
              "The id of a date span from the reading that gives this task its day, the day to plan for planDay (null means today), the project's target date for createProject, or the date of an addMilestone (null when it has none). Never write a date yourself.",
            ),
            isUrgent: nullable(
              'boolean',
              'true when the capture marks this task urgent; null to leave it as it is.',
            ),
            meetsHow: {
              type: ['string', 'null'],
              enum: [...MEETS_HOWS, null],
              description:
                'createTask and updateTask: inPerson, video or phone only when the person says how that meeting or call happens; null for every other kind and whenever it is not said.',
            },
            isPrivate: nullable(
              'boolean',
              'setPrivate: true to keep the task private, false only when the person asks to stop keeping it private. createHabit: true only when the person asks to keep the habit private; null for every other kind.',
            ),
            scope: nullable(
              'string',
              `answer: yourThings when the question is about the person's own plans, people, tasks or things; theWorld when it asks about the world; both when the records answer part and the world the rest. null for every other kind.`,
            ),
            question: nullable(
              'string',
              `answer: the question in the person's words, at most ${QUESTION_CAP} characters.`,
            ),
            isHealth: nullable(
              'boolean',
              'answer: true when the question is about health or medicine.',
            ),
            fromRecordsText: nullable(
              'string',
              `answer: what the person's records say, at most ${ANSWER_TEXT_CAP} characters; null when they say nothing about it.`,
            ),
            sourceAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description:
                'answer: the alias of every record fromRecordsText rests on, from the open tasks, the synced records or a tool result.',
            },
            quoteAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: `answer: the alias (q1, q2, …) of each email fromRecordsText rests on, from search_mail, at most ${MAX_QUOTES}. The quote shown is copied from the email by code.`,
            },
            generalText: nullable(
              'string',
              `answer: general knowledge about the world, at most ${ANSWER_TEXT_CAP} characters, only for what the records do not say and never about the person's own plans, people or things.`,
            ),
            generalSpoken: nullable(
              'string',
              `answer: generalText as one plain spoken sentence, at most ${ANSWER_SPOKEN_CAP} characters.`,
            ),
            differsFromNoteAlias: nullable(
              'string',
              'answer: the alias of a note in related_notes that generalText disagrees with; null when it disagrees with none.',
            ),
            differsSays: nullable(
              'string',
              `answer: what that note says on the point, at most ${DIFFERS_SAYS_CAP} characters; null with no differsFromNoteAlias.`,
            ),
            suggestedTopicAlias: nullable(
              'string',
              'answer: the alias of the one topic in your_topics generalText plainly belongs in, for keeping it; null when none plainly fits.',
            ),
            statement: nullable(
              'string',
              `remember: one plain sentence for what an email says that differs from a calendar event, at most ${STATEMENT_CAP} characters. noteFact: the fact as one plain sentence ("Dana is the florist"), at most ${STATEMENT_CAP} characters; null for every other kind.`,
            ),
            quoteAlias: nullable(
              'string',
              "remember: the alias of the email from search_mail that says it; it must also be in the answer's quoteAliases. offerQuestionTask: the quote alias read_document gave a passage of the document that lists the questions; null for every other kind.",
            ),
            aboutAlias: nullable(
              'string',
              'remember: the alias (e1, e2, …) of the calendar event the email disagrees with. ask: the alias of the open task the question is about, or null. startRun: the alias (e1, s1, …) of the trip or event in <synced_records> the run is for, only when the person names it. createTask and offerQuestionTask: the alias (e1…) of the meeting in <synced_records> these questions are for; null otherwise.',
            ),
            aboutField: {
              type: ['string', 'null'],
              enum: [...REMEMBER_FIELDS, null],
              description:
                'remember: which part of that event the email gives differently; null for every other kind.',
            },
            value: nullable(
              'string',
              `remember: what the email says for that part, as it should read ("2:00 PM"), at most ${VALUE_CAP} characters. noteFact: the preferred or favorite thing ("Shell", "Arrival"), at most ${VALUE_CAP} characters; null otherwise.`,
            ),
            whoRefs: NAMED_BY_REF(
              'createTask, updateTask and noteFact: the ref ($w1, …) of each entry in mentions this task or fact is about; offerQuestionTask: the people the questions are for; setProjectRole: the people given the role; null or empty when none.',
            ),
            placeRefs: NAMED_BY_REF(
              'createTask, updateTask and noteFact: the ref ($p1, …) of each entry in places this task or fact is about; null or empty when none.',
            ),
            place: {
              type: ['string', 'null'],
              enum: ['home', null],
              description:
                'setCurrentPlace: home, when the person says they are home or just got home; null for every other kind.',
            },
            change: {
              type: ['string', 'null'],
              enum: [...WHEREABOUTS_CHANGES, ...SCHEDULE_CHANGES, null],
              description:
                'changeScheduledAction: skip or move one run, pause, resume or end the action, or reschedule it (a new repeat or time). setWhereabouts: home for where someone lives ("Priya lives in Leavenworth"), away for where someone will be or is for some days ("I\'m in Lisbon Dec 2 to 9"), back when the person says they are back home from being away; null for every other kind.',
            },
            cityName: nullable(
              'string',
              `setWhereabouts home and away: the city as said, without the state or country unless said, at most ${WHEREABOUTS_CITY_CAP} characters; null for back and every other kind.`,
            ),
            fromSpanId: nullable(
              'string',
              'setWhereabouts away: the id of the date span in the reading that gives the first day. Never write a date yourself.',
            ),
            toSpanId: nullable(
              'string',
              'setWhereabouts away: the id of the date span that gives the last day; null for a single day.',
            ),
            labelSpanId: nullable(
              'string',
              'setWhereabouts away: the id of a place or person token in the reading that says where in the city the person is staying ("my sister\'s"); null when none.',
            ),
            shape: {
              type: ['string', 'null'],
              enum: [...ASK_SHAPES, null],
              description:
                'ask: the kind of answer wanted; null for every other kind.',
            },
            prompt: nullable(
              'string',
              `ask: the question in plain words, at most ${QUESTION_CAP} characters, no Markdown or links.`,
            ),
            options: {
              type: ['array', 'null'],
              description:
                'ask: the choices for pickOne (2 to 6), pickSeveral (2 to 8) and pickRecord (people or places already in the records); null or empty for the other shapes. Never add "None of these", "Yes", "No" or "Someone new": they are added for you.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'detail', 'recordAlias'],
                properties: {
                  label: {
                    type: 'string',
                    description: `The choice in plain words, at most ${OPTION_CAP} characters.`,
                  },
                  detail: nullable(
                    'string',
                    `What tells it apart, at most ${OPTION_CAP} characters; null when nothing does.`,
                  ),
                  recordAlias: nullable(
                    'string',
                    'pickRecord: the alias of the person or place this choice is; null otherwise.',
                  ),
                },
              },
            },
            allowsSomethingElse: nullable(
              'boolean',
              'ask pickOne: true when the choices may not cover what the person means, so a "Something else" answer is offered.',
            ),
            recordKinds: {
              type: ['array', 'null'],
              items: { type: 'string', enum: [...ASK_RECORD_KINDS, 'project'] },
              description:
                'ask pickRecord: who the question searches, who for people, pets and organizations and place for places; null otherwise.',
            },
            dateMode: {
              type: ['string', 'null'],
              enum: [...ASK_DATE_MODES, null],
              description:
                'ask dateTime: date, time or dateTime; null otherwise.',
            },
            numberMin: nullable(
              'number',
              'ask number: the smallest sensible answer, or null. In dollars when isMoney.',
            ),
            numberMax: nullable(
              'number',
              'ask number: the largest sensible answer, or null. In dollars when isMoney.',
            ),
            unit: nullable(
              'string',
              `ask number: the unit after the figure ("nights"), at most ${UNIT_CAP} characters; null when none.`,
            ),
            isMoney: nullable(
              'boolean',
              'ask number: true when the answer is an amount of money.',
            ),
            decimals: nullable(
              'number',
              'ask number: 0, 1 or 2 digits after the point; null for whole numbers.',
            ),
            quote: nullable(
              'string',
              `noteFact, setWhereabouts, scheduleAction and changeScheduledAction: the person's exact words from the capture that say it, at most ${FACT_QUOTE_CAP} characters; null when none. checkIn: only words said with the tick ("felt dizzy"), copied exactly, at most ${HABIT_NOTE_CAP} characters; null when none.`,
            ),
            isStated: nullable(
              'boolean',
              'noteFact: true only when the person said it outright; false when it is read between the lines.',
            ),
            factKind: {
              type: ['string', 'null'],
              enum: [...FACT_KINDS, null],
              description:
                'noteFact: preference for what someone usually picks ("I always go to Shell for gas"), favorite for a favorite ("my favorite movie is Arrival"), identity for who someone is ("I\'m vegan", "Dana is allergic to nuts"), world for anything else; null for every other kind.',
            },
            topic: nullable(
              'string',
              `noteFact: a preference or favorite's subject in one or two lowercase words ("gas station", "movies"), at most ${TOPIC_CAP} characters; null otherwise.`,
            ),
            isSensitive: nullable(
              'boolean',
              `noteFact: true when it is about ${SENSITIVE_CATEGORIES.join(', ')}; false otherwise.`,
            ),
            isAboutMe: nullable(
              'boolean',
              'noteFact: true when it is about the person talking ("I", "my"); false when it is about someone or something else. setKeyDate: true only when the date is the person\'s own; "my mum\'s birthday" is about Mum, so false with Mum in whoRefs.',
            ),
            keyDateAlias: nullable(
              'string',
              'setKeyDate: the alias of a date in <key_dates> being changed; null to add a new one. removeKeyDate: the alias of the date to remove.',
            ),
            keyDateKind: {
              type: ['string', 'null'],
              enum: [...KEY_DATE_KINDS, null],
              description:
                'setKeyDate: birthday or anniversary; met, moved, startedJob, leftJob, graduated, adopted or passedAway for one-time events; custom for any other date ("gotcha day", "lived in Lisbon"); null for every other kind.',
            },
            keyDateLabel: nullable(
              'string',
              `setKeyDate: the name of a custom date ("Gotcha day"), at most ${KEY_DATE_LABEL_CAP} characters; null otherwise.`,
            ),
            dateSpanId: nullable(
              'string',
              'setKeyDate: the id of the date span in the reading that gives the date; updateHabit pause: the date span of the day it comes back, or null; connect and updateConnection for a couple: the date span of when they got together, got engaged or got married, or null. Never write a date yourself.',
            ),
            comesBack: nullable(
              'boolean',
              'setKeyDate custom only: true when the date comes back each year; false for a one-time event.',
            ),
            projectRef: nullable(
              'string',
              'createTask: the name of the project from <open_projects> (or one this reply creates) that the task is a step of, only when the person says so ("for the wedding"). setProjectRole, addMilestone and offerResearch: the name of the project. startRun: the name of the project from <open_projects> the run is for, only when the person names it and no trip or event. null otherwise.',
            ),
            projectEmoji: nullable(
              'string',
              'createProject and createHabit: one emoji that fits it; null when none does.',
            ),
            objective: nullable(
              'string',
              `createProject: what done looks like in one plain sentence, only when said, at most ${PROJECT_OBJECTIVE_CAP} characters; null otherwise.`,
            ),
            projectKind: {
              type: ['string', 'null'],
              enum: ['project', 'goal', null],
              description:
                'createProject: goal for something the person wants to grow into or become ("get back into guitar", "be a calmer parent") that has no finish line; project for something with steps that ends; null means project.',
            },
            whyQuote: nullable(
              'string',
              `createProject goal only: the exact words from <capture> where the person says why it matters to them ("I miss playing"), copied as written, at most ${WHY_VERBATIM_CAP} characters; null when they gave no reason. Never write or invent a reason.`,
            ),
            whyCleaned: nullable(
              'string',
              `createProject goal only: whyQuote with punctuation and grammar tidied and nothing added or dropped, at most ${WHY_CLEANED_CAP} characters; null when there is no whyQuote.`,
            ),
            whySummary: nullable(
              'string',
              `createProject goal only: one short line that sums up whyQuote, at most ${WHY_SUMMARY_CAP} characters; null when there is no whyQuote.`,
            ),
            whyTags: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: `createProject goal only: up to ${WHY_TAGS_CAP} short lowercase tags for the why ("music", "calm"); null when there is no whyQuote.`,
            },
            role: {
              type: ['string', 'null'],
              enum: [...PROJECT_ROLES, null],
              description:
                'setProjectRole: key for someone the project depends on ("Dana is key for the wedding", "Dana is doing the flowers"); involved for someone who is part of it ("add Maya to the move"); null for every other kind.',
            },
            roleNote: nullable(
              'string',
              `setProjectRole: what the person does in it, in a word or two ("florist"), only when said, at most ${PROJECT_ROLE_NOTE_CAP} characters; null otherwise.`,
            ),
            contradicts: nullable(
              'string',
              'noteFact: the alias of a fact above that this one disagrees with ("centerpieces are $2,100 now" against "centerpieces are $1,800"); null when it adds to it.',
            ),
            bodyQuote: nullable(
              'string',
              `createNote: the words to keep, copied exactly from the capture, at most ${NOTE_BODY_CAP} characters.`,
            ),
            topicAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description:
                'createNote: the alias of each topic in <your_topics> the note plainly belongs in; empty when none fits. Never invent one.',
            },
            topicAlias: nullable(
              'string',
              "addToTopic, reviseTopic, moveTopic: the alias of the topic in <your_topics> (the open topic is <topic_document>'s topic); createParentTopic: null.",
            ),
            parentAlias: nullable(
              'string',
              'moveTopic: the alias of the topic it goes under; null puts it at the top level.',
            ),
            childAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: `createParentTopic: the alias of each of the ${MIN_PARENT_CHILDREN} to ${MAX_PARENT_CHILDREN} topics that go under it; the new parent's name is title.`,
            },
            noteRef: nullable(
              'string',
              'addToTopic: the ref ($note1 for the first createNote of this reply, $note2 for the second) of the note this part is written from; the note must be filed to the same topic.',
            ),
            afterSectionAlias: nullable(
              'string',
              'addToTopic: the alias (s1, s2, …) of the part of <topic_document> the new part goes after; null puts it at the end.',
            ),
            heading: nullable(
              'string',
              "addToTopic: the new part's heading, or null.",
            ),
            markdown: nullable(
              'string',
              `addToTopic: the new part in the note's own words, at most ${MAX_TOPIC_ADD_CHARS} characters.`,
            ),
            changeSummary: nullable(
              'string',
              'reviseTopic and reviseProcedure: what changed, in plain words, at most 200 characters.',
            ),
            requestQuote: nullable(
              'string',
              'reviseTopic, reviseProcedure, createProcedure, startRun, tickRun, setPrivate, setCare, setImportance, updateHabit, connect, updateConnection and disconnect: the words of the capture that ask for it, copied exactly.',
            ),
            topicChanges: {
              type: ['array', 'null'],
              description:
                'reviseTopic: at most 8 changes to the parts of <topic_document>. Never change a part whose writtenBy is "person" unless the request names it.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'kind',
                  'sectionAlias',
                  'sectionAliases',
                  'afterSectionAlias',
                  'heading',
                  'level',
                  'markdown',
                ],
                properties: {
                  kind: {
                    type: 'string',
                    enum: ['replace', 'merge', 'remove', 'reorder', 'retitle'],
                  },
                  sectionAlias: nullable(
                    'string',
                    "replace, retitle: the part's alias; null otherwise.",
                  ),
                  sectionAliases: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'merge: the parts to join; remove: the parts to take out; reorder: every part in the new order; [] otherwise.',
                  },
                  afterSectionAlias: nullable('string', 'Always null.'),
                  heading: nullable('string', 'The new heading, or null.'),
                  level: {
                    type: ['integer', 'null'],
                    enum: [1, 2, 3, null],
                    description: 'The new heading level, or null to keep it.',
                  },
                  markdown: nullable(
                    'string',
                    'replace, merge: the new words; null otherwise.',
                  ),
                },
              },
            },
            procedureAlias: nullable(
              'string',
              "reviseProcedure and startRun: the alias of the procedure in <your_procedures> (the open procedure is <procedure_open>'s procedure); null otherwise.",
            ),
            procedureSteps: {
              type: ['array', 'null'],
              description: `createProcedure: the steps in order, at most ${PROCEDURE_STEPS_MAX}. reviseProcedure: the whole new list of steps in order, not only the changes. null otherwise.`,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['stepAlias', 'text', 'detail', 'group'],
                properties: {
                  stepAlias: nullable(
                    'string',
                    'reviseProcedure: the alias (ps1, ps2, …) of a step of <procedure_open> that stays, even when reworded; null for a new step.',
                  ),
                  text: {
                    type: 'string',
                    description: `One short imperative step, at most ${PROCEDURE_STEP_TEXT_CAP} characters.`,
                  },
                  detail: nullable(
                    'string',
                    `A line of extra help, at most ${PROCEDURE_STEP_DETAIL_CAP} characters, or null.`,
                  ),
                  group: nullable(
                    'string',
                    `The name of the group the step belongs to, at most ${PROCEDURE_GROUP_NAME_CAP} characters, or null for no group.`,
                  ),
                },
              },
            },
            fromTaskAlias: nullable(
              'string',
              "createProcedure: the alias of the open task whose steps become the procedure, when the person asks to make a task's steps a procedure; null otherwise.",
            ),
            runStepAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: `tickRun: the alias (rs1, rs2, …) of each step of <open_runs> the person says is done, at most ${MAX_TICKS_PER_TURN}; null otherwise.`,
            },
            whoAlias: nullable(
              'string',
              'noteSoundsLike: the alias (w1, w2, …) from <people> of the person the spelled name belongs to; null otherwise. createHabit: the alias from <people> of who it is for, only when it is for someone else; null for the person themself. setWhereabouts: the alias from <people> of who it is about, or "me" for the person talking.',
            ),
            heardSpan: nullable(
              'string',
              'noteSoundsLike: the words as they were written in the turn before, which the person is correcting ("Shivon"), copied exactly; null otherwise.',
            ),
            contactKind: {
              type: ['string', 'null'],
              enum: ['phone', 'email', null],
              description:
                'addContactPoint: phone or email; null otherwise. The person is whoAlias.',
            },
            contactValue: nullable(
              'string',
              `addContactPoint: the number or address exactly as said, at most ${CONTACT_VALUE_CAP} characters; null otherwise.`,
            ),
            contactLabel: nullable(
              'string',
              `addContactPoint: the word the person used for it ("work", "mobile", "home"), at most ${CONTACT_LABEL_CAP} characters; null when none was said.`,
            ),
            otherWhoAlias: nullable(
              'string',
              'connect, updateConnection and disconnect: the alias (w1, w2, …) from <people> of the second person, or "me" for the person talking; the first is whoAlias, also "me" when it is the person talking. Null otherwise.',
            ),
            connectionKind: {
              type: ['string', 'null'],
              enum: [...CONNECTION_KINDS, null],
              description:
                'connect: family, couple, friend or work. updateConnection and disconnect: the kind of the link, or null when the pair has one. Null otherwise.',
            },
            connectionRelation: {
              type: ['string', 'null'],
              enum: [
                ...KIN_KINDS.map((entry) => entry.kind),
                'friend',
                'coworker',
                null,
              ],
              description:
                'connect and updateConnection: what whoAlias is to otherWhoAlias, as a family word from the list ("Joan is Dana\'s mom" is mother with Joan first); null for a couple, a friend or work, and when no family word changes.',
            },
            coupleStatus: {
              type: ['string', 'null'],
              enum: [...CONNECTION_STATUSES, null],
              description:
                'connect and updateConnection for a couple: dating, engaged, married, separated, divorced or widowed, only as the words say; null otherwise. "got engaged" and "got married" are updateConnection with engaged or married. A date is dateSpanId.',
            },
            habitAlias: nullable(
              'string',
              'updateHabit, setCare and checkIn: the alias (h1, h2, …) of the habit in <habits> the words are about; null for createHabit, and for a checkIn that cannot tell which habit (use candidateAliases).',
            ),
            cadence: {
              type: ['object', 'null'],
              description:
                'createHabit and updateHabit reschedule: how often, only in these shapes; null for every day (createHabit) or no change (updateHabit).',
              additionalProperties: false,
              required: ['kind', 'weekdays', 'count', 'days'],
              properties: {
                kind: { type: 'string', enum: [...HABIT_CADENCE_KINDS] },
                weekdays: {
                  type: ['array', 'null'],
                  items: { type: 'integer', enum: [0, 1, 2, 3, 4, 5, 6] },
                  description:
                    'onWeekdays: the days, 0 for Sunday; null otherwise.',
                },
                count: nullable(
                  'integer',
                  'timesPerWeek: how many days a week, 1 to 6; null otherwise.',
                ),
                days: nullable(
                  'integer',
                  'everyNDays: the gap in days, 2 to 30; null otherwise.',
                ),
              },
            },
            windows: {
              type: ['array', 'null'],
              description: `createHabit and updateHabit reschedule: when in the day, at most ${HABIT_WINDOWS_MAX}; [] or null when it can be done any time. Times only from a named part or the reading's time spans, never written yourself.`,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['part', 'startSpanId', 'endSpanId', 'label'],
                properties: {
                  part: {
                    type: ['string', 'null'],
                    enum: [...HABIT_PARTS, null],
                    description:
                      'A named part of the day; null when times are given.',
                  },
                  startSpanId: nullable(
                    'string',
                    'The id of a time span from the reading that gives the start; a time said alone ("at 8") is a window around it.',
                  ),
                  endSpanId: nullable(
                    'string',
                    'The id of a time span that gives the end; null when none.',
                  ),
                  label: nullable(
                    'string',
                    `A short name for the window ("Morning"), at most ${HABIT_LABEL_CAP} characters; null when the part names it.`,
                  ),
                },
              },
            },
            timesPerDay: nullable(
              'integer',
              `createHabit: how many times a day for something counted rather than ticked ("8 glasses of water"), 2 to ${HABIT_TIMES_PER_DAY_MAX}; null for a habit with windows or done once.`,
            ),
            isCare: nullable(
              'boolean',
              'createHabit: true for a medicine, a dose, a treatment or care for someone else. setCare: true to mark the habit as medicine or care, false only when the person says it is not; null otherwise.',
            ),
            habitChange: {
              type: ['string', 'null'],
              enum: [...HABIT_CHANGES, null],
              description:
                'updateHabit: pause, resume, end, reschedule, retire ("I\'ve got this one"), or bringBack, only when the person asks for it; null for every other kind.',
            },
            windowKey: nullable(
              'string',
              'checkIn: the part of the day or window name the person said ("morning", "tonight"); null when none was said.',
            ),
            candidateAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: `checkIn: when it cannot tell which habit was meant, the alias of each habit it could be, at most ${MAX_HABIT_CANDIDATES}; null otherwise.`,
            },
            checkDay: {
              type: ['string', 'null'],
              enum: [...HABIT_CHECK_DAYS, null],
              description: 'checkIn: yesterday only when said; null is today.',
            },
            checkStatus: {
              type: ['string', 'null'],
              enum: [...HABIT_CHECK_STATUSES, null],
              description:
                'checkIn: skipped for "not today", "skipped it"; null is done.',
            },
            subjectAlias: nullable(
              'string',
              'setImportance: the alias (p1 for a project, h1 for a habit) in <importance> or <habits> of the one the person places; null when no project or habit by that name is listed.',
            ),
            otherAlias: nullable(
              'string',
              'setImportance with above, below or same: the alias of the one it is placed against; null otherwise.',
            ),
            importanceRelation: {
              type: ['string', 'null'],
              enum: [...IMPORTANCE_RELATIONS, null],
              description:
                'setImportance: most for "X matters most", above for "X before Y" or "X matters more than Y", below for "Y comes after X", same for "equally important", matters for "X matters" with nothing to compare, canWait for "X can wait", clear for "forget what I said about X"; null otherwise. A sentence naming several is one setImportance each, in the order said. Never for medicine or care.',
            },
            subjectName: nullable(
              'string',
              'setImportance: the name the person said when subjectAlias is null, at most 80 characters; null otherwise. The words of the placement are requestQuote and a "until Friday" is dateSpanId.',
            ),
            repeat: {
              type: ['object', 'null'],
              description:
                'scheduleAction: how often, in fields only, never a rule written out: freq daily, weekly, monthly or yearly ("every Sunday" is weekly with weekdays ["SU"]); subDaily when it says more than once a day ("every 2 hours", "at 8 and at 6"); null freq for a single run. changeScheduledAction reschedule: the new repeat; null for every other change.',
              additionalProperties: false,
              required: [
                'freq',
                'interval',
                'weekdays',
                'monthBy',
                'nth',
                'endsKind',
                'untilSpanId',
                'count',
              ],
              properties: {
                freq: {
                  type: ['string', 'null'],
                  enum: [...SCHEDULE_FREQS, 'subDaily', null],
                },
                interval: {
                  type: 'integer',
                  description:
                    'Every how many days, weeks, months or years: "every other Tuesday" is weekly with interval 2; 1 otherwise.',
                },
                weekdays: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
                  },
                  description:
                    'weekly: the days; "weekdays" is MO to FR. monthly on a weekday ("the last Friday"): that one day. Empty otherwise.',
                },
                monthBy: {
                  type: ['string', 'null'],
                  enum: ['day', 'nthWeekday', 'lastDay', null],
                  description:
                    'monthly only: day for "on the 23rd", nthWeekday for "the second Monday" or "the last Friday", lastDay for "on the last day"; null otherwise.',
                },
                nth: {
                  type: ['integer', 'null'],
                  enum: [1, 2, 3, 4, -1, null],
                  description:
                    'monthly nthWeekday: 1 to 4, or -1 for the last; null otherwise.',
                },
                endsKind: {
                  type: 'string',
                  enum: ['never', 'on', 'after'],
                },
                untilSpanId: nullable(
                  'string',
                  'endsKind on: the id of the date span in the reading that gives the last day; null otherwise. Never write a date yourself.',
                ),
                count: nullable(
                  'integer',
                  'endsKind after: how many times; null otherwise.',
                ),
              },
            },
            startsSpanId: nullable(
              'string',
              'scheduleAction: the id of the date span that gives the first day; null starts from the next time the rule comes round. Never write a date yourself.',
            ),
            timeSpanId: nullable(
              'string',
              'scheduleAction, and changeScheduledAction reschedule or move: the id of the time span in the reading that gives the time of day; null when none was said. Never write a time yourself.',
            ),
            instruction: nullable(
              'string',
              `scheduleAction: when the work needs judgment, what to do in the person's words, at most ${SCHEDULE_INSTRUCTION_CAP} characters; null when heldCommands holds it.`,
            ),
            heldCommands: {
              type: ['array', 'null'],
              description: `scheduleAction: the plain Helm commands to run each time, at most ${MAX_HELD_COMMANDS}; null for an instruction.`,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['kind', 'title'],
                properties: {
                  kind: { type: 'string', enum: [...SCHEDULED_ALLOWED_ENUM] },
                  title: nullable(
                    'string',
                    'createTask: the task in plain words; null for the other kinds.',
                  ),
                },
              },
            },
            allowedKinds: {
              type: ['array', 'null'],
              items: { type: 'string', enum: [...SCHEDULED_ALLOWED_ENUM] },
              description:
                'scheduleAction with an instruction: the command kinds a run may write, as few as will do; null for heldCommands.',
            },
            actionAlias: nullable(
              'string',
              'changeScheduledAction: the alias (sa1, sa2, …) of the scheduled action in <scheduled_actions>; null for every other kind. scope is thisOne for one run only, thisAndFollowing from that run on; fromSpanId is the date span of the run named, null for the next one; toSpanId is the day a skipped or moved run goes to.',
            ),
            undoTurn: nullable(
              'string',
              "offerUndo: the turn handle (u1, u2, …) from the earlier turn's undoable list; null otherwise.",
            ),
            undoLines: {
              type: ['array', 'null'],
              items: { type: 'integer' },
              description:
                'offerUndo: the line numbers (n) of that turn to offer to take back; an empty array offers everything left of that turn. Never a line marked isUndone. null otherwise.',
            },
            undoReason: {
              type: ['string', 'null'],
              enum: [...UNDO_REASONS, null],
              description:
                'offerUndo: why the person wants it back, by their words. wrongThing: they meant something else ("I meant a note"). wrongDetails: right thing, wrong details ("Friday not Saturday"). tooHasty: it should have asked first ("don\'t do that without asking"). changedMind: they no longer want it ("never mind, I don\'t need it"). unclear: anything else, or a plain "why did you do that?". null otherwise.',
            },
            undoQuote: nullable(
              'string',
              `offerUndo: the words from THIS capture that show the reason, copied exactly, at most ${UNDO_QUOTE_CAP} characters; null when no words do.`,
            ),
            offerSubject: nullable(
              'string',
              `offerResearch: two to five words naming what to look into ("apartments", "Lisbon bookings"), at most ${OFFER_SUBJECT_CAP} characters; null for every other kind.`,
            ),
            offerQuestion: nullable(
              'string',
              `offerResearch: what to find out, self-contained, at most ${OFFER_QUESTION_CAP} characters; null for every other kind.`,
            ),
            offerWhyNow: nullable(
              'string',
              `offerResearch: one line on why it helps now ("Nothing in Move yet says what you're looking for."), at most ${OFFER_WHY_CAP} characters; null when there is none.`,
            ),
            offerLeadDays: {
              type: ['integer', 'null'],
              description:
                "offerResearch: how many days before the project's date to offer it, by the kind of work (a home search 56 to 105, a trip's bookings about 42, a gift about 21); null for every other kind.",
            },
            offerIsDecision: nullable(
              'boolean',
              'offerResearch: true when the answer feeds a choice with money or a date; false otherwise; null for every other kind.',
            ),
            offerQuestions: {
              type: ['array', 'null'],
              description: `offerResearch: what you would need to know first, at most ${LEAD_QUESTIONS_MAX}; null for every other kind.`,
              items: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'label',
                  'shape',
                  'options',
                  'prefill',
                  'from',
                  'isInferred',
                ],
                properties: {
                  label: {
                    type: 'string',
                    description: `The question as a short label, at most ${OFFER_LABEL_CAP} characters ("Where", "Rent a month").`,
                  },
                  shape: {
                    type: 'string',
                    enum: ['text', 'pickOne', 'pickMany', 'amountRange'],
                  },
                  options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: `pickOne and pickMany only, at most ${OFFER_OPTIONS_MAX} of at most ${OFFER_OPTION_CAP} characters; [] otherwise.`,
                  },
                  prefill: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'What the person already said: the chosen options, the text, or "min-max" in cents for an amountRange (a bound may be empty); [] when they said nothing.',
                  },
                  from: nullable(
                    'string',
                    `Where the prefill came from ("What you said today"), at most ${OFFER_FROM_CAP} characters; null when nothing was filled.`,
                  ),
                  isInferred: {
                    type: 'boolean',
                    description:
                      'true when the prefill is your inference, not something the person said.',
                  },
                },
              },
            },
            researchQuestion: nullable(
              'string',
              `research: what to look up on the web, in the person's words made self-contained, at most ${RESEARCH_QUESTION_CAP} characters; never a name or detail from their records unless they said it in this capture; null for every other kind.`,
            ),
            researchSubject: nullable(
              'string',
              `research: two to five words naming what is looked into ("AWD vs 4WD", "Lisbon in December"), at most ${RESEARCH_SUBJECT_CAP} characters; null for every other kind.`,
            ),
            researchDepth: {
              type: ['string', 'null'],
              enum: ['light', 'thorough', null],
              description:
                'research: thorough only when the person asks for it ("look into it properly", "dig deep", "compare them all"), light only when they ask for a quick one; null when they did not say, which is the usual case.',
            },
            researchIsDecision: nullable(
              'boolean',
              'research: true when the answer will feed a choice the person is making ("which one should I buy", "where should we stay"); false for plain curiosity; null for every other kind.',
            ),
            learnQuestion: nullable(
              'string',
              `saveForLater: what the person wants to learn, in their words made self-contained, at most ${LEARN_QUESTION_CAP} characters. declineLearn with changedMind: the new question; null otherwise.`,
            ),
            learnSubject: nullable(
              'string',
              `saveForLater: two to five words naming it ("how engines work", "AWD vs 4WD"), at most ${LEARN_SUBJECT_CAP} characters. declineLearn with changedMind: the new subject; null otherwise.`,
            ),
            learnContext: nullable(
              'string',
              `saveForLater: where the wish came up, only when the capture says it ("while planning the Leavenworth drive"), at most ${LEARN_CONTEXT_CAP} characters; null otherwise.`,
            ),
            learnNeedsLiveFacts: nullable(
              'boolean',
              'saveForLater: true only when the answer depends on facts that change (prices, models, rules, current events); false for how something works; null for every other kind.',
            ),
            learnPractise: {
              type: ['string', 'null'],
              enum: ['read', 'goal', 'unclear', null],
              description:
                'saveForLater: read for something to understand, goal for a skill to practise, unclear when you cannot tell ("learn to fix my car\'s engine"); null for every other kind.',
            },
            learnQuote: nullable(
              'string',
              'saveForLater and offerLearnGoal: the words of this capture the wish came from, copied exactly; null for every other kind.',
            ),
            learnAlias: nullable(
              'string',
              'declineLearn: the alias (r1, r2, …) of the saved question in <learn_later>. relatedLearn: the first of the two; null for every other kind.',
            ),
            learnOtherAlias: nullable(
              'string',
              'relatedLearn: the alias of the second saved question; null for every other kind.',
            ),
            learnTogether: nullable(
              'string',
              `relatedLearn: the subject the two would share ("How engines and electric motors work"), at most ${LEARN_SUBJECT_CAP} characters; null for every other kind.`,
            ),
            learnReason: {
              type: ['string', 'null'],
              enum: [...LEARN_DECLINE_REASONS, null],
              description:
                'declineLearn: timing for "not now" or "later", lostInterest for "I don\'t care about that any more", changedMind for "actually I meant …". null for every other kind.',
            },
            learnGoalName: nullable(
              'string',
              `offerLearnGoal: the skill as a goal's name ("Learn piano"), at most ${LEARN_NAME_CAP} characters; null for every other kind.`,
            ),
            questions: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: `createTask: the questions to ask someone, one item each in the person's words, at most ${QUESTIONS_MAX} and ${TASK_QUESTION_CAP} characters each; empty for a task that is not questions. offerQuestionTask: the questions the document lists, the same way; null for every other kind.`,
            },
          },
        },
      },
      offerAbility: {
        type: ['object', 'null'],
        description:
          'Only when an answer about what is near the person or where they are would be better with a finer location than <abilities> allows, or they ask to use where they are: the level that would help. null otherwise; this never changes any setting.',
        additionalProperties: false,
        required: ['ability', 'level'],
        properties: {
          ability: { type: 'string', enum: ['location'] },
          level: { type: 'string', enum: ['city', 'precise'] },
        },
      },
      replyLine: nullable(
        'string',
        `What you say back about this turn, at most ${REPLY_LINE_CAP} characters, the way a person would reply ("Added it for Friday.", "Dropped it.", "Both are on the packing list now."): what became of what was said, in your voice and the person's style, past tense, with no "I", "me" or "my", never "Got it", never a template and never the person's words repeated back. Only what this reply really does. Always a line when commands holds anything other than answer or ask, and when the capture is the person's reply to your question (<answered_question>); null only when your reply is only an answer command or only asks.`,
      ),
      mentions: {
        type: 'array',
        description: `Every person, pet or organization the capture names, at most ${MAX_MENTIONS}, each once. A @handle is a person. Never the assistant itself, never "me" or "I".`,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'ref',
            'name',
            'kind',
            'relation',
            'species',
            'organizationKind',
            'kin',
            'kinRef',
            'proposedAlias',
          ],
          properties: {
            ref: { type: 'string', description: 'A name such as $w1.' },
            name: {
              type: 'string',
              description: `The name as written, without "'s", at most ${NAME_CAP} characters.`,
            },
            kind: { type: 'string', enum: [...MENTION_KINDS] },
            relation: nullable(
              'string',
              'How the person puts it when they say it ("my sister", "our vet"); null otherwise.',
            ),
            species: nullable(
              'string',
              'A pet only: the kind of animal when said ("cat"); null otherwise.',
            ),
            organizationKind: nullable(
              'string',
              'An organization only: what it is when said ("bakery", "clinic"); null otherwise.',
            ),
            kin: KIN_SCHEMA(
              'The family word when the person says how this named person is related to them ("my sister Dana": sister), only from the list; null otherwise. order only for a sibling or child ("my younger brother Eli": younger).',
            ),
            kinRef: KIN_SCHEMA(
              'A mention with no name, only a family word ("my younger brother", "my mum"): the word from the list. Give it name "" and nothing else; code finds who it is. null for a named mention.',
            ),
            proposedAlias: {
              type: ['object', 'null'],
              description:
                'A name that is not in <people> but is plainly another name of someone who is ("Bubs" for Eli, said as "call Bubs"): that person\'s alias from <people> (w1, w2, …). null otherwise. Never guess from a name that merely sounds close.',
              additionalProperties: false,
              required: ['whoAlias'],
              properties: { whoAlias: { type: 'string' } },
            },
          },
        },
      },
      places: {
        type: 'array',
        description: `Every location the capture names ("the Ferry Building", "home"), at most ${MAX_PLACES}, each once. A business or a person is a mention, never a place.`,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'name'],
          properties: {
            ref: { type: 'string', description: 'A name such as $p1.' },
            name: {
              type: 'string',
              description: `The place as written, at most ${NAME_CAP} characters.`,
            },
          },
        },
      },
    },
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isToken = (value: unknown): value is Token =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.text === 'string' &&
  typeof value.start === 'number' &&
  typeof value.end === 'number';

const isDue = (value: unknown): value is TaskDue =>
  isRecord(value) &&
  ((value.kind === 'day' && typeof value.date === 'number') ||
    (value.kind === 'moment' && typeof value.at === 'number'));

const toSpanPrecision = (value: unknown): DateSpan['precision'] =>
  value === 'month' || value === 'year' || value === 'decade' ? value : null;

const toTokens = (value: unknown) =>
  Array.isArray(value) ? value.filter(isToken) : [];

/** Opens a stored reading, an older turn's `{}` included, with every field present. */
export function toReading(value: unknown): CaptureReading {
  const source = isRecord(value) ? value : {};
  return {
    people: toTokens(source.people),
    places: toTokens(source.places),
    documents: toTokens(source.documents),
    commands: toTokens(source.commands),
    isUrgent: source.isUrgent === true,
    dates: Array.isArray(source.dates)
      ? source.dates
          .filter(
            (entry): entry is DateSpan =>
              isToken(entry) && isDue((entry as DateSpan).due),
          )
          .map((entry) => ({
            ...entry,
            precision: toSpanPrecision(
              (entry as { precision?: unknown }).precision,
            ),
          }))
      : [],
    addressedAs: isToken(source.addressedAs) ? source.addressedAs : null,
  };
}
