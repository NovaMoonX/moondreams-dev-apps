import type { RunwayTab } from '@apps/runway/types';

export const PLAN_SECTIONS = [
  'income',
  'bills',
  'envelopes',
  'goals',
  'cards',
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
  cards: 'Cards',
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
export const MORE_ENTRIES = ['priorities', 'settings', 'changeLog'] as const;

/** The full screens Home opens, kept in the URL as `view`. */
export const RUNWAY_VIEWS = [
  'start',
  'freeToSpend',
  'checkAmount',
  'checkBalance',
] as const;

/** The screens Settings opens, kept in the URL as `settingsView`. */
export const SETTINGS_VIEWS = ['tracking', 'delete'] as const;

export const MORE_ENTRY_LABELS: Record<(typeof MORE_ENTRIES)[number], string> =
  { priorities: 'Priorities', settings: 'Settings', changeLog: 'Change log' };

export const MORE_ENTRY_HELP: Record<(typeof MORE_ENTRIES)[number], string> = {
  priorities: 'Which items get their money first when it runs short.',
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
    cardChange: 'Card',
    moveChange: 'Move',
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
  'cardChange',
  'moveChange',
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
  everyIncomeDay: 'Every pay',
  every2: 'Every other pay',
  every3: 'Every third pay',
  chosen: 'Pays I choose',
};

export const ENVELOPE_ORDER_STEP = 1;

/** What "Add expected money" can add. */
export const EXPECTED_KINDS = ['income', 'expense'] as const;

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
/** The kinds of ledger entry the client writes: a bill marked paid (and its undo, a `billPaid` that names the one it reverses), a `start` holding, a `trackingChange` (tracking turned on or off), a `cardPayment` and a `transfer` (money left in an envelope moved to another envelope, a goal or Free to Spend, and its undo, a `transfer` that names it). */
export const MOVE_KINDS = [
  'billPaid',
  'start',
  'trackingChange',
  'cardPayment',
  'transfer',
] as const;
/** Where a purchase came from; the person adds by hand now, a CSV and a linked account come later. */
export const PURCHASE_SOURCES = ['manual', 'csv', 'link'] as const;
/** How a purchase line got its envelope: the person chose it, or it is Free to Spend. */
export const PURCHASE_LINE_VIAS = ['chosen', 'free'] as const;
/** Envelopes one split can name; the sealed lines are not checked by rules, so the device caps them. */
export const MAX_PURCHASE_LINES = 12;
/** The amount a purchase can be, in cents. */
export const MAX_PURCHASE_CENTS = 99_999_999;
/** Purchases the Spend tab draws before "Show more". */
export const SPEND_PAGE_SIZE = 30;
/** More envelope filters than this become a searchable list instead of pills. */
export const SPEND_PILL_LIMIT = 12;

/** What a `start` move holds the starting amount of. */
export const START_HOLDINGS = [
  'money',
  'goal',
  'bill',
  'envelope',
  'card',
] as const;
/** The first day of the lookahead is the starting point; a start move's day key in a bill's funded list. */
export const START_DAY_KEY = 'start';
/** A 20px tick gets a 40px hit area from a pseudo-element, so a tap near it still ticks it. */
export const TICK_HIT_CLASS =
  "relative before:absolute before:-inset-[11px] before:content-['']";
/** Rows of goals or bills the starting amounts list shows before "Show all". */
export const START_ROWS_PREVIEW = 6;

/** The most checklist ticks a day keeps; the device keeps the cap, since the beta rules check no shape. */
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
export const CLOSING_VERSION = 4;
/** Days an unconfirmed income day stays on the list after its date. */
export const OVERDUE_DAYS = 14;
export const MAX_NOTE_LENGTH = 300;
/** The most characters of items kept from a read receipt. */
export const MAX_RECEIPT_TEXT_LENGTH = 2000;
/** Lines of a read receipt's items a purchase's sheet shows before "Show all", which is offered only when it would hide at least `RECEIPT_TEXT_MIN_HIDDEN`. */
export const RECEIPT_TEXT_LINES_SHOWN = 6;
export const RECEIPT_TEXT_MIN_HIDDEN = 3;
export const MAX_LINK_LENGTH = 2000;
/** How long a pasted order link's page is waited for before the preview is skipped. */
export const LINK_LOOKUP_TIMEOUT_MS = 6000;
/** Confirmed and not-arrived days shown before "Show more". */
export const SETTLED_DAYS_PREVIEW = 3;

/** The tags a day wears on the Days list; a day that is coming wears none. */
export const DAY_STATUS_LABELS = {
  confirmed: 'Confirmed',
  notArrived: 'Did not arrive',
  overdue: 'Waiting to be confirmed',
} as const;

/** A confirmed day is a record of what happened, so a line that got less than planned reads as a past fact. */
export const RECORD_WORDS = {
  short: (amount: string) => `Was ${amount} short`,
  shortHidden: 'Got less than planned',
  shortHeading: 'Got less than planned',
} as const;

export const CONFIRM_WORDS = {
  hiddenAmountDiffered:
    'The amount that arrived differed from what was expected.',
  hiddenLineDiffered: (name: string) => `${name} changed on this day.`,
  action: 'Confirm money arrived',
  sheetTitle: 'Money arrived',
  amount: 'Amount that arrived',
  date: 'Arrived on',
  note: 'Add a note',
  notePlaceholder: 'Overtime, a bonus from the quarter',
  extraTo: 'The extra is left from this day.',
  shortFrom: 'The shortfall comes out of what is left from this day.',
  needsAmount: 'Enter the amount that arrived.',
  needsDate: 'Pick the date it arrived.',
  holds: 'Choose what to do for each item that is short first.',
  linesTakeTooMuch:
    'The items get more than arrived. Give one less, or raise the amount.',
  needsLineAmount: 'Enter an amount for each item you changed.',
  adjustLines: 'Change what each item gets',
  adjustIntro:
    'Change what each item gets. What is left from this day is what they leave.',
  lowestFirst: 'Take from the lowest priority first',
  resetLines: 'Back to the plan for this day',
  lineNotePlaceholder: 'Why it changed',
  adjustedDone: 'Done',
  confirm: 'Confirm',
  confirmed: 'Confirmed',
  markNotArrived: 'Did not arrive',
  markedNotArrived: 'Marked as not arrived',
  undoNotArrived: 'Put this day back',
  notArrivedLine: 'Marked as not arrived. It is off your plan.',
  offline:
    'Confirming needs a connection. Nothing was saved. Try again when you are back online.',
  planned: 'Planned',
  arrived: 'Arrived',
  recordTitle: 'Planned and confirmed',
  recordDoor: 'Planned and confirmed',
  unchanged: 'Everything matched the plan.',
  missingRecords: 'The record of this day could not be read.',
} as const;

export const CORRECT_WORDS = {
  door: 'Correct this day',
  doorHint: 'Fix an amount you confirmed. The original stays on record.',
  sheetTitle: 'Correct this day',
  intro:
    'Change what arrived or what an item got. What is left from this day is what the items leave.',
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
  untickedNote: 'Items you change are unticked on the checklist.',
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
  whyPlaceholder: 'Why it changed. You can leave this out.',
  saveWithNote: 'Save',
  saveWithoutNote: 'Save without a reason',
  unchanged: 'Make a change to continue.',
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
  stretchTooFar: (planned: number) =>
    `Only ${planned} income days are planned ahead. Pick fewer.`,
  stretchDateBlocker: 'Pick the last day, from today to ten years ahead.',
  dayBlocker: 'Pick an income day.',
  dayOnlyFields:
    'For one income day only the amount, how often and how much it matters can change.',
  stretchNote: 'Then it goes back to what it was.',
} as const;

export const LIFECYCLE_WORDS = {
  addReason: 'Add a reason',
  removeReason: 'Remove the reason',
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
  | (typeof CALENDAR_PERIODS)[number]
  | (typeof BILL_DRAFT_CADENCES)[number]
  | (typeof PAIRING_DRAFT_CADENCES)[number],
  string
> = {
  pairing: 'First from this pay',
  billSuggested: 'Spread over your income days',
  billChosen: 'A day you chose',
  everyIncomeDay: 'Every income day',
  every2: 'Every other income day',
  every3: 'Every third income day',
  chosen: 'A day you chose',
  weekly: 'Part of the weekly amount',
  every2Weeks: 'Part of the amount for every 2 weeks',
  twiceMonthly: 'Part of the twice-a-month amount',
  monthly: 'Part of the monthly amount',
  yearly: 'Part of the yearly amount',
};

export const DRAFT_WORDS = {
  fundedFrom: 'paid from',
  outOfMoney: "This day's money ran out before it got to this item",
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
  lesserLeft: (count: number, total: number) =>
    count === total
      ? 'These are left for later.'
      : `${count === 1 ? 'The other one is' : `The other ${count} are`} left for later.`,
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
    'This day cannot be confirmed until you choose for each item that is short.',
  useThePlan: 'Undo my choices for this day',
  undoChoice: 'Undo my choice',
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
    'Say what you have and what each envelope, goal and bill holds on the day tracking begins. Money that arrives or is paid after that day is added to it.',
  startsOn: 'Tracking starts',
  moneyOnHand: 'Money on hand',
  moneyHint: 'One total for all of it. Named accounts come later.',
  envelopes: 'What each envelope holds',
  goals: 'What each goal holds',
  bills: 'Already set aside for bills',
  cards: 'What each card owes',
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
  freeToSpend: 'Free to Spend',
  notSet: 'Not set yet',
  notSetHint: 'Say what you have on hand and Runway can work this out.',
  overAssigned: 'Over-assigned',
  noBills: 'No bills added yet',
  nextIncome: 'Next income day',
  envelopes: 'Envelopes',
  noIncome:
    'Add an income source to see what your next income day does with the money.',
  getStarted: 'Get started',
  resume:
    'Your income source is in. Add what you pay and what you spend on, and this page can say what is free.',
  resumeAction: 'Continue setting up',
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

/** A receipt photo's size cap after it has been shrunk, the most on one purchase, and the longer edge it is shrunk to. */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPTS_PER_PURCHASE = 10;
export const RECEIPT_MAX_DIMENSION = 2400;

export const SPEND_WORDS = {
  title: 'Purchases',
  newPurchase: 'Add a purchase',
  envelopeAdd: 'Add a purchase',
  sheetTitle: 'Purchase',
  empty:
    'Nothing spent yet. Add what you spend and each envelope shows what is left.',
  loading: 'Getting your purchases.',
  search: 'Search purchases',
  noMatch: 'No purchase matches that.',
  windowFrom: 'Showing purchases from',
  all: 'All',
  amount: 'Amount',
  refundAmount: 'Amount refunded',
  envelope: 'Envelope',
  day: 'Day',
  merchant: 'Merchant',
  merchantPlaceholder: 'Safeway',
  addMerchant: 'Add a merchant',
  label: 'Label',
  labelPlaceholder: "Mom's birthday dinner",
  addLabel: 'Add a label',
  note: 'Note',
  notePlaceholder: 'Split with Sam, paid back Friday',
  addNote: 'Add a note',
  link: 'Link',
  linkPlaceholder: 'Paste an order page or receipt link',
  addLink: 'Add a link',
  needsWebLink: 'Enter a web link, or remove it.',
  groupHint:
    'A group adds up its purchases, like a trip. It changes no balance.',
  group: 'Group',
  groupPlaceholder: 'Chicago trip',
  addGroup: 'Add to a group',
  newGroup: 'New group',
  groupLabel: 'Which group?',
  goneGroup: 'a removed group',
  partOfGroup: 'Part of',
  groupHead: 'Group',
  groups: 'Groups',
  groupsSearch: 'Search groups',
  groupsNoMatch: 'No group has that name.',
  groupsLoading: 'Getting your groups.',
  groupsFailed: 'Your groups could not be read.',
  groupsNoPurchases: 'No purchases yet',
  renameGroup: 'Rename the group',
  renameGroupTitle: 'Rename the group',
  renameSave: 'Save the name',
  removeGroup: 'Remove the group',
  removeGroupTitle: 'Remove this group?',
  removeGroupMessage:
    'The purchases stay where they are. Only the group goes, and its total with it.',
  removeGroupConfirm: 'Remove the group',
  groupRemoved: 'Group removed.',
  groupRenamed: 'Group renamed.',
  groupFailed: 'The group could not be saved. Nothing was changed.',
  groupGone: 'That group is no longer here.',
  groupLoading: 'Getting the group.',
  receipt: 'Receipt',
  receipts: 'Receipts',
  addReceipt: 'Add a receipt',
  readReceipt: 'Read a receipt',
  readReceiptSends:
    "Runway sends this photo to an AI service to read the total, the store, the day and the items. Nothing is saved until you add the purchase. The photo is kept as the purchase's receipt.",
  readReceiptChoose: 'Choose a photo',
  readReceiptChooseAnother: 'Choose another photo',
  readReceiptReading: 'Reading the receipt…',
  readReceiptEmpty:
    'Nothing could be read from that photo. Try a clearer one, or type it in.',
  items: 'Items',
  itemCount: (count: number) => (count === 1 ? '1 item' : `${count} items`),
  itemsHint: 'One item to a line, with its price after two spaces.',
  showAllItems: 'Show all',
  showFewerItems: 'Show fewer',
  addReceiptSub: 'A photo or screenshot. Sealed, and kept until you delete it.',
  receiptPhotos: (count: number) =>
    count === 1 ? '1 photo' : `${count} photos`,
  chooseReceipts: 'Choose photos',
  receiptHelp:
    'Photos or screenshots of the receipt. They are sealed on this device before they upload.',
  receiptLimit: (max: number) => `A purchase holds up to ${max} receipts.`,
  receiptNotImage: 'Only photos and screenshots can be added.',
  receiptTooBig: 'That one is too large to keep, even shrunk. Try another.',
  receiptOpenFailed: 'The receipt did not open.',
  receiptAdding: 'Adding the receipt.',
  receiptOpening: 'Opening the receipt.',
  receiptHidden: 'Show amounts to see it',
  removeReceiptFile: 'Remove photo',
  removeAllReceiptFiles: 'Remove all',
  receiptsHeld: (count: number) =>
    `This purchase has ${count === 1 ? '1 receipt' : `${count} receipts`}. View or remove ${count === 1 ? 'it' : 'them'} from the purchase.`,
  receiptsLoadFailed:
    'Receipts did not load. Reopen the purchase to try again.',
  receiptFormat:
    "That photo's format can't be shown here. Try a screenshot or a JPEG.",
  receiptOffline: "You're offline. Nothing was added.",
  receiptOfflineAfterSave:
    "The purchase saved. You're offline, so the receipts were not added; add them from the purchase.",
  receiptsLeftBehind: (failed: number, total: number) =>
    `The purchase saved. ${failed} of ${total} receipt${total === 1 ? '' : 's'} did not upload; add ${failed === 1 ? 'it' : 'them'} from the purchase.`,
  receiptsRemovedWithPurchase: (count: number) =>
    `Its ${count} receipt${count === 1 ? ' is' : 's are'} deleted too.`,
  receiptsLeftWithPurchase:
    'The purchase was removed, but its receipts could not be. They are deleted with the plan.',
  receiptAdded: (count: number) =>
    count === 1 ? 'Receipt added' : 'Receipts added',
  receiptAddFailed: 'The receipt did not upload. Nothing was changed.',
  viewReceipt: 'View this receipt',
  downloadReceipt: 'Download',
  removeReceipt: 'Remove this receipt',
  removeReceiptTitle: 'Remove this receipt?',
  removeReceiptMessage: 'The photo is deleted for good. The purchase stays.',
  receiptRemoved: 'Receipt removed',
  receiptRemoveFailed: 'The receipt did not remove. Nothing was changed.',
  receiptDownloadName: 'receipt.webp',
  moreDetails: 'More about it',
  removeDetail: 'Remove',
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
  freeToSpend: 'Free to Spend',
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
  chooseTitle: 'Which envelope?',
  amount: 'Amount',
  prompt: 'Pick an envelope and type an amount. Nothing is spent or moved.',
  promptChosen: 'Type an amount. Nothing is spent or moved.',
  noEnvelopes: 'Add an envelope to check an amount against it.',
  hidden: 'Show amounts to see how it fits.',
} as const;

export const BALANCE_CHECK_WORDS = {
  title: 'Check balance',
  open: 'Check your balance',
  openSub: 'Compare your bank with Runway',
  question: 'What does your account hold now?',
  amount: 'Account balance',
  hint: 'Checking changes nothing.',
  counts: 'Runway counts',
  onHand: 'on hand',
  match: 'They match.',
  less: (amount: string) =>
    `Your account has ${amount} less than Runway counts.`,
  more: (amount: string) =>
    `Your account has ${amount} more than Runway counts.`,
  onCards: (amount: string) =>
    `This includes ${amount} waiting to be paid on cards, which is still in your account.`,
  causesCaption: 'What can cause it',
  lessCauses: [
    'A purchase or card payment not added yet',
    'A fee, or a transfer out',
  ],
  moreCauses: [
    "Money that arrived but isn't confirmed on its income day",
    'Interest, a refund or a transfer in',
  ],
  addPurchase: 'Add a purchase',
  openDays: 'See your income days',
  laterFix:
    'A balance from before this can be fixed by correcting the income day or bill payment it came from.',
  tooLarge: 'Enter what the account holds now.',
  showToCompare: 'Show amounts to see how they compare',
  notSet:
    'Runway does not know what you started with yet, so there is nothing to compare. Say where things stand first.',
  loading: 'Getting your plan.',
} as const;

export const START_WORDS = {
  title: 'Starting out',
  later: 'Later',
  next: 'Next',
  done: 'Done',
  stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
  incomeAsk: 'Who pays you?',
  incomeHelp:
    'Where your money comes from, how much, and how often. It is the one thing Runway needs.',
  billsAsk: 'What do you pay?',
  billsHelp:
    'Add the bills and upcoming expenses you know about. Each is set aside a little at a time before it is due.',
  envelopesAsk: 'What do you spend money on?',
  envelopeDoor: "What's an envelope?",
  envelopeDoorBody:
    'An envelope is money set aside for a kind of spending, like groceries, that you refill each period. A goal is different: you fill it toward a target, like a trip or a car.',
  goalsAsk: 'What are you saving toward?',
  goalsHelp:
    'A goal is something you fill toward a target. It can have a date, and money does not have to go in on a schedule.',
  standAsk: 'Where do things stand today?',
  standHelp:
    'Say what you have on hand and what is already set aside, so the first numbers start true.',
  standMany:
    'Start with your most important bills and goals. You can add the rest later.',
  doneAsk: 'Your next income day is ready',
  savedSummary: (parts: string) =>
    parts === ''
      ? 'Nothing has been added yet.'
      : `Saved to your plan: ${parts}.`,
  billsEmpty: 'No bills yet. The ones you add are listed here.',
  envelopesEmpty: 'No envelopes yet. The ones you add are listed here.',
  goalsEmpty: 'No goals yet. The ones you add are listed here.',
  standEmpty: 'Not entered yet. Until you do, Free to Spend reads Not set yet.',
  addIncome: 'Add an income source',
  addAnotherIncome: 'Add another income source',
  addBill: 'Add a bill',
  addAnotherBill: 'Add another bill',
  addEnvelope: 'Add an envelope',
  addAnotherEnvelope: 'Add another envelope',
  addGoal: 'Add a goal',
  addAnotherGoal: 'Add another goal',
  needIncome: 'Add one to continue.',
  localNotice:
    'You are not signed in. What you enter stays on this device, unencrypted, for 7 days. Sign in to save it to your plan.',
  resumeAsk: 'Pick up where you left off?',
  resumeSummary: (parts: string) => `You have added ${parts}.`,
  resumeContinue: 'Continue where you left off',
  resumeStartOver: 'Start over',
  startOverTitle: 'Start over?',
  startOverLocal: (parts: string) =>
    `This removes ${parts} from this device. It cannot be undone.`,
  startOverPlan: (parts: string) =>
    `This takes ${parts} off your plan. Their history stays in your change log.`,
  startOverConfirm: 'Start over',
  rowActionsChange: 'Change',
  rowActionsRemove: 'Remove',
  removeTitle: (name: string) => `Remove ${name}?`,
  removeMessage: 'It comes off this list. You can add it again any time.',
  removeFailed: 'That did not remove. Nothing was changed.',
  saveAsk: 'Sign in to save your plan',
  saveBody:
    'Your answers are kept on this device only until you sign in. Signing in seals them with your account and writes them to your plan.',
  saveSummary: (parts: string) =>
    parts === '' ? 'Nothing has been added yet.' : `Ready to save: ${parts}.`,
  saveButton: 'Sign in with Google',
  handoffTitle: 'Save what you entered?',
  handoffBody: (parts: string, hasItems: boolean) =>
    hasItems
      ? `This device has ${parts} from before you signed in, and your plan already has items. Which should stay?`
      : `This device has ${parts} from before you signed in. Add them to your plan?`,
  handoffAdd: 'Add them to my plan',
  handoffKeep: 'Keep my plan as it is',
  handoffDiscard: 'Do not add them',
  handoffSaved: (count: number) =>
    count === 1
      ? 'Saved 1 item to your plan.'
      : `Saved ${count} items to your plan.`,
  handoffFailed:
    'Some of what you entered did not save. It is still on this device.',
  handoffNotReady:
    'Your plan is still opening. Try again in a moment. Nothing was added.',
  handoffUnrecorded: (names: string) =>
    `What is in it now did not record for ${names}. Add it under Where things stand.`,
  landingTitle: 'Plan before you sign in',
  landingBody:
    'Runway plans each paycheck: what goes to bills, envelopes and goals, and what is left to spend. You can go through Starting out now. Your answers stay on this device until you sign in.',
  landingButton: 'Start planning',
} as const;

/** What "Start from your budget" takes and keeps from the documents, told to the reader and enforced on its answer. */
export const BUDGET_LIMITS = {
  files: 5,
  bytes: 10 * 1024 * 1024,
  /** Characters kept from one text document or the pasted text. */
  textChars: 40_000,
  items: { incomes: 10, bills: 40, envelopes: 30, goals: 15 },
  notRead: 20,
  notReadChars: 140,
  fileNameChars: 80,
  /** The most one amount can hold, in cents. */
  maxCents: 999_999_999,
} as const;

/** The ways Starting out can begin, kept in the URL as `method` so a choice survives sign-in. */
export const START_METHODS = ['budget'] as const;

export const BUDGET_TEXT_EXTENSIONS = ['csv', 'tsv', 'txt', 'md'] as const;
export const BUDGET_ACCEPT = '.csv,.tsv,.txt,.md,.pdf';
export const BUDGET_PASTED_NAME = 'Pasted text';

const BUDGET_SENT_LINE =
  "Your documents are sent to an AI to read and aren't kept. Nothing is added until you add it.";

export const BUDGET_WORDS = {
  chooseAsk: 'How do you want to start?',
  methodTitle: 'Start from your budget',
  methodBody:
    'Bring a spreadsheet, a PDF or pasted notes. An AI reads them and suggests your income, bills, envelopes and goals.',
  methodBodySignedOut:
    'Bring a spreadsheet, a PDF or pasted notes and an AI suggests your plan. Sign in to use it.',
  freshTitle: 'Start fresh',
  freshBody: 'Answer a few questions, one at a time.',
  ask: 'Bring your budget',
  help: `Pick up to 5 files, or paste text. ${BUDGET_SENT_LINE}`,
  tabsHint: 'Export each tab as a CSV and pick them together.',
  chooseFiles: 'Choose files',
  chooseMore: 'Choose more files',
  accepts: 'CSV, TSV, text, Markdown or PDF',
  pasteLabel: 'Or paste text',
  pastePlaceholder: 'Paste rows from a spreadsheet, or notes about your budget',
  removeFile: (name: string) => `Remove ${name}`,
  read: 'Read my budget',
  needInput: 'Choose a file or paste some text first.',
  reading: (files: number, hasText: boolean) =>
    files === 0
      ? 'Reading your text'
      : `Reading ${files} ${files === 1 ? 'file' : 'files'}${hasText ? ' and your text' : ''}`,
  tooMany: `Only ${BUDGET_LIMITS.files} files can be read at once; the rest weren't added.`,
  tooBig: `Those files are over ${BUDGET_LIMITS.bytes / 1024 / 1024} MB together. Remove one, or export a smaller range.`,
  wrongType: (names: string[]) =>
    `${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} not a CSV, TSV, text, Markdown or PDF file, so ${names.length === 1 ? 'it was' : 'they were'} skipped.`,
  failSubject: 'budget',
  failFallback: 'start fresh instead',
  unreadable: "We couldn't read that. Try again.",
  nothingFound:
    'We could not find any income, bills, envelopes or goals in that. Try another file or some pasted text, or start fresh.',
  reviewAsk: 'Here is what we found',
  reviewHelp: 'Open any one to check it or change it.',
  income: 'Income',
  bills: 'Bills',
  envelopes: 'Envelopes',
  goals: 'Goals',
  needs: (parts: string[]) =>
    `Needs ${parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`}`,
  needsParts: {
    amount: 'an amount',
    target: 'a target amount',
    often: 'how often it arrives',
    schedule: 'a next date',
    repeats: 'how often it repeats',
    due: 'a due date',
  } as Record<string, string>,
  disagree: 'Two files disagree',
  disagreeAgain: 'A new file disagrees',
  needsLook: 'Needs a look',
  versionSays: (file: string, what: string) => `${file} says ${what}`,
  useThis: 'Use this',
  chooseVersion: 'The files give different answers. Which one is right?',
  chooseVersionAgain:
    'A file you added disagrees with your choice. Which one is right?',
  showToCompare: 'Show amounts to compare',
  goalMonthly: (amount: string) => `The document says ${amount} a month`,
  noIncome: 'No income found in your documents. Add it next.',
  documentSays: (cadence: string) => `The document says ${cadence}`,
  documentSaysAmount: (amount: string, cadence: string) =>
    `The document says ${amount} ${cadence}`,
  cadenceRow: (cadence: string, needs: string) =>
    `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)} in the document · ${needs.charAt(0).toLowerCase()}${needs.slice(1)}`,
  needsMonthlyAmount: 'a monthly amount',
  yourChoice: 'Your choice',
  goalOf: (target: string) => `of ${target}`,
  amountPerCadence: (amount: string, cadence: string) =>
    `${amount} ${cadence === 'yearly' ? 'a year' : cadence}`,
  amountAMonth: (amount: string) => `${amount} a month`,
  monthlyOffer: (amount: string) => `Use ${amount} a month`,
  monthlyOfferSub:
    'Spread evenly over the months. You still say when it is due.',
  sheetKind: {
    income: 'Suggested income',
    bill: 'Suggested bill',
    envelope: 'Suggested envelope',
    goal: 'Suggested goal',
  } as const,
  needDetails: (count: number) =>
    count === 1
      ? 'One needs a look. Open it or remove it.'
      : `${count} need a look. Open them or remove them.`,
  needDetailsShort: (count: number) =>
    `${count} ${count === 1 ? 'needs' : 'need'} a look`,
  openToChange: 'Check or change it',
  removeOne: 'Remove',
  changeFor: "Change what it's for",
  forSomethingElse: "It's for something else",
  changePayer: 'Change who pays it',
  forActions: (name: string) => `Change ${name}`,
  takeOut: 'Take these out',
  takeOutNote: 'They stay in the list with nothing set.',
  tookOut: (count: number, name: string) => `Took ${count} out of ${name}`,
  undo: 'Undo',
  renameDone: 'Done',
  leaveTitle: 'Go back?',
  leaveMessage: 'What was read is dropped. Nothing has been added.',
  addedToast: (count: number) => `Added ${count} from your budget.`,
  freshInstead: 'Start fresh instead',
  stopTitle: 'Stop reading?',
  stopMessage:
    'Your budget is still being read. If you stop, nothing is added.',
  stopConfirm: 'Stop',
  stopCancel: 'Keep waiting',
  tabsTitle: 'A spreadsheet with several tabs?',
  notReadRow: (count: number) =>
    `${count} ${count === 1 ? 'thing' : 'things'} we could not read`,
  addAnother: 'Add another file',
  addAnotherBody: (left: number) =>
    `${left} more ${left === 1 ? 'file' : 'files'} can be added. ${BUDGET_SENT_LINE} Only what you add now is read.`,
  notReadTitle: 'What we could not read',
  sourcePrefix: 'From',
  planAdd: 'Add to my plan',
  planFailed: 'None of this was added. Nothing was changed.',
  notReady: 'Your plan is still opening. Try again in a moment.',
  cutText: (file: string, chars: number) =>
    `Only the first ${chars.toLocaleString()} characters of ${file} were read.`,
  partialAdded: (added: number, total: number) =>
    `Added ${added} of ${total}. The rest were not added; try again to add them, and nothing will be added twice.`,
  nothingNew: (files: number) =>
    `Nothing new in ${files === 0 ? 'that text' : files === 1 ? 'that file' : 'those files'}.`,
  alreadyRead: (names: string[]) =>
    `${names.join(', ')} ${names.length === 1 ? 'was' : 'were'} already read, so ${names.length === 1 ? 'it was' : 'they were'} skipped.`,
  cutItems: (count: number, label: string, kept: number) =>
    `Only the first ${kept} ${label} are kept; ${count} more ${count === 1 ? 'was' : 'were'} left out.`,
  dateTooFar: (name: string, date: string, months: number) =>
    `${name} aims for ${date}, which is more than ${months} months away. The date was left out.`,
  empty: 'Nothing is left to add.',
} as const;

export const DELETE_PLAN_PHRASE = 'delete my plan';

export const DELETE_PLAN_WORDS = {
  rowLabel: 'Delete your plan',
  rowHelp: 'Remove everything and start over.',
  title: 'Delete your plan',
  goes: "This deletes your plan, every change, day and purchase. It can't be undone.",
  kept: 'Your account stays, and you can start a new plan afterwards.',
  phraseLabel: `Type "${DELETE_PLAN_PHRASE}" to confirm`,
  confirmTitle: 'Delete your plan for good?',
  confirmMessage:
    'This removes your plan, every change, every day and every purchase, and the key that opens them. There is no undo.',
  confirmText: 'Delete everything',
  offline:
    "You're offline. Connect to the internet to delete your plan; nothing has been removed.",
  partial: 'Your plan was not fully deleted. Run the delete again to finish.',
} as const;

// Lists and screens: an item's sheet, the one row anatomy and the counted problems row.
export const ITEM_SHEET_WORDS = {
  change: 'Change it',
  changeDaySub: 'From this income day, or for this day alone',
  funds: 'Pay these first',
  fundsSub: 'Out of this pay before anything else',
  fundsTitle: (source: string) => `Paid first from ${source}`,
  fundsNotice:
    'Everything in your plan is paid from your income. Items here come out of this pay first.',
  history: 'History',
  historySub: 'Every change to it, with your reasons',
  notPaid: 'Mark not paid',
  paidFromSetAside: 'It comes out of what is set aside',
  paidFromFree: 'not set aside yet comes out of Free to Spend',
  stopHeading: 'Stop or pause',
  lineHeading: 'This income day',
  topUpSub: 'Takes what it is short from what this day has left',
  leaveShortSub: 'It waits for a later income day',
  undoChoiceSub: 'Back to holding it until you choose',
  heldFlag: 'Held until you choose',
  fromThisDay: 'From this day',
  draftStatus: 'Expected. This is the plan until the money arrives.',
  dayMore: 'More about this day',
  notArrivedSub: 'Takes this day off your plan until you put it back',
} as const;

/** Moving what is left in an envelope to another envelope, a goal or Free to Spend. */
export const MOVE_WORDS = {
  open: "Move what's left",
  title: (name: string) => `Move money from ${name}`,
  amount: 'Amount to move',
  moveTo: 'Move it to',
  places: 'Places',
  freeToSpend: 'Free to Spend',
  needsAmount: 'Enter how much to move.',
  needsPlace: 'Pick where it goes.',
  tooMuch: 'That is more than is left in it.',
  action: (amount: string) => `Move ${amount}`,
  moved: (amount: string, to: string) => `Moved ${amount} to ${to}`,
  undone: (amount: string, from: string, to: string) =>
    `Put ${amount} back in ${from} from ${to}`,
  summary: (amount: string, from: string, to: string) =>
    `Moved ${amount} from ${from} to ${to}.`,
  moveAll: (amount: string) => `Move all ${amount}`,
  moveAllHidden: 'Move all of it',
  freeToSpendNow: 'Free to Spend',
  undo: 'Undo',
  moveTitle: 'Move',
  openMove: 'Open this move',
  undoThis: 'Undo this move',
  undoTitle: 'Undo this move?',
  undoneRow: 'Undone',
  failed: 'This did not save. Nothing was changed.',
  undoFailed: 'That was not undone.',
  offline: 'Moving money needs a connection. Nothing was changed.',
} as const;

export const PROBLEM_WORDS = {
  title: 'Things to fix',
  one: '1 thing to fix',
  many: (count: number) => `${count} things to fix`,
  stanceTitle: 'Planning at the safe end',
} as const;

/** Envelope tiles Home shows at Track, two to a row. */
export const HOME_TILE_COUNT = 4;
/** How many days ahead Home warns that a card with money waiting is due. */
export const CARD_DUE_WARN_DAYS = 7;

/** The words of the one-question-at-a-time forms and their hero amounts. */
export const FORM_FLOW_WORDS = {
  next: 'Next',
  done: 'Done',
  compactOne: 'One income day changes,',
  compactMany: (count: number) => `${count} income days change, starting`,
  compactLeft: 'left from this day.',
  compactDoor: 'See each income day',
  nameTitle: 'What is it called?',
  name: 'Name',
  priorityTitle: 'How much does it matter?',
  priority: 'How much it matters',
  groupTitle: "What's it for?",
  groupHelp:
    "Tie together the bills and envelopes that look after the same thing, like Pets or Home, to see what it costs you each month. It doesn't change how anything is funded.",
  group: 'For',
  noGroup: 'Nothing set',
  newGroup: 'Something else',
  newGroupPlaceholder: 'Like Pets or Home',
  clearGroup: 'Nothing',
  nameGroup: "Name what it's for, or choose Nothing.",
  emojiTitle: 'Pick an emoji, if you like',
  emoji: 'Emoji',
  noEmoji: 'None',
  billAmountTitle: 'How much is it?',
  expenseAmountTitle: 'How much will it be?',
  amount: 'Amount',
  dueTitle: 'When is it due?',
  due: 'Due',
  repeatsTitle: 'Does it repeat?',
  repeats: 'Repeats',
  endsTitle: 'Does it end?',
  ends: 'Ends',
  fundingTitle: 'Which income days pay for it?',
  funding: 'Paid from',
  envelopeAmountTitle: 'How much does it get each time?',
  eachTime: 'Each time',
  balance: 'Balance',
  percentLink: 'A % of each pay',
  restLink: 'Whatever is left of each pay',
  exactLink: 'An amount',
  itVaries: 'It varies',
  oneAmount: 'The same each time',
  chooseEnd: 'Choose which end to plan for',
  endQuestion: 'Which end should the plan count on?',
  endHelpTitle: 'Planning at one end',
  endHelp: (end: string) =>
    `Planning at ${end} means the plan counts on that amount only. If the real amount is better, the difference shows up as extra when it lands.`,
  endSameAsPlan: 'like your plan',
  howOftenNext: 'How often it arrives comes next.',
  commonBills: 'Common bills',
  commonEnvelopes: 'Common envelopes',
  commonGoals: 'Common goals',
  cadenceTitle: 'Which pays does it get money from?',
  cadence: 'Pays',
  targetTitle: 'How much do you want to save?',
  target: 'Target',
  byWhenTitle: 'By when?',
  byWhen: 'Reach it by',
  noDate: 'No date',
  noDateHint: 'Leave it empty if there is no date.',
  goalEachTitle: 'How much goes in each time?',
  suggestion: (amount: string, date: string) =>
    `${amount} each income day reaches it by ${date}.`,
  sourceTitle: 'Where does it come from?',
  source: 'From',
  takeHomeTitle: 'How much lands?',
  takeHome: 'Take-home pay',
  expectedIncomeTitle: 'How much is coming?',
  scheduleTitle: 'When is the next one?',
  scheduleTwiceTitle: 'Which two days of the month?',
  oftenTitle: 'How often does it arrive?',
  often: 'How often',
  schedule: 'When',
  payNameTitle: 'What is this pay called?',
  payName: 'Called',
  sourceNameTitle: 'What is the source called?',
  expectedTitle: 'What is coming?',
  expectedIncome: 'Money coming in',
  expectedIncomeSub: 'A payment you expect, once or on a schedule.',
  expectedExpense: 'An expense coming up',
  expectedExpenseSub: 'Something you will pay, set aside from income days.',
  purchaseAmountTitle: 'How much was it?',
  refundAmountTitle: 'How much came back?',
  purchaseForTitle: 'What was it for?',
  refundForTitle: 'Where does it go back?',
  dayTitle: 'Which day?',
  more: 'More',
  moreTitle: 'Which envelope?',
  findEnvelope: 'Find an envelope',
  noEnvelopeMatch: 'No envelope matches that.',
  refundLink: 'This is a refund',
  notRefundLink: 'Not a refund',
  arrivedOn: 'Arrived',
  moreThanPlanned: (amount: string) =>
    `${amount} more than planned, left from this day.`,
  lessThanPlanned: (amount: string) =>
    `${amount} less than planned, taken from what is left.`,
  lessThanLeft: (amount: string) =>
    `${amount} less than planned. An item has to get less.`,
  moreShort: (amount: string) => `${amount} more than planned.`,
  lessShort: (amount: string) => `${amount} less than planned.`,
  differenceWithLines: (lead: string, left: string) =>
    `${lead} Left from this day: ${left}.`,
  linesAsPlanned: 'As planned',
  linesChanged: (count: number) => `${count} changed`,
  pastDay: 'Pick today or a day to come.',
  pickRepeat: 'Pick how often it repeats.',
  badAmount: 'Enter an amount above $0, like 45.00.',
  overLimit: 'That is more than an amount can be here.',
  badRange: 'Make the top of the range higher than the low end.',
  badPercent: 'Enter a whole or half percent, up to 100.',
  finishEnding: 'Finish when it ends.',
  pickDays: 'Pick at least one income day.',
  otherPayday: 'Pick two different days of the month.',
  discardNew: (noun: string) => `Discard this ${noun}?`,
  discardChange: 'Discard this change?',
  asOf: 'As of',
  moneyOnHand: 'Money on hand',
} as const;

// Lists and screens, round 2: one fact per sheet head, short action rows, the payday tick and the problems row.
export const ITEM_SHEET_R2_WORDS = {
  changeElse: 'Change something else',
  pauseSub: 'Nothing new goes in',
  resumeSub: 'Money goes in again from the next income day',
  endSub: 'It stops after the day you pick',
  archiveSub: 'Off your lists. Its history stays',
  checkSub: 'Try an amount first. Nothing changes.',
  paidFromFreeText: (amount: string) => `${amount} comes out of Free to Spend`,
  changeAmount: 'Change amount',
  eachTime: 'Each time',
  balance: 'Balance',
  changeTarget: 'Change target',
  changeName: 'Change name',
  heldDetail: (amount: string) => `${amount} held · choose`,
  toppedUp: 'Topped up',
  setAsideHeading: 'Set aside from this pay',
  holdsThrough: 'Your plan holds through',
  everythingPaid: 'Mark all paid',
  markedPaid: (name: string) => `Marked ${name} paid`,
  unmarkedPaid: (name: string) => `${name} is not marked paid`,
  undo: 'Undo',
  stopOnly: 'Stop',
} as const;

// Round 3: paying a whole payday at once, a tick that needs a connection, and one word for a shortfall.
export const CHECKLIST_R3_WORDS = {
  allPaid: 'All paid',
  markedAllPaid: (count: number) =>
    count === 1 ? 'Marked 1 bill paid' : `Marked ${count} bills paid`,
  nothingToMark: 'Those were already paid',
  undoneAll: (count: number) =>
    count === 1
      ? '1 bill is not marked paid'
      : `${count} bills are not marked paid`,
  markAllFailed: 'Those bills were not marked paid',
  needsConnection: 'Marking paid needs a connection. Nothing was changed.',
  tickNeedsConnection: 'Ticking needs a connection. Nothing was changed.',
  short: (amount: string) => `${amount} short`,
  shortChoose: (amount: string) => `${amount} short · choose`,
  shortNote: (name: string, amount: string) =>
    `${name} is ${amount} short: choose before confirming`,
  heldNote: (name: string, amount: string) =>
    `${name}: ${amount} held · choose before confirming`,
  notStarted: 'Not started',
  partlyMarked: (marked: number, of: number) =>
    `Marked ${marked} of ${of} bills paid`,
  restNeedsConnection: 'The rest need a connection.',
  restNotSaved: 'The rest did not save. Try them again.',
} as const;

// Round 4: how often an envelope or goal gets money, calendar first and paycheck second.
export const CALENDAR_PERIODS = [
  'weekly',
  'every2Weeks',
  'twiceMonthly',
  'monthly',
  'yearly',
] as const;

export const CALENDAR_PERIOD_LABELS: Record<
  (typeof CALENDAR_PERIODS)[number],
  string
> = {
  weekly: 'Weekly',
  every2Weeks: 'Every 2 weeks',
  twiceMonthly: 'Twice a month',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** What follows the amount for one period: "$600 a month". */
export const CALENDAR_PERIOD_UNITS: Record<
  (typeof CALENDAR_PERIODS)[number],
  string
> = {
  weekly: 'a week',
  every2Weeks: 'every 2 weeks',
  twiceMonthly: 'twice a month',
  monthly: 'a month',
  yearly: 'a year',
};

/** The answers to "How often?": a calendar period, or a share of each pay. */
export const HOW_OFTEN_PAYCHECK = 'paycheck';
/** A goal that is not being added to. */
export const HOW_OFTEN_NONE = 'none';

export const HOW_OFTEN_WORDS = {
  title: 'How often does it get money?',
  goalTitle: 'How often does money go in?',
  caption: 'How often',
  paycheck: 'From a paycheck',
  none: 'Not adding to it',
  perPeriodLabel: 'Amount',
  paycheckAmountTitle: 'How much from each pay?',
  fromWhich: 'Which pay',
  allSources: 'Each pay, all sources',
  eachSource: (name: string) => `Each ${name} pay`,
  unnamedSource: 'that source',
  percentOf: 'of each pay',
  percentOfSource: (name: string) => `of each ${name} pay`,
  restTitle: 'Whatever is left of each pay',
  restHelp:
    'What is left of that pay after your bills and the envelopes above this one in priority.',
  noAddingSummary: 'Not being added to',
  noAddingHint:
    'Nothing goes into it. You can start adding to it whenever you like.',
  startAdding: 'Start adding to it',
  changeOften: 'Change how often',
  needsIncome: 'Add an income source first, so there are pays to count.',
  badAmount: 'Enter an amount above $0, like 600.00.',
  currentTitle: 'How much is in it now?',
  current: 'In it now',
  currentHint: 'Leave it at $0 if you are starting from nothing.',
  holdingNotRecorded: (name: string) =>
    `${name} was added, but what is in it now did not record. Add it under Where things stand.`,
  notBeingAdded: 'Not being added to',
} as const;

/** Round 4, package C: Home, Days, Plan and Spend screens. */
export const FIX_WORDS = {
  notPaid: (name: string) => `${name} is not marked paid`,
  noIncome: (name: string) => `${name} has no income before it is due`,
  short: (name: string, amount: string) => `${name} ${amount} short`,
  dueOn: (date: string) => `Due ${date}`,
  runsShortOn: (date: string) => `On ${date}`,
  openDay: 'Open this income day',
  openBills: 'Open your bills',
  incomeEnds: (date: string) =>
    `Your last income day is ${date}. Nothing is planned after it.`,
} as const;

export const DAYS_WORDS = {
  addExpected: 'Add expected money',
  addExpectedShort: 'Add money',
  earlierMonths: 'Earlier months',
  backToRecent: 'Recent days',
  loadingMonth: 'Getting these income days.',
  loadingDay: 'Getting this day.',
  failedMonth: 'These income days did not load. Nothing was changed.',
  emptyMonth: 'No income was confirmed in this month.',
  noMatch: 'No income day matches that.',
  readOnlyNote: (boundary: string) =>
    `Pays before ${boundary} can't be changed. To fix a balance, correct a pay from ${boundary} on.`,
  goToRecent: 'Go to recent days',
} as const;

export const PLAN_VIEW_EMOJI = {
  income: '💵',
  bills: '🧾',
  envelopes: '✉️',
  goals: '🎯',
  cards: '💳',
} as const;

export const PLAN_MORE_LABEL = 'Settings and tools';

/** Quick periods on Spend, as the URL keeps them; any other value is a month as `yyyy-mm`. */
export const SPEND_PERIODS = ['month', 'lastMonth', '30', '90'] as const;
export const DEFAULT_SPEND_PERIOD = 'month' as const;

export const SPEND_PERIOD_LABELS = {
  month: 'This month',
  lastMonth: 'Last month',
  '30': 'Past 30 days',
  '90': 'Past 90 days',
} as const;

export const SPEND_PERIOD_WORDS = {
  total: 'Spent',
  period: 'Period',
  months: 'Older months',
  failed: 'These purchases did not load. Nothing was changed.',
  emptyPeriod: 'Nothing was spent in this period.',
  loading: 'Getting these purchases.',
} as const;

export const BILL_QUICK_PICKS = [
  { name: 'Rent', emoji: '🏠', priority: 'must' },
  { name: 'Mortgage', emoji: '🏡', priority: 'must' },
  { name: 'Electricity', emoji: '💡' },
  { name: 'Water', emoji: '🚰' },
  { name: 'Internet', emoji: '🌐' },
  { name: 'Phone', emoji: '📱' },
  { name: 'Car payment', emoji: '🚗' },
  { name: 'Car insurance', emoji: '🛡️', priority: 'must' },
  { name: 'Health insurance', emoji: '🩺', priority: 'must' },
  { name: 'Streaming', emoji: '📺' },
  { name: 'Gym', emoji: '🏋️' },
] as const;

export const GOAL_QUICK_PICKS = [
  { name: 'Emergency fund', emoji: '🛟' },
  { name: 'Vacation', emoji: '🏖️' },
  { name: 'New car', emoji: '🚗' },
  { name: 'Home repairs', emoji: '🛠️' },
  { name: 'Holiday gifts', emoji: '🎁' },
] as const;

export const ENVELOPE_QUICK_PICKS = [
  { name: 'Groceries', emoji: '🛒' },
  { name: 'Dining out', emoji: '🍽️' },
  { name: 'Gas', emoji: '⛽' },
  { name: 'Household', emoji: '🧺' },
  { name: 'Fun money', emoji: '🎟️' },
] as const;

// Round 4, package F: views an item sheet swaps in, and one wording for the action views.
export const ITEM_VIEW_WORDS = {
  historyTitle: 'History',
  historyEmpty: 'Nothing has changed since you added it.',
  historyLoading: 'Getting the changes.',
  historyOlder: 'Older changes are in the change log.',
  historyFailed: 'The history did not load. Nothing was changed.',
  purchasesTitle: 'Purchases this month',
  purchasesEmpty: 'Nothing spent from it this month.',
} as const;

export const CHECK_RESULT_WORDS = {
  fits: 'It fits',
  left: 'left',
  over: (name: string) => `${name} would be over`,
  overBy: 'over',
  free: 'Free to Spend',
  fromFree: 'It could come from Free to Spend, then the lowest priority first',
  fromOthers: 'It could come from, lowest priority first',
  uncovered: (amount: string) =>
    `${amount} is more than Free to Spend and the other envelopes hold. Free to Spend would go over-assigned.`,
} as const;

export const ITEM_KIND_NOUNS = {
  bill: 'bill',
  envelope: 'envelope',
  goal: 'goal',
  payLine: 'pay',
  source: 'income source',
  group: 'item',
} as const;

export const EFFECT_FOLD_WORDS = {
  removed: (count: number) => `${count} income days go away`,
  added: (count: number) => `${count} income days are added`,
  same: (count: number) =>
    count === 1
      ? 'One income day: nothing else changes'
      : `${count} income days: nothing else changes`,
} as const;

/** Rows of "Things to fix" drawn before "Show N more". */
export const FIX_ROWS_SHOWN = 12;

/** Rows any Runway list holds before it offers a search. */
export const RUNWAY_SEARCH_THRESHOLD = 5;

export const GROUP_WORDS = {
  ungrouped: 'Other bills',
  ungroupedEnvelopes: 'Other envelopes',
  setTip:
    'Tip: say what a bill or envelope is for, like Pets, to see what it costs each month.',
  perMonth: (amount: string) => `${amount} a month`,
  monthLabel: 'Together, each month',
  openLabel: (name: string) => `${name}, open`,
  rename: (name: string) => `Rename ${name}`,
  nameLabel: 'Name',
  startingPriority: 'Starting priority',
  startingPriorityHelp:
    'A new bill or envelope for this starts with this priority; with None, it starts at Should. You can still change it on the bill or envelope.',
  startingPriorityFailed: 'The priority did not save. Nothing was changed.',
  noPriority: 'None',
  archive: (name: string) => `Stop using ${name}`,
  archiveSub: 'Its bills and envelopes stay, with nothing set.',
  archiveTitle: (name: string) => `Stop using ${name}?`,
  archiveBody: (bills: number, envelopes: number) =>
    bills + envelopes === 0
      ? 'Nothing is for it right now.'
      : `Its ${countMembers(bills, envelopes)} stay in your plan, with nothing set.`,
  archived: (name: string, bills: number, envelopes: number) =>
    bills + envelopes === 0
      ? `Stopped using ${name}.`
      : `Stopped using ${name}. Its ${countMembers(bills, envelopes)} now have nothing set.`,
  archivedToast: (name: string) => `Stopped using ${name}`,
  addBill: (name: string) => `Add a bill for ${name}`,
  addEnvelope: (name: string) => `Add an envelope for ${name}`,
  billsHeading: 'Bills',
  envelopesHeading: 'Envelopes',
  changeLabel: 'For',
  inGroup: 'For',
  none: 'Nothing',
  unset: 'Nothing set',
  oneTimeNote: 'Not in monthly total',
  noBills: 'No bills or envelopes yet',
  nameTaken: (name: string) => `You already have ${name}.`,
  oneTimeDue: (date: string) => `due ${date}`,
  oneTimeCount: (count: number) => `in ${count} one-time bills`,
  oneTimeLabel: 'Together, one-time',
  moved: (item: string, name: string) => `${item} is now for ${name}`,
  movedOut: (item: string, name: string) => `${item} is no longer for ${name}`,
  movedClear: (item: string) => `${item} is for nothing now`,
  willBe: (name: string) => `It will be for ${name}.`,
  plusOneTime: (amount: string, count: number, due: string | null) =>
    count === 1 && due !== null
      ? `Plus ${amount} due ${due}`
      : `Plus ${amount} in ${count} one-time bills`,
  members: (names: readonly string[]) =>
    names.length <= 4
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`,
  archiveFailed: 'This did not stop. Nothing was changed.',
  saveFailed: 'This did not save. Nothing was changed.',
  ofWord: 'of',
  basisTitle: 'How a month is worked out',
  rangeTotal:
    'A bill or envelope that varies counts at its low and its high amount, so the total is a range.',
  basis:
    'A usual month: each repeating bill at what it comes to in an average month, and each envelope at what it gets in one. A one-time bill is not in it.',
  onlyBills: (name: string, part: string | null, whole: string | null) =>
    part === null || whole === null
      ? `This counts bills only. Tap ${name} to see both.`
      : `Bills come to ${part} of ${name}'s ${whole} a month. Tap ${name} to see both.`,
  onlyEnvelopes: (name: string, part: string | null, whole: string | null) =>
    part === null || whole === null
      ? `This counts envelopes only. Tap ${name} to see both.`
      : `Envelopes come to ${part} of ${name}'s ${whole} a month. Tap ${name} to see both.`,
  chooseEmoji: (name: string) => `Choose an emoji for ${name}`,
  changeEmoji: (name: string) => `Change the emoji for ${name}`,
  emojiLabel: 'Emoji',
  removeEmoji: 'Remove emoji',
  uncounted: (count: number) =>
    count === 1
      ? 'One envelope or bill has no regular amount or schedule, so it is not in this total.'
      : `${count} envelopes or bills have no regular amount or schedule, so they are not in this total.`,
} as const;

const countMembers = (bills: number, envelopes: number) =>
  [
    bills > 0 ? `${bills} ${bills === 1 ? 'bill' : 'bills'}` : null,
    envelopes > 0
      ? `${envelopes} ${envelopes === 1 ? 'envelope' : 'envelopes'}`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' and ');

// Round 4, package G4.
export const FREE_SUM_WORDS = {
  onHand: 'Money on hand',
  bills: 'Held for bills',
  goals: 'Held for goals',
  envelopesTrack: 'Left in envelopes',
  envelopesPlan: 'Set aside in envelopes',
  result: 'Free to Spend',
  laterFix:
    'To fix a balance later, correct the income day or the bill payment it came from.',
} as const;

export const GOAL_CHART_WORDS = {
  door: 'Balance over time',
  title: 'Balance over time',
  hidden: 'Show amounts to see the chart',
  key: 'Solid is what it has held. Dotted is where the plan takes it.',
  reaches: 'Reaches target',
} as const;

// Round 4, package G5.
/** Changes an item's History shows before "Show all". */
export const ITEM_HISTORY_PREVIEW = 6;

// Round 7, package B1.
/** What a moved payday does to the income days the person changed for themselves. */
export const MOVED_DAY_WORDS = {
  carried: (count: number, from: string, to: string) =>
    count === 1
      ? `What you changed for ${from} moves to ${to}.`
      : `What you changed for ${count} income days moves to their new dates.`,
  stranded: (count: number, from: string) =>
    count === 1
      ? `What you changed for ${from} has no new income day near it, so it stops applying.`
      : `What you changed for ${count} income days has no new date near it, so it stops applying.`,
} as const;

/** What happens to "Pay these first" when the item it pays has stopped. */
export const PAIRING_STOP_WORDS = {
  archived: 'Archived, so it gets nothing from this pay',
  ended: (date: string) => `Ended ${date}, so it gets nothing from this pay`,
  paused: 'Paused, so it gets nothing from this pay',
  stops: (names: readonly string[]) =>
    names.length === 1
      ? `${names[0]} stops paying it first, so that money stays with the pay.`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} stop paying it first, so that money stays with each pay.`,
} as const;

// Round 7, package G8: money that arrives different from the plan.
export const CONFIRM_FLOW_WORDS = {
  lessTitle: (amount: string) => `${amount} less than planned`,
  lessFromLeft: 'It comes out of what is left from this day.',
  lessGap: (gap: string) =>
    `The items on this day get ${gap} more than arrived.`,
  lessNothingLeft: 'Nothing was left from this day to take it.',
  moreTitle: (amount: string) => `${amount} more than planned`,
  moreBody:
    'Good to have. The extra is left from this day, so it adds to Free\u00a0to\u00a0spend.',
  coverCaption: 'Cover the difference',
  coverLead: 'Free\u00a0to\u00a0spend is',
  coverNone: (gap: string) =>
    `Free\u00a0to\u00a0spend has nothing to cover the ${gap} difference, so some items get less this time.`,
  coverAction: 'Cover it from Free\u00a0to\u00a0spend',
  coverPartAction: 'Use Free\u00a0to\u00a0spend for part',
  coveredAfter: 'Free\u00a0to\u00a0spend will be',
  undo: 'Undo',
  suggestCaption: 'What gets less',
  suggestIntro: 'Lowest priority first. Nothing changes until you choose.',
  suggestDetail: (planned: string) => `Planned ${planned}`,
  suggestMore: (count: number) =>
    `and ${count} more ${count === 1 ? 'item' : 'items'}`,
  useThese: 'Use these',
  changeEach: 'Change what each item gets',
  used: (count: number) =>
    `${count} ${count === 1 ? 'item gets' : 'items get'} less this time.`,
  eachItem: 'What each item gets',
  needsCover: (gap: string) =>
    `Items get ${gap} more than arrived. Cover it from Free\u00a0to\u00a0spend, or give some items less.`,
  needsCuts: (rest: string) =>
    `Items get ${rest} more than arrived. Give some items less this time.`,
  correctTooMuch: (amount: string) =>
    `Items get ${amount} more than arrived. Give some less, or raise the amount.`,
  findItem: 'Find an item',
  noItemMatch: 'No item matches that.',
  whyChanged: 'Why it changed',
  amountOf: (name: string) => `What ${name} gets`,
  coveredDay: 'Covered from Free to Spend',
} as const;

/** Confirm money arrived, round 7 review: the gap said once, and nothing that gives Free to Spend away while amounts are hidden. */
export const CONFIRM_COVER_WORDS = {
  coverAll: ', enough to cover it.',
  coverPart: ', which covers part of it.',
  coverHidden:
    'Free\u00a0to\u00a0spend can cover some or all of the difference.',
  coverHiddenAction: 'Use Free\u00a0to\u00a0spend',
  coveredLead: 'Covered',
  coveredTail: 'from Free\u00a0to\u00a0spend.',
  suggestInstead:
    'Or give some items less, lowest priority first. Nothing changes until you choose.',
  suggestRest:
    'For the rest, lowest priority first. Nothing changes until you choose.',
  needsCover:
    'Cover the difference from Free\u00a0to\u00a0spend, or give some items less.',
  needsCuts: 'Give some items less this time to confirm.',
  coverGone:
    'Free\u00a0to\u00a0spend is now less than you chose to cover. Choose again before you confirm.',
} as const;

/** A moved payday whose own choices could not follow it, round 7 review. */
export const CARRY_WORDS = {
  failedTitle: (count: number) =>
    count === 1
      ? '1 income day kept its old choices'
      : `${count} income days kept their old choices`,
  failedBody: (dates: string) =>
    `What you chose for ${dates} did not move to the new date. The change is saved; open the day to choose again.`,
} as const;

/** The one-line effect of a change when what is left from each day does not move, round 7 review. */
export const COMPACT_MOVE_WORDS = {
  movesTo: (from: string, to: string) => `${from} moves to ${to}.`,
  manyMove: (count: number, first: string) =>
    `${count} income days move, starting ${first}.`,
  oneChanges: (on: string) => `One income day changes, ${on}.`,
  manyChange: (count: number, first: string) =>
    `${count} income days change, starting ${first}.`,
  carriedWithIt: 'What you changed for that day goes with it.',
} as const;

// Round 7, package G9: a correction that leaves its day short offers the same cover and cuts as Confirm.
export const CORRECT_COVER_WORDS = {
  coverNoneHidden:
    'Free\u00a0to\u00a0spend has nothing to cover the difference, so some items get less this time.',
  shortTitle: (amount: string) => `${amount} short`,
  shortBody: 'The items on this day would get more than arrived.',
  shortBeyondCover: (covered: string) =>
    `That is beyond the ${covered} this day already covers from Free\u00a0to\u00a0spend.`,
  needsCuts: 'Give some items less this time to correct the day.',
  freeRow: 'Free\u00a0to\u00a0spend',
  now: 'Now',
  freeLead: 'Once this day gives back what it left, Free\u00a0to\u00a0spend is',
  coverGone:
    'Free\u00a0to\u00a0spend is now less than you chose to cover. Choose again before you correct the day.',
} as const;

/** Runway's Settings, round 7 package G9: its rows grouped under captions. */
export const SETTINGS_GROUP_WORDS = {
  planning: 'How the plan works',
  plan: 'Your plan',
  rangeNote:
    'A pay or bill with a range can plan at its own end instead. You choose that where you add it.',
} as const;

/** Round 7 package G9: archiving or ending an item that holds money asks what happens to it. */
export const HELD_WORDS = {
  caption: (amount: string) => `The ${amount} it holds`,
  freeTitle: 'Make it Free\u00a0to\u00a0spend',
  freeArchive: 'From today.',
  freeEnd: (date: string) => `From ${date}.`,
  keepTitle: 'Keep it held',
  keepBody: 'Until you release it.',
  blocker: 'Choose what happens to the money it holds.',
  release: 'Release what it holds',
  releaseNow: 'It becomes Free\u00a0to\u00a0spend.',
  releaseOn: (date: string) =>
    `It becomes Free\u00a0to\u00a0spend from ${date}.`,
  released: (name: string) => `What ${name} held is Free to Spend`,
  releaseFailed: (name: string) => `${name} was not changed`,
  undo: 'Undo',
  stoppedDivider: 'Stopped, still holding money',
  archived: 'Archived',
  ended: (date: string) => `Ended ${date}`,
  holds: 'Holds',
} as const;

/** Round 7 package G9: while amounts are hidden, one neutral door stands in for the plan's warnings. */
export const NEEDS_LOOK_WORDS = {
  title: 'Something needs a look',
  door: 'Show amounts to see it',
  short: 'Needs a look',
} as const;

/** Round 7b package F2: removing a Starting out entry that holds money asks where the money goes. */
export const START_HELD_WORDS = {
  removeAsk: (name: string) => `Remove ${name}?`,
  startOverAsk: 'Start over?',
  removeCaption: (amount: string) => `The ${amount} it holds`,
  startOverCaption: (amount: string, count: number) =>
    count === 1
      ? `One of them holds ${amount}`
      : `${count} of them hold ${amount}`,
  keepBody: 'Until you release it from its Plan view.',
  blocker: 'Choose what happens to the money it holds.',
  startOverBlocker: 'Choose what happens to the money they hold.',
  freeBody: 'From today.',
} as const;

/** Round 7b package F2: a cover already taken, when the difference has since grown. */
export const COVER_GROWN_WORDS = {
  grown: (gap: string) => `The difference is now ${gap}.`,
  grownHidden: 'The difference has grown since you covered it.',
  coverMore: (amount: string) => `Cover ${amount} instead`,
  coverMoreHidden: 'Cover the larger difference',
} as const;

/** Round 7b package F2: a release Undo that finds the item changed since. */
export const RELEASE_UNDO_WORDS = {
  notUndone: (name: string) => `${name} was not changed back`,
  changedSince:
    'It was changed after the release, maybe on another device, so nothing was undone. Open it again to see where it stands.',
} as const;

/** Round 7b package F2: a correction's short notice while amounts are hidden. */
export const CORRECT_HIDDEN_WORDS = {
  shortTitle: 'Short',
} as const;

/** Priorities: the order bills, envelopes and goals are funded in when money runs short. */
export const PRIORITIES_WORDS = {
  title: 'Priorities',
  allCovered: 'Every coming pay covers everything',
  noIncome: 'No income is coming, so nothing is being funded yet',
  checking: 'Checking your coming pays',
  shortOn: (day: string) => `The plan leaves items short on ${day}`,
  cutLine: (day: string) => `The ${day} pay runs out here`,
  shortWord: (short: string) => `${short} short`,
  shortWordTitle: 'What short means here',
  shortTip: (short: string) =>
    `The items below this line ask ${short} more than this pay holds, so the first may still get part of its amount. Envelopes and goals count here, not only bills.`,
  dueFirst: (day: string | null) =>
    day === null ? 'Due first' : `Due first · before ${day}`,
  dueFirstLabel: 'Due first',
  restLastLabel: 'Goes last',
  restLast: 'Gets what is left, so it goes last',
  fixedHidden: 'Fixed in place',
  searchPlaceholder: 'Search priorities',
  noMatch: 'Nothing matches that.',
  empty:
    'Bills, envelopes and goals you add show up here in the order they are funded.',
  reorder: 'Reorder',
  reorderHint: 'Tap an item, then tap where it goes, or use its arrows.',
  moving: (name: string) => `Moving ${name}`,
  cancelMove: 'Cancel move',
  topOf: (tier: string, neighbour: string) =>
    neighbour === '' ? `Top of ${tier}` : `Top of ${tier}, above ${neighbour}`,
  topOfAfterBills: (tier: string) => `Top of ${tier}, after bills due first`,
  endOf: (tier: string) => `End of ${tier}`,
  above: (name: string) => `Above ${name}`,
  below: (name: string) => `Below ${name}`,
  saveNote: 'Review shows what changes first.',
  gainsMore: (name: string, figure: string | null, when: string) =>
    figure === null
      ? `${name} gets more on ${when}`
      : `${name} gets ${figure} more on ${when}`,
  getsFigure: (name: string, figure: string | null, when: string) =>
    figure === null
      ? `${name} gets less on ${when}`
      : `${name} gets ${figure} on ${when}`,
  nextPays: (count: number) =>
    count === 1 ? 'the next pay' : `the next ${count} pays`,
  somePays: (count: number) => `${count} of the coming pays`,
  soonestSame: (day: string) => `The ${day} pay does not change.`,
  nothingChanges: 'Nothing changes on the coming pays.',
  nothingChangesNote:
    'The new order still applies whenever money runs short, so Save new order keeps it.',
  placed: (name: string, where: string) => `Moved ${name} ${where}`,
  placedTop: (tier: string) => `to the top of ${tier}`,
  placedEnd: (tier: string) => `to the end of ${tier}`,
  placedAbove: (name: string) => `above ${name}`,
  othersGetLess: (count: number) =>
    count === 1 ? 'One more item gets less.' : `${count} more items get less.`,
  nowBefore: (name: string, other: string) =>
    `${name} now comes before ${other}`,
  nowAfter: (name: string, other: string) => `${name} now comes after ${other}`,
  nowIn: (name: string, tier: string) => `${name} is now in ${tier}`,
  savedMany: 'Saved the new order',
  cancel: 'Cancel',
  save: 'Review new order',
  nothingMoved: 'Move an item to save a new order.',
  confirmTitle: 'Save this order?',
  confirmSave: 'Save new order',
  savedBar: 'New order saved',
  undo: 'Undo',
  restored: 'Order restored',
  restoredDetail: 'Your earlier order is back.',
  undid: (summary: string) => `Undid: ${summary}`,
  undoFailed: 'That did not undo. Your new order is still saved.',
  undoStale:
    'These items have been moved again since, so there is nothing to undo.',
  saveFailed: 'That did not save. Nothing was changed.',
  discardTitle: 'Discard the new order?',
  discardMessage: 'The items go back to where they were.',
} as const;

/** Banks offered as a quick pick when adding a card; any other is typed. */
export const CARD_ISSUERS = [
  'Chase',
  'Capital One',
  'Citi',
  'American Express',
  'Discover',
  'Bank of America',
  'Wells Fargo',
  'Apple Card',
] as const;

export const CARD_WORDS = {
  sectionTitle: 'Cards',
  add: 'Add a card',
  sheetTitle: 'Card',
  emptyTitle:
    'Add the cards you spend on. What you charge waits here until you pay the card.',
  waiting: 'Waiting to be paid',
  nothingToPay: 'Nothing to pay',
  reserveLabel: 'Waiting to be paid',
  payOff: (name: string) => `Pay off ${name.replace(/ (\S+)$/, '\u00a0$1')}`,
  payOffShort: 'Pay off',
  paidAhead: (amount: string) => `Paid ${amount} ahead`,
  allPaid: 'All paid',
  historyTitle: 'History',
  historyEmpty: 'Nothing has been charged or paid on this card yet.',
  historyCharged: (day: string) => `${day} · Charged`,
  historyRefunded: (day: string) => `${day} · Refunded to the card`,
  historyBill: (day: string) => `${day} · Bill charged`,
  historyPaid: 'Paid off',
  historyPaidFull: 'Paid in full',
  historyPaidMinimum: 'Paid the minimum',
  historyPaidPart: 'Paid part',
  historyOwes: (amount: string) => `Owes ${amount}`,
  historyTakenBack: 'Taken back',
  historyOlder: 'Earlier charges are counted but not listed.',
  historyUnknownBill: 'A bill',
  paymentTitle: 'Payment',
  takeBackAction: 'Take back this payment',
  takeBackTitle: 'Take back this payment?',
  takeBackText: (amount: string, day: string) =>
    `The ${amount} paid on ${day} goes back to waiting on the card, and your cash goes back up by the same.`,
  takeBackConfirm: 'Take it back',
  change: 'Change the card',
  archive: 'Archive',
  archiveSub: 'It stays in your history and leaves the list.',
  archiveWaitingText: (amount: string) =>
    `${amount} keeps waiting until you pay this card.`,
  archiveConfirmTitle: (name: string) => `Archive ${name}`,
  archiveConfirmText: 'Archive',
  archived: (name: string) => `${name} archived`,
  archiveFailed: 'The card was not archived',
  issuerTitle: 'Who issues it?',
  issuerLabel: 'Issuer',
  anotherBank: 'Another bank',
  otherBankPlaceholder: 'Bank name',
  nameTitle: 'What is the card called?',
  nameLabel: 'Name',
  namePlaceholder: 'Venture X',
  noName: 'It has no name',
  noNameValue: 'No name',
  nameSecond: (issuer: string) =>
    `You have another ${issuer} card; give this one a name.`,
  owesTitle: 'What does it owe right now?',
  owesLabel: 'Owes now',
  owesHint: 'What you charged before you started using Runway.',
  nothingYet: 'Nothing yet',
  needsIssuer: 'Say who issues it.',
  needsName: 'Give it a name, or say it has none.',
  saveAdd: 'Add card',
  save: 'Save',
  added: (name: string) => `${name} added`,
  saved: (name: string) => `${name} saved`,
  offline: 'This needs a connection. Nothing was changed.',
  failed: 'This did not save. Nothing was changed.',
  discardNew: 'card',
  payAmount: 'Amount paid',
  payDay: 'Paid',
  payAction: 'Pay off',
  payMore: (amount: string) =>
    `That is ${amount} more than it waits for. The extra comes out of Free to Spend.`,
  paidToast: (amount: string, name: string) => `Paid ${amount} to ${name}`,
  paidMinimumToast: (name: string) => `Paid the minimum on ${name}`,
  paidFullToast: (name: string) => `Paid ${name} in full`,
  minimumChip: 'This is the minimum payment',
  undo: 'Undo',
  undone: (name: string) => `Payment to ${name} taken back`,
  payFailed: 'The payment was not saved',
  undoFailed: 'The payment was not taken back',
  needsAmount: 'Enter how much you paid.',
  needsDay: 'Pick today or an earlier day.',
  paidBy: 'Paid by',
  paidByTitle: 'What did you pay with?',
  cashOrDebit: 'Cash or debit',
  addsOwed: (name: string, amount: string) =>
    `Adds ${amount} to what you owe on ${name}.`,
  addsOwedMore: (name: string, amount: string) =>
    `Adds ${amount} more to what you owe on ${name}.`,
  addsOwedLess: (name: string, amount: string) =>
    `Takes ${amount} off what you owe on ${name}.`,
  usualCard: (envelope: string) => `What you usually use for ${envelope}`,
  loading: 'Getting what each card waits for.',
  chargedTo: (card: string) => `Charged to ${card}`,
  comingDueTitle: 'Coming due',
  comingDueOne: '1 card due',
  comingDueMany: (count: number) => `${count} cards due`,
  historyStart: 'Owed when tracking started',
  beforeTracking: (day: string) => `Pick ${day} or a later day.`,
  markedAllWith: (cards: string) => `Charged to ${cards}.`,
  markedPaidWith: (bill: string, card: string) =>
    `Marked ${bill} paid with ${card}`,
  freeWaiting: 'Waiting to be paid on cards',
  freeWaitingHelp:
    "Charged to your cards and not paid yet. It's set aside now, so paying a card doesn't change Free to Spend.",
  freeOnHandHelp:
    "Your cash. A card purchase doesn't lower it until you pay the card.",
  dueTitle: 'What day is it due each month?',
  dueLabel: 'Due',
  dueSummaryDay: (day: number, ordinal: string) =>
    day === 31 ? 'the last day' : `the ${ordinal}`,
  noDueDay: 'No due day',
  needsDue: 'Pick a day, or say it has none.',
  dueOn: (date: string) => `Due ${date}`,
  dueInDays: (days: number) =>
    days === 1 ? 'Due tomorrow' : `Due in ${days} days`,
  dueToday: 'Due today',
  homeTitle: 'Cards',
  homeSeeAll: 'See all',
  dueWarning: (name: string, date: string, amount: string) =>
    `${name} is due ${date} · ${amount} waiting`,
  dueTodayWarning: (name: string, amount: string) =>
    `${name} is due today · ${amount} waiting`,
  dueWarningOpen: 'Pay it off',
  dueWarningPast: (name: string, date: string, amount: string) =>
    `${name} was due ${date} · ${amount} waiting`,
  notPaidBy: (date: string) => `Not paid by ${date}`,
  pastDueSince: (date: string) => `Past due since ${date}`,
  dueRolled: (due: string, since: string) =>
    `Due ${due} · not paid by ${since}`,
  changeAdded: (name: string, owed: string | null) =>
    owed === null ? `Added ${name}` : `Added ${name}, owing ${owed}`,
  changeChanged: (name: string, what: string) => `Changed ${name}: ${what}`,
  changeIssuer: (from: string, to: string) => `issuer ${from} to ${to}`,
  changeName: (from: string, to: string) => `name ${from} to ${to}`,
  changeNoName: 'no name',
  changeDueDay: (from: string, to: string) => `due day ${from} to ${to}`,
  changeNoDueDay: 'no due day',
  changeArchived: (name: string) => `Archived ${name}`,
  changePaid: (
    covers: 'full' | 'minimum' | 'part',
    name: string,
    amount: string,
    day: string,
  ) =>
    covers === 'minimum'
      ? `Paid the minimum on ${name}, ${amount}, on ${day}`
      : covers === 'full'
        ? `Paid ${name} in full, ${amount}, on ${day}`
        : `Paid ${amount} to ${name} on ${day}`,
  changeTakenBack: (name: string, amount: string, day: string) =>
    `Took back the ${amount} payment to ${name} from ${day}`,
} as const;
