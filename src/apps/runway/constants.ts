import { declareSealedFormDrafts } from '@lib/app/formDrafts';
import { formatList } from '@/utils/formatUtils';
import type { RunwayTab } from '@apps/runway/types';

export const PLAN_SECTIONS = [
  'income',
  'bills',
  'envelopes',
  'goals',
  'horizon',
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
  horizon: 'Horizon',
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
export const MORE_ENTRIES = [
  'priorities',
  'accounts',
  'settings',
  'changeLog',
] as const;

/** The full screens Home opens, kept in the URL as `view`. */
export const RUNWAY_VIEWS = [
  'start',
  'freeToSpend',
  'checkAmount',
  'checkBalance',
  'cashPosition',
  'heldBills',
  'heldGoals',
  'heldEnvelopes',
  'heldHorizon',
  'heldCards',
  'needsHome',
  'accountMoves',
  'rules',
] as const;

/** The screens Settings opens, kept in the URL as `settingsView`. */
export const SETTINGS_VIEWS = ['tracking', 'notifications', 'delete'] as const;

export const MORE_ENTRY_LABELS: Record<(typeof MORE_ENTRIES)[number], string> =
  {
    priorities: 'Priorities',
    accounts: 'Accounts',
    settings: 'Settings',
    changeLog: 'Change log',
  };

export const MORE_ENTRY_HELP: Record<(typeof MORE_ENTRIES)[number], string> = {
  priorities: 'Which items get their money first when it runs short.',
  accounts: 'Where your money is held, and what each account holds.',
  settings:
    'How the plan reads a range of pay or a bill, whether you track spending, and opening it offline.',
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
    paymentChange: 'Payment',
    accountChange: 'Account',
  };

export const RANGE_END_WORDS = {
  low: 'the low end',
  middle: 'the middle',
  high: 'the high end',
} as const;

export const SEALED_SCHEMA_VERSION = 1;
/** Every Runway form draft's key starts with it; declared sealed here, where every form gets it from, so no draft is ever kept readable. */
export const FORM_DRAFT_PREFIX = 'runway:';
declareSealedFormDrafts(FORM_DRAFT_PREFIX);

/** The forms a kept draft can reopen from Home, keyed by the draft's full key; edit, pay-card and starting-amounts drafts are not offered. */
export const DRAFT_PICK_UP_KINDS = [
  'bill',
  'expense',
  'envelope',
  'goal',
  'income',
  'expectedIncome',
  'card',
  'purchase',
] as const;

/** The pick-up kinds whose form opens on another tab, carried there in the address; a purchase opens on Home itself. */
export const ADD_REQUEST_KINDS = DRAFT_PICK_UP_KINDS.filter(
  (kind): kind is Exclude<(typeof DRAFT_PICK_UP_KINDS)[number], 'purchase'> =>
    kind !== 'purchase',
);

export const DRAFT_PICK_UP_KEYS: Record<
  string,
  (typeof DRAFT_PICK_UP_KINDS)[number]
> = {
  [`${FORM_DRAFT_PREFIX}bill:new`]: 'bill',
  [`${FORM_DRAFT_PREFIX}expense:new`]: 'expense',
  [`${FORM_DRAFT_PREFIX}envelope:new`]: 'envelope',
  [`${FORM_DRAFT_PREFIX}goal:new`]: 'goal',
  [`${FORM_DRAFT_PREFIX}income:new:any`]: 'income',
  [`${FORM_DRAFT_PREFIX}income:new:once`]: 'expectedIncome',
  [`${FORM_DRAFT_PREFIX}card:new`]: 'card',
  [`${FORM_DRAFT_PREFIX}purchase:new`]: 'purchase',
};

export const DRAFT_PICK_UP_WORDS = {
  title: (noun: string) => `Pick up your unsaved ${noun}?`,
  dismiss: 'Not now',
  nouns: {
    bill: 'bill',
    expense: 'expense',
    envelope: 'envelope',
    goal: 'goal',
    income: 'income',
    expectedIncome: 'income',
    card: 'card',
    purchase: 'purchase',
  },
} as const;

export const DEFAULT_CURRENCY_CODE = 'USD';

export const ITEM_KINDS = [
  'source',
  'payLine',
  'bill',
  'envelope',
  'goal',
  'group',
  'horizon',
] as const;

export const SCHEDULE_KINDS = [
  'weekly',
  'everyOtherWeek',
  'twiceMonthly',
  'monthly',
  'everyMonths',
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
  'paymentChange',
  'accountChange',
] as const;

export const SCHEDULE_LABELS: Record<(typeof SCHEDULE_KINDS)[number], string> =
  {
    weekly: 'Every week',
    everyOtherWeek: 'Every other week',
    twiceMonthly: 'Twice a month',
    monthly: 'Monthly',
    everyMonths: 'Every few months',
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
export const MAX_HORIZON_COSTS = 20;

/** What a Horizon item's costs fall back on once the money put toward it runs out. */
export const HORIZON_REST = ['pays', 'onePay', 'outside', 'later'] as const;

export const HORIZON_REST_OPTIONS: readonly {
  value: (typeof HORIZON_REST)[number];
  label: string;
  meaning: string;
}[] = [
  {
    value: 'pays',
    label: 'My pays before each cost is due',
    meaning: "Each pay before a cost sets aside a share of what's left.",
  },
  {
    value: 'onePay',
    label: 'One pay I pick',
    meaning: "One pay you pick sets aside all that's left.",
  },
  {
    value: 'outside',
    label: 'Outside the plan',
    meaning: "You'll cover the rest yourself. Runway won't ask for it.",
  },
  {
    value: 'later',
    label: "I'll decide later",
    meaning: 'Runway asks for nothing yet, and warns you if it runs short.',
  },
];

/** Cost names offered under "What is it?", keyed on simple words in the item's name. */
export const HORIZON_COST_SUGGESTIONS: readonly {
  words: readonly string[];
  suggestions: readonly string[];
}[] = [
  {
    words: ['moving', 'move'],
    suggestions: [
      'Movers',
      'Truck rental',
      'Storage unit',
      'Deposit',
      'Cleaning',
    ],
  },
  {
    words: ['surgery', 'vet'],
    suggestions: ['Surgery', 'Follow-up visit', 'Medication', 'Boarding'],
  },
  {
    words: ['wedding'],
    suggestions: ['Venue', 'Catering', 'Flowers', 'Attire', 'Photographer'],
  },
];

/** How many of the coming pays have room: "Only 2 of your 8 pays have room", "None of your 8 pays have room". */
const getPaysRoom = (roomCount: number, payCount: number) =>
  payCount === 1
    ? 'Your pay has no room'
    : roomCount === 0
      ? `None of your ${payCount} pays have room`
      : `Only ${roomCount} of your ${payCount} pays ${roomCount === 1 ? 'has' : 'have'} room`;

/** Headings that section a pick or search list by the kind of thing, in the order the kinds are shown. */
export const PICK_KIND_HEADINGS = {
  income: 'Income',
  bill: 'Bills',
  envelope: 'Envelopes',
  goal: 'Goals',
} as const;

export const HORIZON_WORDS = {
  title: 'Horizon',
  addLabel: 'Add to your horizon',
  formTitle: 'Add to your horizon',
  discardNoun: 'item',
  discardCostNoun: 'cost',
  emptyTitle: "Plan what's coming",
  emptyBody:
    "A move, a wedding, a surgery: list what it will cost and how you'll pay for it.",
  loading: 'Getting your horizon.',
  searchPlaceholder: 'Search your horizon',
  noMatch: 'Nothing on your horizon matches that.',
  nothingDue: 'Nothing due yet',
  costLineName: (cost: string, item: string) => `${cost}\u00A0· ${item}`,
  costLineDetail: (item: string, tail: string) => `${item}\u00A0· ${tail}`,
  costFallback: 'Cost',
  due: (name: string, date: string) => `${name}\u00A0·\u00A0due\u00A0${date}`,
  totalCost: 'Total cost',
  costCount: (count: number) => `${count} costs`,
  costsCaption: 'Costs',
  nameTitle: "What's on your horizon?",
  name: 'Name',
  namePlaceholder: 'Moving',
  addEmoji: 'Add an emoji',
  whenTitle: 'When is it?',
  when: 'When',
  around: (date: string) => `Around\u00A0${date}`,
  aroundRange: (range: string) => `Around\u00A0${range}`,
  fewDays: "It's a few days",
  oneDay: 'Just one day',
  startLabel: 'From',
  endLabel: 'To',
  endBeforeStart: 'The end comes before the start.',
  costsTitle: 'What will it cost?',
  costs: 'Costs',
  noCosts:
    'Nothing listed yet. An event can also be only changes to your plan.',
  noCostsSummary: 'No costs, only changes',
  changesCaption: 'What changes',
  planChange: 'Plan a change',
  planChangeTitle: 'Which one changes?',
  planChangeSearch: 'Search your plan',
  planChangeNone: 'Nothing in your plan to change yet.',
  happened: 'Happened',
  pickPay: 'Pay',
  pickBill: 'Bill',
  pickEnvelope: 'Envelope',
  pickGoal: 'Goal',
  planChangeNoMatch: 'Nothing in your plan matches that.',
  changeFrom: (from: string) => `From\u00A0${from}`,
  changeHappened: (on: string) => `Happened\u00A0${on}`,
  changeNoLonger: 'No longer planned',
  linkEnds: 'Ends',
  linkStarts: 'Starts',
  changeLine: (item: string, what: string, when: string) =>
    [item, what, when].filter(Boolean).join('\u00A0\u00b7 '),
  unlinkTitle: 'Linked change',
  unlinkRow: (event: string) => `Unlink from ${event}`,
  unlinkNote:
    'The change stays in your plan. It is only no longer listed under this event.',
  unlinkFailed: 'This did not unlink. Nothing was changed.',
  changesCount: (count: number) =>
    `${count} planned ${count === 1 ? 'change' : 'changes'}`,
  noChangesYet: 'No changes planned yet',
  changesHappened: 'All its changes happened',
  addCost: 'Add a cost',
  changeCost: (name: string) => `Change ${name}`,
  payMoved: 'This pay has already moved.',
  removeThisCost: 'Remove this cost',
  saveCost: 'Save cost',
  maxCosts: (count: number) => `An item holds up to ${count} costs.`,
  maxCostsTitle: 'That is the most costs',
  needsName: 'Name it.',
  priority: 'Priority',
  add: (name: string) => `Add ${name}`,
  addFailed: 'This did not save. Nothing was changed.',
  costFormTitle: 'Add a cost',
  costAmountTitle: 'How much will it cost?',
  costAmount: 'Amount',
  costNameTitle: 'What is it?',
  costName: 'Name',
  costNamePlaceholder: 'Name it',
  costSuggestions: 'Common costs',
  costWhenTitle: 'When?',
  costWhen: 'When',
  costDateHint: 'The day it is due.',
  costFirstDateHint: 'The day of the first payment.',
  costOnceSummary: (date: string) => `Once, ${date}`,
  costRepeatSummary: (repeat: string, from: string) => `${repeat} from ${from}`,
  costFrom: (from: string) => `From ${from}`,
  costEndsOn: (date: string) => ` to ${date}`,
  costEndsAfter: (count: number) =>
    count === 1 ? ', once' : `, ${count}\u00A0times`,
  costLastPayment: 'Last payment on',
  costPaymentCount: 'How many payments?',
  costPaymentCountHint: 'How many payments, like 6',
  costPerWeek: 'a week',
  costPerOtherWeek: 'every 2 weeks',
  costPerMonth: 'a month',
  costPerYear: 'a year',
  needsCostEnding: 'Finish when it ends.',
  needsCostName: 'Name the cost.',
  needsCostDate: 'Pick a day within the next year that has not passed.',
  addCostNamed: (name: string) => `Add ${name}`,
  costOutside: 'Paid outside the plan',
  costPaidTitle: "How it's paid",
  costPaidLabel: "How it's paid",
  costPaidLike: (name: string) => `Like the rest of ${name}`,
  costPriorityDiffers: (
    itemName: string,
    itemPriority: string,
    costPriority: string,
  ) => `${itemName} is a ${itemPriority}; this cost will be a ${costPriority}.`,
  costPrioritySummary: (
    costPriority: string,
    itemName: string,
    itemPriority: string,
  ) => `${costPriority} · ${itemName} is a ${itemPriority}`,
  costOutsideHint:
    'Stays on your list. Runway never sets money aside for it or warns you about it.',
  outsideTag: 'Outside the plan',
  putTitle: 'Put money toward it now?',
  putAmount: 'Amount',
  putFrom: 'Take it from',
  putFromFree: 'From Free to Spend',
  putFromPlace: 'From an envelope or goal',
  putPlaces: 'Envelopes and goals',
  putNotNow: 'Not now',
  putSummary: (amount: string, from: string) => `${amount} from ${from}`,
  putFreeName: 'Free to Spend',
  needsPutAmount: 'Enter how much to put toward it.',
  needsPutFrom: 'Pick where it comes from.',
  needsPutPlace: 'Pick the envelope or goal.',
  putTooMuch: (from: string) => `That is more than ${from} has.`,
  putAdded: (amount: string, from: string, name: string) =>
    `Put ${amount} toward ${name} from ${from}.`,
  putUndone: (amount: string, name: string, from: string) =>
    `Took ${amount} back out of ${name} to ${from}`,
  restTitle: 'Where does the rest come from?',
  rest: 'The rest',
  needsRest: 'Pick where the rest comes from.',
  onePayTitle: 'Which pay?',
  onePayCapped: "Later pays aren't listed.",
  takeFromPaysShort: (
    carried: string,
    asked: string,
    left: string,
    roomCount: number,
    payCount: number,
  ) =>
    roomCount === payCount
      ? `${payCount === 1 ? 'Your pay carries' : 'These pays carry'} ${carried} of the ${asked}. ${left} stays short.`
      : roomCount === 0
        ? `${getPaysRoom(roomCount, payCount)}. ${left} stays short.`
        : `${getPaysRoom(roomCount, payCount)}: ${roomCount === 1 ? 'it carries' : 'they carry'} ${carried} of the ${asked}. ${left} stays short.`,
  onePayLabel: (date: string, name: string) => `${date} ·\u00A0${name}`,
  noPays: 'No pay is coming up to pick.',
  needsPay: 'Pick the pay that carries it.',
  restOnePaySummary: (date: string) => `The ${date} pay`,
  effectNone: 'No pay moves.',
  lineDue: (date: string) => `due\u00A0${date}`,
  lineBack: 'Back to Free to Spend',
  lineBackSheet: (cost: string, date: string) =>
    `${cost} came due on ${date} and was paid from Free to Spend. This pay puts it back.`,
  lineWhyPays: (cost: string, total: string, date: string, count: number) =>
    `${cost} is ${total}, due ${date}. ${count > 1 ? `Your ${count} pays before it each put in a share` : 'Your pay before it puts in its share'}; higher priorities are funded first.`,
  lineWhyOnePay: (cost: string, total: string, date: string) =>
    `${cost} is ${total}, due ${date}. You picked this pay to carry it.`,
  lineWhyLater: (cost: string, total: string, date: string) =>
    `${cost} is ${total}, due ${date}. After the pay you picked, your pays before ${date} each put in a share.`,
  costActionSub: (date: string) =>
    `Your other pays before ${date} make up the rest`,
  costActionSubOnePay: 'What it leaves out stays short',
  openItem: (name: string) => `Open ${name}`,
  openItemSub: 'Its costs and where the rest comes from',
  costShareTitle: (cost: string) =>
    `How much should this pay put toward ${cost}?`,
  costShareCapped: (cost: string, needs: string) =>
    `${cost} needs ${needs} more, so that is the most this pay can put in.`,
  costShareSummary: (cost: string, item: string, cents: string, date: string) =>
    `${item}, ${cost}: this pay puts in ${cents}, for ${date} only.`,
  costShareResetSummary: (cost: string, item: string, date: string) =>
    `${item}, ${cost}: this pay goes back to the plan's amount, for ${date} only.`,
  costShareToast: (cost: string) => `Changed what this pay puts toward ${cost}`,
  takeFromPays: 'Take from my pays',
  takeFromPaysTitle: 'Take the rest from your pays?',
  takeFromPaysMoved:
    'This changed while you had it open. Open it again to take it from your pays.',
  takeFromPaysUndoMoved: 'It was changed again since, so nothing was undone.',
  takeFromPaysSummary: (name: string) =>
    `${name}: the rest now comes from my pays before each cost is due.`,
  takeFromPaysBackSummary: (name: string) =>
    `${name}: the rest goes back to how it was.`,
  takeFromPaysDone: (name: string) => `${name} now comes from your pays`,
  takeFromPaysConfirm: 'Take from my pays',
  plannedTotal: (amount: string, isUpTo: boolean, isAfterLead: boolean) =>
    `${isUpTo ? (isAfterLead ? 'up\u00A0to\u00A0' : 'Up\u00A0to\u00A0') : ''}${amount}\u00A0planned`,
  overNextYear: 'Over\u00A0the\u00A0next\u00A0year:',
  setAside: 'Set aside',
  spent: 'Spent',
  left: 'Left',
  leftFact: (setAside: string, spent: string, fromFree: string | null) =>
    `${setAside} set aside, ${spent} spent${fromFree ? `, ${fromFree} of it from Free to Spend` : ''}`,
  shortTitle: (amount: string, date: string, more: string | null) =>
    `${amount} short on ${date}${more ? `, ${more} more after` : ''}`,
  shortBody: (
    cost: string,
    planned: string,
    available: string,
    isAfterEarlier: boolean,
    endWords: string | null,
  ) =>
    `${cost} is planned at ${endWords ? `${endWords}, ` : ''}${planned}, more than the ${available} ${isAfterEarlier ? 'left for it' : 'set aside'}.`,
  shortNothing: (name: string) => `Nothing is set aside for ${name} yet.`,
  shortAfter: (cost: string, earlier: string) =>
    `Nothing is left for ${cost} after ${earlier}.`,
  outsideLead: 'Outside the plan:',
  outsideTotal: (amount: string) => `${amount}\u00A0paid`,
  outsideDue: (amount: string) => `${amount} still\u00A0to\u00A0pay`,
  needsAShortLook: 'Needs a look',
  putHolds: (name: string, amount: string) => `${name} has ${amount}`,
  needsPutOrNotNow: 'Pick where it comes from, or Not now.',
  restOutsideNote: 'The rest is on you, outside the plan.',
  restPaysNote: 'The rest comes from your pays before each cost is due.',
  restOnePayNote: (date: string) => `The rest comes from the ${date} pay.`,
  putMore: 'Put more toward it',
  putMoreSub: 'Add money from Free to Spend, an envelope or goal, or outside.',
  putMoreTitle: 'Put more toward it',
  putMorePlaces: 'Places',
  putMoreEmpty: 'Add money',
  putShowToCheck: (from: string) => `Show amounts to check what ${from} has.`,
  putMoreAmount: 'Amount to put toward it',
  putMoreFrom: 'Where it comes from',
  putMoreOutside: 'Outside the plan',
  putOutsideName: 'outside the plan',
  putMoreAction: (amount: string) => `Put ${amount} toward it`,
  putMoreDone: (amount: string, name: string) => `Put ${amount} toward ${name}`,
  needsPutMoreFrom: 'Pick where it comes from.',
  changeItem: 'Change it',
  changeItemSub: 'Name, emoji, date, how the rest is paid and priority',
  costDue: (date: string) => `Due\u00A0${date}`,
  costDueLower: (date: string) => `due\u00A0${date}`,
  costFact: (
    when: string,
    pricedOn: string | null,
    isOutside = false,
    priority: string | null = null,
    isLeftOut = false,
  ) =>
    [
      when,
      priority !== null && `counted as a ${priority}`,
      isLeftOut && PRIORITY_DIAL_WORDS.notCounted.toLowerCase(),
      isOutside &&
        HORIZON_WORDS.outsideTag.toLowerCase().replaceAll(' ', '\u00A0'),
      pricedOn !== null && `priced ${pricedOn}`,
    ]
      .filter(Boolean)
      .join('\u00A0· '),
  setPrice: 'Set the price',
  setPriceSub: 'An exact amount, or still a range',
  setPriceSubExact: (amount: string) =>
    `It's ${amount} now. Change it or make it a range`,
  setPriceTitle: (name: string) => `What will ${name} cost?`,
  setPriceSave: 'Set the price',
  priceExactTitle: 'An exact amount',
  priceExactBody: 'One price, quoted or known.',
  priceRangeTitle: 'Still a range',
  priceRangeBody: 'A low and a high end.',
  pickPriceWay: 'Pick an exact amount or still a range.',
  priceHint: (range: string) => `Planned at ${range} now`,
  samePrice: "That's the price already.",
  effectBefore: 'Now',
  effectAfter: 'After this change',
  changeCostRow: 'Change',
  changeCostSub: "Name, date, how it's paid and priority",
  removeCostRow: 'Remove this cost',
  removeCostSub: 'It leaves the list and the plan',
  removeConfirmTitle: (name: string) => `Remove ${name}?`,
  removeConfirmText: (name: string, timing: string, item: string) =>
    `${name}, ${timing}, comes off ${item}. Its removal stays in History.`,
  removeConfirm: 'Remove cost',
  removeSummary: (item: string, cost: string, timing: string, from: string) =>
    `${item}: removed ${cost}, ${timing}, from ${from}.`,
  restoreSummary: (item: string, cost: string, timing: string, from: string) =>
    `${item}: restored ${cost}, ${timing}, from ${from}.`,
  restoreGone: "It's already back, so nothing was changed.",
  restoreFailed: 'This did not save. Nothing was changed.',
  removedToast: (name: string) => `Removed ${name}`,
  changeAdded: (name: string, amount: string, when: string) =>
    `added ${name} ${amount}, ${when}`,
  changeRemoved: (name: string) => `removed ${name}`,
  changeMoved: (name: string, from: string, to: string) =>
    `${name} from ${from} to ${to}`,
  changeFromTo: (name: string, from: string, to: string) =>
    `${name} ${from} to ${to}`,
  removeFailed: 'This did not save. Nothing was changed.',
  removeGone: 'This cost was already changed. Open it again.',
  changeItemTitle: 'Change it',
  covers: {
    allPaidOrBill: 'Everything is paid or a bill',
    nothingSet: 'Nothing is set aside yet, so nothing is covered.',
    setAsideUsed: 'What was set aside is spent.',
    none: "What's set aside doesn't cover a whole cost yet.",
    all: 'Covers every cost.',
    listed: (list: string, atEnd: string) => `Covers ${list}${atEnd}.`,
    through: (name: string, date: string) => `${name} through ${date}`,
    atEnd: (endWords: string) => ` at ${endWords}`,
    on: (name: string, date: string) => `${name} on ${date}`,
    more: (count: number) => `${count} more`,
    helpTitle: 'About the range',
    helpRange: (name: string, low: string, high: string, end: string) =>
      `${name} could be ${low} to ${high}. Runway plans it at ${end}.`,
  },
} as const;

/** Make it a bill: a repeating cost handed to a bill of its own, with the money it holds. */
export const MAKE_BILL_WORDS = {
  row: 'Make it a bill',
  rowSub: 'Runway funds it from your pays like any bill',
  title: (cost: string) => `Make ${cost} a bill`,
  primary: 'Make it a bill',
  nowABill: 'Now a bill',
  nowABillSub: 'It is a bill now, funded from your pays',
  nowABillFact: (date: string) => `Now a bill, from ${date}`,
  firstDueDetail: "The cost's next unpaid payment",
  lockedTitle: 'Make it a bill has to wait',
  lockedWhy:
    "A bill starts from this cost's next unpaid payment, so each payment before it is settled first and none is counted twice.",
  openBill: (cost: string) => `Open ${cost} in Bills`,
  bringTitle: (item: string, money: string) =>
    `Bring ${item}'s ${money} with it?`,
  bringLabel: 'Money from the event',
  yesCovers: (dates: string) => `Yes, it covers ${dates}`,
  yesPart: (date: string) => `Yes, it goes toward ${date}`,
  madeFrom: (item: string, cost: string) => `Made from ${cost} in ${item}`,
  covers: (item: string, money: string, dates: string) =>
    `${item}'s ${money} covers ${dates}`,
  yesBody: (money: string, bill: string) => `${money} moves to ${bill}`,
  noLeave: (item: string) => `No, leave it with ${item}`,
  noLeaveBody: (item: string, money: string) => `${item} keeps ${money}`,
  noFree: 'No, make it Free to Spend',
  noFreeBody: (money: string) => `${money} goes to Free to Spend`,
  pickBring: 'Pick whether the money comes with it.',
  moreDates: (count: number) => `${count} more`,
  made: (bill: string, money: string | null) =>
    money === null
      ? `${bill} is a bill now`
      : `${bill} is a bill now, holding ${money}`,
  madeFree: (bill: string, item: string, money: string) =>
    `${bill} is a bill now, and ${item}'s ${money} is Free to Spend`,
  failed: 'This did not save. Nothing was changed.',
  alreadyDone: 'This cost is already a bill. Open it again.',
  changed: 'This cost changed. Open it again.',
  firstDue: 'First due date',
  lockedLaterPaid: (date: string) => `Take back the ${date} payment first`,
  lockedPastDue: (date: string) => `Pay or mark the ${date} payment first`,
  summary: (item: string, cost: string, amount: string, timing: string) =>
    `${item}: ${cost} became a bill, ${amount}. ${timing}.`,
  summaryBrought: (money: string, item: string) =>
    `Brought ${money} from ${item}.`,
  summaryFree: (money: string, item: string) =>
    `Gave ${item}'s ${money} to Free to Spend.`,
} as const;

const listNamesAndMore = (names: readonly string[], more: number) =>
  more > 0 ? `${names.join(', ')} and ${more} more` : names.join(' and ');

/** Planning a goal or an envelope on the Horizon: which event, linking a goal, moving an envelope in, and the nudge. */
export const HORIZON_PLAN_WORDS = {
  door: 'Plan it on your Horizon',
  goalDoorSub: 'Add what it is for as an event',
  envelopeDoorSub: 'Move its money into an event',
  title: 'Which event?',
  newEvent: 'New event',
  newEventSubGoal: (goal: string) => `Starts with ${goal}`,
  newEventSubEnvelope: (envelope: string) =>
    `Starts with the money in ${envelope}`,
  search: 'Search',
  noMatch: 'No event matches',
  goalTaken: (goal: string, event: string) =>
    `${goal} already saves for ${event}. A goal saves for one event.`,
  eventHasGoal: (event: string, goal: string) =>
    `${event} already draws from ${goal}. An event draws from one goal.`,
  linkSummary: (goal: string, event: string, amount: string | null) =>
    `${goal} now saves for ${event}.${amount === null ? '' : ` Added ${goal}, ${amount}, as its first cost.`}`,
  unlinkSummary: (goal: string, event: string, isCostRemoved: boolean) =>
    `${goal} no longer saves for ${event}. ${isCostRemoved ? `The ${goal} cost is removed from the event.` : 'Its cost stays on the event.'}`,
  newFromGoalSummary: (event: string, goal: string) =>
    `Added ${event}, saving for it from ${goal}.`,
  linked: (goal: string, event: string) => `${goal} now saves for ${event}`,
  unlinked: (goal: string, event: string) =>
    `${goal} no longer saves for ${event}`,
  savingForCaption: 'Saving for it',
  savingForLine: (goal: string, saved: string, target: string) =>
    `${goal}, ${saved} of ${target}`,
  partOf: (event: string) => `Part of ${event}`,
  partOfSub: 'Saving for it',
  unlinkTitle: (goal: string, event: string) => `Unlink ${goal} from ${event}?`,
  unlinkBody:
    'The goal keeps saving at its own pace. What should happen to its cost on the event?',
  unlinkBodyKept: (event: string) =>
    `${event} keeps the goal's cost and pays it from its own money. The goal keeps saving at its own pace.`,
  unlinkAction: 'Unlink the goal',
  unlinkRemoveRow: (goal: string) => `Remove the ${goal} cost`,
  unlinkRemoveSub: (event: string, amount: string) =>
    `${event} stops planning for its ${amount}`,
  unlinkKeepRow: (event: string) => `Keep it as a cost of ${event}`,
  unlinkKeepSub: (event: string) => `${event} plans for it from its own money`,
  envelopeConfirm: (envelope: string, amount: string, event: string) =>
    `${envelope} closes and its ${amount} moves to ${event}`,
  envelopeAction: (envelope: string) => `Close ${envelope}`,
  envelopeMoved: (envelope: string, amount: string, event: string) =>
    `${envelope} closed and its ${amount} moved to ${event}`,
  envelopeMoveUndo: (envelope: string, amount: string, event: string) =>
    `${envelope} reopened and its ${amount} came back from ${event}`,
  envelopeArchiveSummary: (amount: string, event: string) =>
    `Closed. Its ${amount} moved to ${event}.`,
  envelopeNewSummary: (event: string, envelope: string) =>
    `Added ${event}, with the money from ${envelope}.`,
  envelopeUndoShort: (event: string) =>
    `${event} has used some of it, so this can't be undone.`,
  envelopeUndoChanged: 'It was changed since, so nothing was undone.',
  envelopeAlreadyClosed: 'That envelope was already closed.',
  offline: 'You are offline, so nothing was changed.',
  failed: 'This did not save. Nothing was changed.',
  nudgeTitle: "Know what it'll cost?",
  nudgeSub: (goal: string, date: string) =>
    `${goal} is on ${date}. Plan it on your Horizon.`,
  nudgeDismiss: "Don't ask again",
  nudgeDismissFailed: 'That did not save. Try again.',
} as const;

/** Issue 88: finishing an event, calling it off and bringing it back. */
export const HORIZON_END_WORDS = {
  readyTitle: 'Everything is paid or a bill',
  readySub: 'Nothing is left to pay, so it is ready to finish.',
  finishLabel: (name: string) => `Finish ${name}`,
  finishTitle: (name: string) => `Finish ${name}?`,
  moneyQuestion: (amount: string) => `What happens to the ${amount} left?`,
  freeBody: 'From today.',
  placeRow: 'Move it to an envelope or goal',
  placeRowSub: 'Pick where it goes',
  placeSearch: 'Search',
  placeNoMatch: 'No envelope or goal matches',
  finishConfirm: 'Finish',
  finishWaits: (names: readonly string[], more: number) =>
    `Finish once the ${listNamesAndMore(names, more)} ${names.length + more === 1 ? 'is' : 'are'} paid or made a bill.`,
  placeCaption: 'Move it to',
  placePicked: (place: string) => `It moves to ${place}`,
  placeNone: 'There is no envelope or goal to move it to yet.',
  finished: (name: string) => `${name} is done`,
  callOffRow: 'Call it off',
  callOffRowSub: "Unpaid costs stop. What's paid stays.",
  callOffLabel: (name: string) => `Call off ${name}`,
  callOffTitle: (name: string) => `Call off ${name}?`,
  whatStops: 'What stops',
  staysBill: (cost: string) => `Stays a bill \u00b7 ${cost}`,
  stopsRow: (cost: string, when: string, figure: string | null) =>
    [cost, when, figure].filter(Boolean).join('\u00a0\u00b7 '),
  callOffConfirm: 'Call off',
  changesQuestion: (count: number) =>
    count === 1
      ? 'What happens to its planned change?'
      : 'What happens to its planned changes?',
  changesCancelTitle: (count: number) =>
    count === 1
      ? 'Cancel this change too'
      : `Cancel these ${count} changes too`,
  changesKeepTitle: (event: string, count: number) =>
    `Keep ${count === 1 ? 'it' : 'them'}, not part of ${event}`,
  changesKeepBody: (count: number) =>
    count === 1
      ? 'It stays planned, on its own.'
      : 'They stay planned, on their own.',
  changesCancelBody: (count: number) =>
    count === 1
      ? 'It goes back to what it was before.'
      : 'Each goes back to what it was before.',
  needsChangesChoice: 'Choose what happens to its planned changes.',
  changesStayCancelled: 'Its changes stay cancelled.',
  changesRowLabel: (count: number) =>
    count === 1 ? 'Its planned change' : 'Its planned changes',
  changesAnswer: (pick: 'cancel' | 'keep', count: number) => {
    if (pick === 'cancel')
      return count === 1 ? 'Cancelled too' : `All ${count} cancelled too`;
    return count === 1
      ? 'Stays planned, on its own'
      : 'Stay planned, on their own';
  },
  moneyRowLabel: (amount: string) => `The ${amount} left`,
  moneyToFree: 'Goes to Free to Spend',
  moneyToPlace: (place: string) => `Moves to ${place}`,
  moneyStaysHeld: (event: string) => `Stays held for ${event}`,
  detailsTitle: 'What changes',
  detailsStops: (stops: number, bills: number) =>
    [
      stops > 0 ? (stops === 1 ? '1 cost stops' : `${stops} costs stop`) : null,
      bills > 0
        ? bills === 1
          ? '1 stays a bill'
          : `${bills} stay bills`
        : null,
    ]
      .filter(Boolean)
      .join(' \u00b7 '),
  detailsDays: 'See how your income days change',
  detailsMoves: 'What moves',
  calledOff: (name: string) => `${name} is called off`,
  undo: 'Undo',
  needsChoice: 'Choose what happens to the money it holds.',
  needsPlace: 'Pick the envelope or goal it moves to.',
  failed: 'This did not save. Nothing was changed.',
  gone: 'This event is gone. Open it again.',
  badMove: 'There is no money to move that way.',
  notEnough: 'That is more than it has left.',
  changedSince: 'It was changed since, so nothing was undone.',
  undoShort: (name: string) =>
    `${name} has used some of it, so this can't be undone.`,
  offline: 'You are offline, so nothing was changed.',
  alreadyDone: 'It was already changed on another device. Open it again.',
  endSummary: (
    name: string,
    state: 'finished' | 'calledOff',
    money: {
      kind: 'free' | 'place' | 'held';
      cents: string;
      place: string | null;
    } | null,
  ) => {
    const lead =
      state === 'finished' ? `Finished ${name}.` : `Called off ${name}.`;
    if (money === null) return lead;
    if (money.kind === 'held')
      return `${lead} ${money.cents} stays held for ${name}.`;
    return `${lead} ${money.cents} went to ${money.kind === 'free' ? 'Free to Spend' : (money.place ?? 'another place')}.`;
  },
  undoEndSummary: (name: string, state: 'finished' | 'calledOff') =>
    state === 'finished'
      ? `Took back finishing ${name}.`
      : `Took back calling off ${name}.`,
  bringBackSummary: (name: string, money: string | null) =>
    money === null
      ? `Brought ${name} back.`
      : `Brought ${name} back, with ${money}.`,
  undoBringBackSummary: (name: string, state: 'finished' | 'calledOff') =>
    state === 'finished'
      ? `Finished ${name} again.`
      : `Called ${name} off again.`,
  releaseSummary: (name: string, money: string) =>
    `${name}'s ${money} is Free to Spend.`,
  undoReleaseSummary: (name: string, money: string) =>
    `${money} is held for ${name} again.`,
  reopenSummary: (name: string, cost: string) =>
    `${name} is open again: ${cost} was taken back.`,
  doneCaption: (count: number) => `Done \u00b7 ${count}`,
  doneOn: (date: string) => `Done ${date}`,
  calledOffOn: (date: string) => `Called off ${date}`,
  spent: 'Spent',
  paid: 'Paid',
  anotherPlace: 'another place',
  freeTitle: 'Free to Spend',
  opensAgain: (name: string) => `${name} opens again.`,
  calledOffTakeBack: (name: string) =>
    `${name} is called off. Bring it back first to take a payment back.`,
  calledOffHere: 'Bring it back first to take a payment back.',
  calledOffRemovePurchase: (name: string) =>
    `${name} is called off. Bring it back first to remove this purchase.`,
  tapToTakeBack: 'Tap the payment to take it back.',
  changedJustNow: 'This changed just now. Look again, then try once more.',
  moneyChanged:
    'What it holds changed just now. Look again, then try once more.',
  endless: (cost: string) =>
    `${cost} repeats with no end. End it or make it a bill to finish.`,
  freeUp: (amount: string) => `Free to Spend goes up by ${amount}.`,
  freeDown: (amount: string) => `Free to Spend goes down by ${amount}.`,
  nothingPaid: 'Nothing paid',
  nothingPaidFrom: (name: string) => `Nothing paid from ${name}`,
  paidBeforeCallOff: 'Paid before calling off',
  envelopesHeading: 'Envelopes',
  goalsHeading: 'Goals',
  andMore: (count: number) => `and ${count} more`,
  stopped: 'Stopped \u00b7 never paid',
  wentToFree: (money: string, isCalledOff: boolean) =>
    `${money} went to Free to Spend when it ${isCalledOff ? 'was called off' : 'finished'}`,
  wentToPlace: (money: string, place: string, isCalledOff: boolean) =>
    `${money} went to ${place} when it ${isCalledOff ? 'was called off' : 'finished'}`,
  stillHeld: (money: string) => `Still held \u00b7 ${money}`,
  release: (amount: string) => `Release ${amount} to Free to Spend`,
  releaseSub: (amount: string) => `Free to Spend goes up by ${amount}.`,
  releasedAmount: (amount: string, name: string) =>
    `${amount} from ${name} went to Free to Spend`,
  releaseUndone: (amount: string, name: string) =>
    `${amount} is back in ${name}`,
  movedFree: (amount: string) => `${amount} went to Free to Spend.`,
  movedPlace: (amount: string, place: string) => `${amount} went to ${place}.`,
  movedHeld: (amount: string) => `${amount} stays held.`,
  openAgain: (name: string) => `${name} is open again`,
  undoneBringBack: (name: string, state: 'finished' | 'calledOff') =>
    state === 'finished'
      ? `${name} is done again`
      : `${name} is called off again`,
  freeSame: 'Free to Spend stays the same.',
  heldStays: (amount: string, name: string) =>
    `${amount} stays in ${name} until you release it.`,
  bringsFrom: (name: string, amount: string, place: string) =>
    `${name} gets ${amount} from ${place}.`,
  placeGets: (place: string, amount: string) => `${place} gets ${amount}.`,
  released: (name: string) => `What ${name} held is Free to Spend`,
  releaseFailed: (name: string) => `${name} was not changed`,
  bringBackRow: 'Bring it back',
  bringBackSub: 'Its costs plan again from today',
  bringBackHeldSub:
    'Its costs plan again from today. Bring it back first to put the money somewhere else.',
  bringBackTitle: (name: string) => `Bring ${name} back?`,
  bringBackNote: 'Its unpaid costs plan again from today.',
  whatComesBack: 'What comes back',
  dueNow: 'Due now',
  nothingToPlan: (held: string | null) =>
    held === null
      ? 'Nothing to plan again.'
      : `Nothing to plan again. The ${held} stays held.`,
  bringQuestion: (amount: string) => `What happens to the ${amount}?`,
  bringPartial: (sent: string, place: string, left: string) =>
    `${sent} went to ${place}. Only ${left} is still there to bring back.`,
  bringYes: (amount: string) => `Bring the ${amount} back`,
  bringYesFree: 'It comes back from Free to Spend.',
  bringYesPlace: (place: string) => `It comes back from ${place}.`,
  bringNo: (name: string) => `Start ${name} at $0`,
  bringNoFree: 'What went to Free to Spend stays there.',
  bringNoPlace: (place: string) => `What went to ${place} stays there.`,
  moneyGone: (amount: string, place: string, name: string) =>
    `The ${amount} that went to ${place} is no longer there, so ${name} starts at $0.`,
  needsAnswer: 'Choose what happens to the money first.',
  effectNone: 'No pay changes.',
  backIn: (name: string) => `${name} is back`,
  backAtZero: (name: string) => `${name} is back at $0`,
  cameBackFree: (amount: string) => `${amount} came back from Free to Spend.`,
  cameBackPlace: (amount: string, place: string) =>
    `${amount} came back from ${place}.`,
  bringBackConfirm: 'Bring it back',
} as const;

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

export const PRIORITY_DIAL_WORDS = {
  label: 'Which priorities the total counts',
  options: {
    must: { label: 'Must', ariaLabel: 'Musts only' },
    should: { label: 'Should', ariaLabel: 'Musts and Shoulds' },
    want: { label: 'Want', ariaLabel: 'Everything' },
  },
  monthRest: {
    must: 'a month, Musts only',
    should: 'a month without Wants',
    want: 'a month',
  },
  savedRest: {
    must: 'saved, Musts only',
    should: 'saved without Wants',
    want: 'saved',
  },
  trimmedNote: (counted: string) =>
    `Counting ${counted} only. Move the dial to Want to count everything; it goes back there the next time you open Runway.`,
  counted: { must: 'Musts', should: 'Musts and Shoulds', want: 'Everything' },
  notCounted: 'Not in this total',
  notCountedShort: 'not counted',
  sheetSuffix: { must: 'Musts only', should: 'without Wants' },
  /** After a goal's finish date counted at the dial: "reaches it May 2027 on Musts". */
  paceSuffix: { must: 'on Musts', should: 'without Wants' },
} as const;

export const PRIORITIES_NUDGE_WORDS = {
  title: 'Mark what you must pay',
  subtitle: 'Everything starts as Should. Move yours into Must and Want.',
  dismiss: "Don't ask again",
} as const;

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
export const EXPECTED_KINDS = ['income', 'expense', 'horizon'] as const;

/** The ways a bill can repeat that the bill form offers. */
/** The repeats a budget document's bill can be read as. */
export const BILL_REPEAT_KINDS = [
  'once',
  'weekly',
  'everyOtherWeek',
  'monthly',
] as const satisfies readonly (typeof SCHEDULE_KINDS)[number][];

/** The bill form's repeat choices: Yearly and Custom are both a schedule every few months. */
export const BILL_FREQUENCIES = [
  ...BILL_REPEAT_KINDS,
  'yearly',
  'custom',
] as const;

export const BILL_FREQUENCY_LABELS: Record<
  (typeof BILL_FREQUENCIES)[number],
  string
> = {
  once: 'Once',
  weekly: 'Weekly',
  everyOtherWeek: 'Every other week',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom',
};

export const BILL_EVERY_UNITS = ['months', 'years'] as const;

export const BILL_EVERY_UNIT_LABELS: Record<
  (typeof BILL_EVERY_UNITS)[number],
  string
> = {
  months: 'Months',
  years: 'Years',
};

/** The longest gap a bill's repeat can have, in months. */
export const MAX_EVERY_MONTHS = 120;

export const BILL_FUNDINGS = ['suggested', 'chosen'] as const;

export const BILL_FUNDING_LABELS: Record<
  (typeof BILL_FUNDINGS)[number],
  string
> = { suggested: 'Spread over income days', chosen: 'Days I choose' };

/** How a draft line for a bill was decided, beside the envelope cadences. */
export const BILL_DRAFT_CADENCES = [
  'billSuggested',
  'billChosen',
  'billLastBefore',
  'billPay',
] as const;
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
/** The kinds of ledger entry the client writes: a bill marked paid (and its undo, a `billPaid` that names the one it reverses), a `start` holding, a `trackingChange` (tracking turned on or off), a `cardPayment`, a `transfer` (money in an envelope or goal moved to another envelope or goal, or Free to Spend, and its undo, a `transfer` that names it) and a `costPaid` (a Horizon cost's payment marked paid, and its undo). */
export const MOVE_KINDS = [
  'billPaid',
  'start',
  'trackingChange',
  'cardPayment',
  'transfer',
  'costPaid',
] as const;
/** Where a purchase came from; the person adds by hand now, a CSV and a linked account come later. */
export const PURCHASE_SOURCES = ['manual', 'csv', 'link'] as const;
/** How a purchase line got its envelope: the person chose it, it ran over from the chosen envelope's chain (a null envelope is Free to Spend taking the rest), or it is Free to Spend. */
export const PURCHASE_LINE_VIAS = ['chosen', 'spill', 'free'] as const;
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
  'horizon',
  'card',
] as const;
/** The first day of the lookahead is the starting point; a start move's day key in a bill's funded list. */
export const START_DAY_KEY = 'start';
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
export const CLOSING_VERSION = 5;
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
  savedButStale:
    'Saved, but the changes you made for one pay could not be cleared. They are still on those pays.',
  changedElsewhere:
    'This changed somewhere else. What it does now is shown below. Check it, then save again.',
  fromHeading: 'When it starts',
  fromNow: 'From now on',
  fromNowNote: 'Starts now. For a later date, use Plan a change.',
  whenHeading: 'When should it start?',
  whenOpenedFrom: (day: string) =>
    `You opened this from your ${day} income day.`,
  fromDayMeaning: (day: string) => `${day} and every income day after it`,
  dayOnlyMeaning: (day: string) => `Only ${day}, then it goes back`,
  fromNowMeaning: (day: string) =>
    `Starting today, including any income days before ${day}`,
  whenBlocker: 'Pick when it starts.',
  fromDate: 'From a later date',
  dateLabel: 'Starts on',
  dateBlocker: 'Pick a day after today, within ten years.',
  previewHeading: 'What this changes',
  putsInOf: (put: string, asked: string, hasRoom: boolean) =>
    `${hasRoom ? 'Puts' : 'No room: puts'}\u00A0in\u00A0${put}\u00A0of\u00A0${asked}`,
  noLongerAsked: (was: string | null) =>
    was === null
      ? 'No longer asked for'
      : `No longer asked for \u00b7 was ${was}`,
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
  reasonPicks: 'Quick picks',
  whyHint: 'A note for your own records. You can leave it out.',
  whyPlaceholder: 'Why it changed. You can leave this out.',
  saveWithNote: 'Save',
  saveWithoutNote: 'Save without a reason',
  unchanged: 'Make a change to continue.',
  change: 'Change',
  fromDay: 'From this income day on',
  dayOnly: 'Just this income day',
  stretch: 'For a while, then back',
  dayPick: 'Which income day',
  stretchStartHeading: 'Starts (leave it empty to start today)',
  stretchStartLabel: 'Starts on',
  stretchHeading: 'How long',
  stretchCount: 'For a number of income days',
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

/** A change that belongs to an event on the Horizon, and the item's list of changes still ahead. */
export const PART_OF_WORDS = {
  label: 'Part of',
  none: 'Not part of an event',
  eventGone: 'That event is no longer open. Pick another, or save without one.',
  eventChanged:
    'That event changed on another device, so nothing was saved. Try again.',
  linkedLine: (name: string, what: string, from: string, event: string) =>
    `Linked ${name}: ${what}, from ${from}, to ${event}.`,
  unlinkedLine: (name: string, event: string) =>
    `Unlinked ${name} from ${event}.`,
  comingBackTo: (figure: string, lastDay: string) =>
    `Back to ${figure} after ${lastDay}`,
  comingBack: (lastDay: string, difference: string) =>
    `Back after ${lastDay} \u00b7 ${difference}`,
  comingStarts: 'Starts',
  starts: 'starts',
  ends: 'ends',
  stopsSaving: 'stops saving',
  alreadyStarted: 'That has already started, so it cannot be cancelled.',
  cancelledLine: (name: string, what: string, event: string) =>
    `Cancelled ${name}: ${what}, part of ${event}.`,
} as const;

export const LIFECYCLE_WORDS = {
  addReason: 'Add a reason',
  removeReason: 'Remove the reason',
  pause: 'Stop saving for now',
  pauseSub: 'Nothing new goes in. The balance and history stay.',
  resume: 'Start saving',
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
  pauseConfirm: 'Stop saving',
  endAfterConfirm: (date: string) => `End after ${date}`,
  stopSavingFromConfirm: (date: string) => `Stop saving from ${date}`,
  pauseFromHeading: 'From',
  pauseFromLabel: 'Stop saving from',
  pauseBlocker: 'Pick the day it stops, from today to ten years ahead.',
  resumeConfirm: 'Start saving',
  whyEnd: 'Why is it ending?',
  endsAfter: 'Ends after',
  alreadyEnded: 'This was already ended, so nothing changed.',
  alreadyArchived: 'This was already archived, so nothing changed.',
  chipsEnd: ['Paid off', 'No longer needed', 'Changed my mind', 'Job ended'],
  chipsArchive: ['No longer needed', 'Replaced by another', 'Changed my mind'],
  chipsPause: ['Focusing on another goal', 'Money is tight', 'Changed my mind'],
} as const;

const MIND_CHIPS = ['Changed my mind', 'Fixing a mistake'] as const;

/** Starting points for "Why the change?", shaped like what changes for each kind of item. */
export const CHANGE_REASON_CHIPS: Record<
  (typeof ITEM_KINDS)[number],
  readonly string[]
> = {
  bill: ['Price went up', 'Price went down', ...MIND_CHIPS],
  envelope: ['Spending more', 'Spending less', ...MIND_CHIPS],
  goal: ['Saving more', 'Saving less', 'Goal changed', 'Fixing a mistake'],
  payLine: ['New job or raise', 'Hours changed', ...MIND_CHIPS],
  source: MIND_CHIPS,
  group: MIND_CHIPS,
  horizon: ['Plans changed', ...MIND_CHIPS],
};

/** Starting points for "Why the change?" when a Horizon cost is priced. */
export const HORIZON_PRICE_REASON_CHIPS = [
  'Got a quote',
  'Price went up',
  'Price went down',
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

/** A draft line for a Horizon cost: spread over the pays before it is due, or carried by the one pay picked. */
export const HORIZON_DRAFT_CADENCES = ['horizonPays', 'horizonOnePay'] as const;

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
  | (typeof PAIRING_DRAFT_CADENCES)[number]
  | (typeof HORIZON_DRAFT_CADENCES)[number],
  string
> = {
  horizonPays: 'Spread over your pays before it is due',
  horizonOnePay: 'Comes from the pay you picked',
  pairing: 'First from this pay',
  billSuggested: 'Spread over your income days',
  billChosen: 'A day you chose',
  billLastBefore: "Comes from the pay before it's due",
  billPay: 'Comes from the pay you picked',
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
  fundedFrom: 'comes out of',
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
  completed: 'Completed',
  notReached: 'not reached in the next year at this amount',
} as const;

/** Names in a sentence: "A", "A and B", "A, B and C", then three and "N more". */
export const joinNames = (names: readonly string[]) =>
  names.length <= 3
    ? names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

export const GOAL_TRACK_WORDS = {
  allOnTrack: 'Every goal with a date is on track',
  behind: (names: readonly string[]) =>
    `${names.length} ${names.length === 1 ? 'goal is' : 'goals are'} behind: ${joinNames(names)}`,
  openBehind: 'Change what it gets each time',
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
  costsGroup: 'Costs to pay',
  allBillsPaid: 'All bills paid',
  allBillsPaidAction: 'Mark all bills paid',
  waitingGroup: 'Waiting for more money',
  markPaid: 'Mark paid',
  undoPaid: 'Undo',
  tickFailed: 'That tick did not save. Try again.',
} as const;

/** Money to move into the accounts that bills and cards pull from, after an income day. */
export const ACCOUNT_MOVE_WORDS = {
  group: 'Move to accounts',
  summary: (amount: string, to: string, from: string | null, by: string) =>
    from === null
      ? `Move ${amount} to ${to} by ${by}`
      : `Move ${amount} from ${from} to ${to} by ${by}`,
  by: (date: string, names: string) => `By ${date} · for ${names}`,
  names: (names: readonly string[]) =>
    names.length <= 3
      ? names.length < 2
        ? (names[0] ?? '')
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`,
  sheetTitle: (to: string) => `Move to ${to}`,
  short: (amount: string, to: string) => `Move ${amount} to ${to}`,
  pullsHeading: (to: string) => `What pulls from ${to}`,
  lead: (amount: string, from: string | null, by: string) =>
    from === null
      ? `Move ${amount} here by ${by}.`
      : `Move ${amount} from ${from} by ${by}.`,
  freshBalance: (
    account: string,
    balance: string,
    date: string,
    left: string,
    pulls: string,
  ) =>
    `${account} held ${balance} on ${date}, so ${left} of the ${pulls} is left to move.`,
  staleBalance: (account: string, date: string) =>
    `${account}'s balance was last updated ${date}, before this pay, so the move counts all of it. Enter what it holds today and the amount to move shrinks.`,
  noBalance: (account: string) =>
    `${account} has no balance yet, so the move counts all of it. Enter what it holds today and the amount to move shrinks.`,
  staleBankBalance: (account: string, date: string) =>
    `${account}'s balance from your bank is from ${date}, before this pay, so the move counts all of it. It updates the next time the bank syncs.`,
  updateBalance: (account: string) => `Update ${account}'s balance`,
  updateBalanceSub: 'What it holds today',
  warnTitle: 'Money to move',
  warnOne: '1 move to do',
  warnMany: (count: number) => `${count} moves to do`,
} as const;

/** Under an amount that turns a range into a record: what it usually is. */
export const VARIES_HINT = (range: string) => `It varies, usually ${range}`;

/** A bill whose amount varies is marked paid with what it really came to, never the planned figure. */
export const PAID_AMOUNT_WORDS = {
  title: (name: string) => `What did ${name} come to?`,
  amount: 'Amount paid',
  markSub: 'It varies, so say what it came to',
  rowHint: 'Varies · tick to say what it came to',
  needsAmount: 'Enter what it came to.',
  allFromFree: 'Nothing was set aside yet, so it comes out of Free to Spend',
  aboveRange: (range: string) => `Above its usual ${range}`,
  belowRange: (range: string) => `Below its usual ${range}`,
  fromFree: (amount: string) =>
    `${amount} more than was set aside comes out of Free to Spend`,
  stays: (amount: string, name: string) =>
    `${amount} of what was set aside stays with ${name}`,
  failed: 'It was not marked paid. Nothing was changed.',
  alreadyPaid: (name: string) => `${name} is already marked paid.`,
  leftForTick: (names: readonly string[]) =>
    names.length === 1
      ? `${names[0]} varies, so tick it to say what it came to`
      : `${names.length} bills vary, so tick each to say what it came to`,
} as const;

export const BILL_WORDS = {
  payOnLine: (payOn: string, dueOn: string) =>
    `Pay\u00a0${payOn} · due\u00a0${dueOn}`,
  paid: 'Paid',
  paidAhead: 'Paid ahead',
  waiting: 'Waiting for the rest',
  readyToPay: 'Set aside in full',
  savingUp: 'Saving up',
  savingUpFor: 'Saving up for',
  aMonth: 'a month',
  once: 'once',
  nothingSaved: 'Nothing saved yet',
  saved: (cents: string, total: string) => `${cents} of ${total} saved`,
  needsDueDate: 'Needs a due date',
  allBills: 'All bills',
  undatedOne: (name: string) => `${name} needs a due date`,
  undatedMany: (count: number) => `${count} bills need a due date`,
  undatedOnlyHint: 'Tap one to set its date',
  showAllBills: 'Show all bills',
  allDated: 'Every bill has a due date now',
  offPlanTitle: (names: readonly string[]) =>
    names.length === 1
      ? `${names[0]} has no due date`
      : names.length === 2
        ? `${names[0]} and ${names[1]} have no due date`
        : `${names.length} bills have no due date`,
  offPlanDetail: (count: number) =>
    `This pay sets nothing aside for ${count === 1 ? 'it' : 'them'}, so it has less to spare than it looks.`,
} as const;

export const DUE_WORDS = {
  title: 'To pay today',
  titleLate: 'To pay now',
  today: 'Due today',
  dueLater: (when: string) => `Your day to pay it · due\u00a0${when}`,
  upTo: (amount: string) => `up\u00A0to\u00A0${amount}`,
  wasDue: (when: string) => `Was due\u00a0${when}`,
  missed: (
    when: string,
    later: readonly string[],
    isDueAgainToday: boolean,
  ) => {
    const dates = [when, ...later];
    const list =
      dates.length === 2
        ? `${dates[0]} and ${dates[1]}`
        : dates.length === 3
          ? `${dates[0]}, ${dates[1]} and ${dates[2]}`
          : dates.length > 3
            ? `${when} and ${later.length} more`
            : when;
    return `Missed ${list}${isDueAgainToday ? ' · due again today' : ''}`;
  },
  count: (count: number, isAnyLate: boolean, hasCosts = false) => {
    const things = hasCosts ? 'payments' : 'bills';
    return isAnyLate
      ? `${count} ${things}, oldest first`
      : `${count} ${things}`;
  },
  more: (count: number) => `Show ${count} more`,
  fewer: 'Show fewer',
  seeAll: 'See all',
  markPaid: 'Mark paid',
  alreadyPaid: (name: string) => `${name} was already marked paid`,
  paidMissed: (
    name: string,
    due: string,
    later: readonly string[],
    isDueAgainToday: boolean,
  ) =>
    `Paid ${name}'s ${due} payment · ${
      later.length + (isDueAgainToday ? 1 : 0) > 1
        ? `${later.length + (isDueAgainToday ? 1 : 0)} more still due`
        : isDueAgainToday
          ? "today's is still due"
          : `the ${later[0]} payment is still due`
    }`,
  openBills: (name: string) => `Open ${name}`,
  undoOffline: (name: string) =>
    `${name} is still marked paid. Undoing needs a connection`,
  undoFailed: (name: string) =>
    `${name} is still marked paid. Open the bill to take it back`,
} as const;

/** A repeating bill's "Comes out of": which of the plan's pays carries it. */
export const BILL_PAID_FROMS = ['spread', 'lastBefore', 'pay'] as const;

export const PAID_FROM_WORDS = {
  title: 'Which pay does it come out of?',
  title2: 'Comes out of',
  spreadRow: 'Spread across your pays',
  chosenRow: 'Days you chose',
  spreadMeaning: 'Every pay before it is due puts in a share.',
  lastBeforeMeaning: 'Only the last pay before it is due puts it in.',
  payMeaning: 'Only the pay you pick puts it in.',
  replacesPins: (dates: readonly string[]) =>
    dates.length === 1
      ? `This replaces your change for the ${dates[0]} pay.`
      : dates.length <= 3
        ? `This replaces your changes for the ${dates.slice(0, -1).join(', ')} and ${dates[dates.length - 1]} pays.`
        : `This replaces your changes for the ${dates.slice(0, 3).join(', ')} and ${dates.length - 3} more pays.`,
  summaryLabel: 'Comes out of',
  label: 'Comes out of',
  spread: 'Spread across my pays',
  lastBefore: "The pay right before it's due",
  lastBeforeLower: "the pay right before it's due",
  pay: 'A pay I pick',
  whichPay: 'Which pay',
  onlyRepeating:
    'Only repeating pays can be picked. A one-time pay can still top it up from its own day.',
  seeChanges: 'See what this changes below',
  seePays: 'Pick a pay below.',
  pickPay: 'Pick a pay.',
  gone: 'A pay that is no longer in the plan',
  /** The change log's phrase for the choice. */
  logSpread: 'spread across your pays',
  logLastBefore: "the pay right before it's due",
  noticeNoPay: (pay: string, name: string, dueOn: string) =>
    `${pay} doesn't come before ${name} is due\u00a0${dueOn}`,
  noticeNoPayAtAll: (name: string, dueOn: string) =>
    `No pay comes before ${name} is due\u00a0${dueOn}`,
  noticeShort: (name: string, short: string, on: string) =>
    `${name} is ${short} short on ${on}`,
  keepSpread: 'Spread across my pays',
  pickAnother: 'Pick another pay',
  changed: (name: string) => `${name} is now spread across your pays`,
  paidFromBack: (name: string, was: string) => `${name}: back to ${was}.`,
  undoFailed: 'That could not be undone.',
  pinsLeft: (name: string) =>
    `${name} is now spread, but some per-pay changes are still on.`,
  undoPartial: (name: string) =>
    `${name} comes out of its old pays again, but the per-pay changes could not be put back.`,
  undo: 'Undo',
  saveFailed: 'This did not save. Nothing was changed.',
} as const;

/** A bill's share of one paycheck: changing what this pay puts toward it, and keeping that for every pay. */
export const PAY_SHARE_WORDS = {
  action: 'Change what this pay puts in',
  savingToward: (cents: string, total: string, due: string) =>
    `Saving up · ${cents} of ${total} · due\u00a0${due}`,
  title: (name: string) => `How much should this pay put toward ${name}?`,
  amount: 'Amount',
  carriesRest: (date: string, name: string, cents: string, isAlone: boolean) =>
    isAlone
      ? `The ${date} pay now puts in all of ${name}'s remaining ${cents}.`
      : `The ${date} pay now puts in the rest of ${name}, ${cents}.`,
  payRow: (name: string, date: string) => `${name}, ${date} pay`,
  short: (name: string, short: string, dueOn: string) =>
    `${name} would be ${short} short on ${dueOn}`,
  capped: (name: string, needs: string, set: string, max: string) =>
    set === ''
      ? `${name} needs ${needs}, so ${max} is the most this pay can put in.`
      : `${name} needs ${needs} and ${set} is already set aside, so ${max} is the most this pay can put in.`,
  needsAmount: 'Enter an amount.',
  unchanged: 'Change the amount to save it.',
  save: 'Save for this pay',
  saveCapped: (cents: string) => `Save ${cents}`,
  saveFailed: 'This did not save. Nothing was changed.',
  changedFor: 'Changed for this pay',
  backToPlan: "Back to the plan's amount",
  backToPlanSub: 'This pay goes back to its share of the plan',
  keepTitle: 'Keep it this way for every paycheck?',
  savedStatus: 'Saved for this pay',
  tryAgain: 'Try again',
  tryAgainBody: 'Clears the per-pay changes that are still on.',
  undoBody: 'Takes this whole change back.',
  showMore: (count: number) => `Show ${count} more`,
  andMore: (count: number) => `and ${count} more`,
  keepYes: (pay: string) => `Yes, always from ${pay}`,
  keepYesBody: (name: string, pay: string, total: string, each: string) =>
    `From now on ${name} comes only from ${pay} (${total} ${each}).`,
  keepJustOnce: 'Just this time',
  keepJustOnceBody: (date: string, later: string) =>
    `Only ${date} changes; ${later}.`,
  laterSpread: 'other months keep spreading it',
  laterSame: 'other months stay as they are',
  eachMonth: 'each month',
  eachTime: 'each time',
  actionSub: (name: string, total: string) =>
    `${name} stays ${total}; only this pay changes`,
  leftOutDetail: (pay: string) => `Comes out of ${pay}`,
  restSetAside: (cents: string, due: string) =>
    `${cents} · already set aside · due\u00a0${due}`,
  completesIt: (cents: string, due: string) =>
    `${cents} · this pay completes it · due\u00a0${due}`,
  undoPins: 'Put them back',
  theDatePay: (date: string) => `the ${date} pay`,
  leftOutCarrier: (date: string) => `Comes out of the ${date} pay`,
  leftOutHeading: 'Comes out of another pay',
  summary: (name: string, cents: string, date: string) =>
    `${name}: this pay puts in ${cents}, for ${date} only.`,
  savedToast: (name: string) => `Changed what this pay puts toward ${name}`,
  ruleToast: (name: string, pay: string) => `${name} now comes from ${pay}`,
  undo: 'Undo',
  undoFailed: 'That could not be undone. Nothing was changed.',
  overPay: (money: string, over: string) =>
    `This pay has ${money} left for it, so ${over} would stay short.`,
  savedTitle: 'Saved for this pay',
  withheld: (name: string) =>
    `Only this pay changed. To choose which pay covers ${name} every time, change Comes out of on its sheet.`,
  done: 'Done',
  setPaidFrom: 'Choose the pay',
  pinsClearedToast: (name: string, count: number) =>
    count === 1
      ? `${name}: 1 per-pay change was cleared`
      : `${name}: ${count} per-pay changes were cleared`,
  pinsCleared: (name: string, dates: string) =>
    `${name}: per-pay changes on ${dates} cleared.`,
  pinsNotBack: (name: string, count: number) =>
    `${name}: ${count} per-pay ${count === 1 ? 'change was' : 'changes were'} changed again since, so ${count === 1 ? 'it was' : 'they were'} left as is`,
  oneTimePay: (pay: string, name: string) =>
    `${pay} is one-time and ${name} doesn't come out of it. Pick a repeating pay, or choose different pays for it.`,
  whyNothing: 'Why this pay puts nothing in',
  leftOutTitle: (name: string, from: string) => `${name} comes from ${from}`,
  leftOutBody: 'This pay puts nothing toward it.',
  firstOnlyTitle: (name: string) => `${name} comes out of this pay first`,
  pairedSub: (name: string) => `What this pay puts toward ${name} first`,
  firstOnlyBody: (from: string) =>
    `It comes out of ${from}, so what this pay puts in is set by Pay these first, not here.`,
  hiddenEffects: 'Other pays and items may move',
  whyOthers:
    'Other items move because this pay has less or more left for them.',
  overCapHidden: (name: string) =>
    `That is more than ${name} still needs. Show amounts to see how much.`,
  keepEffect: 'If you keep it every paycheck',
  pinsBack: (name: string, dates: string) =>
    `${name}: per-pay changes on ${dates} put back.`,
  pinnedRow: (name: string, date: string) => `${name}, ${date} pay, set by you`,
  resetSummary: (name: string, date: string) =>
    `${name}: this pay goes back to the plan's amount, for ${date} only.`,
  restoreSummary: (name: string, cents: string, date: string) =>
    `${name}: this pay puts in ${cents} again, for ${date} only.`,
  resetToast: (name: string) =>
    `${name} is back to the plan's amount for this pay`,
  paidFromBack: (name: string, was: string) => `${name}: back to ${was}.`,
  keepPartial: (name: string, pay: string) =>
    `${name} now comes from ${pay}, but some per-pay changes are still on. Tap Try again to clear them.`,
  undoPartial: (name: string) =>
    `${name} comes out of its old pays again, but this pay's figure could not be restored.`,
} as const;

/** The levels; tracking is one switch for the whole plan, and Link is Track with a bank linked. */
export const LEVELS = ['plan', 'track', 'link'] as const;

export const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
  plan: 'Plan',
  track: 'Track',
  link: 'Link',
};

export const LINK_STATUSES = ['active', 'needsAttention', 'revoked'] as const;

/** What an envelope's figure is called at each level. */
export const ENVELOPE_FIGURE_WORDS: Record<(typeof LEVELS)[number], string> = {
  plan: 'assigned',
  track: 'left',
  link: 'safe to spend',
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
    'Say what you have and what each envelope, goal, Horizon item and bill holds on the day tracking begins. Money that arrives or is paid after that day is added to it.',
  startsOn: 'Tracking starts',
  moneyOnHand: 'Money on hand',
  moneyHint: 'One total for all of it. Named accounts come later.',
  envelopes: 'What each envelope holds',
  goals: 'What each goal holds',
  horizon: 'What each Horizon item holds',
  bills: 'Already put aside for bills',
  cards: 'What each card owes',
  start: 'Start tracking',
  stopTitle: 'Stop tracking',
  stopMessage:
    'Spending screens and "left" figures go away and envelopes show what they are assigned. Everything you entered stays in your history, and you can start again from any later day.',
  stopConfirm: 'Stop tracking',
  stopFromLinkMessage: (banks: string) =>
    `This also unlinks ${banks}, so new purchases stop coming in. Spending screens go away and envelopes show what they are assigned.`,
  stopFromLinkKept:
    'Everything already in Runway stays in your history, and you can start again from any later day.',
  stopFromLinkConfirm: 'Unlink and stop tracking',
  stopLinksLoading:
    'Your linked banks are still loading. Try again in a moment so they are unlinked too.',
  freshStart:
    'Starting again begins fresh from this day. Earlier tracking stays in your history.',
  lineUpTotal: 'Assigned',
} as const;

/** The one-time invitation Home shows a Plan person after their first confirmed income day. */
export const TRACK_INVITE_WORDS = {
  title: 'Want to see what each envelope has left?',
  subtitle: 'Try tracking, any time',
  dismiss: "Don't show this again",
  sheetTitle: 'Plan or Track',
  planName: 'Plan',
  planLead: 'What you use now',
  planPoints: [
    'What you have today',
    "Each payday's share for bills, envelopes and goals",
    'Free to Spend',
  ],
  trackName: 'Track',
  trackLead: 'Everything in Plan, plus',
  trackPoints: [
    'Add purchases as you go',
    'Pay with cards and see what they owe',
    "Envelopes show what's left after you spend",
  ],
  switchBack: 'You can switch back any time. Nothing in your plan changes.',
  turnOn: 'Turn on tracking',
  notNow: 'Not now',
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
} as const;

export const SETUP_WORDS = {
  steps: [
    { key: 'income', title: 'Income', hint: 'Who pays you, and when' },
    { key: 'bill', title: 'Bills', hint: 'What you pay each month' },
    {
      key: 'spending',
      title: 'Spending and goals',
      hint: 'Where the rest goes',
    },
  ],
  newTitle: "Let's plan your first paycheck",
  newBody: 'Three quick steps.',
  newAction: 'Start your plan',
  startedTitle: 'Income is in',
  startedBody: 'Next, add what you pay.',
  startedAction: 'Add your bills',
  outTitle: 'Plan your first paycheck',
  outBody: 'Start now. Sign in when you want to save it.',
  outAction: 'Start planning',
  outKeptTitle: 'Welcome back',
  outKeptBody: 'Saved on this device. Sign in to keep it.',
  outKeptAction: 'Keep planning',
} as const;

export const MONEY_CHART_WORDS = {
  figure: 'Which figure',
  free: 'Free to Spend',
  all: 'All money',
  range: 'How far back',
  past: 'Past',
  hidden: 'Show amounts to see your history',
  hideChart: 'Hide chart',
  showChart: 'Show chart',
  young: 'Your money history shows here after your first two weeks.',
  today: 'Today',
  on: 'On',
  expected: 'Expected',
  since: 'since',
  sinceStart: 'since you started',
  up: 'Up',
  down: 'Down',
  same: 'No change',
  lowest: 'Lowest',
  aheadHelp:
    'The solid line is what happened. The dotted line is where your plan takes it over the next year: the pay you expect, the bills due, and what your envelopes get, counted as spent the day they get it.',
  aheadFreeHelp:
    'A pay you expect is mostly given to your envelopes, bills and goals, so Free to Spend only rises by what a pay leaves over.',
  allHelp:
    'Up to today, All money is everything you hold: Free to Spend plus what your envelopes, goals, bills and cards hold.',
  endsHelp: (on: string) =>
    `The dotted line stops at your last income day, ${on}, since your plan has no pay after it. Bills due after it aren't counted.`,
  rangeHelp:
    'The buttons under the chart choose how far back the solid line goes. All goes back to the day you started.',
} as const;

/** Days of history before the money chart draws a line, so a near-flat start never shows. */
export const MONEY_CHART_MIN_DAYS = 14;

export const HISTORY_WORDS = {
  updating: 'Updating your history',
  updatingBody:
    'Runway is adding up your earlier months so your figures open quickly. Nothing is changed or lost.',
  failed:
    'Your history could not be updated right now. Nothing has been changed or lost.',
  tryAgain: 'Try again',
} as const;

export const START_AMOUNTS_WORDS = {
  cashLabel: 'Money not in a goal or envelope',
  cashHint:
    "What's in your account apart from what your goals and envelopes hold.",
  goals: 'What each goal holds',
  horizon: 'What each Horizon item holds',
  envelopes: 'What each envelope holds',
  bills: 'Already put aside for bills',
  total: 'Total in your account',
  offline:
    'Saving where things stand needs a connection. Nothing was saved. Try again when you are back online.',
} as const;

/** A receipt photo's size cap after it has been shrunk, the most on one purchase, and the longer edge it is shrunk to. */
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const MAX_RECEIPTS_PER_PURCHASE = 10;
export const RECEIPT_MAX_DIMENSION = 2400;

export const SPEND_WORDS = {
  title: 'Purchases',
  bankName: (name: string) => `On your statement as ${name}`,
  newPurchase: 'Add a purchase',
  envelopeAdd: 'Add a purchase',
  sheetTitle: 'Purchase',
  refundSheetTitle: 'Refund',
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
  takeReceiptPhoto: 'Take a photo of the receipt',
  takeAnotherPhoto: 'Take another',
  chooseReceiptPhoto: 'Choose a receipt photo',
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
  returnsTo: 'Goes to',
  refundGoesTo: (where: string, purchase: string) =>
    `${where} · refund of ${purchase}`,
  freeToSpend: 'Free to Spend',
  add: 'Add',
  needsAmount: 'Enter the amount.',
  needsEnvelope: 'Pick the envelope.',
  needsReturnTo: 'Pick where the refund goes.',
  needsDay: 'Pick a day you were tracking, not one ahead.',
  needsShares: 'Say how much each envelope takes.',
  needsTwo: 'Pick at least two envelopes.',
  offline: 'This needs a connection. Nothing was saved.',
  detailTitle: 'Purchase',
  refundTitle: 'Refund',
  cashOrTyped: 'No card or account',
  notCounted: 'Not counted',
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
export const START_METHODS = ['budget', 'continue'] as const;

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
      ? '1 item needs a look. Open it or remove it.'
      : `${count} items need a look. Open them or remove them.`,
  removedRow: (count: number) => `Removed items (${count})`,
  removedTitle: 'Removed items',
  restore: 'Restore',
  restoreLabel: (name: string) => `Restore ${name}`,
  envelopeHolds: (amount: string) => `Holds ${amount}`,
  dueLaterNote: (count: number) =>
    count === 1
      ? 'One bill has no due date yet. Add it later from the plan.'
      : `${count} bills have no due date yet. Add them later from the plan.`,
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
  /** The rest of a line whose parts don't add up to its amount: "Other subscriptions". */
  restOf: (label: string) =>
    `Other ${/^\p{Lu}\p{Ll}/u.test(label) ? `${label.charAt(0).toLowerCase()}${label.slice(1)}` : label}`,
  moveTo: (kinds: string[]) => `Make it ${kinds.join(' or ')}`,
  moveAsk: 'Where does it belong?',
  moveKinds: {
    bill: {
      label: 'A bill',
      article: 'a bill',
      help: 'One set amount, charged on a day',
    },
    envelope: {
      label: 'An envelope',
      article: 'an envelope',
      help: 'Money you spend bit by bit over the month',
    },
    goal: {
      label: 'A goal',
      article: 'a goal',
      help: 'Money you save up toward something',
    },
  } as const,
  moved: (name: string, kind: string) => `${name} is ${kind} now`,
  movedDropped: (hadTarget: boolean, hadSaved: boolean) =>
    hadTarget && hadSaved
      ? "Its target and what's saved aren't kept."
      : hadTarget
        ? "Its target isn't kept."
        : hadSaved
          ? "What's saved isn't kept."
          : '',
  moveTipTitle: 'Something in the wrong list?',
  moveTipBody: 'Open it to make it a bill, an envelope or a goal.',
  moveTipDismiss: 'Got it',
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

/** The daily push sends between these hours; the shared sender drops anything from 10 pm to 8 am. */
export const NOTIFY_FIRST_HOUR = 8;
export const NOTIFY_LAST_HOUR = 21;
export const DEFAULT_NOTIFY_HOUR = 19;

/** Opening or returning to the app asks the banks for their latest figures, unless this device asked this recently. */
export const FRESH_ASK_GAP_MS = 2 * 60_000;
/** While the app stays in front, the banks are asked again this often. */
export const FRESH_ASK_EVERY_MS = 5 * 60_000;
/** A bank figure this recent wears the "just updated" dot. */
export const FRESH_DOT_MS = 5 * 60_000;

export const NOTIFY_WORDS = {
  rowLabel: 'Notifications',
  rowOff: 'Off',
  rowOn: (hour: string) => `Purchases waiting, at ${hour}`,
  rowOnDeviceOff: (hour: string) => `On at ${hour}, not on this device`,
  sectionCaption: 'Reminders',
  group: 'Daily reminder',
  switchLabel: 'Purchases waiting for a home',
  switchHelp: 'Once a day, only when something is waiting.',
  hourLabel: 'Remind me at',
  zone: (abbreviation: string) => `Your time zone: ${abbreviation}`,
  zoneSaved: (abbreviation: string) => `Set in ${abbreviation} time`,
  switchZone: (abbreviation: string) => `Use ${abbreviation}`,
  dismissed:
    'Nothing changed. Allow notifications when your browser asks, then switch this on again.',
  saveFailed: 'That did not save. Nothing was changed.',
  deviceOff: 'Not on this device yet',
  deviceOffSub: 'Turn on for this device',
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
  fundsBillNote:
    'For a bill, this is what this pay puts in, whichever pays it comes out of.',
  history: 'History',
  historySub: 'Every change to it, with your reasons',
  notPaid: 'Mark not paid',
  paidFromSetAside: 'It comes out of what is set aside',
  paidFromCovered: 'Paid from what Free to Spend covers',
  paidFromFree: 'not set aside yet comes out of Free to Spend',
  stopHeading: 'Stop or pause',
  startHeading: 'Start or stop',
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

/** A pay's "Comes out of this pay" list: the bills, envelopes and goals tied to it, those paid first, and the way to add or release one. */
export const PAY_ITEMS_WORDS = {
  door: 'Comes out of this pay',
  doorNothing: 'Nothing yet',
  doorSub: (names: readonly string[]) =>
    names.length <= 3
      ? formatList([...names])
      : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`,
  title: (pay: string) => `What comes out of ${pay}`,
  paidFirst: 'Paid first',
  alsoPay: 'Also from this pay',
  alsoSource: 'Also from this income',
  onDay: (day: string) => `On ${day}`,
  anyPay: 'Any of its pays',
  empty: 'Nothing comes out of this pay yet.',
  search: 'Search this pay',
  paidFirstEach: (amount: string) => `${amount} each pay`,
  payFirst: 'Pay it first',
  payFirstSub: 'Out of this pay before anything else',
  payFirstDaySub: (day: string) =>
    `Out of every pay of this line before anything else, not only ${day}`,
  stop: 'Stop taking it from this pay',
  stopBillSub: 'It goes back to Spread across my pays',
  stopOtherSub: 'It goes back to every pay',
  add: 'Add to this pay',
  addTitle: (pay: string) => `What should come out of ${pay}?`,
  addNone: 'Every bill, envelope and goal that can is already here.',
  addSearch: 'Search bills, envelopes and goals',
  dayTitle: (name: string) => `Which pay should ${name} come out of?`,
  dayBodyMonthly: 'Only out of the pay on that day',
  dayBodyPay: 'Out of every pay it makes',
  addDay: (name: string) => `Add ${name}`,
  added: (name: string, pay: string) => `${name} now comes out of ${pay}`,
  stoppedBill: (name: string) => `${name} goes back to Spread across my pays`,
  stoppedOther: (name: string) => `${name} goes back to every pay`,
  bill: 'Bill',
  envelope: 'Envelope',
  goal: 'Goal',
} as const;

export const PAID_HISTORY_WORDS = {
  summary: (name: string, due: string, amount: string) =>
    `Marked ${name} paid: ${amount} due\u00a0${due}.`,
  undoText: (name: string, due: string) =>
    `Took back the ${due} payment of ${name}`,
  confirm: (name: string, due: string, freeCents: string | null) =>
    `${name}'s ${due} payment goes back to unpaid${freeCents === null ? '' : `, and ${freeCents} returns to Free to Spend`}.`,
  alreadyTakenBack: (name: string) => `${name} was already taken back`,
  title: 'Payment',
  openMove: 'Open this payment',
  undoThis: 'Take back this payment',
  undoTitle: 'Take back this payment?',
} as const;

/** The windows around a due day that automatic payments use. */
export const AUTO_PAY_DAYS = {
  /** The most merchant names a bill keeps from charges it has matched. */
  maxLearnedNames: 10,
  /** A charge dated this many days either side of the due day can be the payment. */
  matchDays: 3,
  /** The picker looks this far before and after the due day. */
  pickDaysBefore: 5,
  pickDaysAfter: 10,
  /** A question about a payment stops being asked this many days after it was due. */
  askDays: 45,
  /** "Not here yet" hides a payment's question for this many days, on this device. */
  snoozeDays: 3,
} as const;

/** Bills that pay themselves: the marks the app writes, the charges it matches to them, and the questions it asks when it cannot. */
export const AUTO_PAY_WORDS = {
  changeLabel: 'Autopay',
  formToggle: "It's on autopay",
  formSummary: 'autopay',
  formLine: 'Counted as paid on its due day',
  paysItselfFromCard: (card: string) =>
    `Autopay · ${card}`.replaceAll(' ', '\u00a0'),
  paysItselfFromBank: 'Autopay\u00a0·\u00a0your\u00a0bank',
  dueLinePayer: (due: string, payer: string) => `${due} · ${payer}`,
  payerBank: 'autopay',
  payerCard: (card: string) => `autopay on ${card}`,
  paysItselfLine: 'Autopay',
  enterAmount: 'Enter what it charged',
  enterAmountSub: (due: string) =>
    `${due}\u2019s payment \u00b7 counted at the top of its range`,
  countedAt: (amount: string) =>
    `We counted ${amount}, the top of its range, until you tell us.`,
  whichChargeSub: (due: string) =>
    `${due}\u2019s payment \u00b7 no charge matched yet`,
  save: 'Save',
  whichCharge: 'Which charge was this?',
  chargedOn: (date: string) => `Charged ${date} · enter the amount`,
  checksHeading: 'To check',
  forgetRow: (name: string) => `Forget what ${name}\u2019s charge looks like`,
  paidByCharge: (name: string, amount: string, date: string) =>
    `Paid by ${name} \u00b7 ${amount} \u00b7 ${date}`,
  forgetSub: "We'll ask which charge it is next time",
  forgetTitle: (name: string) => `Forget the charges matched to ${name}?`,
  forgetConfirm: 'Forget',
  pickTitle: (due: string) => `Which charge was it on ${due}?`,
  pickEmpty: (due: string) => `No charge near ${due} yet`,
  pickSearch: 'Search charges',
  pickRow: (date: string, source: string | null) =>
    source === null ? date : `${date} · ${source}`,
  pickSameAmount: 'Same amount',
  pickInRange: 'In range',
  noMerchant: 'A charge',
  cardBills: 'Bills on this card',
  cardBillLine: (due: string) => `Due ${due}`,
  cardBillNoDue: 'No due date yet',
  cardBillsMore: (count: number) => `Show ${count} more`,
  cardBillsFewer: 'Show fewer',
  autoSummary: (name: string, due: string, amount: string) =>
    `${name} was paid by autopay: ${amount} due\u00a0${due}.`,
  correctedSummary: (name: string, due: string, amount: string) =>
    `Changed ${name}'s ${due} payment to ${amount}.`,
  matchedSummary: (name: string, due: string, amount: string) =>
    `Matched a charge of ${amount} to ${name}'s ${due} payment.`,
  matchUndoneSummary: (name: string, due: string) =>
    `Undid the match of ${name}'s ${due} payment.`,
  matchedOne: (name: string) => `Matched the ${name} charge to its bill`,
  matchedMany: (count: number) => `Matched ${count} charges to their bills`,
  matchedSub: 'It no longer counts as spending. Undo puts it back.',
  undo: 'Undo',
  undone: 'Match undone',
  undoFailed: 'The match was not undone',
  pickedOne: (name: string) => `Matched the charge to ${name}`,
  amountSaved: (name: string) => `${name} updated`,
  amountFailed: (name: string) => `${name} was not updated`,
  forgot: (name: string) => `${name} forgot the charges it learned`,
  forgetFailed: (name: string) => `${name} was not changed`,
  matchFailed: 'The charge was not matched',
  matchedJustNow: 'That charge was matched on its own a moment ago',
  amountTask: (name: string) => `Enter what ${name} actually charged`,
  notHereYet: 'Not here yet',
  changedElsewhere:
    'This charge or payment changed on another device. Nothing was changed.',
  alreadyMatched: 'This payment already has a charge.',
  needsConnection: 'This needs a connection.',
  paidBill: (name: string, due: string) => `Paid ${name}'s ${due} bill`,
  notThisCharge: "Not this bill's charge",
  notThisChargeSub: 'It goes back to waiting for a home',
  matchedNoEnvelope: 'This charge paid a bill, so it has no envelope.',
  unmatched: 'Charge taken off the bill',
  unmatchFailed: 'The charge was not taken off the bill',
  fallbackBillName: 'A bill',
} as const;

/** A Horizon cost's payment marked paid, or taken back. */
export const COST_PAID_WORDS = {
  summary: (cost: string, item: string, due: string, amount: string) =>
    `Marked ${cost} paid on ${item}: ${amount} due\u00a0${due}.`,
  outsideSummary: (cost: string, item: string, due: string, amount: string) =>
    `Marked ${cost} paid outside the plan on ${item}: ${amount} due\u00a0${due}.`,
  undoText: (cost: string, item: string, due: string, gives: string | null) =>
    `Took back the ${due} payment of ${cost} on ${item}${gives === null ? '' : `: ${gives}`}`,
  confirm: (cost: string, item: string, due: string, gives: string | null) =>
    `${cost}'s ${due} payment on ${item} goes back to unpaid${gives === null ? '' : `. ${gives}`}.`,
  givesBackItem: (item: string, amount: string) =>
    `${item} gets ${amount} back`,
  givesBackGoal: (goal: string, amount: string) =>
    `${goal} gets ${amount} back`,
  goalSummary: (cost: string, event: string, amount: string) =>
    `Paid ${cost} for ${event}: ${amount} came from this goal.`,
  goalUndoSummary: (cost: string, event: string, amount: string) =>
    `Took back ${cost} for ${event}: ${amount} went back to this goal.`,
  givesBackFree: (amount: string) => `${amount} goes back to Free to Spend`,
  purchaseRemoved: 'the purchase is removed from Spend',
  confirmMark: (
    cost: string,
    totalCents: string,
    item: string,
    heldCents: string | null,
    freeCents: string,
    goal: string | null = null,
  ) =>
    heldCents === null
      ? `${cost} is ${totalCents}. ${item} has nothing left, so all ${freeCents} comes out of Free to Spend.`
      : `${cost} is ${totalCents}. ${goal === null ? `${item} has` : item === '' ? `${goal} has` : `${goal} and ${item} have`} ${heldCents} left; the other ${freeCents} comes out of Free to Spend.`,
  goalFallbackName: 'The goal',
  goalClosedTakeBack: (goal: string, amount: string) =>
    `${goal} is closed, so its ${amount} can't go back to it.`,
  confirmTitle: (cost: string) => `Mark ${cost} paid`,
  markRow: 'Mark paid',
  markOutsideRow: (cost: string) => `Mark ${cost} paid`,
  markSub: (amount: string, item: string) =>
    `${amount} comes from what ${item} has left`,
  markSubFree: (amount: string, item: string, free: string) =>
    `${amount} comes from ${item}; ${free} of it from Free to Spend`,
  markSubNothingLeft: (amount: string, item: string) =>
    `All ${amount} comes out of Free to Spend. ${item} has nothing left.`,
  markSubRange: 'Say what it came to',
  markSubOutside: (item: string) =>
    `You pay it yourself, so nothing comes from ${item}.`,
  paidRow: (paidOn: string, amount: string) =>
    `Paid ${paidOn}\u00A0· ${amount}`,
  paidOutsideRow: (paidOn: string) =>
    `Paid ${paidOn}\u00A0· outside\u00A0the\u00A0plan`,
  nothingFromItem: (item: string) => `Nothing came from ${item}`,
  paidHead: (paidOn: string, isOutside = false) =>
    isOutside
      ? `Paid ${paidOn}\u00A0· outside\u00A0the\u00A0plan`
      : `Paid ${paidOn}`,
  paidSheetTitle: (cost: string) => `${cost} payment`,
  cameTo: 'What it came to',
  fromItem: (item: string, amount: string) => `${amount} from ${item}`,
  fromFree: (amount: string) => `${amount} from Free to Spend`,
  outsideNote: 'Paid outside the plan. Nothing came from the item.',
  takeBack: 'Take it back',
  takeBackSubOutside: 'It goes back to unpaid. No money moves.',
  marked: (cost: string) => `Marked ${cost} paid`,
  markedFrom: (cost: string, amount: string, item: string) =>
    `Marked ${cost} paid · ${amount} from ${item}`,
  markedOutside: (cost: string) => `Marked ${cost} paid outside the plan`,
  unmarked: (cost: string) => `${cost} is not marked paid`,
  failed: (cost: string) => `${cost} was not marked paid`,
  notChanged: (cost: string) => `${cost} was not changed`,
  alreadyPaid: (cost: string) => `${cost} was already marked paid`,
  alreadyTakenBack: (cost: string) => `${cost} was already taken back`,
  rowHint: 'Varies · tick to say what it came to',
} as const;

/** Add what you paid: the purchase form pointed at a Horizon cost, and the purchase's own pick of the cost it pays (Track only). */
export const PURCHASE_COST_WORDS = {
  addRow: 'Add what you paid',
  addSub: 'Log it as a purchase',
  moreWays: 'More ways',
  addAria: (name: string) => `Add what you paid: ${name}`,
  whichTitle: 'Which cost does it pay?',
  whichLabel: 'Pays',
  pick: (cost: string, due: string) => `${cost}\u00A0· ${due}`,
  none: 'None of these',
  added: (cost: string, amount: string, item: string) =>
    `Added ${cost}, ${amount} from ${item}`,
  addedFree: (amount: string) => `${amount} came out of Free to Spend`,
  alreadyPaid: (cost: string) =>
    `${cost} was already marked paid, so nothing was added.`,
  undoFailed: (cost: string) => `${cost} was not taken back`,
  staysOnItem: (item: string) =>
    `This purchase pays a cost on ${item}, so it stays on ${item}. Take the payment back to move it.`,
  freeShort: (item: string, left: string, other: string) =>
    `${item} has ${left} left. The other ${other} comes out of Free to Spend.`,
  takeBackTitle: (cost: string) => `Take back ${cost}`,
  takeBackText: (amount: string, date: string, gives: string | null) =>
    `The ${amount} purchase on ${date} is removed from Spend.${gives === null ? '' : ` ${gives}.`} It stays in History.`,
  removeAlsoUnpays: (cost: string, item: string) =>
    cost === ''
      ? `It paid a cost on ${item}, which goes back to unpaid.`
      : `It paid ${cost} on ${item}, which goes back to unpaid.`,
  needsPaidBy: 'Pick how you paid to add this.',
  noPurchase: 'No purchase',
  paysSub: 'Paid by this purchase',
  stays: (item: string) => `It stays on ${item}`,
  noneHint: (item: string) => `Lowers what ${item} has left; pays no cost`,
  pickHint: (cost: string) => `Marks ${cost} paid`,
  paysFact: (cost: string, item: string) => `${cost}\u00A0on ${item}`,
  paysRow: (cost: string, item: string) => `${cost}\u00A0on ${item}`,
  lockedEnvelope: (cost: string, item: string) =>
    `It pays ${cost} on ${item}, so it stays on ${item}. Take the payment back to move it.`,
  forPayment: (due: string) => `For the ${due} payment`,
  paidFor: (due: string) => `for ${due}`,
  boughtIn: (name: string) => `${name}\u00A0· in Spend`,
  paidWith: (name: string) => `Charged to ${name}`,
  aPurchase: 'A purchase in Spend',
} as const;

/** Moving money out of an envelope or goal to another envelope or goal, or Free to Spend. */
export const MOVE_WORDS = {
  open: "Move what's left",
  openGoal: "Move what's saved",
  title: (name: string) => `Move money from ${name}`,
  amount: 'Amount to move',
  moveTo: 'Move it to',
  freeToSpend: 'Free to Spend',
  envelopes: 'Envelopes',
  goals: 'Goals',
  search: 'Search places',
  searchGoals: 'Search goals',
  noMatch: (query: string) => `Nothing matches “${query}”.`,
  needsAmount: 'Enter how much to move.',
  needsPlace: 'Pick where it goes.',
  tooMuch: 'That is more than is left in it.',
  tooMuchSaved: 'That is more than it holds.',
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

/** Turning a goal into an envelope and an envelope into a goal: the money and the history stay, a new item of the other kind takes over. */
export const CONVERT_WORDS = {
  toEnvelope: 'Make it an envelope',
  toEnvelopeSub: 'Keep the money, spend from it as you go',
  toGoal: 'Make it a goal',
  toGoalSub: 'Keep the money, save toward a target',
  target: 'Target',
  byWhen: 'Reach it by (optional)',
  noDate: 'No date',
  farDay: (months: number) =>
    `Pick a date within the next ${months} months, which is as far as the income days are planned, or remove it.`,
  reachedAtOnce: (name: string) =>
    `${name} already holds the target, so the goal would be reached at once.`,
  changesHeading: 'What changes',
  moneyStays: (amount: string) => `Its ${amount} and its history move with it.`,
  historyStays: 'Its history moves with it.',
  wontCarry: (parts: string) =>
    `${parts.charAt(0).toUpperCase()}${parts.slice(1)} won't carry over.`,
  limit: 'its limit',
  overflow: 'its overflow',
  homePin: 'its Home pin',
  targetAndDate: 'its target and date',
  targetOnly: 'its target',
  paused: 'It is paused, so nothing goes in for now.',
  plannedAhead: (count: number) =>
    `${count} planned ${count === 1 ? 'change' : 'changes'} ahead won't carry over.`,
  rulesPause: (rules: readonly string[]) =>
    rules.length === 1
      ? `Your rule “${rules[0]}” pauses, since a goal can't be spent from. Next you'll send it to another envelope.`
      : `${rules.length} shop rules that send spending here pause, since a goal can't be spent from. Next you'll send them to another envelope.`,
  lockedTitle: 'Not yet',
  lockedGoalLinked: (event: string) => `Linked to ${event}. Unlink it first.`,
  lockedPartOf: (event: string) => `Part of ${event}. Take it out there first.`,
  lockedOver: (name: string, amount: string) =>
    `${name} is ${amount} over. Set what it holds first.`,
  showToSet: 'Show amounts to set the target',
  blockedOver: 'It is over. Set what it holds first.',
  showToConvert: 'Show amounts to see what moves across first',
  payWontCarry: (names: string) =>
    `${names} won't put money into it first anymore.`,
  daysWontCarry: (count: number) =>
    `${count} income ${count === 1 ? 'day' : 'days'} ahead with changes for it won't carry over.`,
  spillWontCarry: (names: string[]) =>
    names.length === 1
      ? `${names[0]}'s extra won't spill into it anymore.`
      : `The extra from ${formatList(names)} won't spill into it anymore.`,
  toGoalSummary: (name: string, amount: string | null) =>
    `Made ${name} a goal${amount === null ? '' : `, ${amount} moved across`}.`,
  toEnvelopeSummary: (name: string, amount: string | null) =>
    `Made ${name} an envelope${amount === null ? '' : `, ${amount} moved across`}.`,
  undoSummary: (name: string, was: 'envelope' | 'goal') =>
    `Undid making ${name} ${was === 'envelope' ? 'a goal' : 'an envelope'}. It is ${was === 'envelope' ? 'an envelope' : 'a goal'} again.`,
  nowGoal: (name: string) => `${name} is now a goal`,
  nowEnvelope: (name: string) => `${name} is now an envelope`,
  undoneGoal: (name: string) => `${name} is an envelope again`,
  undoneEnvelope: (name: string) => `${name} is a goal again`,
  undo: 'Undo',
  undoFailed: 'That was not undone.',
  undoShort: (name: string) =>
    `${name} has used some of the money since, so this can't be undone.`,
  undoLater: (name: string) =>
    `${name} has its own history now, so this can't be undone.`,
  undoChanged: 'It was changed since, so nothing was undone.',
  alreadyDone: 'That was already changed.',
  offline: 'This needs a connection. Nothing was changed.',
  failed: 'This did not save. Nothing was changed.',
} as const;

export const SET_HELD_WORDS = {
  open: 'Set what it holds now',
  title: (name: string) => `What ${name} holds now`,
  amount: 'Holds now',
  needsAmount: 'Enter what it holds.',
  sourceIn: 'Where did it come from?',
  sourceOut: 'Where did it go?',
  unchanged: 'That is what it holds already.',
  action: 'Set what it holds',
  moved: (name: string) => `Updated what ${name} holds`,
  moneyOnHand: 'Money on hand',
  needsSourceRaise: 'Choose where the money came from.',
  needsSourceLower: 'Choose where the money went.',
  outsideIn: {
    title: 'Money from outside the plan',
    body: 'Another account, a gift or a correction. Free to Spend stays the same.',
  },
  freeOut: {
    title: 'From Free to Spend',
    body: (amount: string) => `Your spare cash goes down by ${amount}.`,
  },
  outsideOut: {
    title: 'It left the plan',
    body: 'Spent elsewhere or moved out. Free to Spend stays the same.',
  },
  freeIn: {
    title: 'Back to Free to Spend',
    body: (amount: string) => `Your spare cash goes up by ${amount}.`,
  },
  accountIn: {
    title: (account: string) => `From ${account}`,
    body: (amount: string, spare: string, isCounted: boolean) =>
      `Uses ${amount} of the ${spare} in it not set aside. ${isCounted ? `Your spare cash goes down by ${amount}.` : 'Free to Spend stays the same.'}`,
    short: (spare: string) =>
      `Only ${spare} in it is free. Pick another way below.`,
    none: 'All of it is set aside. Pick another way below.',
    unknown: 'Its balance is not known yet. Pick another way below.',
    hidden: 'Show amounts to see what is free in it.',
  },
  accountOut: {
    title: (account: string) => `Back to ${account}`,
    body: (amount: string, isCounted: boolean) =>
      `It stays in the account, not set aside. ${isCounted ? `Your spare cash goes up by ${amount}.` : 'Free to Spend stays the same.'}`,
  },
  summaryOutsideIn: (amount: string, name: string) =>
    `Added ${amount} to ${name} from outside the plan.`,
  summaryOutsideOut: (amount: string, name: string) =>
    `Took ${amount} out of ${name}. It left the plan.`,
  undoneOutsideIn: (amount: string, name: string) =>
    `Took ${amount} back out of ${name}`,
  undoneOutsideOut: (amount: string, name: string) =>
    `Put ${amount} back in ${name}`,
} as const;

/** A bill's "Already put aside": money added to what is set aside for its payments, never taken out. */
export const BILL_SET_ASIDE_WORDS = {
  open: 'Already put aside',
  openSub: (held: string, total: string) => `${held} of ${total}`,
  openSubNone: 'Nothing yet',
  openSubFull: (total: string) => `All ${total} of the next payment`,
  openSubCovered: (covered: string) =>
    `Nothing put aside · ${covered} covered from Free to Spend`,
  progressCovered: 'Covered from Free to Spend',
  progressPartCovered: (held: string, covered: string) =>
    `${held} put aside · ${covered} covered`,
  coverNote: (covered: string, dueOn: string) =>
    `${covered} is covered from Free to Spend until ${dueOn}, since your pays won't reach it in time. Put money aside yourself to hold it here instead.`,
  openSubPartCovered: (held: string, covered: string) =>
    `${held} put aside · ${covered} covered from Free to Spend`,
  title: (name: string) => `Put money aside for ${name}`,
  amount: 'Put aside',
  needsAmount: 'Enter how much to put aside.',
  action: 'Put it aside',
  moved: (amount: string, name: string) => `Put ${amount} aside for ${name}`,
  outsideIn: {
    title: 'Already saved elsewhere',
    body: 'In another account or in cash. Free to Spend stays the same.',
  },
  setAside: (name: string) => `${name}, put aside`,
  sourceQuestion: 'Where does it come from?',
  addTitle: 'Already put aside for it?',
  addLabel: 'Already put aside',
  addAmount: 'Amount',
  addNone: 'None yet',
  addHint: 'Saved for its next payment. Leave it empty if none.',
  notRecorded: (name: string) =>
    `${name} was added, but what is set aside for it did not record. Open the bill and choose Already put aside.`,
} as const;

export const PROBLEM_WORDS = {
  title: 'Things to fix',
  one: '1 thing to fix',
  many: (count: number) => `${count} things to fix`,
  stanceTitle: 'Planning at the safe end',
} as const;

/** Envelope tiles Home shows at Track, two to a row. */
export const HOME_TILE_COUNT = 4;

export const HOME_PIN_WORDS = {
  pin: 'Pin to Home',
  pinSub: 'It shows first on Home',
  unpin: 'Unpin from Home',
  unpinSub: 'It goes back to its usual place',
  fullSub: `${HOME_TILE_COUNT} already pinned. Make room first`,
  full: `Home already shows ${HOME_TILE_COUNT} pinned envelopes. Unpin one first.`,
  title: 'Pinned on Home',
  subtitle: 'They take the first tiles on Home, in this order.',
  arrange: 'Arrange pinned',
  pinned: 'Pinned',
  pinThis: (name: string) => `Pin ${name}`,
  moveUp: (name: string) => `Move ${name} up`,
  moveDown: (name: string) => `Move ${name} down`,
  unpinOne: (name: string) => `Unpin ${name}`,
  pinnedToast: (name: string) => `${name} is pinned to Home`,
  unpinnedToast: (name: string) => `${name} is no longer pinned`,
  failed: "Your pins weren't saved. Check your connection and try again.",
} as const;
/** How many days ahead Home warns that a card with money waiting is due. */
export const CARD_DUE_WARN_DAYS = 7;
/** How many days ahead Home's warning row counts a Horizon shortfall. */
export const HORIZON_WARN_DAYS = 30;

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
    "Tie together the bills, envelopes and goals that look after the same thing, like Pets or Home, to see what it costs you each month. It doesn't change how anything is funded.",
  group: 'For',
  noGroup: 'Nothing set',
  newGroup: 'Something else',
  newGroupPlaceholder: 'Like Pets or Home',
  clearGroup: 'Nothing',
  nameGroup: "Name what it's for, or choose Nothing.",
  emojiTitle: 'Pick an emoji, if you like',
  emoji: 'Emoji',
  noEmoji: 'None',
  maxTitle: 'Stop filling at',
  max: 'Stop filling at',
  maxHint: 'It gets nothing more once it holds this much.',
  extrasTitle: "Should it get more when there's room?",
  extras: "Extra when there's room",
  noExtras: 'None',
  extraAsShould: 'Extra as a Should',
  extraAsWant: 'Extra as a Want',
  /** Said where the extras question was when a change leaves an extra with nowhere to go. */
  extrasDropped: (extras: string, why: string) =>
    `${why}, so ${extras} comes off when you save.`,
  extrasDroppedWant: 'A Want has no lower level for an extra',
  extrasDroppedLevel: "An extra sits below its item's own level",
  extrasDroppedAmount: 'Only an exact amount on a schedule can get an extra',
  extrasHint:
    'Paid after everything above it, so a short income day trims it first.',
  noMax: 'No limit',
  clearMax: 'Remove the limit',
  billAmountTitle: 'How much is it?',
  expenseAmountTitle: 'How much will it be?',
  amount: 'Amount',
  dueTitle: 'When is it due?',
  nextDueTitle: 'When is it next due?',
  due: 'Due',
  dueLater: "I'll add it later",
  dueLaterSummary: 'Later',
  repeatsTitle: 'Does it repeat?',
  repeats: 'Repeats',
  payOnTitle: 'When do you pay it?',
  payOn: 'You pay it',
  payOnDue: 'On the due date',
  payOnSetDay: 'On a set day',
  payOnDayLabel: 'Day of the month you pay it',
  payOnLastDay: 'On the last day of the month',
  payOnDaySummary: (ordinal: string) => `On the ${ordinal}`,
  payOnNote: (payOn: string, dueOn: string) =>
    `Runway has it ready by ${payOn}, ahead of its ${dueOn} due date.`,
  endsTitle: 'Does it end?',
  ends: 'Ends',
  fundingTitle: 'Which income days pay for it?',
  funding: 'Comes out of',
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
  expectedExpense: 'A bill or one-time cost',
  expectedExpenseSub: 'Something you will pay, set aside from income days.',
  expectedHorizon: 'Something with several costs',
  expectedHorizonSub: 'A move, a wedding, a surgery: list what it will cost.',
  purchaseAmountTitle: 'How much was it?',
  refundAmountTitle: 'How much came back?',
  purchaseForTitle: 'What was it for?',
  refundForTitle: 'Where should the refund go?',
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
  dayPassed: 'That day has passed.',
  pickRepeat: 'Pick how often it repeats.',
  pickEvery: (unit: 'months' | 'years') =>
    unit === 'years'
      ? 'Pick 1 to 10 years apart.'
      : 'Pick 2 to 120 months apart.',
  savedUpSummary: 'saved up each pay',
  every: 'Every',
  everyCount: 'How many',
  everyUnit: 'Months or years',
  savingUpNote: (amount: string | null, dueOn: string | null) =>
    amount && dueOn
      ? `Runway sets aside a little of each pay toward the ${amount}, so it's ready by ${dueOn}.`
      : "Runway sets aside a little of each pay toward it, so it's ready when it's due.",
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
/** How far the plan covers the bills, always counted from today so a date never needs its year to read. */
export const COVERAGE_WORDS = {
  clear: `Your plan covers every bill for the next ${LOOKAHEAD_MONTHS} months`,
  clearTail: `covers every bill for the next ${LOOKAHEAD_MONTHS} months`,
  untilIncomeEnds: (on: string) =>
    `Your plan covers every bill until your last income day, ${on}`,
  untilIncomeEndsTail: (on: string) =>
    `covers every bill until your last income day, ${on}`,
  shortLead: 'Your plan comes up short',
  stillShort: (on: string) => `Your plan still comes up short on ${on}.`,
  stillShortOf: (name: string, on: string) =>
    `Your plan already comes up short for ${name} on ${on}, before this change.`,
};

export const ITEM_SHEET_R2_WORDS = {
  moreDetails: 'More details',
  showToChange: 'Show amounts to change it',
  change: 'Change',
  changeBillSub: 'Amount, name, due date and more',
  changeAmountSub: 'Amount, name and more',
  changeOftenSub: 'How often, amount, name and more',
  changeTargetSub: 'Target, name and more',
  firstDateNote: 'Nothing is set aside for it until it has a date.',
  pauseSub: 'Nothing new goes in',
  resumeSub: 'Money goes in again from the next income day',
  startSavingSub: 'Pick how often and how much goes in',
  endSub: 'It stops after the day you pick',
  archiveSub: 'Off your lists. Its history stays',
  checkSub: 'Try an amount first. Nothing changes.',
  paidFromFreeText: (amount: string) => `${amount} comes out of Free to Spend`,
  stopsAt: (amount: string) => `Stops filling at ${amount}`,
  setDueDate: 'Set the due date',
  eachTime: 'Each time',
  balance: 'Balance',
  changeName: 'Change name',
  heldDetail: (amount: string) => `${amount} held · choose`,
  toppedUp: 'Topped up',
  setAsideHeading: 'Comes out of this pay',
  holdsThroughUndated: 'not counting bills with no due date',
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
export const HOW_OFTEN_WORDS = {
  title: 'How often does it get money?',
  goalTitle: 'How often does money go in?',
  caption: 'How often',
  paycheck: 'From a paycheck',
  /** The folded "How often" row once it was skipped. */
  skippedSummary: {
    envelope: 'Not set yet',
    goal: 'Not saving for it yet',
  },
  skippedNote: 'Pick one above when you are ready',
  /** The line under "Skip for now". */
  skipNote: {
    envelope: 'Nothing goes in until you set it',
    goal: 'Nothing goes in until you start saving for it',
  },
  /** An envelope nothing goes into, as its row and history say it. */
  envelopeIdle: 'Nothing goes in for now',
  /** The same state inside a change line ("Funding nothing for now to $150.00 a month"). */
  idleInChange: 'nothing for now',
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
  needsIncome: 'Add an income source first, so there are pays to count.',
  badAmount: 'Enter an amount above $0, like 600.00.',
  currentTitle: 'How much is in it now?',
  current: 'In it now',
  currentHint: 'Leave it at $0 if you are starting from nothing.',
  holdingNotRecorded: (name: string) =>
    `${name} was added, but what is in it now did not record. Add it under Where things stand.`,
  notBeingAdded: 'Not saving for it yet',
} as const;

/** The "Comes out of" question an envelope's or goal's funding asks when there is more than one pay. */
export const FUNDING_PAY_WORDS = {
  title: 'Which pay does it come out of?',
  label: 'Comes out of',
  everyPay: 'Every pay',
  percentOfPay: (pay: string) => `of ${pay}`,
  suffix: (pay: string) => `from ${pay}`,
  /** The change log's phrase when no one pay is picked. */
  logEveryPay: 'every pay',
  gone: 'Its pay is no longer in the plan, so nothing goes in',
} as const;

/** Round 4, package C: Home, Days, Plan and Spend screens. */
export const FIX_WORDS = {
  noIncome: (name: string) => `${name} has no income before it is due`,
  noIncomeMany: (names: readonly string[]) =>
    names.length <= 3
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} have no income before they are due`
      : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more have no income before they are due`,
  firstDueOn: (date: string) => `The first is due\u00a0${date}`,
  noPick: (name: string) =>
    `${name} comes from a pay that is not before it is due`,
  short: (name: string, amount: string) => `${name} ${amount} short`,
  dueOn: (date: string) => `Due\u00a0${date}`,
  runsShortOn: (date: string) => `On ${date}`,
  frontedShort: (name: string) => `Free to Spend can't cover ${name}`,
  frontedOn: (date: string, pay: string) => `On ${date}, before the ${pay} pay`,
  frontedSummary: (name: string, date: string, pay: string) =>
    `Free to Spend can't cover ${name} on ${date} before the ${pay} pay`,
  openDay: 'Open this income day',
  openUndated: 'See the bills with no due date',
  openPaidFrom: 'Change which pay it comes from',
  openIncomeEnd: 'Change when your pay ends',
  addIncome: 'Add expected money',
  needsDate: (names: readonly string[]) =>
    names.length === 1
      ? `${names[0]} needs a due date`
      : names.length <= 3
        ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} need a due date`
        : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more need a due date`,
  nothingSetAside: (count: number) =>
    count === 1
      ? 'Nothing is set aside for it until then'
      : 'Nothing is set aside for them until then',
  openDueBill: 'Set its due date',
  incomeEnds: (date: string) =>
    `Your last income day is ${date}. Nothing is planned after it.`,
} as const;

export const DAYS_VIEWS = ['list', 'calendar'] as const;

export const DAYS_CALENDAR_WORDS = {
  viewLabel: 'Days view',
  list: 'List',
  calendar: 'Calendar',
  previousMonth: 'Show the previous month',
  nextMonth: 'Show the next month',
  today: 'Today',
  legend: {
    income: 'Income',
    bill: 'Bill',
    card: 'Card due',
    goal: 'Goal date',
    goalBehind: 'Goal behind',
    planChange: 'Plan change',
  },
  monthTotals: (income: string, bills: string) =>
    `In ${income} · Bills ${bills}`,
  monthIncomeOnly: (income: string) => `In ${income}`,
  monthBillsOnly: (bills: string) => `Bills ${bills}`,
  nothingOnDay: 'Nothing due or coming in on this day.',
  goalDate: 'Goal date',
  more: (count: number) => `+${count}`,
  dayLabel: (date: string, count: number) =>
    count === 0
      ? date
      : `${date}, ${count} ${count === 1 ? 'thing' : 'things'}`,
} as const;

export const PLAN_CHANGE_WORDS = {
  stops: (name: string) => `${name} stops`,
  starts: (name: string) => `${name} starts`,
  returns: (name: string) => `${name} returns`,
  changes: (name: string) => `${name} changes`,
  noticeLead: 'Different this time',
  notice: (names: string) => `Different this time: ${names}`,
  more: (count: number) => `and ${count} more`,
  viewTitle: 'Different this time',
  viewSub: 'Planned changes that start or end since the last pay.',
} as const;

/** The coming-changes row, a change's own sheet and the "What will change?" question. */
export const COMING_WORDS = {
  changesOn: (date: string, figures: string) => `${figures} from ${date}`,
  changesOnPlain: (date: string) => `Changes ${date}`,
  startsOn: (date: string) => `Starts ${date}`,
  withEvent: (text: string, event: string) => `${text} \u00b7 ${event}`,
  many: (count: number, first: string) =>
    `${count} coming changes \u00b7 first on ${first}`,
  backAfter: (lastDay: string) => `Back after ${lastDay}`,
  goesTo: (name: string, figure: string) => `${name} goes to ${figure}`,
  goesBackTo: (name: string, figure: string) =>
    `${name} goes back to ${figure}`,
  lineChanges: (name: string, figures: string, date: string) =>
    `${name}: ${figures} from ${date}`,
  lineChangesPlain: (name: string, date: string) =>
    `${name} changes from ${date}`,
  lineStopsSaving: (name: string, date: string) =>
    `${name} stops saving from ${date}`,
  lineEnds: (name: string, lastDay: string) => `${name} ends after ${lastDay}`,
  lineStarts: (name: string, date: string) => `${name} starts ${date}`,
  lineReturns: (name: string, figure: string, lastDay: string) =>
    `${name} goes back to ${figure} after ${lastDay}`,
  lineReturnsPlain: (name: string, lastDay: string) =>
    `${name} goes back after ${lastDay}`,
  untilOnly: (lastDay: string) => `Until ${lastDay}`,
  listTitle: 'Coming changes',
  thingsChange: (count: number) => `${count} things change`,
  dayListTitle: (day: string) => `Changing ${day}`,
  whatChanges: 'What changes',
  whenCaption: 'When',
  from: (date: string) => `From ${date}`,
  until: (lastDay: string) => `Until ${lastDay}, then it goes back`,
  stopsAfter: (lastDay: string) => `Stops after ${lastDay}`,
  partOfCaption: 'Part of',
  openEventSub: 'Open the event',
  tie: 'Tie to an event',
  tieSub: 'Group it with the rest of what is coming',
  changeEvent: 'Change event',
  untie: (event: string) => `Untie from ${event}`,
  untieSub: 'The change stays. It just is not part of the event.',
  tieTitle: 'Which event is it part of?',
  tieNone: 'No open events to tie it to.',
  tieOn: (event: string) => `Tied to ${event}`,
  untied: (event: string) => `Untied from ${event}`,
  tieFailed: 'This did not save. Nothing was changed.',
  cancel: 'Cancel this change',
  cancelSub: 'It never happens. What you have now stays.',
  cancelConfirm: 'Cancel the change',
  cancelKeep: 'Keep it',
  cancelTitleChange: (name: string, figures: string, date: string) =>
    `Cancel ${name} ${figures} from ${date}?`,
  cancelTitlePlain: (name: string, date: string) =>
    `Cancel the change to ${name} from ${date}?`,
  cancelTitleStop: (name: string, lastDay: string) =>
    `Cancel ${name} ending after ${lastDay}?`,
  cancelTitleStart: (name: string, date: string) =>
    `Cancel ${name} starting ${date}?`,
  cancelBody: 'Nothing else changes. You can plan it again any time.',
  cancelEntry: (name: string, what: string, date: string) =>
    `Cancelled: ${name} ${what} from ${date}`,
  cancelEntryStop: (name: string) => `${name} won't end after all`,
  cancelled: (name: string) => `Cancelled the change to ${name}`,
  cancelFailed: 'This did not cancel. Nothing was changed.',
  gone: 'That change is no longer there.',
  planChange: 'Plan a change',
  planTitle: 'What will change?',
  planAmount: 'A new amount from a date',
  planAmountSub: 'It stays that way until you change it again',
  planStretch: 'A different amount for a while',
  planStretchSub: 'Then it goes back to what it is now',
  planStop: 'It stops on a date',
  planStopSub: 'Its history stays',
  planStopGoalSub: 'The goal ends. Its history stays.',
  planPause: 'Pause it',
  planPauseSub: 'Stop it for a while, then it comes back',
  planStopSaving: 'Stop saving from a date',
  planStopSavingSub: 'The goal stays. No new money goes in.',
  planNone: 'Nothing can be planned for this one.',
  somethingNew: 'Something new',
  somethingNewSub: 'A new pay, bill, envelope or goal that starts later',
  newTitle: 'What is new?',
  newPaySub: 'Money that starts coming in',
  newBillSub: 'Something you will start paying',
  newEnvelopeSub: 'Money you will start setting aside to spend',
  newGoalSub: 'Something you will start saving for',
  newStartsTitle: 'When does it start?',
  newStartsLabel: 'Starts on',
  newStartsBlocker: 'Pick a day after today, within ten years.',
  newNext: 'Next',
} as const;

export const PAUSE_PAY_WORDS = {
  label: 'Pause it',
  subtitle: 'Stop it for a while, then it comes back',
  zeroOnlyPause: 'Zero pay is only for a while. Pick when it comes back.',
} as const;

export const DAYS_WORDS = {
  confirmed: 'Confirmed',
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
  horizon: '🗓️',
  cards: '💳',
} as const;

export const PLAN_MORE_LABEL = 'Settings and tools';

/** The Plan tab's overview: the tiles that open each view, their Monthly | Total switch and the pull that reveals them. */
export const PLAN_OVERVIEW_WORDS = {
  tilesLabel: 'Plan overview',
  modeLabel: 'What the tiles show',
  modes: [
    { value: 'monthly', label: 'Monthly' },
    { value: 'total', label: 'Total' },
  ],
  viewAll: 'View all',
  viewLess: 'View less',
  pullHint: 'Keep pulling to refresh Runway',
  releaseHint: 'Let go to refresh Runway',
  refreshing: 'Refreshing Runway',
  nothingYet: 'Nothing yet',
  monthly: 'a month',
  dueBeforePay: (payDay: string) => `due before your ${payDay} pay`,
  nothingBeforePay: (payDay: string) => `Nothing due before your ${payDay} pay`,
  inEnvelopes: 'in your envelopes',
  savedOf: ' of ',
  nothingShort: 'Nothing short',
  shortInTotal: 'short in total',
  onHorizon: 'on your horizon',
  setAside: 'set aside',
  tileAria: (name: string, figure: string) => `${name} · ${figure}. Open`,
  priorityTotal: (counted: string) => `${counted}: `,
  priorityRest: ' a month',
  priorityHelpTitle: 'What this counts',
  priorityHelp:
    'Bills, envelopes, goals and Horizon items at the priorities the dial counts. For Horizon, it is what to set aside each month to meet every cost on its date, each cost at its own priority.',
} as const;

/** Quick periods on Spend, as the URL keeps them; any other value is a month as `yyyy-mm`. */
export const SPEND_PERIODS = ['month', 'lastMonth', '30', '90'] as const;
export const DEFAULT_SPEND_PERIOD = 'month' as const;

/** What Spend's Kind filter narrows to, as the URL keeps it; none shows every purchase and refund that counts. */
export const SPEND_KINDS = [
  'purchases',
  'moneyIn',
  'refunds',
  'notCounted',
] as const;

export const SPEND_FILTER_WORDS = {
  label: 'Filter purchases',
  kind: 'Kind',
  kinds: {
    purchases: 'Purchases',
    moneyIn: 'Money in',
    refunds: 'Refunds',
    notCounted: 'Not counted',
  },
  paidWith: 'Card or account',
  amount: 'Amount',
  amountLabel: 'Amount range',
  amountChip: (from: string, to: string) => `${from} to ${to}`,
  minLabel: 'Lowest amount',
  maxLabel: 'Highest amount',
  notCountedHelp: 'Left out of spending, or from before you linked.',
  moneyInHelp:
    'Deposits and refunds. Moves between your own accounts are left out.',
  refundsHelp: 'Money a store or a card gave back.',
  cameBack: 'Came back',
  inFree: 'In Free to Spend',
  toPay: 'Your pay',
  cameIn: 'Came in',
  onItsWay: 'On its way',
  onItsWayIntro:
    'The bank has not settled these yet, so they don’t count as money in until they clear.',
  onItsWayPending: 'Not counted until it clears',
  waitingFor: (account: string) => `Waiting for ${account} to clear`,
  otherAccount: 'the other account',
  show: (count: number) =>
    `Show ${count} ${count === 1 ? 'purchase' : 'purchases'}`,
  showShort: (count: number) => `Show ${count}`,
} as const;

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

const skippedText = (skipped: readonly string[]) =>
  skipped.length === 0
    ? ''
    : `${formatList([...skipped])} ${skipped.length === 1 ? 'has' : 'have'} nothing left, so `;

export const SPILL_WORDS = {
  ranOut: (name: string, parts: string) => `${name} ran out: ${parts}`,
  part: (amount: string, source: string) => `${amount} from ${source}`,
  runsOut: (name: string, skipped: readonly string[], parts: string) =>
    `${name} runs out: ${skippedText(skipped)}${parts}.`,
  sheetCaption: (name: string) => `${name} ran out, so the rest came from`,
  sheetCaptionHidden: 'Split across envelopes',
  row: 'When it runs out',
  rowEmpty: 'Nothing set; Cover it when it\u2019s over',
  title: (name: string) => `When ${name} runs out`,
  hint: 'They pay in this order; Free to Spend pays whatever they can\u2019t.',
  add: 'Add an envelope',
  pickTitle: 'Which envelope pays next?',
  moveUp: 'Move up',
  moveDown: 'Move down',
  remove: 'Remove',
  nothing: 'Nothing set. Cover it applies when this envelope is over.',
  exampleCents: 3_000,
  example: (amount: string, skipped: readonly string[], parts: string) =>
    `A ${amount} overspend: ${skippedText(skipped)}${parts}.`,
  exampleHidden: 'Show amounts to see an example',
  free: 'Free\u00a0to\u00a0Spend',
  toast: (name: string) => `Saved what pays when ${name} runs out`,
  toastCleared: (name: string) => `${name} no longer spills over`,
  summary: (name: string, chain: string) =>
    `${name}: when it runs out, ${chain}.`,
  summaryCleared: (name: string) =>
    `${name}: nothing set for when it runs out.`,
  saveFailed: 'Could not save. Nothing was changed.',
} as const;

export const CHECK_RESULT_WORDS = {
  fits: 'It fits',
  left: 'left',
  over: (name: string) => `${name} would be over`,
  overBy: 'over',
  free: 'Free to Spend',
  fromFree: 'It could come from Free to Spend, then the lowest priority first',
  fromOthers: 'It could come from, lowest priority first',
  fromChain: 'It would come from, in the order you set',
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
  horizon: 'event',
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
  setDue: 'Set one due date',
  setDueSub: (count: number, isAll: boolean) =>
    isAll
      ? `For all ${count} bills in this group`
      : `For the ${count} bills it can change`,
  duePickDay: 'Pick a day to continue',
  dueUndone: 'Due dates put back',
  dueUndoPartial: (done: number, total: number, failed: string[]) =>
    `Put back ${done} of ${total} due dates. ${failed.join(', ').replace(/, ([^,]*)$/, ' and $1')} did not change back.`,
  dueUndoStale: (names: string[]) =>
    `${names.join(', ').replace(/, ([^,]*)$/, ' and $1')} changed since, so ${names.length === 1 ? 'it was' : 'they were'} left as is.`,
  dueUndoFailed: 'The due dates did not change back. Nothing was undone.',
  dueQuestion: 'When are they all due?',
  dueCaption: 'Due',
  dueAction: 'Set the due date',
  dueNothingToChange: 'Every bill here already has this due date.',
  dueSkipped: (count: number) =>
    count === 1
      ? '1 bill keeps its own date: it is paid, ends first or repeats its own way.'
      : `${count} bills keep their own dates: paid, ending first or repeating their own way.`,
  dueReplaceTitle: 'Replace their due dates?',
  dueReplaceBody: (bills: string[], date: string, repeats: string | null) =>
    `${
      bills.length <= 3
        ? bills.join(', ').replace(/, ([^,]*)$/, ' and $1')
        : `${bills.slice(0, 2).join(', ')} and ${bills.length - 2} more`
    } already ${bills.length === 1 ? 'has a due date' : 'have due dates'}. Replace ${bills.length === 1 ? 'it' : 'them'} with ${date}?${repeats ? ` ${repeats}` : ''}`,
  dueDone: (count: number, date: string) =>
    `Due\u00a0${date} on ${count} ${count === 1 ? 'bill' : 'bills'}`,
  dueReplace: 'Replace',
  dueToast: (count: number) =>
    `Set the due date on ${count} ${count === 1 ? 'bill' : 'bills'}`,
  duePartial: (done: number, total: number, failed: string[]) =>
    `Set the due date on ${done} of ${total} bills. ${failed.join(', ').replace(/, ([^,]*)$/, ' and $1')} did not save; the others did.`,
  dueFailed: 'The due date did not save. Nothing was changed.',
  dueSummary: (name: string, change: string, from: string) =>
    `${name}: ${change}, from ${from}.`,
  ungrouped: 'Other bills',
  ungroupedEnvelopes: 'Other envelopes',
  ungroupedGoals: 'Other goals',
  setTip:
    'Tip: say what a bill, envelope or goal is for, like Pets, to see what it costs each month.',
  perMonth: (amount: string) => `${amount} a month`,
  saved: 'saved',
  goalsHelpTitle: 'What your goals add up to',
  savingToward: (amount: string) => `Saving toward ${amount} in all.`,
  notSavingFor: (count: number) =>
    `${count} ${count === 1 ? 'goal' : 'goals'} you are not saving for yet`,
  monthLabel: 'Together, each month',
  openLabel: (name: string) => `${name}, open`,
  rename: (name: string) => `Rename ${name}`,
  nameLabel: 'Name',
  startingPriority: 'Priority',
  startingPriorityHelp:
    'Each bill, envelope or goal here takes the priority you pick, with any extra folded into one amount, and so does a new one you add. You see what changes before anything is saved. None changes nothing now; a new one starts at Should.',
  priorityRowLabel: {
    all: 'Everything',
    bill: 'Bills',
    envelope: 'Envelopes',
    goal: 'Goals',
  } as Record<'all' | 'bill' | 'envelope' | 'goal', string>,
  priorityMixed: 'Mixed',
  priorityScope: (row: 'all' | 'bill' | 'envelope' | 'goal', group: string) =>
    row === 'all'
      ? `everything in ${group}`
      : row === 'bill'
        ? `${group}'s bills`
        : row === 'envelope'
          ? `${group}'s envelopes`
          : `${group}'s goals`,
  priorityConfirmTitle: (scope: string, priority: string) =>
    `Set ${scope} to ${priority}?`,
  priorityConfirmLead: (priority: string) =>
    `New ones you add start at ${priority} too. This replaces the priority set on each of these:`,
  priorityNoneSet: (
    row: 'all' | 'bill' | 'envelope' | 'goal',
    group: string,
    kinds: readonly ('bill' | 'envelope' | 'goal')[],
  ) =>
    `New ${joinNames(
      (row === 'all' ? kinds : [row]).map((kind) => `${kind}s`),
    )} in ${group} start at Should, as they do anywhere. Nothing already there changed.`,
  priorityMoves: (name: string, from: string, to: string) =>
    `${name} goes from ${from} to ${to}`,
  priorityFolds: (
    name: string,
    priority: string,
    total: string | null,
    parts: string[],
  ) =>
    `${name} becomes ${priority} for ${total === null ? 'its full amount' : `the full ${total}`} (was ${parts.join(' + ')})`,
  priorityAlsoMoves: (fold: string, from: string, to: string) =>
    `${fold}; where it was ${from}, it becomes ${to} too`,
  priorityConfirmMore: (count: number) => `and ${count} more`,
  priorityConfirm: (priority: string) => `Set to ${priority}`,
  prioritySummary: (
    priority: string,
    group: string,
    lines: string[],
    date: string,
  ) =>
    `Set to ${priority} with the ${group} group, from ${date}: ${lines.join('; ')}.`,
  priorityDone: (count: number, priority: string) =>
    `${count === 1 ? '1 item is' : `${count} items are`} now ${priority}.`,
  priorityAlready: (scope: string, priority: string) =>
    `${scope.charAt(0).toUpperCase()}${scope.slice(1)} ${scope.startsWith('everything') ? 'is' : 'are'} already ${priority}.`,
  priorityStale: (names: string[], priority: string) =>
    `${joinNames(names)} ${names.length === 1 ? 'is' : 'are'} not fully ${priority}.`,
  priorityMakeAll: (priority: string) => `Make all ${priority}`,
  priorityFailed: 'The priority did not save. Nothing was changed.',
  priorityMoved:
    'Something in this group changed while you were deciding, so nothing was saved. Pick the priority again to see the new list.',
  priorityTooMany:
    'That changes too many items to save at once. Change one section at a time.',
  priorityApplying: 'Changing priorities…',
  noPriority: 'None',
  archive: (name: string) => `Stop using ${name}`,
  archiveSub: 'Its bills, envelopes and goals stay, with nothing set.',
  archiveTitle: (name: string) => `Stop using ${name}?`,
  archiveBody: (bills: number, envelopes: number, goals: number) =>
    bills + envelopes + goals === 0
      ? 'Nothing is for it right now.'
      : `Its ${countMembers(bills, envelopes, goals)} stay in your plan, with nothing set.`,
  archived: (name: string, bills: number, envelopes: number, goals: number) =>
    bills + envelopes + goals === 0
      ? `Stopped using ${name}.`
      : `Stopped using ${name}. Its ${countMembers(bills, envelopes, goals)} now have nothing set.`,
  archivedToast: (name: string) => `Stopped using ${name}`,
  addBill: (name: string) => `Add a bill for ${name}`,
  addEnvelope: (name: string) => `Add an envelope for ${name}`,
  addGoal: (name: string) => `Add a goal for ${name}`,
  billsHeading: 'Bills',
  envelopesHeading: 'Envelopes',
  goalsHeading: 'Goals',
  changeLabel: 'For',
  inGroup: 'For',
  none: 'Nothing',
  unset: 'Nothing set',
  oneTimeNote: 'Not in monthly total',
  noBills: 'Nothing here yet',
  noSetMonthly: 'No set amount a month',
  savedWord: 'saved',
  nameTaken: (name: string) => `You already have ${name}.`,
  oneTimeDue: (date: string) => `due\u00a0${date}`,
  oneTimeCount: (count: number) => `in ${count} one-time bills`,
  oneTimeLabel: 'Together, one-time',
  moved: (item: string, name: string) => `${item} is now for ${name}`,
  movedOut: (item: string, name: string) => `${item} is no longer for ${name}`,
  movedClear: (item: string) => `${item} is for nothing now`,
  willBe: (name: string) => `It will be for ${name}.`,
  plusOneTime: (amount: string, count: number, due: string | null) =>
    count === 1 && due !== null
      ? `Plus ${amount} due\u00a0${due}`
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
    'A bill, envelope or goal that varies counts at its low and its high amount, so the total is a range.',
  basis:
    'A usual month: each repeating bill at what it comes to in an average month, and each envelope or active goal at what it gets in one. A one-time bill is not in it.',
  onlyBills: (name: string, part: string | null, whole: string | null) =>
    part === null || whole === null
      ? `This counts bills only. Tap ${name} to see everything in it.`
      : `Bills come to ${part} of ${name}'s ${whole} a month. Tap ${name} to see everything in it.`,
  onlyEnvelopes: (name: string, part: string | null, whole: string | null) =>
    part === null || whole === null
      ? `This counts envelopes only. Tap ${name} to see everything in it.`
      : `Envelopes come to ${part} of ${name}'s ${whole} a month. Tap ${name} to see everything in it.`,
  onlyGoals: (name: string, part: string | null, whole: string | null) =>
    part === null || whole === null
      ? `This counts goals only. Tap ${name} to see everything in it.`
      : `Goals come to ${part} of ${name}'s ${whole} a month. Tap ${name} to see everything in it.`,
  chooseEmoji: (name: string) => `Choose an emoji for ${name}`,
  changeEmoji: (name: string) => `Change the emoji for ${name}`,
  emojiLabel: 'Emoji',
  removeEmoji: 'Remove emoji',
  uncounted: (count: number) =>
    count === 1
      ? 'One bill, envelope or goal has no regular amount or schedule, so it is not in this total.'
      : `${count} bills, envelopes and goals have no regular amount or schedule, so they are not in this total.`,
} as const;

const countMembers = (bills: number, envelopes: number, goals: number) =>
  joinNames(
    [
      bills > 0 ? `${bills} ${bills === 1 ? 'bill' : 'bills'}` : null,
      envelopes > 0
        ? `${envelopes} ${envelopes === 1 ? 'envelope' : 'envelopes'}`
        : null,
      goals > 0 ? `${goals} ${goals === 1 ? 'goal' : 'goals'}` : null,
    ].filter((part): part is string => part !== null),
  );

// Round 4, package G4.
export const FREE_SUM_WORDS = {
  moneyIn: 'Money in this month',
  moneyInSub: (straight: string | null, plan: string | null) =>
    [
      straight === null ? null : `${straight} to Free to Spend`,
      plan === null ? null : `${plan} through pay and envelopes`,
    ]
      .filter(Boolean)
      .join(' · '),
  moneyInNone: 'Nothing has come in since the 1st',
  onItsWay: 'On its way',
  onItsWaySub: (total: string) => `${total} · not counted yet`,
  total: 'Everything you have',
  cards: 'Set aside for cards',
  bills: 'Held for bills',
  goals: 'Held for goals',
  horizon: 'Held for Horizon',
  envelopesTrack: 'Left in envelopes',
  envelopesPlan: 'Set aside in envelopes',
  envelopesLink: 'Safe to spend in envelopes',
  result: 'Free to Spend',
  laterFix:
    'To fix a balance later, correct the income day or the bill payment it came from.',
} as const;

export const HELD_BREAKDOWN_WORDS = {
  empty: {
    bills: 'Nothing is held for bills right now.',
    goals: 'Nothing is held for goals right now.',
    envelopes: 'Nothing is held in envelopes right now.',
    horizon: 'Nothing is held for Horizon right now.',
    cards: 'Nothing is set aside for cards right now.',
  },
  coverRule: (days: number) =>
    `Bills due in the next ${days} days, or before your next pay, are covered from Free to Spend when your pays won't reach them in time.`,
  covered: 'Covered from Free to Spend',
  putAsideAndCovered: (putAside: string, covered: string) =>
    `${putAside} put aside · ${covered} covered from Free to Spend`,
  due: (date: string) => `Due ${date}`,
  short: (date: string) => `Short · due ${date}`,
  shortSetStart: 'Set what you have to cover it',
  notCovered: 'Not covered',
} as const;

export const CASH_POSITION_WORDS = {
  title: 'Where your cash is',
  open: 'Where your cash is',
  openSub: 'Your accounts, what is set aside, and what is left',
  cash: 'Cash in your accounts',
  cashHelp: (names: string) =>
    names === ''
      ? 'The accounts that count toward your total.'
      : `Counts ${names}. An account that is not for spending is left out.`,
  fromBank: 'From your bank',
  typedOn: (date: string) => `You typed it on ${date}`,
  typed: 'You typed it',
  noBalance: 'No balance yet',
  unknown: 'Not known yet',
  unknownSub: 'Add a balance to every account above to see it',
  leftOut: (names: string) => `Not counted: ${names}`,
  bills: FREE_SUM_WORDS.bills,
  goals: FREE_SUM_WORDS.goals,
  horizon: FREE_SUM_WORDS.horizon,
  cards: FREE_SUM_WORDS.cards,
  pending: 'Charges still pending',
  pendingHelp:
    'Your bank counts only charges that have posted, so these have not left your balance yet.',
  envelopes: 'Safe to spend in envelopes',
  free: 'Not given a job yet',
  freeHelp:
    'Free to Spend comes from your plan. This is what your accounts hold beyond everything above, so the two can differ until your balances catch up.',
  over: (amount: string) => `Over-assigned ${amount}`,
  overTitle: 'Over-assigned',
  overHelp:
    'After what is set aside, your accounts hold less than your envelopes. Nothing was changed: their figures stay as planned until you move money or spend less.',
  noAccounts: 'No account counts toward your total yet.',
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

/** "Pay these first" taking a share of the bill it pays. */
export const PAIRING_BILL_WORDS = {
  mode: 'Of the bill',
  full: 'Full',
  half: 'Half',
  other: 'Other share',
  shareLabel: 'Share of the bill',
  shareWords: { full: 'All', half: 'Half' },
  describe: (bps: number) =>
    bps === 10_000
      ? 'the full bill'
      : bps === 5_000
        ? 'half the bill'
        : `${bps / 100}% of the bill`,
  worked: (
    share: string,
    name: string,
    bill: string | null,
    cents: string,
    isOneDay: boolean,
  ) =>
    `${share} of ${name}${bill === null ? '' : ` (${bill})`} · up to ${cents} from ${isOneDay ? 'this pay' : 'each pay'}`,
  ranged:
    'Uses the high end of its range. Follows the bill when it changes, and stops once its payment is covered.',
  follows:
    'Follows the bill when it changes, and stops once its payment is covered.',
  undated: (name: string) =>
    `${name} has no due date yet, so this sends nothing until it has one.`,
  nothingAhead: (name: string) =>
    `${name} has no payment coming, so this sends nothing.`,
  typeShare: 'Type a percent to see what each pay puts in.',
  badShare: 'Type a share above 0% and up to 100%.',
} as const;

/** What happens to "Pay these first" when the item it pays has stopped. */
export const PAIRING_STOP_WORDS = {
  archived: 'Archived, so it gets nothing from this pay',
  ended: (date: string) => `Ended ${date}, so it gets nothing from this pay`,
  notSaving: 'Not saving for it yet, so it gets nothing from this pay',
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

export const TRUSTED_BROWSER_WORDS = {
  caption: 'Trusted browsers',
  offlineUntrusted:
    'Your plan unlocks with a connection, so it can’t open while you’re offline. Nothing has been changed or lost. Once you’re back online, turn on Trust this browser in Settings so it opens offline next time.',
  offlineNotSaved:
    'This browser is trusted, but your plan isn’t saved in it yet. Open Runway once with a connection, and it opens offline after that. Nothing has been changed or lost.',
} as const;

export const MADE_UP_WORDS = {
  caption: 'Showing the app',
  label: 'Made-up amounts',
  help: 'Show Runway off with believable figures. Names and dates stay real.',
  receiptHidden: 'Receipts stay hidden while amounts are made up',
  cannotSave:
    'Made-up amounts are on, so changes with an amount are not saved. Turn it off in Settings first.',
  leftOver:
    'Part of this was written while amounts were made up. Retype the amounts in it and save again.',
} as const;

/** Round 7 package G9: archiving or ending an item that holds money asks what happens to it. */
export const HELD_WORDS = {
  caption: (amount: string) => `The ${amount} it holds`,
  freeTitle: 'Make it Free\u00a0to\u00a0Spend',
  freeArchive: 'From today.',
  freeEnd: (date: string) => `From ${date}.`,
  keepTitle: 'Keep it held',
  keepBody: 'Until you release it.',
  blocker: 'Choose what happens to the money it holds.',
  release: 'Release what it holds',
  releaseNow: 'It becomes Free\u00a0to\u00a0Spend.',
  releaseOn: (date: string) =>
    `It becomes Free\u00a0to\u00a0Spend from ${date}.`,
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

export const ACCOUNT_KINDS = [
  'checking',
  'savings',
  'cashManagement',
  'investment',
  'other',
] as const;

export const ACCOUNT_KIND_LABELS: Record<
  (typeof ACCOUNT_KINDS)[number],
  string
> = {
  checking: 'Checking',
  savings: 'Savings',
  cashManagement: 'Cash account',
  investment: 'Investing',
  other: 'Other',
};

/** Kinds whose money is not for spending, so a new one starts left out of the total. */
export const ACCOUNT_KINDS_LEFT_OUT: readonly (typeof ACCOUNT_KINDS)[number][] =
  ['investment'];

/** The kinds of account that can earn interest. */
export const INTEREST_ACCOUNT_KINDS: readonly (typeof ACCOUNT_KINDS)[number][] =
  ['checking', 'savings', 'cashManagement'];

/** A bill's one "how is it paid" question: a credit card, an account it comes out of, or neither yet. */
export const BILL_PAY_WORDS = {
  title: 'What is it charged to?',
  label: 'Charged to',
  cardDetail: 'Credit card',
  fromBank: 'Your bank account',
} as const;

export const ACCOUNT_WORDS = {
  sectionTitle: 'Accounts',
  add: 'Add an account',
  emptyTitle:
    'Add the accounts your money sits in, and say which goals and envelopes each one holds.',
  pullsFrom: 'Cards and bills pull from it',
  noBalance: 'No balance yet',
  unknown: 'Not known yet',
  unknownSub: 'Add a balance to every account above to see it',
  leftOut: (names: string) => `Not counted: ${names}`,
  balanceOn: (day: string) => `As of ${day}`,
  bankBalanceOn: (day: string) => `From your bank, ${day}`,
  updatedJustNow: 'Updated just now',
  updatedMinutes: (minutes: number) => `Updated ${minutes}\u00a0min ago`,
  updatedHours: (hours: number) => `Updated ${hours}\u00a0hr ago`,
  rowJustNow: 'Just now',
  rowMinutes: (minutes: number) => `${minutes}\u00a0min ago`,
  rowHours: (hours: number) => `${hours}\u00a0hr ago`,
  autoCheckChip: 'Checks every 5\u00a0min',
  autoCheckTitle: 'Kept up to date',
  autoCheck: (bank: string) =>
    `While Runway is open, it asks ${bank} for this balance every 5 minutes, and again when you open it or pull down. Accounts without this chip update whenever their bank shares a new balance, usually a few times a day.`,
  pendingAmount: (amount: string) => `${amount}\u00a0pending`,
  holdsTitle: 'What it holds',
  holdsEmpty: 'Nothing is held here yet.',
  notYetGivenAJob: 'Not yet given a job',
  shortOfWhatItHolds: (amount: string) => `${amount} short of what it holds`,
  rowShort: (bankLine: string, amount: string) =>
    `${bankLine} ·\u00a0${amount}\u00a0short`,
  rowPulledFrom: (bankLine: string) => `${bankLine} ·\u00a0Pulled\u00a0from`,
  showMore: (count: number) => `Show ${count} more`,
  showFewer: 'Show fewer',
  chooseHolds: 'Choose what it holds',
  chooseHoldsSub: 'Goals and envelopes kept here',
  chooseHoldsHeldElsewhere: (account: string) => `Now in ${account}`,
  chooseHoldsTitle: 'Which goals and envelopes does it hold?',
  chooseHoldsTotal: 'Picked',
  chooseHoldsOfBalance: 'of its',
  chooseHoldsSearch: 'Search goals and envelopes',
  chooseHoldsNoMatch: 'No goal or envelope by that name.',
  updateBalance: 'Update the balance',
  updateBalanceSub: 'What the account holds today',
  balanceTitle: 'What does it hold today?',
  balanceLabel: 'Balance',
  change: 'Change the account',
  changeSub: 'Name, bank, last 4 digits and more',
  archive: 'Archive',
  archiveSub: 'It leaves the list; what it held is no longer placed in it.',
  archiveConfirmTitle: (name: string) => `Archive ${name}`,
  archiveConfirmText: 'Archive',
  archived: (name: string) => `${name} archived`,
  archiveFailed: 'The account was not archived',
  institutionTitle: 'Which bank holds it?',
  institutionLabel: 'Bank',
  institutionPlaceholder: 'Capital One',
  nameTitle: 'What do you call it?',
  nameLabel: 'Name',
  namePlaceholder: 'Checking A',
  kindTitle: 'What kind of account is it?',
  kindLabel: 'Kind',
  lastFourTitle: 'What are its last 4 digits?',
  lastFourLabel: 'Last 4 digits',
  lastFourHint: 'Tells two accounts at one bank apart.',
  lastFourSkip: 'Skip',
  lastFourNone: 'Not given',
  needsFourDigits: 'Type 4 digits, or skip.',
  pullTitle: 'Do your cards and bills pull from it?',
  pullLabel: 'Cards and bills',
  pullYes: 'Yes, they pull from it',
  pullNo: 'No',
  needsName: 'Give it a name.',
  needsInstitution: 'Say which bank holds it.',
  saveAdd: 'Add account',
  save: 'Save',
  added: (name: string) => `${name} added`,
  saved: (name: string) => `${name} saved`,
  saveFailed: 'The account was not saved',
  payFromTitle: 'Which account does it come out of?',
  payFromLabel: 'Comes out of',
  payFromNone: 'Not chosen yet',
  landsInTitle: 'Which account does it land in?',
  landsInLabel: 'Lands in',
  landsInNone: 'Not chosen yet',
  changeAdded: (name: string) => `Added the account ${name}`,
  changeChanged: (name: string, what: string) =>
    `Changed the account ${name}: ${what}`,
  changeName: (from: string, to: string) => `name ${from} to ${to}`,
  changeBank: (from: string, to: string) => `bank ${from} to ${to}`,
  changeKind: (from: string, to: string) => `kind ${from} to ${to}`,
  changeLastFour: (from: string, to: string) =>
    `last 4 digits ${from} to ${to}`,
  changeNoLastFour: 'none',
  changePull: (from: string, to: string) =>
    `cards and bills pulling from it ${from} to ${to}`,
  changeYes: 'yes',
  changeNo: 'no',
  changeApy: (from: string, to: string) => `APY ${from} to ${to}`,
  changeNoApy: 'none',
  changeInterestDay: (from: string, to: string) =>
    `interest day ${from} to ${to}`,
  apyTitle: 'Does it earn interest?',
  apyLabel: 'APY',
  apyPlaceholder: '4.10',
  apyHint: 'The yearly rate your bank shows (APY). Leave it empty for none.',
  apyNone: 'No interest',
  apyNeeded: 'Type a rate like 4.10, up to 25%, or leave it empty.',
  interestDayTitle: 'Which day does the interest arrive?',
  interestDayLabel: 'Interest day',
  interestDayPlaceholder: 'Last day',
  interestDayHint: 'A day from 1 to 31. Leave it empty for the last day.',
  interestLastDay: 'Last day of the month',
  changeInterestLastDay: 'the last day of the month',
  interestDayNeeded: 'Type a day from 1 to 31, or leave it empty.',
  interestDayValue: (day: number) => `Day ${day}`,
  apyFact: (percent: string) => `${percent}% APY`,
  apyValue: (percent: string) => `${percent}%`,
  interestEstimate: (amount: string, day: string) =>
    `About ${amount} interest on ${day} (estimate)`,
  interestActual: (amount: string, day: string) =>
    `${amount} interest on ${day}`,
  goalInterestActual: (amount: string, day: string) =>
    `Earned ${amount} on ${day}, its share of the interest`,
  interestTitle: (account: string) => `Interest in ${account}`,
  interestUncountedChip: (amount: string) =>
    `Interest ~${amount} · update the balance`,
  interestUncountedBankChip: (amount: string) =>
    `Interest ~${amount} · next bank update`,
  interestChip: (amount: string, day: string, isActual: boolean) =>
    `Interest ${isActual ? '' : '~'}${amount} · ${day}`,
  interestUncounted: (amount: string, day: string) =>
    `About ${amount} interest came in by ${day} (estimate). Update the balance to count it.`,
  interestUncountedBank: (amount: string, day: string) =>
    `About ${amount} interest came in by ${day} (estimate). It counts once your bank sends its next balance.`,
  goalInterest: (amount: string, day: string) =>
    `Earns about ${amount} on ${day}, its share of the interest (estimate)`,
  changeArchived: (name: string) => `Archived the account ${name}`,
  changeHolds: (
    name: string,
    added: string[],
    removed: string[],
    movedFrom: string[],
  ) =>
    [
      `Changed what ${name} holds`,
      [
        added.length === 0 ? null : `now holds ${added.join(', ')}`,
        removed.length === 0 ? null : `no longer holds ${removed.join(', ')}`,
      ]
        .filter((part) => part !== null)
        .join('; '),
    ]
      .filter((part) => part !== '')
      .join(': ') +
    (movedFrom.length === 0
      ? ''
      : `, moving some from ${movedFrom.join(' and ')}`),
  changeBalance: (name: string, amount: string, day: string) =>
    `${name} balance ${amount} on ${day}`,
  withLastFour: (name: string, lastFour: string) => `${name} ••${lastFour}`,
  sheetTitle: 'Account',
  searchPlaceholder: 'Search accounts',
  searchEmpty: 'No account matches that.',
  loading: 'Getting your accounts.',
  sheetTitleNew: 'New account',
  discardNew: 'account',
  offline: 'This needs a connection. Nothing was changed.',
  failed: 'This did not save. Nothing was changed.',
  goalsHeading: 'Goals',
  envelopesHeading: 'Envelopes',
  holdsNothingToPick:
    'Add a goal or an envelope first, then say where it sits.',
  holdsSave: 'Save',
  holdsSaved: (name: string) => `Changed what ${name} holds`,
  holdsFailed: 'What it holds was not saved',
  undo: 'Undo',
  changeHoldsUndone: (names: string[]) =>
    `Took back the change to what ${names.join(' and ')} ${names.length === 1 ? 'holds' : 'hold'}`,
  holdsNotUndone: 'The change was not taken back',
  holdsChangedSince: (names: string[]) =>
    `What ${names.join(' and ')} ${names.length === 1 ? 'holds' : 'hold'} changed since, so nothing was undone.`,
  heldIn: (name: string) => `Held in ${name}`,
  notHeld: 'Not held in an account yet',
  heldSub: 'Change which account holds it',
  whichAccountTitle: 'Which account holds it?',
  whichAccountLabel: 'Account',
  notInAccount: 'Not in an account',
  balanceSave: 'Save',
  balanceSaved: (name: string) => `Balance of ${name} updated`,
  balanceFailed: 'The balance was not saved',
  balanceNotNow: 'Not now',
  balanceHint: 'Leave it empty to add it later.',
  balanceNeeded: 'Type an amount.',
  balanceSame: 'That is already the balance for today.',
  needsPull: 'Say whether cards and bills pull from it.',
  institutionsUsed: 'Banks you already use',
} as const;

export const CARD_WORDS = {
  sectionTitle: 'Cards',
  add: 'Add a card',
  sheetTitle: 'Card',
  emptyTitle:
    'Add the cards you spend on. What you charge waits here until you pay the card.',
  waiting: 'Waiting to be paid',
  nothingToPay: 'Nothing to pay',
  pendingAmount: (amount: string) => `${amount}\u00a0pending`,
  autoCheckChip: 'Checks every 5\u00a0min',
  autoCheckTitle: 'Kept up to date',
  autoCheck: (bank: string) =>
    `While Runway is open, it asks ${bank} for this card's balance every 5 minutes, and again when you open it or pull down. Cards without this chip update whenever their bank shares a new balance, usually a few times a day.`,
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
  lastFourTitle: 'What are its last 4 digits?',
  lastFourLabel: 'Last 4 digits',
  lastFourHint: 'Tells two cards from one bank apart.',
  lastFourSkip: 'Skip',
  lastFourNone: 'Not given',
  needsFourDigits: 'Type 4 digits, or skip.',
  payFromTitle: 'Which account does it come out of?',
  payFromLabel: 'Comes out of',
  payFromNone: 'Not chosen yet',
  chargedTo: (card: string) => `Charged to ${card}`,
  comingDueTitle: 'Coming due',
  comingDueOne: '1 card due',
  comingDueMany: (count: number) => `${count} cards due`,
  historyStart: 'Owed when tracking started',
  beforeTracking: (day: string) => `Pick ${day} or a later day.`,
  markedAllWith: (cards: string) => `Charged to ${cards}.`,
  markedPaidWith: (bill: string, card: string) =>
    `Marked ${bill} paid, charged to ${card}`,
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
  dueOn: (date: string) => `Due\u00a0${date}`,
  dueInDays: (days: number) =>
    days === 1 ? 'Due tomorrow' : `Due in ${days} days`,
  dueToday: 'Due today',
  dueFromBank: (bank: string) => `Due date from ${bank}`,
  dueFromBankTitle: 'Due date',
  dueFromBankSummary: (date: string, bank: string) => `${date}, from ${bank}`,
  dueFromBankBody: (bank: string) =>
    `${bank} sets this date, so Runway follows it. If you unlink the card, the day you typed comes back.`,
  statementCaption: (bank: string) => `From your ${bank} statement`,
  minimumDue: 'Minimum due',
  statementBalance: 'Statement balance',
  statementIssued: (date: string) => `Issued\u00a0${date}`,
  minimumShort: (amount: string) => `${amount}\u00a0minimum`,
  minimumQuick: (amount: string) => `Minimum ${amount}`,
  everythingQuick: (amount: string) => `Everything waiting ${amount}`,
  quickAmounts: 'Or pay',
  minimumDueOn: (date: string) => `Due\u00a0${date}`,
  minimumWasDue: (date: string) => `Was due\u00a0${date}`,
  minimumPaid: 'Paid',
  minimumPaidDetail: (amount: string, date: string) =>
    `You paid ${amount} on\u00a0${date}`,
  minimumNone: 'Nothing to pay on this statement',
  minimumNotShared: (bank: string) =>
    `${bank} doesn\u2019t share this card\u2019s minimum`,
  offerBadge: 'New',
  offerTitle: 'See your minimum payment',
  offerBody: (bank: string) =>
    `${bank} shares it once you agree. Not every card has one.`,
  offerCovers: (names: string) => `Covers ${names} too`,
  offerSeparate: (bank: string) =>
    `This card is on its own ${bank} sign-in, so it asks separately`,
  offerAction: (bank: string) => `Agree at ${bank}`,
  offerLater: 'Not now',
  offerRow: (bank: string) => `Get the minimum from ${bank}`,
  offerRowHelp: 'Agree once and it shows here',
  offerDone: (bank: string) =>
    `Done. The minimum shows here as soon as ${bank} sends it`,
  offerFailed: (bank: string) => `Couldn\u2019t reach ${bank}. Try again`,
  homeTitle: 'Cards',
  homeSeeAll: 'See all',
  totalOwed: (amount: string) => `${amount} waiting to be paid on your cards`,
  nothingOwed: 'Nothing waiting to be paid on your cards',
  dueWarning: (name: string, date: string, amount: string) =>
    `${name} is due\u00a0${date} · ${amount} waiting`,
  dueTodayWarning: (name: string, amount: string) =>
    `${name} is due today · ${amount} waiting`,
  dueWarningMinimum: (
    name: string,
    date: string,
    minimum: string,
    amount: string,
  ) => `${name} is due\u00a0${date} · ${minimum} minimum, ${amount} waiting`,
  dueTodayWarningMinimum: (name: string, minimum: string, amount: string) =>
    `${name} is due today · ${minimum} minimum, ${amount} waiting`,
  dueWarningPastMinimum: (
    name: string,
    date: string,
    minimum: string,
    amount: string,
  ) => `${name} was due\u00a0${date} · ${minimum} minimum, ${amount} waiting`,
  dueWarningOpen: 'Pay it off',
  dueWarningPast: (name: string, date: string, amount: string) =>
    `${name} was due\u00a0${date} · ${amount} waiting`,
  notPaidBy: (date: string) => `Not paid by ${date}`,
  pastDueSince: (date: string) => `Past due since ${date}`,
  dueRolled: (due: string, since: string) =>
    `Due\u00a0${due} · not paid by ${since}`,
  changeAdded: (name: string, owed: string | null) =>
    owed === null ? `Added ${name}` : `Added ${name}, owing ${owed}`,
  changeChanged: (name: string, what: string) => `Changed ${name}: ${what}`,
  changeIssuer: (from: string, to: string) => `issuer ${from} to ${to}`,
  changeName: (from: string, to: string) => `name ${from} to ${to}`,
  changeNoName: 'no name',
  changeDueDay: (from: string, to: string) => `due day ${from} to ${to}`,
  changeNoDueDay: 'no due day',
  changeLastFour: (from: string, to: string) =>
    `last 4 digits ${from} to ${to}`,
  changeNoLastFour: 'none',
  withLastFour: (name: string, lastFour: string) => `${name} ••${lastFour}`,
  changePayFrom: (from: string, to: string) =>
    `the account it comes out of ${from} to ${to}`,
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

/** The feature switch for linking a bank (`FEATURE_GATES`). */
export const LINK_BANKS_GATE_ID = 'link-banks';

/** Days "Ask me later" hides Home's "where are they kept" row. */
export const HOLDS_ASK_LATER_DAYS = 3;

export const HOLDS_PROMPT_WORDS = {
  title: 'Where are your goals and envelopes kept?',
  subtitle: 'So Runway can check them against your bank.',
  next: 'Choose where they are kept',
  accountLabel: (name: string) => `Account for ${name}`,
  notSure: 'Not sure yet',
  screenTitle: 'Where they are kept',
  save: 'Save',
  saved: (count: number) =>
    count === 1 ? 'Saved where 1 is kept' : `Saved where ${count} are kept`,
  failed: 'Some were not saved',
  askLater: 'Ask me later',
  askLaterNote: `Home asks again in ${HOLDS_ASK_LATER_DAYS} days.`,
  dontAsk: "Don't ask again",
  dontAskNote: 'You can still set it from each goal or envelope.',
  skipFailed: 'That did not save. Nothing was changed.',
  discardTitle: 'Discard your picks?',
  discardMessage: 'Nothing is saved until you tap Save.',
} as const;

export const BANK_BACKED_WORDS = {
  title: 'Free to Spend now comes from your bank',
  subtitle: 'See what changed and why.',
  intro:
    'Runway now starts from what your accounts hold, then sets aside your bills, goals, cards, pending charges and envelopes. What is left is Free to Spend.',
  typedNote: "Accounts you haven't linked count with the balance you typed.",
  before: 'From what you entered',
  after: 'From your accounts',
  more: (amount: string) =>
    `Your accounts hold ${amount} more than Runway had counted, so it is now in Free to Spend.`,
  less: (amount: string) =>
    `Your accounts hold ${amount} less than Runway had counted, often spending not added yet, so Free to Spend is lower.`,
  same: 'Your accounts match what Runway had counted, so nothing moved.',
  hidden: 'Show amounts to see how they differ.',
  gotIt: 'Got it',
  failed: 'That did not save. Try again in a moment.',
  sumHelp:
    'At Link this matches what your accounts hold, so it can differ from what you entered.',
} as const;

/** Purchases that came in from a linked bank and wait for the person to say where the money came from. */
export const RELEASED_WORDS = {
  one: (title: string | null, isRefund: boolean) =>
    `The bank dropped a pending ${isRefund ? 'refund' : 'charge'}${title ? ` from ${title}` : ''}`,
  oneSub: (where: string, isRefund: boolean) =>
    isRefund
      ? `It no longer adds to ${where}.`
      : `It no longer counts, so its money is back in ${where}.`,
  many: (count: number, hasRefund: boolean) =>
    `The bank dropped ${count} pending ${hasRefund ? 'items' : 'charges'}`,
  manySub: 'They no longer count. History says where each one was.',
};

/** Words for a card's annual fee and the bill and group Runway keeps in step with it. */
export const CARD_FEE_WORDS = {
  groupName: 'Card annual fees',
  billName: (card: string) => `${card} annual fee`,
  feeTitle: 'Does it have an annual fee?',
  feeLabel: 'Annual fee',
  feeHint: 'It goes on Bills and is saved up for across your pays.',
  noFee: 'No annual fee',
  feeNone: 'None',
  needsFee: 'Enter the fee, or pick No annual fee.',
  dateTitle: 'When is the fee charged next?',
  dateLabel: 'Next fee',
  needsDate: 'Pick the day the fee is charged next.',
  pastDate: 'Pick today or a later day.',
  heldTitle: 'Money set aside for the fee',
  heldCaption: (amount: string) => `${amount} is set aside for the fee`,
  needsHeld: 'Choose where the money set aside for the fee goes.',
  heldFreeBody: 'It goes back to Free to Spend from today.',
  loading: 'Your plan is still loading. Try again in a moment.',
  changeFee: (from: string, to: string) => `annual fee ${from} to ${to}`,
  changeFeeDate: (from: string, to: string) => `next fee ${from} to ${to}`,
  changeNoFee: 'none',
  groupStarted: 'Started using Card annual fees.',
  billAdded: (bill: string, amount: string, date: string) =>
    `Added ${bill}, ${amount} yearly, next on ${date}.`,
  billChanged: (bill: string, what: string, from: string) =>
    `${bill}: ${what}, from ${from}.`,
  billRenamed: (from: string, to: string) => `Renamed ${from} to ${to}.`,
  billAmount: (from: string, to: string) => `${from} to ${to}`,
  billDate: (from: string, to: string) => `next on ${to} (was ${from})`,
  billEnded: (bill: string) => `${bill}: ended with its card's fee.`,
  groupNote: "Kept in step with your cards' annual fees.",
  groupNotePlan: 'Kept in step for you.',
  billChangeSub: 'Priority, and from when',
  billCardRow: 'Fee and date',
  billCardRowSub: (card: string) => `Change it on ${card}`,
  archiveTitle: (card: string) => `Archive ${card}?`,
  archiveDo: 'Archive the card',
} as const;

export const SORTING_WORDS = {
  caption: 'Needs a home',
  label: "I'm not sorting yet",
  helpOn:
    "New charges stay in Free to Spend and in Spend, and don't wait here. Money in and moves between accounts still ask",
  helpOff: 'Charges from the bank wait here for a home',
  saveFailed: 'That did not save. Nothing was changed.',
} as const;

const getBulkCount = (written: number, total: number) => {
  const noun = (count: number) => (count === 1 ? 'purchase' : 'purchases');
  return written === total
    ? `${written} ${noun(written)}`
    : `${written} of ${total} ${noun(total)}`;
};

export const NEEDS_HOME_WORDS = {
  title: 'Needs a home',
  homeSub: 'From your bank',
  countedChip: 'Counted in Free to Spend',
  intro:
    "You don't have to sort these. Each one already counts against Free to Spend; putting it in an envelope just makes that envelope's number exact.",
  empty:
    'Nothing is waiting. New purchases from your bank show up here on their own.',
  loading: 'Getting your purchases.',
  pending: 'Pending',
  fromBank: 'from your bank',
  untitled: 'Purchase',
  moneyIn: 'Money in',
  refundLabel: 'Refund',
  moneyInHelp:
    'Deposits that may be a pay or a move between your accounts. Runway links one to your pay when it is clearly that day’s. Any other money in is already in Free to Spend, under Spend’s Money in.',
  maybeTwice: 'Might be in twice',
  inEnvelope: (name: string) => `In ${name}`,
  maybeTwiceHelp:
    'You put these in an envelope, so they count there. Each looks like one you added yourself before linking your bank, so it may be in twice. Nothing is removed unless you say so: open one to say if it’s the same.',
  notPay: 'Not a pay',
  notPaySub: 'It’s already in Free to Spend',
  savedIn: 'Saved as money in',
  unseenOut: 'To an account Runway doesn’t see',
  unseenOutSub: 'Not spending. Your balance already shows it',
  unseenIn: 'From an account Runway doesn’t see',
  savedMove: 'Saved as a move to another account',
  thisWasPay: 'This was a pay',
  unlistedPay: 'A pay that isn’t listed',
  thisWasPaySub: 'Plan it as a one-time pay so it can fill envelopes',
  alreadyIn: 'It’s already in Free to Spend through your balance.',
  onItsWaySheet:
    'If it’s a move between your accounts, it pairs once it clears. If not, it counts then.',
  linkedTo: (day: string) => `Linked to your pay on ${day}.`,
  keepFree: 'Keep in Free to Spend',
  keepFreeSub: 'Still counts, with no envelope',
  keptFree: 'Kept in Free to Spend',
  keepRefundFree: 'Leave it in Free to Spend',
  keepRefundFreeSub: 'It’s already counted there. No envelope gets it back',
  keptRefundFree: 'Left in Free to Spend',
  historyOne: 'A purchase from before you linked is history now',
  historyMany: (count: number) =>
    `${count} purchases from before you linked are history now`,
  historySub: 'They are not counted in Free to Spend or your envelopes.',
  whichTitle: 'Which envelope?',
  sendHere: 'Send it here',
  moreOptions: 'Pick an envelope',
  moreOptionsSub: 'Or split it across several',
  undo: 'Undo',
  undoFailed: 'That was not put back. Nothing was changed.',
  sentTo: (name: string) => `Sent to ${name}`,
  alreadySent: (name: string) => `Your rule already sent this to ${name}`,
  failed: 'That did not save. Nothing was changed.',
  sameTitle: 'Did you already add this?',
  sameRow: (difference: string | null) =>
    difference === null ? 'Same amount' : `Bank’s is ${difference}`,
  sameVerb: 'Kept once at the bank’s amount',
  notSame: 'None of these',
  notSameSub: 'They’re separate and both still count',
  notSameDone:
    'They stay separate and both still count. You won’t be asked again.',
  matchedOne: (name: string) => `${name} matched the one you added`,
  matchedMany: (count: number) =>
    `${count} purchases from your bank matched ones you added`,
  matchedOneSub: 'Counted once, at the bank’s amount.',
  matchedManySub: 'Each is counted once, at the bank’s amount.',
  matchUndone: 'Match undone',
  movesHeading: 'Moves and card payments',
  movesHelp:
    'Money that left one of your accounts and arrived in another account or on a card. Open one to say if that is what it was.',
  chargesHeading: 'Charges',
  moveKind: 'Move',
  cardPaymentKind: 'Card payment',
  refundRow: 'This is a refund',
  refundRowSub: 'It goes back where the purchase came from',
  refundOfRow: (name: string, day: string) => `Refund of ${name}, ${day}`,
  refundOfRowSub: (where: string) => `Goes to ${where}`,
  refundOtherRow: 'A refund of something else',
  refundOtherRowSub: 'Pick the purchase, or where it goes',
  refundAlreadyIn: 'A refund, already counted in Free to Spend.',
  putBackRow: 'Put it back in an envelope',
  putBackRowSub: 'Only if it came out of one',
  notRefundRow: 'It wasn’t a refund',
  notRefundRowSub: 'A payment from an account Runway doesn’t see',
  unseenRow: 'A payment from an account Runway doesn’t see',
  unseenRowSub: 'It will not count as income',
  select: 'Select',
  selectRow: (name: string) => `Select ${name}`,
  selectedCount: (count: number) => `${count} selected`,
  selectAll: 'Select all',
  clearAll: 'Clear all',
  cancelSelect: 'Cancel',
  nothingTicked: 'Tick the charges you want to sort together.',
  bulkKeepFree: 'Keep in Free to Spend',
  bulkKeepFreeShort: 'Keep',
  bulkPut: 'Put in an envelope',
  bulkPutShort: 'Envelope',
  bulkPickTitle: 'Which envelope?',
  bulkPickSub: (count: number) =>
    count === 1
      ? 'For the 1 charge you ticked'
      : `For the ${count} charges you ticked`,
  bulkSearch: 'Search your envelopes',
  bulkNoMatch: 'Nothing matches that.',
  bulkNoEnvelopes: 'You have no envelopes yet.',
  bulkKept: (written: number, total: number) =>
    `Kept ${getBulkCount(written, total)} in Free to Spend`,
  bulkPlaced: (written: number, total: number, envelope: string) =>
    `Put ${getBulkCount(written, total)} in ${envelope}`,
  bulkPartlyFailed: 'The rest did not save. Nothing else was changed.',
  bulkUndone: (count: number) =>
    count === 1
      ? '1 purchase is back in Needs a home'
      : `${count} purchases are back in Needs a home`,
  bulkUndoPartly: (count: number, total: number) =>
    `${count} of ${total} purchases were put back. The rest changed elsewhere and were left alone.`,
} as const;

export const DEPOSIT_WORDS = {
  whichTitle: 'Which pay is this?',
  dayRow: (differs: string | null) =>
    differs === null ? 'Same as expected' : differs,
  linkedOne: (amount: string, day: string) =>
    `Linked your ${amount} deposit to ${day}`,
  linkedMany: (count: number) => `Linked ${count} deposits to your pay`,
  linkedSub: 'It will not count as spending. Undo if it is not that pay.',
  linkedManySub: 'None of them count as spending. Undo if one is wrong.',
  linkedByYou: (day: string) => `Linked to ${day}`,
  undone: 'Link undone',
  found: (amount: string, account: string, date: string) =>
    `Deposit found: ${amount} from ${account} on ${date}`,
  foundDifferent: (difference: string) =>
    `That is ${difference} than what you confirmed.`,
  foundFromPlan: (difference: string) => `That is ${difference} than planned.`,
  foundStatus: 'Arrived. Confirm it to use what came in.',
  inRange: 'In your range',
  unlink: 'Not this deposit',
  unlinkSub: 'Send the deposit back to Needs a home',
  unlinked: 'The deposit is back in Needs a home',
  unlinkFailed: 'That did not save. Nothing was changed.',
  moreThan: (amount: string) => `${amount} more`,
  lessThan: (amount: string) => `${amount} less`,
  gone: 'This deposit was already removed on another device.',
  notWaiting: 'This deposit is not waiting in Needs a home anymore.',
  notLinked: 'This deposit is not linked to a pay anymore.',
  dayNotArrived: 'That pay was marked as not arrived. Pick another one.',
  lost: 'This was linked to a pay Runway no longer lists, or to one that already has its deposit. Pick the pay it is, or say it is not a pay.',
} as const;

export const PAIR_WORDS = {
  whichTitle: 'Is this a move between your accounts?',
  cardWhichTitle: (card: string | null, from: string | null) =>
    `Did you pay ${card ?? 'a card'} from ${from ?? 'one of your accounts'}?`,
  notCardPayment: 'Not a card payment',
  pairVerb: 'Pair them',
  leftOn: (day: string) => `Left ${day}`,
  arrivedOn: (day: string) => `Arrived ${day}`,
  cardPaymentTo: (card: string) => `Card payment to ${card}`,
  cardPaymentFrom: (account: string) => `Payment from ${account}`,
  transferred: (amount: string, from: string, to: string) =>
    `Moved ${amount} from ${from} to ${to}`,
  paidCard: (amount: string, card: string, from: string) =>
    `Recorded a ${amount} payment to ${card} from ${from}`,
  pairedMany: (count: number) => `Paired ${count} moves between your accounts`,
  transferredSub:
    'It will not count as spending or income. Undo if it is not a move between your accounts.',
  paidCardSub: 'The card shows it as paid. Undo if that is wrong.',
  pairedManySub:
    'None of them count as spending or income. Undo if one is wrong.',
  undone: 'Pairing undone',
  unpair: 'Not a move between my accounts',
  unpairSub: 'Sends both back to Needs a home',
  unpaired: 'Both are back in Needs a home',
  unpairFailed: 'That did not save. Nothing was changed.',
  gone: 'One of these was already removed on another device.',
  notWaiting: 'These are not both waiting in Needs a home anymore.',
  notPaired: 'These are not paired with each other anymore.',
  tooManyPayments: 'Too many payments were saved to this card that day.',
  lost: 'Its other side changed or is gone, so it is waiting again. Pair it again or say what it is.',
  doorTitle: 'Moves and card payments',
  screenTitle: 'Account moves',
  doorShort: 'Account moves',
  doorNarrow: 'Moves',
  doorSub: 'Paired by the bank’s dates and amounts',
  screenIntro:
    'Money moved between your own accounts or to a card. Not spending, not income.',
  empty: 'Nothing is paired. Anything you sent back waits in Needs a home.',
  paymentMissing:
    'The card payment this was paired with is gone, so nothing was changed.',
  loading: 'Getting your moves.',
  rowName: (from: string, to: string) => `${from} to ${to}`,
  cardPaymentRow: (card: string) => `Payment to ${card}`,
  sheetTransfer: (from: string, to: string) =>
    `You moved this from ${from} to ${to}.`,
  sheetCardPayment: (from: string, card: string) =>
    `You paid ${card} from ${from}.`,
  waitingTitle: 'Waiting to pair',
  pairedTitle: 'Paired',
  waitingCardPayment: 'Your bank calls this a card payment',
  waitingTransfer: 'Your bank calls this a move between accounts',
  waitingIntro: 'Your bank calls these card payments or moves.',
  isSpending: 'This is spending',
  isSpendingSub: 'Back on Purchases, from Free to Spend',
} as const;

export const MEMORY_WORDS = {
  movesRow: 'Remembered moves',
  movesRowSub: 'Moves you paired by hand',
  payersRow: 'Remembered payers',
  payersRowSub: 'Deposits you linked to this pay by hand',
  movesTitle: 'Remembered moves',
  payersTitle: 'Remembered payers',
  rowDetail: 'Tap to forget it',
  moveTo: (account: string) => `To ${account}`,
  paymentTo: (card: string) => `Payment to ${card}`,
  payerRow: (name: string) => `Deposits from ${name}`,
  forgetTitle: 'Forget this?',
  forgetMessage:
    'Runway will ask you each time instead. Anything already paired or linked stays as it is.',
  forgetConfirm: 'Forget it',
  forgotten: 'Forgotten',
  failed: 'That was not forgotten.',
} as const;

export const LINK_WORDS = {
  reconnectTitle: (bank: string) => `${bank} needs you to reconnect`,
  reconnectNote:
    'It stopped syncing. Your purchases and balances wait until you do.',
  reconnectDone: (bank: string) => `${bank} is syncing again`,
  reconnectingTitle: (bank: string) => `Reconnecting ${bank}\u2026`,
  reconnectingNote: 'Finish signing in at your bank. This can take a moment.',
  reconnectedTitle: (bank: string) => `${bank} is reconnected`,
  reconnectedNote: 'Bringing in your purchases and balances now.',
  reconnectNewAccounts: (bank: string, count: number) =>
    count === 1
      ? `Synced ${bank}. 1 account you picked is new. Pick where it goes in Settings, under ${bank}.`
      : `Synced ${bank}. ${count} accounts you picked are new. Pick where they go in Settings, under ${bank}.`,
  reconnectStillStuck: (bank: string) =>
    `${bank} still needs you to reconnect. Try again in a moment.`,
  reconnectFailed: (bank: string) =>
    `${bank} could not be reconnected. Try again in a few minutes.`,
  yourBank: 'Your bank',
  settingsRow: 'Link a bank',
  settingsRowHelp: 'Bring in your accounts, balances and purchases',
  unfinishedRow: (bank: string) => `Finish linking ${bank}`,
  unfinishedStarted: (date: string, count: number) =>
    `Started ${date} \u00b7 ${count === 1 ? '1 account' : `${count} accounts`}`,
  discard: 'Discard this link',
  discardTitle: (bank: string) => `Discard this ${bank} link?`,
  discardMessage:
    'Nothing from it has been added. You can sign in at the bank again whenever you like.',
  discardConfirm: 'Discard link',
  discardFailed: 'That link was not discarded. Nothing was changed.',
  title: 'Link a bank',
  intro: 'Sign in at your bank, and Runway can bring your accounts in.',
  introFor: (name: string) => `Link ${name} to your bank`,
  points: [
    'You sign in in your bank\u2019s own window. Runway never sees your password.',
    'Your accounts and their balances come in now.',
    'Purchases from the last 30 days follow, and new ones keep arriving.',
  ],
  signIn: 'Sign in at your bank',
  signInAgain: 'Sign in at your bank again',
  addToIntro: (bank: string) =>
    `Sign in at ${bank} again and tick the new accounts. Keep the accounts you already linked ticked. They join the link you already have.`,
  stoppedAccounts: (bank: string, count: number) =>
    `${count === 1 ? '1 account' : `${count} accounts`} at ${bank} ${count === 1 ? 'wasn\u2019t' : 'weren\u2019t'} shared this time and will stop updating. Add accounts again and keep ${count === 1 ? 'it' : 'them'} ticked.`,
  notNow: 'Not now',
  pickEveryAccount:
    'Pick every account you have at this bank now. Linking the same bank a second time can disconnect the first link.',
  addToLinkedRow: (bank: string) => `Add accounts to ${bank}`,
  addToLinkedHelp: 'Already linked? Add them there, not as a second link.',
  addMoreRow: (bank: string) => `Add more accounts from ${bank}`,
  addMoreHelp: 'Sign in again and pick the new ones',
  pickNewRow: (count: number) =>
    count === 1
      ? 'Pick where 1 new account goes'
      : `Pick where ${count} new accounts go`,
  pickNewHelp: 'The bank sent these. Say which of yours each one is.',
  noNewAccounts: (bank: string) => `No new accounts from ${bank}`,
  cardStartsOwing: (amount: string) =>
    `Starts owing ${amount}, which comes out of Free to Spend`,
  cardsStartedOwing: (amount: string) =>
    `The new cards started owing ${amount} in all, which came out of Free to Spend.`,
  notLinked: 'Nothing was linked.',
  sessionFailed: 'Your bank\u2019s window did not open. Nothing was linked.',
  exchangeFailed: 'Runway could not read your accounts. Nothing was linked.',
  matchTitle: 'Is this one of yours?',
  matchHelp: (bank: string) =>
    `${bank} sent these. Say which of yours each one is.`,
  pickTitle: (name: string) => `Which one is ${name}?`,
  pickedNew: 'Added as new',
  pickedSkip: 'Left out',
  pickedExisting: (name: string) => `Your ${name}`,
  addAsNew: 'Add as new',
  skip: 'Leave it out',
  linkThese: 'Link these',
  confirmTitle: (bank: string) => `Link these to ${bank}?`,
  confirmJoins: (bankName: string, ours: string) =>
    `${bankName} joins your ${ours}`,
  confirmNew: (bankName: string, isCard: boolean) =>
    `${bankName} is added as a new ${isCard ? 'card' : 'account'}`,
  confirmSkip: (bankName: string) => `${bankName} is left out`,
  confirmText: (count: number) =>
    count === 1 ? 'Link 1 account' : `Link ${count} accounts`,
  nothingPicked: 'Pick at least one to bring in.',
  attachFailed:
    'Those did not link. Try again; anything already added stays and is linked then.',
  linkReplaced:
    'This link was replaced by a newer sign-in at the same bank, so nothing was added. Close it and finish the newer one.',
  levelNotMoved:
    'Linked. Your plan is still at Track; you can move it to Link in Settings, under Tracking.',
  kindDepository: 'Account',
  kindCredit: 'Card',
  kindOther: 'Other',
  done: 'Linked',
  doneCount: (count: number) =>
    count === 1 ? '1 account is linked.' : `${count} accounts are linked.`,
  finish: 'Done',
  rowLabel: 'Link to your bank',
  rowHelp: 'Bring its balance in from your bank',
  rowLinked: (when: string) => `Linked \u00b7 updated ${when}`,
  fallbackBank: 'Your bank',
  methodCardTitle: 'How do you want to add the card?',
  methodAccountTitle: 'How do you want to add the account?',
  refresh: 'Refresh from your bank',
  refreshing: 'Asking your bank\u2026',
  refreshHelp: 'Bring in new purchases and the latest balance',
  refreshed: 'Up to date with your bank.',
  newInNeedsHome: (count: number) =>
    count === 1
      ? '1 new purchase is in Needs a home'
      : `${count} new purchases are in Needs a home`,
  refreshNothing: 'Nothing new from your bank yet.',
  refreshFailed: 'Your bank did not answer. Try again in a few minutes.',
  needsAttention: 'Your bank needs you to sign in again.',
  syncing: 'Purchases from the last 30 days are on their way to Needs a home.',
  methodLink: 'Link it from your bank',
  methodLinkHelp: 'Sign in at your bank and pick it from your accounts',
  methodManual: 'Add it myself',
  methodManualHelp: 'Type its details',
  newCardSummary: (name: string) => `Added the card ${name} from your bank`,
  needsSignInRowValue: (when: string) =>
    `Needs you to sign in again \u00b7 last updated ${when}`,
  linkedRowValue: (count: number, when: string) =>
    `Linked \u00b7 ${count === 1 ? '1 account' : `${count} accounts`} \u00b7 updated ${when}`,
  unlinkedRowValue: (count: number) =>
    `Unlinked \u00b7 ${count === 1 ? '1 account' : `${count} accounts`} kept`,
  unlinkedFact: 'Unlinked',
  sheetAccounts: 'Brought in from this bank',
  sheetLeftOut: 'Left out',
  unlink: 'Unlink this bank',
  unlinkHelp: 'New purchases stop coming in.',
  unlinkedNote:
    'This bank is unlinked. Nothing new comes in, and what already did is still in your history.',
  relink: 'Link it again',
  relinkHelp: 'Purchases start coming in again.',
  unlinkTitle: (bank: string) => `Unlink ${bank}?`,
  unlinkMessage: (bank: string) =>
    `New purchases from ${bank} stop coming in. What it already brought in stays, and you can link it again from Link a bank.`,
  unlinkLevelMessage:
    'This is your last linked bank, so your plan moves from Link to Track: Runway stops bringing purchases in, and you add them yourself.',
  unlinkConfirm: 'Unlink',
  unlinkFailed: 'That bank was not unlinked. Nothing was changed.',
  unlinkLevelFailed:
    'Unlinked, but your plan still reads Link. Tap Unlink once more, here or from this bank in Settings, to finish moving it to Track.',
  unlinkLogFailed:
    'Unlinked. Your change log did not get a line for it this time.',
  unlinkBankPending:
    'Nothing new comes in from here on. Your bank has not confirmed yet, so Runway asks it again the next time it refreshes.',
  unlinkedToast: (bank: string) => `Unlinked ${bank}`,
} as const;

/** The bank's detailed kinds of place, as people say them; an unknown code reads as its last part (`getCategoryLabel`). */
export const CATEGORY_LABELS: Record<string, string> = {
  FOOD_AND_DRINK_RESTAURANT: 'Restaurants',
  FOOD_AND_DRINK_FAST_FOOD: 'Fast food',
  FOOD_AND_DRINK_COFFEE: 'Coffee shops',
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: 'Beer, wine and liquor',
  FOOD_AND_DRINK_VENDING_MACHINES: 'Vending machines',
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: 'Food and drink',
  TRANSPORTATION_GAS: 'Gas',
  TRANSPORTATION_PARKING: 'Parking',
  TRANSPORTATION_PUBLIC_TRANSIT: 'Public transit',
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: 'Taxis and rideshares',
  TRANSPORTATION_TOLLS: 'Tolls',
  TRANSPORTATION_BIKES_AND_SCOOTERS: 'Bikes and scooters',
  TRAVEL_FLIGHTS: 'Flights',
  TRAVEL_LODGING: 'Hotels and lodging',
  TRAVEL_RENTAL_CARS: 'Rental cars',
  ENTERTAINMENT_TV_AND_MOVIES: 'Movies and TV',
  ENTERTAINMENT_MUSIC_AND_AUDIO: 'Music and audio',
  ENTERTAINMENT_VIDEO_GAMES: 'Video games',
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS:
    'Events and attractions',
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: 'Bookstores',
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: 'Clothing',
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: 'Convenience stores',
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: 'Department stores',
  GENERAL_MERCHANDISE_DISCOUNT_STORES: 'Discount stores',
  GENERAL_MERCHANDISE_ELECTRONICS: 'Electronics',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'Gifts',
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: 'Office supplies',
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: 'Online marketplaces',
  GENERAL_MERCHANDISE_PET_SUPPLIES: 'Pet supplies',
  GENERAL_MERCHANDISE_SPORTING_GOODS: 'Sporting goods',
  GENERAL_MERCHANDISE_SUPERSTORES: 'Superstores',
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: 'Pharmacies',
  MEDICAL_PRIMARY_CARE: 'Doctors',
  MEDICAL_DENTAL_CARE: 'Dentists',
  MEDICAL_EYE_CARE: 'Eye care',
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Gyms',
  PERSONAL_CARE_HAIR_AND_BEAUTY: 'Hair and beauty',
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: 'Laundry and dry cleaning',
  HOME_IMPROVEMENT_HARDWARE: 'Hardware stores',
  HOME_IMPROVEMENT_FURNITURE: 'Furniture',
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: 'Home repairs',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'Gas and electricity',
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'Internet and cable',
  RENT_AND_UTILITIES_TELEPHONE: 'Phone',
  RENT_AND_UTILITIES_WATER: 'Water',
  GENERAL_SERVICES_AUTOMOTIVE: 'Car services',
  GENERAL_SERVICES_CHILDCARE: 'Childcare',
  GENERAL_SERVICES_EDUCATION: 'Education',
  GENERAL_SERVICES_INSURANCE: 'Insurance',
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: 'Postage and shipping',
};

/** The bank's top-level kinds, which an unknown detailed code starts with. */
export const CATEGORY_PRIMARIES = [
  'FOOD_AND_DRINK',
  'TRANSPORTATION',
  'TRAVEL',
  'ENTERTAINMENT',
  'GENERAL_MERCHANDISE',
  'GENERAL_SERVICES',
  'MEDICAL',
  'PERSONAL_CARE',
  'HOME_IMPROVEMENT',
  'RENT_AND_UTILITIES',
  'LOAN_PAYMENTS',
  'BANK_FEES',
  'GOVERNMENT_AND_NON_PROFIT',
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'OTHER',
] as const;

/** A rule as its full sentence, and as the short name a long list uses. */
export interface RuleNaming {
  sentence: string;
  short: string;
}

const ruleCount = (count: number) =>
  count === 1 ? '1 rule' : `${count} rules`;

export const RULE_WORDS = {
  title: 'Rules',
  doorLabel: 'Rules',
  doorNeedsHome: (count: number) =>
    `${ruleCount(count)} ${count === 1 ? 'needs' : 'need'} a new envelope`,
  empty: 'No rules yet. Make one from a purchase with “Always do this”.',
  loading: 'Getting your rules.',
  anyCard: 'Any card',
  removedCard: 'A card that was removed',
  search: 'Search rules',
  noMatch: 'No rule matches that.',
  alwaysDo: 'Always do this',
  alwaysDoSub: 'Send purchases like this one here, from now on',
  sheetTitle: 'Always do this',
  editTitle: 'Rule',
  question: 'What should it catch?',
  thisMerchantSub: 'Only this one place',
  thisKindSub: 'Any place like it',
  thisCard: (card: string) => `Everything on ${card}`,
  thisCardSub: 'Every purchase on this card',
  merchantAloneTitle: 'Why are the others unavailable?',
  merchantAlone:
    'A place on its own can’t be narrowed to a kind or a card. Untick it to choose those.',
  envelope: 'Which envelope?',
  askEvery: 'Ask which envelope each time',
  save: 'Save',
  anEnvelope: 'an envelope',
  saveAndSend: 'Save and send',
  saveFailed: 'That did not save. Nothing was changed.',
  madeNotSent:
    'The rule is saved, but this purchase was not sent. It is still waiting in Needs a home.',
  goToNeedsHome: 'Go to Needs a home',
  changesFuture: (envelope: string) =>
    `Changes future purchases. This one stays in ${envelope}.`,
  yourRule: 'Your rule',
  heldSub: 'Waits for your answer above',
  notNow: 'Not now',
  pickOne: 'Tick at least one thing for the rule to catch.',
  pickEnvelope: 'Pick an envelope',
  remove: 'Remove the rule',
  takeover: (what: string, envelope: string) =>
    `${envelope} will catch ${what}.`,
  takeoverWait: (what: string) => `${what} will wait in Needs a home.`,
  kindFirst: (kind: string, envelope: string) =>
    `A purchase the bank files under ${kind} still goes to ${envelope}.`,
  kindAsks: (kind: string) =>
    `A purchase the bank files under ${kind} still asks which envelope.`,
  kindWaits: (kind: string) =>
    `A purchase the bank files under ${kind} still waits in Needs a home.`,
  everythingElseOn: (card: string) => `everything else on ${card}`,
  afterThis: (line: string) => `After this, ${line}`,
  takeoverMore: (count: number) =>
    `${count} more ${count === 1 ? 'envelope catches' : 'envelopes catch'} the rest.`,
  nothingMoves:
    'Where purchases go next stays the same: a closer rule already catches them.',
  onOtherCards: 'on your other cards',
  removed: 'Rule removed',
  removeFailed: 'That did not remove. Nothing was changed.',
  saved: 'Rule saved',
  made: 'Rule made',
  gone: 'This rule was changed or removed on another device.',
  endedEnvelope: (name: string | null) =>
    name === null
      ? 'Its envelope has ended, so this rule is paused'
      : `${name} has ended, so this rule is paused`,
  noEnvelope: 'an envelope that has ended',
  placedBy: (envelope: string) => `Went to ${envelope}`,
  placedBySub: (sentence: string) => `Your rule: ${sentence}`,
  suggest: (merchant: string) => `Always send ${merchant} here?`,
  suggestSub: (envelope: string) =>
    `You sent it to ${envelope} the last three times`,
  placedOne: (name: string) => `Sent to ${name} by your rule`,
  placedMany: (count: number) =>
    `Your rules sent ${count} purchases to their envelopes`,
  placedSub: 'Undo puts them back in Needs a home.',
  undo: 'Undo',
  undone: 'Put back in Needs a home',
  undoFailed: 'That was not put back. Nothing was changed.',
  undoPartial: (back: number, total: number, stayed: number) =>
    `Put ${back} of ${total} back. ${stayed} stayed where your rules sent them.`,
  madeSent: (name: string, envelope: string) => `${name} sent to ${envelope}`,
  changeMade: (sentence: string) => `Rule made: ${sentence}.`,
  changeChanged: (sentence: string) => `Rule changed: ${sentence}.`,
  changeRemoved: (sentence: string) => `Rule removed: ${sentence}.`,
  homeHeading: 'Needs a new envelope',
  goalNow: (name: string) => `${name} is a goal now, so this rule is paused`,
  pausedRestart: 'Pick an envelope and save to start it again.',
  landingTitle: (count: number) =>
    count === 1
      ? 'This rule needs a new envelope'
      : `These ${count} rules need a new envelope`,
  landing: (name: string, count: number) =>
    count === 1
      ? `${name} became a goal, and a goal can't be spent from, so it's paused. Pick where it should send purchases.`
      : `${name} became a goal, and a goal can't be spent from, so they're paused. Pick where they should send purchases.`,
  landingUndo: 'Undo making it a goal',
  groupTick: (label: string) => `Pick every rule in ${label}`,
  groupUntick: (label: string) => `Unpick every rule in ${label}`,
  groupPicked: (picked: number, total: number) =>
    `${picked} of ${total} picked`,
  pickRule: (sentence: string) => `Pick ${sentence}`,
  nothingPicked: 'Pick the rules to change',
  pickedCount: (count: number) => `${ruleCount(count)} picked`,
  selectAll: 'Pick all',
  clearAll: 'Clear',
  done: 'Done',
  bulkSend: 'Send to another envelope',
  bulkAsk: 'Ask me which envelope',
  pick: 'Select',
  bulkDelete: 'Remove',
  bulkPickTitle: (count: number) =>
    count === 1
      ? 'Where should this rule send purchases?'
      : `Where should these ${count} rules send purchases?`,
  bulkPickSub: (names: readonly string[]) =>
    names.length === 1
      ? `“${names[0]}” will send its purchases there from now on.`
      : 'Their purchases will go there from now on.',
  bulkNoEnvelopes: 'You have no envelope to send them to yet.',
  bulkSearch: 'Search your envelopes',
  bulkNoMatch: 'No envelope matches that.',
  askSkipNote: (stay: number, total: number) =>
    `${stay} of ${total} name a card or kind of place and stay as they are.`,
  askConfirmTitle: (count: number) =>
    `Have ${ruleCount(count)} ask which envelope each time?`,
  askConfirmButton: 'Ask each time',
  askNone:
    "A rule for a card or kind of place can't ask each time. Pick a rule for one place.",
  deleteConfirmTitle: (count: number) =>
    count === 1 ? 'Remove this rule?' : `Remove ${ruleCount(count)}?`,
  deleteConfirmBody: (kinds: {
    live: readonly RuleNaming[];
    ask: readonly RuleNaming[];
    paused: readonly RuleNaming[];
  }) => {
    const isShort =
      kinds.live.length + kinds.ask.length + kinds.paused.length > 3;
    const name = (rules: readonly RuleNaming[]) =>
      isShort
        ? `Your ${rules.length === 1 ? 'rule' : 'rules'} for ${joinNames(rules.map(({ short }) => short))}`
        : joinNames(rules.map(({ sentence }) => `“${sentence}”`));
    const isOne = (rules: readonly RuleNaming[]) => rules.length === 1;
    return [
      kinds.live.length > 0 &&
        `${name(kinds.live)} will stop sending purchases on ${isOne(kinds.live) ? 'its' : 'their'} own.`,
      kinds.ask.length > 0 && `${name(kinds.ask)} will stop asking.`,
      kinds.paused.length > 0 &&
        `${name(kinds.paused)} ${isOne(kinds.paused) ? 'is' : 'are'} paused already, so right now ${isOne(kinds.paused) ? 'its' : 'their'} purchases wait in Needs a home.`,
      'Purchases already placed stay where they are.',
    ]
      .filter(Boolean)
      .join(' ');
  },

  deleteConfirmButton: (count: number) =>
    count === 1 ? 'Remove the rule' : `Remove ${ruleCount(count)}`,
  movedMany: (count: number, envelope: string) =>
    `Moved ${ruleCount(count)} to ${envelope}`,
  askedMany: (count: number) =>
    `${ruleCount(count)} will ask which envelope each time`,
  removedMany: (count: number) => `Removed ${ruleCount(count)}`,
  bulkNothing: 'Nothing was changed.',
  bulkFailed: 'That did not save. Nothing was changed.',
  leftAlone: (names: readonly string[]) =>
    `${listNames(names)} changed on another device, so ${names.length === 1 ? 'it' : 'they'} stayed as ${names.length === 1 ? 'it is' : 'they are'}.`,
  notSaved: (count: number) => `${ruleCount(count)} did not save.`,
  undoneMany: (count: number) => `Put ${ruleCount(count)} back`,
  undoLeft: (names: readonly string[]) =>
    `${listNames(names)} changed since, so ${names.length === 1 ? 'it' : 'they'} stayed as ${names.length === 1 ? 'it is' : 'they are'}.`,
  changeMovedMany: (count: number, envelope: string) =>
    `Moved ${ruleCount(count)} to ${envelope}.`,
  changeAskMany: (count: number) =>
    `Set ${ruleCount(count)} to ask which envelope each time.`,
  changeRemovedMany: (count: number) => `Removed ${ruleCount(count)}.`,
  changeUndoMoved: (count: number) =>
    `Put ${ruleCount(count)} back as ${count === 1 ? 'it was' : 'they were'}.`,
  changeUndoRemoved: (count: number) => `Made ${ruleCount(count)} again.`,
  homeRowTitle: (count: number) =>
    `${count} shop ${count === 1 ? 'rule needs' : 'rules need'} a new envelope`,
  homeRowSub: 'Paused until you pick one',
} as const;

const listNames = (names: readonly string[]) =>
  names.length <= 3
    ? names.join(', ').replace(/, ([^,]*)$/, ' and $1')
    : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;

/** Picking several bills, envelopes or goals in one Plan view and changing them together. */
export const PLAN_SELECT_WORDS = {
  noun: {
    bills: ['bill', 'bills'],
    envelopes: ['envelope', 'envelopes'],
    goals: ['goal', 'goals'],
  } as const,
  tick: (name: string) => `Select ${name}`,
  count: (count: number, noun: readonly [string, string]) =>
    `${count} ${count === 1 ? noun[0] : noun[1]} selected`,
  nothing: (noun: readonly [string, string]) => `Tap the ${noun[1]} to change`,
  selectedMonthly: (
    count: number,
    noun: readonly [string, string],
    figure: string,
    notCounted: number,
  ) =>
    `${count} ${count === 1 ? noun[0] : noun[1]} · ${figure} a month${notCounted > 0 ? ` · ${notCounted} not in the total` : ''}`,
  selectAll: 'Select all',
  clearAll: 'Clear',
  done: 'Done',
  groupTicked: (ticked: number, total: number) =>
    `${ticked} of ${total} selected`,
  groupTick: (name: string) => `Select everything in ${name}`,
  groupUntick: (name: string) => `Clear everything in ${name}`,
  leaveTitle: 'Leave selecting?',
  leaveBody: (count: number, noun: readonly [string, string]) =>
    `The ${count} ${count === 1 ? noun[0] : noun[1]} you selected will be cleared.`,
  leave: 'Leave',
  change: 'Change',
  changeTitle: (count: number, noun: readonly [string, string]) =>
    `Change ${count} ${count === 1 ? noun[0] : noun[1]}`,
  archive: 'Archive',
  payOn: 'Pay on',
  payOnSub: 'The day of the month you pay them',
  paidFrom: 'Comes out of',
  paidFromSub: 'Which pay they come out of',
  paidWith: 'Charged to',
  paidWithSub: "Card or account, and whether they're on autopay",
  priority: 'Priority',
  prioritySub: 'Must, Should or Want',
  group: 'Move to a group',
  groupSub: 'Or take them out of their group',
  payOnTitle: 'When do you pay them?',
  payOnSkipped: (names: readonly string[]) =>
    `${listNames(names)} ${names.length === 1 ? 'keeps its' : 'keep their'} own pay day.`,
  feeSkipped: (names: readonly string[]) =>
    `${listNames(names)} ${names.length === 1 ? 'stays with its card' : 'stay with their cards'}, so ${names.length === 1 ? "it isn't" : "they aren't"} changed.`,
  feeOnly: 'Annual fee bills are archived with their card.',
  paidFromTitle: 'Which pay covers them?',
  paidFromSkipped: (names: readonly string[]) =>
    `${listNames(names)} ${names.length === 1 ? 'is paid once and keeps its' : 'are paid once and keep their'} own days.`,
  paidFromPinsNote: (count: number) =>
    count === 1
      ? 'This replaces 1 change you made for one pay.'
      : `This replaces ${count} changes you made for single pays.`,
  paidWithTitle: 'What are they charged to?',
  leaveEach: 'Leave each as it is',
  paysItselfOn: "They're on autopay",
  paysItselfOff: 'I mark them paid',
  priorityTitle: 'How much do they matter?',
  priorityFolds: (names: readonly string[]) =>
    `${listNames(names)} ${names.length === 1 ? 'has' : 'have'} an extra at another level. ${names.length === 1 ? 'It becomes' : 'Each becomes'} one amount at this level.`,
  groupTitle: 'Which group?',
  noGroup: 'No group',
  save: 'Save',
  nothingChanges: 'They already read that way.',
  summary: (name: string, change: string, from: string) =>
    `${name}: ${change}, from ${from}.`,
  summaryMoneyless: (name: string, change: string) => `${name}: ${change}.`,
  updated: (count: number, noun: readonly [string, string]) =>
    `Updated ${count} ${count === 1 ? noun[0] : noun[1]}`,
  updatedPartly: (done: number, total: number, failed: readonly string[]) =>
    `Updated ${done} of ${total}. ${listNames(failed)} did not save and ${failed.length === 1 ? 'is' : 'are'} still selected.`,
  pinsKept: (names: readonly string[]) =>
    `${listNames(names)} still ${names.length === 1 ? 'has' : 'have'} amounts set per pay. Open ${names.length === 1 ? 'it' : 'each'} to clear them.`,
  pickToContinue: 'Pick one to continue.',
  failed: 'That did not save. Nothing was changed.',
  undo: 'Undo',
  undone: 'Put back as they were',
  undoPartly: (done: number, total: number, skipped: readonly string[]) =>
    `Put back ${done} of ${total}. ${listNames(skipped)} changed again since or did not save, so ${skipped.length === 1 ? 'it was' : 'they were'} left as ${skipped.length === 1 ? 'it is' : 'they are'}.`,
  undoFailed: 'That could not be put back.',
  archiveTitle: (count: number, noun: readonly [string, string]) =>
    `Archive ${count} ${count === 1 ? noun[0] : noun[1]}?`,
  archiveBody: (names: readonly string[]) =>
    `${listNames(names)} ${names.length === 1 ? 'leaves' : 'leave'} your plan from today. ${names.length === 1 ? 'Its' : 'Their'} history stays.`,
  archiveHeld: (amount: string, holding: readonly string[], total: number) =>
    total === 1
      ? `It holds ${amount}`
      : holding.length === 1
        ? `${holding[0]} holds ${amount}`
        : `${listNames(holding)} hold ${amount} together`,
  archiveConfirm: (count: number, noun: readonly [string, string]) =>
    `Archive ${count} ${count === 1 ? noun[0] : noun[1]}`,
  archived: (count: number, noun: readonly [string, string]) =>
    `Archived ${count} ${count === 1 ? noun[0] : noun[1]}`,
  archivedPartly: (done: number, total: number, failed: readonly string[]) =>
    `Archived ${done} of ${total}. ${listNames(failed)} did not archive and ${failed.length === 1 ? 'is' : 'are'} still selected.`,
  hint: 'Press and hold to select several',
} as const;
