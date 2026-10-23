import type { AppEncryption, EncryptedFieldPayload } from '@lib/security';

import type {
  CHANGE_KINDS,
  DAY_RECORD_KINDS,
  ITEM_KINDS,
  MORE_ENTRIES,
  MOVE_KINDS,
  START_HOLDINGS,
  DAY_STATUSES,
  GOAL_STATES,
  HOLD_CHOICES,
  PLAN_SECTIONS,
  PRIORITIES,
  SCHEDULE_KINDS,
  STANCES,
} from '@apps/runway/constants';

export type RunwayTab = 'home' | 'days' | 'plan';

export type PlanSection = (typeof PLAN_SECTIONS)[number];

export type Stance = (typeof STANCES)[number];

export type MoreEntry = (typeof MORE_ENTRIES)[number];

/** Ciphertext of a JSON object, the shape `@lib/security` produces. */
export type Sealed = EncryptedFieldPayload;

export type RunwayEncryption = AppEncryption<'runway'>;

export interface PlanSealedFields {
  currencyCode: string;
}

export interface PlanDoc {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: Stance;
  /** The starting point; null until the person says where things stand. A plan written before it existed has none. */
  startDate: DateOnly | null;
  keyId: string | null;
  sealed: Sealed | null;
}

export interface OpenPlan extends PlanSealedFields {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: Stance;
  startDate: DateOnly | null;
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
  amount: FundingAmount;
  cadence:
    | { kind: 'everyIncomeDay' }
    | { kind: 'everyNth'; n: 2 | 3; anchorDayKey: string }
    | { kind: 'chosen'; dayKeys: string[] };
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
}

export type StartHolding = (typeof START_HOLDINGS)[number];

/** What one holding had on the starting day: the money on hand, or what a goal holds or a bill has set aside. */
export interface StartSealed {
  amountCents: Cents;
  holding: StartHolding;
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
  | (OpenMoveBase & { kind: 'start'; payload: StartSealed });

export type PaidMove = Extract<OpenMove, { kind: 'billPaid' }>;
export type StartMove = Extract<OpenMove, { kind: 'start' }>;
