import type { Cents, MoneyRange, Stance } from '@apps/runway/types';

/** Money coming in, or money going out: a stance takes opposite ends of a range for each. */
export type RangeSide = 'income' | 'expense';

export type RangeEnd = 'low' | 'middle' | 'high';

/** An unknown or missing stance, as a plan written before the field existed, reads as conservative. */
export const readStance = (value: unknown): Stance =>
  value === 'middle' || value === 'optimistic' ? value : 'conservative';

/** One item's own stance when it has one, else the plan's. */
export const effectiveStance = (
  planStance: Stance,
  override: Stance | null | undefined,
): Stance => (override ? readStance(override) : planStance);

/** Which end of a range a stance plans: income at its low end under conservative, expenses at their high end. */
export function getRangeEnd(stance: Stance, side: RangeSide): RangeEnd {
  if (stance === 'middle') return 'middle';
  const isLowFirst = (stance === 'conservative') === (side === 'income');
  return isLowFirst ? 'low' : 'high';
}

/** The figure a stance plans from a range; the middle is rounded down to whole cents. */
export function pick(
  stance: Stance,
  range: MoneyRange,
  side: RangeSide,
): Cents {
  const end = getRangeEnd(stance, side);
  if (end === 'low') return range.lowCents;
  if (end === 'high') return range.highCents;
  const result = Math.floor((range.lowCents + range.highCents) / 2);
  return result;
}
