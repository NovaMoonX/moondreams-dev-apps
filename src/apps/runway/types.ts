import type { AppEncryption, EncryptedFieldPayload } from '@lib/security';

import type {
  CALENDAR_PERIODS,
  CHANGE_KINDS,
  DAY_RECORD_KINDS,
  ITEM_KINDS,
  MORE_ENTRIES,
  MOVE_KINDS,
  PURCHASE_LINE_VIAS,
  PURCHASE_SOURCES,
  START_HOLDINGS,
  DAY_STATUSES,
  GOAL_STATES,
  LEVELS,
  HOLD_CHOICES,
  PLAN_SECTIONS,
  PRIORITIES,
  SCHEDULE_KINDS,
  STANCES,
} from '@apps/runway/constants';

export type RunwayTab = 'home' | 'days' | 'spend' | 'plan';

export type PlanSection = (typeof PLAN_SECTIONS)[number];

export type Stance = (typeof STANCES)[number];

export type Level = (typeof LEVELS)[number];

export type MoreEntry = (typeof MORE_ENTRIES)[number];

/** Ciphertext of a JSON object, the shape `@lib/security` produces. */
export type Sealed = EncryptedFieldPayload;

export type RunwayEncryption = AppEncryption<'runway'>;

export interface PlanSealedFields {
  currencyCode: string;
}

/** A stretch of tracking: Track is on while the last period has `to` null. A period is closed by the day tracking stopped. */
export interface TrackingPeriod {
  from: DateOnly;
  to: DateOnly | null;
}

export interface PlanDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: Stance;
  /** The starting point; null until the person says where things stand. A plan written before it existed has none. */
  startDate: DateOnly | null;
  /** Oldest first, never overlapping; a plan written before tracking existed has none and reads as Plan. */
  trackingPeriods: TrackingPeriod[];
  /** 'yyyy-mm' of the earliest month a ledger write has touched since its closing was built: closings from that month on are stale. Null when none is; a plan written before closings existed has none. */
  dirtyFrom: string | null;
  keyId: string | null;
  sealed: Sealed | null;
}

export interface OpenPlan extends PlanSealedFields {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: Stance;
  startDate: DateOnly | null;
  trackingPeriods: TrackingPeriod[];
  dirtyFrom: string | null;
  keyId: string | null;
}

/** Integer cents. */
export type Cents = number;

/** A calendar day as UTC midnight, in ms. */
export type DateOnly = number;

export type ItemKind = (typeof ITEM_KINDS)[number];
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export type Priority = (typeof PRIORITIES)[number];
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export interface MoneyRange {
  lowCents: Cents;
  highCents: Cents;
}

/** All null is never; whichever is reached first ends the line. */
export interface Ending {
  onDate: DateOnly | null;
  afterCount: number | null;
}

export interface Schedule {
  kind: ScheduleKind;
  /** The first occurrence. */
  anchor: DateOnly | null;
  /** Monthly: [d]; twice a month: [d1, d2]. Day 31 lands on a short month's last day. */
  monthDays: number[];
}

export interface SourceSealed {
  name: string;
  pairings: Pairing[];
}

export interface PayLineSealed {
  name: string;
  schedule: Schedule;
  /** Equal ends for an exact amount. */
  amount: MoneyRange;
  ending: Ending;
  /** Replaces the plan's stance for this pay line; a version written before it existed has none. */
  stanceOverride: Stance | null;
  pairings: Pairing[];
}

/** What a funding line asks for: money, basis points of the day's money, or what the pool then holds. */
export type FundingAmount =
  | { kind: 'exact'; cents: Cents }
  | { kind: 'percent'; bps: number; of: 'dayMoney' | 'remaining' }
  | { kind: 'rest' };

/** Sends part of one income day's money to a named bill, envelope or goal. */
export interface Pairing {
  targetItemId: string;
  amount: FundingAmount;
  topUpFromAnySource: boolean;
}

export type HoldChoice = (typeof HOLD_CHOICES)[number];
export type DayStatus = (typeof DAY_STATUSES)[number];
export type GoalState = (typeof GOAL_STATES)[number];

/** What the person changed for one income day. `pairings` null means the pay line's set applies. */
export interface DayOverrideSealed {
  pairings: Pairing[] | null;
  /** The choice for a short pairing, by the target's item id. */
  holdResolutions: Record<string, HoldChoice>;
  /** An envelope's or goal's whole payload for this income day only, by item id; a day written before it existed has none. */
  payloads: Record<string, EnvelopeSealed | GoalSealed>;
}

export interface IncomeDayDoc {
  id: string;
  payLineId: string;
  sourceId: string | null;
  expectedOn: DateOnly;
  arrivedOn: DateOnly | null;
  status: DayStatus;
  createdAt: number;
  confirmedAt: number | null;
  doneLineIds: string[];
  sealed: Sealed | null;
}

export type DayRecordKind = (typeof DAY_RECORD_KINDS)[number];

/** Append-only: the draft as it stood and the split that was confirmed, one each per day. */
export interface DayRecordDoc {
  id: string;
  dayId: string;
  kind: DayRecordKind;
  createdAt: number;
  sealed: Sealed;
  /** The record a correction replaces; null on the proposed and confirmed records. */
  supersedesId: string | null;
}

/** One funded line of a day, with the names it had when the day was confirmed. */
export interface RecordLine {
  lineId: string;
  itemId: string;
  name: string;
  emoji: string | null;
  tier: Priority;
  demandCents: Cents;
  cents: Cents;
  shortBy: Cents;
  paidBy: { dayId: string; cents: Cents }[];
}

export interface ProposedSealed {
  /** Names the plan and the day's changes the draft was computed from. */
  fingerprint: string;
  stance: Stance;
  expectedCents: Cents;
  freeToSpendCents: Cents;
  lines: RecordLine[];
}

/** What differs from the proposed draft, each with an optional note. */
export type RecordDifference =
  | {
      kind: 'amount';
      plannedCents: Cents;
      actualCents: Cents;
      note: string | null;
    }
  | {
      /** A line given more or less than the draft proposed: where the extra went or the shortfall came from. */
      kind: 'line';
      lineId: string;
      itemId: string;
      name: string;
      plannedCents: Cents;
      actualCents: Cents;
      note: string | null;
    };

export interface ConfirmedSealed {
  fingerprint: string;
  stance: Stance;
  arrivedCents: Cents;
  expectedCents: Cents;
  freeToSpendCents: Cents;
  lines: RecordLine[];
  differences: RecordDifference[];
}

/** A line a correction changed, with what it was and what it became. */
export interface CorrectionChange {
  lineId: string;
  itemId: string;
  name: string;
  emoji: string | null;
  beforeCents: Cents;
  afterCents: Cents;
}

/** The split a correction puts in place of the one it replaces, with what changed and why. */
export interface CorrectionSealed {
  stance: Stance;
  arrivedCents: Cents;
  freeToSpendCents: Cents;
  lines: RecordLine[];
  before: { arrivedCents: Cents; freeToSpendCents: Cents };
  changes: CorrectionChange[];
  note: string | null;
}

interface OpenRecordBase {
  id: string;
  dayId: string;
  createdAt: number;
}

export type OpenRecord =
  | (OpenRecordBase & { kind: 'proposed'; payload: ProposedSealed })
  | (OpenRecordBase & { kind: 'confirmed'; payload: ConfirmedSealed })
  | (OpenRecordBase & {
      kind: 'correction';
      supersedesId: string;
      payload: CorrectionSealed;
    });

export interface OpenDay {
  id: string;
  payLineId: string;
  sourceId: string | null;
  expectedOn: DateOnly;
  arrivedOn: DateOnly | null;
  confirmedAt: number | null;
  status: DayStatus;
  doneLineIds: string[];
  override: DayOverrideSealed;
}

export interface FundingRule {
  /** A calendar cadence reads it as the amount for one period; the others as the amount for one income day. */
  amount: FundingAmount;
  cadence:
    | { kind: 'everyIncomeDay' }
    | { kind: 'everyNth'; n: 2 | 3; anchorDayKey: string }
    | { kind: 'chosen'; dayKeys: string[] }
    | { kind: 'calendar'; period: CalendarPeriod; startsOn: DateOnly | null }
    | { kind: 'none' };
  /** The income source whose pay the rule counts; a rule written before it existed counts every source. */
  sourceId?: string | null;
}

export interface EnvelopeSealed {
  name: string;
  emoji: string | null;
  priority: Priority;
  /** A fractional rank inside the priority tier. */
  orderIndex: number;
  funding: FundingRule;
}

/** How a bill is funded: spread over the income days before it is due, or on days the person picked. */
export type BillFundedBy =
  { kind: 'suggested' } | { kind: 'chosen'; dayKeys: string[] };

export interface BillSealed {
  name: string;
  emoji: string | null;
  priority: Priority;
  /** A fractional rank inside the priority tier. */
  orderIndex: number;
  /** Equal ends for an exact amount. */
  amount: MoneyRange;
  timing: { kind: 'date'; schedule: Schedule };
  ending: Ending;
  fundedBy: BillFundedBy;
  /** Replaces the plan's stance for this bill; a version written before it existed has none. */
  stanceOverride: Stance | null;
  /** The card it is usually charged to, which marking it paid starts from; null (or missing on an older version) when it is paid in cash. */
  paidByCardId?: string | null;
}

export interface GoalSealed {
  name: string;
  emoji: string | null;
  priority: Priority;
  /** A fractional rank inside the priority tier. */
  orderIndex: number;
  targetCents: Cents;
  targetDate: DateOnly | null;
  funding: FundingRule;
  /** What it held when it was added, for a plan that has not said where things stand yet; a version written before it existed has none. */
  startingCents?: Cents | null;
  /** Paused stops new money and keeps the balance; a version written before it existed has none and reads as active. */
  state: GoalState;
}

export interface PlanItemDoc {
  id: string;
  kind: ItemKind;
  parentId: string | null;
  createdAt: number;
  endedAt: DateOnly | null;
  archivedAt: number | null;
  /** From this day what the item holds is Free to spend; null while it keeps it (never stopped, or kept when it stopped). A header written before the choice existed has no key and reads as released when it stopped. */
  heldReleasedOn: DateOnly | null;
}

/** A credit card: the reserve it shows is what has been charged to it and not yet paid off. `archivedAt` hides it from new charges. */
export interface CardDoc {
  id: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
  sealed: Sealed;
}

export interface CardSealed {
  /** The bank that issues it ("Capital One"). */
  issuer: string;
  /** The card's own name ("Venture X"), when it has one. */
  name: string | null;
  /** The day of the month a payment is due (1 to 31, the month's last day when shorter); null when none was given. */
  dueDay: number | null;
}

export interface OpenCard extends CardSealed {
  id: string;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface PlanVersionDoc {
  id: string;
  itemId: string;
  kind: ItemKind;
  createdAt: number;
  effectiveFrom: DateOnly;
  effectiveUntil: DateOnly | null;
  changeId: string;
  sealed: Sealed;
}

export interface ChangeSealed {
  summary: string;
  /** The person's reason; a change written before notes existed has none. */
  note?: string | null;
}

export interface ChangeDoc {
  id: string;
  kind: ChangeKind;
  createdAt: number;
  effectiveFrom: DateOnly | null;
  itemIds: string[];
  sealed: Sealed;
}

/** A change entry as the log shows it; `isUnreadable` is set when its sealed payload would not open, and the readable fields still show. */
export interface OpenChange {
  id: string;
  kind: ChangeKind;
  createdAt: number;
  effectiveFrom: DateOnly | null;
  itemIds: string[];
  summary: string;
  note: string | null;
  isUnreadable: boolean;
}

interface OpenVersionBase {
  id: string;
  itemId: string;
  createdAt: number;
  effectiveFrom: DateOnly;
  effectiveUntil: DateOnly | null;
  changeId: string;
}

export type OpenVersion =
  | (OpenVersionBase & { kind: 'source'; payload: SourceSealed })
  | (OpenVersionBase & { kind: 'payLine'; payload: PayLineSealed })
  | (OpenVersionBase & { kind: 'envelope'; payload: EnvelopeSealed })
  | (OpenVersionBase & { kind: 'bill'; payload: BillSealed })
  | (OpenVersionBase & { kind: 'goal'; payload: GoalSealed });

export type PayLineVersion = Extract<OpenVersion, { kind: 'payLine' }>;
export type SourceVersion = Extract<OpenVersion, { kind: 'source' }>;
export type EnvelopeVersion = Extract<OpenVersion, { kind: 'envelope' }>;
export type BillVersion = Extract<OpenVersion, { kind: 'bill' }>;
export type GoalVersion = Extract<OpenVersion, { kind: 'goal' }>;

export type MoveKind = (typeof MOVE_KINDS)[number];

/** Append-only: a bill marked paid (`reversesMoveId` null) or the undo of one, or a `start` holding. `date` is the due date of a payment, or the starting day of a `start`. */
export interface MoveDoc {
  id: string;
  kind: MoveKind;
  date: DateOnly;
  refId: string | null;
  reversesMoveId: string | null;
  createdAt: number;
  sealed: Sealed;
}

export interface BillPaidSealed {
  amountCents: Cents;
  /** The day the person marked it paid. */
  paidOn: DateOnly;
  /** The part that had not been set aside yet, which came out of Free to spend. */
  fromFreeCents: Cents;
  /** The card it was charged to, which then owes it while the cash stays put; null (or missing on an older move) when it was paid in cash. */
  cardId?: string | null;
}

/** A card paid off: `refId` is the card, `date` the day it was paid. */
export interface CardPaymentSealed {
  amountCents: Cents;
}

export type StartHolding = (typeof START_HOLDINGS)[number];

/** What one holding had on the starting day: the money on hand, what an envelope or goal holds, what a bill has set aside, or what a card owes. */
export interface StartSealed {
  amountCents: Cents;
  holding: StartHolding;
}

/** Tracking turned on (`up`, on the first day of the period) or off (`down`, on the last day it counted). */
export interface TrackingChangeSealed {
  direction: 'up' | 'down';
}

interface OpenMoveBase {
  id: string;
  date: DateOnly;
  refId: string | null;
  reversesMoveId: string | null;
  createdAt: number;
}

export type OpenMove =
  | (OpenMoveBase & { kind: 'billPaid'; payload: BillPaidSealed })
  | (OpenMoveBase & { kind: 'start'; payload: StartSealed })
  | (OpenMoveBase & { kind: 'trackingChange'; payload: TrackingChangeSealed })
  | (OpenMoveBase & { kind: 'cardPayment'; payload: CardPaymentSealed });

export type PaidMove = Extract<OpenMove, { kind: 'billPaid' }>;
export type StartMove = Extract<OpenMove, { kind: 'start' }>;

export type PurchaseSource = (typeof PURCHASE_SOURCES)[number];
export type PurchaseLineVia = (typeof PURCHASE_LINE_VIAS)[number];

/** Part of a purchase: the envelope it comes out of, or null when it comes out of Free to spend. */
export interface PurchaseLine {
  envelopeId: string | null;
  /** Negative on a refund. */
  cents: Cents;
  via: PurchaseLineVia;
}

export interface PurchaseSealed {
  /** Negative for a refund. */
  amountCents: Cents;
  merchant: string | null;
  /** The person's own name for the purchase; it titles the row before the merchant. Null on purchases saved before labels existed. */
  label: string | null;
  /** A memo, read on the purchase's sheet and never used as its title. */
  note: string | null;
  /** Adds up to `amountCents`. */
  lines: PurchaseLine[];
  /** The purchase a refund returns money for; null for a purchase or a refund that names none. */
  refundOfId: string | null;
  /** The card it was charged to, whose payment it then waits for; null (or missing on an older purchase) when it was paid in cash. */
  paidByCardId?: string | null;
}

/** `date` is the spending day, date-only; `createdAt` is the instant it was added. */
export interface PurchaseDoc {
  id: string;
  date: DateOnly;
  source: PurchaseSource;
  needsHome: boolean;
  createdAt: number;
  updatedAt: number;
  sealed: Sealed;
}

export interface OpenPurchase extends PurchaseSealed {
  id: string;
  date: DateOnly;
  source: PurchaseSource;
  needsHome: boolean;
  createdAt: number;
  updatedAt: number;
}

/** What the ledger summed to at the end of a month, as stored: dates are whole days since 1970, a bill's funded days are `[day, cents]` and its paid payments `[dueDay, cents, paidDay, fromFreeCents, mark]`, where `mark` is the number of the mark in the move's id or the id itself when it is not the usual one. */
export interface ClosingSealed {
  version: number;
  startDay: number;
  arrivedCents: Cents;
  given: Record<string, Cents>;
  /** `[day, arrivedCents, given]` for each split that arrived after its month ended and is still after the next month's start. */
  late: [number, Cents, Record<string, Cents>][];
  spentCents: Cents;
  spentByItem: Record<string, Cents>;
  funded: Record<string, [number, Cents][]>;
  /** `[dueDay, amountCents, paidDay, fromFreeCents, mark, cardId]`. */
  paid: Record<
    string,
    [number, Cents, number, Cents, number | string, string | null][]
  >;
  /** What purchases charged to each card, by card id. */
  charged: Record<string, Cents>;
  /** `[day, cents, moveId]` for each card payment not undone. */
  cardPaid: Record<string, [number, Cents, string][]>;
}

/** A month's closing: a cache that is rebuilt whenever the ledger it summed changes. The id is the month, `yyyy-mm`. */
export interface ClosingDoc {
  id: string;
  month: string;
  createdAt: number;
  sealed: Sealed;
}

// Round 4: funding on the calendar.
export type CalendarPeriod = (typeof CALENDAR_PERIODS)[number];
