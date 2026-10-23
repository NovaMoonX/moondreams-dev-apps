import type { RunwayTab } from '@apps/runway/types';

export const PLAN_SECTIONS = ['income', 'bills', 'envelopes', 'goals'] as const;

export const DEFAULT_PLAN_SECTION = 'income' as const;

export const PLAN_SECTION_LABELS: Record<
  (typeof PLAN_SECTIONS)[number],
  string
> = {
  income: 'Income',
  bills: 'Bills',
  envelopes: 'Envelopes',
  goals: 'Goals',
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
export const DRAFT_REASON_CODES = ['funded', 'poolExhausted', 'nothingLeft'] as const;

/** The key that decided which of two otherwise equal demands went first. */
export const DRAFT_TIE_KEYS = ['createdAt', 'itemId'] as const;

export const DRAFT_CADENCE_WORDS: Record<
  (typeof FUNDING_CADENCES)[number] | (typeof BILL_DRAFT_CADENCES)[number],
  string
> = {
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
