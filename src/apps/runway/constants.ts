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
  'plan',
] as const satisfies readonly RunwayTab[];

export const DEFAULT_RUNWAY_TAB: RunwayTab = 'home';

export const RUNWAY_TAB_LABELS: Record<RunwayTab, string> = {
  home: 'Home',
  days: 'Days',
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
export const MORE_ENTRIES = ['settings'] as const;

export const MORE_ENTRY_LABELS: Record<(typeof MORE_ENTRIES)[number], string> =
  { settings: 'Settings' };

export const MORE_ENTRY_HELP: Record<(typeof MORE_ENTRIES)[number], string> = {
  settings: 'How the plan reads a range of pay or a bill.',
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
/** The kinds of ledger entry the client writes; a bill marked paid, and its undo (a `billPaid` that names the one it reverses). */
export const MOVE_KINDS = ['billPaid'] as const;
/** The most checklist ticks a day keeps; the rules cap the list at the same size. */
export const MAX_DONE_LINE_IDS = 200;
/** How far back the Days list and the confirmed-day records are read. */
export const RECENT_DAYS_WINDOW = 180;
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
  extraTo: 'The extra goes to Free to spend.',
  shortFrom: 'The shortfall comes out of Free to spend.',
  sameAsExpected: 'The same as the draft expected.',
  needsAmount: 'Enter the amount that arrived.',
  needsDate: 'Pick the date it arrived.',
  holds: 'Choose for each held line first.',
  linesTakeTooMuch:
    'The lines take more than arrived. Lower a line or raise the amount.',
  needsLineAmount: 'Enter an amount for each line you changed.',
  adjustLines: 'Adjust the lines',
  adjustIntro: 'Change what a line gets. Free to spend is what is left.',
  lowestFirst: 'Take from the lowest priority first',
  resetLines: 'Back to the draft',
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
  unchanged: 'Everything else matched the draft.',
  missingRecords: 'The record of this day could not be read.',
} as const;

export const CORRECT_WORDS = {
  door: 'Correct this day',
  doorHint: 'Fix an amount you confirmed. The original stays on record.',
  sheetTitle: 'Correct this day',
  intro:
    'Change what arrived or what a line got. Free to spend is what is left.',
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
  outOfMoney: "This day's money ran out first",
  restEmpty: "Nothing was left of this day's money for the rest",
  restAsk: 'The rest',
  percentOf: 'of',
  nothingFunded: 'Nothing funded',
  fundedOf: 'Funded',
  of: 'of',
  notFunded: 'Not funded',
  freeToSpend: 'Free to spend',
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
  useThePlan: 'Use the plan again',
  fundsHeading: 'Funds',
  fundsNone: 'Nothing set aside yet',
} as const;

export const PACE_WORDS = {
  rest: 'Takes what is left of each funded day, so there is no fixed pace.',
} as const;

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
