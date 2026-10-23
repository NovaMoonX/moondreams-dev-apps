import type { RunwayTab } from '@apps/runway/types';

export const PLAN_SECTIONS = ['income', 'envelopes'] as const;

export const DEFAULT_PLAN_SECTION = 'income' as const;

export const PLAN_SECTION_LABELS: Record<
  (typeof PLAN_SECTIONS)[number],
  string
> = { income: 'Income', envelopes: 'Envelopes' };

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
export const MAX_CHOSEN_DAYS = 60;
export const MAX_EMOJI_LENGTH = 8;
