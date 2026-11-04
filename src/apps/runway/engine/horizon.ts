import type {
  Cents,
  DateOnly,
  HorizonCost,
  HorizonSealed,
  HorizonStored,
  MoneyRange,
  Schedule,
  Stance,
} from '@apps/runway/types';

import { addUtcMonths, DAY_MS } from './dates';
import { getIntervalMonths, occurrences } from './schedule';
import { pick } from './stance';

/** One time a cost asks for money. */
export interface CostPayment {
  costId: string;
  dueOn: DateOnly;
  /** The amount the stance plans: a range reads at its expense end. */
  totalCents: Cents;
}

/** A cost's payments through `horizon`, soonest first. */
export function listCostPayments(
  cost: HorizonCost,
  horizon: DateOnly,
  stance: Stance,
): CostPayment[] {
  const totalCents = pick(stance, cost.amount, 'expense');
  const result = occurrences(cost.schedule, cost.ending, 0, horizon)
    .filter((dueOn) => cost.endsAfter === null || dueOn <= cost.endsAfter)
    .map((dueOn) => ({ costId: cost.id, dueOn, totalCents }));
  return result;
}

/** The day a repeating cost's first payment looks back to for its pays: one beat before it, so a monthly cost due Feb 1st asks the pays since Jan 1st. Null for a cost paid once, whose pays are every one before it. */
export function getPriorBeat(schedule: Schedule): DateOnly | null {
  const { anchor } = schedule;
  if (anchor === null || schedule.kind === 'once') return null;
  if (schedule.kind === 'weekly') return anchor - 7 * DAY_MS;
  if (schedule.kind === 'everyOtherWeek') return anchor - 14 * DAY_MS;
  const months = getIntervalMonths(schedule) ?? 1;
  return addUtcMonths(anchor, -months);
}

/** Every cost's payments through `horizon` in date order, ties in the order the costs were listed. */
export const listHorizonPayments = (
  costs: readonly HorizonCost[],
  horizon: DateOnly,
  stance: Stance,
): CostPayment[] =>
  costs
    .flatMap((cost) => listCostPayments(cost, horizon, stance))
    .sort((a, b) => a.dueOn - b.dueOn);

/** What the payments through `horizon` add up to. */
export const sumCostPayments = (payments: readonly CostPayment[]): Cents =>
  payments.reduce((sum, { totalCents }) => sum + totalCents, 0);

/** A stored payload with the fields later issues added filled in, so a version sealed before them reads as it always meant. */
export const readHorizon = (stored: HorizonStored): HorizonSealed => ({
  ...stored,
  rest: stored.rest ?? { kind: 'later' },
  costs: stored.costs.map((cost) => ({
    ...cost,
    isOutside: cost.isOutside ?? false,
    ending: cost.ending ?? { onDate: null, afterCount: null },
    pricedOn: cost.pricedOn ?? null,
    endsAfter: cost.endsAfter ?? null,
  })),
});

/** The item with one cost's amount set and the day it was priced; unchanged when the cost is not in it. */
export const setCostPrice = (
  horizon: HorizonSealed,
  costId: string,
  amount: MoneyRange,
  pricedOn: DateOnly,
): HorizonSealed => ({
  ...horizon,
  costs: horizon.costs.map((cost) =>
    cost.id === costId ? { ...cost, amount, pricedOn } : cost,
  ),
});

/** The cost fields a cost's Change form owns; its price, the day it was priced and where it ended stay as they are. */
export type CostChange = Pick<
  HorizonCost,
  'name' | 'schedule' | 'ending' | 'isOutside'
>;

/** The item with one cost's name, schedule, ending and paid-outside answer replaced; null when the cost is no longer in it. */
export const changeCost = (
  horizon: HorizonSealed,
  costId: string,
  fields: CostChange,
): HorizonSealed | null =>
  horizon.costs.some(({ id }) => id === costId)
    ? {
        ...horizon,
        costs: horizon.costs.map((cost) =>
          cost.id === costId
            ? {
                ...cost,
                name: fields.name,
                schedule: fields.schedule,
                ending: fields.ending,
                isOutside: fields.isOutside,
              }
            : cost,
        ),
      }
    : null;

/** The costs still asking for money; one that ended after a paid payment stays listed but is not counted. */
export const getLiveCosts = (horizon: Pick<HorizonSealed, 'costs'>) =>
  horizon.costs.filter(({ endsAfter }) => endsAfter === null);

/** The item without a cost, or null when that is its last live cost (the item is then called off, not emptied). A cost with a paid payment stays, ending after `today`, so what it already took stays in Spent. */
export const removeCost = (
  horizon: HorizonSealed,
  costId: string,
  today: DateOnly,
  hasPaidPayment: boolean,
): HorizonSealed | null =>
  getLiveCosts(horizon).length <= 1 ||
  !getLiveCosts(horizon).some(({ id }) => id === costId)
    ? null
    : {
        ...horizon,
        costs: hasPaidPayment
          ? horizon.costs.map((cost) =>
              cost.id === costId ? { ...cost, endsAfter: today } : cost,
            )
          : horizon.costs.filter(({ id }) => id !== costId),
      };

/** The item with a removed cost put back at its old place; null when a cost with that id is already in it. */
export const restoreCost = (
  horizon: HorizonSealed,
  cost: HorizonCost,
  index: number,
): HorizonSealed | null =>
  horizon.costs.some(({ id }) => id === cost.id)
    ? null
    : {
        ...horizon,
        costs: [
          ...horizon.costs.slice(0, index),
          cost,
          ...horizon.costs.slice(index),
        ],
      };

/** How much of one payment the money held covers. */
export interface HorizonCover {
  costId: string;
  dueOn: DateOnly;
  coveredCents: Cents;
  totalCents: Cents;
}

export interface HorizonShortfall {
  /** The cost whose payment is the first the money does not cover. */
  costId: string;
  /** What that payment is planned at. */
  paymentCents: Cents;
  /** What was left of the money held when that payment's turn came. */
  availableCents: Cents;
  /** The due date of the first payment the money does not cover. */
  dueOn: DateOnly;
  /** What that payment lacks. */
  shortCents: Cents;
  /** What every payment through the lookahead lacks. */
  totalShortCents: Cents;
}

export interface HorizonPlan {
  /** Each unpaid payment of a cost paid inside the plan, in due order. */
  covers: HorizonCover[];
  /** The due date of the first payment not covered in full; null when all are. */
  coveredUntil: DateOnly | null;
  /** Only for an item whose rest is decided later, and only when something runs short. */
  shortfall: HorizonShortfall | null;
}

/** Walks the money held over the unpaid payments in due order, ties by cost id; the input order changes nothing. */
export function planHorizon(
  item: Pick<HorizonSealed, 'rest'> & { costs: readonly HorizonCost[] },
  heldCents: Cents,
  payments: readonly CostPayment[],
): HorizonPlan {
  const outsideIds = new Set(
    item.costs.filter(({ isOutside }) => isOutside).map(({ id }) => id),
  );
  const ordered = payments
    .filter(({ costId }) => !outsideIds.has(costId))
    .sort((a, b) => a.dueOn - b.dueOn || a.costId.localeCompare(b.costId));
  const covers = ordered.reduce<{ left: Cents; list: HorizonCover[] }>(
    (walk, { costId, dueOn, totalCents }) => {
      const coveredCents = Math.min(totalCents, walk.left);
      return {
        left: walk.left - coveredCents,
        list: [...walk.list, { costId, dueOn, coveredCents, totalCents }],
      };
    },
    { left: Math.max(0, heldCents), list: [] },
  ).list;
  const short = covers.filter(
    ({ coveredCents, totalCents }) => coveredCents < totalCents,
  );
  const [first] = short;
  const shortfall: HorizonShortfall | null =
    item.rest.kind === 'later' && first
      ? {
          costId: first.costId,
          paymentCents: first.totalCents,
          availableCents: first.coveredCents,
          dueOn: first.dueOn,
          shortCents: first.totalCents - first.coveredCents,
          totalShortCents: short.reduce(
            (sum, { coveredCents, totalCents }) =>
              sum + totalCents - coveredCents,
            0,
          ),
        }
      : null;
  return { covers, coveredUntil: first?.dueOn ?? null, shortfall };
}

/** An item's three figures. Left is what the ledger holds for it; what was spent from it is added back to give what was set aside. */
export const getHorizonFigures = (leftCents: Cents, spentCents: Cents = 0) => ({
  setAsideCents: leftCents + spentCents,
  spentCents,
  leftCents,
});
