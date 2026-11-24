// Generated from src/apps/runway/engine/horizonStatus.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { LOOKAHEAD_MONTHS } from './engineConstants.js';
import { addUtcMonths } from './dates.js';
import {
  getHorizonFigures,
  getHorizonStage,
  getNextUnpaidPayment,
  type CostPaidEntry,
  listHorizonPayments,
  planHorizon,
} from './horizon.js';
import type { GoalCover } from './horizonGoal.js';
import type { HorizonSealed, Stance } from '../runwayTypes.js';

const sumGoalPaid = (paid: readonly CostPaidEntry[]) =>
  paid.reduce((sum, entry) => sum + entry.fromGoalCents, 0);

/** Everything the event's row and its sheet say about it, worked out once so the two never disagree. */
export function getHorizonStatus(
  horizon: HorizonSealed,
  assignedCents: number,
  today: number,
  stance: Stance,
  paid: readonly CostPaidEntry[] = [],
  spentCents = 0,
  fromFreeCents = 0,
  goal: GoalCover | null = null,
) {
  const through = addUtcMonths(today, LOOKAHEAD_MONTHS);
  const payments = listHorizonPayments(
    horizon.costs,
    through,
    stance,
    paid,
    horizon.state,
  );
  const outsideIds = new Set(
    horizon.costs.filter(({ isOutside }) => isOutside).map(({ id }) => id),
  );
  const planned = payments.filter(({ costId }) => !outsideIds.has(costId));
  const figures = getHorizonFigures(
    Math.max(0, assignedCents),
    spentCents,
    fromFreeCents,
    sumGoalPaid(paid),
  );
  const plan = planHorizon(horizon, figures.leftCents, payments, goal);
  const next =
    horizon.state === 'open'
      ? getNextUnpaidPayment(horizon.costs, today, stance, paid)
      : planned.find(
          ({ dueOn, paid: mark }) => mark === null && dueOn >= today,
        );
  return {
    figures,
    plan,
    stage: getHorizonStage(horizon, today, stance, paid),
    /** A cost pays more than once in the year ahead, so the totals count that year. */
    hasRepeats: payments.some(
      ({ costId }, index) =>
        payments.findIndex((payment) => payment.costId === costId) !== index,
    ),
    plannedCents: planned.reduce((sum, { totalCents }) => sum + totalCents, 0),
    plannedHighCents: planned.reduce(
      (sum, { costId, totalCents, paid: mark }) =>
        sum +
        (mark
          ? totalCents
          : (horizon.costs.find(({ id }) => id === costId)?.amount.highCents ??
            0)),
      0,
    ),
    isPlannedRange: planned.some(({ costId, paid: mark }) => {
      const amount = horizon.costs.find(({ id }) => id === costId)?.amount;
      return (
        mark === null &&
        amount !== undefined &&
        amount.lowCents !== amount.highCents
      );
    }),
    outsidePaidCents: payments.reduce(
      (sum, { costId, totalCents, paid: mark }) =>
        outsideIds.has(costId) && mark ? sum + totalCents : sum,
      0,
    ),
    outsideDueCents: payments.reduce(
      (sum, { costId, totalCents, paid: mark }) =>
        outsideIds.has(costId) && !mark ? sum + totalCents : sum,
      0,
    ),
    next: next
      ? {
          dueOn: next.dueOn,
          name: horizon.costs.find(({ id }) => id === next.costId)?.name ?? '',
        }
      : null,
  };
}
