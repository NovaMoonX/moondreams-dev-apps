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
  calendarReconnectTitle: (account: string) =>
    `Google stopped sharing ${account}`,
  calendarReconnectReason: 'Reconnect to bring your events back to Today.',
  syncedTentative: 'Tentative',
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
} as const;
