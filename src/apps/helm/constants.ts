import { CLOSING_PHRASES } from '@/lib/speech/closingPhrase';
import { formatList, toDayOrdinal } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import type { ThemeOption } from '@/components/ThemePicker';
import type { DayPart } from '@apps/helm/engine/habitDay';
import type {
  AssistantTone,
  HelmTheme,
  MediaKind,
  ProcedureVersionReason,
  TopicVersionReason,
} from '@apps/helm/types';
import {
  MAX_ATTACHMENTS_PER_TURN,
  MAX_MARKDOWN_BYTES,
  MAX_MARKDOWN_CHARS,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  MAX_VOICE_NOTE_MS,
} from '@apps/helm/utils/mediaCaps';

export { KIN_KINDS, KIN_ORDER_WORDS } from '@apps/helm/engine/kinKinds';

export const DEFAULT_ASSISTANT_NAME = 'Nomos';
export const DEFAULT_ASSISTANT_TONE: AssistantTone = 'composed';

/** How a recognizer commonly writes the default name; a custom name gets its own from the server. */
export const DEFAULT_ASSISTANT_MISHEARINGS = [
  'no most',
  'no moss',
  'no mos',
  'know most',
  'nomas',
  'no mas',
  'gnomos',
  'nomus',
  'numos',
];

export const DEFAULT_HELM_THEME: HelmTheme = 'chestnut';

/** The four palettes with the colours their preview cards draw; they match the blocks in `helm.css`. */
export const HELM_THEMES: ThemeOption<HelmTheme>[] = [
  {
    id: 'chestnut',
    name: 'Chestnut & Sand',
    light: {
      background: '#f7f3ee',
      card: '#fffdfa',
      foreground: '#2e241d',
      muted: '#6b5d51',
      primary: '#7a5434',
      primaryForeground: '#ffffff',
      border: '#e5dccf',
    },
    dark: {
      background: '#15110e',
      card: '#1e1915',
      foreground: '#f1e9e1',
      muted: '#ad9d8e',
      primary: '#e0bf9c',
      primaryForeground: '#17110c',
      border: '#382e26',
    },
  },
  {
    id: 'plum',
    name: 'Plum & Pewter',
    light: {
      background: '#f7f5f7',
      card: '#ffffff',
      foreground: '#2a2130',
      muted: '#655b6b',
      primary: '#53375f',
      primaryForeground: '#ffffff',
      border: '#e4dfe6',
    },
    dark: {
      background: '#151018',
      card: '#1e1822',
      foreground: '#efe9f2',
      muted: '#a99eae',
      primary: '#d3b8e0',
      primaryForeground: '#150f18',
      border: '#352c3b',
    },
  },
  {
    id: 'teal',
    name: 'Mist & Deep Teal',
    light: {
      background: '#f3f6f6',
      card: '#ffffff',
      foreground: '#172a2e',
      muted: '#52666a',
      primary: '#14555e',
      primaryForeground: '#ffffff',
      border: '#dae3e4',
    },
    dark: {
      background: '#0d1517',
      card: '#152023',
      foreground: '#e6eef0',
      muted: '#97aaae',
      primary: '#86ccd6',
      primaryForeground: '#081316',
      border: '#273639',
    },
  },
  {
    id: 'indigo',
    name: 'Porcelain & Indigo',
    light: {
      background: '#f8f8fb',
      card: '#ffffff',
      foreground: '#1b1e33',
      muted: '#5a5e78',
      primary: '#3a3f8c',
      primaryForeground: '#ffffff',
      border: '#e1e2ec',
    },
    dark: {
      background: '#0e0f1a',
      card: '#161828',
      foreground: '#e8e9f5',
      muted: '#9fa3c0',
      primary: '#b1b6f6',
      primaryForeground: '#0e0f1a',
      border: '#2a2d45',
    },
  },
];

/** Each tone with a fixed sample of the same answer, shown before saving; no model writes these. */
export const ASSISTANT_TONES: {
  value: AssistantTone;
  label: string;
  sample: string;
}[] = [
  {
    value: 'composed',
    label: 'Composed',
    sample: 'Your cake tasting is today at 3:00 PM at Sweet Layer Bakery.',
  },
  {
    value: 'warm',
    label: 'Warm',
    sample:
      "Your cake tasting is today at 3:00 PM at Sweet Layer Bakery. Hope it's a good one.",
  },
  {
    value: 'brief',
    label: 'Brief',
    sample: 'Cake tasting: today, 3:00 PM, Sweet Layer Bakery.',
  },
  {
    value: 'formal',
    label: 'Formal',
    sample:
      'The cake tasting is this afternoon at 3:00 PM, at Sweet Layer Bakery.',
  },
];

export const DEFAULT_DAY_START_TIME = '08:00';
export const DEFAULT_DAY_END_TIME = '22:00';
export const DEFAULT_PLAN_FILL_PERCENT = 50;

/** The version every sealed payload carries inside it; a reader refuses a newer one. */
export const SEALED_SCHEMA_VERSION = 1;

export const CAPTURE_COUNTER_FROM = 3_600;
/** What a page may tell a turn it was asked from: the rows in view. */
export const SCREEN_VISIBLE_CAP = 20;

/** A run of turns with no gap over this is one session. */
export const SESSION_IDLE_MS = 10 * 60 * 1000;

export const CAPTURE_MAX_CHARS = 4_000;

const withoutApostrophes = (phrases: readonly string[]) =>
  phrases.map((phrase) => phrase.replace(/['’]/g, ''));

/** Helm's own words that end an utterance, beside the shared phrases that may follow anything. */
const HELM_END_PHRASES = [
  "that's all for now",
  "that's it for now",
  'end the conversation',
  'end conversation',
  'bye for now',
];
const SHARED_ANYWHERE_ENDS = CLOSING_PHRASES.finish.filter((phrase) =>
  phrase.startsWith("that's "),
);
const END_WORDS = [...SHARED_ANYWHERE_ENDS, ...HELM_END_PHRASES];
/** Said at the end of an utterance to send it without a tap; in a live conversation they also end it. The shared phrases are the only copy of "that's all" and its kin. */
export const END_PHRASES = Array.from(
  new Set([...END_WORDS, ...withoutApostrophes(END_WORDS)]),
);
/** Helm's own whole-utterance closers in a live conversation, added to the shared finish phrases and "stop" (with any nod around: "okay, we're done"); never as an end phrase, since "tell Sam we're done" means something. */
export const LIVE_CLOSING_PHRASES = [
  "we're done",
  "i'm all set",
  "i'm good",
  'goodbye',
  'bye',
  'nothing else',
  'that will be all',
  "that'll be all",
  'end',
];
/** A whole utterance in a live conversation that only acknowledges the last reply ("Gotcha. Okay.") files nothing; listening carries on. */
export const ACKNOWLEDGEMENT_WORDS = [
  'ok',
  'okay',
  'k',
  'gotcha',
  'got it',
  'cool',
  'great',
  'nice',
  'perfect',
  'sounds good',
  'alright',
  'all right',
  'thanks',
  'thank you',
  'thanks a lot',
  'mhm',
  'mm hmm',
  'uh huh',
  'awesome',
  'now',
  'so',
];
/** Commands that delete a record. A closing phrase never reaches one: the reading keeps one only when its subject is still named once every closing phrase is taken out of the words. */
export const DELETING_COMMANDS = ['removeKeyDate'] as const;
/** A whole utterance that is one of these takes the open session's latest turn back, on the device, before anything is sent. */
export const UNDO_PHRASES = ['undo that', 'undo', 'take that back'];

/** A task's title is cut at a word to this many characters, as the server cuts the ones it makes. */
export const TASK_TITLE_CAP = 200;

/** A turn being read whose claim is older than this is taken over by the next sweep. */
export const SWEEP_LEASE_MS = 90 * 1000;

/** How long a topic write the server is making holds the topic. */
export const CLAIM_MS = 90_000;
/** The window of the ten-minute limit. */
export const RECENT_LIMIT_WINDOW_MS = 10 * 60 * 1000;
/** A turn whose reading failed is not tried again by the sweep before this has passed. */
export const SWEEP_RETRY_MS = 2 * 60 * 1000;
/** Turns the sweep tries in one run. */
export const SWEEP_RUN_LIMIT = 10;

export const IMPORTANCE_OPTIONS = [
  { value: 'must', label: 'Must' },
  { value: 'should', label: 'Should' },
  { value: 'could', label: 'Could' },
] as const;

export const ENERGY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

export const CONTEXT_OPTIONS = [
  { value: 'atHome', label: 'At home' },
  { value: 'out', label: 'Out' },
  { value: 'atComputer', label: 'At a computer' },
  { value: 'onPhone', label: 'On the phone' },
] as const;

export const LENGTH_OPTIONS = [15, 30, 60, 120] as const;

/** Only the sheet enforces these; the rules and the server do not. */
export const STEP_LIMIT = 30;
export const WAITS_ON_LIMIT = 10;
export const NOTES_MAX_CHARS = 4_000;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How many earlier sessions each scroll up brings in. */
/** The most open tasks the app keeps listening to. */
export const OPEN_TASKS_LIMIT = 150;
export const FACTS_LIMIT = 300;
export const FACT_STATEMENT_MAX = 500;
export const STYLE_TRAIT_MAX = 120;
export const STYLE_AVOID_MAX = 80;
export const STYLE_TRAIT_LIMIT = 12;
export const STYLE_AVOID_LIMIT = 6;
export const STYLE_REMOVED_LIMIT = 30;
/** New typed messages between one learning run and the next. */
export const STYLE_LEARN_EVERY = 25;
export const TOPIC_MAX = 40;
/** The most who and places the app keeps listening to. */
export const WHO_LIMIT = 2_500;
export const PLACES_LIMIT = 500;
/** The most connections between people the app keeps listening to. */
export const CONNECTIONS_LIMIT = 5_000;
/** 30 active or paused habits plus the 200 ended or retired ones kept. */
export const HABITS_LIMIT = 230;
export const HABITS_ACTIVE_MAX = 30;
export const HABIT_NAME_MAX = 60;
/** The plain-text copy of a habit's name a lock screen may show. */
export const LOCK_SCREEN_NAME_MAX = HABIT_NAME_MAX;
export const HABIT_LABEL_MAX = 30;
export const HABIT_NOTES_MAX = 500;
export const MEDICINE_NAME_MAX = 60;
export const MEDICINE_DOSE_MAX = 40;
export const HABIT_WINDOWS_MAX = 4;
export const HABIT_PER_DAY_MAX = 20;
export const HABIT_NOTES_SHOWN = 2;
/** Habit days read for Today and the week: from two weeks back to tomorrow. */
export const HABIT_DAYS_BEHIND = 14;
export const PROJECTS_LIMIT = 500;
export const NOTES_LIMIT = 1_000;
export const TOPICS_LIMIT = 100;
export const NOTE_TITLE_MAX = 80;
export const NOTE_BODY_MAX = 20_000;
/** The count under a note's text shows from here. */
export const NOTE_COUNT_FROM = 18_000;
export const TOPIC_NAME_MAX = 40;
export const TOPIC_DEPTH_MAX = 3;
export const SECTION_HEADING_MAX = 80;
export const SECTION_MARKDOWN_MAX = 4_000;
export const TOPIC_SECTIONS_MAX = 60;
export const TOPIC_DOCUMENT_MAX = 30_000;
export const SECTION_SOURCES_MAX = 20;
/** The newest versions the History sheet listens to. */
export const TOPIC_VERSIONS_LIMIT = 200;
export const PROCEDURES_LIMIT = 200;
export const PROCEDURE_STEPS_MAX = 60;
export const PROCEDURE_STEP_TEXT_CAP = 200;
export const PROCEDURE_STEP_DETAIL_CAP = 500;
export const PROCEDURE_TITLE_CAP = 80;
export const PROCEDURE_GROUPS_MAX = 12;
export const PROCEDURE_GROUP_NAME_CAP = 40;
export const PROCEDURE_VERSIONS_KEPT = 200;
/** Steps past which a procedure's groups start folded. */
export const PROCEDURE_FOLD_FROM = 50;
/** A run holds the procedure's steps and the ones added for it alone, and the server writes the same caps. */
export const RUN_STEPS_MAX = 80;
export const RUN_EXTRA_MAX = 20;
export const RUN_GROUPS_MAX = 12;
export const RUN_EXTRA_TEXT_CAP = 200;
/** Open runs listened to for the whole app. */
export const RUNS_OPEN_LIMIT = 50;
/** Runs a procedure's page or a project's lists before it says there are more. */
export const RUNS_LISTED = 5;
export const RUNS_ALL_MAX = 100;
/** Days ahead a trip or event is offered on Start a run. */
export const RUN_START_DAYS = 30;
export const RUN_START_LISTED = 4;
export const SUBTOPICS_MAX = 20;
export const NOTE_TOPICS_MAX = 10;
/** Notes the search field appears from. */
export const KNOWLEDGE_SEARCH_FROM = 8;
/** The most tasks in projects (open and done) the app keeps listening to. */
export const PROJECT_TASKS_LIMIT = 1_000;
export const PROJECT_NAME_MAX = 80;
export const PROJECT_OBJECTIVE_MAX = 200;
export const PROJECT_ROLE_NOTE_MAX = 40;
export const MILESTONE_TITLE_MAX = 80;
/** The most milestones one project holds. */
export const MILESTONES_MAX = 30;
/** Tasks a project's page lists before "Show all". */
export const PROJECT_TASKS_SHOWN = 6;
/** Days without a finished task before a project says it has gone quiet. */
export const PROJECT_QUIET_DAYS = 10;
/** The most media documents the app keeps listening to. */
export const MEDIA_LIMIT = 2_000;
/** Photos one who or place keeps. */
export const PHOTOS_PER_RECORD = 12;
/** Mentions a who's page lists before "Show all". */
export const MAX_ALIASES = 10;
export const MAX_SOUNDS_LIKE = 5;
export const MAX_REFUSED_ALIASES = 20;

export const MENTIONS_SHOWN = 10;
export const PROJECTS_SHOWN = 3;

/** Questions a turn shows at once. */
export const QUESTIONS_PER_TURN = 3;

/** The longest typed answer to a question. */
export const ANSWER_TEXT_MAX = 500;

export const EARLIER_SESSIONS_PAGE = 20;

/** Whether Disconnect's "also delete" box starts ticked. */
export const DISCONNECT_DELETES_BY_DEFAULT = true;
/** How long a kept copy stays after its connection ends. */
export const KEPT_COPY_DAYS = 90;
/** A category's copies older than this are said to be out of date. */
export const SYNC_STALE_MS = DAY_MS;
/** Opening or returning to the tab asks for an update when the newest one is older than this. */
export const SYNC_REFRESH_MS = 15 * 60 * 1000;
/** The most synced copies the app keeps listening to. */
export const SYNCED_LIMIT = 2_000;
/** Rows a synced task group shows on Today before the fold. */
export const TODAY_SYNCED_ROWS = 5;

/** Outside turns from one assistant with less than this between them are one conversation. */
export const OUTSIDE_CONVERSATION_GAP_MS = 30 * 60 * 1000;

/** How many executions Activity lists at first and each time it nears its foot. */
export const ACTIVITY_PAGE = 30;

/** What a person's dates can hold: the whole set, the yearly ones for one who, and where the sealed index splits into month documents. */
export const HELM_CAPS = {
  keyDates: 20_000,
  yearlyPerWho: 20,
  momentsPerWho: 500,
  indexSplit: 6_000,
  /** Scheduled actions a person has that have not ended; also the listener's cap. */
  scheduledActions: 50,
} as const;

/** The kinds of date that come back each year, in the order the add sheet offers them. */
export const KEY_DATE_KINDS = ['birthday', 'anniversary', 'custom'] as const;

/** The kinds of one-time event, in the order the add sheet offers them; a custom one with "Comes back each year" off is a moment too. */
export const MOMENT_KINDS = [
  'met',
  'moved',
  'startedJob',
  'leftJob',
  'graduated',
  'adopted',
  'passedAway',
] as const;

/** How many moments a who page shows before "See all". */
export const MOMENTS_PREVIEW = 3;

/** Today's dates look this many days ahead, today included. */
export const TODAY_WINDOW_DAYS = 7;

/** Coming up looks this far ahead. */
export const COMING_UP_DAYS = 365;

/** Lines of dates shown on Today before "+N more this week". */
export const TODAY_KEY_DATES = 3;

/** Dates one month of Coming up shows before its "Show N more". */
export const COMING_UP_MONTH_ROWS = 20;

/** Coming up shows a search box from this many rows. */
export const COMING_UP_SEARCH_FROM = 8;

/** A person's own words for a date, kept to this many characters. */
export const KEY_DATE_LABEL_MAX = 60;

const joinTitles = (titles: string[]) =>
  titles.length < 2
    ? (titles[0] ?? '')
    : `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;

const waitingOnCount = (waiting: number) =>
  waiting === 0
    ? ''
    : waiting === 1
      ? ' 1 task waiting on it can start then.'
      : ` ${waiting} tasks waiting on it can start then.`;

const goneLine = (count: number) =>
  count === 1
    ? '1 task was deleted since.'
    : `${count} tasks were deleted since.`;

/** Every line that names the assistant is a template over its chosen name, so a renamed assistant is renamed everywhere. */
const forgetPhotosLine = (photos: number) =>
  photos === 0
    ? ''
    : ` ${photos === 1 ? 'Its photo is' : `Its ${photos} photos are`} deleted too.`;

const forgetFactsLine = (facts: number) =>
  facts === 0
    ? ''
    : ` ${facts === 1 ? 'Its fact is' : `Its ${facts} facts are`} forgotten too.`;

const forgetDatesLine = (dates: number) =>
  dates === 0
    ? ''
    : ` ${dates === 1 ? 'Its date is' : `Its ${dates} dates are`} deleted too.`;

const forgetConnectionsLine = (connections: number) =>
  connections === 0
    ? ''
    : ` ${connections === 1 ? 'Their link to another person goes' : `Their ${connections} links to other people go`} too.`;

const forgetMomentsLine = (moments: number) =>
  moments === 0
    ? ''
    : ` ${moments === 1 ? 'Its moment is' : `Its ${moments} moments are`} deleted too.`;

const toTopicPhrase = (
  count: number,
  name: string | null,
  isGrouping = false,
) =>
  isGrouping && name
    ? `grouping under ${name}`
    : count === 1
      ? `1 change to ${name ?? 'a topic'}`
      : `${count} changes to topics`;

const NAMED_STEPS_SHOWN = 2;
const NAMED_STEP_CLIP = 24;

const toStepNames = (names: string[]) => {
  const clipped = names.map((name) =>
    name.length > NAMED_STEP_CLIP
      ? `${name.slice(0, NAMED_STEP_CLIP - 1).trimEnd()}…`
      : name,
  );
  const shown = clipped.slice(0, NAMED_STEPS_SHOWN);
  const more = clipped.length - shown.length;
  return more > 0
    ? `${shown.join(', ')} and ${more} more`
    : shown.join(' and ');
};

const toStepsEdit = (verb: string, count: number, names: string[]) =>
  names.length === 0
    ? `You ${verb} ${count === 1 ? '1 step' : `${count} steps`}`
    : `You ${verb} ${toStepNames(names)}`;

const toProcedurePhrase = (count: number, name: string | null) =>
  count === 1
    ? `1 change to ${name ?? 'a procedure'}`
    : `${count} changes to procedures`;

/** What an Undo did to runs, as lowercase parts: a run the turn started is taken back, ticks it wrote are unticked. */
const toRunParts = (deleted: string[], unticked: number) =>
  [
    deleted.length === 0
      ? ''
      : `took back ${deleted.length === 1 ? `the run of ${deleted[0]}` : `${deleted.length} runs`}`,
    unticked === 0
      ? ''
      : `unticked ${unticked === 1 ? '1 step' : `${unticked} steps`}`,
  ].filter(Boolean);

const toCapital = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const toHabitParts = (ticked: number, changed: number) =>
  [
    ticked === 0
      ? ''
      : `unticked ${ticked === 1 ? '1 check-in' : `${ticked} check-ins`}`,
    changed === 0
      ? ''
      : `took back ${changed === 1 ? '1 habit change' : `${changed} habit changes`}`,
  ].filter(Boolean);

/** Each kind of medium in a sentence: its word, its titled and "the" forms, its sheet title, and whether its file name stands in for them. */
const MEDIA_WORDS: Record<
  MediaKind,
  {
    word: string;
    title: string;
    noun: string;
    sheet: string;
    isNamedByFile: boolean;
  }
> = {
  photo: {
    word: 'photo',
    title: 'A photo',
    noun: 'the photo',
    sheet: 'Photo',
    isNamedByFile: false,
  },
  pdf: {
    word: 'PDF',
    title: 'A PDF',
    noun: 'the PDF',
    sheet: 'PDF',
    isNamedByFile: false,
  },
  voiceNote: {
    word: 'recording',
    title: 'A recording',
    noun: 'the recording',
    sheet: 'Recording',
    isNamedByFile: false,
  },
  markdown: {
    word: 'file',
    title: 'A file',
    noun: 'the file',
    sheet: 'Markdown file',
    isNamedByFile: true,
  },
};

const mediaWordOf = (kind: MediaKind) => MEDIA_WORDS[kind].word;

/** The home composer's name for the voice, so a field elsewhere being spoken into can clear home's dock and box away. */
export const HOME_COMPOSER_ID = 'home-composer';

export const HELM_COPY = {
  copyList: 'Copy list',
  listCopied: 'Copied the list',
  copyFailed: "Couldn't copy that",
  privateRowTitle: 'Private',
  privateRowSubtitle:
    "Left out of copied lists, and only read as a label when you aren't looking at the screen",
  privateLockLabel: 'Private',
  privateMarkedHealth: "Marked private because it's about health",
  privateMarkedCare: "Marked private because it's about someone's care",
  privateChange: 'Change',
  privateFromParent: (name: string) => `Private because ${name} is private`,
  privateOpenParent: 'Open',
  privateClearTitle: 'Make this not private?',
  privateClearMessage: (title: string, name: string, kind: 'health' | 'care') =>
    `\u201c${title}\u201d is about ${kind === 'health' ? 'health' : "someone's care"}. It could then be copied in a list, and read by name when you aren't looking at the screen. ${name} won't mark it private again.`,
  privateKeep: 'Keep it private',
  privateClearAction: 'Make it not private',
  privateNeedsConnection: 'Changing this needs a connection.',
  privateLeftOutToastMs: 8000,
  privateFailed: "That didn't save. Try the switch again.",
  privateStillBecause: (name: string) =>
    `Still private because ${name} is private`,
  privateCascadePartial: "Saved, but some things filed under it didn't follow.",
  privateLeftOut: (count: number) =>
    `${count} private ${count === 1 ? 'thing' : 'things'} left out`,
  privateIncludeThem: 'Include them',
  quietRowTitle: 'Keep it quiet',
  quietRowSubtitle: 'Shown on screen, never said aloud',
  quietRowSubtitleProject: 'Shown on screen, never said aloud, with its tasks',
  quietUntilDay: (day: string) => `Through ${day}`,
  quietUntilOff: 'Until you turn it off',
  quietFromParent: (name: string) => `Kept quiet because ${name} is quiet`,
  quietGuessed: (assistant: string) =>
    `${assistant} kept this quiet because it sounded like a surprise`,
  quietOnToast: (title: string) => `Kept \u201c${title}\u201d quiet`,
  quietOffToast: (title: string) =>
    `\u201c${title}\u201d is no longer quiet. It stays private.`,
  quietUntilToast: (title: string, until: string) =>
    `\u201c${title}\u201d stays quiet through ${until}`,
  quietNoEndToast: (title: string) =>
    `\u201c${title}\u201d stays quiet until you turn it off`,
  quietFailed: "That didn't save. Try again.",
  quietDayLabel: 'Last quiet day',
  quietSetDay: 'Keep quiet through that day',
  quietNoEnd: 'No end date',
  quietCancel: 'Cancel',
  quietTitle: 'Kept quiet',
  quietRowHint: 'What stays on screen and is never said aloud',
  quietLead: (assistant: string) =>
    `${assistant} shows these on screen and never says them aloud.`,
  quietEmpty: (assistant: string) =>
    `Nothing is kept quiet. Tell ${assistant} something is a surprise and it stays on screen, never said aloud.`,
  quietStateYou: 'You asked',
  quietStateGuess: (assistant: string) => `${assistant} guessed`,
  quietStateUntil: (day: string) => `through ${day}`,
  quietStateOpen: 'until you turn it off',
  quietStop: 'Stop keeping it quiet',
  quietChange: 'Change when it ends',
  quietOpen: (kind: 'task' | 'project' | 'note') => `Open the ${kind}`,
  quietKind: { task: 'Task', project: 'Project', note: 'Note' } as const,
  quietSheetLead:
    'Shown on screen, never said aloud. If you stop keeping it quiet, it stays private.',
  quietSayAloud: 'Say it aloud this time',
  copyNothing: 'Nothing to copy',
  copyEmpty: 'The list is empty',
  homeHint: 'Tap to talk, or type',
  homeOpening: 'Opening your conversation',
  newConversation: 'New conversation',
  dailyFreshTitle: 'Start each day fresh',
  dailyFreshDescription:
    'Home starts each day clear. Earlier days stay under Show earlier.',
  dailyFreshFailed: "Couldn't save that. Check your connection.",
  newConversationStarted:
    'New conversation. Earlier turns are under Show earlier.',
  newConversationFailed:
    "Couldn't start a new conversation. Check your connection.",
  talk: 'Talk',
  talkListening: 'Listening',
  talkSendLabel: 'Send what you said',
  talkListeningHint: 'Listening…',
  questionListening: (hint: string) => `Listening · ${hint}`,
  questionSay: (phrases: string) => `say ${phrases}`,
  questionSaySeveral: (phrases: string) =>
    `say ${phrases}, as many as you like`,
  questionSayAnswer: 'say your answer',
  questionSayMore: 'another one',
  questionWakeToAnswer: (name: string) => `Say “Hey ${name}” to answer`,
  talkGettingReady: 'Getting ready…',
  heardAsTitle: (heard: string) => `Heard “${heard}”`,
  heardAsShownAs: (name: string) =>
    `Shown as ${name}, a name you've told your assistant.`,
  heardAsUse: 'Use what I said',
  heardAsKeep: (name: string) => `Keep ${name}`,
  heardAsTapLabel: (name: string, heard: string) =>
    `${name}, heard as ${heard}. Tap to see what was heard.`,
  talkListenFailed: "Couldn't start listening on this phone. Try again.",
  talkNeedsConnection:
    'Talk needs a connection on this phone. Turn on Hear me offline to talk without one.',
  talkNeedsConnectionBlocked:
    'Talk needs a connection on this phone. Type for now.',
  talkOpenVoiceSettings: 'Voice settings',
  talkHeardNothing: 'Nothing came through. Tap to try again.',
  talkStoppedWhileWorking: "It's still being added, just not read out.",
  talkSavedOffline: "Saved. It's filed once you're back online.",
  talkStop: 'Stop',
  talkCancel: 'Cancel',
  talkMute: 'Mute',
  talkUnmute: 'Unmute',
  talkMuted: 'Muted',
  liveLabel: (name: string) => `Talking with ${name}`,
  liveListening: 'Listening…',
  liveThinking: 'Thinking…',
  liveSpeaking: 'Speaking…',
  liveMicMuted: 'Microphone off',
  liveEndHint: 'Say "that\'s it" or tap End when you\'re done.',
  liveReady: (name: string) => `Go ahead. ${name} is listening.`,
  liveMicOff: 'Mic off',
  liveMicOn: 'Mic on',
  liveEnd: 'End',
  liveEndLabel: 'End the conversation',
  liveEndedQuiet: 'The conversation ended after a quiet spell.',
  liveEndedFailed:
    'Listening stopped working, so the conversation ended. Tap Talk to try again.',
  talkByVoice: 'Ask by voice',
  talkByTyping: 'Ask by typing',
  talkNeedsMicrophone:
    'Allow the microphone for this site to talk. Type for now.',
  talkNeedsRecognition: "This browser can't listen. Type for now.",
  talkNotReady: 'Not ready yet. Try again in a moment.',
  talkSendFailed: "That didn't send. Say it again.",
  nothingToUndo: 'Nothing to undo yet.',
  closedLeft: 'Okay, left it',
  closedUndo: 'Undo',
  closedUndoFailed: "That didn't come back. Try again.",
  nothingToRepeat: 'Nothing to repeat yet.',
  playAgain: 'Play this again',
  replayMuted: 'Voice is muted. Unmute it to hear this again.',
  whisperFailed: "Couldn't whisper it, so it stays on your screen.",
  whisperNeedsCloud:
    "With Keep voice on this device on, it can't be whispered, so it stays on your screen. Turn off whispering in Voice settings to hear it out loud.",
  nothingHeld: "Nothing's being kept off the speaker right now.",
  undoWhilePending: 'Still working on that one. Try again in a moment.',
  askToday: 'Ask about today',
  chipToday: 'About today',
  backToToday: 'Back to Today',
  askTasks: (count: number) =>
    count === 0
      ? 'Ask about your tasks'
      : count === 1
        ? 'Ask about this task'
        : `Ask about these ${count} tasks`,
  chipTasks: (count: number) =>
    count === 0
      ? 'About your tasks'
      : count === 1
        ? 'About 1 task'
        : `About ${count} tasks`,
  backToTasks: 'Back to Tasks',
  askTask: 'Ask about this task',
  chipAbout: (what: string) => `About ${what}`,
  chipAnything: 'About anything',
  chipRemove: (chip: string) => `Remove ${chip}`,
  backToTask: 'Back to this task',
  firstOpen: (name: string) =>
    `Tap Talk and tell ${name} the first thing on your mind. A task, a date, a name: ${name} sorts it.`,
  composerPlaceholder: (name: string) => `Type to ${name}`,
  composerLabel: (name: string) => `Message to ${name}`,
  todayFirstRun: (name: string) =>
    `Nothing is planned for today yet. Once you have told ${name} about a task or an event, it appears here.`,
  send: 'Send',
  dictate: 'Speak your message',
  dictateAnswer: 'Speak your answer',
  dictateDone: 'Done speaking',
  dictationShowAll: 'Show all',
  dictationShowLess: 'Show less',
  answerShowMore: (count: number) => `Show ${count} more`,
  answerShowFewer: 'Show fewer',
  sendFailed: "That didn't send. Your words are still here.",
  savedAsWritten: 'Saved as written',
  reading: 'Reading',
  readingSeveral: (count: number) =>
    `Reading ${['both', 'all three', 'all four', 'all five', 'all six', 'all seven', 'all eight', 'all nine', 'all ten'][count - 2] ?? 'them all'}`,
  keepTyping:
    'Keep typing: anything you send before the reply joins this turn.',
  resultLabel: 'What was done',
  resultAdded: (names: string[]) => `Added ${names.join(', ')}`,
  resultLinked: (names: string[]) => `Linked ${names.join(', ')}`,
  resultTaskDue: (due: string) => `Task · ${due}`,
  resultDone: 'Marked done',
  resultNoteFallback: 'A note',
  resultTaskFallback: 'A task',
  resultFactFallback: 'Something noted',
  aiNotice: (name: string) =>
    `${name} uses AI services to hear and read what you say.`,
  todayDueSoon: 'Due soon',
  nothingDueSoon:
    'Nothing is due this week. Tasks without a day are kept for later.',
  openTasksCapped: (count: number) => `Showing your newest ${count} tasks.`,
  tasksFailed: "Your tasks didn't open. Close this page and open it again.",
  overdueDue: (due: string) => `Overdue · ${due}`,
  unreadable: "Couldn't open this",
  loadingEarlier: 'Opening earlier turns',
  earlierFold: 'Show earlier',
  earlierHide: 'Hide earlier',
  threadToday: 'Today',
  threadYesterday: 'Yesterday',
  homeNextEvent: (clock: string, title: string) => `${clock} · ${title}`,
  homeNextEventTomorrow: (clock: string, title: string) =>
    `Tomorrow ${clock} · ${title}`,
  earlierFailed: "Couldn't open earlier turns. Try again",
  inboxTitle: 'Needs you',
  inboxNewSince: 'New since you looked',
  inboxEmpty: 'Nothing new since you looked.',
  markAllSeen: 'Mark all seen',
  clearNeedsYou: 'Clear all',
  clearNeedsYouTitle: (count: number, total: number) =>
    count === total
      ? `Clear all ${count} from Needs you?`
      : `Clear ${count} of ${total} from Needs you?`,
  clearNeedsYouBody: (keepsDisputes: boolean) =>
    [
      'Each question is dismissed unanswered and each turn that couldn’t be sorted leaves this list. What you said stays in your conversation.',
      keepsDisputes
        ? 'A question about which of two facts is true stays, since it still needs settling.'
        : null,
    ]
      .filter(Boolean)
      .join(' '),
  seenFailed: "That couldn't be marked seen. Try again.",
  shorthandLabel: 'Shorthand',
  shorthandPerson: '@ Person',
  shorthandPlace: '# Place',
  shorthandDocument: '^ Note',
  shorthandDocumentLabel: 'Procedure or note',
  shorthandUrgent: '! Urgent',
  readChipsLabel: 'What was read',
  readAsText: 'Read as text',
  readUrgent: 'Urgent',
  readAsTextDone: (label: string) => `Read ${label} as text`,
  undo: 'Undo',
  moreChips: (count: number) => `+${count} more`,
  changeDayTitle: 'Change the day',
  changeDay: (text: string) => `Change the day for ${text}`,
  tooLong: (over: number) =>
    `Too long by ${over.toLocaleString()} ${over === 1 ? 'character' : 'characters'}. Split it into two.`,
  noteLoose: 'Not in a topic yet',
  saveAsNote: 'Save as a note',
  saveAsNoteTooLong: 'Too long to save as a note (20,000 at most).',
  noteSavedFromText: (title: string) => `Saved a note: ${title}`,
  noteAlreadyKept: (title: string) => `Already in your notes: ${title}`,
  noteOpen: 'Open',
  noteFromWhatYouSaid: (date: string) => `From what you said on ${date}`,
  turnSheetTitle: 'What you said',
  nothingWaiting: 'Nothing waiting',
  newSinceLooked: (count: number) => `${count} new since you looked`,
  settingsTrustedBrowsers: 'Trusted browsers',
  keptCopyNotice: (when: string | null) =>
    when ? `Offline copy · ${when}` : 'Offline copy',
  keptCopyRetry: 'Try again',
  trustLapsedBody: (app: string) =>
    `Trust this browser is off now. Turn it on again in Settings to keep opening ${app} offline.`,
  needsConnectionTitle: "Your things open once you're back online.",
  needsConnectionBody: (name: string) =>
    `This browser doesn't keep the key to them, so typing to ${name} waits for a connection too.`,
  cannotOpenTitle: "Your things can't be opened right now.",
  cannotOpenBody:
    "They're safe and nothing was changed. The problem is on our side, not yours.",
  tryAgain: 'Try again',
  stillCannotOpen: "Still can't open them. Your things are safe.",
  composerBlocked: 'Typing works again once your things open',
  outboxIntro: (name: string) =>
    `You can still tell ${name} things; they wait here.`,
  outboxNeedsConnection: (name: string) =>
    `${name} needs a connection to keep this`,
  outboxNoAttach:
    "Photos and voice notes need a connection. Add them once you're back online.",
  outboxNotKept: (name: string) =>
    `Couldn't keep this on this device. ${name} needs a connection to keep it. Your words are still in the field.`,
  outboxRowTitle: "Sealed until it's sent, so the words don't show here",
  outboxRowLine: (time: string) => `${time} · sorted once you're back online`,
  outboxCount: (count: number) =>
    count === 1
      ? '1 thing saved on this device'
      : `${count} things saved on this device`,
  outboxSheetTitle: 'Saved on this device',
  outboxRemove: 'Remove',
  outboxRemoveTitle: 'Remove this?',
  outboxRemoveBody: (words: string | null, time: string) =>
    words === null
      ? `This takes what you typed at ${time} off this device. It hasn't been sent, so it's gone for good.`
      : `This takes “${words}” off this device. It hasn't been sent, so it's gone for good.`,
  outboxRemoveFailed: "Couldn't remove it. Try again.",
  outboxSentLocked: "Sent. You'll see them once your things open.",
  outboxRejected: (count: number) =>
    count === 1
      ? "1 thing saved on this device couldn't be kept."
      : `${count} things saved on this device couldn't be kept.`,
  outboxSignOutTitle: (count: number) =>
    count === 1
      ? 'Sign out and lose 1 thing?'
      : `Sign out and lose ${count} things?`,
  outboxSignOutBody: (count: number, name: string) =>
    count === 1
      ? `1 thing you told ${name} is still waiting on this device to be sent. Signing out deletes it.`
      : `${count} things you told ${name} are still waiting on this device to be sent. Signing out deletes them.`,
  outboxSignOutConfirm: 'Sign out anyway',
  outboxStay: 'Stay',
  arrivedViaDropBox:
    'Saved on this device, then sent once you were back online',
  needsYouCount: (count: number) =>
    count === 1 ? '1 needs you' : `${count} need you`,
  couldNotRead: "Couldn't read this",
  nothingToFile: 'Read it · nothing to file in it',
  readAgainNothing: 'Read again · still nothing to file in it',
  moreToSort: 'Too much to file at once',
  moreToSortFiled: (count: number | null) =>
    count === null
      ? 'Part of it is filed. The rest is waiting.'
      : `${count} ${count === 1 ? 'is' : 'are'} filed. The rest is waiting.`,
  couldNotSort: "Couldn't sort this",
  sortTheRest: 'Sort the rest',
  waitingHeading: 'Waiting to be read',
  waitingNote: (name: string) =>
    `Waiting needs nothing from you: ${name} reads these on its own.`,
  waitingOnDevice: 'Saved on this device · waits for a connection',
  waitingDailyLimit: (time: string) =>
    `Today's limit reached · read after ${time}`,
  waitingRecentLimit: 'A lot at once · sorted in a few minutes',
  waitingBudget: 'Reading is paused for now · sorted when it is back',
  waitingUnavailable:
    "The AI service couldn't be reached · read again when you next open this",
  waitingDefault: 'Waiting its turn · read in a moment',
  failedServiceDown: (name: string) =>
    `The AI service was down when ${name} tried to read this.`,
  failedUnusable: (name: string) =>
    `${name} read this but the reading came back unusable.`,
  failedGeneric: (name: string) =>
    `${name} tried three times and couldn't read this.`,
  makeTaskAsWritten: 'Make it a task as written',
  tryReadingAgain: 'Try again',
  failedDismissed: 'Dismissed. What you said stays in your conversation.',
  deleteCapture: 'Delete',
  deleteCaptureTitle: 'Delete this?',
  deleteCaptureBody: 'What you said is deleted. Nothing was made from it.',
  deleteCaptureBodyMade:
    'What you said is deleted. The tasks already made from it stay.',
  sortRestUnavailable:
    "That can't be sorted right now. Try again in a few minutes.",
  cannotTakeBack: "That can't be taken back now.",
  waitingToBeRead: 'Waiting to be read',
  waitingCheckFailed:
    "Couldn't check what is waiting. Close this page and open it again.",
  madeTask: 'Made a task',
  tookBackTask: 'Took back the task',
  heldActionFailed: "That didn't work. Try again.",
  waitingInNeedsYou: 'Waiting in Needs you',
  savedHeldDaily: (time: string) => `Saved as written. Read after ${time}.`,
  savedHeldRecent: 'Saved as written. Read in a few minutes.',
  savedHeldBudget: 'Saved as written. Read once reading is back.',
  turnsFailed: "Your turns didn't open. Close this page and open it again.",
  undoPickTitle: 'What should go?',
  undoPickAll: 'Undo all',
  undoPickSome: (count: number) => `Undo ${count}`,
  undoPickNone: 'Tick what to take back.',
  undoPickKeepHint: 'Untick anything that should stay.',
  undoPickCancel: 'Cancel',
  tookBackHome: 'Took back being home',
  tookBackNotHome: 'Took back No longer home',
  undoReportHome: "You're no longer marked home.",
  undoReportHomeAgain: "You're marked home again.",
  tookBack: (count: number) =>
    `Took back ${count} ${count === 1 ? 'task' : 'tasks'}`,
  tookBackKept: (count: number, other: number) =>
    `Took back ${count} ${count === 1 ? 'task' : 'tasks'}, kept ${other}`,
  nothingToTakeBack: (titles: string[], gone: number) =>
    titles.length > 0
      ? [
          `Nothing was taken back: you changed ${joinTitles(titles)} since.`,
          gone > 0 ? goneLine(gone) : null,
        ]
          .filter(Boolean)
          .join(' ')
      : gone > 0
        ? `Nothing was taken back. ${goneLine(gone)}`
        : 'Nothing was taken back.',
  undoReport: (takenBack: number, kept: number, gone: number) =>
    [
      `Took back ${takenBack} ${takenBack === 1 ? 'task' : 'tasks'}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  tookBackKeptChange: (count: number, names: string[]) =>
    count === 1 && names.length === 1
      ? `Put back how ${names[0]} was kept`
      : `Put back how ${count} things were kept`,
  undoReportKept: (count: number, names: string[]) =>
    count === 1 && names.length === 1
      ? `Put back how ${names[0]} was kept.`
      : `Put back how ${count} things were kept.`,
  tookBackFacts: (count: number) =>
    `Took back ${count} ${count === 1 ? 'fact' : 'facts'}`,
  undoReportFacts: (takenBack: number, kept: number, gone: number) =>
    [
      `Took back ${takenBack} ${takenBack === 1 ? 'fact' : 'facts'}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  undoReportFactsToo: (count: number) =>
    `${count === 1 ? '1 fact' : `${count} facts`} too.`,
  tookBackPeople: (count: number) =>
    `Took back ${count} ${count === 1 ? 'person' : 'people'}`,
  tookBackPeopleKept: (count: number, other: number) =>
    `Took back ${count} ${count === 1 ? 'person' : 'people'}, kept ${other}`,
  undoReportPeople: (takenBack: number, kept: number, gone: number) =>
    [
      `Took back ${takenBack} ${takenBack === 1 ? 'person' : 'people'}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  resultPhotoFallback: 'A photo',
  mediaFallbackTitle: (kind: MediaKind, fileName: string | null) =>
    MEDIA_WORDS[kind].isNamedByFile
      ? (fileName ?? MEDIA_WORDS[kind].title)
      : MEDIA_WORDS[kind].title,
  mediaNoun: (kind: MediaKind, fileName: string | null) =>
    MEDIA_WORDS[kind].isNamedByFile
      ? (fileName ?? MEDIA_WORDS[kind].noun)
      : MEDIA_WORDS[kind].noun,
  mediaWord: mediaWordOf,
  attachMenuLabel: 'Add a photo or file',
  attachTake: 'Take a photo',
  attachChoose: 'Choose photos',
  attachChooseFile: 'Choose a file',
  attachChooseFileHint: 'PDF or Markdown',
  attachRecord: 'Record a voice note',
  attachNote: (name: string) =>
    `${name} reads what you send to sort it, and keeps only what's useful. You'll see what it kept.`,
  attachRemove: (name: string) => `Remove ${name}`,
  attachRemoveVoice: 'Remove voice note',
  attachFailed: "Didn't upload",
  attachTryAgain: 'Try again',
  attachUploading: 'Uploading',
  attachTooMany: `Up to ${MAX_ATTACHMENTS_PER_TURN} photos or files a turn. Remove one to add another.`,
  attachSomeFit: (added: number) =>
    `Added ${added}. Up to ${MAX_ATTACHMENTS_PER_TURN} photos or files a turn.`,
  attachNotSupported: 'Photos, PDFs, Markdown files and voice notes only.',
  attachTooManyPages: (pages: number) =>
    `This PDF has ${pages} pages. Send one of up to ${MAX_PDF_PAGES} pages.`,
  attachPdfTooLarge: `PDFs can be up to ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
  attachMarkdownTooLong: (chars: number) =>
    `This file has ${chars.toLocaleString()} characters. Up to ${MAX_MARKDOWN_CHARS.toLocaleString()} can be read.`,
  attachMarkdownTooLarge: `Markdown files can be up to ${MAX_MARKDOWN_BYTES / 1024} KB.`,
  attachVoiceTooLong: `Voice notes can be up to ${MAX_VOICE_NOTE_MS / 60_000} minutes.`,
  attachNeedsConnection:
    'Sending a photo or file needs a connection. Your words stay here.',
  attachWaiting: 'Waiting for your photos and files to upload.',
  attachWaitingTitle: 'Still uploading',
  attachWaitingVoice: 'Waiting for your voice note to be written out.',
  attachFailedBlock:
    "A photo or file didn't upload. Try again or remove it, then send.",
  attachThumbLabel: (position: number) => `Photo ${position}`,
  attachFileLabel: (name: string) => name,
  attachMarkdownMeta: 'Markdown file',
  attachVoiceMeta: (time: string) => `Voice note · ${time}`,
  attachVoiceWritten: (time: string) => `Voice note · ${time} · Written out`,
  attachWritingOut: 'Writing it out…',
  attachWriteFailed: "Couldn't write this out",
  attachVoiceUsedUp:
    'Voice notes are used up for today. Type what it says, or try tomorrow.',
  attachVoiceTooLongToWrite:
    'This recording is over 5 minutes. Type what it says instead.',
  attachPdfLocked: 'This PDF is locked. Unlock it and send it again.',
  attachPdfUnreadable: "Couldn't open this PDF. Try another copy.",
  recording: 'Recording',
  recordCancel: 'Cancel',
  recordStop: 'Stop',
  recordStoppedAtLimit: 'Voice notes stop at 5 minutes. This one is saved.',
  recordUnsupported: "This browser can't record. Type instead.",
  recordNeedsConnection:
    "Voice notes need a connection. Type it, or try again when you're back online.",
  mediaKeptOn: (noun: string, record: string) => `Kept ${noun} on ${record}`,
  mediaSeeOn: (record: string) => `See it on ${record}`,
  mediaKeptNoRecord: (noun: string) => `Kept ${noun}`,
  mediaLetGo: (kind: MediaKind) => `Didn't keep the ${mediaWordOf(kind)}`,
  mediaKeepIt: 'Keep it',
  mediaKeepRecording: 'Keep the recording',
  mediaReadNotKept: (file: string) => `Read ${file}`,
  mediaVoiceNotKept: 'Wrote out your voice note',
  mediaKeepFailed: "That couldn't be kept. Try again.",
  mediaKeepGone: 'That is already gone.',
  mediaKeepNeedsConnection: 'Keeping this needs a connection.',
  mediaKeptToast: 'Kept',
  mediaOnRecordTitle: 'Photos',
  mediaFromTurn: (day: string) => `From what you sent on ${day}`,
  mediaRemovedToast: (kind: MediaKind) =>
    `${mediaWordOf(kind)[0].toUpperCase()}${mediaWordOf(kind).slice(1)} removed`,
  mediaRemoveFailed: "That didn't come off. Try again.",
  mediaRestoreFailed: "That couldn't be put back. Try again.",
  mediaUnreadable: "This can't be opened.",
  mediaNotKeptIn: (hoursLeft: number | null) =>
    hoursLeft === null
      ? 'Not kept'
      : hoursLeft < 1
        ? 'Not kept · deleted in under an hour'
        : `Not kept · deleted in ${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'}`,
  mediaTookOff: (record: string) => `You took it off ${record}`,
  mediaRemovedNoRecord: 'You removed it',
  mediaGoneTile: 'Removed',
  mediaVoiceTile: 'Voice note',
  mediaSeeNote: (title: string) => `See it in Knowledge: ${title}`,
  mediaNotKeptHours: (hoursLeft: number | null) =>
    hoursLeft === null
      ? "Didn't keep it"
      : hoursLeft < 1
        ? "Didn't keep it · Deleted in under an hour"
        : `Didn't keep it · Deleted in ${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'}`,
  mediaRemove: (kind: MediaKind) => `Remove ${mediaWordOf(kind)}`,
  mediaRemoveSubtitle: (kind: MediaKind) =>
    `A ${mediaWordOf(kind)} nothing else holds is deleted in 24 hours. You can undo it until then.`,
  mediaViewOnRecord: (position: number, total: number) =>
    `Item ${position} of ${total}`,
  mediaOpenPdf: 'Open the PDF',
  mediaOpenPdfHint: 'Opens in a new tab',
  mediaOpenPdfFailed: "The PDF didn't open. Try again.",
  mediaPdfPages: (pages: number | null) =>
    pages === null ? 'PDF' : `PDF · ${pages} ${pages === 1 ? 'page' : 'pages'}`,
  mediaSheetTitle: (kind: MediaKind) => MEDIA_WORDS[kind].sheet,
  mediaTranscriptTitle: 'What you said',
  mediaMarkdownEmpty: 'This file is empty.',
  mediaViewFile: (name: string) => `Open ${name}`,
  tookBackPhotos: (count: number) =>
    count === 1 ? 'Took back a kept photo' : `Took back ${count} kept photos`,
  undoReportPhotos: (count: number) =>
    count === 1
      ? 'Took back the kept photo. It is deleted in 24 hours.'
      : `Took back ${count} kept photos. They are deleted in 24 hours.`,
  undoReportPhotosToo: 'Photos it kept are deleted in 24 hours.',
  undoFailed: "That couldn't be taken back. Try again.",
  undoNeedsConnectionTitle: 'Undo needs a connection',
  undoNeedsConnectionBody:
    "Undo checks each record as it is now, so it waits until you're back online.",
  settingsTitle: 'Settings',
  settingsConnections: 'Connections',
  connectedAppsRowTitle: 'Connected apps',
  connectedAppsCount: (count: number) => `${count} connected`,
  connectedAppsNone: 'Not connected',
  connectedAppsLead: (name: string) =>
    `${name} can read these. It can't add, change or delete anything in them.`,
  connectReadOnlyPromise: (name: string, app: string) =>
    `${name} can read these. It can't add, change or delete anything in ${app}.`,
  connectedSection: 'Connected',
  notConnectedSection: 'Not connected',
  connectedNothingOn: 'Nothing switched on',
  connectedStopped: 'Stopped sharing',
  connectedAppsFailed:
    "Your connections didn't open. Close this page and open it again.",
  connectedAppsLoading: 'Opening your connections',
  assistantsRowTitle: 'Connected assistants',
  assistantsRowNone: 'Claude, Gemini and others',
  assistantsRowCount: (count: number) => `${count} connected`,
  assistantsLead: (app: string) =>
    `Claude, Gemini or another assistant can read your ${app} and, if you let it, add to it. What it reads goes to that company and is handled under its own terms.`,
  assistantsFailed:
    "Your assistants didn't open. Close this page and open it again.",
  assistantsLoading: 'Opening your assistants',
  assistantsListHeading: 'Connected',
  assistantLastUsed: (when: string) => `Last used ${when}`,
  assistantNeverUsed: 'Not used yet',
  assistantReads: 'Can look up your tasks, calendar, topics and procedures',
  assistantReadScopeLabels: {
    mail: 'Read Gmail',
    drive: 'Read Google Drive',
    apps: 'Read your apps',
  },
  assistantReadScopeHint: (
    scope: 'mail' | 'drive' | 'apps',
    name: string,
    app: string,
    { isOn, canWrite }: { isOn: boolean; canWrite: boolean },
  ) =>
    ({
      mail: isOn
        ? `${name} can search and read your email when you ask. ${canWrite ? 'A message from someone else could try to steer what it adds.' : 'Emails come from other people, so read them with care.'}`
        : `${name} can't see your email.`,
      drive: isOn
        ? `${name} can search and read your Drive files when you ask. ${canWrite ? 'A file from someone else could try to steer what it adds.' : 'Files can come from other people, so read them with care.'}`
        : `${name} can't see your Drive files.`,
      apps: isOn
        ? `${name} can look up what your apps share with ${app}, including copies ${app} keeps after an app is disconnected.`
        : `${name} can't see what your apps share.`,
    })[scope],
  assistantNeedsSource: (scope: 'mail' | 'drive' | 'apps') =>
    ({
      mail: 'Connect Gmail first.',
      drive: 'Connect Google Drive first.',
      apps: 'Connect an app first.',
    })[scope],
  assistantOpenConnectedApps: 'Open Connected apps',
  assistantWrites: (app: string) => `Add things to ${app}`,
  assistantWritesHint: (canWrite: boolean) =>
    canWrite
      ? 'Asks questions and adds tasks and notes. Undo anything in Activity.'
      : 'It can look things up, nothing more.',
  assistantPrivacy: (name: string) =>
    `What ${name} reads goes to the company behind it, under its own terms.`,
  assistantConnectedOn: (date: string) => `Connected ${date}`,
  assistantDisconnect: 'Disconnect',
  assistantDisconnectTitle: (name: string) => `Disconnect ${name}?`,
  assistantDisconnectBody: (name: string, app: string) =>
    `${name} stops reading and adding to your ${app} right away. What it already added stays, and you can still undo it in Activity.`,
  assistantUpdateFailed: "That didn't save. Try again.",
  assistantDisconnectFailed: "That didn't disconnect. Try again.",
  assistantDisconnected: (name: string) => `Disconnected ${name}`,
  assistantFrom: (name: string) => `From ${name}`,
  homeOutsideAdded: (
    vias: string[],
    count: number,
    isAllNew: boolean,
    title: string | null,
  ) => {
    const who =
      vias.length > 3
        ? 'Your assistants'
        : vias.length > 1
          ? `${vias.slice(0, -1).join(', ')} and ${vias.at(-1)}`
          : vias[0];
    const verb = isAllNew ? 'added' : 'changed';
    if (title !== null) return `${who} added ${title}`;
    return `${who} ${verb} ${count === 1 ? '1 thing' : `${count} things`}`;
  },
  sourceOutside: (via: string, date: string) => `From ${via} · ${date}`,
  noteSavedFromOutside: (via: string) => `Saved from ${via}`,
  noteLinks: 'Links',
  versionOutsideAdded: (via: string) => `${via} added this`,
  versionOutsideNotes: (via: string) => `With notes from ${via}`,
  assistantsConnectHeading: 'Connect an assistant',
  assistantsAddressLabel: (app: string) => `Your ${app}'s address`,
  assistantsAddress: 'https://apps.moondreams.dev/mcp/helm',
  assistantsCopyAddress: 'Copy address',
  assistantsClaudeHeading: 'Claude',
  assistantsClaudeSteps: (app: string) => [
    'Open Customize, then Connectors.',
    'Tap Add, then Add custom connector.',
    `Name it ${app}, paste the address and tap Connect. The free plan can add one connector.`,
  ],
  assistantsDescriptionLabel: 'Description, for apps that ask',
  assistantsDescription: (app: string) =>
    `Your ${app}: look up tasks, calendar, topics and procedures, and tell it things to add.`,
  assistantsCopyDescription: 'Copy description',
  assistantsIconLabel: 'Icon, for apps that ask',
  assistantsDownloadIcon: 'Download icon',
  assistantsIconFailed: "The icon didn't download. Try again.",
  assistantsChatGptHeading: 'ChatGPT',
  assistantsChatGptSteps: (app: string) => [
    'Open Plugins, tap Add, then Add custom MCP server.',
    `Add the icon, name it ${app}, paste the description and the address, and leave Authentication on OAuth.`,
    'Tick I understand and want to continue, tap Create as a plugin, then sign in.',
  ],
  assistantsGeminiHeading: 'Gemini',
  assistantsGeminiSteps: [
    "Go to gemini.google.com (it works in your phone's browser too).",
    'Open Settings, then Connected Apps, then Add a custom app.',
    'Paste the address. Gemini needs its Keep Activity setting on, and asks you to confirm each change it makes.',
  ],
  assistantsAfterConnect: (app: string) =>
    `Once it connects, it shows up here. Try "ask ${app} what is on my list today".`,
  connectSheetTitle: 'Connect an app',
  connectQuestion: (name: string, app: string) => `Let ${name} read ${app}?`,
  connectStartsTicked: (labels: string, count: number) =>
    `${labels} ${count === 1 ? 'starts' : 'start'} ticked.`,
  connectNeverShared: (never: string) => `Never shared: ${never}`,
  connectTickOne: 'Tick at least one',
  connectNotNow: 'Not now',
  connectConfirm: (app: string) => `Connect ${app}`,
  connectAlreadyConnected: (app: string) => `${app} is already connected.`,
  connectFailed: "That didn't connect. Try again.",
  connectNotAllowed: (app: string) =>
    `You can't open ${app}, so it can't be connected.`,
  connectNotActive: "That connection isn't available right now.",
  connectionGone: 'That app was already disconnected.',
  connectionConnectedOn: (date: string) => `Connected ${date}`,
  connectionAccountLabel: 'Account',
  connectionAccountValue: 'Your moondreams account',
  connectionReads: (name: string) => `What ${name} reads`,
  connectionSwitchedOff: (label: string) =>
    `${label} switched off. Its copies were removed.`,
  connectionUndo: 'Undo',
  connectionWhatReads: 'What this reads',
  connectionNewReadsTitle: 'New: it now also reads',
  connectionNewReadsOffTitle: 'New: turn this on to share',
  connectionGotIt: 'Got it',
  connectionToggleFailed: "That didn't change. Try again.",
  connectionNeverShared: (never: string) => `Never shared: ${never}`,
  connectionDisconnect: (app: string) => `Disconnect ${app}`,
  disconnectBody: (name: string, app: string) =>
    `${name} stops reading ${app}. Everything in ${app} stays as it is. You can connect it again any time.`,
  disconnectConfirm: 'Disconnect',
  disconnectFailed: "That didn't disconnect. Try again.",
  disconnectDeleteBox: (count: number, app: string, kind: string | null) =>
    `Also delete the ${count} ${kind === 'event' ? (count === 1 ? 'event' : 'events') : count === 1 ? 'thing' : 'things'} from ${app}`,
  disconnectKeepNote: (date: string) =>
    `They stay, marked no longer updated, until ${date}.`,
  disconnectDeleteNote:
    "They're removed now and can't be brought back. Your tasks and notes that mention them stay.",
  disconnectCancel: 'Cancel',
  syncedFrom: (app: string) => `From ${app}`,
  syncedUpdated: (when: string, name: string) =>
    `Updated ${when} · read only in ${name}`,
  syncedKept: (date: string) => `No longer updated · deletes ${date}`,
  syncedOpenIn: (app: string) => `Open in ${app}`,
  recordGroupOpen: 'Open',
  syncedGroup: (category: string, app: string) => `${category} · ${app}`,
  syncedTodayFromApps: 'From your apps',
  syncedMore: (count: number) => `${count} more`,
  syncedFewer: 'Show fewer',
  syncedWaiting: 'Waiting for the first update',
  connectionLiveLine:
    'Read only when you ask. Only what an answer quotes is kept.',
  syncedStale: (when: string) => `Last updated ${when} · may be out of date`,
  syncedAllDay: 'All day',
  todayTileNext: (time: string, title: string) => `Next: ${time} · ${title}`,
  todayTileCount: (count: number) =>
    `${count} ${count === 1 ? 'event' : 'events'} today`,
  feedGroupTitle: (label: string, count: number) => `${label} · ${count}`,
  feedGroupDetail: (app: string) => `${app} · all day`,
  syncedUpdatedLine: (when: string) => `Updated ${when}`,
  syncedNow: 'Sync now',
  syncedTryNow: 'Try now',
  syncedUpdating: 'Updating…',
  syncedCouldNot: "Couldn't update just now.",
  syncedNowFailed: "That didn't update. Try again.",
  googleCalendarName: 'Google Calendar',
  googleDriveRowName: 'Google Drive',
  googleServiceMeta: (email: string, reads: string) => `${email} · ${reads}`,
  gmailAddHint: (name: string) => `Let ${name} search your email when you ask.`,
  driveAddHint: (name: string) =>
    `Let ${name} search your Docs and PDFs when you ask.`,
  googleAddAccount: 'Add a Google account',
  googleAddAccountHint: (name: string) =>
    `Start with Calendar, so ${name} can plan around your events.`,
  googleAddAnother: 'Add another Google account',
  googleAddAnotherHint: 'A work or shared calendar, for example.',
  googleAccountTitle: (email: string, label: string | null) =>
    label ? `${email} · ${label}` : email,
  googleConnectTitle: 'Connect Google Calendar',
  googleReconnectTitle: 'Reconnect Google Calendar',
  googleReconnectAccount: (account: string) => `Reconnecting ${account}.`,
  googleConnectReadOnly: (name: string) =>
    `${name} reads each event's title, time and calendar so it can plan around your day. It can't add, change or delete anything in Google Calendar.`,
  googleConnectTesting: (name: string) =>
    `While ${name} is private, Google shows an "unverified app" screen before you agree, and may ask you to reconnect about once a week.`,
  googleContinue: 'Continue to Google',
  googleTryAgain: 'Try again',
  googleReconnected: 'Reconnected',
  googleServiceConnected: (service: string) => `${service} connected`,
  googleNeedsPermission: (name: string) =>
    `${name} needs permission to see your events to plan around them. Nothing was connected.`,
  googleConnectFailed: "That didn't connect. Try again.",
  googleReconnect: 'Reconnect',
  googleStoppedTitle: 'Google stopped sharing',
  googleStoppedBody: (lastUpdated: string | null) =>
    `Google stopped sharing this account. While the app is private this can happen about once a week.${lastUpdated ? ` Last updated ${lastUpdated}.` : ''}`,
  googleGmailName: 'Gmail',
  googleGmailTitle: 'Connect Gmail',
  googleGmailReconnectTitle: 'Reconnect Gmail',
  googleGmailReadOnly: (name: string) =>
    `${name} searches your Gmail only when a question needs it, and keeps only what an answer quotes. It can't send, label, archive or delete mail.`,
  gmailRowTitle: 'Gmail',
  gmailStopTitle: 'Stop reading Gmail?',
  gmailStopConfirm: 'Stop reading Gmail',
  gmailDisconnectNote:
    'Answers that quoted this account keep their words, and the quotes from its email are blanked. What was noted from it stays.',
  gmailFailed: "Gmail didn't turn on. Try again.",
  googleDriveName: 'Drive',
  googleDriveTitle: 'Connect Drive',
  googleDriveReconnectTitle: 'Reconnect Drive',
  googleDriveReadOnly: (name: string) =>
    `${name} searches your Drive only when a question needs it, and reads only Google Docs and PDFs. It keeps only what an answer quotes, and can't create, change, share or delete files.`,
  driveRowTitle: 'Drive',
  driveStopTitle: 'Stop reading Drive?',
  driveStopConfirm: 'Stop reading Drive',
  driveDisconnectNote:
    'Answers that quoted this account keep their words, and the quotes from its documents are blanked.',
  driveFailed: "Drive didn't turn on. Try again.",
  googleContactsName: 'Contacts',
  contactsRowTitle: 'Google Contacts',
  googleContactsTitle: 'Connect Google Contacts',
  googleContactsReconnectTitle: 'Reconnect Google Contacts',
  googleContactsReadOnly: (name: string) =>
    `${name} lists your contacts only when you open the list, and copies just the people you tick: name, email, phone and photo. It can't add, change or delete anything in Google Contacts.`,
  contactsDisconnectNote:
    'People you brought in stay in People, just as they are.',
  googleContactsFailed: "Google Contacts didn't connect. Try again.",
  googleReadOnly: (name: string) =>
    `${name} can read your events. It can't add, change or delete anything in Google Calendar.`,
  googleDisconnectNote: 'Google also forgets this access to the account.',
  googleDisconnectNoteTitle: 'Access at Google',
  googleLabelRow: 'Label',
  googleLabelNone: 'Add a short name, like "work"',
  googleLabelTitle: 'Account label',
  googleLabelField: 'Short name',
  googleLabelHelp: 'Shown beside the email wherever this account is named.',
  googleLabelSave: 'Save label',
  googleLabelFailed: "That label didn't save. Try again.",
  googleWhichCalendars: 'Which calendars',
  googleCalendarsCount: (count: number) =>
    `${count} ${count === 1 ? 'calendar' : 'calendars'} counting`,
  calendarPickerLead: (name: string) =>
    `Pick the calendars ${name} plans around. Holidays and subscriptions start off.`,
  calendarPickerLoading: 'Opening your calendars',
  calendarPickerFinishing: 'Finishing up with Google',
  calendarPickerFailed: "Couldn't load your calendars.",
  calendarPickerEmpty: "This account doesn't have a calendar to read.",
  calendarPickerMain: 'Main calendar',
  calendarPickerOthers: 'Holidays and shared',
  calendarPickerShiftsTitle: 'Work shifts',
  calendarPickerShiftsHint:
    'Tap the ones that hold your shifts, so the day after a late one stays free.',
  calendarPickerConnect: 'Connect',
  calendarPickerSave: 'Save',
  calendarPickerTickOne: 'Tick at least one calendar',
  calendarPickerFailedToSave: "That didn't save. Try again.",
  shiftCalendarsRow: 'Shift calendars',
  shiftCalendarsNone: 'None marked',
  shiftCalendarsCount: (count: number) =>
    `${count} ${count === 1 ? 'calendar' : 'calendars'} marked as shifts`,
  todayCalendar: 'Calendar',
  calendarOfferTitle: 'Connect Google Calendar to plan around your events',
  calendarOfferReason: (name: string) =>
    `${name} reads each event's title and time, never the details, and can't change anything.`,
  calendarOfferNotNow: 'Not now',
  calendarStoppedTitle: 'Google Calendar stopped sharing your events',
  calendarStoppedReason: 'Reconnect to bring your events back to Today.',
  calendarFailedLine:
    "Couldn't load your calendar, so these events may be out of date.",
  calendarFailedPlanned: 'Check your plan against your calendar.',
  calendarTryAgain: 'Try again',
  calendarNoSuggestions: 'No suggestions until your calendar loads.',
  calendarStoppedNoSuggestions:
    'No suggestions until your calendar is reconnected.',
  planNoCalendar: 'No calendar',
  planRestShift: (name: string, day: string) =>
    `Nothing planned after a night shift. Tell ${name} if you want something ${day}.`,
  planRestLate: (name: string, day: string) =>
    `Nothing planned after a late night. Tell ${name} if you want something ${day}.`,
  planRestAnyway: 'Plan my day anyway',
  planOverlaps: (title: string) => `Overlaps ${title}`,
  busyAllDayLabel: 'Keeps me busy all day',
  busyAllDayHint: "While it is on, tasks aren't planned into this day.",
  busyAllDayFailed: "That didn't save. Try again.",
  syncedTentative: 'Tentative',
  sameThingTime: (appName: string, time: string) => `${appName} says ${time}`,
  syncedFromAccount: (app: string, account: string) =>
    `From ${app} · ${account}`,
  keptFromRow: (count: number, date: string | null) =>
    `${count} ${count === 1 ? 'thing' : 'things'} kept${date ? ` · deletes ${date}` : ''}`,
  keptSection: 'Kept copies',
  keptCountLine: (count: number) => `${count} kept`,
  keptSheetTitle: (app: string) => `Kept from ${app}`,
  keptSheetBody: (name: string, count: number, date: string | null) =>
    `${name} no longer updates ${count === 1 ? 'this' : 'these'} ${count} ${count === 1 ? 'thing' : 'things'}.${date ? ` ${count === 1 ? "It's" : "They're"} deleted on ${date}.` : ''}`,
  keptDeleteNow: 'Delete now',
  keptDeleteTitle: (app: string) => `Delete what was kept from ${app}?`,
  keptDeleteBody: "They're removed now and can't be brought back.",
  keptDeleteFailed: "That didn't delete. Try again.",
  keptClose: 'Not now',
  connectionsNeedConnection: 'Needs a connection',
  connectionsNeedConnectionBody:
    "Changing a connection checks it with the server, so it waits until you're back online.",
  settingsVoice: 'Voice',
  settingsVoiceRowTitle: 'Voice service',
  settingsVoiceCloud: 'Cloud when online',
  settingsVoiceDevice: 'On this device',
  voiceDeviceOnlyTitle: 'Keep voice on this device',
  voiceDeviceOnlyOn:
    "Your speech isn't sent to our voice services, and answers are read by this device's voice. The browser still does its own listening: in Chrome that goes to Google, in Safari to Apple.",
  voiceDeviceOnlyOff:
    "Online, Deepgram turns your speech into words for clearer listening. This browser listens when it can't.",
  voiceHandsFreeTitle: 'Keep the conversation going',
  voiceHandsFree:
    'Talk starts a back-and-forth: after each answer it listens again, until you say "that\'s it", tap End or stay quiet for two minutes. Nothing is sent until you speak. Off: Talk takes one question at a time.',
  voiceWhisperHeldTitle: "Whisper what's kept quiet",
  voiceWhisperHeld:
    'Whispered when you ask to hear something kept off the speaker. Needs a connection, with Keep voice on this device off; otherwise it stays on your screen. Off: said in your usual voice.',
  voiceNoiseCleaningTitle: 'Clean up background noise',
  voiceNoiseCleaning:
    'Takes music and chatter out of what you say, on this device, before anything listens.',
  voiceNoiseCleaningCredits:
    'Noise cleaning uses RNNoise (BSD-3-Clause) and web-noise-suppressor (MIT), both open source.',
  voiceWakeTitle: (name: string) => `Hey ${name}`,
  voiceWake: (name: string, canHearOffline: boolean) =>
    `While this is open on screen, this browser listens for "Hey ${name}". In Chrome that listening goes to Google, in Safari to Apple. ${canHearOffline ? 'On some phones, music may pause while it waits for the phrase; Hear me offline avoids that.' : 'On some phones, music may pause while it waits for the phrase.'}`,
  voiceWakeLocked: "This browser can't listen for a phrase.",
  voiceDeviceOnlyOnOffline:
    "Your speech isn't sent anywhere: this phone turns it into words itself, and answers are read by this device's voice.",
  voiceDeviceOnlyOffOffline:
    "Online, Deepgram turns your speech into words for clearer listening. This phone listens itself when there's no connection.",
  voiceWakeOffline: (name: string) =>
    `While this is open on screen, this phone listens for "Hey ${name}" itself. Nothing you say leaves it.`,
  voiceOfflineTitle: 'Hear me offline',
  voiceOfflineOffer: (name: string, sizeMb: number) =>
    `Talk to ${name} with no connection. What you say stays on this phone. A one-time download of ${sizeMb} MB from this site, best on Wi-Fi.`,
  voiceOfflineDownload: 'Download',
  voiceOfflineDownloading: (loadedMb: number, sizeMb: number) =>
    `Downloading… ${loadedMb} of ${sizeMb} MB`,
  voiceOfflineCancel: 'Cancel',
  voiceOfflineReady: (sizeMb: number) =>
    `Ready. Talk works offline on this phone, and replies use its own voice. It keeps ${sizeMb} MB here.`,
  voiceOfflineRemove: 'Remove from this phone',
  voiceOfflineRemoved: 'Removed. Talk needs a connection again on this phone.',
  voiceOfflineUndo: 'Undo',
  voiceOfflineTryAgain: 'Try again',
  voiceOfflineStopped: 'The download stopped, so nothing was kept.',
  voiceOfflineNoRoom:
    "There isn't room on this phone to keep it, so nothing was kept. Free up some space and try again.",
  voiceOfflineCheckFailed:
    "The download didn't match what was expected, so nothing was kept.",
  voiceOfflineStartFailed:
    "It's downloaded but couldn't start on this phone. Remove it, then download it again.",
  voiceOfflineLicences: 'Open source licences',
  voiceOfflineLicencesTitle: 'Open source licences',
  voiceOfflineCredits: (credits: string) =>
    `Hear me offline uses ${credits}, all open source.`,
  voiceOfflineBlocked: {
    browser:
      "This browser can't run offline listening. Talk needs a connection here.",
    simd: "This phone's browser is too old to run offline listening. Talk needs a connection here.",
    audio:
      "This browser can't share its microphone with offline listening. Talk needs a connection here.",
    memory:
      "This phone doesn't have the memory for offline listening. Talk needs a connection here.",
    space:
      "This phone doesn't have room for offline listening. Talk needs a connection here.",
    language:
      'Offline listening understands English only for now. Talk needs a connection here.',
  },
  voiceDone: 'Done',
  voiceModeFailed: "Couldn't change that. Try again.",
  voicePickerRowTitle: 'Voice and speed',
  voicePickerRowDeviceOnly: "This device's voice",
  voicePickerSummary: (voice: string, feel: string, pace: string | null) =>
    [voice, feel, pace].filter((part) => part !== null).join(' · '),
  voicePickerPace: {
    0.8: 'Slower',
    0.9: 'A little slower',
    1: null,
    1.1: 'A little faster',
    1.2: 'Faster',
  } as Record<number, string | null>,
  voicePickerTitle: 'Choose a voice',
  voicePickerChosenLabel: 'Your voice',
  voicePickerGenderLabel: "Women's or men's voices",
  voicePickerWomen: "Women's voices",
  voicePickerMen: "Men's voices",
  voicePickerGroups: {
    calm: 'Calm and warm',
    clear: 'Clear and steady',
    lively: 'Bright and lively',
  },
  voicePickerDeviceOnly:
    'The cloud voice is off, so this device reads replies in its own voice.',
  voicePickerUseCloud: 'Use the cloud voice',
  voicePickerOffline: "You're offline. Samples play once you're back.",
  voicePickerSampleLine: 'Got it. Call the florist on Friday at 10 AM.',
  voicePickerPlay: 'Play a sample',
  voicePickerStop: 'Stop',
  voicePickerStarting: 'Starting',
  voicePickerSaveFailed: "Couldn't save that voice. It stays as it was.",
  voicePickerSampleFailed: "The sample didn't play.",
  voicePickerSpeed: 'Speed',
  voicePickerSlower: 'Slower',
  voicePickerNormal: 'Normal',
  voicePickerFaster: 'Faster',
  voiceOnPhone: 'Listening with this browser for the rest of today.',
  voiceUsingDevice: "In this device's voice for now",
  voiceNoticeTitle: 'Where your speech goes',
  voiceNotice:
    "Your speech goes to Deepgram to be turned into words, or to this browser's own listening when that's slow. Deepgram doesn't keep the sound or use it to train its models. You can change this in Settings.",
  settingsYourData: 'Your data',
  deleteAllTitle: (appName: string) => `Delete all my ${appName} data`,
  deleteAllRowHint: 'Everything it keeps, for good',
  deleteAllWorking: 'Deleting. This can take a minute.',
  deleteAllConfirmTitle: (appName: string) =>
    `Delete all your ${appName} data?`,
  deleteAllConfirmBody: (
    held: string[],
    connections: number,
    assistant: string,
  ) =>
    [
      held.length > 0
        ? `This deletes everything it keeps for you, including your ${formatList(held)}.`
        : 'This deletes everything it keeps for you.',
      connections > 0
        ? `It ends its ${connections === 1 ? 'connection' : `${connections} connections`} and removes the copies it made from them.`
        : null,
      `${assistant} starts over as if you had never opened it. Your account and your other apps stay as they are. This can't be undone.`,
    ]
      .filter(Boolean)
      .join(' '),
  deleteAllConfirmAction: 'Delete everything',
  deleteAllDone:
    'All your data here is deleted. You can start fresh whenever you like.',
  deleteAllCancelled: 'The sign-in was closed, so nothing was deleted.',
  deleteAllKinds: (counts: {
    tasks: number;
    people: number;
    places: number;
    projects: number;
    procedures: number;
    topics: number;
    notes: number;
    photos: number;
  }) =>
    [
      [counts.tasks, 'open task', 'open tasks'],
      [counts.people, 'person or pet', 'people and pets'],
      [counts.places, 'place', 'places'],
      [counts.projects, 'project', 'projects'],
      [counts.procedures, 'procedure', 'procedures'],
      [counts.topics, 'topic', 'topics'],
      [counts.notes, 'note', 'notes'],
      [counts.photos, 'photo', 'photos'],
    ].flatMap(([count, one, many]) =>
      count === 0 ? [] : [`${count} ${count === 1 ? one : many}`],
    ),
  deleteAllNeedsConnectionBody:
    'Deleting changes your account on our servers, so it can only start while you are online.',
  deleteAllFailed:
    'Not everything was deleted. Run it again and it picks up where it stopped.',
  deleteAllUnreachable:
    "The delete couldn't reach the server. Check your connection and run it again; it picks up where it stopped.",
  deleteAllSignIn: 'Sign in again to delete. Nothing has been removed.',
  activityTitle: 'Activity',
  outsideTitle: 'From your assistants',
  outsideUnnamed: 'an assistant',
  outsideRowHint: 'What they asked',
  outsideLead: 'What your assistants asked or told you, kept apart from home.',
  outsideEmpty:
    'Nothing yet. Questions and notes from your assistants will gather here.',
  outsideConnect: 'Connect an assistant',
  outsideSearch: 'Search conversations',
  outsideNoMatch: 'No conversation matches that.',
  outsideQuestions: (count: number) => `${count} questions`,
  activityRowHint: 'What was done, and when',
  activityEmpty: (name: string) =>
    `Nothing yet. Whatever ${name} does for you is listed here.`,
  activityFailed:
    "Your activity didn't open. Close this page and open it again.",
  activityLoading: 'Opening your activity',
  activityLoadingMore: 'Opening earlier activity',
  activityMadeChange: 'Made a change',
  youTookBack: (summary: string) =>
    `You ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`,
  takenBackLabel: 'Taken back',
  partlyTakenBackLabel: 'Partly taken back',
  activitySubject: (title: string, more: number) =>
    more > 0 ? `${title} and ${more} more` : title,
  keptRow: 'Kept: you changed it since',
  deletedRow: 'Deleted since',
  sheetChanged: 'What it changed',
  answerNothingInRecords: 'Nothing in your records answers this.',
  answerNotFromRecords: 'Not from your records',
  researchNotFromWeb: 'Not from the web',
  researchLookingInto: (subject: string) => `Looking into ${subject}…`,
  researchArrival: {
    fewMinutes: 'Give me about 2 minutes.',
    fiveToTen: "About 5 to 10 minutes; I'll tell you when it's in.",
    byMorning: 'It will be ready by morning.',
  },
  researchIn: (subject: string) => `What I found on ${subject}`,
  researchOpen: 'Open',
  researchCancel: 'Stop looking',
  researchCancelled: 'Stopped looking.',
  researchStoppedLine: (subject: string) =>
    `You stopped the look into ${subject}.`,
  researchStopFailed: "Couldn't stop that look. Try again in a moment.",
  researchRerunOn: (resetOn: string) => `I'll look on the web on ${resetOn}`,
  researchSources: 'Sources',
  researchDepthQuestion: (subject: string) =>
    `How deep should I look into ${subject}?`,
  researchDepthQuick: 'A quick look',
  researchDepthThorough: 'A thorough look',
  researchDepthAlwaysQuick: 'Always a quick look',
  researchDepthAlwaysThorough: 'Always a thorough look',
  researchThoroughLocked: (resetOn: string) =>
    `Thorough looks are used up this month; they come back ${resetOn}.`,
  researchCappedLine: (resetOn: string) =>
    `This month's web searches are used up, so this is from what I already know. Want me to look on the web on ${resetOn}?`,
  researchRerunYes: (resetOn: string) => `Look on ${resetOn}`,
  researchRerunNo: 'This is enough',
  researchSettingsTitle: 'Research',
  researchSettingsDefault: 'How deep to look',
  researchSettingsAsk: 'Ask me when it matters',
  researchSettingsIntro: (name: string) =>
    `How deep ${name} looks on the web. A thorough look reads more and uses more of this month's allowance.`,
  researchSettingsFailed: "Couldn't save that. Check your connection.",
  researchNothingToShow: "I couldn't put anything together for this one.",
  researchComparisonLabel: 'Side by side',
  researchThoroughLeft: (count: number, resetOn: string) =>
    count === 0
      ? `No thorough looks left this month; they come back ${resetOn}.`
      : `About ${count} thorough ${count === 1 ? 'look' : 'looks'} left this month`,
  aheadStatement: (subject: string, project: string) =>
    `Want me to look into ${subject} before ${project}?`,
  aheadDateReason: (date: string, days: number, project: string) =>
    days <= 1
      ? `${project}'s date is ${date}, tomorrow.`
      : days < 14
        ? `${project}'s date is ${date}, in ${days} days.`
        : `${project}'s date is ${date}, ${Math.round(days / 7)} weeks from now.`,
  aheadAsk: 'Ask me a few things first',
  aheadNotNow: 'Not now',
  aheadNotNowToast: (weeks: number | null) =>
    weeks === null
      ? "I'll leave it."
      : `I won't bring it up for ${weeks} weeks.`,
  aheadActionFailed: "Couldn't save that. Check your connection.",
  aheadSheetTitle: (subject: string) => `Before I look into ${subject}`,
  aheadBriefLabel: "What I'll send:",
  aheadOptional: 'Everything here is optional. Skip what you like.',
  aheadInferred: (assistant: string, from: string) =>
    `${assistant} inferred · ${from}`,
  aheadMinField: 'From',
  aheadMaxField: 'Up to',
  aheadDepthLabel: 'How deep',
  aheadDepthQuick: 'Quick look',
  aheadDepthQuickLine: 'Reads a few good sources',
  aheadDepthThorough: 'Thorough',
  aheadDepthThoroughLine: (left: number) =>
    `Reads more widely · ${left} left this month`,
  aheadStartNow: 'Start now',
  aheadStartNowLine: (arrival: string | null) =>
    arrival === null
      ? 'Ready by morning. Turn this on to start right away.'
      : `Starts right away. ${arrival}`,
  aheadSend: 'Look into it',
  aheadCancel: 'Cancel',
  aheadSendFailed: "Couldn't send that. Check your connection and try again.",
  aheadGone: 'This offer is no longer here.',
  aheadAlreadyAnswered: 'That was already answered.',
  aheadArrival: {
    fewMinutes: 'Ready in a few minutes.',
    fiveToTen: 'Ready in about 5 to 10 minutes.',
    byMorning: 'Ready by morning.',
  },
  aheadSent: (subject: string, arrival: string) =>
    `Looking into ${subject}. ${arrival}`,
  aheadLooking: (subject: string, arrival: string) =>
    `Looking into ${subject} · ${arrival.replace(/\.$/, '')}`,
  aheadTold: (subject: string) => `Looked into ${subject} for you.`,
  aheadOpenIt: 'Open it',
  aheadToldDismiss: 'Dismiss',
  learnLaterRow: (count: number) =>
    count === 0 ? 'Learn later' : `Learn later · ${count}`,
  learnLaterTitle: 'Learn later',
  learnMatchRow: (count: number) => `${count} in Learn later`,
  learnSaved: (subject: string) =>
    `Saved to learn later: ${subject}. I'll bring it up when you have a free half hour.`,
  learnSavedPlain:
    "Saved to learn later. I'll bring it up when you have a free half hour.",
  learnMerged: (subject: string) =>
    `Added that to what you wanted to learn about ${subject}.`,
  learnRevived: (subject: string) =>
    `${subject} is back on your learn later list.`,
  learnRemoved: (subject: string) => `Okay, I took ${subject} off your list.`,
  learnNotNowLine: 'Okay, it stays on your list.',
  learnCardTitle: (subject: string) =>
    `${subject.charAt(0).toUpperCase()}${subject.slice(1)}, the longer version`,
  learnCardLine: 'Remember that thing you wanted to learn?',
  learnCardMeta: (minutes: number, savedOn: string) =>
    `${minutes} min · you saved it ${savedOn} · Suggested`,
  learnShowMe: 'Show me',
  learnNotNow: 'Not now',
  learnStill: (subject: string) =>
    `Do you still want to learn about ${subject}?`,
  learnKeepIt: 'Keep it',
  learnRemoveIt: 'Remove it',
  learnTogether: (subject: string) => `Want these as one: ${subject}?`,
  learnTogetherYes: 'Together',
  learnApart: 'Keep them apart',
  learnMergedTogether: (subject: string) => `Put those together as ${subject}.`,
  learnKindQuestion: (subject: string) =>
    `What would you like to do with ${subject}?`,
  learnRead: 'Read up on it later',
  learnGoal: 'Make it a goal you practise',
  learnGoalOffer: (name: string) => `Make ${name} a goal?`,
  learnGoalMade: (name: string) => `Made ${name} a goal.`,
  learnCaution:
    'From general knowledge and the web, not checked against your records.',
  learnCautionGeneral:
    'From general knowledge, not checked against your records. It may be out of date.',
  learnKeep: 'Save to my knowledge',
  learnKept: 'Saved to your knowledge.',
  learnKeptIn: (topicName: string) => `Saved to ${topicName}.`,
  learnDone: 'Done with it',
  learnDoneLine: (subject: string) => `Marked ${subject} as learned.`,
  learnRemove: 'Remove',
  learnVideos: (count: number) => `Videos · ${count}`,
  learnVideoMeta: (channel: string, minutes: number) =>
    `${channel} · ${minutes} min`,
  learnFailed: "Couldn't put the overview together. It'll try again tomorrow.",
  learnPreparing: 'Preparing this for you. Ready by tomorrow morning.',
  learnPreparingLine: (savedOn: string) =>
    `Saved ${savedOn} · ready by tomorrow morning`,
  learnSavedLine: (savedOn: string, context: string | null) =>
    context ? `Saved ${savedOn} · ${context}` : `Saved ${savedOn}`,
  learnEmpty:
    'Nothing saved yet. Say "one day I want to learn…" and it waits here for a free half hour.',
  learnActionFailed: "Couldn't save that. Check your connection.",
  learnRowMeta: (savedOn: string) => `Learn later · saved ${savedOn}`,
  learnToday: 'today',
  learnNoMatch: 'Nothing you saved matches that.',
  learnSearch: 'Search what you saved',
  learnOpen: (subject: string) => `Open ${subject}`,
  learnVideoPlay: (title: string) => `Play ${title}`,
  searchGroupLearn: 'Learn later',
  answerGeneralHeading: 'General knowledge',
  answerGeneralCaution: (name: string) =>
    `From general knowledge, not checked against anything you've told ${name}. It may be out of date.`,
  answerHealthCaution:
    'General information, not medical advice. Check with a doctor or pharmacist before acting on it.',
  answerSourcesLabel: 'Where it came from',
  answerTaskGone: 'A task that is done or removed',
  answerSyncedGone: 'Something from a connected app that is no longer there',
  answerOpenSource: (title: string) => `Open ${title}`,
  answerTopicGone: 'A topic that has since been deleted',
  answerNoteGone: 'A note that has since been deleted',
  answerNoteMark: (place: string | null) =>
    place ? `Your note · ${place}` : 'Your note',
  answerNoteNotChecked: 'Saved from a general answer · Not checked',
  answerNoteChecked: 'Saved from a general answer · Checked by you',
  answerDiffersFromNote: (title: string, says: string) => {
    const said = says.replace(/[\s.!?,;:]+$/, '');
    return title
      ? `Your note '${title}' says: ${said}`
      : `Your note says: ${said}`;
  },
  saveToKnowledge: 'Save to my knowledge',
  saveAlreadyKept: (title: string) => `Already in your notes: ${title}`,
  saveAlreadyKeptOpen: 'Open',
  saveFailed: "That wasn't saved. Try again.",
  savedNoteIn: (topic: string) => `Saved to ${topic}`,
  savedNoteLoose: 'Saved, not in a topic yet',
  savedNoteOpen: (title: string) => `Open the saved note: ${title}`,
  savedChangeTopic: 'Change topic',
  savedWhichTopic: 'Which topic should this go in?',
  savedNewTopic: 'New topic',
  savedMoreTopics: 'More topics',
  savedSkip: 'Skip',
  savedTopicParent: 'Under (optional)',
  savedTopicTopLevel: 'Top level',
  savedUndoEdited:
    'That note was changed since, so it stays. Delete it from Knowledge.',
  savedFilingFailed: "That topic wasn't kept. Try again.",
  noteSavedFromAnswer: 'Saved from a general answer',
  noteNotChecked: 'Not checked',
  noteCheckedByYou: 'Checked by you',
  noteIChecked: 'I checked this',
  noteCheckFailed: "That wasn't marked. Try again.",
  noteChangeTopicTitle: 'Change topic',
  noteInNoTopic: 'In no topic ·',
  notePutInOne: 'Put it in one',
  quoteFrom: (label: string, day: string | null) =>
    day === null ? label : `${label}\u00a0· ${day}`,
  quoteOpen: 'Open in Gmail',
  quoteOpenDrive: 'Open in Drive',
  quoteDisconnected: 'This email was disconnected',
  quoteDocumentDisconnected: 'This document was disconnected',
  quoteRecordDisconnected: 'This record was disconnected',
  searchedLine: (where: string, when: string) => `Looked in ${where} ${when}.`,
  searchedJustNow: 'just now',
  searchedFailed: (account: string, why: string) =>
    `Couldn't look in ${account}: ${why}`,
  searchedStopped: 'Google stopped sharing it',
  discrepancyTwo: (isPlace: boolean, value: string) =>
    `${isPlace ? 'Two places' : 'Two times'}: an email says ${value}`,
  calendarIsRight: 'The calendar is right',
  calendarRightStatement: (title: string) =>
    `The calendar is right about ${title}`,
  calendarRightDone: (value: string) => `You confirmed ${value}.`,
  calendarRightFailed: "That didn't save. Try again.",
  calendarRightChanged: 'That changed in the meantime.',
  sheetDayTime: (day: string, time: string) => `${day} ${time}`,
  whatTheAiSees: 'What the AI sees',
  whatTheAiSeesRowHint: 'What is sent and kept',
  aiSeesSentLead: "What's sent",
  aiSeesSent: (name: string) =>
    `What you tell ${name}, and the records it needs to file or answer it.`,
  aiSeesWhereLead: 'Where it runs',
  aiSeesWhere: (name: string) =>
    `${name} runs on its own server, sends that to Claude through Anthropic's API, and checks what comes back. Anthropic doesn't use what it's sent to train its models. It reaches your things only through its own tools.`,
  aiSeesStoredLead: 'Stored encrypted',
  aiSeesStored:
    "What you say, your records and every line in Activity are encrypted before they're saved.",
  aiSeesKeptLead: "What's kept",
  aiSeesKept:
    "What you say and every change in Activity. The server's logs keep counts and codes, never your words.",
  newTask: 'New task',
  newHabit: 'New habit',
  moreActions: 'More',
  taskFormTitle: 'Task',
  taskTitleLabel: 'What to do',
  taskTitleMissing: 'Write what to do first',
  addTask: 'Add task',
  whenLabel: 'When',
  noDay: 'No day',
  addTime: 'Add a time',
  removeField: 'Remove',
  doneEditing: 'Done',
  stepsLabel: 'Steps',
  stepsCount: (done: number, total: number) => `${done} of ${total}`,
  stepsCountMeeting: (answered: number, toAsk: number, day: string) =>
    toAsk === 0
      ? `All ${answered} answered`
      : answered === 0
        ? `${toAsk} to ask ${day}`
        : `${answered} answered · ${toAsk} to ask ${day}`,
  taskMeetingLabel: (label: string) => `For ${label} `,
  taskMeetingWhen: (when: string) => `· ${when}`,
  questionsMeetingLabel: (label: string) => `${label} `,
  questionsMeetingWhen: (time: string) => `· ${time}`,
  questionsReadyAsk: 'Do you feel ready?',
  questionsReadyToast: (day: string) => `Marked ready for ${day}'s call`,
  questionsReady: "I'm ready",
  questionsNotYet: 'Not yet',
  questionsOpenLabel: (label: string) => `Open your questions for ${label}`,
  questionsNotYetToast: (time: string, day: string) =>
    `Set aside ${time} ${day} for your questions`,
  questionsNoTime:
    "There's no free time before the meeting, so here are your questions.",
  questionsActionFailed: "Couldn't save that. Check your connection.",
  noneValue: 'None',
  addStep: 'Add a step',
  stepPlaceholder: 'A step',
  editStep: 'Edit',
  moveUp: 'Move up',
  moveDown: 'Move down',
  stepActions: (text: string) => `Actions for ${text}`,
  stepsFull: `Up to ${STEP_LIMIT} steps`,
  moreDetails: 'More details',
  fewerDetails: 'Fewer details',
  importanceLabel: 'Importance',
  notSet: 'Not set',
  clearField: 'Clear',
  urgentLabel: 'Urgent',
  lengthLabel: 'Length',
  lengthOther: 'Other',
  lengthMinutes: 'Minutes',
  lengthValue: (minutes: number) =>
    minutes < 60
      ? `${minutes} min`
      : minutes % 60 === 0
        ? `${minutes / 60}h`
        : `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
  energyLabel: 'Energy',
  contextLabel: 'Context',
  notUntilLabel: 'Not until',
  waitsOnLabel: 'Waits on',
  nothingValue: 'Nothing',
  waitsOnTasks: (count: number) => `${count} tasks`,
  waitsOnFull: `Up to ${WAITS_ON_LIMIT} tasks`,
  someone: 'Someone',
  notesLabel: 'Notes',
  conditionNotUntil: (date: string) => `Not until ${date}`,
  startItNow: 'Start it now',
  conditionWaitsOnTask: (title: string, more: number) =>
    more > 0 ? `Waits on ${title} and ${more} more` : `Waits on ${title}`,
  stopWaiting: 'Stop waiting',
  conditionWaitsOnWho: 'Waits on someone',
  markAnswered: 'Mark as answered',
  markDone: (title: string) => `Mark ${title} done`,
  markNotDone: (title: string) => `Mark ${title} not done`,
  doneAt: (day: string, time: string) => `Done ${day} ${time}`,
  rowDone: 'Done',
  rowDoneOn: (day: string) => `Done ${day}`,
  taskReopenedToast: (title: string) => `${title} is open again`,
  undoChangedSince: 'That changed since, so it stays as it is.',
  deleteTaskTitle: 'Delete this task?',
  deleteTaskBody: (waiting: number) =>
    `Its notes and steps go with it.${waitingOnCount(waiting)}`,
  deleteConfirm: 'Delete',
  deletedTask: (title: string) => `Deleted ${title}`,
  restoreExists: 'It is back already.',
  wordsNeedConnectionTitle: 'Changing the words needs a connection',
  wordsNeedConnectionBody:
    "Another device may have changed them, so this waits until you're back online.",
  wordsSaveFailed: "That didn't save. Your words are still here.",
  fieldSaveFailed: "That change didn't save. Try again.",
  taskWordsUnreadable:
    "This task's words couldn't be opened. Its other details can still be changed.",
  tasksTitle: 'Tasks',
  allTasks: 'All tasks',
  openCount: (count: number) => `${count} open`,
  tasksEmpty: 'No open tasks.',
  tasksDue: 'Due',
  tasksAnyTime: 'Any time',
  showNotYet: 'Show',
  hideNotYet: 'Hide',
  notYetDivider: (count: number) => `Not yet · ${count}`,
  planSuggestedSummary: (count: number, day: string) =>
    `Suggested ${count} ${count === 1 ? 'task' : 'tasks'} for ${day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day}`,
  planFailed: "Couldn't plan the day. Try again.",
  dayStripLabel: 'Day',
  dayStripToday: 'Today',
  planEvents: (count: number) => `${count} ${count === 1 ? 'event' : 'events'}`,
  planPlanned: (count: number) => `${count} planned`,
  planSuggested: (count: number) => `${count} suggested`,
  planNoSummary: 'Nothing planned yet',
  planFree: (length: string) => `Free · ${length}`,
  planAnyTime: 'Any time today',
  planWhenHome: 'When you get home',
  planImHome: "I'm home",
  planHomeTill: (time: string) => `Till ${time}`,
  homeTitle: 'Home',
  homeRowDetail: 'Marked home',
  homeUntil: (time: string) => `You're home until ${time}`,
  homeToast: 'Home for the next 3 hours',
  notHomeToast: 'No longer marked home',
  homeTillTitle: (time: string) => `Home till ${time}`,
  homeTillBody:
    'Today puts the things to do at home first until then. Left already?',
  homeLeft: 'No longer home',
  homeNotSaved: "Couldn't save that you're home",
  planWorthDoing: 'Worth doing today',
  planFull: 'Your day is full. Nothing suggested.',
  planLate: 'Nothing more planned today.',
  planTomorrow: 'Tomorrow',
  planThisDay: 'Plan this day',
  plannedDay: (day: string, count: number) =>
    `Planned ${day}: ${count} suggested`,
  planningDay: (day: string) => `Planning ${day}…`,
  planningDaySpoken: (day: string) => `Planning ${day}.`,
  planNothingFits: 'Nothing to suggest for this day.',
  daySummaryShow: 'See the breakdown',
  daySummaryHide: 'Hide the breakdown',
  daySummaryMessages: (count: number) =>
    `${count} ${count === 1 ? 'message' : 'messages'} sent`,
  daySummaryTasksAdded: (count: number) =>
    `${count} ${count === 1 ? 'task' : 'tasks'} added`,
  daySummaryKeyDatesAdded: (count: number) =>
    `${count} key ${count === 1 ? 'date' : 'dates'} added`,
  daySummaryNotesAdded: (count: number) =>
    `${count} ${count === 1 ? 'note' : 'notes'} added`,
  daySummaryFactsAdded: (count: number) =>
    `${count} ${count === 1 ? 'fact' : 'facts'} added`,
  daySummaryPeopleAdded: (count: number) =>
    `${count} ${count === 1 ? 'person' : 'people'} added`,
  daySummaryPlacesAdded: (count: number) =>
    `${count} ${count === 1 ? 'place' : 'places'} added`,
  daySummaryHabitChecksDone: (count: number) =>
    `${count} habit ${count === 1 ? 'check-in' : 'check-ins'}`,
  daySummaryHabitsStarted: (count: number) =>
    `${count} ${count === 1 ? 'habit' : 'habits'} started`,
  daySummaryConnectionsAdded: (count: number) =>
    `${count} ${count === 1 ? 'connection' : 'connections'} added`,
  daySummaryTasksDone: (count: number) =>
    `${count} ${count === 1 ? 'task' : 'tasks'} finished`,
  daySummaryPlanned: (count: number) =>
    `${count} ${count === 1 ? 'day' : 'days'} planned`,
  daySummaryAnswered: (count: number) =>
    `${count} ${count === 1 ? 'question' : 'questions'} answered`,
  daySummaryDismissed: (count: number) =>
    `${count} ${count === 1 ? 'item' : 'items'} dismissed`,
  planNotDone: 'Not done',
  planBringToToday: 'Bring to today',
  planBroughtToToday: (count: number) => `Brought ${count} to today`,
  planOnToday: 'On today',
  planNothingThatDay: 'Nothing was planned.',
  planSuggestedMark: 'Suggested',
  planKeep: 'Keep',
  planEstimate: 'about 30 min · estimate',
  planBack: 'Back',
  planAnotherTime: 'Another time',
  planNotToday: 'Not today',
  planPickDay: 'Pick a day',
  planPlanIt: 'Plan it',
  planSkipped: (title: string) => `${title} is back in Any time`,
  planPlannedOn: (day: string) =>
    day === 'Today' || day === 'Tomorrow'
      ? `On ${day.toLowerCase()}'s plan`
      : `Planned for ${day}`,
  planOpening: (day: string, time: string) => `${day} ${time}`,
  planNoOpenings: 'Nothing fits in the next two days. Pick a day.',
  planDayPicked: (day: string) => `Moved to ${day}`,
  planFoundSlot: (day: string, range: string) => `${day} ${range}`,
  planFoundNoTime: (day: string) => `${day}, any time`,
  planNoRoom: 'No room today or tomorrow.',
  planNoRoomPick: 'Pick a day',
  planUnreadable: 'This plan could not be opened.',
  planTaskGone: 'A task that is done or removed',
  settingsAssistant: 'Your assistant',
  settingsColours: 'Colours',
  coloursHint: 'Pick the colours you like. They follow you to every device.',
  coloursLabel: 'Colour theme',
  coloursLight: 'Light',
  coloursDark: 'Dark',
  assistantRow: 'Name and tone',
  assistantSheetTitle: 'Your assistant',
  assistantLine: (name: string, tone: string) => `${name} · ${tone}`,
  assistantNameLabel: 'Name',
  assistantNameHint:
    "With Hey on in Voice service, it's also the name you say.",
  assistantRenameConnected: (name: string) =>
    `Connected assistants use ${name} from their next chat.`,
  assistantNameError:
    'Up to 16 letters, numbers, spaces, hyphens or apostrophes.',
  assistantUseDefault: (name: string) => `Use ${name}`,
  assistantToneLabel: 'How it answers',
  assistantToneHint:
    'Shapes its written answers. Names, dates and what it files never change.',
  assistantSave: 'Save',
  settingsPlanning: 'Planning',
  yourDayRow: 'Your day',
  yourDayLine: (start: string, end: string) => `${start} to ${end}`,
  yourDayStart: 'Day starts',
  yourDayEnd: 'Day ends',
  yourDayHint:
    'Suggestions stay inside these hours, leaving room around your events.',
  yourDayEndError: 'The day has to end after it starts.',
  yourDaySave: 'Save',
  peopleTitle: 'People',
  peopleSearch: 'Search people',
  peopleEmpty: (assistant: string) =>
    `Nobody yet. Tell ${assistant} about someone, a pet or a business and they show up here.`,
  peopleFailed: 'People did not open. Try again in a moment.',
  peopleNoMatch: 'Nobody by that name.',
  contactsBringIn: 'Bring in from Google Contacts',
  contactsTitle: 'Bring in people',
  contactsLead: (name: string) =>
    `Tick the people ${name} should know about. Only the ones you tick are copied, and only their name, email, phone and photo.`,
  contactsSearch: 'Search your contacts',
  contactsLoading: 'Opening your contacts',
  contactsFailed: "Your contacts didn't open. Try again.",
  contactsEmpty: 'No contacts to bring in from this account yet.',
  contactsNoMatch: 'Nobody by that name in your contacts.',
  contactsCapped: 'Showing your first 2,000 contacts.',
  contactsNeedConnection: 'Opening your contacts needs a connection.',
  contactsTryAgain: 'Try again',
  contactsEveryoneIn: 'Everyone here is already in People.',
  contactsAlreadyIn: 'Already in People',
  contactsReconnect:
    'Google stopped sharing your contacts. Reconnect to continue.',
  contactsReconnectAction: 'Reconnect Google',
  contactsPick: (count: number) =>
    count === 0
      ? 'Bring in people'
      : `Bring in ${count} ${count === 1 ? 'person' : 'people'}`,
  contactsAllIn: 'Everyone you picked is already in People.',
  contactsImportFailed: "Those people didn't come in. Try again.",
  contactsChanged: 'Someone you picked changed just now. Try again.',
  contactsTooMany: (limit: number) => `Pick up to ${limit} at a time.`,
  contactsFromGoogle: 'From Google Contacts',
  contactsUpdate: 'Update from Google',
  contactsUpdateHint:
    "Brings in what changed in Google. Anything you've edited here stays as you left it.",
  contactsUpToDate: 'Already up to date with Google.',
  contactsGoneAtGoogle: "That contact isn't in Google Contacts anymore.",
  contactsUpdateFailed: "That didn't update. Try again.",
  tierClose: 'Close',
  tierRegular: 'Regular',
  othersDivider: 'Others',
  showOthers: (count: number) => `Show others · ${count}`,
  hideOthers: 'Hide others',
  youLabel: 'You',
  selfFallbackName: 'Me',
  petKindFallback: 'Pet',
  organizationKindFallback: 'Organization',
  askPeople: (count: number) =>
    count === 0
      ? 'Ask about your people'
      : count === 1
        ? 'Ask about this person'
        : `Ask about these ${count} people`,
  chipPeople: (count: number) =>
    count === 0
      ? 'About your people'
      : count === 1
        ? 'About 1 person'
        : `About ${count} people`,
  backToPeople: 'Back to People',
  askWho: (name: string) => `Ask about ${name}`,
  backToWho: (name: string) => `Back to ${name}`,
  askPlace: (name: string) => `Ask about ${name}`,
  whoGone: 'This page is gone.',
  whoUnreadable: "This page couldn't be opened.",
  whoFactsTitle: 'Facts',
  factsAdd: 'Add a fact',
  factsAddTitle: 'Add a fact',
  factStatementField: 'What is true',
  factStatementPlaceholder: (name: string) => `Something true about ${name}`,
  factStatementMissing: 'Write what is true first.',
  factStatementHelp: 'One sentence. It is saved as something you said.',
  factSheetTitle: 'Fact',
  factCorrectTitle: 'Correct this fact',
  factRingSaid: 'You said',
  factRingInferred: (assistant: string) => `${assistant} inferred`,
  factLineSaid: (day: string) => `You said · ${day}`,
  factLineAdded: (day: string) => `You added · ${day}`,
  factLineConfirmed: (day: string) => `You confirmed · ${day}`,
  factLineCorrected: (day: string) => `You corrected · ${day}`,
  factLineInferred: (assistant: string, day: string) =>
    `${assistant} inferred · ${day}`,
  factSourceSaid: (assistant: string, day: string) =>
    `You told ${assistant} this ${day}`,
  factSourceInferred: (assistant: string, day: string) =>
    `${assistant} inferred this from what you told it ${day}`,
  factSourceInferredOnly: (assistant: string, day: string) =>
    `${assistant} inferred this ${day}`,
  factSourceInferredMail: (assistant: string) =>
    `${assistant} inferred this from an email`,
  factSourceConfirmed: (assistant: string, day: string, confirmedDay: string) =>
    `From what you told ${assistant} ${day} · You confirmed this ${confirmedDay}`,
  factSourceCorrected: (day: string) => `You corrected this ${day}`,
  factSourceAdded: (day: string) => `You added this ${day}`,
  factWas: (statement: string, day: string) =>
    `Was \u201c${statement}\u201d until ${day}`,
  factTwoAnswers: 'Two answers',
  factSettle: 'Settle it',
  whichIsTrueNoneBack: 'Back',
  whichIsTrueNoneVoice: "Tell me what's true now on the card.",
  factDisagrees: (statement: string) => `Disagrees with “${statement}”`,
  whichIsTrueNoneTitle: "What's true now?",
  whichIsTrueNoneHelp:
    'One sentence. Both earlier answers are kept as history.',
  factToday: 'today',
  factYesterday: 'yesterday',
  factConfirm: 'Confirm',
  factCorrect: 'Correct',
  factForget: 'Forget',
  factConfirmedToast: 'Confirmed',
  factCorrectedToast: 'Corrected',
  factForgotToast: 'Forgot that fact',
  factAddedToast: 'Added a fact',
  factUndone: 'Undone',
  factUndoKept: 'That changed since, so it was left as it is.',
  factChanged: 'That fact changed just now. Open it again to see it.',
  factNeedsConnection: 'This needs a connection.',
  factSubjectGone: 'Someone or something forgotten',
  inferredDoor: (count: number) => `Inferred \u00b7 ${count}`,
  inferredTitle: 'Inferred',
  inferredLead: (assistant: string) =>
    `What ${assistant} read between the lines. Confirm what is right, correct it, or forget it.`,
  seesYouTitle: (assistant: string) => `How ${assistant} sees you`,
  seesYouLead: (assistant: string) =>
    `What ${assistant} believes about you. Change anything that's wrong.`,
  seesYouRowHint: 'Preferences, favorites and who you are',
  seesYouEmpty: (assistant: string) =>
    `As you talk to ${assistant}, what it learns about you shows here, for you to check.`,
  seesYouIdentity: 'Who you are',
  seesYouPreferences: 'Preferences',
  seesYouFavorites: 'Favorites',
  seesYouAdd: 'New fact',
  seesYouAddTitle: 'Add a fact about you',
  seesYouKindField: 'What kind',
  seesYouKindIdentity: 'Who you are',
  seesYouKindPreference: 'Preference',
  seesYouKindFavorite: 'Favorite',
  seesYouStatementField: 'What to remember',
  seesYouStatementPlaceholder: {
    identity: 'Vegetarian',
    preference: 'Goes to Shell for gas',
    favorite: 'Favorite movie is Arrival',
  },
  seesYouStatementMissing: 'Write what to remember first.',
  seesYouStatementHelp: 'One sentence. It is saved as something you said.',
  seesYouTopicField: 'Topic (optional)',
  seesYouTopicPlaceholder: 'gas station',
  seesYouTopicSuggestions: 'Topics you already use',
  seesYouAddedToast: 'Added to what is kept about you',
  styleTitle: 'How you write',
  styleHelpTip:
    'Notes about how you write, from messages you type here and, if you switch it on, your sent mail. Only the notes are kept, never the messages or emails.',
  styleEmpty: `Notes about your writing appear here after about ${STYLE_LEARN_EVERY} messages you type. You can also add one yourself.`,
  styleUnreadable: "Your writing notes can't be opened right now.",
  styleSeenIn: (count: number) => `Seen in ${count} of your messages`,
  styleAddedByYou: 'Added by you',
  styleEditedByYou: 'Edited by you',
  styleAvoidSource: 'Not in what you write',
  styleAddLabel: 'Add a writing note',
  styleAddTitle: 'Add a writing note',
  styleSheetTitle: 'Writing note',
  styleField: 'The note',
  stylePlaceholder: 'Short sentences',
  styleHelp: 'Describe how you write, in a few words.',
  styleMissing: 'Write the note first.',
  styleFull: (limit: number) =>
    `Up to ${limit} notes. Remove one to add another.`,
  styleAvoidFull: (limit: number) =>
    `Up to ${limit} of these. Remove one to put this back.`,
  styleEdit: 'Edit',
  styleRemove: 'Remove',
  styleSaved: 'Saved your note',
  styleAdded: 'Added your note',
  styleRemoved: 'Removed the note',
  styleGone: 'That note is already gone.',
  styleUndoneFailed: 'The note could not be put back.',
  styleMailTitle: 'Learn from my sent mail',
  styleMailBody:
    'Reads your last 6 months of sent mail once. Only short notes are kept, never the emails.',
  styleMailHelpTip:
    'Up to 300 emails you sent in the last 6 months are read once, on the server, to note how you write at work, in personal mail and with people you write to often. The emails are never kept. To read them again later, switch this off and on.',
  styleMailReading: 'Reading your sent mail…',
  styleMailNotEnough:
    "There isn't enough sent mail yet to learn from. Try again after you've sent a few more emails.",
  styleMailBusy:
    "You've asked a lot in the last few minutes. Try this again a little later.",
  styleMailNothingLearned:
    'Your sent mail was read, but there was nothing clear enough to note yet.',
  styleMailFailed: "Your sent mail couldn't be read. Try again in a moment.",
  styleMailConnect: 'Connect Gmail',
  styleMailNeedsGmailBody:
    "Gmail isn't connected any more. Connect it, then switch this on again.",
  styleMailReconnect:
    'Gmail needs reconnecting before your sent mail can be read.',
  styleMailReconnectAction: 'Open Connected apps',
  styleMailUnreadable:
    "Your style notes can't be opened right now, so nothing was changed. Try again later.",
  styleMailOffline:
    "You're offline. Connect to the internet and switch this on again.",
  styleMailOffConfirmTitle: 'Remove the notes from your sent mail?',
  styleMailOffConfirm:
    'Work email, Personal email and the notes for each person are removed, including any you changed, added or removed there. Your other style notes stay, and you can undo this right after.',
  styleMailOffAction: 'Remove them',
  styleMailRemoved: 'Removed the notes from your sent mail',
  styleMailRemoveFailed: "The notes couldn't be removed. Try again.",
  styleMailUndoneFailed: "The notes couldn't be put back.",
  styleMailSeenIn: (count: number) => `Seen in ${count} of your sent emails`,
  styleMailWithWho: (name: string) => `With ${name}`,
  styleMailGroupsTitle: 'From your sent mail',
  askSeesYou: 'Ask about what is kept about you',
  chipSeesYou: 'About you',
  backToSeesYou: (assistant: string) => `Back to How ${assistant} sees you`,
  whoTasksTitle: 'Tasks',
  whoTasksEmpty: 'No open tasks.',
  whoMentionsTitle: 'Mentions',
  showAllMentions: (count: number) => `Show all ${count}`,
  showFewerMentions: 'Show fewer',
  placeHomeLine: 'Your home',
  placeTasksEmpty: 'No open tasks here.',
  questionNeedsConnection: 'Answering needs a connection.',
  questionSkip: 'Answer later',
  questionSkipped: "Saved for later. It's waiting in Needs you.",
  questionDismiss: 'Dismiss',
  questionDismissed: 'Dismissed.',
  questionDismissedLine: (prompt: string) => `${prompt} · Dismissed`,
  questionAnswered: 'Done.',
  undoOfferKept: 'Kept it.',
  undoOfferKeptAll: 'Kept everything.',
  undoOfferFinishOnCard: 'Pick the one to undo on the card.',
  factKept: (statement: string) => `Kept “${statement}”`,
  factKeptNeither: 'Saved what’s true now',
  questionSheetTitle: 'Which one?',
  questionMore: (count: number) =>
    count === 1
      ? '1 more question in Needs you'
      : `${count} more questions in Needs you`,
  questionRowMore: (count: number) => `${count} more`,
  questionRowSkipped: 'Skipped',
  questionPickAtLeastOne: 'Pick at least one, or None of these',
  questionSomethingElse: 'Something else',
  questionSomethingElseField: (name: string) => `Tell ${name} what you mean`,
  questionSend: 'Send',
  questionSendCount: (count: number) => `Send ${count}`,
  questionYes: 'Yes',
  questionNo: 'No',
  questionFreeTextPlaceholder: 'Type your answer',
  questionDateLabel: 'Day',
  questionTimeLabel: 'Time',
  questionNumberLabel: 'Number',
  questionRecordSearch: (kinds: ('who' | 'place')[]) =>
    kinds.length === 1 && kinds[0] === 'place'
      ? 'Search your places'
      : kinds.length === 1
        ? 'Search your people'
        : 'Search your people and places',
  questionRecordNone: 'Nothing found. Try another name.',
  questionNewNameField: (isPlace: boolean) =>
    isPlace ? 'Name of the place' : 'Their name',
  questionAnswerNeedsName: 'A name is needed.',
  questionAnswerNeedsValue: 'Add an answer first.',
  questionNumberOutOfRange: (
    min: number | null,
    max: number | null,
    isMoney = false,
  ) => {
    const show = (value: number) =>
      isMoney ? formatCentsShort(value) : String(value);
    const noun = isMoney ? 'an amount' : 'a number';
    return min !== null && max !== null
      ? `Pick ${noun} from ${show(min)} to ${show(max)}.`
      : min !== null
        ? `The smallest is ${show(min)}.`
        : `The largest is ${max === null ? '' : show(max)}.`;
  },
  questionAskAgain: (choices: string) => `Sorry, which one? ${choices}`,
  answerNoted: 'Got it.',
  answerNone: 'None of these',
  answerSomeoneNew: (name: string) => `Someone new: ${name}`,
  answerNewPlace: (name: string) => `New place: ${name}`,
  answerAt: (day: string, time: string) => `${day} at ${time}`,
  answerYouPicked: (words: string) => `You picked ${words}`,
  answerYouSaid: (words: string) => `You said ${words}`,
  answerYouAnswered: (words: string) => `You answered ${words}`,
  answerYouWrote: (words: string) => `You wrote: ${words}`,
  questionAsked: (prompt: string) => `Asked: ${prompt}`,
  questionSent: 'Sent.',
  questionSavedOffline: "Saved. It goes when you're back online.",
  questionOptionAria: (label: string, detail: string | null) =>
    detail ? `${label}, ${detail}` : label,
  whoEditMenu: 'Change details',
  whoTierMenu: 'Change how close',
  whoForgetMenu: (name: string) => `Forget ${name}`,
  whoEditTitle: 'Change details',
  whoNameField: 'Name',
  whoAliasesField: 'Also called',
  whoAliasesHelp: 'Other names they go by, separated by commas.',
  whoNamesAlsoCalled: 'Also called',
  whoNamesAdd: 'Add',
  whoNamesFamily: 'Family',
  whoNamesMenu: 'Names and family',
  aliasesTitle: (name: string) => `Names · ${name}`,
  aliasAddField: 'Add a nickname',
  aliasAddPlaceholder: 'Bubs',
  aliasAdd: 'Add',
  aliasRemove: (alias: string) => `Remove ${alias}`,
  aliasRemovedToast: (alias: string) => `Removed ${alias}`,
  aliasHelp: 'Search, @ and your assistant find them by these too.',
  aliasFull: (max: number) => `That is as many as fit (${max}).`,
  aliasDuplicate: 'They already go by that.',
  aliasIsNameOf: (alias: string) => `${alias} is already someone else's name.`,
  aliasIsAliasOf: (alias: string, name: string) =>
    `${name} is already called ${alias}.`,
  aliasIsYou: (word: string) => `${word} is already you.`,
  searchAlsoCalled: (alias: string) => `Also called ${alias}`,
  aliasNone: 'No nicknames yet.',
  soundsLikeTitle: 'Also heard as',
  soundsLikeHelp:
    'Ways your voice came out that were really this name. They help the right name come up, and are never searched or tagged.',
  soundsLikeRemove: (heard: string) => `Remove ${heard}`,
  soundsLikeRemovedToast: (heard: string) => `Removed ${heard}`,
  kinTitle: (name: string) => `Family · ${name}`,
  kinKindField: 'How you are related',
  kinNotSet: 'Not set',
  kinOrderField: 'Older or younger',
  kinOrderNotSaid: 'Not said',
  kinOrderOlder: 'Older',
  kinOrderYounger: 'Younger',
  kinOrderOldest: 'Oldest',
  kinOrderYoungest: 'Youngest',
  kinOrderTwin: 'Twin',
  kinHelp: 'Used to find them when you say “my sister” or “my grandpa”.',
  kinSavedToast: (name: string) => `Saved how ${name} is related`,
  kinClearedToast: (name: string) => `Cleared how ${name} is related`,
  kinRemove: 'Remove family word',
  kinChanged: 'This changed somewhere else. Close this and open it again.',
  kinUndoStale: 'This changed since, so it was left as it is.',
  kinDerived: (name: string, years: number, side: 'older' | 'younger') =>
    `From your birthdays: ${name} is ${years} ${years === 1 ? 'year' : 'years'} ${side}.`,
  whoKindField: 'Kind',
  whoKindPerson: 'Person',
  whoKindPet: 'Pet',
  whoKindOrganization: 'Organization',
  whoRelationField: 'How they relate',
  whoRelationPlaceholder: 'my sister',
  whoSpeciesField: 'Species',
  whoSpeciesPlaceholder: 'Cat',
  whoOrganizationKindField: 'Kind of organization',
  whoOrganizationKindPlaceholder: 'Bakery',
  whoPhoneField: 'Phone',
  whoEmailField: 'Email',
  whoReachTitle: 'How to reach',
  connectionsTitle: 'Connections',
  connectionAdd: 'Add a connection',
  connectionAddTitle: 'Add a connection',
  connectionTitle: 'Connection',
  connectionPickLead: (name: string) => `Who is connected to ${name}?`,
  connectionSearch: 'Search people',
  connectionNoMatch: 'Nobody matches that.',
  connectionNobodyElse: 'There is nobody else to connect yet.',
  connectionPicked: 'Connected to',
  connectionKindField: 'How are they connected?',
  connectionKinds: {
    family: 'Family',
    couple: 'Couple',
    friend: 'Friends',
    work: 'Work',
  },
  connectionFamilyField: (other: string, name: string | null) =>
    `${other} is ${name === null ? 'your' : `${name}'s`}…`,
  connectionFamilyNotSure: 'Family, not sure how',
  connectionStatusField: 'Where they are',
  connectionStatuses: {
    dating: 'Dating',
    engaged: 'Engaged',
    married: 'Married',
    separated: 'Separated',
    divorced: 'Divorced',
    widowed: 'Widowed',
  },
  connectionSinceField: 'Since (optional)',
  connectionSave: 'Add it',
  connectionSaveChange: 'Save',
  connectionDuplicate: (other: string) =>
    `${other} is already connected that way.`,
  connectionNeedsPerson: 'Choose who they are connected to first.',
  connectionChange: {
    couple: 'Change status or since',
    family: 'Change the family word',
  },
  connectionChangeSubtitle: {
    couple: 'Married, engaged, divorced…',
    family: 'Mother, cousin, in-law…',
  },
  connectionRemove: 'Remove this link',
  connectionRemoveSubtitle: 'You can undo it right after',
  connectionRemovedToast: (other: string) => `Removed the link to ${other}`,
  connectionRestoredToast: (other: string) => `Linked ${other} again`,
  connectionRestoreExists: 'That link was made again meanwhile.',
  connectionAddedToast: (line: string) => `Added: ${line}`,
  connectionChangedToast: (line: string) => `Now: ${line}`,
  connectionLinkGone: 'This link is gone.',
  connectionSideLine: {
    family: (name: string | null, word: string | null) =>
      name === null
        ? `Your ${word ?? 'family'}`
        : `${name}'s ${word ?? 'family'}`,
    friend: (name: string | null) =>
      name === null ? 'Your friend' : `${name}'s friend`,
    work: (name: string | null) => `Works with ${name ?? 'you'}`,
    couple: {
      partner: (name: string | null) => `Partner of ${name ?? 'you'}`,
      dating: (name: string | null) => `Dating ${name ?? 'you'}`,
      engaged: (name: string | null) => `Engaged to ${name ?? 'you'}`,
      married: (name: string | null) => `Married to ${name ?? 'you'}`,
      separated: (name: string | null) => `Separated from ${name ?? 'you'}`,
      divorced: (name: string | null) => `Divorced from ${name ?? 'you'}`,
      widowed: (name: string | null) => `Was married to ${name ?? 'you'}`,
    },
  },
  connectionLine: {
    family: (other: string, name: string | null, word: string | null) =>
      word === null
        ? `${other} and ${name ?? 'you'} are family.`
        : `${other} is ${name === null ? 'your' : `${name}'s`} ${word}.`,
    friend: (other: string, name: string | null) =>
      `${other} and ${name ?? 'you'} are friends.`,
    work: (other: string, name: string | null) =>
      `${other} and ${name ?? 'you'} work together.`,
    couple: (other: string, name: string | null, status: string | null) =>
      status === null
        ? `${other} and ${name ?? 'you'} are a couple.`
        : status === 'widowed'
          ? `${other} and ${name ?? 'you'} were married.`
          : `${other} and ${name ?? 'you'} are ${status}.`,
  },
  connectionSince: (date: string) => `Since ${date}`,
  connectionSinceInline: (date: string) => `since ${date}`,
  figuredOut: 'Figured out',
  figuredSuffix: '· Figured out',
  figuredFixPick: "Pick how they're related.",
  figuredBecause: {
    siblings: (first: string | null, second: string | null) =>
      `Because ${first ?? 'you'} and ${second ?? 'you'} are both your siblings`,
    sameParent: (
      parent: string | null,
      first: string | null,
      second: string | null,
    ) =>
      `Because ${parent ?? 'you'} ${parent === null ? 'are' : 'is'} a parent of both ${first ?? 'you'} and ${second ?? 'you'}`,
    step: (subject: string | null, owner: string | null, word: string | null) =>
      `${subject ?? 'you'} ${subject === null ? 'are' : 'is'} ${owner === null ? 'your' : `${owner}'s`} ${word ?? 'family'}`,
    steps: (steps: string[]) =>
      `Because ${steps.length > 1 ? `${steps.slice(0, -1).join(', ')} and ${steps[steps.length - 1]}` : steps.join('')}`,
  },
  figuredConfirm: "That's right",
  figuredConfirmSubtitle: 'Keep it as a link',
  figuredWrong: 'Not right',
  figuredWrongSubtitle: "Say how they're related, or that they aren't",
  figuredNotRelated: 'Not related',
  figuredFixLead: 'How are they related?',
  figuredFixSave: 'Save',
  figuredLinkedToast: (line: string) => `Linked: ${line}`,
  figuredRefusedToast: (other: string, name: string | null) =>
    `Noted: ${other} and ${name ?? 'you'} aren't family`,
  figuredUndone: 'Put back as it was.',
  figuredUndoChanged: 'It was changed since, so it was left as it is.',
  figuredMore: (count: number) => `Show ${count} more figured out`,
  peopleViewsLabel: 'People view',
  peopleViewList: 'List',
  peopleViewMap: 'Map',
  mapFiltersLabel: 'Who to show',
  mapFilterClose: 'Close only',
  mapFilterFamily: 'Family',
  mapFilterEveryone: 'Everyone',
  mapLabel: 'Your circle drawn as a map. The List shows the same people.',
  mapLoading: 'Drawing your circle…',
  mapFailed: "The map didn't open. Try again in a moment.",
  mapNoLinks: 'Link people to each other and the lines show up here.',
  mapNoLinksFiltered: 'Nobody here is linked yet. Try Everyone.',
  mapHint: "Tap someone to open them. Lines show who's linked to whom.",
  mapCovered: 'Tap to show your map.',
  mapAddForYou: 'Link someone to you',
  mapPrivateName: 'Private',
  mapYou: 'You',
  mapConnectionCount: (count: number) =>
    count === 1 ? '1 connection' : `${count} connections`,
  mapOpen: 'Open',
  mapAddConnection: 'Add a connection',
  mapCardClose: 'Close',
  mapLegendOpen: 'Lines and layout',
  mapLegendTitle: 'Lines and layout',
  mapLegendFamily: 'Family',
  mapLegendCouple: 'Couple',
  mapLegendFriend: 'Friends',
  mapLegendWork: 'Work',
  mapLegendFigured: 'Figured out',
  mapLegendFiguredLine:
    'Lighter lines are links worked out from what you said.',
  mapLegendPast: 'Past couple',
  mapLegendPastLine: 'Faint lines are couples who are no longer together.',
  mapLegendMoveLine:
    'Drag a person to place them. Where you put them stays on this phone.',
  mapResetLayout: 'Reset layout',
  mapResetLayoutLine: 'Put everyone back where they started.',
  mapResetDone: 'Layout reset.',
  figuredDuplicate: 'You already linked these two meanwhile.',
  figuredGone: "That link isn't worked out any more.",
  contactAddPhone: 'Add a phone',
  contactAddEmail: 'Add an email',
  contactPrimary: 'Primary',
  contactPhoneTitle: 'Phone number',
  contactEmailTitle: 'Email address',
  contactNewPhoneTitle: 'New phone number',
  contactNewEmailTitle: 'New email address',
  contactPhoneField: 'Number',
  contactEmailField: 'Address',
  contactLabelField: 'Label',
  contactOwnLabel: 'Your own word',
  contactOwnLabelPlaceholder: 'Your own word',
  contactCall: 'Call',
  contactText: 'Text',
  contactWriteEmail: 'Email',
  contactCopy: 'Copy',
  contactCopySubtitle: 'Put it on the clipboard',
  contactMakePrimary: 'Make primary',
  contactMakePrimarySubtitle: 'The one tried first',
  contactChange: 'Change',
  contactChangeSubtitle: 'The number or address, or its label',
  contactRemove: 'Remove',
  contactRemoveSubtitle: 'You can undo it right after',
  contactSave: 'Save',
  contactCopied: 'Copied',
  contactCopyFailed: "Couldn't copy that.",
  contactRemovedToast: (value: string) => `Removed ${value}`,
  contactMadePrimaryToast: (value: string) => `${value} is primary now`,
  contactEmpty: (kind: 'phone' | 'email') =>
    kind === 'phone' ? 'Type a number first.' : 'Type an address first.',
  contactDuplicate: (kind: 'phone' | 'email') =>
    kind === 'phone'
      ? "That number's already there."
      : 'That address is already there.',
  contactFull: (max: number) =>
    `That is as many as fit (${max}). Remove one to add another.`,
  contactEditPhones: 'Phone numbers',
  contactEditEmails: 'Emails',
  contactRemoveEntry: (value: string) => `Remove ${value || 'this entry'}`,
  contactNumberPlaceholder: 'Number',
  contactAddressPlaceholder: 'Address',
  whoNameMissing: 'A name is needed.',
  editSave: 'Save',
  editCancel: 'Cancel',
  editNeedsConnection: 'Saving changes needs a connection.',
  editFailed: "That didn't save. Try again.",
  editGone: 'This page is gone.',
  questionGone: (kind: string) =>
    kind === 'whichIsTrue'
      ? 'That changed since.'
      : kind === 'whichComesFirst'
        ? 'That changed since.'
        : kind === 'whichTopic'
          ? 'That note or one of those topics was removed.'
          : kind === 'groupTopics'
            ? 'Those topics changed since.'
            : kind === 'undoOffer'
              ? 'That was already taken back.'
              : kind === 'whichPlace'
                ? 'That place was removed.'
                : 'That person was removed.',
  editUnreadable: "This page couldn't be opened.",
  whoTierTitle: 'How close',
  whoTierHelp: (assistant: string) =>
    `${assistant} won't change this once you set it.`,
  tierPassing: 'Passing',
  tierSetToast: (name: string, tier: string) => `Set ${name} to ${tier}`,
  forgetNeedsConnection: 'Forgetting needs a connection.',
  forgetFailed: "That didn't work. Nothing was forgotten.",
  forgetConfirmWho: (
    name: string,
    tasks: number,
    photos: number,
    facts: number,
    dates: number,
    moments: number,
    connections: number,
  ) =>
    `${
      tasks === 0
        ? `Forget ${name}? No tasks are linked to them.`
        : `Forget ${name}? ${tasks === 1 ? '1 task stays' : `${tasks} tasks stay`}, with no person.`
    }${forgetFactsLine(facts)}${forgetDatesLine(dates)}${forgetMomentsLine(moments)}${forgetConnectionsLine(connections)}${forgetPhotosLine(photos)}`,
  forgetConfirmPlace: (
    name: string,
    tasks: number,
    photos: number,
    facts: number,
  ) =>
    `${
      tasks === 0
        ? `Forget ${name}? No tasks are linked to it.`
        : `Forget ${name}? ${tasks === 1 ? '1 task stays' : `${tasks} tasks stay`}, with no place.`
    }${forgetFactsLine(facts)}${forgetPhotosLine(photos)}`,
  forgetPartial: (name: string) =>
    `Some links may already be gone. Open ${name} to check.`,
  forgetAction: 'Forget',
  forgotToast: (name: string, tasks: number) =>
    tasks === 0
      ? `Forgot ${name}`
      : `Forgot ${name}, taken off ${tasks === 1 ? '1 task' : `${tasks} tasks`}`,
  forgotUndone: (name: string) => `Brought back ${name}`,
  forgotUndoneWithoutPhotos: (name: string) =>
    `Brought back ${name}, but not the photos.`,
  forgotUndoneWithoutDates: (name: string) =>
    `Brought back ${name}, but not their dates.`,
  forgotUndoFailed: "That couldn't be brought back.",
  placeEditMenu: 'Change details',
  placeEditTitle: 'Change place',
  placeAddressField: 'Address',
  placeIsHome: 'This is home',
  placeIsHomeHelp: 'Only one place is home. Choosing this one moves it.',
  linkedPerson: 'Person',
  linkedPet: 'Pet',
  linkedOrganization: 'Organization',
  linkedPlace: 'Place',
  photosTitle: 'Photos',
  photoAdd: 'Add a photo',
  photoChoose: 'Choose a photo',
  photoAdding: 'Adding the photo…',
  photoFullShort: `Holds ${PHOTOS_PER_RECORD} photos already`,
  photoMenuLabel: (name: string) => `Add a photo of ${name}`,
  photoFull: `This page holds up to ${PHOTOS_PER_RECORD} photos. Remove one to add another.`,
  photoAdded: 'Photo added',
  photoFailed: "That photo didn't save. Try again.",
  photoNeedsConnection: 'Adding a photo needs a connection.',
  photoRemoveNeedsConnection: 'Removing a photo needs a connection.',
  photoGone: 'This page is gone, so the photo was not kept.',
  photoLabel: (name: string, position: number) => `${name}, photo ${position}`,
  photoOfTotal: (name: string, position: number, total: number) =>
    total > 1 ? `${name}, photo ${position} of ${total}` : name,
  photosTitleCounted: (count: number) =>
    `Photos · ${count} of ${PHOTOS_PER_RECORD}`,
  photoMainBadge: 'Main',
  photoSheetTitle: 'Photo',
  photoOpenFull: 'Open full screen',
  photoMakeMain: 'Make main photo',
  photoMakeMainSubtitle: (name: string) =>
    `Shown first, and beside ${name} in your lists`,
  photoMakeMainPlaceSubtitle: 'Shown first on this page',
  photoMadeMain: 'Made the main photo',
  photoMainBack: 'Main photo put back',
  photoMakeMainFailed: "That didn't change. Try again.",
  photoRemove: 'Remove photo',
  photoRemoveSubtitle:
    'Deletes it from your account. You can undo it right after.',
  photoRemoved: 'Photo removed',
  photoRemoveFailed: "That photo wasn't removed. Try again.",
  photoRestored: 'Photo put back',
  photoRestoreFailed: "That photo couldn't be put back.",
  photoUnreadable: "This photo can't be opened here.",
  photoViewerLabel: 'Photos',
  keyDatesHeading: 'Key dates',
  keyDateAdd: 'Add a date',
  keyDateAddRow: 'Add a key date',
  keyDateKindBirthday: 'Birthday',
  keyDateKindAnniversary: 'Anniversary',
  keyDateKindCustom: 'Something else',
  momentKindMet: 'Met',
  momentKindMoved: 'Moved',
  momentKindStartedJob: 'Started a job',
  momentKindLeftJob: 'Left a job',
  momentKindGraduated: 'Graduated',
  momentKindAdopted: 'Adopted',
  momentKindPassedAway: 'Passed away',
  momentsHeading: 'Moments',
  momentAdd: 'Add a moment',
  momentSeeAll: (count: number) => `See all ${count} moments`,
  momentsScreenTitle: (name: string) => `${name}'s moments`,
  momentsEmpty: (assistant: string) =>
    `No moments yet. Tell ${assistant} when something happened, or add one.`,
  momentsLoading: 'Opening moments',
  momentsFailed: "The moments didn't open. Close this page and open it again.",
  momentDecade: (decade: string) => `Sometime in ${decade}`,
  momentNewTitle: 'Add a moment',
  momentEditTitle: 'Edit moment',
  momentAddSave: 'Add moment',
  momentOnce: "Happened once. It won't show on Today.",
  momentAdded: (title: string) => `Added ${title}`,
  momentRemoved: (title: string) => `Removed ${title}`,
  momentPrecisionLabel: 'How well do you know when?',
  momentPrecisionDay: 'Day',
  momentPrecisionMonth: 'Month',
  momentPrecisionYear: 'Year',
  momentPrecisionDecade: 'Decade',
  momentPrecisionHelpDay: 'The exact day',
  momentPrecisionHelpMonth: 'Just the month and year',
  momentPrecisionHelpYear: 'Just the year',
  momentPrecisionHelpDecade: 'Just the decade',
  momentDecadeLabel: 'Decade',
  momentYearNeeded: 'Add the year.',
  momentMonthNeeded: 'Pick the month.',
  momentFull: (name: string) =>
    `${name} has ${HELM_CAPS.momentsPerWho} moments, the most that are kept.`,
  keyDateYearUnknown: 'Year not known',
  keyDateAddYear: 'Add year',
  keyDateDayUnknown: 'Day not known, so not on Today',
  keyDateAddDay: 'Add day',
  keyDateTurns: (age: number, weekday: string) => `turns ${age} on ${weekday}`,
  keyDateYearsOn: (years: number, day: string) =>
    `${years} ${years === 1 ? 'year' : 'years'} on ${day}`,
  keyDateComesBack: 'Comes back each year',
  keyDateSourceSaid: (day: string) => `You said · ${day}`,
  keyDateSourceGoogle: (day: string) => `From Google Contacts, ${day}`,
  keyDateSourceAdded: 'You added this',
  keyDateSheetEdit: 'Edit',
  keyDateSheetRemove: 'Remove',
  keyDateEditTitle: (title: string) =>
    `Edit ${title.replace(/^Your /, 'your ')}`,
  keyDateEditUnknown: 'Edit date',
  keyDateReadFailed: "Couldn't open this date just now.",
  keyDateWhichIsRight: 'Which date is right? Change it here.',
  keyDateGoneMeanwhile: 'This date changed meanwhile and is no longer here.',
  keyDateClose: 'Close',
  keyDateNoDayHint: "Without a day it won't show on Today.",
  keyDateDayPlaceholder: '12',
  keyDateYearPlaceholder: '1990',
  keyDateLabelSuggestionsLabel: 'Some ideas',
  keyDateLabelSuggestions: {
    person: [],
    pet: ['Gotcha day'],
    organization: ['Opened', 'Lease renews'],
  },
  keyDatesUnreadable: "Couldn't open dates just now.",
  backGeneric: 'Back',
  backToday: 'Today',
  keyDateNewTitle: 'Add a date',
  keyDateKindLabel: 'What is it?',
  keyDateMonthLabel: 'Month',
  keyDateDayLabel: 'Day',
  keyDateYearLabel: 'Year',
  keyDateOptional: 'Optional',
  keyDateNameLabel: 'What it is called',
  keyDateNamePlaceholder: 'Gotcha day',
  keyDateSave: 'Save',
  keyDateAddSave: 'Add date',
  keyDateNeedsConnection: 'Needs a connection to save',
  keyDateMonthAlone: 'Add a day or a year too.',
  keyDateBadDay: "That day isn't in that month.",
  keyDateBadYear: "That year doesn't look right.",
  keyDateNeedsName: `Give it a name, up to ${KEY_DATE_LABEL_MAX} characters.`,
  keyDateHasBirthday: 'There is already a birthday. Edit that one.',
  keyDateFull: (name: string) =>
    `${name} has ${HELM_CAPS.yearlyPerWho} dates, the most that are kept.`,
  keyDateTooMany: `${HELM_CAPS.keyDates.toLocaleString('en-US')} dates are kept, the most there can be.`,
  keyDateFailed: "That didn't save. Try again.",
  keyDateChangedMeanwhile:
    'That date changed on another device. Close this and open it again.',
  keyDateAdded: (title: string) => `Added ${title}`,
  keyDateSaved: 'Date saved',
  keyDateRemoved: (title: string) => `Removed ${title}`,
  keyDateUndone: 'Put back',
  keyDateUndoFailed: "That couldn't be put back.",
  keyDateUndoChanged: 'That changed since, so it was left alone.',
  keyDateRemoveFailed: "That wasn't removed. Try again.",
  keyDateYours: 'Your',
  keyDateOwn: (name: string) => `${name}'s`,
  keyDateWith: (name: string) => ` with ${name}`,
  keyDateTodayWord: 'today',
  keyDateTomorrowWord: 'tomorrow',
  keyDateTurnsLine: (name: string, age: number) => `${name} turns ${age}`,
  keyDatesMoreThisWeek: (count: number) => `+${count} more this week`,
  keyDatesWeekLabel: 'Dates this week',
  comingUpTitle: 'Coming up',
  comingUpSubtitle:
    'Birthdays, anniversaries and other dates that come back, for the next 12 months.',
  comingUpEmpty: (name: string) =>
    `No birthdays or anniversaries yet. Tell ${name} one, or add it on someone's page.`,
  comingUpShowEveryone: 'Show everyone',
  comingUpPassingHint: (count: number) =>
    `${count} more ${count === 1 ? 'date' : 'dates'} from people you only mention in passing. Turn on Show everyone to see ${count === 1 ? 'it' : 'them'}.`,
  comingUpFailed: "Your dates didn't open. Close this page and open it again.",
  comingUpToday: 'Today',
  comingUpTomorrow: 'Tomorrow',
  comingUpShowMore: (count: number, month: string) =>
    `Show ${count} more in ${month}`,
  comingUpSearchLabel: 'Search dates',
  comingUpSearchNone: 'No date matches that.',
  comingUpAge: (age: number) => `turns ${age}`,
  comingUpYears: (years: number) =>
    `${years} ${years === 1 ? 'year' : 'years'}`,
  comingUpNoneShown: 'Nothing coming up for the people shown.',
  comingUpTile: 'Coming up',
  askComingUp: 'Ask about what is coming up',
  chipComingUp: 'About what is coming up',
  backToComingUp: 'Back to Coming up',
  resultKeyDateFallback: 'A date',
  tookBackKeyDates: (count: number) =>
    `Took back ${count} ${count === 1 ? 'date' : 'dates'}`,
  undoReportKeyDates: (takenBack: number, kept: number, gone: number) =>
    [
      `Took back ${takenBack} ${takenBack === 1 ? 'date' : 'dates'}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  undoReportKeyDatesToo: (count: number) =>
    `${count === 1 ? '1 date' : `${count} dates`} too.`,
  undoReportProjects: (takenBack: number, kept: number, gone: number) =>
    [
      `Took back ${takenBack} ${takenBack === 1 ? 'project' : 'projects'}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  tookBackNotes: (count: number) =>
    `Took back ${count} ${count === 1 ? 'note' : 'notes'}`,
  undoReportNotes: (takenBack: number, kept: number, gone: number) =>
    [
      `Took back ${takenBack} ${takenBack === 1 ? 'note' : 'notes'}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  undoTopicPhrase: toTopicPhrase,
  undoTopicChanges: (count: number, name: string | null, isGrouping = false) =>
    `Took back ${toTopicPhrase(count, name, isGrouping)}`,
  undoReportTopics: (
    count: number,
    name: string | null,
    kept: number,
    gone: number,
    isGrouping = false,
  ) =>
    [
      `Took back ${toTopicPhrase(count, name, isGrouping)}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  undoReportTopicsToo: (
    count: number,
    name: string | null,
    isGrouping = false,
  ) => `${toTopicPhrase(count, name, isGrouping)} too.`,
  undoProcedurePhrase: toProcedurePhrase,
  undoProcedureChanges: (count: number, name: string | null) =>
    `Took back ${toProcedurePhrase(count, name)}`,
  undoReportProcedures: (
    count: number,
    name: string | null,
    kept: number,
    gone: number,
  ) =>
    [
      `Took back ${toProcedurePhrase(count, name)}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  undoReportProceduresToo: (count: number, name: string | null) =>
    `${toProcedurePhrase(count, name)} too.`,
  undoRunChanges: (deleted: string[], unticked: number) =>
    toCapital(toRunParts(deleted, unticked).join(' and ')),
  undoRunPhrase: (deleted: string[], unticked: number) =>
    toRunParts(deleted, unticked).join(' and '),
  undoReportRuns: (
    deleted: string[],
    unticked: number,
    kept: number,
    gone: number,
  ) =>
    [
      `${toRunParts(deleted, unticked).map(toCapital).join('. ')}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  undoReportRunsToo: (deleted: string[], unticked: number) =>
    `${toRunParts(deleted, unticked).map(toCapital).join('. ')}.`,
  undoHabitChanges: (ticked: number, changed: number) =>
    toCapital(toHabitParts(ticked, changed).join(' and ')),
  undoHabitPhrase: (ticked: number, changed: number) =>
    toHabitParts(ticked, changed).join(' and '),
  undoReportHabits: (
    ticked: number,
    changed: number,
    kept: number,
    gone: number,
  ) =>
    [
      `${toHabitParts(ticked, changed).map(toCapital).join('. ')}.`,
      kept > 0 ? `Kept ${kept} you changed since.` : '',
      gone > 0 ? `${gone} ${gone === 1 ? 'was' : 'were'} deleted since.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  undoReportHabitsToo: (ticked: number, changed: number) =>
    `${toHabitParts(ticked, changed).map(toCapital).join('. ')}.`,
  resultHabitFallback: 'Habit',
  undoReportNoteUnfiled: 'Took the note back out of those topics.',
  tookBackNoteUnfiled: 'Took the note back out of those topics',
  undoReportNotesToo: (count: number) =>
    `${count === 1 ? '1 note' : `${count} notes`} too.`,
  undoReportProjectsToo: (count: number) =>
    `${count === 1 ? '1 project' : `${count} projects`} too.`,
  askProject: (name: string) => `Ask about ${name}`,
  askProjects: 'Ask about your projects',
  chipProjects: 'About your projects',
  projectsTitle: 'Projects',
  projectsFailed: "Your projects couldn't be opened.",
  projectsEmpty:
    'Nothing started yet. Say "start a project for the move" or tap New project.',
  projectsNew: 'New project',
  projectsFinishedRow: (count: number) => `Finished · ${count}`,
  projectsFinishedHide: 'Hide finished',
  backToProjects: 'Back to Projects',
  backToProject: (name: string) => `Back to ${name}`,
  habitsTitle: 'Habits',
  habitsFailed: "Your habits couldn't be opened.",
  habitsEmpty:
    'Nothing here yet. Say "remind me to take vitamin D every morning", or add one yourself.',
  habitsAdd: 'Add a habit',
  habitsStoppedRow: (count: number) => `Stopped · ${count}`,
  habitsStoppedHide: 'Hide stopped',
  habitsPausedUntil: (date: string) => `Paused until ${date}`,
  habitsPausedOpen: 'Paused for a while',
  habitsStoppedOn: (date: string) => `Stopped ${date}`,
  habitsWeekLine: (done: number, due: number) => `${done} of ${due} this week`,
  habitsStartsToday: 'Starts today',
  habitsStartsOn: (day: string) => `Starts ${day}`,
  habitsNothingYet: 'Nothing asked yet this week',
  askHabits: 'Ask about your habits',
  chipHabits: 'About your habits',
  backToHabits: 'Back to Habits',
  askHabit: (name: string) => `Ask about ${name}`,
  backToHabit: (name: string) => `Back to ${name}`,
  habitGone: 'This habit is gone.',
  habitUnreadable: "This habit couldn't be opened.",
  habitMarkDone: (name: string) => `Mark ${name} done`,
  habitMarkNotDone: (name: string) => `Take back ${name}`,
  habitAddOne: (name: string) => `Add one to ${name}`,
  habitLineCount: (name: string, count: number, perDay: number) =>
    count > perDay
      ? `${name} · ${count} today`
      : `${name} · ${count} of ${perDay}`,
  habitMetaThroughDay: 'Through the day',
  habitMetaUntil: (time: string) => `until ${time}`,
  habitMetaEnded: (time: string) => `Window ended ${time}`,
  habitDoneAt: (time: string) => `Done ${time}`,
  habitLastAt: (time: string) => `Last at ${time}`,
  habitSkippedLine: 'Skipped today',
  habitSkip: 'Skip',
  habitSkipLabel: (name: string) => `Skip ${name} today`,
  habitUndo: 'Undo',
  habitNotSaved: "That didn't save. Try again.",
  habitCadenceEveryDay: 'Every day',
  habitCadenceWeek: (count: number) =>
    count === 1 ? 'Once a week' : `${count} times a week`,
  habitCadenceEveryN: (days: number) => `Every ${days} days`,
  habitWeekdaysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  habitWeekdaysLong: [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ],
  habitWindowsThroughDay: 'Through the day',
  habitWindowsCount: (count: number) =>
    count === 1 ? 'Once a day' : `${count} times a day`,
  habitSinceBySaid: (date: string) => `Since ${date} · from what you said`,
  habitSinceByHand: (date: string) => `Since ${date} · added by you`,
  habitWeekDayLabel: (day: string, state: string) => `${day}: ${state}`,
  habitWeekDone: 'marked',
  habitWeekOpen: 'not marked',
  habitWeekLater: 'still to come',
  habitWeekOff: 'not asked',
  habitWeekReached: 'reached the number',
  habitWeekSkipped: 'skipped',
  habitNotesTitle: 'Notes',
  habitNoteHeading: (day: string, label: string | null) =>
    label ? `${day} · ${label.toLowerCase()}` : day,
  habitNotesShowAll: (count: number) => `Show all ${count} notes`,
  habitNotesShowFewer: 'Show fewer',
  habitNotesField: 'Notes',
  habitNotesPlaceholder: 'Anything worth remembering about it',
  habitWhenRow: 'When',
  habitMenuEdit: 'Change name, emoji or notes',
  habitMenuPause: 'Pause for a while',
  habitMenuResume: 'Resume now',
  habitMenuStop: 'Stop this habit',
  habitMenuRestart: 'Start again',
  habitCareRowTitle: 'This is medicine or care',
  habitCareRowSubtitle: (assistant: string) =>
    `Kept private, and ${assistant} never moves it, only asks.`,
  habitCareForWho: 'Always on for someone you look after.',
  habitMedicineQuestion: 'Which medicine is it?',
  habitMedicineHelp: (assistant: string) =>
    `${assistant} will say it each time you tick it, so a wrong tick is caught at once.`,
  habitMedicineField: 'Medicine',
  habitMedicinePlaceholder: 'Name',
  habitDoseField: 'Dose (optional)',
  habitDosePlaceholder: 'Dose',
  habitMedicineSave: 'Save',
  habitMedicineNotNow: 'Not now',
  habitMedicineFailed: "That didn't save. Try again.",
  habitCareOnToast: (name: string) => `${name} is kept private as care`,
  habitForWho: (name: string) => `For ${name}`,
  habitWhoQuestion: 'Who is it for?',
  habitWhoLabel: 'Who it is for',
  habitWhoYou: 'You',
  habitWhoSummary: (name: string | null) => name ?? 'You',
  habitCareOffTitle: 'Not medicine or care?',
  habitCareOffMessage: (name: string) =>
    `${name} stops being kept private, and is treated like any other habit.`,
  habitCareOffAction: 'Not medicine or care',
  habitCareKeep: 'Keep it',
  habitCareNeedsConnection: 'Changing this needs a connection.',
  habitCareFailed: "That didn't change. Try again.",
  habitEditTitle: 'Change habit',
  habitEditName: 'Name',
  habitEditEmoji: 'Emoji',
  habitEditSave: 'Save',
  habitEditNameMissing: 'A habit needs a name.',
  habitEditNeedsConnection: 'Changing a habit needs a connection.',
  habitEditFailed: "That didn't save. Try again.",
  habitWhenTitle: 'Days and times',
  habitWhenHint:
    'Times are on your own clock. A time that passes stays quiet and can still be ticked.',
  habitWhenOftenLabel: 'How often',
  habitWhenTimesLabel: 'When',
  habitWhenTimesHeading: 'When in the day',
  habitWhenWeekdaysLabel: 'Which days',
  habitWhenWeekCountLabel: 'Times a week',
  habitWhenPerDayLabel: 'Times a day',
  habitWhenNeedsDay: 'Pick at least one day.',
  habitWhenNeedsWindow: 'Pick at least one time of day.',
  habitWhenBadWindow: 'A time needs a start and an end, ending by 3:00 AM.',
  habitWindowName: 'Name of this time',
  habitWindowRemove: (label: string) => `Remove ${label || 'this time'}`,
  habitWhenStart: 'Starts',
  habitWhenEnd: 'Ends',
  habitWhenSave: 'Save',
  habitOftenEveryDay: 'Every day',
  habitOftenDays: 'Certain days',
  habitOftenWeek: 'A few times a week',
  habitModeParts: 'At set times',
  habitModeAny: 'Any time of the day',
  habitModeCount: 'A number a day',
  habitPartLabels: {
    morning: 'Morning',
    midday: 'Midday',
    afternoon: 'Afternoon',
    evening: 'Evening',
    bedtime: 'Bedtime',
  },
  habitPauseTitle: (name: string) => `Pause ${name}`,
  habitPauseHint:
    "It's off from today, and paused days don't count against it.",
  habitPauseQuickLabel: 'How long',
  habitPauseWeek: 'A week',
  habitPauseTwoWeeks: 'Two weeks',
  habitPauseOpen: 'Until I resume',
  habitPauseUntil: 'Or pick the day it is back on',
  habitPauseAction: 'Pause',
  habitPauseNeedsDay: 'Pick a day after today.',
  habitPausedToast: (name: string, date: string) =>
    `Paused ${name} until ${date}`,
  habitPausedOpenToast: (name: string) => `Paused ${name}`,
  habitResumedToast: (name: string) => `${name} is back on Today`,
  habitStopTitle: (name: string) => `Stop ${name}?`,
  habitStopMessage: 'Off Today for good. Its weeks stay.',
  habitStopAction: 'Stop habit',
  habitStoppedToast: (name: string) => `Stopped ${name}`,
  habitRestartedToast: (name: string) => `${name} is on Today again`,
  habitStatusFailed: "That didn't change. Try again.",
  habitUndoFailed: "That couldn't be taken back. Try again.",
  habitFlowTitle: 'New habit',
  habitFlowNameQuestion: 'What do you want to keep up?',
  habitFlowNamePlaceholder: 'Take vitamin D',
  habitFlowNameLabel: 'Habit',
  habitFlowOftenQuestion: 'How often?',
  habitFlowOftenLabel: 'How often',
  habitFlowWhenQuestion: 'When in the day?',
  habitFlowWhenLabel: 'When',
  habitFlowCareQuestion: 'Is this medicine or care?',
  habitFlowCareLabel: 'Medicine or care',
  habitFlowCareHint:
    "It's kept private, and only ever asked about, never moved around.",
  habitFlowYes: 'Yes, medicine or care',
  habitFlowNo: 'No, just a habit',
  habitFlowNotesQuestion: 'Anything to remember about it?',
  habitFlowNotesLabel: 'Notes',
  habitFlowNone: 'None',
  habitFlowSkip: 'Skip',
  habitFlowNext: 'Next',
  habitFlowCreate: 'Add habit',
  habitFlowTooMany: (limit: number) =>
    `You have ${limit} habits going. Stop one to add another.`,
  habitFlowDuplicate: (name: string) => `You already have ${name}.`,
  habitCreatedToast: (name: string) => `Added ${name}`,
  habitCreateFailed: "That didn't add. Try again.",
  habitMaskedName: 'Private habit',
  habitCheckInTakenBack: 'Took that back.',
  habitCheckInFailed: "That didn't tick. Try again.",
  habitAlreadyDoneAt: (subject: string, time: string) =>
    `${subject} already done at ${time}.`,
  habitAlreadyDoneParts: (name: string, parts: string[]) =>
    `${name} already done: ${parts.join(', ')}.`,
  habitAlreadyDonePart: (label: string, time: string) => `${label} at ${time}`,
  habitUndoKept: 'Kept it as it is now: it changed after that.',
  projectGone: 'This project is gone.',
  projectUnreadable: "This project couldn't be opened.",
  projectUntitled: 'A project',
  projectAllDone: 'Everything is done. Finish this project?',
  projectFinishButton: 'Finish',
  projectOnTrack: 'On track: nothing overdue',
  projectOverdue: (count: number) => `${count} overdue`,
  projectNoTasks: 'No tasks yet',
  projectOpenNoDates: (open: number) => `${open} open, no dates yet`,
  projectNextDue: (title: string, days: number) => {
    const short =
      title.length > 40 ? `${title.slice(0, 39).trimEnd()}…` : title;
    return days === 0
      ? `${short} today`
      : days === 1
        ? `${short} tomorrow`
        : `${short} in\u00a0${days}\u00a0days`;
  },
  projectKeyOpen: (name: string, note: string | null, count: number) =>
    `${name}${note ? ` (${note})` : ''} has ${count} open`,
  projectQuiet: (days: number, open: number) =>
    `Nothing done in ${days} days · ${open} open`,
  goalNoStep: 'No regular step yet',
  goalWeeksLine: (met: number, of: number) =>
    `Showed up ${met} of the last ${of} weeks`,
  goalLastReached: (title: string, dayLabel: string) => {
    const short =
      title.length > 40 ? `${title.slice(0, 39).trimEnd()}…` : title;
    return `Reached ${short} on ${dayLabel}`;
  },
  projectTargetLine: (
    dateLabel: string,
    daysAway: number,
    isFinished: boolean,
  ) =>
    daysAway > 0
      ? `${dateLabel} · in ${daysAway} ${daysAway === 1 ? 'day' : 'days'}`
      : daysAway === 0
        ? `${dateLabel} · today`
        : isFinished
          ? `Target was ${dateLabel}`
          : `Target was ${dateLabel} · ${-daysAway} ${daysAway === -1 ? 'day' : 'days'} ago`,
  projectTabTasks: 'Tasks',
  projectTabMilestones: 'Milestones',
  projectTabPeople: 'People',
  projectTabsLabel: 'Project sections',
  projectTasksEmpty: (name: string, doneCount: number) =>
    doneCount > 0
      ? `No open tasks · ${doneCount} done`
      : `No tasks yet. Say "add a task for ${name}" to put one here.`,
  projectTasksShowAll: (count: number) => `Show all ${count}`,
  projectTasksShowFewer: 'Show fewer',
  doneTasksFold: (count: number) => `Done · ${count}`,
  doneTasksHide: 'Hide done',
  clearDoneTasks: (count: number) =>
    count === 1 ? 'Clear 1 done task' : `Clear ${count} done tasks`,
  clearDoneNone: 'There was nothing left to clear.',
  doneTasksCleared: (count: number) =>
    `Cleared ${count} done ${count === 1 ? 'task' : 'tasks'}`,
  clearDoneNeedsConnection: 'Clearing done tasks needs a connection.',
  milestoneAdd: 'Add milestone',
  milestonesEmpty: "No milestones. Add one if there's a date that matters.",
  milestoneNoDate: 'No date',
  milestoneWhen: (dateLabel: string, days: number) =>
    days > 0
      ? `${dateLabel} · in\u00a0${days}\u00a0${days === 1 ? 'day' : 'days'}`
      : days === 0
        ? `${dateLabel} · today`
        : `${dateLabel} · ${-days}\u00a0${days === -1 ? 'day' : 'days'} ago`,
  milestoneReachedFold: (count: number) => `Reached · ${count}`,
  milestoneReachedHide: 'Hide reached',
  milestoneMarkReached: (title: string) => `Mark ${title} reached`,
  milestoneMarkNotReached: (title: string) => `Mark ${title} not reached`,
  milestoneAddTitle: 'Add milestone',
  milestoneEditTitle: 'Change milestone',
  milestoneTitleField: 'Title',
  milestoneTitlePlaceholder: 'Venue booked',
  milestoneDateField: 'Date (optional)',
  milestoneTitleMissing: 'A title is needed.',
  milestoneDeleteConfirm: (title: string) => `Delete ${title}?`,
  milestoneAddedToast: (title: string) => `Added ${title}`,
  milestoneChangedToast: (title: string) => `Saved ${title}`,
  milestoneDeletedToast: (title: string) => `Deleted ${title}`,
  milestoneReachedToast: (title: string) => `Reached ${title}`,
  milestoneReopenedToast: (title: string) => `${title} is open again`,
  milestonesFull: 'A project holds up to 30 milestones.',
  milestoneGone: 'This milestone is gone.',
  projectPeopleEmpty: 'No one is on this project yet.',
  projectKeyPerson: 'key person',
  projectInvolvedPerson: 'involved',
  projectKeyHeading: 'Key people',
  projectInvolvedHeading: 'Involved',
  projectMentionedFold: (count: number) => `Also mentioned · ${count}`,
  projectMentionedHide: 'Hide mentioned',
  projectAddSomeone: 'Add someone',
  projectAddTitle: 'Add someone',
  projectAddPick: 'Who',
  projectAddSearch: 'Search people',
  projectAddNew: 'Someone new',
  projectAddNewPlaceholder: 'Their name',
  projectAddRole: 'Their part',
  projectAddAction: 'Add',
  projectAddNeedsPerson: 'Pick someone or type a name.',
  projectRoleKey: 'Key',
  projectRoleInvolved: 'Involved',
  projectRoleMentioned: 'Mentioned',
  projectRoleTitle: (name: string) => name,
  projectRoleField: 'Their part',
  projectRoleNoteField: 'A note',
  projectRoleNotePlaceholder: 'How they fit, like the florist',
  projectRoleSave: 'Save',
  projectRoleOffMenu: 'Take off this project',
  projectRoleOpenPage: 'Open their page',
  projectRoleSet: (name: string, role: string) => `${name} is ${role}`,
  projectRoleAdded: (name: string, project: string) =>
    `Added ${name} to ${project}`,
  projectRoleOff: (name: string, project: string) =>
    `Took ${name} off ${project}`,
  projectRoleNoteSaved: (name: string) => `Saved the note for ${name}`,
  projectRoleFailed: "That didn't save. Try again.",
  projectMenuEdit: 'Change name, objective or date',
  projectMenuEditHint: 'What it is called, what done looks like, when',
  projectMenuFinish: 'Mark finished',
  projectMenuDelete: 'Delete project',
  projectEditTitle: 'Change project',
  projectNameField: 'Name',
  projectEmojiField: 'Emoji',
  projectObjectiveField: 'What does done look like?',
  projectDateField: 'Target date',
  projectNameMissing: 'A name is needed.',
  projectFinishedToast: (name: string, open: number) =>
    open === 0
      ? `Finished ${name}`
      : `Finished ${name} · ${open} ${open === 1 ? 'task' : 'tasks'} still open`,
  projectReopenedToast: (name: string) => `Reopened ${name}`,
  projectFinishedBar: (dateLabel: string) => `Finished ${dateLabel}`,
  projectReopen: 'Reopen',
  projectDeleteConfirm: (name: string, tasks: number, done: number) =>
    `Delete ${name}? ${
      tasks === 0
        ? 'It has no tasks.'
        : `Its ${tasks === 1 ? '1 task' : `${tasks} tasks`}${done > 0 ? ` (${done} done)` : ''} ${tasks === 1 ? 'stays' : 'stay'}, with no project;`
    } its people keep their pages.`,
  projectDeleteAction: 'Delete',
  projectDeletedToast: (name: string) => `Deleted ${name}`,
  projectDeletedBack: (name: string) => `Brought back ${name}`,
  projectDeleteNeedsConnection: 'Deleting a project needs a connection.',
  projectDeleteFailed: "That couldn't be deleted. Try again.",
  projectDeletePartial: (name: string) =>
    `Some of ${name}'s tasks may still be linked. Check and try again.`,
  projectUndoFailed: "That couldn't be taken back. Try again.",
  projectFlowTitle: 'New project',
  projectFlowNameQuestion: 'What is it called?',
  projectFlowNamePlaceholder: 'The wedding',
  projectFlowNameLabel: 'Name',
  projectFlowEmojiLabel: 'Emoji',
  projectFlowObjectiveQuestion: 'What does done look like?',
  projectFlowObjectivePlaceholder: 'Married on June 20 with everyone there',
  projectFlowObjectiveLabel: 'Done looks like',
  projectFlowDateQuestion: 'Is there a date?',
  projectFlowDateLabel: 'Date',
  projectFlowSkip: 'Skip',
  projectFlowNone: 'None',
  projectFlowNext: 'Next',
  projectFlowCreate: 'Start project',
  projectFlowDuplicate: (name: string) => `You already have ${name} going.`,
  projectCreatedToast: (name: string) => `Started ${name}`,
  projectCreateFailed: "That didn't start. Try again.",
  projectRemoved: (name: string) => `Took back ${name}`,
  goalsTitle: 'Goals',
  goalsNew: 'New goal',
  goalsSetAsideRow: (count: number) => `Set aside · ${count}`,
  goalsSetAsideLine: (date: string) => `Set aside ${date}`,
  goalsSetAsideListLine: (date: string) => `Goal · Set aside ${date}`,
  goalsTidyRow: 'Want it tidied up?',
  goalsSetAsideHide: 'Hide set aside',
  goalsAskProjects: 'Ask about your projects and goals',
  projectKindTitle: 'Something to finish, or something to grow into?',
  projectKindProject: 'A project',
  projectKindProjectHint: 'Has a finish line, like a wedding or a move',
  projectKindGoal: 'A goal',
  projectKindGoalHint: 'Something you want to get better at, like guitar',
  goalFlowTitle: 'New goal',
  goalFlowNameQuestion: 'What do you want to grow into?',
  goalFlowNamePlaceholder: 'Get back into guitar',
  goalFlowWhyQuestion: 'Why does it matter to you?',
  goalFlowWhyLabel: 'Why',
  goalFlowWhyPlaceholder:
    'I used to play every night in college, and I miss it',
  goalFlowWhyHint: "Optional. It sits at the top of the goal's page.",
  goalFlowWhySkip: 'Skip for now',
  goalFlowWhySkipNote: 'You can add it later from the goal.',
  goalFlowStepQuestion: 'A regular step?',
  goalFlowStepLabel: 'Regular step',
  goalFlowStepHabit: 'A habit',
  goalFlowStepNone: 'Not yet',
  goalFlowStepSkipNote: 'You can add a habit later from the goal',
  goalFlowStepHint:
    'A small thing you do on a rhythm, like practising twice a week.',
  goalFlowHabitName: 'What will you do?',
  goalFlowHabitPlaceholder: 'Practice guitar',
  goalFlowCreate: 'Create goal',
  goalFlowDuplicate: (name: string) => `You already have ${name} going.`,
  goalFlowTooManyHabits: (limit: number) =>
    `You keep ${limit} habits already. Pick Not yet, and add this one after you let another go.`,
  goalCreatedToast: (name: string) => `Started ${name}`,
  goalCreateFailed: "That didn't start. Try again.",
  goalHabitFailed: (name: string) =>
    `${name} was made, but its regular step didn't save. Add it from the goal's page.`,
  goalKindLine: (date: string) => `A goal · since ${date}`,
  goalWhySaid: (date: string) => `You said ${date}`,
  goalWhyWrote: (date: string) => `You wrote ${date}`,
  goalWhyTidiedSaid: (date: string) => `Tidied from what you said · ${date}`,
  goalWhyTidiedWrote: (date: string) => `Tidied from what you wrote · ${date}`,
  goalWhyAdd: 'Add why it matters',
  goalWhySheetTitle: 'Why it matters',
  goalWhySeeSaid: 'See what I said',
  goalWhySeeWrote: 'See what I wrote',
  goalWhyHideOriginal: 'Hide it',
  goalWhyInShort: 'In short',
  goalWhySummaryHelp: (name: string) =>
    `${name}'s summary, used to link this goal to related things. It's never shown in place of your words.`,
  goalWhyChange: 'Change the why',
  goalWhyShowMine: 'Show mine instead',
  goalWhyChoiceFailed: "That didn't save. Try again.",
  goalTidyTitle: 'Want it tidied up?',
  goalTidyNote: 'Same meaning, fewer filler words. Your words stay either way.',
  goalTidyKeep: 'Keep mine',
  goalTidyUse: 'Use this',
  goalWhyField: 'Why it matters',
  goalWhyEditPlaceholder: 'Why does it matter to you?',
  goalEditTitle: 'Change goal',
  goalMenuEdit: 'Change name, why or emoji',
  goalMenuAside: 'Set it aside',
  goalMenuBackUp: 'Pick it back up',
  goalMenuFinish: 'Finish',
  goalMenuReopen: 'Reopen',
  goalMenuToProject: 'Turn into a project',
  goalMenuDelete: 'Delete goal',
  goalAsideToast: (name: string) => `Set ${name} aside`,
  goalBackUpToast: (name: string) => `Picked ${name} back up`,
  goalPickBackUp: 'Pick it back up',
  goalActionFailed: "That didn't change. Try again.",
  goalToProjectToast: (name: string) => `${name} is a project now`,
  goalDeletedToast: (name: string) => `Deleted ${name}`,
  goalHabitsKeptToast: (count: number, name: string) =>
    count === 1
      ? `${name} is now a habit on its own`
      : `${count} habits are now on their own`,
  goalHabitsHeading: 'Habits',
  goalHabitsAdd: 'Add a habit',
  goalHabitsNone: 'No regular step yet',
  goalTasksHeading: 'Tasks',
  goalMilestoneReachedToast: (title: string) => `${title} · Reached today`,
  goalHabitsKeep: (count: number) => (count === 1 ? 'Keep it' : 'Keep them'),
  goalHabitsKeepHint: (count: number) =>
    count === 1
      ? 'It stays as a habit on its own.'
      : 'They stay as habits on their own.',
  goalHabitsDelete: (count: number) =>
    count === 1 ? 'Delete it' : 'Delete them',
  goalHabitsDeleteHint: (count: number) =>
    count === 1
      ? 'It goes, with its reminders.'
      : 'They go, with their reminders.',
  goalHabitsChoiceLabel: (names: string[]) =>
    names.length === 1
      ? `What happens to ${names[0]}?`
      : `What happens to its ${names.length} habits?`,
  goalDeleteConfirm: (name: string) =>
    `${name} and its milestones will be deleted. Its tasks stay.`,
  goalDeleteAction: 'Delete goal',
  goalToProjectConfirm: (name: string) =>
    `${name} becomes a project, with a finish line instead of a why. Its milestones and tasks come with it.`,
  goalToProjectAction: 'Turn into a project',
  whoProjectsTitle: 'Projects',
  whoProjectPart: (role: 'key' | 'involved') =>
    role === 'key' ? 'Their part: key' : 'Their part: involved',
  showAllProjects: (count: number) => `Show all ${count} projects`,
  showFewerProjects: 'Show fewer',
  knowledgeTitle: 'Knowledge',
  knowledgeFailed: "Your knowledge couldn't be opened.",
  knowledgeEmpty: (assistant: string) =>
    `What you keep shows here. Write a note, or tell ${assistant} something worth keeping.`,
  knowledgeSearch: 'Search your knowledge',
  knowledgeNoMatch: 'No note matches that.',
  askKnowledge: 'Ask about your knowledge',
  chipKnowledge: 'About your knowledge',
  backToKnowledge: 'Back to Knowledge',
  noteNew: 'New note',
  topicNew: 'New topic',
  looseNotesRow: (count: number) => `Loose notes · ${count}`,
  looseNotesTitle: 'Loose notes',
  looseNotesEmpty: 'Every note is in a topic.',
  topicCountLine: (subtopics: number, notes: number) =>
    subtopics === 0 && notes === 0
      ? 'Nothing here yet'
      : [
          ...(subtopics > 0
            ? [`${subtopics} ${subtopics === 1 ? 'subtopic' : 'subtopics'}`]
            : []),
          ...(notes > 0
            ? [
                `${notes} ${notes === 1 ? 'note' : 'notes'}${subtopics > 0 ? ' of its own' : ''}`,
              ]
            : []),
        ].join(' · '),
  proceduresTitle: 'Procedures',
  proceduresFailed: "Your procedures couldn't be opened.",
  proceduresEmpty: (assistant: string) =>
    `No procedures yet. Write down a routine you repeat, ask ${assistant} for one, or turn a task's steps into one.`,
  procedureMadeOn: (when: string) => `Made ${when}`,
  procedureNew: 'New procedure',
  procedureEditTitle: 'Change procedure',
  procedureStepCount: (count: number) =>
    count === 1 ? '1 step' : `${count} steps`,
  procedureFacts: (count: number, madeBy: string) =>
    `A procedure · ${count === 1 ? '1 step' : `${count} steps`} · ${madeBy}`,
  procedureChanged: (date: string) => `Changed ${date}`,
  procedureMadeBy: (assistant: string) => `Made by ${assistant}`,
  procedureMadeByYou: 'Made by you',
  procedureMadeFrom: (task: string) => `Made from ${task}`,
  procedureEdit: 'Edit',
  procedureHistory: 'History',
  procedureCopy: 'Copy as Markdown',
  procedureDelete: 'Delete',
  procedureDeleteTitle: (title: string) => `Delete ${title}?`,
  procedureDeleteConfirm: (count: number) =>
    `Its ${count === 1 ? 'one step goes' : `${count} steps go`} with it, and its history. Runs on a project or trip stay, and runs on their own go with it. You can undo it right after.`,
  procedureDeleted: (title: string) => `Deleted ${title}`,
  procedureDeletedBack: (title: string) => `${title} is back`,
  procedureDeleteFailed: "That wasn't deleted. Try again.",
  procedureUndoFailed: "That wasn't put back. Try again.",
  procedureCopied: (count: number) =>
    count === 1 ? 'Copied 1 step' : `Copied ${count} steps`,
  procedureCopyFailed: "Couldn't copy",
  procedureStepsFull: 'A procedure holds 60 steps',
  procedureGroupsFull: 'A procedure holds 12 groups',
  procedureAddStep: 'Add a step',
  procedureAddGroup: 'Add a group',
  procedurePutInGroup: 'Put it in a group',
  procedureNoGroup: 'No group',
  procedureStepDetail: 'Add detail',
  procedureStepField: 'Step',
  procedureDetailField: 'Detail',
  procedureGroupField: 'Group name',
  procedureGroupFallback: 'Group',
  procedureTitleLabel: 'Title',
  procedureTitlePlaceholder: 'Packing for a work trip',
  procedureStepPlaceholder: 'What to do',
  procedureMoveUp: 'Move up',
  procedureMoveDown: 'Move down',
  procedureRemoveStep: 'Remove step',
  procedureRemoveGroup: 'Remove group',
  procedureGroupActions: (name: string) => `Actions for ${name}`,
  procedureGroupRemoved: (name: string) => `Removed ${name}`,
  procedureStepActions: (position: number) => `Actions for step ${position}`,
  procedureStepSheetTitle: 'Step',
  procedureStepDetailRow: 'Detail',
  procedureMoveToGroup: 'Move to group',
  procedureStepDetailHeading: 'More about this step',
  procedureNeedsWords: 'Add a title and at least one step.',
  procedureFromTask: 'Make these steps a procedure',
  procedureFromTaskOpen: (title: string) => `Open ${title}`,
  procedureFromTaskCut: 'Kept the first 60 steps',
  procedureFromTaskMade: (title: string) => `Made the procedure ${title}`,
  procedureNeedsConnection: 'Needs a connection to save',
  procedureRaced: 'Changed elsewhere · Reload',
  procedureRacedClose: 'Changed elsewhere · Close and reopen',
  procedureGone: 'This procedure is gone.',
  procedureUntitled: 'A procedure',
  procedureSaved: 'Saved',
  procedureUndoHint: 'Puts the procedure back as it was before this.',
  procedureSummaryAdded: (count: number, names: string[] = []) =>
    toStepsEdit('added', count, names),
  procedureSummaryRemoved: (count: number, names: string[] = []) =>
    toStepsEdit('removed', count, names),
  procedureSummaryChanged: (count: number, names: string[] = []) =>
    toStepsEdit('changed', count, names),
  procedureSummaryReordered: 'You reordered the steps',
  procedureSummaryRenamed: 'You changed the title',
  procedureSummaryGroups: 'You changed the groups',
  procedureSummaryNothing: 'You saved it again',
  procedureSummaryRestored: (version: number) => `Put back version ${version}`,
  procedureMade: (title: string) => `Kept ${title}`,
  procedureGroupShow: (name: string, count: number) =>
    `${name} · ${count === 1 ? '1 step' : `${count} steps`}`,
  procedureHistoryTitle: (title: string) => `History · ${title}`,
  historyStepsLine: (count: number) =>
    `${count} ${count === 1 ? 'step' : 'steps'} in this version`,
  askAboutProcedure: 'Ask about this procedure',
  chipProcedure: (title: string) => `About this procedure: ${title}`,
  askAboutProcedures: (count: number) =>
    count === 0
      ? 'Ask about your procedures'
      : `Ask about these ${count} procedures`,
  chipProcedures: 'About your procedures',
  backToProcedures: 'Back to Procedures',
  backToProcedure: (title: string) => `Back to ${title}`,
  runStart: 'Start a run',
  runStartTitle: 'What is it for?',
  runStartHint: 'It copies the steps as they are now.',
  runJustARun: 'Just a run',
  runJustARunHint: 'Not for a trip, event or project',
  runStartTrips: 'Coming up',
  runStartProjects: 'Projects',
  runStartFailed: "That run wasn't started. Try again.",
  runFor: (label: string, day: string | null) =>
    day ? `For ${label} · ${day}` : `For ${label}`,
  runProgress: (done: number, total: number) => `${done} of ${total}`,
  runAllSteps: 'All steps',
  runTickAll: 'Tick all steps',
  runJustThisTime: 'Just this time',
  runAddExtra: 'Add a step just this time',
  runExtraField: 'Step',
  runExtraAdd: 'Add',
  runAddToProcedure: 'Add to the procedure',
  runAddedToProcedure: (title: string) => `Added to ${title}`,
  runAddToProcedureFailed: "That wasn't added. Try again.",
  runFinish: 'Finish this run',
  runFinished: (date: string) => `Finished ${date}`,
  runReopen: 'Reopen',
  runDelete: 'Delete run',
  runDeleteTitle: 'Delete this run?',
  runDeleteConfirm: 'Its ticks go with it. You can undo it right after.',
  runDeleted: (title: string) => `Deleted the run of ${title}`,
  runDeletedBack: 'The run is back',
  runDeleteFailed: "That wasn't deleted. Try again.",
  runUndoFailed: "That wasn't put back. Try again.",
  runTickFailed: "That tick wasn't saved. Try again.",
  runsHeading: 'Runs',
  runsShowAll: 'Show all runs',
  runsShowFewer: 'Show fewer runs',
  runNoLongerThere: (label: string, date: string | null) =>
    `From ${label}${date === null ? '' : `, ${date}`}, no longer in the app it came from`,
  runsFailedLine: "Couldn't load runs right now",
  runStartFor: (name: string) => `For ${name}`,
  runStartPickTitle: 'Which procedure?',
  runStartPickHint: "It copies that procedure's steps as they are now.",
  runStartNow: 'Now',
  runStartShowMore: 'Show more',
  runStartShowFewer: 'Show fewer',
  runStartRunning: (done: number, total: number) =>
    `Running · ${done} of ${total}`,
  runNoStepsTitle: 'This procedure has no steps yet',
  runNoStepsBody: 'Add a step to it, then start a run.',
  runNoStepsRow: 'No steps yet',
  runFinishEmptyTitle: 'Finish without ticking anything?',
  runFinishEmptyMessage: 'It stays in its runs with every step not done.',
  runProcedureGone: 'Its procedure is gone',
  runGone: 'This run is gone.',
  runUnreadable: "This run couldn't be opened.",
  runFailed: "Your runs couldn't be opened.",
  runUntitled: 'A run',
  askAboutRun: 'Ask about this run',
  chipRun: (title: string) => `About this run: ${title}`,
  backToRun: (title: string) => `Back to ${title}`,
  runNeedsConnection: 'Needs a connection to save',
  runNeedsConnectionBody:
    'Adding a step is saved with a connection. Ticks work without one and are kept until you are back.',
  runStartedOn: (date: string) => `Started ${date}`,
  runRowDetail: (state: string, done: number, total: number, extras: number) =>
    `${state} · ${done} of ${total}${extras > 0 ? ` · ${extras} added for this run` : ''}`,
  runExtraPlaceholder: 'What else this time?',
  runExtraSheetTitle: 'Just this time',
  runExtraSheetHint: 'This step is only on this run.',
  runAddToProcedureHint: 'Keeps it for every run after this one.',
  runExtraFull: 'A run holds 20 extra steps',
  runFinishHint: 'Steps not ticked stay on it as not done.',
  askTopic: 'Ask about this topic',
  chipTopic: (name: string) => `About this topic: ${name}`,
  backToTopic: (name: string) => `Back to ${name}`,
  topicsHeading: 'Topics',
  topicSubtopicsHeading: 'Subtopics',
  topicNotesHeading: 'Notes',
  topicNotesEmpty: 'No notes here yet.',
  topicGone: 'This topic is gone.',
  topicUnreadable: "This topic couldn't be opened.",
  topicMenuRename: 'Change name or emoji',
  topicMenuAddSub: 'Add a subtopic',
  topicMenuMove: 'Move under…',
  topicMenuDelete: 'Delete topic',
  topicAddTitle: 'New topic',
  topicSubAddTitle: 'New subtopic',
  topicNameField: 'Name',
  topicEmojiField: 'Emoji',
  topicNamePlaceholder: 'Car care',
  topicNameMissing: 'A name is needed.',
  topicAddAction: 'Add',
  topicMadeToast: (name: string) => `Made ${name}`,
  topicSavedToast: (name: string) => `Saved ${name}`,
  topicsFull: 'Knowledge holds up to 100 topics.',
  topicSubsFull: 'A topic holds up to 20 subtopics.',
  topicTooDeep: 'Topics go three levels deep.',
  topicChanged: 'That topic changed since. Open it again to try.',
  topicMoveTitle: 'Move under…',
  topicMoveTop: 'Top level',
  topicMoveTopHint: 'Not under any topic',
  topicMoveNone: 'There is nowhere else to move this.',
  topicMoveToast: (name: string, parent: string | null) =>
    parent === null
      ? `Moved ${name} to the top level`
      : `Moved ${name} under ${parent}`,
  topicMoveRefused: "That move isn't allowed.",
  topicMoveLimits: `Topics go three levels deep, with up to ${SUBTOPICS_MAX} subtopics each.`,
  topicDeleteTitle: (name: string) => `Delete ${name}?`,
  topicDeleteConfirm: (
    name: string,
    subtopics: number,
    notes: number,
    parentName: string | null,
  ) =>
    [
      subtopics === 0 && notes === 0
        ? `${name} has nothing in it.`
        : `${name} has ${[
            ...(subtopics > 0
              ? [`${subtopics} ${subtopics === 1 ? 'subtopic' : 'subtopics'}`]
              : []),
            ...(notes > 0
              ? [`${notes} ${notes === 1 ? 'note' : 'notes'}`]
              : []),
          ].join(' and ')}.`,
      subtopics > 0
        ? `The ${subtopics === 1 ? 'subtopic moves' : 'subtopics move'} ${parentName === null ? 'to the top level' : `up to ${parentName}`}${notes > 0 ? '; the notes stay, loose or in their other topics.' : '.'}`
        : notes > 0
          ? `The ${notes === 1 ? 'note stays' : 'notes stay'}, loose or in ${notes === 1 ? 'its' : 'their'} other topics.`
          : '',
    ]
      .filter(Boolean)
      .join(' '),
  topicDeleteAction: 'Delete topic',
  topicDeletedToast: (name: string) => `Deleted ${name}`,
  topicDeletedBack: (name: string) => `${name} is back`,
  topicDeletedBackSkipped: (name: string) =>
    `${name} is back. Notes already in 10 topics stay as they are.`,
  topicRestorePartial: (name: string) =>
    `${name} is back, but some notes or subtopics couldn't be put back.`,
  topicUndoFailed: "That couldn't be put back. Try again.",
  topicDeleteNeedsConnection: 'Deleting a topic needs a connection.',
  topicDeletePartial: (name: string) =>
    `${name} wasn't deleted, and some notes may have lost it. Open it and check.`,
  topicDeleteFailed: "That wasn't deleted. Try again.",
  topicBringingIn: (count: number) =>
    `Bringing in ${count} new ${count === 1 ? 'note' : 'notes'}…`,
  topicFailedLine: (count: number) =>
    `${count} new ${count === 1 ? "note isn't" : "notes aren't"} in the document yet`,
  topicTryAgain: 'Try again',
  topicBringThemIn: 'Bring them in',
  topicSoonLine: (count: number) =>
    `Couldn't bring ${count === 1 ? 'it' : 'them'} in just now. Try again in a few minutes`,
  topicLimitedLine: (count: number) =>
    `${count} new ${count === 1 ? 'note' : 'notes'} will be added tomorrow`,
  topicReadThemNow: 'Read them now',
  topicNewNotesHeading: 'New notes',
  topicNotesDivider: 'Notes',
  topicDocumentEmptyNotes: 'Nothing is written here yet.',
  topicAddPart: 'Add a part',
  topicMenuHistory: 'History',
  topicSectionOpen: (heading: string | null) =>
    heading ? `Where ${heading} came from` : 'Where this part came from',
  topicSubtopicsLinkHeading: 'Subtopics',
  sourcesTitle: 'Where this came from',
  sourceNote: (title: string) => `Your note · ${title}`,
  sourceNoteGone: 'A note that is removed',
  sourceMessage: (date: string) => `You said, ${date}`,
  sourceGeneral: 'Saved from a general answer',
  sourceGeneralNotChecked: 'Saved from a general answer · Not checked',
  sourceFile: 'From a file',
  sourceFileNamed: (name: string) => `From ${name}`,
  sourcePerson: (date: string) => `You wrote this, ${date}`,
  sourcesEmpty: 'Nothing is recorded for this part.',
  sourcesEditPart: 'Edit this part',
  sectionAddTitle: 'Add a part',
  sectionEditTitle: 'Edit this part',
  sectionHeadingField: 'Heading',
  sectionHeadingPlaceholder: 'Tyre pressure',
  sectionWordsField: 'Words',
  sectionWordsHint:
    'Markdown works: **bold**, - lists, [links](https://example.com).',
  sectionWordsPlaceholder: 'Front 36 psi, rear 38 psi.',
  sectionWordsMissing: 'Some words are needed.',
  sectionFull: 'A document holds up to 60 parts.',
  sectionTooLong: 'The document would pass 30,000 characters.',
  sectionSaved: 'Saved. This part is yours now.',
  sectionAdded: 'Added your part.',
  sectionGone: 'That part is gone. Open the topic again.',
  sectionChangedSince: 'This part changed since you opened it',
  sectionRemoveAria: 'Remove this part',
  sectionRemoveTitle: 'Remove this part?',
  sectionRemoveConfirm: 'Remove this part? You can bring it back from History.',
  sectionRemoveAction: 'Remove',
  sectionRemoved: 'Removed. You can bring it back from History.',
  historyTitle: (name: string) => `History · ${name}`,
  historyEmpty: 'Nothing has changed yet.',
  historyFailed: "History couldn't be opened.",
  historyReason: (
    reason: TopicVersionReason | ProcedureVersionReason,
    byYou = true,
    assistant = '',
  ) =>
    reason === 'created'
      ? byYou
        ? 'Made by you'
        : `${assistant} made it`
      : reason === 'firstWritten'
        ? 'First written from your notes'
        : reason === 'addedFromSource'
          ? 'Added from your notes'
          : reason === 'personEdit'
            ? 'You edited a part'
            : reason === 'revisedOnRequest'
              ? 'Changed when you asked'
              : reason === 'moved'
                ? 'Moved'
                : reason === 'grouped'
                  ? 'Grouped under a topic'
                  : reason === 'rearranged'
                    ? 'Rearranged'
                    : reason === 'imported'
                      ? 'Brought in from a file'
                      : reason === 'sourceRemoved'
                        ? 'Took out what a removed note said'
                        : reason === 'fromRun'
                          ? 'Added from a run'
                          : 'Restored an earlier version',
  historyRowLine: (
    version: number,
    when: string,
    byYou: boolean,
    assistant: string,
  ) => `Version ${version}\u00a0· ${when}\u00a0· ${byYou ? 'you' : assistant}`,
  historyRestoredFrom: (version: number) => `Back to version ${version}`,
  historyNewest: 'Newest',
  topicHistoryLine: (when: string, summary: string) => `${when} · ${summary}`,
  historyVersionTitle: (version: number) => `Version ${version}`,
  historyUndo: 'Undo this change',
  historyUndoHint: 'Puts the document back as it was before this.',
  historyUndoNotesHint: 'The notes stay below the document.',
  historyUndone: (summary: string) => `Undid: ${summary}`,
  historyRestore: (version: number) => `Restore version ${version}`,
  historyRestoreHint: 'Writes it again as the newest version. Nothing is lost.',
  historyFirstVersion: 'This is the first version.',
  historySummaryEdited: (heading: string | null) =>
    heading ? `You edited ${heading}` : 'You edited a part',
  historySummaryAdded: (heading: string | null) =>
    heading ? `You added ${heading}` : 'You added a part',
  historySummaryRemoved: (label: string) => `You removed ${label}`,
  historySummaryRestored: (version: number) => `Put back version ${version}`,
  sectionBusy: 'The document is being updated. Try again in a moment.',
  historyRestored: (version: number) => `Restored version ${version}`,
  historyChanged: 'The document changed since. Open History again.',
  historyNeedsConnection: 'Changing the document needs a connection.',
  historyRestoreFailed: "That wasn't restored. Try again.",
  historyPartsLine: (count: number) =>
    `${count} ${count === 1 ? 'part' : 'parts'} in this version`,
  noteAddTitle: 'New note',
  noteEditTitle: 'Change note',
  noteTitleField: 'Title',
  noteTitlePlaceholder: 'Wash the car in the shade',
  noteBodyField: 'Note',
  noteBodyPlaceholder: 'What is worth keeping?',
  noteTopicsField: 'Topics',
  noteTopicsHint: 'None is fine. It then shows under Loose notes.',
  noteNeedsWords: 'Add a title or some words.',
  noteCount: (count: number) =>
    `${count.toLocaleString('en-US')} / ${NOTE_BODY_MAX.toLocaleString('en-US')}`,
  noteSavedToast: (title: string) => `Saved ${title}`,
  noteMadeToast: (title: string) => `Kept ${title}`,
  noteDeletedToast: (title: string) => `Deleted ${title}`,
  noteDeletedBack: (title: string) => `${title} is back`,
  noteDeleteConfirm: (title: string) => `Delete ${title}?`,
  noteDeleteAction: 'Delete',
  noteUntitled: 'Untitled note',
  noteGone: 'This note is gone.',
  noteUnreadable: "This note couldn't be opened.",
  noteSheetTitle: 'Note',
  noteAdded: (date: string) => `Added ${date}`,
  noteWrote: (date: string) => `You wrote this on ${date}`,
  noteChangedOn: (date: string) => `Last changed ${date}`,
  noteCopy: 'Copy',
  noteEdit: 'Edit',
  noteDelete: 'Delete',
  notesFull: 'Knowledge holds up to 1,000 notes.',
  noteTopicsFull: 'A note goes in up to 10 topics.',
  noteChangedSince: 'That note changed since. Open it again to try.',
  noteUndoFailed: "That couldn't be put back. Try again.",
  noteDeleteFailed: "That wasn't deleted. Try again.",
  topicPickerNew: '+ New topic',
  topicPickerPending: 'Add or clear the new topic.',
  topicPickerNamePlaceholder: 'Topic name',
  topicPickerFull:
    'A note goes in up to 10 topics. Take one off to pick another.',
  taskProjectRow: 'Project',
  resultProjectLine: (emoji: string | null, name: string) =>
    `Project · ${emoji ? `${emoji} ` : ''}${name}`,
  searchTitle: 'Search',
  searchEverything: 'Search everything',
  searchPlaceholder: 'Search people, tasks, notes…',
  searchHint: (assistant: string) =>
    `Find anything you have told ${assistant}: people, tasks, dates, facts, notes and more.`,
  searchNothing: (query: string, assistant: string) =>
    `Nothing matches "${query}". Searched your people, tasks, dates, facts, notes, topics, projects, procedures, places, photos and connected apps. Mail and Drive are searched only when you ask ${assistant}.`,
  searchLookingDone: 'Still looking through done tasks…',
  searchLookingDates: 'Still looking through older dates…',
  searchFailedDone:
    "Couldn't look through done tasks. Open Search again to retry.",
  searchFailedPart:
    "Some of what's kept couldn't be loaded, so a match may be missing. Reopen the app to retry.",
  searchFailedDates:
    "Couldn't look through older dates. Open Search again to retry.",
  searchGroupPeople: 'People',
  searchGroupTasks: 'Tasks',
  searchGroupDates: 'Dates',
  searchGroupFacts: 'Facts',
  searchGroupNotes: 'Notes',
  searchGroupTopics: 'Topics',
  searchGroupProjects: 'Projects',
  searchGroupProcedures: 'Procedures',
  searchGroupPlaces: 'Places',
  searchGroupMedia: 'Photos and files',
  searchGroupSynced: 'From your apps',
  searchShowAll: (count: number) => `Show all ${count.toLocaleString('en-US')}`,
  searchShowFewer: 'Show fewer',
  searchFirstShown: (count: number) =>
    `Showing the first ${count.toLocaleString('en-US')}. Add a word to narrow it.`,
  searchLooseNote: 'Loose note',
  searchOpenResult: (title: string) => `Open ${title}`,
  whereTitle: 'Where',
  whereHomeLine: (city: string) => `Lives in ${city}`,
  whereSourceSaid: 'You said so',
  whereSourcePage: 'Set here',
  whereSourceTrip: 'from Waypoint',
  whereAddHome: 'Add home',
  wherePickCity: 'Pick a city to save.',
  whereAddAway: 'Add a time away',
  whereHomeSheetTitle: 'Home',
  whereAwaySheetTitle: 'Time away',
  whereChange: 'Change',
  whereRemove: 'Remove',
  whereRemoveHome: 'Remove home',
  whereBack: "I'm back",
  whereBackHint: "You're home from today; the days before stay as they were",
  whereRemoveHint: 'Takes it off as if it was never said',
  whereCityLabel: 'City',
  whereDatesLabel: 'Dates',
  whereLabelLabel: 'What for (optional)',
  whereLabelPlaceholder: "At my sister's",
  whereSave: 'Save',
  whereFull: 'Up to 5 times away fit. Remove one first.',
  whereSaveFailed: "That didn't save. Try again.",
  phoneLocationRow: "This phone's location",
  phoneLocationLevels: {
    off: 'Off',
    city: 'City only',
    precise: 'Precise',
  },
  phoneLocationKeeps: {
    off: 'Only what you tell it, your calendar and your trips',
    city: "The city you're in today, nothing finer, for 6 hours",
    precise: 'Where you are to about 100 m, for 6 hours, never a history',
  },
  phoneLocationRead: (city: string, time: string) => `Near ${city} · ${time}`,
  phoneLocationNone: 'Nothing read yet.',
  phoneLocationForget: 'Forget',
  phoneLocationForgotten: 'Forgot the last place.',
  phoneLocationDenied:
    "Location is blocked for this site, so nothing changed. Allow it in the browser's site settings, then try again.",
  phoneLocationUnsupported: "This browser can't share a location.",
  phoneLocationFailed:
    "Couldn't read this phone's location just now. Try again.",
  phoneLocationSaveFailed: "That didn't save. Try again.",
  abilityOfferLabel: (level: 'city' | 'precise') =>
    `Use this phone's location · ${level === 'precise' ? 'Precise' : 'City only'}`,
  abilityOfferNotNow: 'Not now',
  abilityOfferTurnOn: 'Turn on',
  abilityOfferOn: (level: 'city' | 'precise') =>
    `Using this phone's location · ${level === 'precise' ? 'Precise' : 'City only'}`,
  abilityOfferLater: 'Okay, not now.',
  abilityOfferSettingsLine:
    "Location is blocked for this site. Allow it in the browser's site settings, then turn it on in Settings, This phone's location.",
  zoneOfferLine: (city: string) =>
    `Those days follow ${city}'s clock, then home time comes back on its own`,
  zoneOfferNotNow: 'Not now',
  zoneOfferUse: 'Use it',
  zoneOfferOn: (city: string, days: string) => `Using ${city} time ${days}`,
  zoneOfferUndo: 'Undo',
  zoneOfferLater: 'Okay, home time stays.',
  stageBuilding: 'Building',
  stageHolding: 'Holding',
  stageFormed: 'Formed',
  stageAgain: 'again',
  stageLabel: (stage: string) =>
    ({
      building: 'Building',
      buildingAgain: 'Building',
      holding: 'Holding',
      formed: 'Formed',
    })[stage] ?? 'Building',
  stageSince: (date: string) => `since ${date}`,
  stageHelp:
    "A week counts when you kept it every time but once at most: three in a row is holding, and most weeks for about ten, lately before any reminder, is formed. Two weeks that don't count start it building again, and weeks you paused or days you didn't open the app count neither way.",
  stageHelpLabel: 'How a habit’s stage is worked out',
  stageTold: (day: string, stage: string) =>
    ({
      holding: `Since ${day}: Holding, kept each of the last 3 weeks`,
      formed: `Since ${day}: Formed, kept nearly every week for ten weeks`,
      buildingAgain: `Since ${day}: Building again, 2 weeks in a row didn't count`,
      building: `Since ${day}: Building`,
    })[stage] ?? `Since ${day}: Building`,
  stageToldSummary: (name: string, line: string) => `${name}. ${line}`,
  remindersRowTitle: 'Reminders',
  remindersRowOff: 'Off',
  remindersPaceLine: (pace: string, isCare: boolean, name: boolean) =>
    `${
      pace === 'late'
        ? "Only if you're late"
        : pace === 'start'
          ? isCare
            ? 'At the start, and they stay on'
            : 'At the start of its time'
          : 'While it builds, fewer as it holds'
    }${name ? ' · name shown' : ''}`,
  remindersNext: (time: string) => `Next reminder ${time}`,
  remindersStartsSoon: 'Starts within a few minutes',
  remindersNoneToday: 'No more reminders today',
  remindersFormedQuiet: "No reminders: it's holding on its own",
  remindersAgainLine: 'Reminders come at the start again',
  remindersMore: 'Pace, quiet hours, lock screen',
  remindersTurnOnFailed: "Reminders didn't change. Try again.",
  remindersNeedsConnection: 'Changing reminders needs a connection.',
  remindersPrivateName: 'a private habit',
  remindersOnToast: (name: string) => `Reminders on for ${name}`,
  remindersOffToast: (name: string) => `Reminders off for ${name}`,
  remindersPushIcon: '🔔',
  remindersPushTitle: 'Not on this device yet',
  remindersPushModalTitle: (name: string) => `Reminders while ${name} builds`,
  remindersPushBody: (assistant: string) =>
    `${assistant} sends a reminder at its time, unless you've already ticked it. As it sticks they get fewer, and once it's formed they stop. Change it any time on the habit's page.`,
  remindersPushPrivacy: (assistant: string) =>
    `${assistant}'s server knows when your habit's times are and whether you ticked them, never what the habit is called. The reminder says “Time for your evening habit”.`,
  remindersPushDone: (assistant: string) =>
    `Done. ${assistant} will send the first one at its time. It can take a few minutes to start.`,
  remindersSheetTitle: 'Reminders',
  remindersPaceTitle: 'When it reminds you',
  remindersPaceAdaptive: 'As it builds',
  remindersPaceAdaptiveHelp:
    'At its start while it builds, fewer once it holds',
  remindersPaceStart: 'At the start',
  remindersPaceStartHelp: 'At the start of its time, every time',
  remindersPaceLate: "Only if I'm late",
  remindersPaceLateHelp: 'Once, near the end of its time, if it is still open',
  remindersEaseTitle: 'Fewer reminders?',
  remindersEaseHelp: "Only if you're late",
  remindersQuietTitle: 'Remind me in quiet hours',
  remindersQuietHelp:
    'Off: a time inside your quiet hours is moved to the nearest time outside them, or skipped.',
  remindersSheetSaveFailed: "That didn't save. Try again.",
  remindersPaceToast: (name: string) => `Reminders for ${name} changed`,
  remindersQuietToast: (name: string) => `Quiet hours for ${name} changed`,
  remindersSheetDone: 'Done',
  lockScreenNameSection: 'On the lock screen',
  lockScreenNameTitle: 'Show its name on the lock screen',
  lockScreenNameOff: (words: string) => `Off: “${words}”.`,
  lockScreenNameOffWords: (part: DayPart | null) =>
    part === null
      ? 'A habit is waiting for you'
      : `Time for your ${part} habit`,
  lockScreenNameWarning:
    "A name shown here isn't sealed like the rest of your things. A readable copy is kept so the reminder can show it, it passes through Google's push service (Apple's on an iPhone), and anyone who picks up this device can read it.",
  lockScreenNameOn: (name: string) => `On: “${name}”.`,
  lockScreenNamePrivate: (name: string) =>
    `${name} is private, so this asks once more.`,
  lockScreenNameConfirmTitle: 'Show its name on the lock screen?',
  lockScreenNameConfirmAction: 'Show it',
  lockScreenNameConfirmKeep: 'Keep it hidden',
  lockScreenNameFailed: "That didn't change. Try again.",
  lockScreenNameShownToast: (name: string) =>
    `${name} will show on the lock screen`,
  lockScreenNameHiddenToast: (name: string) =>
    `${name} is hidden again, and its readable copy is gone.`,
  lockScreenNameAsk: (warning: string) => `${warning} Show it?`,
  lockScreenNameVoiceShown: (name: string) =>
    `Done. ${name} will show on the lock screen.`,
  lockScreenNameVoiceHidden: (name: string) =>
    `Done. ${name} is hidden on the lock screen again.`,
  lockScreenNameVoiceKept: 'Okay, it stays hidden.',
  lockScreenNameConfirmOnScreen:
    'That one is private, so tap Show it on the screen to put its name on the lock screen.',
  settingsOnItsOwn: (name: string) => `${name} on its own`,
  habitRemindersTitle: 'Habit reminders',
  habitRemindersOnFor: (count: number) =>
    count === 0
      ? 'Off for every habit'
      : `On for ${count} ${count === 1 ? 'habit' : 'habits'}`,
  habitRemindersPauseAll: 'Pause all habit reminders',
  habitRemindersPauseAllHelp: 'Nothing is sent until you turn this off.',
  habitRemindersQuietTitle: 'Quiet hours',
  habitRemindersQuietHelp:
    "Reminders wait outside these hours. Leave them off to use your day's hours.",
  habitRemindersQuietFrom: 'From',
  habitRemindersQuietTo: 'Until',
  habitRemindersFoot:
    'At most 6 a day; ones close together come as one. Whether this device shows notifications at all is set in your browser.',
  habitRemindersLoading: 'Opening your reminders',
  habitRemindersLoadFailed:
    "Your reminders didn't open. Close this page and open it again.",
  habitRemindersEmpty:
    'No habit has reminders on yet. Turn them on from a habit’s page.',
  habitRemindersBackOn: 'Reminders are back on',
  habitRemindersBackDismiss: 'Dismiss',
  habitRemindersSaveFailed: "That didn't save. Try again.",
  habitOfferTitle: 'Remind me while it builds',
  habitOfferAction: 'Turn on',
  habitFormedTitle: (name: string) =>
    `${name} seems to be part of your day now`,
  habitFormedAsk: 'Take it off Today?',
  habitFormedEvidence: (count: number, since: string) =>
    `Kept ${count} ${count === 1 ? 'time' : 'times'} since ${since}.`,
  habitFormedTake: 'Take it off Today',
  habitFormedKeep: 'Keep it on Today',
  habitFormedKeepReminding: "Remind me only if I'm late",
  habitFormedKeepRemindingDone: 'Reminders stay on, only if you are late.',
  habitFormedTakenOffToast: (name: string, count: number, since: string) =>
    `${name} is off Today. Kept ${count} ${count === 1 ? 'time' : 'times'} since ${since}.`,
  habitFormedKept: 'Okay, it stays on Today.',
  habitFormedFailed: "That didn't change. Try again.",
  habitFormedRetiredLine: (date: string) => `Formed · off Today since ${date}`,
  habitMenuBringBack: 'Bring it back to Today',
  habitBroughtBackToast: (name: string) =>
    `${name} is back on Today as Formed. Reminders stay off.`,
  habitWhatItLeft: 'What it left',
  habitLeftCount: (count: number) =>
    `${count} ${count === 1 ? 'time' : 'times'}`,
  habitLeftRange: (from: string, to: string) => `kept, ${from} to ${to}`,
  habitsFormedFold: (count: number) => `Formed · ${count}`,
  habitsFormedOn: (date: string) => `Formed · off Today since ${date}`,
  importanceTitle: 'What matters most',
  importanceYouMoved: (date: string) => `you moved it ${date}`,
  importanceSaidOn: (date: string, words: string) =>
    `On ${date} you said \u201c${words}\u201d`,
  importanceMakeFirstFromCanWaitNote:
    'Leaves Can wait. Everything else moves down one.',
  importanceIntro: (assistantName: string) =>
    `What comes first gets planned first, and ${assistantName} never suggests pausing it.`,
  importanceInOrder: 'In order',
  importanceNotSaid: 'Not said yet',
  importanceNotSaidTrailing: 'by date',
  importanceCanWait: 'Can wait',
  importanceAlwaysKept: (count: number) => `Always kept · ${count}`,
  importanceAlwaysKeptTitle: 'Health and care, always kept',
  importanceAlwaysKeptNote: (assistantName: string) =>
    `${assistantName} never suggests pausing these, whatever the order.`,
  importanceNothingSaid: (assistantName: string) =>
    `Nothing said yet, so ${assistantName} goes by dates: the nearest deadline comes first. Tell ${assistantName} what matters most, like \u201cthe wedding matters most\u201d.`,
  importanceChange: 'Change the order',
  importanceClear: 'Clear the order',
  importancePlaceTitle: (name: string) => `${name}\u2019s place`,
  importanceMakeFirst: 'Make it come first',
  importanceMakeFirstNote: 'Everything else moves down one.',
  importancePutAbove: 'Put it above\u2026',
  importancePutAboveNote: 'Pick what it should come before.',
  importancePutAboveTitle: (name: string) => `Put ${name} above\u2026`,
  importanceCanWaitAction: 'It can wait',
  importanceCanWaitNote: 'Moves to Can wait.',
  importanceTakeOut: 'Take it out of the order',
  importanceTakeOutNote: 'Goes by its date again.',
  importanceOpenThing: (name: string) => `Open ${name}`,
  importanceMovedFirst: (name: string) => `Moved ${name} to first.`,
  importanceMovedAbove: (name: string, other: string) =>
    `Moved ${name} above ${other}.`,
  importanceMovedAfter: (name: string, other: string) =>
    `Moved ${name} after ${other}.`,
  importanceMovedBeside: (name: string, other: string) =>
    `Moved ${name} beside ${other}.`,
  importanceMovedUp: (name: string) => `Moved ${name} up.`,
  importanceMovedDown: (name: string) => `Moved ${name} down.`,
  importanceMovedCanWait: (name: string) => `Moved ${name} to Can wait.`,
  importanceMovedOut: (name: string) =>
    `Took ${name} out of what matters most.`,
  importanceUnchanged: (name: string) => `${name} is already there.`,
  importanceRefusedCare: (name: string) =>
    `${name} is always kept, so it doesn\u2019t need a place.`,
  importanceRowFirst: 'First in what matters',
  importanceRowNth: (position: number, of: number) =>
    `${toDayOrdinal(position)} of ${of} in what matters`,
  importanceRowShares: (position: number, other: string) =>
    `Shares ${toDayOrdinal(position)} with ${other}`,
  importanceRowCanWait: (date: string | null) =>
    date ? `Can wait \u00b7 you said ${date}` : 'Can wait',
  importanceRowNotSaidByDate: (date: string) =>
    `Not said \u00b7 goes by its date, ${date}`,
  importanceRowNotSaid: 'Not said',
  importanceRowAlwaysKept: 'Always kept \u00b7 health',
  importanceRowThrough: (goal: string, position: number | null) =>
    position === null
      ? `Through ${goal}`
      : `Through ${goal} \u00b7 ${toDayOrdinal(position)}`,
  importanceNoLongerFirst: (date: string) =>
    `No longer first since ${date}, as you said`,
  importanceWhichComesFirst: 'Which comes first?',
  importanceWhichComesBefore: 'Which of these comes before the others?',
  importanceWhichSkipped:
    'Okay, nothing\u2019s changed. It\u2019s waiting in Needs you.',
  importanceYouSaid: (date: string) => `you said ${date}`,
  importanceSearch: 'Search what matters most',
  importanceNoMatch: 'Nothing matches that.',
  askImportance: 'Ask about what matters',
  chipImportance: 'About what matters most',
  backToImportance: 'Back to What matters most',
  importanceFew:
    'Once there are two projects, goals or habits to put in order, they show up here.',
  importanceDoorFirst: (names: string[]) => `${formatList(names)} first`,
  importanceDoorNone: 'Not said yet \u00b7 by date',
  importanceClearConfirm:
    'Clear the whole order? Everything goes back to being ordered by date.',
  importanceClearAction: 'Clear it',
  importanceCleared: 'Cleared what matters most.',
  importanceDragHandle: 'Move',
  importancePutAboveSearch: 'Search what it should come before',
  importancePutAboveNone: 'Nothing is in order yet to put it above.',
  importanceWhichRest: 'The other two can share second place.',
  importanceWhichRestMany: 'The others can share second place.',
  importanceWhichFirstSince: (date: string) => `First since ${date}`,
  importanceWhichPlaceSince: (place: string, date: string) =>
    `${place} since ${date}`,
  patternPartPlural: {
    morning: 'mornings',
    midday: 'middays',
    afternoon: 'afternoons',
    evening: 'evenings',
    bedtime: 'nights',
  },
  patternWindowMissedStatement: (name: string, weekday: string, part: string) =>
    `${name} doesn't tend to happen on ${weekday} ${part}`,
  patternWindowMissedEvidence: (
    matched: number,
    total: number,
    weekday: string,
  ) => `Not done on ${matched} of the last ${total} ${weekday}s`,
  patternDoneOutsideStatement: (name: string, side: 'before' | 'after') =>
    `${name} usually happens ${side === 'before' ? 'earlier' : 'later'} than planned`,
  patternDoneOutsideEvidence: (matched: number, total: number, time: string) =>
    `${matched} of the last ${total} times, around ${time}`,
  patternPlannedSlotStatement: (weekday: string, part: string) =>
    `What's planned for ${weekday} ${part} tends not to get done`,
  patternPlannedSlotEvidence: (matched: number, total: number, weeks: number) =>
    `${matched} of ${total} planned slots over ${weeks} weeks`,
  patternPlannedSlotActed: (part: string) => `Today's ${part} left empty`,
  patternSaidStrugglingStatement: (name: string) =>
    `${name} has felt hard lately`,
  patternSaidWorkingStatement: (name: string) => `${name} is going well`,
  patternSaidEvidence: (dates: string) => `You said so on ${dates}`,
  patternSaidLinkStatement: (name: string, link: string) =>
    `${name} tends to slip on ${link}`,
  patternLinkPhrases: {
    shift: 'days around your shifts',
    busyDay: 'busy days',
    lateDay: 'days that ran late',
    weekday: 'certain days of the week',
    other: 'some days',
  },
  patternCareStatement: (name: string) =>
    `You've mentioned how ${name} has been going`,
  patternPartSingular: {
    morning: 'morning',
    midday: 'midday',
    afternoon: 'afternoon',
    evening: 'evening',
    bedtime: 'night',
  },
  noticedTitle: "What I've noticed",
  noticedHelp: (assistant: string) =>
    `Patterns in when things get done, and in what you've said about them. ${assistant} quotes your words and never guesses how you feel.`,
  noticedHelpOff:
    "Noticing is off, so nothing new is picked up. What you've already answered stays.",
  noticedEmpty: (assistant: string) =>
    `Nothing yet. As you and ${assistant} get to know each other's days, patterns about when things work will show up here, with what they're based on.`,
  noticedOffNote:
    "Noticing is off, so nothing new shows up here. What you've already answered stays.",
  noticedShowAll: (count: number) => `Show all ${count}`,
  noticedShowFewer: 'Show fewer',
  noticedNotUsed: (count: number) => `Not used \u00b7 ${count}`,
  noticedRingLabel: (assistant: string) => `Noticed by ${assistant}`,
  noticedStateAsking: 'Asking you',
  noticedStateNoticed: 'Noticed',
  noticedStateChanged: (assistant: string, date: string) =>
    `Changed by ${assistant} \u00b7 ${date}`,
  noticedStateKept: (date: string) => `Kept \u00b7 ${date}`,
  noticedStateNotNow: (date: string) => `Not now \u00b7 not before ${date}`,
  noticedStateStopped: 'Stopped',
  noticedStateRetired: 'No longer true',
  noticedStateWords: {
    asking: (assistant: string) =>
      `${assistant} is waiting for your answer before it does anything.`,
    noticed: (assistant: string) =>
      `${assistant} has noticed this and hasn't asked about it yet.`,
    changed: (assistant: string, date: string) =>
      `${assistant} changed this on ${date}, on its own plans only. You can take it back.`,
    kept: (date: string) => `You said yes on ${date}.`,
    notNow: (date: string) =>
      `You said not now. It won't come up again before ${date}, and only if it keeps happening.`,
    stopped: (assistant: string) =>
      `${assistant} won't suggest this again unless you ask it to.`,
    retired: "This doesn't hold anymore, so it isn't used.",
  },
  noticedBasedOn: "What it's based on",
  noticedBasedOnDone: 'Not done',
  noticedBasedOnOutside: 'Done at another time',
  noticedBasedOnSaid: 'You said so',
  noticedBasedOnMore: (count: number) => `And ${count} earlier`,
  noticedSheetOpen: (statement: string) => `Open: ${statement}`,
  noticedYes: {
    moveWindow: (time: string) => `Move to ${time}`,
    lowerCadence: 'Do it less often',
    raiseCadence: 'Do it more often',
    keepTime: 'Keep this time',
    changeTime: 'Change the time',
  },
  noticedYesSubtitle: {
    moveWindow: "Changes this habit's time. You can change it back.",
    lowerCadence: 'Changes how often it comes up. You can change it back.',
    raiseCadence: 'Changes how often it comes up. You can change it back.',
    keepTime: 'Keeps things just as they are.',
    changeTime: "Opens this habit's times. It counts as a yes once you save.",
  },
  noticedNotNow: 'Not now',
  noticedNotNowSubtitle: (weeks: number | null, assistant: string) =>
    weeks === null
      ? `${assistant} won't bring this up again.`
      : `Back in ${weeks} weeks, and only if it keeps happening.`,
  noticedItsRight: "It's right",
  noticedItsRightSubtitle:
    "Keeps things as they are. It won't ask for a while.",
  noticedOfferConfirmed: (date: string) =>
    `Okay, I'll leave it. I'll check again ${date}.`,
  noticedStateConfirmed: (date: string) => `Confirmed \u00b7 ${date}`,
  noticedConfirmedSentence: (date: string) => `You said it's right on ${date}.`,
  noticedStop: 'Stop suggesting that',
  noticedStopSubtitle: "Won't bring this up again unless you ask.",
  noticedStartAgain: 'Start suggesting again',
  noticedStartAgainSubtitle: 'It can notice and ask about this again.',
  noticedNoLonger: "This isn't true anymore",
  noticedNoLongerSubtitle:
    'Stops using it. It can come back if it starts showing up again.',
  noticedTakeBack: 'Take this back',
  noticedTakeBackSubtitle:
    'Goes back to suggesting here, and waits before trying again.',
  noticedForgetWords: 'Forget these words',
  noticedForgetWordsSubtitle:
    'Removes them from this pattern; your notes and the conversation stay.',
  noticedWhyOther: 'Why, and other choices',
  noticedOtherChoices: 'Other choices',
  noticedCareAsk: (name: string) => `Is the time still right for ${name}?`,
  noticedWorkingTitle: 'Going well',
  noticedOfferDone: {
    moveWindow: (time: string) => `Moved to ${time}`,
    lowerCadence: 'Now it comes up less often',
    raiseCadence: 'Now it comes up more often',
    keepTime: 'Okay, keeping this time',
    change: 'Okay, your change is saved',
  },
  noticedOfferNotNow: (date: string | null) =>
    date === null
      ? "Okay. I won't bring this up again unless you ask."
      : `Okay. Not before ${date}, and only if it keeps happening.`,
  noticedOfferStopped: "Okay. I won't suggest that again.",
  noticedOfferReopened: 'Okay, it can come up again.',
  noticedOfferRetired: 'Okay, no longer used.',
  noticedOfferMissing: 'That changed in the meantime, so nothing was saved.',
  noticedOfferFailed: "Couldn't save that. Check your connection.",
  noticedActedLine: (dayName: string, part: string) =>
    `${dayName}'s ${part} left empty`,
  noticedForget: "Forget what you've noticed",
  noticedForgetDivider: 'Start fresh',
  noticedForgetSubtitle:
    'Clears every pattern and the words it was based on. Ones you stopped stay only as a \u201cdon\u2019t suggest\u201d mark, with no words. Your notes and conversations stay.',
  noticedForgotten: "Forgot what I'd noticed.",
  noticedForgotUndone: 'Put back what I had noticed.',
  noticedWordsForgotten: 'Forgot those words.',
  learningTitle: 'Notice what works for me',
  learningRowOn: 'On',
  learningRowOff: 'Off',
  learningDescription: (assistant: string) =>
    `${assistant} looks at when things get done and what you say about them, to plan better and to ask about what isn't working. It quotes your words and never guesses how you feel.`,
  learningServerLine:
    "To notice from your words, the day's notes and turns are read overnight, and what it finds is sealed again.",
  learningOffTitle: 'Stop noticing?',
  learningOffBody: (assistant: string) =>
    `${assistant} stops changing its own plans from patterns and puts away anything waiting for your answer. What you already said yes to stays.`,
  learningKeep: 'Keep noticing',
  learningTurnOff: 'Turn off',
  learningFailed: "Couldn't save that. Check your connection.",
  notedLine: (assistant: string) =>
    `Noted \u00b7 ${assistant} will think it over tonight`,
  notedLinePlain: 'Noted',
  notedForgetIt: 'Forget what I noted',
  notedForgotten: "Okay, I won't keep that.",
  notedNothingKept: 'Nothing from this is kept anymore.',
  patternTookBack: (line: string) => `Took back: ${line}`,
  patternTookBackReport: 'Okay, back the way it was.',
  guardrailGroupTitle: 'About taking things on',
  guardrailHoldStatement: (name: string, date: string | null) =>
    date === null
      ? `Maybe hold ${name} for a while?`
      : `Maybe hold ${name} until ${date}?`,
  guardrailHoldOtherStatement: (name: string, started: string) =>
    `Maybe hold ${name} while ${started} gets going?`,
  guardrailPauseStatement: (name: string) => `Pause ${name} for a while?`,
  guardrailTaskStatement: (weekday: string, title: string) =>
    `${weekday} looks full for ${title}`,
  guardrailGoalsReason: (count: number, names: string[]) =>
    names.length === 0
      ? `${count} goals already going.`
      : names.length >= count && count <= 3
        ? `${count} goals already going: ${formatList(names)}.`
        : `${count} goals already going, including ${formatList(names.slice(0, 3))}.`,
  guardrailQuietGoalReason: (count: number, name: string, days: number) =>
    `${count} goals going, and nothing's been done on ${name} in ${days} days.`,
  guardrailBusyReason: (days: number, through: string) =>
    `${days} full days on your calendar through ${through}.`,
  guardrailBusyStepReason: (name: string, days: number, through: string) =>
    `${name}'s regular step falls on ${days} full days through ${through}.`,
  guardrailDeadlineReason: (
    name: string,
    tasks: number,
    date: string,
    work: string,
    free: string,
    hasCalendar: boolean,
  ) =>
    `${name}: ${tasks} tasks due by ${date} need about ${work}; ${
      hasCalendar ? 'your calendar has' : 'your day has'
    } about ${free} free.`,
  guardrailTaskReason: (date: string, work: string, free: string) =>
    `Due ${date}: about ${work} of work, ${free} free before then.`,
  guardrailStarvedReason: (days: number) =>
    `What matters most has had nothing done in ${days} days.`,
  guardrailHoursFromCalendar:
    "From the lengths on your tasks and your calendar's free time",
  guardrailHoursNoCalendar: 'No calendar connected, so counting your whole day',
  guardrailHold: (date: string | null) =>
    date === null ? 'Hold it for now' : `Hold it until ${date}`,
  guardrailHoldSubtitle: (date: string | null) =>
    date === null
      ? 'It stays off your plans until you resume it. You can undo it.'
      : 'It stays off your plans until then. You can undo it.',
  guardrailPause: (date: string | null) =>
    date === null ? 'Pause for a while' : `Pause until ${date}`,
  guardrailStartNow: 'Start it now',
  guardrailStartNowSubtitle: (name: string, date: string | null) =>
    date === null
      ? `Keeps ${name} going. I won't ask again.`
      : `Keeps ${name} going. I won't ask again before ${date}.`,
  guardrailKeepGoing: 'Keep going',
  guardrailKeepDay: (weekday: string) => `Keep ${weekday}`,
  guardrailKeepDate: 'Keep the date',
  guardrailFindLater: 'Find a later day',
  guardrailFindLaterSubtitle: "Opens the task's due date.",
  guardrailKeepGoingSubtitle: (date: string | null, assistant: string) =>
    date === null
      ? `${assistant} won't raise this again. You can still ask.`
      : `${assistant} won't raise this before ${date}.`,
  guardrailPickDay: 'Pause until a day you pick',
  guardrailPickDaySubtitle: 'Choose when it comes back.',
  guardrailPickDayConfirm: 'Pause',
  guardrailOthers: 'Pause something else instead',
  guardrailOthersSubtitle: 'Choose what to set aside.',
  guardrailOthersHint: (name: string) =>
    `Keeps ${name} going. You can undo it.`,
  guardrailOthersBack: 'Back to the choices',
  guardrailInstead: (name: string, date: string | null) =>
    date === null
      ? `Set ${name} aside for a while`
      : `Set ${name} aside until ${date}`,
  guardrailRowPaused: (name: string, date: string | null) =>
    date === null ? `Paused ${name}` : `Paused ${name} until ${date}`,
  guardrailRowHeld: (name: string, date: string | null) =>
    date === null ? `Held ${name} for now` : `Held ${name} until ${date}`,
  guardrailAnsweredSentence: (done: string, date: string) =>
    `${done}. You said yes on ${date}.`,
  guardrailUndo: 'Undo this',
  guardrailUndoSubtitle: (name: string) => `Puts ${name} back on your plans.`,
  guardrailUndone: (name: string) => `Okay, ${name} is back on your plans.`,
  guardrailStop: 'Stop suggesting this',
  guardrailStopSubtitle: (name: string, isHold = false) =>
    `Won't suggest ${isHold ? 'holding' : 'pausing'} ${name} again unless you ask.`,
  guardrailStopTaskSubtitle: (title: string) =>
    `Won't flag a full day for ${title} again unless you ask.`,
  guardrailHeld: (name: string, date: string | null) =>
    date === null
      ? `Holding ${name} for now. You can start it any time.`
      : `Holding ${name} until ${date}. It starts that morning.`,
  guardrailPaused: (name: string, date: string | null, assistant: string) =>
    date === null
      ? `Paused ${name}. ${assistant} won't plan it until you pick it back up.`
      : `Paused ${name} until ${date}. ${assistant} won't plan it until then.`,
  guardrailSetAside: (name: string, date: string | null) =>
    date === null
      ? `Set ${name} aside for a while.`
      : `Set ${name} aside until ${date}.`,
  guardrailNo: (date: string | null) =>
    date === null
      ? "Okay. I won't raise this again. You can still ask."
      : `Okay. I won't bring this up before ${date}.`,
  guardrailStopped: (assistant: string, name: string) =>
    `${assistant} won't suggest pausing ${name} again. You can still ask.`,
  guardrailStoppedTask: (assistant: string, title: string) =>
    `${assistant} won't flag a full day for ${title} again. You can still ask.`,
  guardrailOneThought: 'One thought on timing is on screen.',
  guardrailStateSentence: (assistant: string) =>
    `${assistant} is only suggesting this. Nothing changes unless you say so.`,
  guardrailRowLabel: (statement: string) => `Open: ${statement}`,

  scheduledTitle: 'Scheduled',
  askScheduled: 'Ask about what runs by itself',
  chipScheduled: 'About what runs by itself',
  backToScheduled: 'Back to Scheduled',
  scheduledFailed: "Scheduled actions couldn't be loaded right now.",
  scheduledEmpty: (assistant: string) =>
    `Nothing runs by itself yet. Tell ${assistant} what you'd like done and when, like "every Friday at 5, plan my weekend", and it shows up here.`,
  scheduledAdd: 'Schedule something',
  scheduledSearch: 'Search what runs by itself',
  scheduledCount: (count: number, max: number) =>
    `${count} of ${max} scheduled`,
  scheduledFullLine: (max: number) =>
    `That's all ${max} you can have at once. End one to make room.`,
  scheduledFoot: (assistant: string) =>
    `${assistant} tells you here and on Today how each run went.`,
  scheduledEndedRow: (count: number) => `Ended · ${count}`,
  scheduledEndedHide: 'Hide ended',
  scheduledEndedOn: (day: string) => `Ended ${day}`,
  scheduledDidntRun: (when: string, reason: string | null) =>
    reason ? `Didn't run ${when} · ${reason}` : `Didn't run ${when}`,
  scheduledWhyNotConnected: 'an app it needs is not connected',
  scheduledWhyExpired: 'an app needs to be reconnected',
  scheduledWhyNotAllowed: 'it is not allowed to do that',
  scheduledWhyFailed: 'something went wrong',
  scheduledWhyRule: 'its repeat no longer works',
  scheduledPausedOpen: 'Paused until you say',
  scheduledPausedUntil: (day: string) => `Paused until ${day}`,
  scheduledPausedNoRuns: 'Nothing is coming up while it is paused.',
  scheduledNext: (run: string) => `Next: ${run}`,
  scheduledNoMoreRuns: 'No more runs',
  scheduledWhatItDoes: 'What it does',
  scheduledMayTasks: 'your tasks',
  scheduledMayDay: "today's plan",
  scheduledMayChange: (list: string) => `It may change ${list}.`,
  scheduledMayChangeNothing: 'It only tells you; it changes nothing.',
  scheduledComingUp: 'Coming up',
  scheduledWhatItDid: 'What it did',
  scheduledSeeAll: 'See all in Activity',
  scheduledSkippedMark: 'Skipped',
  scheduledMovedFrom: (day: string) => `Moved from ${day}`,
  scheduledPause: 'Pause for a while',
  scheduledPauseSubtitle: 'Wait until a day you pick, or until you say',
  scheduledResume: 'Resume now',
  scheduledResumeSubtitle: (run: string) => `Picks up again ${run}`,
  scheduledChange: 'Change when or what it does',
  scheduledChangeSubtitle: 'Its name, its words, its time or how often',
  scheduledChangeShort: 'Change',
  scheduledOtherChoices: 'Or',
  scheduledEnd: 'End it',
  scheduledEndSubtitle: 'It stops for good; you can undo it right after',
  scheduledEndTitle: (title: string) => `End "${title}"?`,
  scheduledEndMessage: 'It will not run again. Its past runs stay in Activity.',
  scheduledEndAction: 'End it',
  scheduledKeep: 'Keep it',
  scheduledSaid: 'You said it',
  scheduledMadeHere: 'You made it here',
  scheduledPauseTitle: (title: string) => `Pause "${title}"`,
  scheduledPauseNext: 'Just the next run',
  scheduledPauseNextSubtitle: (day: string) => `Skips ${day}, then carries on`,
  scheduledPauseUntil: 'Until a day you pick',
  scheduledPauseOpen: 'Until I say',
  scheduledPauseOpenSubtitle: 'It waits until you resume it',
  scheduledPauseNeedsDay: 'Pick a day after today.',
  scheduledPauseAction: 'Pause it',
  scheduledPausedToast: (title: string) => `Paused ${title}.`,
  scheduledPausedUntilToast: (title: string, day: string) =>
    `Paused ${title} until ${day}.`,
  scheduledResumed: (title: string) => `${title} is running again.`,
  scheduledEnded: (title: string) => `Ended ${title}.`,
  scheduledMade: (title: string) => `Scheduled ${title}.`,
  scheduledChanged: (title: string) => `Changed ${title}.`,
  scheduledSkipped: (next: string | null) =>
    next ? `Skipped that run. Next is ${next}.` : 'Skipped that run.',
  scheduledMoved: (when: string) => `Moved to ${when}.`,
  scheduledSkipThis: 'Skip this one',
  scheduledSkipSubtitle: (next: string) => `Next is ${next}`,
  scheduledSkipLast: 'Nothing is lined up after it',
  scheduledMoveThis: 'Move this one',
  scheduledMoveSubtitle: 'Pick another day or time for just this run',
  scheduledMoveTitle: 'Move this run',
  scheduledMoveAction: 'Move it',
  scheduledMoveStays: (after: string, rule: string, time: string) =>
    `The runs after it stay as they were: ${rule}, next on ${after} at ${time}.`,
  scheduledChangeRun: 'Change it',
  scheduledChangeRunSubtitle: 'This run, or this one and the ones after',
  scheduledMoveRange: (from: string, to: string) => `Between ${from} and ${to}`,
  scheduledMoveFrom: (from: string) => `From ${from}`,
  scheduledFormChangeTitle: (title: string) => `Change ${title}`,
  scheduledFormNewTitle: 'Schedule something',
  scheduledTimePassed: (time: string) =>
    `${time} today has passed. Pick a later time or another day.`,
  scheduledFormChangeBack: (title: string) => title,
  scheduledHowOften: 'How often',
  scheduledScopeOne: 'Just this one',
  scheduledScopeOneSubtitle: (day: string) => `Only the run on ${day}`,
  scheduledScopeFollowing: 'This and following',
  scheduledScopeFollowingSubtitle: (day: string) =>
    `From ${day} on; earlier runs stay as they were`,
  scheduledNameLabel: 'Name',
  scheduledNamePlaceholder: 'Weekend plan',
  scheduledWhatLabel: 'What should it do?',
  scheduledWhatPlaceholder: 'Look at my week and plan the weekend',
  scheduledFirstDayLabel: 'First day',
  scheduledDayLabel: 'Day',
  scheduledTimeLabel: 'Time',
  scheduledMake: 'Schedule it',
  scheduledSave: 'Save changes',
  scheduledSaveFailed: "That didn't save. Check your connection.",
  scheduledUndoKept: 'Something changed since, so that stays as it is.',
  scheduledUndoFailed: "That couldn't be put back right now.",
  scheduledDropped: (count: number) =>
    `${count} skipped or moved ${count === 1 ? 'run' : 'runs'} no longer applied and ${count === 1 ? 'was' : 'were'} cleared.`,
  scheduledRefusal: {
    ended: 'That one has ended.',
    noRun: 'It has no run left to change.',
    past: "That day has already gone by, so a run can't move there.",
    ran: 'It already ran that day.',
    tooLate: 'A run can move up to the day before the one after it, no later.',
    tooMany: 'It has a lot of skipped or moved runs. Let some pass first.',
    countSpent: 'Its repeat has already gone round that many times.',
    shape: "That isn't a repeat that can be kept.",
    neverComes: 'That never comes round.',
    notNow: "It can't run right now.",
    gone: "That one isn't there anymore.",
    tooOften: 'That repeats too often.',
    interval: 'That repeat is spaced too far apart.',
    count: 'That repeats too many times.',
    untilBeforeStart: 'The end day comes before the first run.',
    full: "That's all 50 you can have at once. End one to make room.",
    words: 'Give it a name and say what it should do.',
  },
  scheduledReconnect: 'Reconnect',
  scheduledRunNow: 'Run it now',
  scheduledMoreInActivity: (count: number) => `${count} more in Activity`,
  awayPauseTitle: 'Pause what runs at home',
  awayPauseLine: (days: string) =>
    `Hold what runs by itself while you're away (${days}), including anything you schedule meanwhile.`,
  awayPauseAction: 'Pause them',
  awayPauseOn: (days: string) =>
    `What runs at home is paused while you're away (${days}).`,
  awayPauseKept: (count: number) =>
    count === 1
      ? 'One is already paused on other days, so it keeps running.'
      : `${count} are already paused on other days, so they keep running.`,
  awayPauseNotPutBack: (count: number) =>
    count === 1
      ? 'One was changed since, so it stays as it is.'
      : `${count} were changed since, so they stay as they are.`,
} as const;

/** What was said, in the closed set the model and the code both read. */
export const WATCHING_PHRASES = [
  'keep an eye',
  'watch for',
  "i'll notice",
  'noted',
] as const;

/** Weeks Helm waits after the first and the second no; the third is final. */
export const PATTERN_BACKOFF_WEEKS = [4, 8] as const;

export const PATTERN_THRESHOLDS = {
  windowMissedMatched: 4,
  windowMissedOf: 5,
  windowMissedWeeks: 10,
  outsideMatched: 5,
  outsideOf: 6,
  slotCount: 5,
  slotWeeksNeeded: 4,
  slotWeeks: 8,
  slotMissedShare: 0.8,
  suggestedAtOnce: 3,
  newPerDay: 1,
} as const;

export const GUARDRAIL_LIMITS = {
  goalsOnStart: 3,
  goalsDaily: 4,
  quietGoalDays: 21,
  deadlineWindowDays: 60,
  deadlineSlackMinutes: 60,
  deadlineMinTasks: 3,
  lengthsKnownShare: 0.5,
  defaultTaskMinutes: 30,
  starvedDays: 14,
  starvedOtherMin: 3,
  busyDayShare: 0.75,
  busyRun: 3,
  busyTotal: 5,
  busyWindowDays: 14,
  firstDaysQuiet: 7,
  nearDeadlineDays: 14,
} as const;

export const OBSERVATION_KEEP_WEEKS = 26;
export const REFLECTION_KEEP_DAYS = 14;
export const EXECUTION_KEEP_DAYS = 396;
export const PATTERN_LIVE_CAP = 500;
export const PATTERN_OFF_CAP = 5000;
export const PRUNE_RUN_CAP = 400;
export const SEEN_AS_SHOWN_CAP = 40;
export const SEEN_AS_REMOVED_CAP = 200;

export const PLANNER_COPY = {
  estimate: 'about 30 min · estimate',
  fitsBefore: (length: string, title: string) =>
    `${length} · fits before ${title}`,
  fitsAfter: (length: string, title: string) =>
    `${length} · fits after ${title}`,
  overdue: 'Overdue',
  dueToday: 'Due today',
  dueTomorrow: 'Due tomorrow',
  due: (when: string) => `Due ${when}`,
  must: 'Must do',
  should: 'Should do',
  could: 'Could do',
  worthDoing: 'Worth doing today',
  home: "You're home",
} as const;

export {
  OBSERVATION_TAGS,
  STRUGGLING_TAGS,
  WORKING_TAGS,
} from '@apps/helm/engine/said';
