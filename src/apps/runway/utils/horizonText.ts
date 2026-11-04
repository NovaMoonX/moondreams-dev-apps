import { formatDateOrdinalUTC, toDayOrdinal } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { HORIZON_WORDS, LOOKAHEAD_MONTHS } from '@apps/runway/constants';
import { addUtcMonths } from '@apps/runway/engine/dates';
import {
  getHorizonFigures,
  listHorizonPayments,
  planHorizon,
} from '@apps/runway/engine/horizon';
import type { HorizonCost, HorizonSealed, Stance } from '@apps/runway/types';

/** Everything the event's row and its sheet say about it, worked out once so the two never disagree. */
export function getHorizonStatus(
  horizon: HorizonSealed,
  assignedCents: number,
  today: number,
  stance: Stance,
) {
  const payments = listHorizonPayments(
    horizon.costs,
    addUtcMonths(today, LOOKAHEAD_MONTHS),
    stance,
  );
  const outsideIds = new Set(
    horizon.costs.filter(({ isOutside }) => isOutside).map(({ id }) => id),
  );
  const planned = payments.filter(({ costId }) => !outsideIds.has(costId));
  const figures = getHorizonFigures(Math.max(0, assignedCents));
  const plan = planHorizon(horizon, figures.leftCents, payments);
  const next = planned.find(({ dueOn }) => dueOn >= today);
  return {
    figures,
    plan,
    plannedCents: planned.reduce((sum, { totalCents }) => sum + totalCents, 0),
    plannedHighCents: planned.reduce(
      (sum, { costId }) =>
        sum +
        (horizon.costs.find(({ id }) => id === costId)?.amount.highCents ?? 0),
      0,
    ),
    isPlannedRange: planned.some(({ costId }) => {
      const amount = horizon.costs.find(({ id }) => id === costId)?.amount;
      return amount !== undefined && amount.lowCents !== amount.highCents;
    }),
    outsideCents: payments.reduce(
      (sum, { costId, totalCents }) =>
        outsideIds.has(costId) ? sum + totalCents : sum,
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

/** A cost in two plain pieces: the date line ("Jan 15th") and the figure ("$600 to $800" for a range). */
export function describeCost(cost: HorizonCost) {
  const { lowCents, highCents } = cost.amount;
  const { anchor } = cost.schedule;
  return {
    line: [
      anchor !== null && formatDateOrdinalUTC(anchor),
      cost.isOutside && HORIZON_WORDS.outsideTag,
    ]
      .filter(Boolean)
      .join(' · '),
    figure:
      lowCents === highCents
        ? formatCentsShort(lowCents)
        : `${formatCentsShort(lowCents)} to ${formatCentsShort(highCents)}`,
  };
}

/** "Jan 15th to 17th, 2027": the month and year are written once when both dates share them. */
export function formatDateRangeOrdinalUTC(from: number, to: number) {
  const start = new Date(from);
  const end = new Date(to);
  const isSameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (!isSameYear)
    return `${formatDateOrdinalUTC(from)} to ${formatDateOrdinalUTC(to)}`;
  const [startDay] = formatDateOrdinalUTC(from).split(',');
  const [endDay, ...endYear] = formatDateOrdinalUTC(to).split(',');
  const isSameMonth = start.getUTCMonth() === end.getUTCMonth();
  const lastDay = isSameMonth ? toDayOrdinal(end.getUTCDate()) : endDay;
  return `${startDay} to ${lastDay}${endYear.map((year) => `,${year}`).join('')}`;
}
