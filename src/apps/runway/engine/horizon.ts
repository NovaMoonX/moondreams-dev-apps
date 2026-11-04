import type { Cents, DateOnly, HorizonCost, Stance } from '@apps/runway/types';

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
