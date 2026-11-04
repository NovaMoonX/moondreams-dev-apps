import type {
  Cents,
  DateOnly,
  HorizonCost,
  HorizonSealed,
  HorizonStored,
  Stance,
} from '@apps/runway/types';

import { occurrences } from './schedule';
import { pick } from './stance';

const NEVER_ENDS = { onDate: null, afterCount: null } as const;

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
  const result = occurrences(cost.schedule, NEVER_ENDS, 0, horizon).map(
    (dueOn) => ({ costId: cost.id, dueOn, totalCents }),
  );
  return result;
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
  })),
});

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
  item: Pick<HorizonSealed, 'rest' | 'costs'>,
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
