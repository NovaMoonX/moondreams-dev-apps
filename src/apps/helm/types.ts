import type { City } from '@/lib/cities/types';
import type { Cadence, Weekday } from '@/utils/cadenceUtils';
import type { DayPart } from '@apps/helm/engine/habitDay';
import type { ImportancePlace } from '@apps/helm/engine/importance';
import type { Personality } from '@apps/helm/engine/personality';
import type { ObservationTag, STRUGGLING_TAGS } from '@apps/helm/engine/said';
import type { AwayZoneOffer } from '@apps/helm/engine/whereabouts';
import type {
  TaskMeeting,
  TaskReadyAnswer,
} from '@apps/helm/engine/questionsTask';
import type {
  AheadOfferMeta,
  LeadAnswer,
  LeadQuestion,
} from '@apps/helm/engine/researchAhead';
import type { ContactPoint } from '@apps/helm/engine/contactPoints';
import type {
  ConnectionKind,
  ConnectionRelation,
  ConnectionSource,
  CoupleStatus,
} from '@apps/helm/engine/connections';
import type { WhoKin } from '@apps/helm/engine/kinKinds';
import type { GroupingMeta } from '@apps/helm/engine/grouping';
import type { MomentPrecision } from '@/utils/yearlyDateUtils';
export type { GoalWhy } from '@apps/helm/utils/goalWhy';
import type { GoalWhy } from '@apps/helm/utils/goalWhy';
import type { ExtraValue, SharedKind } from '@/lib/connections/contract';
import type { AppEncryption, EncryptedFieldPayload } from '@lib/security';
import type {
  PrivacyClass,
  PrivateMark,
  QuietMark,
} from '@apps/helm/utils/privacy';
import type { SeenAsKind, SeenAsState } from '@apps/helm/engine/seenAs';
import type { StepBody, StepPlace } from '@apps/helm/utils/stepGroups';

export type { SharedKind };
export type { Cadence, Weekday, DayPart };

/** The views that have a screen so far; each later issue adds its own. */
export type HelmView =
  | 'home'
  | 'today'
  | 'inbox'
  | 'tasks'
  | 'settings'
  | 'activity'
  | 'outside'
  | 'connectedApps'
  | 'connection'
  | 'assistants'
  | 'people'
  | 'who'
  | 'place'
  | 'projects'
  | 'project'
  | 'habits'
  | 'habit'
  | 'knowledge'
  | 'topic'
  | 'procedures'
  | 'procedure'
  | 'run'
  | 'howNomosSeesYou'
  | 'importance'
  | 'comingUp'
  | 'scheduled'
  | 'search';

export type Sealed = EncryptedFieldPayload;

export type HelmEncryption = AppEncryption<'helm'>;

export type VoiceMode = 'cloudWhenOnline' | 'deviceOnly';

export type AssistantTone = 'composed' | 'warm' | 'brief' | 'formal';

export type HelmTheme = 'chestnut' | 'plum' | 'teal' | 'indigo';

export interface HelmProfile {
  /** The person's own name for the assistant; null reads as the default. Always read through readAssistantName. */
  assistantName: string | null;
  /** Ways a speech recognizer may write the assistant's name, made by the server after a rename; null when none were made. */
  assistantNameVariants: string[] | null;
  /** How the assistant's answers sound; null reads as composed. */
  assistantTone: AssistantTone | null;
  /** How the assistant talks; null reads from the old tone. Always read through the personality reader. */
  personality: Personality | null;
  personalitySetAt: number | null;
  /** The sample replies made for the personality whose personality hashes to `hash`, so a device never asks again for one already made. */
  personalityPreview: { hash: string; replies: string[]; at: number } | null;
  /** The colour theme; null reads as chestnut. */
  theme: HelmTheme | null;
  /** IANA zone, set from the device on first open. */
  timeZone: string;
  /** Floating "HH:mm": the earliest a slot may start. */
  dayStartTime: string;
  dayEndTime: string;
  /** Share of free time the planner may fill. */
  planFillPercent: number;
  /** @deprecated Nothing reads it: a day's aims are noticed by the server's trigger on the day document. Written `null` going forward. */
  dayAimsChangedAt: number | null;
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
  voiceId: string | null;
  voiceSpeed: number | null;
  /** A line kept off the speaker is whispered when the person asks to hear it; null reads as on. */
  whisperHeld: boolean | null;
  /** This browser listens for "Hey {name}" while Helm is open on screen. */
  isWakeWordOn: boolean;
  /** After a spoken reply, listening stays open for a few seconds so the person can answer without a tap. */
  isHandsFreeOn: boolean;
  /** @deprecated Where speech goes is a help icon while listening, open any time; nothing is marked seen. */
  hasSeenVoiceNotice: boolean | null;
  /** The person's own who, made on first open; null on a profile from before people. */
  selfWhoId: string | null;
  /** Where the person said they are, holding for a few hours from when they said it; never the device's location. */
  currentPlace: { placeId: string; saidAt: number } | null;
  /** The createdAt of the newest typed capture the style learner has read; null until it has run, and on a profile from before it. */
  styleLearnedThroughAt: number | null;
  /** How much of this phone's location the assistant may use; only the chosen precision is ever stored. */
  phoneLocation: PhoneLocation;
  /** Away spans whose days follow the away city's clock (date-only, inclusive, at most 10). */
  zoneSpans: ZoneSpan[];
  /** When the person said Not now to an ability offer, so it waits 4 weeks. */
  abilityOffers: AbilityDecline[];
  /** Floating "HH:mm" in the profile's zone, readable so the server plans around it; null is outside Your day. */
  quietHours: { start: string; end: string } | null;
  /** Pause all habit reminders since this instant; null is not paused. */
  remindersPausedAt: number | null;
  /** Stamped by any change a reminder depends on, so the server re-plans within minutes. */
  habitRemindersChangedAt: number | null;
  /** Set by the planner when it stopped for a long idle spell; cleared by the device on the next check-in. */
  habitRemindersIdleAt: number | null;
  /** When the person last started a new conversation; turns before it never carry into the next. Null until then, and on a profile from before. */
  conversationFreshAt: number | null;
  /** Home folds sessions from before today under Show earlier, unless one is still open; never ends a conversation. */
  isDailyFreshOn: boolean;
  /** "Notice what works for me"; a profile from before the field reads on. */
  isLearningOn: boolean;
  /** The day key the daily pattern check last ran; null until it has. */
  patternsCheckedOn: string | null;
  /** The next night's reflection is due from this instant; null when nothing new waits. */
  reflectDueAt: number | null;
  /** The next night's grouping of related things is due from this instant; null when nothing new waits. */
  relateDueAt: number | null;
  /** Stamped with any change to a scheduled action, so the server looks at the person's actions within minutes; null on a profile from before. */
  scheduledActionsChangedAt: number | null;
  /** When the person last chose Forget what you've noticed; what was made at or before it is hidden. */
  forgottenAt: number | null;
  /** The day key the weekly clean-up last ran; null until it has. */
  prunedOn: string | null;
  /** When the person last looked at what outside assistants added; null until then, and on a profile from before. */
  outsideSeenAt: number | null;
  /** When each connected app's offer to bring its people, pets and businesses into the circle was told, by app id; null until one was. */
  bringInToldAt: Record<string, number> | null;
  /** The depth research runs at when a request doesn't say; null asks when it feeds a decision and is a quick look otherwise. */
  researchDepth: 'light' | 'thorough' | null;
  /** This month's research allowance as the server last settled it, shown as "About 4 thorough looks left"; the server's own usage decides, never this. */
  researchAllowance: { month: string; leftCents: number } | null;
  calendarSync: HelmCalendarSync | null;
  createdAt: number;
  lastEditedAt: number | null;
}

export interface HelmCalendarSync {
  accountId: string;
  calendarId: string;
  calendarName: string;
  isMadeByHelm: boolean;
  /** Whether the calendar was already in the grant's read list before this was turned on, so stopping leaves it there. */
  wasAlreadyRead: boolean;
  startedAt: number;
  lastWrittenAt: number | null;
  lastError: string | null;
}

export type PhoneLocation = 'off' | 'city' | 'precise';

export interface ZoneSpan {
  zone: string;
  from: number;
  to: number;
  awayId: string;
}

export interface AbilityDecline {
  ability: 'location';
  level: 'city' | 'precise';
  declinedAt: number;
}

/** Somewhere else for a while: date-only `from` and `to`, both inclusive. */
export interface AwaySpan {
  id: string;
  city: City;
  from: number;
  to: number;
  label: string | null;
  source: 'said' | 'page';
  zoneOffered: boolean;
  /** Set when the person chose "Pause what runs at home" for this time away; scheduled actions made inside it wait it out too. Null on a span from before. */
  pausesScheduled: boolean | null;
}

export interface NearNow {
  city: string;
  at: number;
  /** Only at Precise, rounded to 3 decimals. */
  point: { lat: number; lng: number } | null;
}

export type StyleScope = 'general' | 'occasion' | 'audience';

export interface StyleTrait {
  /** A description of how the person writes, at most 120 characters; a quoted sign-off at most 30. */
  text: string;
  isPersonSet: boolean;
  /** How many pieces of writing showed it; 0 when the person wrote it. */
  exampleCount: number;
}

export interface StyleSealed {
  label: string;
  /** At most 12, by id. */
  traits: Record<string, StyleTrait>;
  /** At most 6, each at most 80 characters. */
  avoid: string[];
  /** Notes the person removed, each as `text.trim().replace(/\s+/g, ' ').toLowerCase()`; the last 30, so learning never brings one back. */
  removed: string[];
}

/** One writing-style note set at `apps/helm/users/{uid}/style/{styleId}`; no run of more than 30 characters of what the person typed is stored. */
export interface StyleProfile {
  scope: StyleScope;
  audienceWhoId: string | null;
  learnedFrom: ('helmText' | 'sentMail')[];
  sampleCount: number;
  personEditedAt: number | null;
  createdAt: number;
  lastEditedAt: number | null;
  sealed: Sealed;
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
  | 'isThisWho'
  | 'whichKin'
  | 'kinOrder'
  | 'whichIsTrue'
  | 'whichTopic'
  | 'groupTopics'
  | 'whichComesFirst'
  | 'clashChoice'
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
  /** The person let the question go without answering; `answeredAt` is set with it so it stops waiting. Null on one from before. */
  dismissedAt: number | null;
  /** The person asked for it again: it is live at the bottom of the thread from this moment. Null until then, and on one from before. */
  reaskedAt: number | null;
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
    | { collection: 'topics' | 'notes'; id: string }
    | null;
}

/** The structured answer to one question, by shape. `isMoney` numbers are integer cents. */
export type QuestionAnswerValue =
  | { shape: 'pickOne'; optionId: string; otherText: string | null }
  | { shape: 'yesNo'; optionId: string; otherText: string | null }
  | { shape: 'pickSeveral'; optionIds: string[]; otherText: string | null }
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

/** One thing an undo offer can take back: the records one execution wrote, whole or in part. */
export interface UndoChoice {
  optionId: string;
  executionId: string;
  docIds: string[];
  isAll: boolean;
  reason: UndoReason;
  quote: string | null;
}

/** An opened sealed question, built by code (which person or place) or written by the assistant; a code-built one's link is held until it is answered. */
export interface HelmQuestion {
  kind:
    | 'whichPerson'
    | 'whichPlace'
    | 'isThisWho'
    | 'whichKin'
    | 'kinOrder'
    | 'whichIsTrue'
    | 'whichTopic'
    | 'groupTopics'
    | 'whichComesFirst'
    | 'clashChoice'
    | 'undoOffer'
    | 'researchDepth'
    | 'researchRerun'
    | 'learnKind'
    | 'learnGoal'
    | 'learnStill'
    | 'learnTogether'
    | 'questionsTask'
    | 'asked';
  builtBy: 'code' | 'model';
  shape: QuestionShape;
  prompt: string;
  /** A quiet line drawn above the prompt (the assistant's reason for an undo offer); null on every other kind. */
  lead: string | null;
  /** What each choice of an undo offer takes back; [] on every other kind. */
  undoChoices: UndoChoice[];
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
  /** The open topic's id on the topic view; null on every other. */
  topicId: string | null;
  /** The open procedure's id on the procedure view; null on every other. */
  procedureId: string | null;
  /** The open run's id on the run view; null on every other. */
  runId: string | null;
  v: 1;
}

/** One turn: what the person said, with the words sealed. */
export interface Capture {
  inputMode: 'typed' | 'voice' | 'attachment';
  /** Whether the reply is said aloud: a spoken turn, or a choice tapped while a spoken conversation was open; null on a turn from before, read as `inputMode === 'voice'`. */
  isSpokenTurn: boolean | null;
  /** Which listener wrote a spoken turn ('browser'); null on every other turn. */
  sttProvider: string | null;
  /** The capture whose spoken reply the person talked over to say this; null on every other turn. */
  interruptedCaptureId: string | null;
  /** The question this turn answers, when it answers one the assistant wrote; null on every other turn and on one made before questions had shapes. */
  answersQuestion: { captureId: string; questionId: string } | null;
  /** Which voice said the turn's spoken line ('natural' or 'system'); null until one did. */
  ttsProvider: string | null;
  /** How the turn reached the person's account: written by the device ('direct') or imported from the drop box. A turn made before the field reads as 'direct'. */
  arrivedVia: 'direct' | 'dropBox' | 'scheduled' | 'researchAhead';
  /** The scheduled action a run's turn was made for; null on any other turn. */
  scheduledActionId: string | null;
  /** The offer ahead of a project this turn answers (its sealed text is the brief); the server turns it into the research. Null on any other turn and on one made before the field. */
  aheadOffer: {
    projectId: string;
    offerId: string;
    depth: 'light' | 'thorough';
    when: 'now' | 'later';
  } | null;
  /** Whether the turn acted, was only noted, or answered a question; null on a turn from before. */
  disposition: CaptureDisposition | null;
  /** 'mcp' for a turn an outside assistant (Claude, Gemini) sent; 'web' for every turn typed or spoken in Helm. */
  medium: 'web' | 'mcp';
  /** The outside assistant's name on an 'mcp' turn; null on every web turn and on every turn made before the field. */
  via: string | null;
  /** The read switches the outside assistant had on when it asked, which bound what its answer may read; null on every web turn and on every turn made before the field. Only the server writes it. */
  outsideReadScopes: ('mail' | 'drive' | 'apps')[] | null;
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
  /** The photos sent with the turn, in pick order, at most 5; empty on a turn with none and on one made before photos. */
  attachmentIds: string[];
  seenAt: number | null;
  /** A turn that couldn't be sorted, cleared from Needs you by the person; null on every other turn and on one from before. */
  dismissedAt: number | null;
  /** `"{connectorId}|{accountId}"` of each connection an answer quoted; empty on a turn that quoted none and on one made before quotes. */
  quotedSourceKeys: string[];
  /** The note made from this turn's general answer by Save to my knowledge; null until then. */
  answerSavedNoteId: string | null;
  /** The who and places this turn named, once the assistant has read it. */
  whoIds: string[];
  placeIds: string[];
  createdAt: number;
  sortedAt: number | null;
  /** Set when the assistant was asked to plan a day: "YYYY-MM-DD", which the device plans on sight. */
  planDayKey: string | null;
  /** Set on the answer to the morning card: the day ("YYYY-MM-DD") whose aims it files; null on every other turn and on one made before the field. */
  aimsDayKey: string | null;
  /** The day of the morning question that was open on screen when the turn was sent; the server files aims from it only when the turn answers the question. Null on every other turn. */
  morningDayKey: string | null;
  /** The page it was asked from; null from home and on turns made before pages could be asked about. */
  screen: ScreenContext | null;
  /** The class of what the turn quotes; private when the turn filed or touched a private thing. */
  privacy: PrivacyClass | null;
  /** Whether the turn filed or touched a private thing, set by the executor; null before it ran. */
  touchesPrivate: boolean | null;
  /** How many observations this turn's learning wrote; set by the server in the turn's transaction, null before it ran and on a turn made before the field (read as 0). */
  noticedCount: number | null;
  /** How the turn began and whether anyone was looking: a wake-phrase turn on a hidden or untouched page is answered without private names. Null on a turn made before the field. */
  presence: {
    startedByWake: boolean;
    isHidden: boolean;
    isUntouched: boolean;
  } | null;
  /** This phone's location setting and the browser's permission when the turn was sent; null on a turn made before the field. */
  abilities: {
    location: { setting: PhoneLocation; permission: LocationPermission };
  } | null;
  sealed: Sealed;
}

export type LocationPermission =
  'granted' | 'prompt' | 'denied' | 'unsupported';

/** A location offer under an answer: a button to turn it on, or the line on how to allow it in the browser. */
export interface AbilityOffer {
  ability: 'location';
  level: 'city' | 'precise';
  mode: 'offer' | 'settingsLine';
}

export type SourceRef =
  | {
      kind:
        | 'fact'
        | 'task'
        | 'project'
        | 'who'
        | 'place'
        | 'procedure'
        | 'media'
        | 'topic';
      id: string;
    }
  | {
      kind: 'note';
      id: string;
      title: string;
      topicPath: string | null;
      topicEmoji: string | null;
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

/** A record read from another app, as the answer kept it. */
export interface AnswerRecord {
  name: string;
  detail: string | null;
  amount: string;
}

export interface AnswerQuote {
  id: string;
  connectorId: string;
  accountId: string;
  sourceLabel: string;
  /** When the quoted message was sent; null on quotes kept before it was recorded. */
  at: number | null;
  text: string | null;
  /** Null on a mail or document quote and on app records kept before it was stored; those are read from `sourceLabel` and `text`. */
  record: AnswerRecord | null;
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
  generalDiffersFrom: { noteId: string; title: string; says: string } | null;
  suggestedTopicId: string | null;
  quotes: AnswerQuote[];
  searched: SearchedSource[];
}

/** A name the turn may have meant that the words don't carry as written. At most 10 on a turn. */
export interface HeardName {
  heard: string;
  said: string | null;
  recordId: string | null;
  candidateIds: string[];
}

export interface CaptureSealed {
  text: string;
  reading: CaptureReading;
  answer: CaptureAnswer | null;
  /** The questions the turn asked, by id; only the readable ones carry words here. */
  questions?: Record<string, unknown>;
  /** On a turn that answers a question, the structured answer; null when a spoken one could not be placed. A turn made before answers had shapes reads as null. */
  questionAnswer: QuestionAnswerValue | null;
  heardNames: HeardName[] | null;
  /** The line the server wrote for the person to hear and read; absent until it wrote one. */
  spoken?: { text: string; heldText: string | null } | null;
  /** The person asked to hear the line kept off the speaker; absent on every other turn. */
  asksHeldLine?: boolean;
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
  heardNames: HeardName[] | null;
  /** The server's line for the turn, read aloud and shown on its card; null until it wrote one, and on one that would not open. */
  line: string | null;
  /** The line the server really wrote when it kept a quiet thing off the speaker and put the screen line in `line`; null on every other turn. */
  heldLine: string | null;
  /** The person asked to hear the line kept off the speaker, so the device says it instead of a reply; false on every other turn. */
  asksHeldLine: boolean;
  isUnreadable: boolean;
  /** The turn was a closing phrase the assistant's own reading found ("ugh, doesn't matter"); it made nothing. False on a turn made before closing phrases. */
  endedConversation: boolean;
  /** The write has not reached the server yet, so it waits for a connection. */
  hasPendingWrites: boolean;
}

export type TaskStatus = 'open' | 'done';
export type Importance = 'must' | 'should' | 'could';
export type Energy = 'low' | 'medium' | 'high';
export type TaskEffort = 'light' | 'moderate' | 'heavy';
export type TaskContext = 'atHome' | 'out' | 'atComputer' | 'onPhone';

export type MeetingFormat = 'inPerson' | 'video' | 'phone';

/** How a task with a moment due meets; the place is the task's own `placeIds`. */
export interface TaskMeets {
  how: MeetingFormat;
  setBy: 'person' | 'calendar';
}

export interface Task {
  status: TaskStatus;
  importance: Importance | null;
  isUrgent: boolean;
  due: TaskDue | null;
  durationMinutes: number | null;
  /** How heavy the task is, for the break after it; null reads as moderate. */
  effort: TaskEffort | null;
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
  /** The meeting a task's questions are for; null for any other task and for one from before the field. */
  meeting: TaskMeeting | null;
  /** The answer to "Do they feel ready?" for that meeting. */
  readyAnswer: TaskReadyAnswer | null;
  /** How the meeting happens, readable; null when never said and on a task from before the field. */
  meets: TaskMeets | null;
  mediaIds: string[];
  createdBy: 'person' | 'nomos';
  sourceCaptureId: string | null;
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  completedAt: number | null;
  /** Set when the person clears the done tasks of a project: hidden from its done fold, still found by search. */
  clearedAt: number | null;
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface AppSource {
  connectorId: string;
  sourceRef: string;
  importedAt: number;
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
  /** The records in other apps this one was brought in from, or merged with, so a later offer skips them and a disconnect can say what came from where; empty on one that came from nowhere and on one made before the field. */
  appSources: AppSource[];
  /** The newest capture that named it. */
  lastMentionedAt: number | null;
  yearlyDateCount: number;
  momentCount: number;
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export type { KinKind, KinOrder, WhoKin } from '@apps/helm/engine/kinKinds';
export type {
  ContactKind,
  ContactPoint,
} from '@apps/helm/engine/contactPoints';

export interface WhoSealed {
  name: string;
  /** "Also called": the nicknames the person gave, at most 10; every matcher reads them as names. */
  aliases: string[];
  /** The person's relation to the self from the fixed family list; `relation` stays the person's own words. Null when none, and in a payload sealed before the field. */
  kin: WhoKin | null;
  /** "Also heard as": forms the recognizer got wrong, matched on the device and never shown as a name. Null when none. */
  soundsLike: string[] | null;
  /** Names the person said are not this who, so they are never proposed again; at most 20. Null when none. */
  refusedAliases: string[] | null;
  /** "my sister", "our vet clinic". */
  relation: string | null;
  /** At most 10, exactly one primary when any; absent in a payload sealed before the lists, which `phone` then stands for. */
  /** Absent on a payload sealed before the lists: read only through `readContactPoints`. */
  phones?: ContactPoint[] | null;
  emails?: ContactPoint[] | null;
  /** @deprecated Read as the primary of `phones`, labelled Other; written null. */
  phone: string | null;
  /** @deprecated Read as the primary of `emails`, labelled Other; written null. */
  email: string | null;
  notes: string | null;
  /** Pets only ("Cat"). */
  species: string | null;
  /** Organizations only ("Bakery"). */
  organizationKind: string | null;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
  /** Where they live. Null when unknown, and in a payload sealed before the field. */
  home: City | null;
  homeSource: 'said' | 'page' | null;
  /** At most 5; spans that ended before today are dropped on the next write. */
  away: AwaySpan[] | null;
  /** Self only, with phone location on; lapses after 6 hours. */
  nearNow: NearNow | null;
}

/** A who after its words are opened; one that would not open keeps `isUnreadable` and an empty name. */
export interface OpenWho
  extends
    Omit<Who, 'sealed' | 'phones' | 'emails'>,
    Omit<WhoSealed, 'phones' | 'emails'> {
  /** Always the lists, filled by `readContactPoints` when the who is opened. */
  phones: ContactPoint[];
  emails: ContactPoint[];
  id: string;
  isUnreadable: boolean;
}

export type {
  ConnectionKind,
  ConnectionRelation,
  ConnectionSource,
  CoupleStatus,
} from '@apps/helm/engine/connections';

/** `apps/helm/users/{uid}/connections/{id}`: how two of the person's people are connected. The id is `toConnectionId`, so a pair and kind exists once; the words are sealed, the pair and kind stay readable. */
export interface Connection {
  /** Two who ids, sorted. */
  whoIds: [string, string];
  kind: ConnectionKind;
  /** `refused` is a proposal the person turned down, or later a correction; it is never drawn as a connection. */
  source: ConnectionSource;
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface ConnectionSealed {
  /** What `whoIds[0]` is to `whoIds[1]`; a family word, `friend`, `coworker` or `partner`. */
  fromFirst: ConnectionRelation | null;
  /** What `whoIds[1]` is to `whoIds[0]`. */
  fromSecond: ConnectionRelation | null;
  /** A couple only; null for every other kind. */
  status: CoupleStatus | null;
  /** Date-only, UTC midnight. */
  since: number | null;
}

/** A connection after its words are opened; one that would not open keeps `isUnreadable` and is never drawn. */
export interface OpenConnection
  extends Omit<Connection, 'sealed'>, ConnectionSealed {
  id: string;
  isUnreadable: boolean;
}

export type ScheduledActionKind = 'commands' | 'prompt';

export type ScheduledOutcome =
  'done' | 'needsYou' | 'failed' | 'skipped' | 'waiting';

export type ScheduledFailReason =
  'notConnected' | 'grantExpired' | 'notAllowed' | 'runFailed' | 'ruleInvalid';

/** `apps/helm/users/{uid}/scheduledActions/{id}`: something the assistant does for the person at a set time. `repeat` is an RRULE body read only through `@/utils/repeatRule`; every occurrence is a day and `time` is applied after, in `timeZone` or the home zone. */
export interface ScheduledAction {
  status: 'active' | 'paused' | 'ended';
  endedBy: 'person' | 'finished' | null;
  repeat: string | null;
  startsOn: string;
  time: string;
  timeZone: string | null;
  /** The original day keys of future runs skipped, at most 100. */
  skipped: string[];
  /** Original day key to the day and time that run happens instead, once; at most 20 future. */
  moved: Record<string, { day: string; time: string }>;
  nextRunAt: number | null;
  nextRunKey: string | null;
  splitFromId: string | null;
  kind: ScheduledActionKind;
  /** The command kinds a run may write; checked at create and at each run. */
  allowed: string[];
  needsApproval: boolean;
  lastRunAt: number | null;
  lastRunCaptureId: string | null;
  /** The set time of the last run, which its outcome line shows. */
  lastRunDueAt: number | null;
  lastOutcome: ScheduledOutcome | null;
  lastFailReason: ScheduledFailReason | null;
  /** Date-only, inclusive; runs on a day between them are paused. */
  pausedFrom: number | null;
  pausedUntil: number | null;
  pausedForSpanId: string | null;
  /** Set by the device to run it once now, only before its next scheduled run; the server clears it. */
  runNowAt: number | null;
  createdBy: 'person' | 'nomos';
  sourceCaptureId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface ScheduledActionSealed {
  title: string;
  /** The person's words; what a `prompt` action does. */
  instruction: string | null;
  /** The commands a `commands` action runs, as the executor reads them. */
  heldCommands: Record<string, unknown>[] | null;
}

export interface OpenScheduledAction
  extends Omit<ScheduledAction, 'sealed'>, ScheduledActionSealed {
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
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
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
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface PlaceSealed {
  name: string;
  aliases: string[];
  address: string | null;
  notes: string | null;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
}

export interface OpenPlace extends Omit<Place, 'sealed'>, PlaceSealed {
  id: string;
  isUnreadable: boolean;
}

export type ProjectRole = 'key' | 'involved' | 'mentioned';

/** `apps/helm/users/{uid}/projects/{projectId}`: something with several steps. Its words are sealed; the roles are ids and an enum only. */
export type ProjectKind = 'project' | 'goal';
export type ProjectStatus = 'active' | 'paused' | 'finished';

export interface Project {
  /** A project from before the field reads `'project'`. */
  kind: ProjectKind;
  /** Date-only, UTC midnight. */
  targetDate: number | null;
  /** An unknown status reads `'active'`. */
  status: ProjectStatus;
  /** When it was set aside; resuming wakes the habits whose own pause carries this instant. */
  pausedAt: number | null;
  /** Date-only, UTC midnight; null means until the person picks it back up. */
  pausedUntil: number | null;
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
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  /** Research offered ahead of the date (at most 3); absent on a project from before the field, read as none. Their words are in `sealed.aheadAsks`. */
  researchOffers: AheadOfferMeta[];
  sealed: Sealed;
}

/** The words of one research offer ahead of a project's date. */
export interface AheadAsk {
  /** "apartments", at most 60 characters. */
  subject: string;
  /** What to find out, at most 300 characters. */
  question: string;
  /** The model's reason it helps now ("Nothing in Move yet says what you're looking for."), at most 120 characters. */
  whyNow: string | null;
  /** Whether the answer feeds a decision with money or a date, so the sheet asks how deep. */
  isDecision: boolean;
  /** At most 5. */
  questions: LeadQuestion[];
  /** Set when the person sends it. */
  answers: Record<string, LeadAnswer> | null;
  brief: string | null;
}

export interface ProjectSealed {
  name: string;
  emoji: string | null;
  objective: string | null;
  milestones: Record<string, { title: string }>;
  /** A goal's why; null for a project, or a goal whose why was skipped. */
  why: GoalWhy | null;
  /** whoId to a short note ("florist"). */
  roleNotes: Record<string, string>;
  /** Where it sits in what matters most; null when nothing was said, absent in a payload sealed before the field. */
  importance: ImportancePlace | null;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
  /** offer id to its words; absent in a payload sealed before the field. */
  aheadAsks: Record<string, AheadAsk> | null;
  /** Kept quiet: shown on screen, never said aloud; null when not, absent in a payload sealed before the field. */
  quietMark: QuietMark | null;
  /** The last day it stays quiet (YYYY-MM-DD, the profile's zone); null keeps it quiet until released. */
  quietUntil: string | null;
  /** The person released it, so a guess never keeps it quiet again. */
  isQuietCleared: boolean | null;
}

export interface OpenProject extends Omit<Project, 'sealed'>, ProjectSealed {
  id: string;
  isUnreadable: boolean;
}

export type NoteSource =
  | 'typed'
  | 'capture'
  | 'savedAnswer'
  | 'importedFile'
  | 'assistantDraft'
  | 'learnedLater'
  | 'outside';

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
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface NoteSealed {
  title: string;
  body: string;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
  /** Kept quiet: shown on screen, never said aloud; null when not, absent in a payload sealed before the field. */
  quietMark: QuietMark | null;
  /** The last day it stays quiet (YYYY-MM-DD, the profile's zone); null keeps it quiet until released. */
  quietUntil: string | null;
  /** The person released it, so a guess never keeps it quiet again. */
  isQuietCleared: boolean | null;
  /** The outside assistant that saved it; null on every other note and on one made before the field. */
  via: string | null;
  /** Links the outside assistant brought; empty on every other note and on one made before the field. */
  links: { title: string; url: string }[];
}

export interface OpenNote extends Omit<Note, 'sealed'>, NoteSealed {
  id: string;
  isUnreadable: boolean;
}

/** `apps/helm/users/{uid}/groupings/{groupingId}`; the id hashes the sorted source keys. */
export interface Grouping extends GroupingMeta {
  sealed: Sealed;
}

export interface GroupingSealed {
  proposedTitle: string | null;
  emoji: string | null;
  /** Source key to its title; none for a private source. */
  titles: Record<string, string>;
}

export interface OpenGrouping extends Omit<Grouping, 'sealed'>, GroupingSealed {
  id: string;
  isUnreadable: boolean;
}

export type TopicDepth = 1 | 2 | 3;

export type TopicSource =
  | { kind: 'note'; noteId: string }
  | {
      kind: 'message';
      captureId: string;
      at: number;
      noteId: string | null;
    }
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
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface TopicSealed {
  name: string;
  emoji: string | null;
  overview: string | null;
  sections: TopicSection[];
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
}

export interface OpenTopic extends Omit<Topic, 'sealed'>, TopicSealed {
  id: string;
  isUnreadable: boolean;
}

export type TopicVersionReason =
  | 'firstWritten'
  | 'addedFromSource'
  | 'personEdit'
  | 'revisedOnRequest'
  | 'moved'
  | 'grouped'
  | 'rearranged'
  | 'imported'
  | 'sourceRemoved'
  | 'restored';

/** `topics/{id}/versions/{n}`: one change to a topic's document; never rewritten. */
export interface TopicVersion {
  version: number;
  restoredFromVersion: number | null;
  createdBy: 'person' | 'nomos';
  reason: TopicVersionReason;
  noteIds: string[];
  sourceCaptureId: string | null;
  executionId: string | null;
  createdAt: number;
  sealed: Sealed;
}

export interface TopicVersionSealed {
  sections: TopicSection[];
  changeSummary: string;
  requestQuote: string | null;
  parentName: string | null;
}

export interface OpenTopicVersion
  extends Omit<TopicVersion, 'sealed'>, TopicVersionSealed {
  id: string;
}

/** The words of a procedure that a version keeps; the private marks belong to the record, not to a version. */
export type ProcedureBody = Omit<
  ProcedureSealed,
  'privateMark' | 'isPrivacyCleared'
>;

export interface ProcedureSealed {
  title: string;
  steps: Record<string, StepBody>;
  groups: Record<string, { name: string }>;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
}

/** `apps/helm/users/{uid}/procedures/{id}`: a routine kept once, its steps in named groups. */
export interface Procedure {
  stepState: Record<string, StepPlace>;
  groupOrder: string[];
  version: number;
  createdBy: 'person' | 'nomos';
  sourceCaptureId: string | null;
  sourceTaskId: string | null;
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface OpenProcedure
  extends Omit<Procedure, 'sealed'>, ProcedureSealed {
  id: string;
}

export type ProcedureVersionReason =
  'created' | 'personEdit' | 'revisedOnRequest' | 'restored' | 'fromRun';

/** `procedures/{id}/versions/{n}`: one change to a procedure; never rewritten. */
export interface ProcedureVersion {
  version: number;
  restoredFromVersion: number | null;
  createdBy: 'person' | 'nomos';
  reason: ProcedureVersionReason;
  stepState: Record<string, StepPlace>;
  groupOrder: string[];
  sourceCaptureId: string | null;
  executionId: string | null;
  createdAt: number;
  sealed: Sealed;
}

export interface ProcedureVersionSealed extends ProcedureBody {
  changeSummary: string;
  requestQuote: string | null;
}

export interface OpenProcedureVersion
  extends Omit<ProcedureVersion, 'sealed'>, ProcedureVersionSealed {
  id: string;
}

/** What a run is for: a project, or a trip or event copied from another app; null for a run that is for nothing. */
export type RunAttachment = { kind: 'project' | 'synced'; id: string } | null;

export interface RunStepPlace extends StepPlace {
  doneAt: number | null;
  /** A step added for this run alone. */
  isExtra: boolean;
}

export interface RunSealed {
  title: string;
  steps: Record<string, StepBody>;
  groups: Record<string, { name: string }>;
  /** What the run is for, kept so it still reads after the trip or event leaves the calendar. */
  attachedLabel: string | null;
}

/** `apps/helm/users/{uid}/procedureRuns/{id}`: one go at a procedure, holding the steps it started with. */
export interface ProcedureRun {
  procedureId: string;
  procedureVersion: number;
  attachedTo: RunAttachment;
  /** The trip's or event's first day, a date-only UTC midnight; null for a run that is for nothing. */
  dueOn: number | null;
  stepState: Record<string, RunStepPlace>;
  groupOrder: string[];
  startedAt: number;
  finishedAt: number | null;
  createdBy: 'person' | 'nomos';
  executionId: string | null;
  lastEditedAt: number | null;
  sealed: Sealed;
}

export interface OpenRun extends Omit<ProcedureRun, 'sealed'>, RunSealed {
  id: string;
}

export type MediaStatus = 'uploading' | 'received' | 'kept' | 'discarded';

/** A record a medium shows on, by id. */
export interface MediaAttachment {
  kind: 'who' | 'place' | 'task' | 'fact' | 'note';
  id: string;
}

/** The who or place a photo shows on. */
export interface PhotoOwner {
  kind: 'who' | 'place';
  id: string;
}

export type MediaKind = 'photo' | 'pdf' | 'voiceNote' | 'markdown';

/** A person's photo, PDF, voice note or Markdown file. Its sealed bytes are in Storage, except a Markdown file, whose text is sealed in this document. */
export interface Media {
  kind: MediaKind;
  /** A who's or place's picture, as opposed to a file a turn brought in. */
  role: 'attachment' | 'photo';
  status: MediaStatus;
  /** Of the original, before sealing. */
  mimeType: string;
  hasThumb: boolean;
  /** A voice note's recorded length; null on any other kind. */
  durationMs: number | null;
  /** A PDF's pages as the device counted them; null on any other kind. */
  pageCount: number | null;
  attachedTo: MediaAttachment[];
  decidedBy: 'nomos' | 'person' | null;
  createdAt: number;
  decidedAt: number | null;
  /** A discarded medium is deleted after this; an upload that never finished too. */
  deleteAfter: number | null;
  /** The turn that sent it; null on a who's or place's photo and on one made before photos in turns. */
  sourceCaptureId: string | null;
  /** The execution that kept it, so Undo can find it; null until one did. */
  executionId: string | null;
  sealed: Sealed;
}

export interface MediaSealed {
  /** Null for a Markdown file, which has no Storage object. */
  bytesNonce: string | null;
  thumbNonce: string | null;
  /** The assistant's one line about a photo it kept, up to 200 characters; null on any other. */
  caption: string | null;
  /** The data key that sealed the bytes. */
  keyId: string;
  /** A PDF's or Markdown file's name, up to 120 characters. */
  fileName: string | null;
  /** A Markdown file's text (up to 20,000 characters) or a voice note's transcript (up to 5,000). */
  text: string | null;
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
  /** The meeting's name, for a task whose questions are for one; absent in a payload sealed before the field. */
  meetingLabel: string | null;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
  /** Kept quiet: shown on screen, never said aloud; null when not, absent in a payload sealed before the field. */
  quietMark: QuietMark | null;
  /** The last day it stays quiet (YYYY-MM-DD, the profile's zone); null keeps it quiet until released. */
  quietUntil: string | null;
  /** The person released it, so a guess never keeps it quiet again. */
  isQuietCleared: boolean | null;
}

/** A task after its words are opened; one that would not open keeps `isUnreadable` and an empty title. */
export interface OpenTask extends Omit<Task, 'sealed'> {
  id: string;
  title: string;
  notes: string | null;
  steps: Record<string, { text: string }>;
  meetingLabel: string | null;
  privateMark: PrivateMark | null;
  isPrivacyCleared: boolean | null;
  quietMark: QuietMark | null;
  quietUntil: string | null;
  isQuietCleared: boolean | null;
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
    | 'seenAs'
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
    | 'procedureRuns'
    | 'habits'
    | 'habitDays'
    | 'connections'
    | 'patterns'
    | 'scheduledActions'
    | 'research'
    | 'dayAims'
    | 'groupings'
    /** A change an app made for an outside assistant; the id is `{connectorId}__{changeId}`, and Undo asks that app. */
    | 'appChanges';
  docId: string;
}

export interface ExecutionEffect {
  written: Record<string, unknown>;
  previous: Record<string, unknown> | null;
}

export interface Execution {
  captureId: string | null;
  actor: 'nomos' | 'person';
  /** The outside assistant whose turn this was (Claude, Gemini); null for the person's own. */
  via: string | null;
  category: ActionCategory;
  autonomyLevel: AutonomyLevel;
  state: ExecutionState;
  effectRefs: EffectRef[];
  /** Who and places the execution linked, matched or made; ids only. */
  linkedWhoIds: string[];
  linkedPlaceIds: string[];
  undoesExecutionId: string | null;
  undoneByExecutionId: string | null;
  /** Records a partial undo took back, by id; null on a document written before partial undo and on every execution not yet partly undone. */
  undoneDocIds: string[] | null;
  /** Every undo that took part of this execution back, oldest first; null as above. */
  partUndoIds: string[] | null;
  questionRef: { captureId: string; questionId: string } | null;
  errorCode: string | null;
  createdAt: number;
  decidedAt: number | null;
  finishedAt: number | null;
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface ResultNoteLine {
  text: string;
  ref: { collection: 'notes' | 'topics'; id: string };
}

export interface ExecutionSealed {
  summary: string;
  /** The assistant's own line about the turn, shown in place of the summary on home; null when it wrote none or something asked for wasn't done. */
  said: string | null;
  commands: unknown[];
  effects: ExecutionEffect[];
  undoReport: string | null;
  /** The line said aloud after a spoken turn, code-built; null for a typed turn, an undo and anything made before voice. */
  spoken: string | null;
  /** The line the server really wrote when it kept a quiet thing off the speaker and put the screen line in `spoken`; null on every other execution; absent on one written before the field. */
  heldSpoken: string | null;
  /** The records an undo found deleted, by id; null on every other execution. */
  goneIds: string[] | null;
  /** Why an undo was asked for and how; null on every execution that is not an undo and on ones made before this. */
  undoReason: UndoReasonRecord | null;
  /** Result rows that touch no record (a note already kept); null on executions that said none. */
  lines: ResultNoteLine[] | null;
  /** An answer's phone-location offer; null on executions that made none and on anything made before offers. */
  abilityOffer: AbilityOffer | null;
  /** The offer to follow an away city's clock; null like the offer above. */
  awayZoneOffer: AwayZoneOffer | null;
}

export type UndoReason =
  'wrongThing' | 'wrongDetails' | 'tooHasty' | 'changedMind' | 'unclear';

export interface UndoReasonRecord {
  reason: UndoReason;
  quote: string | null;
  via: 'offer' | 'card' | 'voice';
}

/** An execution after its payload is opened; one that would not open keeps `isUnreadable` and says nothing. */
export interface OpenExecution extends Omit<
  Execution,
  'sealed' | 'undoneDocIds' | 'partUndoIds'
> {
  id: string;
  undoneDocIds: string[];
  partUndoIds: string[];
  summary: string;
  said: string | null;
  effects: ExecutionEffect[];
  undoReport: string | null;
  spoken: string | null;
  heldSpoken: string | null;
  goneIds: string[] | null;
  undoReason: UndoReasonRecord | null;
  lines: ResultNoteLine[];
  abilityOffer: AbilityOffer | null;
  awayZoneOffer: AwayZoneOffer | null;
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
    | 'meets'
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
  /** Set on an event the plan sync wrote to the calendar; null on every other copy and on one from before. */
  helmRef: string | null;
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
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface FactSealed {
  statement: string;
  quote: string | null;
  /** What a preference or favorite is about ("gas station", "movies"); a fact written before topics existed has none. */
  topic: string | null;
  /** The shown text of what the fact says about its field, such as "2:00 PM", or the preferred or favorite thing ("Shell"). */
  value: string | null;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
}

/** A fact after its words are opened; one that would not open is left out. */
export interface OpenFact extends Omit<Fact, 'sealed'> {
  id: string;
  statement: string;
  quote: string | null;
  topic: string | null;
  value: string | null;
  privateMark: PrivateMark | null;
  isPrivacyCleared: boolean | null;
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
  /** The synced event a kept slot overlaps, when it does. */
  overlapsEventRef: string | null;
}

export type StruggleSignal = (typeof STRUGGLING_TAGS)[number];

/** The sealed part of a day's aims; `windDown` is keyed by taskId. */
export interface DayAimsSealed {
  aims: {
    aimId: string;
    taskId: string;
    order: number;
    lengthIsGuess: boolean;
    broughtFrom: string | null;
  }[];
  windDown: Record<
    string,
    {
      result: 'done' | 'tonight' | 'wontHappen';
      choice: 'tomorrow' | 'later' | 'dropped' | null;
      reason: StruggleSignal | null;
      saidSpanId: string | null;
    }
  >;
}

/** One document per day, id = "YYYY-MM-DD" in the profile's zone. */
export interface DayAims {
  /** Date-only, UTC midnight. */
  date: number;
  state: 'open' | 'answered' | 'dismissed';
  windDownState: 'waiting' | 'ready' | 'done' | 'dismissed';
  lookAt: number | null;
  rolledAt: number | null;
  sealed: Sealed;
}

/** A day's aims after their sealed payload is opened; an unreadable one keeps its readable fields and no aims. */
export interface OpenDayAims extends Omit<DayAims, 'sealed'> {
  /** "YYYY-MM-DD" in the profile's zone. */
  id: string;
  aims: DayAimsSealed['aims'];
  windDown: DayAimsSealed['windDown'];
  isUnreadable: boolean;
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

export type HabitStatus = 'active' | 'paused' | 'ended' | 'retired';
export type HabitStage = 'building' | 'holding' | 'formed' | 'buildingAgain';
export type ReminderPace = 'adaptive' | 'start' | 'late';
export type HabitEventKind =
  | 'started'
  | 'reminderOn'
  | 'reminderOff'
  | 'reminderPace'
  | 'stage'
  | 'paused'
  | 'resumed'
  | 'retired'
  | 'broughtBack'
  | 'ended'
  | 'restarted'
  | 'nameShown'
  | 'nameHidden';

/** Issue 110 owns reminders; a habit made now writes null. */
export interface HabitReminder {
  isOn: boolean;
  pace: ReminderPace;
  anyTimeAt: string | null;
  allowQuietHours: boolean;
  turnedOnAt: number;
  easedAt: number | null;
}

/** A window's times are a floating "HH:mm" in the profile's zone; `{}` means any time of the day. */
export interface HabitWindowState {
  start: string;
  end: string;
  part: DayPart | null;
  order: number;
  editedAt: number | null;
}

export interface HabitHistoryEvent {
  kind: HabitEventKind;
  at: number;
  by: 'person' | 'nomos';
  pace: ReminderPace | null;
  stage: HabitStage | null;
}

export type { ImportancePlace };

/** `apps/helm/users/{uid}/habits/{habitId}`: something kept up rather than finished; a missed time simply passes. */
export interface Habit {
  status: HabitStatus;
  cadence: Cadence;
  windowState: Record<string, HabitWindowState>;
  timesPerDay: number | null;
  projectId: string | null;
  forWhoId: string | null;
  isCare: boolean;
  /** Date-only, UTC midnight. */
  startsOn: number;
  endsOn: number | null;
  pausedUntil: number | null;
  reminder: HabitReminder | null;
  lockScreenName: string | null;
  stage: HabitStage | null;
  stageAt: number;
  stageWeek: string | null;
  rejudgeFrom: string | null;
  careAskedAt: number | null;
  /** "Which medicine is it?" asked (once, ever); a record from before the field reads null. */
  medicineAskedAt: number | null;
  untoldSince: number | null;
  formedAt: number | null;
  /** When "Keep it on Today" was last chosen on the Formed offer, and how many times since it last became Formed; the offer waits longer each time. A record from before the fields reads null and 0. */
  formedKeptAt: number | null;
  formedKeptCount: number;
  formedSummary: { doneCount: number; dueCount: number; since: number } | null;
  history: HabitHistoryEvent[];
  createdBy: 'person' | 'nomos';
  sourceCaptureId: string | null;
  executionId: string | null;
  createdAt: number;
  lastEditedAt: number | null;
  pausedAt: number | null;
  endedAt: number | null;
  retiredAt: number | null;
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface HabitSealed {
  name: string;
  emoji: string | null;
  notes: string | null;
  medicine: { name: string; dose: string | null } | null;
  windows: Record<string, { label: string }>;
  importance: ImportancePlace | null;
  /** The record's own mark; null when it has none or the person cleared it, absent in a payload sealed before the field. */
  privateMark: PrivateMark | null;
  /** The person said it needn't be private, so code never marks it again. */
  isPrivacyCleared: boolean | null;
}

/** A habit after its words are opened; one that would not open keeps `isUnreadable` and an empty name. */
export interface OpenHabit extends Omit<Habit, 'sealed'>, HabitSealed {
  id: string;
  isUnreadable: boolean;
}

export interface HabitCheck {
  status: 'done' | 'skipped';
  /** The instant it happened, not when it was typed. */
  at: number;
  by: 'person' | 'nomos';
  executionId: string | null;
}

export interface HabitDayEntry {
  /** windowId, or 'day' for a habit with no windows. */
  checks: Record<string, HabitCheck>;
  count: number;
  lastCountAt: number | null;
  reminded: Record<string, number>;
  followUpAt: number | null;
  followUpState: 'asked' | 'answered' | 'skipped' | null;
  noteKeys: string[];
}

/** `habitDays/{dayKey}`: one per habit day, every habit in it. */
export interface HabitDay {
  /** Date-only, UTC midnight of the day key. */
  date: number;
  isInUse: boolean;
  entries: Record<string, HabitDayEntry>;
  sealed: Sealed | null;
}

export interface HabitDaySealed {
  /** "habitId/windowId" to the check-in note, word for word. */
  notes: Record<string, { text: string; at: number; captureId: string | null }>;
}

/** A day after its notes are opened; `id` is the day key. */
export interface OpenHabitDay extends Omit<HabitDay, 'sealed'> {
  id: string;
  notes: HabitDaySealed['notes'];
  isUnreadable: boolean;
}

export type PatternKind =
  | 'windowMissed'
  | 'doneOutsideWindow'
  | 'plannedSlotMissed'
  | 'offerDeclined'
  | 'habitFormed'
  | 'reminderEase'
  | 'saidStruggling'
  | 'saidWorking'
  | 'saidLink'
  | 'tooManyGoals'
  | 'deadlineWontFit'
  | 'starved'
  | 'busyStretch';

export type PatternBucket =
  | { kind: 'weekdayPart'; weekday: Weekday; part: DayPart }
  | { kind: 'shift'; relation: 'beforeShift' | 'afterShift'; part: DayPart }
  | { kind: 'stretch'; from: number; to: number }
  | { kind: 'none' };

export type PatternState =
  'candidate' | 'suggested' | 'accepted' | 'declined' | 'undone' | 'retired';

export type PatternHandling = 'actAndTell' | 'suggest' | 'askOnly';
export type PatternMoment = 'daily' | 'onStart';

export type PatternEffect =
  | { kind: 'plannerAvoid'; bucket: PatternBucket }
  | {
      kind: 'moveWindow';
      habitId: string;
      windowId: string;
      start: string;
      end: string;
    }
  | { kind: 'retireHabit'; habitId: string }
  | { kind: 'easeReminders'; habitId: string }
  | {
      kind: 'pause';
      collection: 'projects' | 'habits';
      id: string;
      until: number | null;
    }
  | { kind: 'lowerCadence'; habitId: string; cadence: Cadence }
  | {
      kind: 'talkItThrough';
      start: 'differentTime' | 'smaller' | 'somethingNew';
    }
  | { kind: 'keepTime'; habitId: string; windowId: string }
  | { kind: 'raiseCadence'; habitId: string; cadence: Cadence }
  | { kind: 'none' };

export type PatternEvidence =
  | {
      kind: 'occurrences';
      from: number;
      to: number;
      matched: number;
      total: number;
      dayKeys: string[];
    }
  | {
      kind: 'load';
      measured: number;
      limit: number;
      unit: 'goals' | 'minutes' | 'days';
      asOf: number;
      refs: string[];
    }
  | {
      kind: 'said';
      from: number;
      to: number;
      matched: number;
      dayKeys: string[];
      observationIds: string[];
    };

/** `apps/helm/users/{uid}/patterns/{patternId}`, id `pt_` + the first 24 hex of sha256(signature): what Helm has noticed, and what the person said about it. */
export interface Pattern {
  kind: PatternKind;
  subject: {
    collection:
      | 'habits'
      | 'tasks'
      | 'projects'
      | 'procedures'
      | 'topics'
      | 'who'
      | 'planner';
    id: string | null;
    windowId: string | null;
    otherId: string | null;
  };
  bucket: PatternBucket;
  signature: string;
  moment: PatternMoment;
  state: PatternState;
  handling: PatternHandling;
  acceptedBy: 'person' | 'auto' | null;
  effect: PatternEffect;
  evidence: PatternEvidence;
  reasons: { kind: PatternKind; evidence: PatternEvidence }[];
  evidenceSince: number;
  sourceKeys: string[];
  declineCount: number;
  nextEligibleOn: number | null;
  /** When the person said "It's right" to a statement that offers no change (a care pattern); the pattern stays as it was and is not asked again. Null until then and on a pattern from before the field. */
  confirmedAt: number | null;
  offReason: 'thirdNo' | 'askedToStop' | null;
  history: {
    to: PatternState | 'off' | 'reopened';
    at: number;
    by: 'person' | 'nomos';
  }[];
  seenAt: number | null;
  executionId: string | null;
  /** The execution whose Undo made it `undone`. */
  undoneByExecutionId: string | null;
  /** Not off and not retired: the listener reads only these. */
  isLive: boolean;
  /** When it was stopped or went off for good. */
  offAt: number | null;
  /** The newest instant that counted as evidence, for the live cap. */
  lastEvidenceAt: number | null;
  /** The class in effect, readable so a job without the key honours it; a record from before the field reads as ordinary. */
  privacy: PrivacyClass | null;
  createdAt: number;
  lastEditedAt: number | null;
  stateAt: number;
  sealed: Sealed;
}

export interface PatternSealed {
  statement: string;
  evidenceLine: string;
  reasonLine: string | null;
}

/** `seenAs/{lineId}`, id `sa_` + the first 24 hex of sha256(`seenAsIdInput`): one line of how the assistant sees the person, derived and citing its sources; the person's correction or removal survives every rebuild. */
export interface SeenAsLine {
  kind: SeenAsKind;
  state: SeenAsState;
  /** Two to 20 of `'patterns/{id}'`, `'observations/{id}'`, `'habits/{id}'`, `'style/{scope}#{traitKey}'`. */
  sourceKeys: string[];
  /** The habits, goals or who it is about, as `'habits/{id}'`, `'projects/{id}'` or `'who/{id}'`. */
  subjectRefs: string[];
  writtenBy: 'reflection' | 'person';
  /** On Remove, the line's sources: no new line of the same kind may cite one of them. */
  dontDrawFrom: string[];
  derivedAt: number;
  correctedAt: number | null;
  removedAt: number | null;
  privacy: PrivacyClass | null;
  createdAt: number;
  /** Null on a removed line past the cap, which keeps only its id. */
  sealed: Sealed | null;
}

export interface SeenAsSealed {
  /** 140 at most; on a removed line, the normalised claim. */
  line: string;
  /** Code-built, 120 at most: "From 6 things you said and 2 patterns". */
  basis: string;
  /** The person's own words, 140 at most. */
  corrected: string | null;
}

export type ObservationSource = 'turn' | 'checkInNote' | 'followUp';

/** `observations/{obsId}`: something said about a habit, goal, task or the day; derived, never edited by hand. */
export interface Observation {
  subject: {
    collection: 'habits' | 'projects' | 'tasks' | 'day';
    id: string | null;
  };
  /** The habit day it is about. */
  dayKey: string;
  /** The instant it was said or noted. */
  at: number;
  source: ObservationSource;
  /** 'captures/{id}', or 'habitDays/{dayKey}#{habitId}/{windowId}' for a note. */
  sourceKeys: string[];
  /** Copied from the subject when written: never feeds a change to a care item. */
  isCare: boolean;
  writtenBy: 'turn' | 'reflection';
  createdAt: number;
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface ObservationSealed {
  kind: 'feeling' | 'reason' | 'outcome' | 'answer';
  /** 1 to 3. */
  tags: ObservationTag[];
  /** Verbatim from its source (200 at most); null when it named another person's health. */
  quote: string | null;
}

export type ReflectionLink =
  'shift' | 'busyDay' | 'lateDay' | 'weekday' | 'other';

/** `reflections/{dayKey}`: the nightly pass's candidates for one habit day; written only by the server. */
export interface Reflection {
  dayKey: string;
  /** The request's random id; a retried write with the same id changes nothing. */
  reflectionId: string;
  candidateCount: number;
  /** When the device's daily check weighed it. */
  seenAt: number | null;
  /** Every observation and note it read (120 at most). */
  sourceKeys: string[];
  createdAt: number;
  privacy: PrivacyClass | null;
  sealed: Sealed;
}

export interface ReflectionSealed {
  candidates: {
    subject: { collection: 'habits' | 'projects'; id: string };
    observationIds: string[];
    tags: ObservationTag[];
    linkedTo: ReflectionLink | null;
    suggestion: 'differentTime' | 'smaller' | 'somethingNew' | 'none';
  }[];
  whyRefresh: {
    projectId: string;
    summary: string;
    tags: string[];
    basedOn: string;
  }[];
}

/** A pattern after its lines are opened; the id is `pt_` and the signature's hash. A pattern whose lines won't open keeps `isUnreadable` and says nothing. */
export interface OpenPattern extends Omit<Pattern, 'sealed'>, PatternSealed {
  id: string;
  isUnreadable: boolean;
}

export interface OpenObservation
  extends Omit<Observation, 'sealed'>, ObservationSealed {
  id: string;
}

/** A reflection after it is opened; the id is its day key. */
export interface OpenReflection
  extends Omit<Reflection, 'sealed'>, ReflectionSealed {
  id: string;
}

export type CaptureDisposition = 'acted' | 'noted' | 'answered';

/** What happened on one day, counted by code; each item counts on the day it happened, in the profile's zone. */
export interface HelmDayCounts {
  messages: number;
  tasksAdded: number;
  keyDatesAdded: number;
  notesAdded: number;
  factsAdded: number;
  peopleAdded: number;
  placesAdded: number;
  habitsStarted: number;
  habitChecksDone: number;
  connectionsAdded: number;
  tasksDone: number;
  planned: number;
  answered: number;
  dismissed: number;
}

export interface HelmDaySummarySealed {
  /** The written sentence when there is one, otherwise the code line. */
  text: string;
  /** The code line, always kept. */
  line: string;
  counts: HelmDayCounts;
}

/** One past day's summary; its id is "YYYY-MM-DD" in the profile's zone. Written by the server; the device only marks it stale. */
export interface HelmDaySummary {
  dayKey: string;
  /** 'empty': nothing happened. 'counted': the code line only. 'written': the sentence. */
  status: 'empty' | 'counted' | 'written';
  /** Writing attempts so far; the night run stops at 3. */
  attempts: number;
  writtenAt: number;
  /** Set when something from that day is undone; the next open rewrites it. */
  staleAt: number | null;
  /** The batch this `counted` summary is waiting on; the server writes it, the device only reads it. */
  batchId: string | null;
  batchedAt: number | null;
  sealed: Sealed | null;
}

/** An outside assistant the person connected to Helm (`mcpClients/{uid}/clients/{clientKey}`); written only by the server. */
export interface ConnectedAssistant {
  appId: 'helm';
  clientId: string;
  name: string;
  workosUserId: string;
  firstSeenAt: number;
  lastUsedAt: number;
  canWrite: boolean;
  /** The kinds of source it may read (`mail`, `drive`, `apps`); each is off until the person turns it on. */
  readScopes: string[];
  revokedAt: number | null;
}

export interface OpenConnectedAssistant extends ConnectedAssistant {
  clientKey: string;
}

export type ResearchMode = 'asked' | 'learnLater' | 'leadTime';
export type ResearchStatus =
  | 'planned'
  | 'asking'
  | 'preparing'
  | 'ready'
  | 'offered'
  | 'done'
  | 'dismissed';

/** A research item: asked for in a turn (it starts at once), saved to learn later, or offered ahead of a dated project. */
export interface Research {
  id: string;
  mode: ResearchMode;
  status: ResearchStatus;
  /** The capture that asked for it, where its line joins the conversation. */
  captureId: string | null;
  projectId: string | null;
  depth: 'light' | 'thorough' | null;
  /** True when it answered from general knowledge because the month's allowance was used up ("Not from the web"). */
  isWithoutWeb: boolean;
  /** What this item holds of the month's allowance until it settles; 0 once settled or released. */
  reservedCents: number;
  searchesUsed: number;
  costCents: number;
  /** Date-only; set only by the person's yes to "Look on <reset date>" after a look past the allowance. */
  rerunOn: number | null;
  startedAt: number | null;
  preparedAt: number | null;
  cancelledAt: number | null;
  createdAt: number;
  lastEditedAt: number | null;
  question: string;
  subject: string;
  overview: ResearchOverview | null;
  sources: { title: string; url: string; site: string }[];
  /** Learn later: when the night pass may start it (the next 02:00 in the person's zone); null for any other mode and once it starts. */
  prepareAt: number | null;
  /** Learn later: the model's flag on the save; the web is searched only when true. */
  needsLiveFacts: boolean;
  /** Learn later: Not nows in a row; Show me and Keep it reset it to 0. */
  notNowStreak: number;
  /** Learn later: how many nights the overview failed to prepare; written by the server only. */
  prepareFailures: number;
  declineReason: LearnDeclineReason | null;
  /** Learn later: the day key Today last showed it, so it is offered once a day across devices. */
  offeredOn: string | null;
  /** Learn later: the last 10 offers, which `findLearnSlot` learns the person's evenings from. */
  offers: LearnOffer[];
  /** Learn later: another item's id to when this pair was last offered together (the 4-week line). */
  relatedOfferedAt: Record<string, number>;
  /** Learn later: set on the newer item when Together folds it into the older one; it is dismissed, never deleted, so Undo can bring it back. */
  mergedInto: string | null;
  videosFetchedAt: number | null;
  /** Learn later: when the night pass last failed to prepare it; Today skips it that day. */
  prepareFailedAt: number | null;
  /** Learn later: the note Keep it filed. */
  resultNoteId: string | null;
  removedAt: number | null;
  /** Learn later: the sealed `moreAsked`, `videos`, `searchQuery` and `contextLine` below. */
  moreAsked: string[];
  videos: ResearchVideo[];
  searchQuery: string | null;
  /** Where the wish came up, such as "while planning the Leavenworth drive"; at most 60 characters. */
  contextLine: string | null;
  /** Ahead of a project: the offer on the project that started it. */
  aheadOfferId: string | null;
  /** Ahead of a project: the topic the finished look was filed as. */
  resultTopicId: string | null;
}

export type LearnDeclineReason = 'timing' | 'lostInterest' | 'changedMind';

export interface LearnOffer {
  at: number;
  dayKind: 'weekday' | 'weekend' | null;
  gapMinutes: number | null;
  afterBusyDay: boolean | null;
  outcome: 'yes' | 'notNow';
}

export interface ResearchVideo {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
}

export interface ResearchOverview {
  summary: string;
  sections: { heading: string; points: string[] }[];
  comparison: { columns: string[]; rows: string[][] } | null;
  /** How a learn-later overview is drawn; null reads as points. */
  form: 'comparison' | 'steps' | 'points' | null;
}

/** The sealed part of a research item. */
export interface ResearchSealed {
  question: string;
  subject: string;
  overview: ResearchOverview | null;
  sources: { title: string; url: string; site: string }[];
  /** At most 5 entries of 300 characters. */
  moreAsked: string[];
  /** At most 2. */
  videos: ResearchVideo[];
  /** At most 100 characters. */
  searchQuery: string | null;
  contextLine: string | null;
}

export interface OpenResearch extends Research {
  /** The sealed words did not open: kept so a count sees it, never drawn. */
  isUnreadable: boolean;
}
