import { formatDateOrdinalUTC, toDayOrdinal } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import { HORIZON_WORDS } from '@apps/runway/constants';
import type { HorizonCost } from '@apps/runway/types';

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
