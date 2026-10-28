import type {
  BILL_DRAFT_CADENCES,
  DRAFT_TIE_KEYS,
  FUNDING_CADENCES,
} from '@apps/runway/constants';
import type {
  BillFundedBy,
  Cents,
  DateOnly,
  Ending,
  FundingRule,
  MoneyRange,
  Priority,
  Schedule,
} from '@apps/runway/types';

import { allocate } from './money';
import { planGoalContributions } from './pace';
import { occurrences, selectFundedDays } from './schedule';

export type DraftCadence =
  (typeof FUNDING_CADENCES)[number] | (typeof BILL_DRAFT_CADENCES)[number];
export type DraftTieKey = (typeof DRAFT_TIE_KEYS)[number];

export interface DraftDayInput {
  dayKey: string;
  sourceId: string | null;
  on: DateOnly;
  amount: MoneyRange;
}

export interface DraftEnvelopeInput {
  itemId: string;
  createdAt: number;
  priority: Priority;
  orderIndex: number;
  funding: FundingRule;
}

export interface DraftGoalInput extends DraftEnvelopeInput {
  targetCents: Cents;
  /** What the goal holds before any planned day. */
  heldCents: Cents;
}

export interface DraftBillInput {
  itemId: string;
  createdAt: number;
  priority: Priority;
  orderIndex: number;
  amountCents: Cents;
  schedule: Schedule;
  ending: Ending;
  fundedBy: BillFundedBy;
}

/** A bill's demand names the payment it is saving toward. */
export interface BillShare {
  dueOn: DateOnly;
  totalCents: Cents;
}

/** What one day owes one envelope, goal or bill before the money is walked. */
export interface Demand {
  dayKey: string;
  itemId: string;
  tier: Priority;
  dueBeforeNext: boolean;
  orderIndex: number;
  createdAt: number;
  cents: Cents;
  cadence: DraftCadence;
  bill: BillShare | null;
}

export const TIER_RANK: Record<Priority, number> = {
  must: 0,
  should: 1,
  want: 2,
};

/** Code-unit order, so a sort never depends on the viewer's locale. */
export const compareText = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;

export const compareDays = (
  a: { on: number; dayKey: string },
  b: { on: number; dayKey: string },
) => a.on - b.on || compareText(a.dayKey, b.dayKey);

/** The order demands are funded in; the last two keys only separate items, so they are never "ties". */
export const compareDemands = (a: Demand, b: Demand) =>
  TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
  Number(b.dueBeforeNext) - Number(a.dueBeforeNext) ||
  a.orderIndex - b.orderIndex ||
  a.createdAt - b.createdAt ||
  compareText(a.itemId, b.itemId);

const cadenceCode = (cadence: FundingRule['cadence']): DraftCadence => {
  if (cadence.kind === 'everyNth') return cadence.n === 2 ? 'every2' : 'every3';
  return cadence.kind === 'chosen' ? 'chosen' : 'everyIncomeDay';
};

/** What each planned day owes: an envelope or goal asks for its amount on every day its cadence selects, counted over the plan-wide income days (a goal stops at its target), and a bill asks for its share of each payment. */
export function buildDemands(
  days: readonly DraftDayInput[],
  incomeDays: readonly { dayKey: string; on: number }[],
  envelopes: readonly DraftEnvelopeInput[],
  bills: readonly DraftBillInput[] = [],
  horizon = 0,
  goals: readonly DraftGoalInput[] = [],
): Demand[] {
  const planned = new Set(days.map((day) => day.dayKey));
  const chronological = [...incomeDays].sort(compareDays);

  const envelopeDemands = envelopes.flatMap((envelope) =>
    selectFundedDays(envelope.funding.cadence, chronological)
      .filter((day) => planned.has(day.dayKey))
      .map((day): Demand => ({
        dayKey: day.dayKey,
        itemId: envelope.itemId,
        tier: envelope.priority,
        dueBeforeNext: false,
        orderIndex: envelope.orderIndex,
        createdAt: envelope.createdAt,
        cents: envelope.funding.amount.cents,
        cadence: cadenceCode(envelope.funding.cadence),
        bill: null,
      })),
  );
  const goalDemands = goals.flatMap((goal) =>
    planGoalContributions(goal, chronological)
      .filter(({ day }) => planned.has(day.dayKey))
      .map(({ day, cents }): Demand => ({
        dayKey: day.dayKey,
        itemId: goal.itemId,
        tier: goal.priority,
        dueBeforeNext: false,
        orderIndex: goal.orderIndex,
        createdAt: goal.createdAt,
        cents,
        cadence: cadenceCode(goal.funding.cadence),
        bill: null,
      })),
  );
  const result = [
    ...envelopeDemands,
    ...goalDemands,
    ...buildBillDemands(planned, chronological, bills, horizon),
  ];
  return result;
}

export interface IncomeDayRef {
  dayKey: string;
  on: number;
}

/** Shares of one payment across the days that fund it: each takes `ceil(remaining / days left)`, so the last takes what remains. */
const spreadShares = (totalCents: Cents, count: number) =>
  Array.from({ length: count }).reduce<{ left: Cents; shares: Cents[] }>(
    (acc, _, index) => {
      const share = Math.min(acc.left, Math.ceil(acc.left / (count - index)));
      return { left: acc.left - share, shares: [...acc.shares, share] };
    },
    { left: totalCents, shares: [] },
  ).shares;

export interface BillPayment {
  dueOn: DateOnly;
  totalCents: Cents;
  /** What each income day sets aside, in day order. */
  parts: { day: IncomeDayRef; cents: Cents }[];
}

/**
 * Every payment of a bill up to `horizon` and what each income day sets aside for it. A payment is
 * funded by the income days after the previous payment through its due date: suggested spreads it
 * over them, chosen splits it equally over the picked days that are still coming.
 */
export function planBillPayments(
  bill: DraftBillInput,
  chronological: readonly IncomeDayRef[],
  horizon: number,
): BillPayment[] {
  const dues = occurrences(
    bill.schedule,
    bill.ending,
    bill.schedule.anchor ?? 0,
    horizon,
  );
  if (bill.fundedBy.kind === 'chosen') {
    const chosen = new Set(bill.fundedBy.dayKeys);
    const days = chronological.filter((day) => chosen.has(day.dayKey));
    const shares = allocate(
      bill.amountCents,
      days.map(() => 1),
      days.map((day) => day.dayKey),
    );
    return dues.slice(0, 1).map((dueOn) => ({
      dueOn,
      totalCents: bill.amountCents,
      parts: days.map((day, index) => ({ day, cents: shares[index] })),
    }));
  }
  const result = dues.map((dueOn, index): BillPayment => {
    const previous = index === 0 ? -Infinity : dues[index - 1];
    const window = chronological.filter(
      (day) => day.on > previous && day.on <= dueOn,
    );
    const shares = spreadShares(bill.amountCents, window.length);
    return {
      dueOn,
      totalCents: bill.amountCents,
      parts: window.map((day, position) => ({
        day,
        cents: shares[position],
      })),
    };
  });
  return result;
}

/** What each planned day sets aside for each bill; a day demands all it is asked for when the payment falls before the next income day. */
function buildBillDemands(
  planned: ReadonlySet<string>,
  chronological: readonly IncomeDayRef[],
  bills: readonly DraftBillInput[],
  horizon: number,
): Demand[] {
  const nextAfter = (on: number) =>
    chronological.find((day) => day.on > on)?.on ?? Infinity;

  const result = bills.flatMap((bill) =>
    planBillPayments(bill, chronological, horizon).flatMap((payment) =>
      payment.parts
        .filter((part) => planned.has(part.day.dayKey))
        .map((part): Demand => ({
          dayKey: part.day.dayKey,
          itemId: bill.itemId,
          tier: bill.priority,
          dueBeforeNext: payment.dueOn < nextAfter(part.day.on),
          orderIndex: bill.orderIndex,
          createdAt: bill.createdAt,
          cents: part.cents,
          cadence:
            bill.fundedBy.kind === 'chosen' ? 'billChosen' : 'billSuggested',
          bill: { dueOn: payment.dueOn, totalCents: payment.totalCents },
        })),
    ),
  );
  return result;
}
