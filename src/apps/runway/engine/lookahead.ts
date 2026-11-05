import {
  CUSHION_DAYS,
  HORIZON_WORDS,
  INCOME_END_GAP_DAYS,
} from '@apps/runway/constants';
import type {
  Cents,
  DateOnly,
  HorizonCost,
  HorizonRest,
  HorizonState,
  MoneyRange,
  Priority,
  Stance,
} from '@apps/runway/types';

import type { ComingDay } from './comingDays';
import type { BillPayment } from './demands';
import type { Draft } from './draft';
import { addUtcDays, DAY_MS } from './dates';
import type { FundedDay } from './progress';
import { listCostPayments, listHorizonPayments, planHorizon } from './horizon';
import { getCostNameKey } from './parts';
import { effectiveStance, pick } from './stance';

/** What the days already walked leave behind for the next one, assuming each was confirmed as drafted and nothing was spent. */
export interface LookaheadCarry {
  /** What each bill was given by the walked days. */
  funded: Record<string, FundedDay[]>;
  /** What each other item (envelope, goal) was given by the walked days. */
  added: Record<string, Cents>;
}

export interface LookaheadDraft {
  draft: Draft;
  names: Record<string, { name: string }>;
}

export type LookaheadProblem =
  | {
      kind: 'noIncome';
      on: DateOnly;
      billId: string;
      name: string;
      /** `noIncome`: no pay comes before it is due; `noPick`: the pay it is set to come from does not; `short`: pays do come but carry less than it needs. */
      reason: 'noIncome' | 'noPick' | 'short';
      /** What no pay carries. */
      shortBy: Cents;
    }
  | {
      kind: 'short';
      on: DateOnly;
      dayKey: string;
      itemId: string;
      /** The Horizon cost a line saves toward; null elsewhere, so an item's costs are never mistaken for one another. */
      costId: string | null;
      name: string;
      shortBy: Cents;
      isBill: boolean;
      tier: Priority;
    };

/** A Horizon item as the lookahead reads it: what it holds now and the costs it plans. */
export interface LookaheadHorizonItem {
  id: string;
  name: string;
  rest: HorizonRest;
  costs: readonly HorizonCost[];
  heldCents: Cents;
  /** A finished or called-off item asks nothing and is never warned about; read as open when missing. */
  state?: HorizonState;
  /** Payments already marked paid; they ask nothing and are not warned about. */
  paid?: readonly { costId: string; dueOn: DateOnly }[];
}

/** A Horizon warning that is not a gap in the plan: it never moves `holdsThrough` and is not in `problems`. */
export type HorizonShort =
  | {
      /** An item whose rest is decided later runs out of money for a payment. */
      kind: 'later';
      itemId: string;
      name: string;
      dueOn: DateOnly;
      shortCents: Cents;
    }
  | {
      /** A cost due before its picked pay is fronted by Free to Spend, which then falls below zero. */
      kind: 'fronted';
      itemId: string;
      /** The cost's own name. */
      name: string;
      dueOn: DateOnly;
      /** The part of this cost Free to Spend cannot front on the due date. */
      shortCents: Cents;
      /** The picked pay that gives it back. */
      payOn: DateOnly;
    };

export interface LookaheadInput {
  today: DateOnly;
  /** The last day the plan is looked at. */
  horizon: DateOnly;
  /** The coming income days, in order. */
  days: readonly ComingDay[];
  bills: readonly {
    id: string;
    name: string;
    since: DateOnly;
    /** The bill is set to come from one named pay, which may not be there. */
    isPick?: boolean;
    /** No due date yet: the plan sets nothing aside for it. */
    isUndated: boolean;
  }[];
  payments: Readonly<Record<string, BillPayment[]>>;
  /** The Horizon items in the plan; none when the caller has none. */
  horizonItems?: readonly LookaheadHorizonItem[];
  /** What the Horizon items' payments are planned at; defaults to the safe end. */
  stance?: Stance;
  /** Free to Spend now; null or missing leaves a fronted payment unchecked. */
  freeToSpendCents?: Cents | null;
  /** The draft for one day given what the days before it left behind; null when the day has none. */
  draftOf: (day: ComingDay, carry: LookaheadCarry) => LookaheadDraft | null;
}

export interface Lookahead {
  hasBills: boolean;
  /** The last day the plan holds; null when it fails on the first day it looks at. */
  holdsThrough: DateOnly | null;
  /** In date order. */
  problems: LookaheadProblem[];
  /** The first short line on each income day, by day key. */
  shortByDay: Record<string, Extract<LookaheadProblem, { kind: 'short' }>>;
  /** The soonest income day on which any item's own line is short, whatever its priority, with the draft it was walked from; null when every day covers everything. */
  firstShortDay: {
    dayKey: string;
    on: DateOnly;
    draft: Pick<Draft, 'lines'>;
  } | null;
  /** The last income day when nothing follows it for a long stretch. */
  incomeEndsOn: DateOnly | null;
  /** Bills to pay now: the first unpaid payment of each bill due today or before, soonest first (a tie by name), with the due dates of the unpaid ones after it. They are to-dos, not gaps in the plan, so they are not in `problems`. */
  due: {
    billId: string;
    name: string;
    dueOn: DateOnly;
    isOverdue: boolean;
    laterDueOn: DateOnly[];
  }[];
  /** Costs to pay now: the first unpaid payment of each cost inside the plan that is due today or before, soonest first (a tie by name), with the due dates of the unpaid ones after it. A cost paid outside the plan is never listed. They are to-dos, not gaps in the plan, so they are not in `problems`. */
  dueCosts: {
    itemId: string;
    itemName: string;
    costId: string;
    costName: string;
    dueOn: DateOnly;
    isOverdue: boolean;
    laterDueOn: DateOnly[];
  }[];
  /** Bills with no due date yet, in the order given. They never stop the plan, so they are not in `problems`. */
  undated: { billId: string; name: string }[];
  /** Horizon shortfalls and fronted payments Free to Spend cannot cover, soonest first. They never stop the plan, so they are not in `problems`. */
  horizonShort: HorizonShort[];
  /** Each walked income day: what it brings in, what its draft leaves free to spend and what it gives each item. */
  steps: {
    on: DateOnly;
    moneyCents: Cents;
    freeCents: Cents;
    lines: { itemId: string; cents: Cents }[];
  }[];
}

const EMPTY_CARRY: LookaheadCarry = { funded: {}, added: {} };
const PROBLEM_RANK = { noIncome: 0, short: 1 } as const;

const TIER_RANK: Record<Priority, number> = { must: 0, should: 1, want: 2 };
const getTierRank = (problem: LookaheadProblem) =>
  problem.kind === 'short' ? TIER_RANK[problem.tier] : 0;

/** The one order problems are listed in: date, then kind, then priority, then name. */
export function sortProblems(problems: readonly LookaheadProblem[]) {
  const result = [...problems].sort(
    (a, b) =>
      a.on - b.on ||
      PROBLEM_RANK[a.kind] - PROBLEM_RANK[b.kind] ||
      getTierRank(a) - getTierRank(b) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return result;
}

/** Whether two lookaheads say the same to a person: how far the plan holds and every problem. */
export function isSameLookahead(before: Lookahead, after: Lookahead) {
  const key = (look: Lookahead) =>
    JSON.stringify([look.holdsThrough, sortProblems(look.problems)]);
  const result = key(before) === key(after);
  return result;
}

const nextCarry = (
  carry: LookaheadCarry,
  day: ComingDay,
  draft: Draft,
): LookaheadCarry =>
  draft.lines.reduce<LookaheadCarry>((acc, line) => {
    // A cost's share already spreads what is left over every pay: counting an earlier
    // pay's money again would shrink the later shares.
    if (line.cents <= 0 || line.repaysFree || line.costId) return acc;
    if (line.bill !== null) {
      const entry: FundedDay = {
        dayKey: day.dayKey,
        on: day.on,
        cents: line.cents,
      };
      return {
        ...acc,
        funded: {
          ...acc.funded,
          [line.itemId]: [...(acc.funded[line.itemId] ?? []), entry],
        },
      };
    }
    return {
      ...acc,
      added: {
        ...acc.added,
        [line.itemId]: (acc.added[line.itemId] ?? 0) + line.cents,
      },
    };
  }, carry);

/** A cost is named by itself, joined with its item only when another item's cost on the day shares the name. */
const getShortName = (
  line: Draft['lines'][number],
  lines: Draft['lines'],
  names: LookaheadDraft['names'],
) => {
  const itemName = names[line.itemId]?.name ?? '';
  const costName = line.costId
    ? names[getCostNameKey(line.itemId, line.costId)]?.name
    : undefined;
  if (costName === undefined) return itemName;
  const isShared = lines.some(
    (other) =>
      other.itemId !== line.itemId &&
      other.costId &&
      names[getCostNameKey(other.itemId, other.costId)]?.name === costName,
  );
  return isShared ? HORIZON_WORDS.costLineName(costName, itemName) : costName;
};

/** Every Must that goes unfunded, and every bill or cost payment that falls due before the next income day and is not set aside in full, in the draft's own order. */
const findShorts = (
  day: ComingDay,
  nextOn: DateOnly,
  result: LookaheadDraft,
): Extract<LookaheadProblem, { kind: 'short' }>[] =>
  result.draft.lines
    .filter(
      (entry) =>
        entry.shortBy > 0 &&
        (entry.tier === 'must' ||
          (entry.bill !== null && entry.bill.dueOn < nextOn) ||
          (entry.cost != null && entry.cost.dueOn < nextOn)),
    )
    .map((line) => ({
      kind: 'short',
      on: day.on,
      dayKey: day.dayKey,
      itemId: line.itemId,
      costId: line.costId ?? null,
      name: getShortName(line, result.draft.lines, result.names),
      shortBy: line.shortBy,
      isBill: line.bill !== null,
      tier: line.tier,
    }));

/** The first payment of each bill that is due today or past due and not marked paid, since the bill began to be tracked. */
const findDue = (input: LookaheadInput): Lookahead['due'] =>
  input.bills
    .flatMap((bill) => {
      const unpaid = (input.payments[bill.id] ?? []).filter(
        (payment) =>
          payment.paid === null &&
          payment.dueOn <= input.today &&
          payment.dueOn >= bill.since,
      );
      const first = unpaid[0];
      return first
        ? [
            {
              billId: bill.id,
              name: bill.name,
              dueOn: first.dueOn,
              isOverdue: first.dueOn < input.today,
              laterDueOn: unpaid.slice(1).map((payment) => payment.dueOn),
            },
          ]
        : [];
    })
    .sort((a, b) => a.dueOn - b.dueOn || a.name.localeCompare(b.name));

/** The first payment of each cost inside the plan that is due today or past due and not marked paid. */
const findDueCosts = (input: LookaheadInput): Lookahead['dueCosts'] =>
  (input.horizonItems ?? [])
    .filter((item) => (item.state ?? 'open') === 'open')
    .flatMap((item) =>
      item.costs
        .filter(({ isOutside }) => !isOutside)
        .flatMap((cost) => {
          const unpaid = listCostPayments(
            cost,
            input.today,
            input.stance ?? 'conservative',
          ).filter(
            ({ dueOn }) =>
              !(item.paid ?? []).some(
                (entry) => entry.costId === cost.id && entry.dueOn === dueOn,
              ),
          );
          const [first] = unpaid;
          return first
            ? [
                {
                  itemId: item.id,
                  itemName: item.name,
                  costId: cost.id,
                  costName: cost.name,
                  dueOn: first.dueOn,
                  isOverdue: first.dueOn < input.today,
                  laterDueOn: unpaid.slice(1).map(({ dueOn }) => dueOn),
                },
              ]
            : [];
        }),
    )
    .sort((a, b) => a.dueOn - b.dueOn || a.costName.localeCompare(b.costName));

/** The first payment of each bill that the pays before it are not set to carry in full: none comes before it, the pay it names does not, or what is pinned leaves some of it. */
const findNoIncome = (
  input: LookaheadInput,
  walkedFunded: LookaheadCarry['funded'],
): LookaheadProblem[] =>
  input.bills.flatMap((bill) => {
    const unfunded = (input.payments[bill.id] ?? []).find(
      (payment) =>
        payment.paid === null &&
        payment.dueOn > input.today &&
        payment.dueOn <= input.horizon &&
        payment.fundedCents +
          payment.parts.reduce((sum, part) => sum + part.cents, 0) <
          payment.totalCents,
    );
    if (!unfunded) return [];
    const partKeys = new Set(unfunded.parts.map((part) => part.day.dayKey));
    const walked = (walkedFunded[bill.id] ?? [])
      .filter((entry) => partKeys.has(entry.dayKey))
      .reduce((sum, entry) => sum + entry.cents, 0);
    const shortBy = Math.max(
      0,
      unfunded.totalCents - unfunded.fundedCents - walked,
    );
    const reason =
      unfunded.parts.length > 0
        ? 'short'
        : bill.isPick === true
          ? 'noPick'
          : 'noIncome';
    return [
      {
        kind: 'noIncome',
        on: unfunded.dueOn,
        billId: bill.id,
        name: bill.name,
        reason,
        shortBy,
      },
    ];
  });

/** A `later` item's first uncovered payment, and every cost payment fronted by Free to Spend (due before the pay picked for it) when the simulated Free to Spend, walked pay by pay, is below zero on its due date and the picked pay's own line is not already short. Outside costs and items are never read. */
const findHorizonShort = (
  input: LookaheadInput,
  steps: Lookahead['steps'],
  problems: readonly LookaheadProblem[],
): HorizonShort[] => {
  const stance = input.stance ?? 'conservative';
  const items = (input.horizonItems ?? []).map((item) => {
    const all = listHorizonPayments(
      item.costs,
      input.horizon,
      stance,
      [],
      item.state ?? 'open',
    );
    const open = all.filter(
      ({ costId, dueOn }) =>
        !(item.paid ?? []).some(
          (entry) => entry.costId === costId && entry.dueOn === dueOn,
        ),
    );
    return { item, all, covers: planHorizon(item, item.heldCents, open) };
  });
  const later = items.flatMap(({ item, covers }): HorizonShort[] => {
    const { shortfall } = covers;
    return shortfall && shortfall.dueOn >= input.today
      ? [
          {
            kind: 'later',
            itemId: item.id,
            name: item.name,
            dueOn: shortfall.dueOn,
            shortCents: shortfall.shortCents,
          },
        ]
      : [];
  });
  const fronted = items.flatMap(({ item, all, covers }) => {
    const { rest } = item;
    const picked =
      rest.kind === 'onePay'
        ? input.days.find((day) => day.dayKey === rest.dayKey)
        : undefined;
    if (!picked) return [];
    return covers.covers
      .filter(
        (cover) =>
          cover.coveredCents < cover.totalCents &&
          cover.dueOn >= input.today &&
          cover.dueOn < picked.on &&
          all.find((payment) => payment.costId === cover.costId)?.dueOn ===
            cover.dueOn,
      )
      .map((cover) => ({
        itemId: item.id,
        costId: cover.costId,
        name:
          item.costs.find(({ id }) => id === cover.costId)?.name ?? item.name,
        dueOn: cover.dueOn,
        payOn: picked.on,
        needCents: cover.totalCents - cover.coveredCents,
      }));
  });
  const base = input.freeToSpendCents;
  const warned = fronted.flatMap((entry): HorizonShort[] => {
    if (base === null || base === undefined) return [];
    // The picked pay's own short line already warns about this cost.
    const isPayShort = problems.some(
      (problem) =>
        problem.kind === 'short' &&
        problem.costId === entry.costId &&
        problem.on === entry.payOn,
    );
    if (isPayShort) return [];
    const free =
      base +
      steps
        .filter((step) => step.on <= entry.dueOn)
        .reduce((sum, step) => sum + step.freeCents, 0) -
      fronted
        .filter(
          (other) => other.dueOn <= entry.dueOn && other.payOn > entry.dueOn,
        )
        .reduce((sum, other) => sum + other.needCents, 0);
    return free < 0
      ? [
          {
            kind: 'fronted',
            itemId: entry.itemId,
            name: entry.name,
            dueOn: entry.dueOn,
            shortCents: Math.min(entry.needCents, -free),
            payOn: entry.payOn,
          },
        ]
      : [];
  });
  const result = [...later, ...warned].sort(
    (a, b) => a.dueOn - b.dueOn || a.name.localeCompare(b.name),
  );
  return result;
};

const getIncomeEnd = (input: LookaheadInput): DateOnly | null => {
  const last = input.days.at(-1);
  if (!last) return null;
  const isOver = input.horizon - last.on > INCOME_END_GAP_DAYS * DAY_MS;
  return isOver ? last.on : null;
};

/**
 * Walks the coming income days in order, each drafted as if the days before it were confirmed as
 * drafted and nothing was spent, and says how far the plan holds and what stops it. Pure: the draft
 * for a day comes from the caller.
 */
export function lookahead(input: LookaheadInput): Lookahead {
  const { days } = input;
  const walked = days.reduce<{
    carry: LookaheadCarry;
    shorts: Extract<LookaheadProblem, { kind: 'short' }>[];
    firstShortDay: Lookahead['firstShortDay'];
    steps: Lookahead['steps'];
  }>(
    (acc, day, index) => {
      const result = input.draftOf(day, acc.carry);
      if (!result) return acc;
      const nextOn = days[index + 1]?.on ?? input.horizon + DAY_MS;
      const isShort = result.draft.lines.some(
        (line) => line.pairing === null && line.shortBy > 0,
      );
      return {
        carry: nextCarry(acc.carry, day, result.draft),
        shorts: [...acc.shorts, ...findShorts(day, nextOn, result)],
        firstShortDay:
          acc.firstShortDay ??
          (isShort
            ? { dayKey: day.dayKey, on: day.on, draft: result.draft }
            : null),
        steps: [
          ...acc.steps,
          {
            on: day.on,
            moneyCents: result.draft.moneyCents,
            freeCents: result.draft.freeToSpend.cents,
            lines: result.draft.lines.map(({ itemId, cents }) => ({
              itemId,
              cents,
            })),
          },
        ],
      };
    },
    { carry: EMPTY_CARRY, shorts: [], firstShortDay: null, steps: [] },
  );
  const problems = sortProblems([
    ...findNoIncome(input, walked.carry.funded),
    ...walked.shorts,
  ]);
  const incomeEndsOn = getIncomeEnd(input);
  const first = problems[0] ?? null;
  const getThrough = (): DateOnly | null => {
    if (!first) return incomeEndsOn ?? input.horizon;
    if (first.kind === 'noIncome') {
      const day = addUtcDays(first.on, -1);
      return day >= input.today ? day : null;
    }
    const before = days.filter((entry) => entry.on < first.on).at(-1);
    return before?.on ?? null;
  };
  const result: Lookahead = {
    hasBills: input.bills.length > 0,
    holdsThrough: getThrough(),
    problems,
    shortByDay: Object.fromEntries(
      problems
        .filter(
          (problem): problem is Extract<LookaheadProblem, { kind: 'short' }> =>
            problem.kind === 'short',
        )
        .reverse()
        .map((short) => [short.dayKey, short]),
    ),
    firstShortDay: walked.firstShortDay,
    incomeEndsOn,
    due: findDue(input),
    dueCosts: findDueCosts(input),
    undated: input.bills
      .filter((bill) => bill.isUndated)
      .map((bill) => ({ billId: bill.id, name: bill.name })),
    horizonShort: findHorizonShort(input, walked.steps, problems),
    steps: walked.steps,
  };
  return result;
}

export interface StanceCushion {
  cents: Cents;
  sourceCount: number;
  billCount: number;
}

/**
 * What the plan's stance holds back over the next `CUSHION_DAYS`: for every range in play, the
 * difference between the figure the stance plans and the middle of the range. Null when the stance
 * holds nothing back (middle, optimistic or no ranges).
 */
export function getStanceCushion(
  planStance: Stance,
  today: DateOnly,
  days: readonly Pick<
    ComingDay,
    'on' | 'sourceId' | 'payLineId' | 'amount' | 'stanceOverride'
  >[],
  payments: Readonly<Record<string, BillPayment[]>>,
): StanceCushion | null {
  const end = today + CUSHION_DAYS * DAY_MS;
  const middleOf = (range: MoneyRange) =>
    Math.floor((range.lowCents + range.highCents) / 2);
  const incomes = days
    .filter((day) => day.on <= end)
    .map((day) => {
      const stance = effectiveStance(planStance, day.stanceOverride);
      return {
        key: day.sourceId ?? day.payLineId,
        cents: middleOf(day.amount) - pick(stance, day.amount, 'income'),
      };
    })
    .filter((entry) => entry.cents > 0);
  const bills = Object.entries(payments)
    .flatMap(([billId, list]) =>
      list
        .filter(
          (payment) =>
            payment.paid === null &&
            payment.ranged !== null &&
            payment.dueOn >= today &&
            payment.dueOn <= end,
        )
        .map((payment) => ({
          key: billId,
          cents:
            payment.totalCents -
            middleOf(payment.ranged?.range ?? { lowCents: 0, highCents: 0 }),
        })),
    )
    .filter((entry) => entry.cents > 0);
  const cents = [...incomes, ...bills].reduce((sum, e) => sum + e.cents, 0);
  if (cents <= 0) return null;
  const result: StanceCushion = {
    cents,
    sourceCount: new Set(incomes.map((entry) => entry.key)).size,
    billCount: new Set(bills.map((entry) => entry.key)).size,
  };
  return result;
}
