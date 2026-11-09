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

export const EARLIER_SESSIONS_PAGE = 20;

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
