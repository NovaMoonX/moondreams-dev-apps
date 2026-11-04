import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCentsShort } from '@/utils/moneyUtils';
import type { HorizonCost } from '@apps/runway/types';

/** A cost in two plain pieces: the date line ("Jan 15th") and the figure ("$600 to $800" for a range). */
export function describeCost(cost: HorizonCost) {
  const { lowCents, highCents } = cost.amount;
  const { anchor } = cost.schedule;
  return {
    line: anchor === null ? '' : formatDateOrdinalUTC(anchor),
    figure:
      lowCents === highCents
        ? formatCentsShort(lowCents)
        : `${formatCentsShort(lowCents)} to ${formatCentsShort(highCents)}`,
  };
}
