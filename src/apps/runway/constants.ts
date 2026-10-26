import type { RunwayTab } from '@apps/runway/types';

export const PLAN_SECTIONS = [
  'income',
  'bills',
  'envelopes',
  'goals',
  'more',
] as const;

export const DEFAULT_PLAN_SECTION = 'income' as const;

export const PLAN_SECTION_LABELS: Record<
  (typeof PLAN_SECTIONS)[number],
  string
> = {
  income: 'Income',
  bills: 'Bills',
  envelopes: 'Envelopes',
  goals: 'Goals',
  more: 'More',
};

export const RUNWAY_TABS = [
  'home',
  'days',
  'spend',
  'plan',
] as const satisfies readonly RunwayTab[];

export const DEFAULT_RUNWAY_TAB: RunwayTab = 'home';

export const RUNWAY_TAB_LABELS: Record<RunwayTab, string> = {
  home: 'Home',
  days: 'Days',
  spend: 'Spend',
  plan: 'Plan',
};

export const STANCES = ['conservative', 'middle', 'optimistic'] as const;

export const DEFAULT_STANCE = 'conservative' as const;

export const STANCE_LABELS: Record<(typeof STANCES)[number], string> = {
  conservative: 'Conservative',
  middle: 'Middle',
  optimistic: 'Optimistic',
};

export const STANCE_HELP: Record<(typeof STANCES)[number], string> = {
  conservative: 'Plans pay at its low end and bills at their high end.',
  middle: 'Plans pay and bills halfway between their ends.',
  optimistic: 'Plans pay at its high end and bills at their low end.',
};

/** Who a stance applies to: the whole plan, or one pay line or bill that sets its own. */
export const STANCE_FOLLOW_PLAN = 'plan' as const;

/** Entries on Plan > More; one appears when the screen it opens exists. */
export const MORE_ENTRIES = ['settings', 'changeLog'] as const;

/** The full screens Home opens, kept in the URL as `view`. */
export const RUNWAY_VIEWS = ['start', 'freeToSpend', 'checkAmount'] as const;

/** The screens Settings opens, kept in the URL as `settingsView`. */
export const SETTINGS_VIEWS = ['tracking', 'delete'] as const;

export const MORE_ENTRY_LABELS: Record<(typeof MORE_ENTRIES)[number], string> =
  { settings: 'Settings', changeLog: 'Change log' };

export const MORE_ENTRY_HELP: Record<(typeof MORE_ENTRIES)[number], string> = {
  settings:
    'How the plan reads a range of pay or a bill, and whether you track spending.',
  changeLog: 'Every change to the plan, with the reason you gave.',
};

/** Days one window of the change log covers, as the span pills offer them; the URL keeps the value. */
export const CHANGE_LOG_SPANS = ['30', '90', '365'] as const;
export const DEFAULT_CHANGE_LOG_SPAN = '90';
export const CHANGE_LOG_SPAN_LABELS: Record<
  (typeof CHANGE_LOG_SPANS)[number],
  string
> = { '30': '30 days', '90': '3 months', '365': 'A year' };
/** The newest entries one window reads; a busier window says so and a shorter span shows the rest. */
export const MAX_WINDOW_CHANGES = 500;
/** Entries drawn before "Show more". */
export const CHANGE_LOG_PAGE_SIZE = 30;
/** How many windows back the log goes. */
export const MAX_CHANGE_LOG_PAGE = 40;
export const CHANGE_KIND_LABELS: Record<(typeof CHANGE_KINDS)[number], string> =
  {
    planChange: 'Change',
    start: 'Starting point',
    levelMove: 'Level',
    whatIfApplied: 'What-if',
    ended: 'Ended',
    correction: 'Correction',
    purchaseChange: 'Purchase',
  };

export const RANGE_END_WORDS = {
  low: 'the low end',
  middle: 'the middle',
  high: 'the high end',
} as const;

export const SEALED_SCHEMA_VERSION = 1;

export const DEFAULT_CURRENCY_CODE = 'USD';

export const ITEM_KINDS = [
  'source',
  'payLine',
  'bill',
  'envelope',
  'goal',
  'group',
] as const;

export const SCHEDULE_KINDS = [
  'weekly',
  'everyOtherWeek',
  'twiceMonthly',
  'monthly',
  'once',
  'irregular',
] as const;

export const CHANGE_KINDS = [
  'planChange',
  'start',
  'levelMove',
  'whatIfApplied',
  'ended',
  'correction',
  'purchaseChange',
] as const;

export const SCHEDULE_LABELS: Record<(typeof SCHEDULE_KINDS)[number], string> =
  {
    weekly: 'Every week',
    everyOtherWeek: 'Every other week',
    twiceMonthly: 'Twice a month',
    monthly: 'Monthly',
    once: 'Once',
    irregular: 'Irregular',
  };

/** The ways a pay line can repeat that the income form offers. */
export const INCOME_FREQUENCIES = [
  'weekly',
  'everyOtherWeek',
  'twiceMonthly',
  'monthly',
  'once',
] as const satisfies readonly (typeof SCHEDULE_KINDS)[number][];

export const INCOME_ENDINGS = ['never', 'date', 'count'] as const;

export const INCOME_ENDING_LABELS: Record<
  (typeof INCOME_ENDINGS)[number],
  string
> = {
  never: 'Never',
  date: 'On a date',
  count: 'After some payments',
};

export const DEFAULT_PAY_LINE_NAME = 'Paycheck';
export const MAX_NAME_LENGTH = 60;
export const MAX_ENDING_COUNT = 520;
export const LOOKAHEAD_MONTHS = 12;
export const MAX_CHANGE_ITEM_IDS = 20;
/** Coming income days shown before "Show more". */
export const COMING_DAYS_PREVIEW = 3;
/** Most coming income days the Days list can draw, however far the lookahead reaches. */
export const COMING_DAYS_CAP = 50;
/** Warnings shown before "Show all". */
export const LOOKAHEAD_WARNINGS_PREVIEW = 3;
/** Days of income and bills the stance cushion adds up. */
export const CUSHION_DAYS = 30;
/** A gap this long between income days, or after the last one, reads as income that has ended. */
export const INCOME_END_GAP_DAYS = 45;
/** Occurrences generated for one pay line before the generator stops, a guard against a runaway ending. */
export const MAX_OCCURRENCES = 2_000;

export const PRIORITIES = ['must', 'should', 'want'] as const;

export const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  must: 'Must',
  should: 'Should',
  want: 'Want',
};

/** Every income day, or every Nth: the cadences the envelope form offers. */
export const FUNDING_CADENCES = [
  'everyIncomeDay',
  'every2',
  'every3',
  'chosen',
] as const;

export const FUNDING_CADENCE_LABELS: Record<
  (typeof FUNDING_CADENCES)[number],
  string
> = {
  everyIncomeDay: 'Every income day',
  every2: 'Every other',
  every3: 'Every third',
  chosen: 'Chosen days',
};

export const ENVELOPE_ORDER_STEP = 1;

/** What "+ Expected" can add. */
export const EXPECTED_KINDS = ['income', 'expense'] as const;

export const EXPECTED_KIND_LABELS: Record<
  (typeof EXPECTED_KINDS)[number],
  string
> = { income: 'Income', expense: 'Expense' };

/** The ways a bill can repeat that the bill form offers. */
export const BILL_FREQUENCIES = [
  'once',
  'weekly',
  'everyOtherWeek',
  'monthly',
] as const satisfies readonly (typeof SCHEDULE_KINDS)[number][];

export const BILL_FREQUENCY_LABELS: Record<
  (typeof BILL_FREQUENCIES)[number],
  string
> = {
  once: 'Once',
  weekly: 'Weekly',
  everyOtherWeek: 'Every other week',
  monthly: 'Monthly',
};

export const BILL_FUNDINGS = ['suggested', 'chosen'] as const;

export const BILL_FUNDING_LABELS: Record<
  (typeof BILL_FUNDINGS)[number],
  string
> = { suggested: 'Spread over income days', chosen: 'Days I choose' };

/** How a draft line for a bill was decided, beside the envelope cadences. */
export const BILL_DRAFT_CADENCES = ['billSuggested', 'billChosen'] as const;
export const MAX_CHOSEN_DAYS = 60;
export const MAX_EMOJI_LENGTH = 8;

/** Why a draft line got the money it did: funded in full, or cut short because the day's money ran out. */
export const HOLD_CHOICES = ['topUp', 'leaveShort'] as const;
export const DAY_STATUSES = ['draft', 'confirmed', 'notArrived'] as const;
/** The records a confirmed day keeps: the draft as proposed and the split that was confirmed. */
export const DAY_RECORD_KINDS = [
  'proposed',
  'confirmed',
  'correction',
] as const;
/** The kinds of ledger entry the client writes: a bill marked paid (and its undo, a `billPaid` that names the one it reverses), a `start` holding and a `trackingChange` (tracking turned on or off). */
export const MOVE_KINDS = ['billPaid', 'start', 'trackingChange'] as const;
/** Where a purchase came from; the person adds by hand now, a CSV and a linked account come later. */
export const PURCHASE_SOURCES = ['manual', 'csv', 'link'] as const;
/** How a purchase line got its envelope: the person chose it, or it is Free to spend. */
export const PURCHASE_LINE_VIAS = ['chosen', 'free'] as const;
/** Envelopes one split can name; the sealed lines are not checked by rules, so the device caps them. */
export const MAX_PURCHASE_LINES = 12;
/** The amount a purchase can be, in cents. */
export const MAX_PURCHASE_CENTS = 99_999_999;
/** Purchases the Spend tab draws before "Show more". */
export const SPEND_PAGE_SIZE = 30;
/** More envelope filters than this become a searchable list instead of pills. */
export const SPEND_PILL_LIMIT = 12;
/** Rows before the Spend tab offers a search. */
export const SPEND_SEARCH_THRESHOLD = 8;

/** What a `start` move holds the starting amount of. */
export const START_HOLDINGS = ['money', 'goal', 'bill', 'envelope'] as const;
/** The first day of the lookahead is the starting point; a start move's day key in a bill's funded list. */
export const START_DAY_KEY = 'start';
/** Envelope tiles Home draws before it points at the full list. */
export const HOME_ENVELOPE_TILES = 6;
/** A 20px tick gets a 40px hit area from a pseudo-element, so a tap near it still ticks it. */
export const TICK_HIT_CLASS =
  "relative before:absolute before:-inset-[11px] before:content-['']";
/** Rows of goals or bills the starting amounts list shows before "Show all". */
export const START_ROWS_PREVIEW = 6;

/** The most checklist ticks a day keeps; the rules cap the list at the same size. */
export const MAX_DONE_LINE_IDS = 200;
/** How far back the recent listeners read while no closing applies (a plan too new to have one, or one that could not be rebuilt). */
export const RECENT_DAYS_WINDOW = 180;
/** A month is closed once it ended this many days ago, so the recent window always reaches back past the overdue days and a device a day ahead never closes a month another is still writing into. */
export const CLOSING_SETTLE_DAYS = 15;
/** Whole months a closing may lag behind the last closable month before the next load rebuilds them. */
export const CLOSING_LAG_MONTHS = 2;
/** Closings written in one transaction, so a request stays far under the size limit. */
export const CLOSING_WRITE_CHUNK = 6;
/** Times one rebuild is tried again after another device changed the plan under it. */
export const CLOSING_REBUILD_ATTEMPTS = 3;
/** A closing is stored as this version of its sealed payload; a reader of a different one rebuilds it. */
export const CLOSING_VERSION = 2;
/** Days an unconfirmed income day stays on the list after its date. */
export const OVERDUE_DAYS = 14;
export const MAX_NOTE_LENGTH = 300;
/** Confirmed and not-arrived days shown before "Show more". */
export const SETTLED_DAYS_PREVIEW = 3;

/** The tags a day wears on the Days list; a day that is coming wears none. */
export const DAY_STATUS_LABELS = {
  confirmed: 'Confirmed',
  notArrived: 'Did not arrive',
  overdue: 'Waiting to be confirmed',
} as const;

export const CONFIRM_WORDS = {
  action: 'Confirm money arrived',
  sheetTitle: 'Money arrived',
  amount: 'Amount that arrived',
  date: 'Arrived on',
  note: 'Add a note',
  notePlaceholder: 'Overtime, a bonus from the quarter',
  extraTo: 'The extra is left from this day.',
  shortFrom: 'The shortfall comes out of what is left from this day.',
  sameAsExpected: 'The same as the draft expected.',
  needsAmount: 'Enter the amount that arrived.',
  needsDate: 'Pick the date it arrived.',
  holds: 'Choose for each held line first.',
  linesTakeTooMuch:
    'The lines take more than arrived. Lower a line or raise the amount.',
  needsLineAmount: 'Enter an amount for each line you changed.',
  adjustLines: 'Adjust the lines',
  adjustIntro:
    'Change what a line gets. What is left from this day is what the lines leave.',
  lowestFirst: 'Take from the lowest priority first',
  resetLines: 'Reset lines to the draft',
  lineNotePlaceholder: 'Why this line changed',
  adjustedDone: 'Done',
  confirm: 'Confirm',
  confirmed: 'Confirmed',
  markNotArrived: 'Did not arrive',
  undoNotArrived: 'Put this day back',
  notArrivedLine: 'Marked as not arrived. Its draft is off your plan.',
  offline:
    'Confirming needs a connection. Nothing was saved. Try again when you are back online.',
  planned: 'Planned',
  arrived: 'Arrived',
  recordTitle: 'Planned and confirmed',
  recordDoor: 'Planned and confirmed',
  unchanged: 'Everything matched the draft.',
  missingRecords: 'The record of this day could not be read.',
} as const;

export const CORRECT_WORDS = {
  door: 'Correct this day',
  doorHint: 'Fix an amount you confirmed. The original stays on record.',
  sheetTitle: 'Correct this day',
  intro:
    'Change what arrived or what a line got. What is left from this day is what the lines leave.',
  review: 'See what changes',
  reviewTitle: 'What this changes',
  confirmed: 'Confirmed',
  corrected: 'Corrected',
  before: 'Before',
  save: 'Correct this day',
  note: 'Add a note',
  notePlaceholder: 'Why it changed',
  nothingChanged: 'Change an amount to continue.',
  offline:
    'Correcting needs a connection. Nothing was saved. Try again when you are back online.',
  elsewhere:
    'This day was corrected on another device. Close this and open the day again to see its latest split.',
  history: 'Corrections',
  current: 'Current split',
  original: 'As confirmed',
  currentTag: 'Current',
  untickedNote: 'Lines you change are unticked on the checklist.',
} as const;
export const MAX_PAIRINGS = 20;

/** Income days the effect of a change is worked out for, and how many show before "Show all". */
export const MAX_PREVIEW_DAYS = 26;
export const PREVIEW_SHOWN = 3;

/** The rules refuse a change that starts more than ten years out; this stays inside that for a viewer ahead of UTC. */
export const MAX_CHANGE_DAYS_AHEAD = 3600;

export const CHANGE_WORDS = {
  fromHeading: 'From when',
  fromNow: 'From now on',
  fromDate: 'From a date ahead',
  dateLabel: 'Starts on',
  dateBlocker: 'Pick a day after today, within ten years.',
  previewHeading: 'What this changes',
  previewNone:
    'No income day in the next year moves. Earlier days stay as they are.',
  previewWaiting: 'Finish the form to see what it changes.',
  previewUntouched: 'Change a field and its effect shows here.',
  freeNow: 'Left from this day now',
  freeAfter: 'After',
  added: 'This income day is added.',
  removed: 'This income day goes away.',
  review: 'Next',
  whyHeading: 'Why the change?',
  whyHint: 'A note for your own records. You can leave it out.',
  whyPlaceholder: 'Why it changed',
  saveWithNote: 'Save',
  saveWithoutNote: 'Save without a reason',
  unchanged: 'Change something to continue.',
  change: 'Change',
  scheduled: 'From',
  fromDay: 'From this income day on',
  dayOnly: 'This income day only',
  stretch: 'For a stretch',
  dayPick: 'Which income day',
  stretchHeading: 'How long',
  stretchCount: 'By income days',
  stretchDate: 'Until a date',
  stretchCountLabel: 'How many income days',
  stretchDateLabel: 'Last day of the change',
  stretchCountBlocker: 'Enter how many income days, at least 1.',
  stretchTooFar: 'Only {n} income days are planned ahead. Pick fewer.',
  stretchDateBlocker: 'Pick the last day, from today to ten years ahead.',
  dayBlocker: 'Pick an income day.',
  dayOnlyFields:
    'For one income day only the amount, how often and how much it matters can change.',
  stretchNote: 'Then it goes back to what it was.',
} as const;

export const LIFECYCLE_WORDS = {
  more: 'More',
  moreAria: 'More about',
  sheetHeading: 'What would you like to do?',
  pause: 'Pause saving',
  pauseSub: 'Nothing new goes in. The balance and history stay.',
  resume: 'Start saving again',
  resumeSub: 'It gets money again from the next income day.',
  end: 'End it',
  endSub: 'It stops after the last day you pick. Its history stays.',
  archive: 'Archive',
  archiveSub: 'Takes it off your lists. Its history stays.',
  archiveNote:
    'It leaves your lists and the days ahead. Its history stays, and it cannot be brought back from here.',
  endHeading: 'Last day',
  endDateLabel: 'Last day it counts',
  endBlocker: 'Pick the last day, from today to ten years ahead.',
  endConfirm: 'End it',
  archiveConfirm: 'Archive',
  pauseConfirm: 'Pause',
  resumeConfirm: 'Start again',
  whyEnd: 'Why is it ending?',
  paused: 'Paused',
  endsAfter: 'Ends after',
  backAfter: 'then it goes back',
  until: 'Until',
  alreadyEnded: 'This was already ended, so nothing changed.',
  alreadyArchived: 'This was already archived, so nothing changed.',
  chipsEnd: ['Paid off', 'No longer needed', 'Changed my mind', 'Job ended'],
  chipsArchive: ['No longer needed', 'Replaced by another', 'Changed my mind'],
  chipsPause: ['Focusing on another goal', 'Money is tight', 'Changed my mind'],
} as const;

export const CHANGE_REASON_CHIPS = [
  'Price went up',
  'Price went down',
  'New job or raise',
  'Changed my mind',
  'Fixing a mistake',
] as const;

/** What happened to a pairing that its own pay could not cover. */
export const PAIRING_STATES = [
  'funded',
  'autoTopUp',
  'held',
  'offered',
  'leftShort',
  'toppedUp',
] as const;

/** A draft line funded by a pairing rather than by the target's own rule. */
export const PAIRING_DRAFT_CADENCES = ['pairing'] as const;

export const DRAFT_REASON_CODES = [
  'funded',
  'poolExhausted',
  'nothingLeft',
  'returns',
] as const;

/** The key that decided which of two otherwise equal demands went first. */
export const DRAFT_TIE_KEYS = ['createdAt', 'itemId'] as const;

export const DRAFT_CADENCE_WORDS: Record<
  | (typeof FUNDING_CADENCES)[number]
  | (typeof BILL_DRAFT_CADENCES)[number]
  | (typeof PAIRING_DRAFT_CADENCES)[number],
  string
> = {
  pairing: 'Set aside from this pay',
  billSuggested: 'Spread over your income days',
  billChosen: 'A day you chose',
  everyIncomeDay: 'Every income day',
  every2: 'Every other income day',
  every3: 'Every third income day',
  chosen: 'A day you chose',
};

export const DRAFT_WORDS = {
  fundedFrom: 'funded from',
  shortBy: 'Short by',
  outOfMoney: "This day's money ran out before it got to this line",
  restEmpty: "Nothing was left of this day's money for the rest",
  restAsk: 'The rest',
  dayOnly: 'Changed for this income day only.',
  returnsTo: 'returns to',
  returnsThisTime: 'this time',
  percentOf: 'of',
  nothingFunded: 'Nothing funded',
  fundedOf: 'Funded',
  of: 'of',
  notFunded: 'Not fully funded',
  dayLeft: 'Left from this day',
  nothingLeft: 'Nothing left after the envelopes',
  tieCreatedAt:
    'Same priority and order as another envelope, so the one added first goes first',
  tieItemId:
    'Same priority, order and date added as another envelope, so a fixed order decides',
  unnamedSource: 'this income',
  dueOn: 'Due',
  setAsideOf: 'of',
  billFallback: 'Bill',
  and: 'and',
  topUp: 'Top up',
  leaveShort: 'Leave it short',
  leftShort: 'Left short',
  toppedUp: 'Topped up as far as the money allowed',
  holdsBlock:
    'This day cannot be confirmed until you choose for each held line.',
  useThePlan: 'Undo my choices for this day',
  undoChoice: 'Undo my choice',
  fundsHeading: 'Funds',
  fundsNone: 'Not tied to anything. Goes where the draft puts it.',
} as const;

export const PACE_WORDS = {
  rest: 'Takes what is left of each funded day, so there is no fixed pace.',
  paused: 'Paused. Nothing is added until you start saving again.',
  completed: 'Completed',
} as const;

export const GOAL_STATES = ['active', 'paused'] as const;

/** The pace line's three answers for a goal with a date. */
export const PACE_STATES = ['ahead', 'onPace', 'behind'] as const;

export const PACE_STATE_LABELS: Record<(typeof PACE_STATES)[number], string> = {
  ahead: 'Ahead',
  onPace: 'On pace',
  behind: 'Behind',
};

export const CHECKLIST_WORDS = {
  title: 'Checklist',
  everything: 'Mark everything done',
  everythingShort: 'Mark all done',
  billsGroup: 'Bills to pay',
  waitingGroup: 'Waiting for more money',
  markPaid: 'Mark paid',
  undoPaid: 'Undo',
  tickFailed: 'That tick did not save. Try again.',
} as const;

export const BILL_WORDS = {
  paid: 'Paid',
  paidAhead: 'Paid ahead',
  waiting: 'Waiting for the rest',
  readyToPay: 'Set aside in full',
} as const;

/** The levels that exist so far; tracking is one switch for the whole plan, and Link arrives later. */
export const LEVELS = ['plan', 'track'] as const;

export const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
  plan: 'Plan only',
  track: 'Plan and track spending',
};

/** What an envelope's figure is called at each level. */
export const ENVELOPE_FIGURE_WORDS: Record<(typeof LEVELS)[number], string> = {
  plan: 'assigned',
  track: 'left',
};

/** Periods of tracking one plan keeps; the rules cap the list at the same size. */
export const MAX_TRACKING_PERIODS = 50;

export const TRACKING_WORDS = {
  title: 'Tracking',
  rowLabel: 'Tracking',
  choice: 'How much to track',
  planOption: 'Plan',
  trackOption: 'Track',
  planHelp:
    'You plan where each income day goes. Envelopes show what they are assigned.',
  trackHelp:
    'Envelopes show what is left after what you spend. Add each purchase and left follows.',
  history: 'Tracking history',
  lineUpTitle: 'Where is your money now?',
  lineUpHelp:
    'Say what you have and what each envelope, goal and bill holds at the start of the day tracking begins. Money that arrives or is paid from that day on is added to it. Amounts from days you already confirmed are filled in; add the rest.',
  startsOn: 'Tracking starts',
  moneyOnHand: 'Money on hand',
  moneyHint: 'One total for all of it. Named accounts come later.',
  envelopes: 'What each envelope holds',
  goals: 'What each goal holds',
  bills: 'Already set aside for bills',
  start: 'Start tracking',
  stopTitle: 'Stop tracking',
  stopMessage:
    'Spending screens and "left" figures go away and envelopes show what they are assigned. Everything you entered stays in your history, and you can start again from any later day.',
  stopConfirm: 'Stop tracking',
  freshStart:
    'Starting again begins fresh from this day. Earlier tracking stays in your history.',
  lineUpTotal: 'Assigned',
} as const;

export const HOME_WORDS = {
  freeToSpend: 'Free to spend',
  notSet: 'Not set yet',
  notSetHint: 'Say what you have on hand and Runway can work this out.',
  overAssigned: 'Over-assigned',
  noBills: 'No bills added yet',
  nextIncome: 'Next income day',
  envelopes: 'Envelopes',
  noIncome:
    'Add an income source to see what your next income day does with the money.',
  getStarted: 'Get started',
} as const;

export const HISTORY_WORDS = {
  updating: 'Updating your history',
  updatingBody:
    'Runway is adding up your earlier months so your figures open quickly. Nothing is changed or lost.',
  failed:
    'Your history could not be updated right now. Nothing has been changed or lost.',
  tryAgain: 'Try again',
} as const;

export const START_AMOUNTS_WORDS = {
  offline:
    'Saving where things stand needs a connection. Nothing was saved. Try again when you are back online.',
} as const;

export const SPEND_WORDS = {
  title: 'Purchases',
  newPurchase: 'New purchase',
  envelopeAdd: 'Add purchase',
  sheetTitle: 'Purchase',
  empty:
    'Nothing spent yet. Add what you spend and each envelope shows what is left.',
  loading: 'Getting your purchases.',
  search: 'Search purchases',
  noMatch: 'No purchase matches that.',
  windowNote: 'Earlier purchases are counted in your figures but not listed.',
  windowFrom: 'Showing purchases from',
  all: 'All',
  amount: 'Amount',
  refundAmount: 'Amount refunded',
  envelope: 'Envelope',
  day: 'Day',
  where: 'Where',
  wherePlaceholder: 'Safeway',
  note: 'Note',
  notePlaceholder: 'Birthday dinner',
  addWhere: 'Add where',
  addNote: 'Add a note',
  removeWhere: 'Remove where',
  removeNote: 'Remove note',
  markRefund: 'This is a refund',
  unmarkRefund: 'Not a refund',
  split: 'Split between envelopes',
  unsplit: 'Not split',
  splitLabel: 'Split',
  splitIntro: 'Pick the envelopes it comes from, then say how much each takes.',
  splitEvenly: 'Split evenly',
  splitDone: 'Done',
  refundOf: 'Refund of',
  noOriginal: 'Not tied to a purchase',
  pickOriginal: 'Which purchase is it for?',
  returnsTo: 'Returns to',
  freeToSpend: 'Free to spend',
  add: 'Add',
  needsAmount: 'Enter the amount.',
  needsEnvelope: 'Pick the envelope.',
  needsDay: 'Pick a day you were tracking, not one ahead.',
  needsShares: 'Say how much each envelope takes.',
  needsTwo: 'Pick at least two envelopes.',
  offline: 'This needs a connection. Nothing was saved.',
  detailTitle: 'Purchase',
  edit: 'Change this purchase',
  save: 'Save',
  removeLabel: 'Remove purchase',
  removeTitle: 'Remove this purchase?',
  removeConfirm: 'Remove',
  notFound: 'That purchase is no longer here.',
  changedElsewhere:
    'This purchase changed on another device. Open it again to see the latest.',
  belowRefunds: 'Refunds already returned more than that.',
} as const;

export const ENVELOPE_SPEND_WORDS = {
  heading: 'Spending',
  addSub: 'Something you bought with this envelope.',
  listSub: 'Everything spent from it.',
  checkSub: 'See what it would leave. Nothing is spent.',
} as const;

export const CHECK_WORDS = {
  title: 'Check an amount',
  open: 'Check an amount',
  envelope: 'Envelope',
  amount: 'Amount',
  prompt: 'Pick an envelope and type an amount. Nothing is spent or moved.',
  noEnvelopes: 'Add an envelope to check an amount against it.',
} as const;

export const START_WORDS = {
  title: 'Starting out',
  later: 'Later',
  next: 'Next',
  done: 'Done',
  incomeAsk: 'Who pays you?',
  incomeHelp:
    'Add an income source with how often it pays and the next day it is due. This is the one thing Runway needs.',
  billsAsk: 'What do you pay?',
  billsHelp:
    'Add the bills and upcoming expenses you know about. Each is set aside a little at a time before it is due.',
  envelopesAsk: 'What do you spend money on?',
  envelopesHelp:
    'Envelopes are for everyday spending, like groceries. Goals are things you are saving toward.',
  standAsk: 'Where do things stand today?',
  standHelp:
    'Say what you have on hand and what is already set aside, so the first numbers start true.',
  doneAsk: 'Your next income day is ready',
} as const;

export const DELETE_PLAN_PHRASE = 'delete my plan';

export const DELETE_PLAN_WORDS = {
  rowLabel: 'Delete your plan',
  rowHelp: 'Remove everything and start over.',
  title: 'Delete your plan',
  goes: "Your plan, every change, every day and every purchase. This can't be undone.",
  keys: 'The key that opens your plan is deleted too, so nothing that was saved can be read again.',
  kept: 'Your account stays. You can start a new plan afterwards.',
  phraseLabel: `Type "${DELETE_PLAN_PHRASE}" to confirm`,
  confirmTitle: 'Delete your plan for good?',
  confirmMessage:
    'This removes your plan, every change, every day and every purchase, and the key that opens them. There is no undo.',
  confirmText: 'Delete everything',
  offline:
    "You're offline. Connect to the internet to delete your plan; nothing has been removed.",
  partial: 'Your plan was not fully deleted. Run the delete again to finish.',
} as const;
