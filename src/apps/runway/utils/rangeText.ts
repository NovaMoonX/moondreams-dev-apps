import { formatCents } from '@/utils/moneyUtils';
import { RANGE_END_WORDS } from '@apps/runway/constants';
import { getRangeEnd, pick, type RangeSide } from '@apps/runway/engine/stance';
import type { MoneyRange, Stance } from '@apps/runway/types';

/** "Planned at the low end, $140 of $140 to $180"; null for an exact amount, which needs no note. */
export function describeRange(
  range: MoneyRange,
  stance: Stance,
  side: RangeSide,
  isOwnStance = false,
): string | null {
  if (range.lowCents === range.highCents) return null;
  const end = RANGE_END_WORDS[getRangeEnd(stance, side)];
  const result = `Planned at ${end}, ${formatCents(pick(stance, range, side))} of ${formatCents(range.lowCents)} to ${formatCents(range.highCents)}${isOwnStance ? ', its own setting' : ''}`;
  return result;
}

/** "$140 to $180", the way a range reads in a field's summary. */
export const formatRange = (range: MoneyRange) =>
  range.lowCents === range.highCents
    ? formatCents(range.lowCents)
    : `${formatCents(range.lowCents)} to ${formatCents(range.highCents)}`;
