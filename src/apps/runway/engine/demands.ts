import type {
  BILL_DRAFT_CADENCES,
  DRAFT_TIE_KEYS,
  CALENDAR_PERIODS,
  FUNDING_CADENCES,
  PAIRING_DRAFT_CADENCES,
} from '@apps/runway/constants';
import type {
  BillFundedBy,
  Cents,
  DateOnly,
  Ending,
  FundingRule,
  MoneyRange,
  Pairing,
  Priority,
  Schedule,
  Stance,
} from '@apps/runway/types';

import { allocate, percentOf, percentShares } from './money';
import {
  countFundedDays,
  fundedInWindow,
  NO_PROGRESS,
  sumFunded,
  type BillProgressInput,
  type PaidPayment,
} from './progress';
import { planGoalContributions } from './pace';
import { effectiveStance, pick } from './stance';
import { getCalendarCents } from './calendar';
import { occurrences, selectRuleDays } from './schedule';

export type DraftCadence =
  | (typeof FUNDING_CADENCES)[number]
  | (typeof CALENDAR_PERIODS)[number]
  | (typeof BILL_DRAFT_CADENCES)[number]
  | (typeof PAIRING_DRAFT_CADENCES)[number];
export type DraftTieKey = (typeof DRAFT_TIE_KEYS)[number];

export interface DraftDayInput {
  dayKey: string;
  sourceId: string | null;
  on: DateOnly;
  amount: MoneyRange;
  /** This day's own stance, from its pay line; the plan's applies when null. */
  stanceOverride?: Stance | null;
  /** Pairing sets from the day, its pay line and its source; the narrowest non-empty one applies. */
  pairings?: {
    day: readonly Pairing[] | null;
    payLine: readonly Pairing[];
    source: readonly Pairing[];
  };
}

/** An income day a rule counts over. */
export interface DraftIncomeDay {
  dayKey: string;
  on: number;
  moneyCents?: Cents;
  sourceId?: string | null;
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
  /** Equal ends for an exact amount. */
  amount: MoneyRange;
  stanceOverride?: Stance | null;
  schedule: Schedule;
  ending: Ending;
  fundedBy: BillFundedBy;
  /** What confirmed days and payments already say about this bill; none until a day is confirmed. */
  progress?: BillProgressInput;
}

/** How a demand was asked for: money, a share of the day's money, or the rest of it. */
export type DraftAsk =
  | { kind: 'exact' }
  | { kind: 'percent'; bps: number; of: 'dayMoney' | 'remaining' }
  | { kind: 'rest' };

/** A bill's demand names the payment it is saving toward. */
export interface BillShare {
  dueOn: DateOnly;
  totalCents: Cents;
  /** The bill's range and the stance that picked the total (the bill's own, else the plan's); null when it is exact. */
  ranged: {
    range: MoneyRange;
    stance: Stance;
    isOwnStance: boolean;
  } | null;
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
  ask: DraftAsk;
  /** A `rest` demand's ceiling (a goal's target left); null for no ceiling. */
  capCents: Cents | null;
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

/** The order demands are funded in; a `rest` demand goes last in its tier, and the last two keys only separate items, so they are never "ties". */
export const compareDemands = (a: Demand, b: Demand) =>
  TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
  Number(a.ask.kind === 'rest') - Number(b.ask.kind === 'rest') ||
  Number(b.dueBeforeNext) - Number(a.dueBeforeNext) ||
  a.orderIndex - b.orderIndex ||
  a.createdAt - b.createdAt ||
  compareText(a.itemId, b.itemId);

const cadenceCode = (cadence: FundingRule['cadence']): DraftCadence => {
  if (cadence.kind === 'calendar') return cadence.period;
  if (cadence.kind === 'everyNth') return cadence.n === 2 ? 'every2' : 'every3';
  return cadence.kind === 'chosen' ? 'chosen' : 'everyIncomeDay';
};

/** An exact amount, or a percentage of the day's money rounded down; a `rest` demand is sized when the pool is walked. */
const getDemandCents = (funding: FundingRule, moneyCents: Cents) => {
  const { amount } = funding;
  if (funding.cadence.kind === 'none') return 0;
  if (amount.kind === 'exact') return amount.cents;
  const result =
    amount.kind === 'percent' ? percentOf(moneyCents, amount.bps) : 0;
  return result;
};

const getAsk = (funding: FundingRule): DraftAsk =>
  funding.amount.kind === 'percent'
    ? { kind: 'percent', bps: funding.amount.bps, of: 'dayMoney' }
    : { kind: funding.amount.kind === 'rest' ? 'rest' : 'exact' };

/** Percentage demands on one day, rounded once and shared out so they add to at most the day's money; a goal cut short by its target keeps the cut. */
function sharePercentDemands(
  demands: readonly Demand[],
  dayMoney: ReadonlyMap<string, Cents>,
): Demand[] {
  const byDay = demands.reduce((acc, demand) => {
    if (demand.ask.kind !== 'percent') return acc;
    return acc.set(demand.dayKey, [...(acc.get(demand.dayKey) ?? []), demand]);
  }, new Map<string, Demand[]>());
  const shares = new Map(
    [...byDay.entries()].flatMap(([dayKey, lines]) => {
      const shared = percentShares(
        dayMoney.get(dayKey) ?? 0,
        lines.map((line) => (line.ask.kind === 'percent' ? line.ask.bps : 0)),
        lines.map((line) => line.itemId),
      );
      return lines.map((line, index): [string, Cents] => [
        `${line.dayKey}:${line.itemId}`,
        line.ask.kind === 'percent' &&
        line.cents < percentOf(dayMoney.get(dayKey) ?? 0, line.ask.bps)
          ? line.cents
          : shared[index],
      ]);
    }),
  );
  const result = demands.map((demand) => {
    const cents = shares.get(`${demand.dayKey}:${demand.itemId}`);
    return cents === undefined ? demand : { ...demand, cents };
  });
  return result;
}

/** What each planned day owes: an envelope or goal asks for its amount on every day its cadence selects, counted over the plan-wide income days (a goal stops at its target), and a bill asks for its share of each payment. */
export function buildDemands(
  days: readonly DraftDayInput[],
  incomeDays: readonly DraftIncomeDay[],
  envelopes: readonly DraftEnvelopeInput[],
  bills: readonly DraftBillInput[] = [],
  horizon = 0,
  goals: readonly DraftGoalInput[] = [],
  dayMoney: ReadonlyMap<string, Cents> = new Map(),
  stance: Stance = 'conservative',
  priorDays: readonly DraftIncomeDay[] = [],
): Demand[] {
  const planned = new Set(days.map((day) => day.dayKey));
  const moneyOf = (day: { dayKey: string; moneyCents?: Cents }) =>
    dayMoney.get(day.dayKey) ?? day.moneyCents ?? 0;
  const chronological = [...incomeDays]
    .sort(compareDays)
    .map((day) => ({ ...day, moneyCents: moneyOf(day) }));

  const envelopeDemands = envelopes.flatMap((envelope) => {
    const funded = selectRuleDays(envelope.funding, chronological);
    const calendar = getCalendarCents(envelope.funding, funded, priorDays);
    return funded
      .filter((day) => planned.has(day.dayKey))
      .map((day): Demand => ({
        dayKey: day.dayKey,
        itemId: envelope.itemId,
        tier: envelope.priority,
        dueBeforeNext: false,
        orderIndex: envelope.orderIndex,
        createdAt: envelope.createdAt,
        cents: calendar
          ? (calendar.get(day.dayKey) ?? 0)
          : getDemandCents(envelope.funding, moneyOf(day)),
        cadence: cadenceCode(envelope.funding.cadence),
        bill: null,
        ask: getAsk(envelope.funding),
        capCents: null,
      }));
  });
  const goalDemands = goals.flatMap((goal) =>
    planGoalContributions(goal, chronological, priorDays)
      .filter(({ day }) => planned.has(day.dayKey))
      .map(({ day, cents }): Demand => ({
        dayKey: day.dayKey,
        itemId: goal.itemId,
        tier: goal.priority,
        dueBeforeNext: false,
        orderIndex: goal.orderIndex,
        createdAt: goal.createdAt,
        cents: goal.funding.amount.kind === 'rest' ? 0 : cents,
        cadence: cadenceCode(goal.funding.cadence),
        bill: null,
        ask: getAsk(goal.funding),
        capCents: goal.funding.amount.kind === 'rest' ? cents : null,
      })),
  );
  const result = [
    ...sharePercentDemands([...envelopeDemands, ...goalDemands], dayMoney),
    ...buildBillDemands(planned, chronological, bills, horizon, stance),
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
      acc.shares.push(share);
      return { left: acc.left - share, shares: acc.shares };
    },
    { left: totalCents, shares: [] },
  ).shares;

/** The first index whose day is after `on`, in a list ordered by day. */
const indexAfter = (
  days: readonly IncomeDayRef[],
  on: number,
  low = 0,
  high = days.length,
): number => {
  if (low >= high) return low;
  const middle = (low + high) >> 1;
  return days[middle].on > on
    ? indexAfter(days, on, low, middle)
    : indexAfter(days, on, middle + 1, high);
};

/** Where to start in a bill's due dates when nothing before the first income day can be funded: the payment before the first one due on or after it, whose date opens that one's window. */
const getFirstNeeded = (
  dues: readonly number[],
  firstDayOn: number | undefined,
) => {
  if (firstDayOn === undefined) return 0;
  const found = dues.findIndex((dueOn) => dueOn >= firstDayOn);
  return found === -1 ? dues.length : Math.max(0, found - 1);
};

const isInDayOrder = (days: readonly IncomeDayRef[]) =>
  days.every((day, index) => index === 0 || days[index - 1].on <= day.on);

export interface BillPayment {
  dueOn: DateOnly;
  totalCents: Cents;
  /** What each income day sets aside, in day order. */
  parts: { day: IncomeDayRef; cents: Cents }[];
  ranged: BillShare['ranged'];
  /** Set aside by confirmed days so far. */
  fundedCents: Cents;
  /** Confirmed days that set money aside for it. */
  fundedDays: number;
  /** The mark that paid it, or null while it is unpaid; a paid payment asks nothing more. */
  paid: PaidPayment | null;
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
  stance: Stance = 'conservative',
  options: { firstDayOn?: number } = {},
): BillPayment[] {
  const progress = bill.progress ?? NO_PROGRESS;
  const billStance = effectiveStance(stance, bill.stanceOverride);
  const amountCents = pick(billStance, bill.amount, 'expense');
  const ranged =
    bill.amount.lowCents === bill.amount.highCents
      ? null
      : {
          range: bill.amount,
          stance: billStance,
          isOwnStance: Boolean(bill.stanceOverride),
        };
  const dues = occurrences(
    bill.schedule,
    bill.ending,
    bill.schedule.anchor ?? 0,
    horizon,
  );
  if (bill.fundedBy.kind === 'chosen') {
    const chosen = new Set(bill.fundedBy.dayKeys);
    const days = chronological.filter((day) => chosen.has(day.dayKey));
    return dues.slice(0, 1).map((dueOn) => {
      const paid = progress.paid.find((entry) => entry.dueOn === dueOn) ?? null;
      const fundedCents = sumFunded(progress.funded);
      const shares = allocate(
        paid ? 0 : Math.max(0, amountCents - fundedCents),
        days.map(() => 1),
        days.map((day) => day.dayKey),
      );
      return {
        dueOn,
        totalCents: amountCents,
        ranged,
        parts: paid
          ? []
          : days.map((day, index) => ({ day, cents: shares[index] })),
        fundedCents,
        fundedDays: countFundedDays(progress.funded),
        paid,
      };
    });
  }
  const ordered = isInDayOrder(chronological);
  const paidByDue = new Map(
    [...progress.paid].reverse().map((entry) => [entry.dueOn, entry]),
  );
  const first = getFirstNeeded(dues, options.firstDayOn);
  const result = dues.slice(first).map((dueOn, offset): BillPayment => {
    const index = first + offset;
    const previous = index === 0 ? -Infinity : dues[index - 1];
    const window = ordered
      ? chronological.slice(
          indexAfter(chronological, previous),
          indexAfter(chronological, dueOn),
        )
      : chronological.filter((day) => day.on > previous && day.on <= dueOn);
    const confirmed = fundedInWindow(progress.funded, previous, dueOn);
    const fundedCents = sumFunded(confirmed);
    const paid = paidByDue.get(dueOn) ?? null;
    const shares = spreadShares(
      paid ? 0 : Math.max(0, amountCents - fundedCents),
      window.length,
    );
    return {
      dueOn,
      totalCents: amountCents,
      ranged,
      parts: paid
        ? []
        : window.map((day, position) => ({
            day,
            cents: shares[position],
          })),
      fundedCents,
      fundedDays: countFundedDays(confirmed),
      paid,
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
  stance: Stance,
): Demand[] {
  const nextAfter = (on: number) =>
    chronological.find((day) => day.on > on)?.on ?? Infinity;

  const result = bills.flatMap((bill) =>
    planBillPayments(bill, chronological, horizon, stance, {
      firstDayOn: chronological[0]?.on ?? Infinity,
    }).flatMap((payment) =>
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
          bill: {
            dueOn: payment.dueOn,
            totalCents: payment.totalCents,
            ranged: payment.ranged,
          },
          ask: { kind: 'exact' },
          capCents: null,
        })),
    ),
  );
  return result;
}
