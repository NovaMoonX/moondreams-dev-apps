import type { AppEncryption, EncryptedFieldPayload } from '@lib/security';

import type {
  CHANGE_KINDS,
  ITEM_KINDS,
  DAY_STATUSES,
  HOLD_CHOICES,
  PLAN_SECTIONS,
  PRIORITIES,
  SCHEDULE_KINDS,
  STANCES,
} from '@apps/runway/constants';

export type RunwayTab = 'home' | 'days' | 'plan';

export type PlanSection = (typeof PLAN_SECTIONS)[number];

export type Stance = (typeof STANCES)[number];

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
  keyId: string | null;
  sealed: Sealed | null;
}

export interface OpenPlan extends PlanSealedFields {
  uid: string;
  createdAt: number;
  updatedAt: number;
  stance: Stance;
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

/** What the person changed for one income day. `pairings` null means the pay line's set applies. */
export interface DayOverrideSealed {
  pairings: Pairing[] | null;
  /** The choice for a short pairing, by the target's item id. */
  holdResolutions: Record<string, HoldChoice>;
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

export interface OpenDay {
  id: string;
  payLineId: string;
  sourceId: string | null;
  expectedOn: DateOnly;
  status: DayStatus;
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
}

export interface ChangeDoc {
  id: string;
  kind: ChangeKind;
  createdAt: number;
  effectiveFrom: DateOnly | null;
  itemIds: string[];
  sealed: Sealed;
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
