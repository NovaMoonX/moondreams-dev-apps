import type { DRAFT_REASON_CODES } from '@apps/runway/constants';
import type { Cents, Priority, Stance } from '@apps/runway/types';

import {
  buildDemands,
  compareDays,
  compareDemands,
  compareText,
  type BillShare,
  type DraftAsk,
  type Demand,
  type DraftBillInput,
  type DraftCadence,
  type DraftDayInput,
  type DraftEnvelopeInput,
  type DraftGoalInput,
  type DraftTieKey,
} from './demands';

export interface DraftOverrides {
  /** Day money the person typed in place of the plan's figure, by day key. */
  dayCents: Record<string, Cents>;
}

export interface DraftInput {
  /** The days drafted together. */
  days: readonly DraftDayInput[];
  plan: {
    envelopes: readonly DraftEnvelopeInput[];
    bills: readonly DraftBillInput[];
    goals: readonly DraftGoalInput[];
    /** The last day schedules are generated for. */
    horizon: number;
    /** Every coming income day, which cadences count over. */
    incomeDays: readonly { dayKey: string; on: number; moneyCents?: Cents }[];
  };
  /** Amounts are exact or a share of the day, so the stance does not change a figure yet. */
  stance: Stance;
  overrides: DraftOverrides;
}

export interface PaidBy {
  dayKey: string;
  sourceId: string | null;
  cents: Cents;
}

export interface DraftReason {
  code: (typeof DRAFT_REASON_CODES)[number];
  tier: Priority;
  cadence: DraftCadence;
}

export interface DraftLine {
  lineId: string;
  dayKey: string;
  itemId: string;
  tier: Priority;
  /** Set on a bill's line: the payment this day sets money aside for. */
  bill: BillShare | null;
  /** The income source of the day this line is on. */
  sourceId: string | null;
  /** How the line asked: money, a share of the day's money, or the rest. */
  ask: DraftAsk;
  /** What the envelope, goal or bill asked for on this day. */
  demandCents: Cents;
  cents: Cents;
  shortBy: Cents;
  paidBy: PaidBy[];
  reason: DraftReason;
  /** Set on the line placed first when an equal demand got less. */
  tieBrokenBy: DraftTieKey | null;
}

export interface Draft {
  days: { dayKey: string; sourceId: string | null; moneyCents: Cents }[];
  moneyCents: Cents;
  lines: DraftLine[];
  freeToSpend: {
    cents: Cents;
    bySource: { sourceId: string | null; cents: Cents }[];
  };
}

interface Chunk {
  dayKey: string;
  sourceId: string | null;
  cents: Cents;
}

/** Day money: what the person typed, else the plan's figure, never below zero. */
const getDayMoney = (day: DraftDayInput, overrides: DraftOverrides) => {
  const result = Math.max(
    0,
    Object.hasOwn(overrides.dayCents, day.dayKey)
      ? overrides.dayCents[day.dayKey]
      : day.amount.lowCents,
  );
  return result;
};

/** Takes `wanted` cents from the front of the pool, first in first out; `onlyDayKey` limits it to one day's money. */
function takeFromPool(
  pool: readonly Chunk[],
  wanted: Cents,
  onlyDayKey: string | null = null,
) {
  const result = pool.reduce<{ left: Cents; paidBy: PaidBy[]; rest: Chunk[] }>(
    (acc, chunk) => {
      const isEligible = onlyDayKey === null || chunk.dayKey === onlyDayKey;
      const taken = isEligible ? Math.min(acc.left, chunk.cents) : 0;
      return {
        left: acc.left - taken,
        paidBy:
          taken > 0
            ? [
                ...acc.paidBy,
                {
                  dayKey: chunk.dayKey,
                  sourceId: chunk.sourceId,
                  cents: taken,
                },
              ]
            : acc.paidBy,
        rest:
          chunk.cents - taken > 0
            ? [...acc.rest, { ...chunk, cents: chunk.cents - taken }]
            : acc.rest,
      };
    },
    { left: wanted, paidBy: [], rest: [] },
  );
  return result;
}

const getReasonCode = (shortBy: Cents, isRest: boolean, cents: Cents) => {
  if (shortBy > 0) return 'poolExhausted' as const;
  return isRest && cents === 0 ? ('nothingLeft' as const) : ('funded' as const);
};

const getTieKey = (demand: Demand) =>
  `${demand.tier}|${demand.dueBeforeNext}|${demand.orderIndex}`;

/**
 * Names the key that put a funded line ahead of an equal envelope that got less: a rival shares its
 * tier, urgency and order, and an equal date added falls through to the item id.
 */
function findTieBrokenBy(
  demands: readonly Demand[],
  lines: readonly DraftLine[],
): (DraftTieKey | null)[] {
  const groups = demands.reduce((acc, demand, index) => {
    const key = getTieKey(demand);
    acc.set(key, [...(acc.get(key) ?? []), index]);
    return acc;
  }, new Map<string, number[]>());

  const result = demands.map((demand, index) => {
    if (lines[index].cents === 0) return null;
    const rivals = (groups.get(getTieKey(demand)) ?? []).filter(
      (other) =>
        other > index &&
        demands[other].itemId !== demand.itemId &&
        lines[other].shortBy > 0,
    );
    if (rivals.length === 0) return null;
    return rivals.some((other) => demands[other].createdAt === demand.createdAt)
      ? 'itemId'
      : 'createdAt';
  });
  return result;
}

/**
 * The draft for one or more income days: every envelope funded in priority order from the day's
 * money, what is left as Free to spend, and what ran short. Pure: the same input gives the same
 * output, whatever order the arrays arrive in.
 */
export function buildDraft(input: DraftInput): Draft {
  const days = [...input.days].sort(compareDays);
  const dayMoney = days.map((day) => ({
    day,
    moneyCents: getDayMoney(day, input.overrides),
  }));
  const pool = dayMoney.flatMap(({ day, moneyCents }): Chunk[] =>
    moneyCents > 0
      ? [{ dayKey: day.dayKey, sourceId: day.sourceId, cents: moneyCents }]
      : [],
  );

  const sourceByDay = new Map(days.map((day) => [day.dayKey, day.sourceId]));
  const dayOrder = new Map(days.map((day, index) => [day.dayKey, index]));
  const demands = buildDemands(
    days,
    input.plan.incomeDays,
    input.plan.envelopes,
    input.plan.bills,
    input.plan.horizon,
    input.plan.goals,
    new Map(dayMoney.map(({ day, moneyCents }) => [day.dayKey, moneyCents])),
  )
    .filter((demand) => demand.cents > 0 || demand.ask.kind === 'rest')
    .sort(
      (a, b) =>
        compareDemands(a, b) ||
        (dayOrder.get(a.dayKey) ?? 0) - (dayOrder.get(b.dayKey) ?? 0),
    );

  const walked = demands.reduce<{ pool: Chunk[]; lines: DraftLine[] }>(
    (acc, demand) => {
      const isRest = demand.ask.kind === 'rest';
      const held = acc.pool
        .filter((chunk) => chunk.dayKey === demand.dayKey)
        .reduce((sum, chunk) => sum + chunk.cents, 0);
      const wanted = isRest
        ? Math.min(held, demand.capCents ?? held)
        : demand.cents;
      const taken = takeFromPool(
        acc.pool,
        wanted,
        isRest ? demand.dayKey : null,
      );
      const cents = wanted - taken.left;
      const line: DraftLine = {
        lineId: `${demand.dayKey}:${demand.itemId}`,
        dayKey: demand.dayKey,
        itemId: demand.itemId,
        tier: demand.tier,
        bill: demand.bill,
        sourceId: sourceByDay.get(demand.dayKey) ?? null,
        ask: demand.ask,
        demandCents: wanted,
        cents,
        shortBy: taken.left,
        paidBy: taken.paidBy,
        reason: {
          code: getReasonCode(taken.left, isRest, cents),
          tier: demand.tier,
          cadence: demand.cadence,
        },
        tieBrokenBy: null,
      };
      return { pool: taken.rest, lines: [...acc.lines, line] };
    },
    { pool, lines: [] },
  );

  const tieKeys = findTieBrokenBy(demands, walked.lines);
  const lines = walked.lines.map((line, index) => ({
    ...line,
    tieBrokenBy: tieKeys[index],
  }));

  const bySource = [
    ...walked.pool
      .reduce((acc, chunk) => {
        const key = chunk.sourceId ?? '';
        return acc.set(key, (acc.get(key) ?? 0) + chunk.cents);
      }, new Map<string, Cents>())
      .entries(),
  ]
    .sort(([a], [b]) => compareText(a, b))
    .map(([key, cents]) => ({ sourceId: key === '' ? null : key, cents }));

  const result: Draft = {
    days: dayMoney.map(({ day, moneyCents }) => ({
      dayKey: day.dayKey,
      sourceId: day.sourceId,
      moneyCents,
    })),
    moneyCents: dayMoney.reduce((sum, entry) => sum + entry.moneyCents, 0),
    lines,
    freeToSpend: {
      cents: walked.pool.reduce((sum, chunk) => sum + chunk.cents, 0),
      bySource,
    },
  };
  return result;
}
