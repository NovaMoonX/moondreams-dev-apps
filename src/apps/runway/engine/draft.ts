import type {
  DRAFT_REASON_CODES,
  PAIRING_STATES,
} from '@apps/runway/constants';
import type {
  Cents,
  HoldChoice,
  MoneyRange,
  Pairing,
  Priority,
  Stance,
} from '@apps/runway/types';

import {
  buildDemands,
  planBillPayments,
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
import { percentOf } from './money';
import { effectiveStance, pick } from './stance';

export interface DraftOverrides {
  /** Day money the person typed in place of the plan's figure, by day key. */
  dayCents: Record<string, Cents>;
  /** The person's choice for a short pairing, by line id (`dayKey:itemId`). */
  holdResolutions?: Record<string, HoldChoice>;
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
    /** Line ids (`dayKey:itemId`) whose stretch just ran out: a funded one says it returns. */
    returns?: readonly string[];
    /** Every coming income day, which cadences count over. */
    incomeDays: readonly {
      dayKey: string;
      on: number;
      /** Read at the stance's end when given, else `moneyCents` stands. */
      amount?: MoneyRange;
      stanceOverride?: Stance | null;
      moneyCents?: Cents;
      sourceId?: string | null;
    }[];
    /** Earlier income days of the periods a calendar rule spreads over, which take their share first and are not drafted. */
    priorIncomeDays?: readonly {
      dayKey: string;
      on: number;
      sourceId?: string | null;
    }[];
  };
  /** The plan's stance: which end of every range a figure is planned at. */
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

export type PairingState = (typeof PAIRING_STATES)[number];

/** Set on a line a pairing funded: what became of the part its own pay could not cover. */
export interface LinePairing {
  state: PairingState;
  /** Pool money reserved for the line while the person has not chosen. */
  heldCents: Cents;
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
  pairing: LinePairing | null;
}

export interface Draft {
  days: { dayKey: string; sourceId: string | null; moneyCents: Cents }[];
  moneyCents: Cents;
  lines: DraftLine[];
  /** Pool money reserved by holds: not funded and not free to spend. */
  heldCents: Cents;
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
const getDayMoney = (
  day: DraftDayInput,
  overrides: DraftOverrides,
  stance: Stance,
) => {
  const result = Math.max(
    0,
    Object.hasOwn(overrides.dayCents, day.dayKey)
      ? overrides.dayCents[day.dayKey]
      : pick(effectiveStance(stance, day.stanceOverride), day.amount, 'income'),
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

/** The narrowest pairing set: the day's own, else its pay line's, else its source's. */
export function pickPairings(day: DraftDayInput): readonly Pairing[] {
  const sets = day.pairings;
  if (!sets) return [];
  if (sets.day !== null) return sets.day;
  return sets.payLine.length > 0 ? sets.payLine : sets.source;
}

type WalkMode = 'ordinary' | 'topUp' | 'hold';
type WalkItem = Demand & { mode: WalkMode };

interface PairingOutcome {
  line: DraftLine;
  items: WalkItem[];
}

interface Target {
  itemId: string;
  tier: Priority;
  orderIndex: number;
  createdAt: number;
}

const pairingTail = (pairing: Pairing) =>
  Number(pairing.amount.kind === 'rest');

/**
 * Funds one day's pairings, in the step 4 order with `rest` last, only from that day's own money.
 * A short pairing becomes a top-up demand, a hold, or a plain short line by its target's tier.
 */
function fundPairings(
  day: DraftDayInput,
  moneyCents: Cents,
  targets: ReadonlyMap<string, Target>,
  replaced: ReadonlyMap<string, Demand>,
  resolutions: Record<string, HoldChoice>,
  /** What a target still needs before this day's pairings, or null for no ceiling (an envelope). */
  needOf: (itemId: string) => Cents | null,
): { outcomes: PairingOutcome[]; leftCents: Cents } {
  const seen = new Set<string>();
  const asDemand = (pairing: Pairing): Demand => {
    const target = targets.get(pairing.targetItemId) as Target;
    const own = replaced.get(`${day.dayKey}:${pairing.targetItemId}`);
    return {
      dayKey: day.dayKey,
      itemId: target.itemId,
      tier: target.tier,
      dueBeforeNext: own?.dueBeforeNext ?? false,
      orderIndex: target.orderIndex,
      createdAt: target.createdAt,
      cents: 0,
      cadence: 'pairing',
      bill: own?.bill ?? null,
      ask:
        pairing.amount.kind === 'percent'
          ? { kind: 'percent', bps: pairing.amount.bps, of: pairing.amount.of }
          : { kind: pairing.amount.kind },
      capCents: null,
    };
  };
  const ordered = pickPairings(day)
    .filter((pairing) => {
      const isNew =
        targets.has(pairing.targetItemId) && !seen.has(pairing.targetItemId);
      seen.add(pairing.targetItemId);
      return isNew;
    })
    .map((pairing) => ({ pairing, demand: asDemand(pairing) }))
    .sort(
      (a, b) =>
        pairingTail(a.pairing) - pairingTail(b.pairing) ||
        compareDemands(a.demand, b.demand),
    );

  const result = ordered.reduce<{ outcomes: PairingOutcome[]; left: Cents }>(
    (acc, { pairing, demand }) => {
      const { amount } = pairing;
      const asked =
        amount.kind === 'exact'
          ? amount.cents
          : amount.kind === 'rest'
            ? acc.left
            : percentOf(
                amount.of === 'remaining' ? acc.left : moneyCents,
                amount.bps,
              );
      const need = needOf(demand.itemId);
      const wanted = need === null ? asked : Math.min(asked, need);
      if (wanted <= 0 && amount.kind !== 'rest') return acc;
      const taken = Math.min(wanted, acc.left);
      const shortBy = wanted - taken;
      const lineId = `${day.dayKey}:${demand.itemId}`;
      const choice = Object.hasOwn(resolutions, lineId)
        ? resolutions[lineId]
        : null;
      const getState = (): PairingState => {
        if (shortBy === 0) return 'funded';
        if (pairing.topUpFromAnySource) return 'autoTopUp';
        if (choice === 'topUp') return 'toppedUp';
        if (choice === 'leaveShort') return 'leftShort';
        return demand.tier === 'want' ? 'offered' : 'held';
      };
      const state = getState();
      const line: DraftLine = {
        lineId,
        dayKey: day.dayKey,
        itemId: demand.itemId,
        tier: demand.tier,
        bill: demand.bill,
        sourceId: day.sourceId,
        ask: demand.ask,
        demandCents: wanted,
        cents: taken,
        shortBy,
        paidBy:
          taken > 0
            ? [{ dayKey: day.dayKey, sourceId: day.sourceId, cents: taken }]
            : [],
        reason: {
          code: getReasonCode(shortBy, amount.kind === 'rest', taken),
          tier: demand.tier,
          cadence: 'pairing',
        },
        tieBrokenBy: null,
        pairing: { state, heldCents: 0 },
      };
      const items: WalkItem[] =
        state === 'autoTopUp' || state === 'toppedUp'
          ? [{ ...demand, cents: shortBy, mode: 'topUp' }]
          : state === 'held'
            ? [{ ...demand, cents: shortBy, mode: 'hold' }]
            : [];
      return {
        outcomes: [...acc.outcomes, { line, items }],
        left: acc.left - taken,
      };
    },
    { outcomes: [], left: moneyCents },
  );
  return { outcomes: result.outcomes, leftCents: result.left };
}

/**
 * The draft for one or more income days: pairings first, then every envelope funded in priority
 * order from the day's money, what is left as Free to Spend, and what ran short. Pure: the same
 * input gives the same output, whatever order the arrays arrive in.
 */
export function buildDraft(input: DraftInput): Draft {
  const days = [...input.days].sort(compareDays);
  const dayMoney = days.map((day) => ({
    day,
    moneyCents: getDayMoney(day, input.overrides, input.stance),
  }));
  const dayMoneyByKey = new Map(
    dayMoney.map(({ day, moneyCents }) => [day.dayKey, moneyCents]),
  );

  const sourceByDay = new Map(days.map((day) => [day.dayKey, day.sourceId]));
  const dayOrder = new Map(days.map((day, index) => [day.dayKey, index]));
  const allDemands = buildDemands(
    days,
    input.plan.incomeDays.map((entry) => ({
      dayKey: entry.dayKey,
      on: entry.on,
      sourceId: entry.sourceId,
      moneyCents: entry.amount
        ? pick(
            effectiveStance(input.stance, entry.stanceOverride),
            entry.amount,
            'income',
          )
        : entry.moneyCents,
    })),
    input.plan.envelopes,
    input.plan.bills,
    input.plan.horizon,
    input.plan.goals,
    dayMoneyByKey,
    input.stance,
    input.plan.priorIncomeDays ?? [],
  );

  const targets = new Map<string, Target>(
    [...input.plan.envelopes, ...input.plan.bills, ...input.plan.goals].map(
      (item) => [
        item.itemId,
        {
          itemId: item.itemId,
          tier: item.priority,
          orderIndex: item.orderIndex,
          createdAt: item.createdAt,
        },
      ],
    ),
  );
  const replaced = new Map(
    allDemands.map((demand) => [`${demand.dayKey}:${demand.itemId}`, demand]),
  );
  const resolutions = input.overrides.holdResolutions ?? {};
  const goalNeeds = new Map(
    input.plan.goals.map((goal) => [
      goal.itemId,
      Math.max(0, goal.targetCents - goal.heldCents),
    ]),
  );
  const pairedIds = new Set(
    days.flatMap((day) =>
      pickPairings(day).map((pairing) => pairing.targetItemId),
    ),
  );
  const chronological = [...input.plan.incomeDays].sort(
    (a, b) => a.on - b.on || compareText(a.dayKey, b.dayKey),
  );
  const billPayments = new Map(
    input.plan.bills
      .filter((bill) => pairedIds.has(bill.itemId))
      .map((bill) => [
        bill.itemId,
        planBillPayments(bill, chronological, input.plan.horizon, input.stance),
      ]),
  );
  const getNeed = (
    itemId: string,
    on: number,
  ): { key: string; cents: Cents } | null => {
    if (goalNeeds.has(itemId))
      return { key: itemId, cents: goalNeeds.get(itemId) as Cents };
    const payments = billPayments.get(itemId);
    if (!payments) return null;
    const payment = payments.find((entry) => entry.dueOn >= on);
    if (!payment || payment.paid) return { key: itemId, cents: 0 };
    return {
      key: `${itemId}:${payment.dueOn}`,
      cents: Math.max(0, payment.totalCents - payment.fundedCents),
    };
  };
  const paired = dayMoney.reduce<{
    used: Map<string, Cents>;
    list: {
      day: DraftDayInput;
      outcomes: PairingOutcome[];
      leftCents: Cents;
    }[];
  }>(
    (acc, { day, moneyCents }) => {
      const funded = fundPairings(
        day,
        moneyCents,
        targets,
        replaced,
        resolutions,
        (itemId) => {
          const need = getNeed(itemId, day.on);
          return need === null
            ? null
            : Math.max(0, need.cents - (acc.used.get(need.key) ?? 0));
        },
      );
      funded.outcomes.forEach(({ line }) => {
        const key = getNeed(line.itemId, day.on)?.key ?? line.itemId;
        acc.used.set(key, (acc.used.get(key) ?? 0) + line.cents);
      });
      return { used: acc.used, list: [...acc.list, { day, ...funded }] };
    },
    { used: new Map(), list: [] },
  ).list;
  const pairedKeys = new Set(
    paired.flatMap((entry) =>
      pickPairings(entry.day)
        .filter((pairing) => targets.has(pairing.targetItemId))
        .map((pairing) => `${entry.day.dayKey}:${pairing.targetItemId}`),
    ),
  );

  const pool = paired.flatMap(({ day, leftCents }): Chunk[] =>
    leftCents > 0
      ? [{ dayKey: day.dayKey, sourceId: day.sourceId, cents: leftCents }]
      : [],
  );
  const ordinary = allDemands
    .filter(
      (demand) =>
        !pairedKeys.has(`${demand.dayKey}:${demand.itemId}`) &&
        (demand.cents > 0 || demand.ask.kind === 'rest'),
    )
    .map((demand): WalkItem => ({ ...demand, mode: 'ordinary' }));
  const walkItems = [
    ...ordinary,
    ...paired.flatMap((entry) => entry.outcomes.flatMap(({ items }) => items)),
  ].sort(
    (a, b) =>
      compareDemands(a, b) ||
      (dayOrder.get(a.dayKey) ?? 0) - (dayOrder.get(b.dayKey) ?? 0),
  );

  interface Walk {
    pool: Chunk[];
    ordinaryItems: WalkItem[];
    ordinaryLines: DraftLine[];
    pairingLines: Record<string, DraftLine>;
  }
  const start: Walk = {
    pool,
    ordinaryItems: [],
    ordinaryLines: [],
    pairingLines: Object.fromEntries(
      paired.flatMap((entry) =>
        entry.outcomes.map(({ line }): [string, DraftLine] => [
          line.lineId,
          line,
        ]),
      ),
    ),
  };
  const walked = walkItems.reduce<Walk>((acc, demand) => {
    if (demand.mode !== 'ordinary') {
      const base = acc.pairingLines[`${demand.dayKey}:${demand.itemId}`];
      const taken = takeFromPool(acc.pool, demand.cents);
      const got = demand.cents - taken.left;
      const merged: DraftLine =
        demand.mode === 'hold'
          ? {
              ...base,
              pairing: { state: 'held', heldCents: got },
            }
          : {
              ...base,
              cents: base.cents + got,
              shortBy: taken.left,
              paidBy: [...base.paidBy, ...taken.paidBy],
              reason: {
                ...base.reason,
                code: getReasonCode(taken.left, false, base.cents + got),
              },
            };
      return {
        ...acc,
        pool: taken.rest,
        pairingLines: { ...acc.pairingLines, [base.lineId]: merged },
      };
    }
    const isRest = demand.ask.kind === 'rest';
    const held = acc.pool
      .filter((chunk) => chunk.dayKey === demand.dayKey)
      .reduce((sum, chunk) => sum + chunk.cents, 0);
    const wanted = isRest
      ? Math.min(held, demand.capCents ?? held)
      : demand.cents;
    const taken = takeFromPool(acc.pool, wanted, isRest ? demand.dayKey : null);
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
      pairing: null,
    };
    return {
      ...acc,
      pool: taken.rest,
      ordinaryItems: [...acc.ordinaryItems, demand],
      ordinaryLines: [...acc.ordinaryLines, line],
    };
  }, start);

  const tieKeys = findTieBrokenBy(walked.ordinaryItems, walked.ordinaryLines);
  const ordinaryLines = walked.ordinaryLines.map((line, index) => ({
    ...line,
    tieBrokenBy: tieKeys[index],
  }));
  const pairingLines = paired.flatMap((entry) =>
    entry.outcomes.map(({ line }) => walked.pairingLines[line.lineId]),
  );
  const returning = new Set(input.plan.returns ?? []);
  const lines = [...pairingLines, ...ordinaryLines].map((line) =>
    returning.has(line.lineId) && line.reason.code === 'funded'
      ? { ...line, reason: { ...line.reason, code: 'returns' as const } }
      : line,
  );

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
    heldCents: lines.reduce(
      (sum, line) => sum + (line.pairing?.heldCents ?? 0),
      0,
    ),
    freeToSpend: {
      cents: walked.pool.reduce((sum, chunk) => sum + chunk.cents, 0),
      bySource,
    },
  };
  return result;
}
