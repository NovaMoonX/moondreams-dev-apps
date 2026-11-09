export const DEFAULT_ASSISTANT_NAME = 'Nomos';

export const DEFAULT_DAY_START_TIME = '08:00';
export const DEFAULT_DAY_END_TIME = '22:00';
export const DEFAULT_PLAN_FILL_PERCENT = 50;

/** The version every sealed payload carries inside it; a reader refuses a newer one. */
export const SEALED_SCHEMA_VERSION = 1;

export const CAPTURE_COUNTER_FROM = 3_600;
/** A run of turns with no gap over this is one session. */
export const SESSION_IDLE_MS = 10 * 60 * 1000;

export const CAPTURE_MAX_CHARS = 4_000;

/** A task's title is cut at a word to this many characters, as the server cuts the ones it makes. */
export const TASK_TITLE_CAP = 200;

/** A turn being read whose claim is older than this is taken over by the next sweep. */
export const SWEEP_LEASE_MS = 90 * 1000;
/** The window of the ten-minute limit. */
export const RECENT_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** How many earlier sessions each scroll up brings in. */
/** The most open tasks the app keeps listening to. */
export const OPEN_TASKS_LIMIT = 150;

export const EARLIER_SESSIONS_PAGE = 20;

/** Every line that names the assistant is a template over its chosen name, so a renamed assistant is renamed everywhere. */
export const HELM_COPY = {
  homeHint: 'Tap to talk, or type',
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
  resultLabel: 'What was done',
  resultTaskDue: (due: string) => `Task · ${due}`,
  resultDone: 'Marked done',
  resultTaskFallback: 'A task',
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
  moreToSort: 'This had more than I could file at once',
  couldNotSort: "Couldn't sort this",
  sortTheRest: 'Sort the rest',
  waitingHeading: 'Waiting to be read',
  waitingNote: (name: string) =>
    `Waiting needs nothing from you: ${name} reads these on its own.`,
  waitingOnDevice: 'Saved on this device · waits for a connection',
  waitingDailyLimit: "Today's limit reached · sorted after midnight",
  waitingRecentLimit: 'A lot at once · sorted in a few minutes',
  waitingBudget: 'Reading is paused for now · sorted when it is back',
  waitingUnavailable:
    "The AI service couldn't be reached · read again when you next open this",
  waitingDefault: 'Waiting its turn · read in a moment',
  failedServiceDown: (name: string) =>
    `The AI service was down when ${name} tried to read this.`,
  failedUnusable: (name: string) =>
    `${name} read this but the reading came back unusable.`,
  failedTooLong: 'These words were too long to read at once.',
  failedGeneric: (name: string) =>
    `${name} tried three times and couldn't read this.`,
  makeTaskAsWritten: 'Make it a task as written',
  tryReadingAgain: 'Try reading again',
  deleteCapture: 'Delete',
  deleteCaptureTitle: 'Delete this?',
  deleteCaptureBody: 'What you said is deleted. Nothing was made from it.',
  madeTask: 'Made a task',
  tookBackTask: 'Took back the task',
  heldActionFailed: "That didn't work. Try again.",
  waitingInNeedsYou: 'Waiting in Needs you',
  savedHeldDaily: 'Saved as written. Read after midnight.',
  savedHeldRecent: 'Saved as written. Read in a few minutes.',
  savedHeldBudget: 'Saved as written. Read once reading is back.',
  turnsFailed: "Your turns didn't open. Close this page and open it again.",
} as const;
