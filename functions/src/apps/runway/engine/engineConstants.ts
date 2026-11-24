// Generated from src/apps/runway/engine/engineConstants.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
/** The pure constants the figures engine and the plan types read. The engine, and the server copy of it, import from here and never from `constants.ts`. */

export const PLAN_SECTIONS = [
  'income',
  'bills',
  'envelopes',
  'goals',
  'horizon',
  'cards',
  'more',
] as const;

export const STANCES = ['conservative', 'middle', 'optimistic'] as const;

/** Entries on Plan > More; one appears when the screen it opens exists. */
export const MORE_ENTRIES = [
  'priorities',
  'accounts',
  'settings',
  'changeLog',
] as const;

export const SEALED_SCHEMA_VERSION = 1;

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

export const LOOKAHEAD_MONTHS = 12;

/** Days of income and bills the stance cushion adds up. */
export const CUSHION_DAYS = 30;

/** A gap this long between income days, or after the last one, reads as income that has ended. */
export const INCOME_END_GAP_DAYS = 45;

/** Occurrences generated for one pay line before the generator stops, a guard against a runaway ending. */
export const MAX_OCCURRENCES = 2_000;

export const PRIORITIES = ['must', 'should', 'want'] as const;

/** Every income day, or every Nth: the cadences the envelope form offers. */
export const FUNDING_CADENCES = [
  'everyIncomeDay',
  'every2',
  'every3',
  'chosen',
] as const;

export const ENVELOPE_ORDER_STEP = 1;

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

/** How a draft line for a bill was decided, beside the envelope cadences. */
export const BILL_DRAFT_CADENCES = [
  'billSuggested',
  'billChosen',
  'billLastBefore',
  'billPay',
] as const;

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
export const PURCHASE_SOURCES = ['manual', 'csv', 'link', 'email'] as const;

/** How many days after an emailed purchase a bank charge can still be it (a hold can post days later). */
export const EMAIL_MATCH_DAYS_AFTER = 7;

/** How many days before the email a bank charge can be dated and still be it (the bank dates a charge by when it happened). */
export const EMAIL_MATCH_DAYS_BEFORE = 2;

/** How long an emailed purchase waits for its bank before Home asks about it. */
export const EMAIL_WAIT_DAYS = 5;

/** How a purchase line got its envelope: the person chose it, it ran over from the chosen envelope's chain (a null envelope is Free to Spend taking the rest), or it is Free to Spend. */
export const PURCHASE_LINE_VIAS = ['chosen', 'spill', 'free'] as const;

/** Envelopes one split can name; the sealed lines are not checked by rules, so the device caps them. */
export const MAX_PURCHASE_LINES = 12;

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

export const GOAL_STATES = ['active', 'paused'] as const;

/** The pace line's three answers for a goal with a date. */
export const PACE_STATES = ['ahead', 'onPace', 'behind'] as const;

/** The levels; tracking is one switch for the whole plan, and Link is Track with a bank linked. */
export const LEVELS = ['plan', 'track', 'link'] as const;

export const LINK_STATUSES = ['active', 'needsAttention', 'revoked'] as const;

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

// How often an envelope or goal gets money, calendar first and paycheck second.
export const CALENDAR_PERIODS = [
  'weekly',
  'every2Weeks',
  'twiceMonthly',
  'monthly',
  'yearly',
] as const;

export const ACCOUNT_KINDS = [
  'checking',
  'savings',
  'cashManagement',
  'investment',
  'other',
] as const;

export const DEFAULT_CURRENCY_CODE = 'USD';

/** How many days ahead a bill's gap is covered from Free to Spend, at the least; a pay further off than this stretches it to that pay. */
export const BILL_COVER_DAYS = 30;

/** The version of the figures the engine works out; a stored snapshot from another version is never shown. */
export const ENGINE_VERSION = 1;

/** The collections under a plan that the figures read; a write to any other never makes stored figures stale. */
export const FIGURE_INPUT_COLLECTIONS: readonly string[] = [
  'items',
  'versions',
  'days',
  'moves',
  'purchases',
  'cards',
  'accounts',
  'accountBalances',
  'startedPayments',
];

/** The line a cost makes in a payment list: "Flights · Spain trip". */
export const getCostLineName = (cost: string, item: string) =>
  `${cost}\u00A0· ${item}`;

/** The bank's detailed kinds of place, as people say them; an unknown code reads as its last part. */
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

export const RULE_ENGINE_WORDS = {
  askEvery: 'Ask me every time',
  yourRule: 'Your rule',
} as const;

export const SPILL_ENGINE_WORDS = {
  ranOut: (name: string, parts: string) => `${name} ran out: ${parts}`,
  part: (amount: string, source: string) => `${amount} from ${source}`,
} as const;

export const DONE_FOR_YOU_ENGINE_WORDS = {
  ruleSent: (purchase: string, envelope: string) =>
    `${purchase} went to ${envelope}`,
} as const;
