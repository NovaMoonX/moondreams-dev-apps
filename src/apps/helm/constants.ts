import { formatCentsShort } from '@/utils/moneyUtils';

export const DEFAULT_ASSISTANT_NAME = 'Nomos';

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

/** Said at the end of an utterance to send it without a tap. */
export const END_PHRASES = ["that's all", 'thats all'];
/** A whole utterance that is one of these takes the open session's latest turn back, on the device, before anything is sent. */
export const UNDO_PHRASES = ['undo that', 'undo', 'take that back'];

/** A task's title is cut at a word to this many characters, as the server cuts the ones it makes. */
export const TASK_TITLE_CAP = 200;

/** A turn being read whose claim is older than this is taken over by the next sweep. */
export const SWEEP_LEASE_MS = 90 * 1000;
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
export const TOPIC_MAX = 40;
/** The most who and places the app keeps listening to. */
export const WHO_LIMIT = 2_500;
export const PLACES_LIMIT = 500;
/** The most media documents the app keeps listening to. */
export const MEDIA_LIMIT = 2_000;
/** Photos one who or place keeps. */
export const PHOTOS_PER_RECORD = 12;
/** Mentions a who's page lists before "Show all". */
export const MENTIONS_SHOWN = 10;

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

/** How many executions Activity lists at first and each time it nears its foot. */
export const ACTIVITY_PAGE = 30;

/** What a person's dates can hold: the whole set, the yearly ones for one who, and where the sealed index splits into month documents. */
export const HELM_CAPS = {
  keyDates: 20_000,
  yearlyPerWho: 20,
  indexSplit: 6_000,
} as const;

/** The kinds of date that come back each year, in the order the add sheet offers them. */
export const KEY_DATE_KINDS = ['birthday', 'anniversary', 'custom'] as const;

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

export const HELM_COPY = {
  homeHint: 'Tap to talk, or type',
  talk: 'Talk',
  talkListening: 'Listening',
  talkSendLabel: 'Send what you said',
  talkListeningHint: 'Listening…',
  talkHeardNothing: "I didn't catch anything. Tap to try again.",
  talkStoppedWhileWorking: "It's still being added. I just won't read it out.",
  talkSavedOffline: "Saved. I'll file it when you're back online.",
  talkStop: 'Stop',
  talkCancel: 'Cancel',
  talkMute: 'Mute',
  talkUnmute: 'Unmute',
  talkMuted: 'Muted',
  talkByVoice: 'Ask by voice',
  talkByTyping: 'Ask by typing',
  talkNeedsMicrophone:
    'Allow the microphone for this site to talk. Type for now.',
  talkNeedsRecognition: "This browser can't listen. Type for now.",
  talkNotReady: 'Not ready yet. Try again in a moment.',
  talkSendFailed: "That didn't send. Say it again.",
  nothingToUndo: 'Nothing to undo yet.',
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
  sendFailed: "That didn't send. Your words are still here.",
  savedAsWritten: 'Saved as written',
  reading: 'Reading…',
  readingSeveral: (count: number) =>
    `Reading ${['both', 'all three', 'all four', 'all five', 'all six', 'all seven', 'all eight', 'all nine', 'all ten'][count - 2] ?? 'them all'}…`,
  keepTyping:
    'Keep typing: anything you send before the reply joins this turn.',
  resultLabel: 'What was done',
  resultAdded: (names: string[]) => `Added ${names.join(', ')}`,
  resultLinked: (names: string[]) => `Linked ${names.join(', ')}`,
  resultTaskDue: (due: string) => `Task · ${due}`,
  resultDone: 'Marked done',
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
  earlierFailed: "Couldn't open earlier turns. Try again",
  inboxTitle: 'Needs you',
  inboxNewSince: 'New since you looked',
  inboxEmpty: 'Nothing new since you looked.',
  markAllSeen: 'Mark all seen',
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
  turnSheetTitle: 'What you said',
  nothingWaiting: 'Nothing waiting',
  newSinceLooked: (count: number) => `${count} new since you looked`,
  needsConnectionTitle: "Your things open once you're back online.",
  needsConnectionBody: (name: string) =>
    `This browser doesn't keep the key to them, so typing to ${name} waits for a connection too.`,
  cannotOpenTitle: "Your things can't be opened right now.",
  cannotOpenBody:
    "They're safe and nothing was changed. The problem is on our side, not yours.",
  tryAgain: 'Try again',
  stillCannotOpen: "Still can't open them. Your things are safe.",
  composerOffline: "Typing works again once you're back online",
  composerBlocked: 'Typing works again once your things open',
  needsYouCount: (count: number) =>
    count === 1 ? '1 needs you' : `${count} need you`,
  couldNotRead: "Couldn't read this",
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
  undoAll: 'Undo all of this',
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
  syncedGroup: (category: string, app: string) => `${category} · ${app}`,
  syncedTodayFromApps: 'From your apps',
  syncedMore: (count: number) => `${count} more`,
  syncedFewer: 'Show fewer',
  syncedWaiting: 'Waiting for the first update',
  syncedStale: (when: string) => `Last updated ${when} · may be out of date`,
  syncedAllDay: 'All day',
  syncedUpdatedLine: (when: string) => `Updated ${when}`,
  syncedNow: 'Sync now',
  syncedTryNow: 'Try now',
  syncedUpdating: 'Updating…',
  syncedCouldNot: "Couldn't update just now.",
  syncedNowFailed: "That didn't update. Try again.",
  googleCalendarName: 'Google Calendar',
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
  calendarPickerFailed: "Couldn't load your calendars.",
  calendarPickerEmpty: "This account doesn't have a calendar to read.",
  calendarPickerMain: 'Main calendar',
  calendarPickerShifts: 'These are my shifts',
  calendarPickerShiftsHint:
    'The day after a late shift stays free of suggestions.',
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
    "Your speech isn't sent to our voice services, and answers are read by this device's voice. In Chrome, the browser's own listening uses Google.",
  voiceDeviceOnlyOff:
    "Online, Deepgram turns your speech into words for clearer listening. This browser listens when it can't.",
  voiceHandsFreeTitle: 'Answer without tapping',
  voiceHandsFreeOn:
    'After a reply, it listens for a few seconds so you can answer. Nothing is sent until you speak.',
  voiceHandsFreeOff: 'Tap Talk to answer.',
  voiceWakeTitle: (name: string) => `Hey ${name}`,
  voiceWake: (name: string) =>
    `While this is open on screen, this browser's own listening waits for "Hey ${name}". In Chrome that listening uses Google.`,
  voiceWakeLocked: "This browser can't listen for a phrase.",
  voiceDone: 'Done',
  voiceModeFailed: "Couldn't change that. Try again.",
  voiceOnPhone: 'Listening with this browser for the rest of today.',
  voiceNotice:
    "Your speech goes to Deepgram to be turned into words, or to this browser's own listening when that's slow. Deepgram doesn't keep the sound. You can change this in Settings.",
  settingsYourData: 'Your data',
  activityTitle: 'Activity',
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
  answerGeneralHeading: 'General knowledge',
  answerGeneralCaution: (name: string) =>
    `From general knowledge, not checked against anything you've told ${name}. It may be out of date.`,
  answerHealthCaution:
    'General information, not medical advice. Check with a doctor or pharmacist before acting on it.',
  answerSourcesLabel: 'Where it came from',
  answerTaskGone: 'A task that is done or removed',
  answerSyncedGone: 'Something from a connected app that is no longer there',
  answerOpenSource: (title: string) => `Open ${title}`,
  quoteFrom: (label: string, day: string | null) =>
    day === null ? label : `${label}\u00a0· ${day}`,
  quoteOpen: 'Open in Gmail',
  quoteOpenDrive: 'Open in Drive',
  quoteDisconnected: 'This email was disconnected',
  quoteDocumentDisconnected: 'This document was disconnected',
  searchedLine: (where: string, when: string) =>
    `Looked in ${where} ${when}. Only what this answer quotes is kept.`,
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
    `${name} runs on its own server, sends that to Claude through Anthropic's API, and checks what comes back. It reaches your things only through its own tools.`,
  aiSeesStoredLead: 'Stored encrypted',
  aiSeesStored:
    "What you say, your records and every line in Activity are encrypted before they're saved.",
  aiSeesKeptLead: "What's kept",
  aiSeesKept:
    "What you say and every change in Activity. The server's logs keep counts and codes, never your words.",
  newTask: 'New task',
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
  planYesterday: 'Yesterday, as it was.',
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
    `Planned ${day === 'Today' || day === 'Tomorrow' ? day.toLowerCase() : day}`,
  planOpening: (day: string, time: string) => `${day} ${time}`,
  planNoOpenings: 'Nothing fits in the next two days. Pick a day.',
  planDayPicked: (day: string) => `Moved to ${day}`,
  planFoundSlot: (day: string, range: string) => `${day} ${range}`,
  planFoundNoTime: (day: string) => `${day}, any time`,
  planNoRoom: 'No room today or tomorrow.',
  planNoRoomPick: 'Pick a day',
  planUnreadable: 'This plan could not be opened.',
  planTaskGone: 'A task that is done or removed',
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
  whoFactsEmpty: (assistant: string) =>
    `Nothing noted yet. What you tell ${assistant} about them lands here.`,
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
  askSeesYou: 'Ask about what is kept about you',
  chipSeesYou: 'About you',
  backToSeesYou: (assistant: string) => `Back to How ${assistant} sees you`,
  whoTasksTitle: 'Tasks',
  whoTasksEmpty: 'No open tasks.',
  whoMentionsTitle: 'Mentions',
  whoMentionsEmpty: 'Not mentioned yet.',
  showAllMentions: (count: number) => `Show all ${count}`,
  showFewerMentions: 'Show fewer',
  placeHomeLine: 'Your home',
  placeTasksEmpty: 'No open tasks here.',
  questionNeedsConnection: 'Answering needs a connection.',
  questionSkip: 'Skip',
  questionSkipped: "Skipped. It's waiting in Needs you.",
  questionAnswered: 'Done.',
  factKept: (statement: string) => `Kept “${statement}”`,
  factKeptNeither: 'Saved what’s true now',
  questionSheetTitle: 'Which one?',
  questionMore: (count: number) =>
    count === 1
      ? '1 more question in Needs you'
      : `${count} more questions in Needs you`,
  questionRowMore: (count: number) => `${count} more`,
  questionRowSkipped: 'Skipped',
  questionDone: 'Done',
  questionDoneCount: (count: number) => `Done · ${count}`,
  questionPickAtLeastOne: 'Pick at least one, or None of these',
  questionSomethingElse: 'Something else',
  questionSomethingElseField: (name: string) => `Tell ${name} what you mean`,
  questionSend: 'Send',
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
  answerPicked: (labels: string) => `Picked ${labels}`,
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
  whoNameMissing: 'A name is needed.',
  editSave: 'Save',
  editCancel: 'Cancel',
  editNeedsConnection: 'Saving changes needs a connection.',
  editFailed: "That didn't save. Try again.",
  editGone: 'This page is gone.',
  questionGone: (kind: string) =>
    kind === 'whichIsTrue'
      ? 'That fact changed since.'
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
  ) =>
    `${
      tasks === 0
        ? `Forget ${name}? No tasks are linked to them.`
        : `Forget ${name}? ${tasks === 1 ? '1 task stays' : `${tasks} tasks stay`}, with no person.`
    }${forgetFactsLine(facts)}${forgetDatesLine(dates)}${forgetPhotosLine(photos)}`,
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
  photosEmpty: (name: string) =>
    `Add a photo of ${name}. It shows here and in your lists, and it's sealed on your phone before it's saved.`,
  photoAdd: 'Add a photo',
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
  keyDatesEmpty: (name: string) =>
    `No key dates yet. Tell ${name} a birthday, or add one.`,
  keyDateKindBirthday: 'Birthday',
  keyDateKindAnniversary: 'Anniversary',
  keyDateKindCustom: 'Something else',
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
} as const;

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
