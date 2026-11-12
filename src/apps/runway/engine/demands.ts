import type {
  BILL_DRAFT_CADENCES,
  DRAFT_TIE_KEYS,
  CALENDAR_PERIODS,
  FUNDING_CADENCES,
  HORIZON_DRAFT_CADENCES,
  PAIRING_DRAFT_CADENCES,
} from '@apps/runway/constants';
import { START_DAY_KEY } from '@apps/runway/constants';
import type {
  BillFundedBy,
  Cents,
  DateOnly,
  Ending,
  FundingRule,
  HorizonCost,
  HorizonRest,
  HorizonState,
  MoneyRange,
  Pairing,
  Priority,
  PriorityExtra,
  Schedule,
  Stance,
} from '@apps/runway/types';

import {
  DAY_MS,
  addUtcMonths,
  daysInUtcMonth,
  payLineIdOfDayKey,
} from './dates';
import type { GoalCover } from './horizonGoal';
import { allocate, percentOf, percentShares } from './money';
import {
  countFundedDays,
  fundedInWindow,
  getHeldForPayment,
  NO_PROGRESS,
  sumFunded,
  type BillProgressInput,
  type FundedDay,
  type PaidPayment,
} from './progress';
import {
  getCostPriority,
  getPriorBeat,
  listHorizonPayments,
  planHorizon,
} from './horizon';
import { planGoalContributions } from './pace';
import { effectiveStance, pick } from './stance';
import { getCalendarCents } from './calendar';
import {
  getIntervalMonths,
  occurrences,
  selectRuleDays,
  canPayOnSchedule,
  toPayOn,
} from './schedule';
import { matchMovedDates } from './moved';
import {
  getLineId,
  getPartAsks,
  getParts,
  getRunAsker,
  splitAcrossParts,
  TIER_RANK,
  type FundingRun,
} from './parts';

export type DraftCadence =
  | (typeof FUNDING_CADENCES)[number]
  | (typeof CALENDAR_PERIODS)[number]
  | (typeof BILL_DRAFT_CADENCES)[number]
  | (typeof PAIRING_DRAFT_CADENCES)[number]
  | (typeof HORIZON_DRAFT_CADENCES)[number];
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
  /** The most the envelope should hold; it asks for nothing once it holds this much. */
  maxCents?: Cents | null;
  /** What it holds before any planned day, which a max counts against. */
  heldCents?: Cents;
  /** Lower-priority extras on the same days; each is its own demand at its own tier. */
  extras?: readonly PriorityExtra[] | null;
  /** The funding as each of its versions set it: a walk over earlier days reads each one's own, and the drafted day's own funding stands for itself. */
  fundingRuns?: readonly FundingRun[];
}

export interface DraftGoalInput extends DraftEnvelopeInput {
  targetCents: Cents;
  /** What the goal holds before any planned day. */
  heldCents: Cents;
}

/** What a bill said from one date on, so a payment reads the amount, schedule and funding in force on its own due day. */
export interface DraftBillStretch {
  /** First day it applies; `-Infinity` for the earliest. */
  from: number;
  amount: MoneyRange;
  stanceOverride?: Stance | null;
  schedule: Schedule;
  ending: Ending;
  fundedBy: BillFundedBy;
  /** The day of the month it is paid, before its due date; null or missing pays on the due date. */
  payOnDay?: number | null;
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
  payOnDay?: number | null;
  /** The bill's versions in order, when it changes over time: each payment takes the one in force on its due day, and the fields above stand for a bill with none. */
  stretches?: readonly DraftBillStretch[];
  /** Cents a day must give this bill by day key, whatever the funding says; the rest of a payment is spread over its other eligible days. */
  fixed?: Readonly<Record<string, Cents>>;
  /** What a pay that pays this bill first asks of it, by day key: those pays carry their figure and the other pays share only the rest. A day with a fixed share ignores it. */
  paired?: Readonly<Record<string, Cents>>;
  /** Pay lines that pay once: spread may use them, the pay before it's due and a named pay never do. */
  oneTimePayLineIds?: ReadonlySet<string>;
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
  /** The day the money leaves: the due date unless the bill is paid on a day of its own. Missing reads as `dueOn`. */
  payOn?: DateOnly;
  totalCents: Cents;
  /** What confirmed days already set aside for the payment. */
  setAsideCents?: Cents;
  /** The bill comes round less often than monthly, so each pay saves a little toward it. */
  isSavingUp?: boolean;
  /** The bill's range and the stance that picked the total (the bill's own, else the plan's); null when it is exact. */
  ranged: {
    range: MoneyRange;
    stance: Stance;
    isOwnStance: boolean;
  } | null;
}

/** A Horizon cost's demand names the payment it is saving toward. */
export interface CostShare {
  costId: string;
  dueOn: DateOnly;
  totalCents: Cents;
  /** What the item's own money covers of the payment. */
  coveredCents: Cents;
  /** What the pays carry: the payment less what the item covers; the most one pay can put in. */
  needCents: Cents;
  ranged: BillShare['ranged'];
  /** How many pays share the payment. */
  payCount: number;
}

/** What one day owes one envelope, goal or bill before the money is walked. */
export interface Demand {
  dayKey: string;
  itemId: string;
  /** The extra this demand funds, by its level; null for the item's own amount. */
  part: Priority | null;
  tier: Priority;
  dueBeforeNext: boolean;
  orderIndex: number;
  createdAt: number;
  cents: Cents;
  cadence: DraftCadence;
  bill: BillShare | null;
  ask: DraftAsk;
  /** A `rest` demand's ceiling (a goal's target left, an envelope's room under its max); null for no ceiling. */
  capCents: Cents | null;
  /** The person set this day's share of the bill, so the line shows even at nothing. */
  isFixed?: boolean;
  /** Set on a Horizon cost's demand; its line is the cost's own. */
  costId?: string | null;
  cost?: CostShare | null;
  /** The demand gives back to Free to Spend what a fronted payment took, and adds nothing to the item. */
  repaysFree?: boolean;
}

export { TIER_RANK };

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
        getLineId(line.dayKey, line.itemId, line.part),
        line.ask.kind === 'percent' &&
        line.cents < percentOf(dayMoney.get(dayKey) ?? 0, line.ask.bps)
          ? line.cents
          : shared[index],
      ]);
    }),
  );
  const result = demands.map((demand) => {
    const cents = shares.get(
      getLineId(demand.dayKey, demand.itemId, demand.part),
    );
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
  horizonItems: readonly DraftHorizonInput[] = [],
  carriesEarlier = false,
): Demand[] {
  const planned = new Set(days.map((day) => day.dayKey));
  const skipBefore = carriesEarlier
    ? days.reduce((first, day) => Math.min(first, day.on), Infinity)
    : undefined;
  const moneyOf = (day: { dayKey: string; moneyCents?: Cents }) =>
    dayMoney.get(day.dayKey) ?? day.moneyCents ?? 0;
  const chronological = [...incomeDays]
    .sort(compareDays)
    .map((day) => ({ ...day, moneyCents: moneyOf(day) }));

  const envelopeDemands = envelopes.flatMap((envelope) => {
    const funded = selectRuleDays(envelope.funding, chronological);
    const calendar = getCalendarCents(envelope.funding, funded, priorDays);
    const partAsks = getPartAsks(envelope, funded, priorDays);
    const parts = getParts(envelope);
    const isRest = envelope.funding.amount.kind === 'rest';
    const max = envelope.maxCents ?? null;
    const runAsk = getRunAsker(envelope.fundingRuns, chronological, priorDays);
    const asked = (day: (typeof funded)[number]) =>
      runAsk && !planned.has(day.dayKey)
        ? [runAsk(day)]
        : partAsks
          ? partAsks(day.dayKey)
          : [
              calendar
                ? (calendar.get(day.dayKey) ?? 0)
                : getDemandCents(envelope.funding, moneyOf(day)),
            ];
    const walked = funded.reduce<{
      room: Cents;
      parts: {
        day: (typeof funded)[number];
        shares: Cents[];
        room: Cents;
      }[];
    }>(
      (acc, day) => {
        const asks = asked(day);
        const total =
          asks.length === 1 ? asks[0] : asks.reduce((sum, ask) => sum + ask, 0);
        const cents =
          skipBefore !== undefined && day.on < skipBefore
            ? 0
            : Math.min(total, acc.room);
        acc.parts.push({
          day,
          shares: asks.length === 1 ? [cents] : splitAcrossParts(asks, cents),
          room: acc.room,
        });
        return {
          room: max === null || isRest ? acc.room : acc.room - cents,
          parts: acc.parts,
        };
      },
      {
        room:
          max === null
            ? Number.MAX_SAFE_INTEGER
            : Math.max(0, max - (envelope.heldCents ?? 0)),
        parts: [],
      },
    ).parts;
    return walked
      .filter(({ day }) => planned.has(day.dayKey))
      .flatMap(({ day, shares, room }) =>
        shares.flatMap((cents, index): Demand[] =>
          index > 0 && cents === 0
            ? []
            : [
                {
                  dayKey: day.dayKey,
                  itemId: envelope.itemId,
                  part: parts[index].part,
                  tier: parts[index].tier,
                  dueBeforeNext: false,
                  orderIndex: parts[index].orderIndex,
                  createdAt: envelope.createdAt,
                  cents,
                  cadence: cadenceCode(envelope.funding.cadence),
                  bill: null,
                  ask: getAsk(envelope.funding),
                  capCents: isRest && max !== null ? room : null,
                },
              ],
        ),
      );
  });
  const goalDemands = goals.flatMap((goal) => {
    const parts = getParts(goal);
    return planGoalContributions(goal, chronological, priorDays, {
      skipBefore,
      ownDayKeys: planned,
    })
      .filter(({ day }) => planned.has(day.dayKey))
      .flatMap(({ day, cents, shares }) =>
        (shares ?? [cents]).flatMap((share, index): Demand[] =>
          index > 0 && share === 0
            ? []
            : [
                {
                  dayKey: day.dayKey,
                  itemId: goal.itemId,
                  part: parts[index].part,
                  tier: parts[index].tier,
                  dueBeforeNext: false,
                  orderIndex: parts[index].orderIndex,
                  createdAt: goal.createdAt,
                  cents: goal.funding.amount.kind === 'rest' ? 0 : share,
                  cadence: cadenceCode(goal.funding.cadence),
                  bill: null,
                  ask: getAsk(goal.funding),
                  capCents: goal.funding.amount.kind === 'rest' ? share : null,
                },
              ],
        ),
      );
  });
  const result = [
    ...sharePercentDemands([...envelopeDemands, ...goalDemands], dayMoney),
    ...buildBillDemands(
      planned,
      skipBefore === undefined
        ? chronological
        : chronological.filter((day) => day.on >= skipBefore),
      bills,
      horizon,
      stance,
    ),
    ...buildHorizonDemands(
      planned,
      chronological,
      horizonItems,
      horizon,
      stance,
    ),
  ];
  return result;
}

export interface IncomeDayRef {
  dayKey: string;
  on: number;
}

/** Shares of one payment across the days that fund it: each takes `ceil(remaining / days left)`, so the last takes what remains. */
export const spreadShares = (totalCents: Cents, count: number) =>
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

const isOnPayDay = (
  day: IncomeDayRef,
  fundedBy: Extract<BillFundedBy, { kind: 'pay' }>,
) => {
  if (payLineIdOfDayKey(day.dayKey) !== fundedBy.payLineId) return false;
  if (fundedBy.monthDay === null) return true;
  const date = new Date(day.on);
  return (
    date.getUTCDate() ===
    Math.min(
      fundedBy.monthDay,
      daysInUtcMonth(date.getUTCFullYear(), date.getUTCMonth()),
    )
  );
};

/** The days of a window a bill's funding allows: all of them, the last one, or one pay line's. */
export const getEligibleDays = (
  window: readonly IncomeDayRef[],
  fundedBy: BillFundedBy,
  oneTime: ReadonlySet<string> | undefined = undefined,
) => {
  const repeating = (days: readonly IncomeDayRef[]) =>
    oneTime && oneTime.size > 0
      ? days.filter((day) => !oneTime.has(payLineIdOfDayKey(day.dayKey)))
      : days;
  if (fundedBy.kind === 'lastBefore') return repeating(window).slice(-1);
  if (fundedBy.kind === 'pay') {
    return repeating(window).filter((day) => isOnPayDay(day, fundedBy));
  }
  return window;
};

/** Shares of a payment by eligible day. With nothing pinned it is spread. A pinned day gives its figure (never more than what remains) and the rest goes to the next repeating pay after the first pinned day (else the first one in the window), never re-spread; the other days give nothing, and with no such pay the rest stays unfunded. */
export const getDayShares = (
  eligible: readonly IncomeDayRef[],
  totalCents: Cents,
  fixed: Readonly<Record<string, Cents>> | undefined,
  oneTime: ReadonlySet<string> | undefined = undefined,
) => {
  if (!fixed || Object.keys(fixed).length === 0)
    return spreadShares(totalCents, eligible.length);
  const given = eligible.reduce<{ left: Cents; cents: Map<string, Cents> }>(
    (acc, day) => {
      const asked = fixed[day.dayKey];
      if (asked === undefined) return acc;
      const cents = Math.min(Math.max(0, asked), acc.left);
      return {
        left: acc.left - cents,
        cents: acc.cents.set(day.dayKey, cents),
      };
    },
    { left: totalCents, cents: new Map() },
  );
  if (given.cents.size === 0) return spreadShares(totalCents, eligible.length);
  const firstPinned = eligible.findIndex((day) => given.cents.has(day.dayKey));
  const candidates = eligible
    .map((day, index) => ({ day, index }))
    .filter(
      ({ day }) =>
        !given.cents.has(day.dayKey) &&
        !oneTime?.has(payLineIdOfDayKey(day.dayKey)),
    );
  const carrier =
    candidates.find(({ index }) => index > firstPinned) ?? candidates[0];
  const result = eligible.map(
    (day) =>
      given.cents.get(day.dayKey) ??
      (carrier && carrier.day === day ? given.left : 0),
  );
  return result;
};

/** A cost's shares by eligible day: the pays the person set give their figure and the rest is spread over the other eligible pays, so nothing piles onto one pay. With no unpinned pay left the rest stays unfunded. */
const getCostDayShares = (
  eligible: readonly IncomeDayRef[],
  totalCents: Cents,
  fixed: Readonly<Record<string, Cents>> | undefined,
) => {
  const pinned = eligible.filter(
    (day) => fixed !== undefined && Object.hasOwn(fixed, day.dayKey),
  );
  if (pinned.length === 0) return spreadShares(totalCents, eligible.length);
  const given = pinned.reduce<{ left: Cents; cents: Map<string, Cents> }>(
    (acc, day) => {
      const cents = Math.min(Math.max(0, fixed?.[day.dayKey] ?? 0), acc.left);
      return {
        left: acc.left - cents,
        cents: acc.cents.set(day.dayKey, cents),
      };
    },
    { left: totalCents, cents: new Map() },
  );
  const open = eligible.filter((day) => !given.cents.has(day.dayKey));
  const rest = spreadShares(given.left, open.length);
  const spread = new Map(open.map((day, index) => [day.dayKey, rest[index]]));
  return eligible.map(
    (day) => given.cents.get(day.dayKey) ?? spread.get(day.dayKey) ?? 0,
  );
};

/** What the pays that pay a bill first take from a payment, in day order and never more than remains once the pays the person set have theirs; the rest is left for the other pays. */
const getPairedShares = (
  window: readonly IncomeDayRef[],
  totalCents: Cents,
  paired: Readonly<Record<string, Cents>> | undefined,
  fixed: Readonly<Record<string, Cents>> | undefined,
  pinnable: readonly IncomeDayRef[],
) => {
  const isPinned = (day: IncomeDayRef) =>
    fixed !== undefined && Object.hasOwn(fixed, day.dayKey);
  const pinned = pinnable
    .filter(isPinned)
    .reduce(
      (left, day) =>
        left - Math.min(Math.max(0, fixed?.[day.dayKey] ?? 0), left),
      totalCents,
    );
  const taken = window.reduce<{ left: Cents; cents: Map<string, Cents> }>(
    (acc, day) => {
      const asked = paired?.[day.dayKey];
      if (asked === undefined || isPinned(day)) return acc;
      const cents = Math.min(Math.max(0, asked), acc.left);
      return {
        left: acc.left - cents,
        cents: acc.cents.set(day.dayKey, cents),
      };
    },
    { left: pinned, cents: new Map() },
  );
  const result = {
    left: totalCents - [...taken.cents.values()].reduce((a, b) => a + b, 0),
    cents: taken.cents,
  };
  return result;
};

const isInDayOrder = (days: readonly IncomeDayRef[]) =>
  days.every((day, index) => index === 0 || days[index - 1].on <= day.on);

export interface BillPayment {
  /** The payment's key: a paid mark and its lateness are read from it. */
  dueOn: DateOnly;
  /** The day the money leaves, which its saving, its to-do and the forecast follow: the due date unless the bill is paid on a day of its own. */
  payOn: DateOnly;
  totalCents: Cents;
  /** What each income day sets aside, in day order. */
  parts: { day: IncomeDayRef; cents: Cents }[];
  ranged: BillShare['ranged'];
  /** The bill comes round less often than monthly, so each pay saves a little toward this payment. */
  isSavingUp: boolean;
  /** Set aside by confirmed days so far. */
  fundedCents: Cents;
  /** Confirmed days that set money aside for it. */
  fundedDays: number;
  /** What marking it paid today would use from what the bill holds, money set aside after its due date included; `fundedCents` when no day is given. */
  heldNowCents: Cents;
  /** The most marking it paid today could use from what the bill holds, for an amount other than the planned one (a bill that varies). */
  heldMostCents: Cents;
  /** The mark that paid it, or null while it is unpaid; a paid payment asks nothing more. */
  paid: PaidPayment | null;
}

/** A spread bill's first payment after the horizon, when it repeats every few months: its saving starts before the plan reaches its due date. */
const getDueBeyond = (stretch: DraftBillStretch, horizon: number) => {
  const interval = getIntervalMonths(stretch.schedule);
  const isSpread =
    stretch.fundedBy.kind === 'suggested' || stretch.fundedBy.kind === 'pay';
  if (interval === null || !isSpread) return [];
  return occurrences(
    stretch.schedule,
    stretch.ending,
    horizon + DAY_MS,
    Math.max(addUtcMonths(horizon, interval), stretch.schedule.anchor ?? 0),
  ).slice(0, 1);
};

/** Each payment of a bill paid by `horizon` with the stretch in force on its due day; a stretch's dates stop the day before the next begins. A pay-on day pays up to a month ahead, so a payment due just past the horizon can still be paid inside it. */
const getDues = (stretches: readonly DraftBillStretch[], horizon: number) => {
  const inRange = stretches
    .flatMap((stretch, index) => {
      const next = stretches[index + 1];
      const payOnDay = canPayOnSchedule(stretch.schedule)
        ? stretch.payOnDay
        : null;
      const reach = payOnDay ? addUtcMonths(horizon, 1) : horizon;
      return occurrences(
        stretch.schedule,
        stretch.ending,
        index === 0 ? (stretch.schedule.anchor ?? 0) : stretch.from,
        next ? Math.min(reach, next.from - DAY_MS) : reach,
      ).map((dueOn) => ({
        dueOn,
        stretch,
        payOn: toPayOn(dueOn, payOnDay),
      }));
    })
    .filter((entry) => entry.payOn <= horizon);
  const last = stretches[stretches.length - 1];
  const listed = new Set(inRange.map((entry) => entry.dueOn));
  const beyond = getDueBeyond(last, horizon)
    .filter((dueOn) => !listed.has(dueOn))
    .map((dueOn) => ({
      dueOn,
      stretch: last,
      payOn: toPayOn(
        dueOn,
        canPayOnSchedule(last.schedule) ? last.payOnDay : null,
      ),
    }));
  return [...inRange, ...beyond];
};

/** Of what a payment due after the horizon still needs, the part the income days up to the horizon carry: its share of the time from the window's first day to the due date. */
const toShareByHorizon = (
  left: Cents,
  window: readonly IncomeDayRef[],
  dueOn: DateOnly,
  horizon: number,
): Cents => {
  const start = window[0]?.on;
  if (start === undefined || start >= dueOn) return left;
  const fraction = Math.min(1, (horizon - start) / (dueOn - start));
  return Math.min(left, Math.ceil(left * Math.max(0, fraction)));
};

/**
 * Every payment of a bill up to `horizon` and what each income day sets aside for it. A payment is
 * funded by the income days after the previous payment through its due date: suggested spreads it
 * over them, the last-before kind takes it all from the last, a pay takes it from that pay line's
 * days (or one day of the month), and chosen splits it equally over the picked days still coming.
 * A spread bill every few months also lists its first payment after `horizon`, asking the days up to
 * the horizon for their share of it by time, so a bill due in 20 months is saved for from today.
 */
export function planBillPayments(
  bill: DraftBillInput,
  chronological: readonly IncomeDayRef[],
  horizon: number,
  stance: Stance = 'conservative',
  options: {
    firstDayOn?: number;
    today?: DateOnly;
    startDate?: DateOnly | null;
  } = {},
): BillPayment[] {
  const progress = bill.progress ?? NO_PROGRESS;
  const stretches = bill.stretches?.length
    ? bill.stretches
    : [
        {
          from: -Infinity,
          amount: bill.amount,
          stanceOverride: bill.stanceOverride,
          schedule: bill.schedule,
          ending: bill.ending,
          fundedBy: bill.fundedBy,
          payOnDay: bill.payOnDay ?? null,
        },
      ];
  const figuresOf = (stretch: DraftBillStretch) => {
    const billStance = effectiveStance(stance, stretch.stanceOverride);
    const ranged =
      stretch.amount.lowCents === stretch.amount.highCents
        ? null
        : {
            range: stretch.amount,
            stance: billStance,
            isOwnStance: Boolean(stretch.stanceOverride),
          };
    return {
      amountCents: pick(billStance, stretch.amount, 'expense'),
      ranged,
      isSavingUp:
        getIntervalMonths(stretch.schedule) !== null &&
        stretch.fundedBy.kind !== 'lastBefore',
    };
  };
  const getHeld = (
    dueOn: DateOnly,
    fundedCents: Cents,
    paid: PaidPayment | null,
    figures: ReturnType<typeof figuresOf>,
  ) => {
    const getHeldNow = (forCents: Cents) =>
      options.today === undefined || paid !== null
        ? fundedCents
        : getHeldForPayment(
            progress,
            { dueOn, amountCents: forCents, paidOn: options.today },
            options.startDate ?? null,
          );
    const heldNowCents = getHeldNow(figures.amountCents);
    const heldMostCents =
      figures.ranged === null
        ? heldNowCents
        : getHeldNow(Number.MAX_SAFE_INTEGER);
    return { heldNowCents, heldMostCents };
  };
  const dueList = getDues(stretches, horizon);
  const pays = dueList.map((entry) => entry.payOn);
  const moved = matchMovedDates(
    progress.paid.map((entry) => entry.dueOn),
    dueList.map((entry) => entry.dueOn),
  );
  const paidByDue = new Map(
    [...progress.paid]
      .reverse()
      .map((entry) => [moved.get(entry.dueOn) ?? entry.dueOn, entry]),
  );
  if (bill.fundedBy.kind === 'chosen') {
    const chosen = new Set(bill.fundedBy.dayKeys);
    const days = chronological.filter((day) => chosen.has(day.dayKey));
    return dueList.slice(0, 1).map(({ dueOn, payOn, stretch }) => {
      const figures = figuresOf(stretch);
      const { amountCents, ranged } = figures;
      const paid = paidByDue.get(dueOn) ?? null;
      const fundedCents = sumFunded(progress.funded);
      const left = paid ? 0 : Math.max(0, amountCents - fundedCents);
      const window = chronological.filter(
        (day) =>
          chosen.has(day.dayKey) ||
          (day.on <= payOn &&
            bill.paired !== undefined &&
            Object.hasOwn(bill.paired, day.dayKey)),
      );
      const pairedShares = getPairedShares(
        window,
        left,
        bill.paired,
        bill.fixed,
        days,
      );
      const others = days.filter((day) => !pairedShares.cents.has(day.dayKey));
      const shares =
        bill.fixed && Object.keys(bill.fixed).length > 0
          ? getDayShares(others, pairedShares.left, bill.fixed, undefined)
          : allocate(
              pairedShares.left,
              others.map(() => 1),
              others.map((day) => day.dayKey),
            );
      const otherShares = new Map(
        others.map((day, index) => [day.dayKey, shares[index]]),
      );
      return {
        dueOn,
        payOn,
        totalCents: amountCents,
        ranged,
        isSavingUp: figures.isSavingUp,
        parts: paid
          ? []
          : window.map((day) => ({
              day,
              cents:
                pairedShares.cents.get(day.dayKey) ??
                otherShares.get(day.dayKey) ??
                0,
            })),
        fundedCents,
        fundedDays: countFundedDays(progress.funded),
        ...getHeld(dueOn, fundedCents, paid, figures),
        paid,
      };
    });
  }
  const ordered = isInDayOrder(chronological);
  const first = getFirstNeeded(pays, options.firstDayOn);
  const isCarried = (entry: FundedDay) =>
    entry.isMoved === true || entry.dayKey === START_DAY_KEY;
  const hasMoved = progress.funded.some(isCarried);
  // Money moved into the bill, or held on the start day, is not tied to one window: what a payment leaves of it is there for the next.
  const carriedIn = dueList.reduce<{ into: Cents[]; spare: Cents }>(
    (acc, { payOn, stretch }, index) => {
      if (!hasMoved) return { into: [...acc.into, 0], spare: 0 };
      const inWindow = fundedInWindow(
        progress.funded,
        index === 0 ? -Infinity : pays[index - 1],
        payOn,
      );
      const movedCents = sumFunded(inWindow.filter(isCarried));
      const over =
        sumFunded(inWindow) + acc.spare - figuresOf(stretch).amountCents;
      return {
        into: [...acc.into, acc.spare],
        spare: Math.min(movedCents + acc.spare, Math.max(0, over)),
      };
    },
    { into: [], spare: 0 },
  ).into;
  const result = dueList
    .slice(first)
    .map(({ dueOn, payOn, stretch }, offset) => {
      const index = first + offset;
      const figures = figuresOf(stretch);
      const { amountCents, ranged } = figures;
      const previous = index === 0 ? -Infinity : pays[index - 1];
      const window = ordered
        ? chronological.slice(
            indexAfter(chronological, previous),
            indexAfter(chronological, payOn),
          )
        : chronological.filter((day) => day.on > previous && day.on <= payOn);
      const confirmed = fundedInWindow(progress.funded, previous, payOn);
      const fundedCents = sumFunded(confirmed) + carriedIn[index];
      const paid = paidByDue.get(dueOn) ?? null;
      const eligible = getEligibleDays(
        window,
        stretch.fundedBy,
        bill.oneTimePayLineIds,
      );
      const left = paid ? 0 : Math.max(0, amountCents - fundedCents);
      const pairedShares = getPairedShares(
        window,
        payOn > horizon ? toShareByHorizon(left, window, payOn, horizon) : left,
        bill.paired,
        bill.fixed,
        eligible,
      );
      const others = eligible.filter(
        (day) => !pairedShares.cents.has(day.dayKey),
      );
      const shares = getDayShares(
        others,
        pairedShares.left,
        bill.fixed,
        bill.oneTimePayLineIds,
      );
      const otherShares = new Map(
        others.map((day, position) => [day.dayKey, shares[position]]),
      );
      return {
        dueOn,
        payOn,
        totalCents: amountCents,
        ranged,
        isSavingUp: figures.isSavingUp,
        parts: paid
          ? []
          : window
              .filter(
                (day) =>
                  pairedShares.cents.has(day.dayKey) ||
                  otherShares.has(day.dayKey),
              )
              .map((day) => ({
                day,
                cents:
                  pairedShares.cents.get(day.dayKey) ??
                  (otherShares.get(day.dayKey) as Cents),
              })),
        fundedCents,
        fundedDays: countFundedDays(confirmed),
        ...getHeld(dueOn, fundedCents, paid, figures),
        paid,
      };
    });
  return result;
}

const BILL_CADENCES: Record<BillFundedBy['kind'], DraftCadence> = {
  suggested: 'billSuggested',
  chosen: 'billChosen',
  lastBefore: 'billLastBefore',
  pay: 'billPay',
};

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
          part: null,
          tier: bill.priority,
          dueBeforeNext: payment.payOn < nextAfter(part.day.on),
          orderIndex: bill.orderIndex,
          createdAt: bill.createdAt,
          cents: part.cents,
          cadence: BILL_CADENCES[bill.fundedBy.kind],
          bill: {
            dueOn: payment.dueOn,
            payOn: payment.payOn,
            totalCents: payment.totalCents,
            setAsideCents: payment.fundedCents,
            isSavingUp: payment.isSavingUp,
            ranged: payment.ranged,
          },
          ask: { kind: 'exact' },
          capCents: null,
          isFixed:
            bill.fixed !== undefined &&
            Object.hasOwn(bill.fixed, part.day.dayKey),
        })),
    ),
  );
  return result;
}

/** A Horizon item as the draft sees it: what it holds and the costs whose payments its pays carry. */
export interface DraftHorizonInput {
  itemId: string;
  createdAt: number;
  priority: Priority;
  orderIndex: number;
  rest: HorizonRest;
  costs: readonly HorizonCost[];
  /** A finished or called-off item asks nothing for its unpaid payments; a fronted payment it already made is still given back. Read as open when missing. */
  state?: HorizonState;
  /** What the item holds before the day drafted. */
  heldCents: Cents;
  /** The goal the item draws its costs from, read before the item's own money; null or missing when it has none. */
  goalCover?: GoalCover | null;
  /** Cents the person set a pay to put toward one cost, by cost id and then day key. */
  fixed?: Readonly<Record<string, Readonly<Record<string, Cents>>>>;
  /** Payments marked paid, with the part Free to Spend fronted; they ask nothing, and a fronted one is given back by the picked pay. */
  paid?: readonly {
    costId: string;
    dueOn: DateOnly;
    paidOn: DateOnly;
    fromFreeCents: Cents;
  }[];
  /** Confirmed days that gave back a fronted payment of a cost; a mark paid before such a day is not given back again. */
  repaid?: readonly { costId: string; on: DateOnly }[];
}

export interface CostSharePlan {
  costId: string;
  dueOn: DateOnly;
  totalCents: Cents;
  coveredCents: Cents;
  needCents: Cents;
  ranged: BillShare['ranged'];
  /** What each income day sets aside for the payment, in day order. */
  parts: { day: IncomeDayRef; cents: Cents }[];
  /** For a fronted payment: the picked pay and what it gives back to Free to Spend. */
  repays: { day: IncomeDayRef; cents: Cents } | null;
}

/**
 * Every unpaid payment of an item's costs that the money it holds does not cover, and what each income day sets aside for it:
 * `pays` spreads a payment over the pays since the one before it (a repeating cost's first payment looks back one beat),
 * `onePay` puts a one-time payment and a repeating cost's first payment on the picked pay and spreads later ones as `pays`.
 * A payment marked paid with money from Free to Spend before the picked pay is given back by that pay, whenever it fell due. A picked pay no longer coming is ignored, as if `pays` were chosen, and the first coming pay gives the fronted payment back. `outside` and `later` ask nothing.
 */
export function planCostShares(
  item: DraftHorizonInput,
  chronological: readonly IncomeDayRef[],
  horizon: number,
  stance: Stance,
): CostSharePlan[] {
  const { rest } = item;
  if (rest.kind !== 'pays' && rest.kind !== 'onePay') return [];
  const all = listHorizonPayments(item.costs, horizon, stance);
  const paid = item.paid ?? [];
  const isPaid = (costId: string, dueOn: DateOnly) =>
    paid.some((entry) => entry.costId === costId && entry.dueOn === dueOn);
  const picked =
    rest.kind === 'onePay'
      ? chronological.find((day) => day.dayKey === rest.dayKey)
      : undefined;
  const { covers } =
    (item.state ?? 'open') === 'open'
      ? planHorizon(
          item,
          item.heldCents,
          all.filter(({ costId, dueOn }) => !isPaid(costId, dueOn)),
          item.goalCover ?? null,
        )
      : { covers: [] };
  const shares = covers
    .filter(({ coveredCents, totalCents }) => coveredCents < totalCents)
    .map((cover): CostSharePlan => {
      const cost = item.costs.find(({ id }) => id === cover.costId);
      const dues = all
        .filter(({ costId }) => costId === cover.costId)
        .map(({ dueOn }) => dueOn);
      const index = dues.indexOf(cover.dueOn);
      const previous =
        index > 0
          ? dues[index - 1]
          : cost
            ? (getPriorBeat(cost.schedule) ?? -Infinity)
            : -Infinity;
      const needCents = cover.totalCents - cover.coveredCents;
      const eligible =
        picked && index === 0
          ? [picked]
          : chronological.filter(
              (day) => day.on > previous && day.on <= cover.dueOn,
            );
      const shared = getCostDayShares(
        eligible,
        needCents,
        item.fixed?.[cover.costId],
      );
      return {
        costId: cover.costId,
        dueOn: cover.dueOn,
        totalCents: cover.totalCents,
        coveredCents: cover.coveredCents,
        needCents,
        ranged:
          !cost || cost.amount.lowCents === cost.amount.highCents
            ? null
            : { range: cost.amount, stance, isOwnStance: false },
        parts: eligible.map((day, position) => ({
          day,
          cents: shared[position],
        })),
        repays: null,
      };
    });
  const repayDay =
    picked ?? (rest.kind === 'onePay' ? chronological[0] : undefined);
  const repaid = repayDay
    ? paid
        .filter(
          ({ costId, paidOn, fromFreeCents }) =>
            fromFreeCents > 0 &&
            paidOn < repayDay.on &&
            !(item.repaid ?? []).some(
              (given) => given.costId === costId && given.on > paidOn,
            ),
        )
        .map((entry): CostSharePlan => ({
          costId: entry.costId,
          dueOn: entry.dueOn,
          totalCents: entry.fromFreeCents,
          coveredCents: 0,
          needCents: 0,
          ranged: null,
          parts: [],
          repays: { day: repayDay, cents: entry.fromFreeCents },
        }))
    : [];
  return [...shares, ...repaid];
}

const HORIZON_CADENCES = {
  pays: 'horizonPays',
  onePay: 'horizonOnePay',
} as const;

/** What each planned day sets aside for each Horizon cost, one demand per cost and day; a pay that gives back a fronted payment has its own. */
function buildHorizonDemands(
  planned: ReadonlySet<string>,
  chronological: readonly IncomeDayRef[],
  items: readonly DraftHorizonInput[],
  horizon: number,
  stance: Stance,
): Demand[] {
  const nextAfter = (on: number) =>
    chronological.find((day) => day.on > on)?.on ?? Infinity;
  const result = items.flatMap((item) => {
    const { rest } = item;
    const cadence =
      rest.kind === 'onePay' &&
      chronological.some((day) => day.dayKey === rest.dayKey)
        ? HORIZON_CADENCES.onePay
        : HORIZON_CADENCES.pays;
    const demandOf = (
      plan: CostSharePlan,
      day: IncomeDayRef,
      cents: Cents,
    ): Demand => ({
      dayKey: day.dayKey,
      itemId: item.itemId,
      part: null,
      tier: getCostPriority(
        item.costs.find(({ id }) => id === plan.costId) ?? { priority: null },
        item.priority,
      ),
      dueBeforeNext: plan.repays === null && plan.dueOn < nextAfter(day.on),
      orderIndex: item.orderIndex,
      createdAt: item.createdAt,
      cents,
      cadence,
      bill: null,
      ask: { kind: 'exact' },
      capCents: null,
      isFixed:
        plan.repays === null &&
        Object.hasOwn(item.fixed?.[plan.costId] ?? {}, day.dayKey),
      costId: plan.costId,
      repaysFree: plan.repays !== null,
      cost: {
        costId: plan.costId,
        dueOn: plan.dueOn,
        totalCents: plan.totalCents,
        coveredCents: plan.coveredCents,
        needCents: plan.needCents,
        ranged: plan.ranged,
        payCount: plan.parts.length,
      },
    });
    const demands = planCostShares(
      item,
      chronological,
      horizon,
      stance,
    ).flatMap((plan) =>
      (plan.repays
        ? [plan.repays]
        : plan.parts.map(({ day, cents }) => ({ day, cents }))
      )
        .filter(({ day }) => planned.has(day.dayKey))
        .map(({ day, cents }) => demandOf(plan, day, cents)),
    );
    return [
      ...demands
        .reduce((acc, demand) => {
          const key = `${demand.dayKey}|${demand.costId}|${demand.repaysFree}`;
          const known = acc.get(key);
          if (!known?.cost || !demand.cost) return acc.set(key, demand);
          return acc.set(key, {
            ...known,
            cents: known.cents + demand.cents,
            dueBeforeNext: known.dueBeforeNext || demand.dueBeforeNext,
            cost: {
              ...known.cost,
              dueOn: Math.min(known.cost.dueOn, demand.cost.dueOn),
              totalCents: known.cost.totalCents + demand.cost.totalCents,
              coveredCents: known.cost.coveredCents + demand.cost.coveredCents,
              needCents: known.cost.needCents + demand.cost.needCents,
              payCount: Math.max(known.cost.payCount, demand.cost.payCount),
            },
          });
        }, new Map<string, Demand>())
        .values(),
    ];
  });
  return result;
}
