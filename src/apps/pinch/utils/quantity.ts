import { UNIT_DIMENSION, UNIT_TO_BASE } from '@apps/pinch/constants';
import type { Dimension, Unit } from '@apps/pinch/types';

export interface BaseQuantity {
  dimension: Dimension;
  value: number;
}

/** What turns a mass into a volume (grams per millilitre) or a count (grams each). */
export interface Conversions {
  gramsPerMl: number | null;
  gramsEach: number | null;
}

export const toBase = (amount: number, unit: Unit): BaseQuantity => ({
  dimension: UNIT_DIMENSION[unit],
  value: amount * UNIT_TO_BASE[unit],
});

const toGrams = (
  quantity: BaseQuantity,
  { gramsPerMl, gramsEach }: Conversions,
): number | null => {
  if (quantity.dimension === 'MASS') return quantity.value;
  if (quantity.dimension === 'VOLUME')
    return gramsPerMl === null ? null : quantity.value * gramsPerMl;
  return gramsEach === null ? null : quantity.value * gramsEach;
};

/** The same amount in another dimension, through the ingredient's density or weight each; null when it can't be bridged. */
export function bridge(
  quantity: BaseQuantity,
  target: Dimension,
  conversions: Conversions,
): BaseQuantity | null {
  if (quantity.dimension === target) {
    return quantity;
  }

  const grams = toGrams(quantity, conversions);
  if (grams === null) {
    return null;
  }
  if (target === 'MASS') return { dimension: 'MASS', value: grams };
  if (target === 'VOLUME')
    return conversions.gramsPerMl === null
      ? null
      : { dimension: 'VOLUME', value: grams / conversions.gramsPerMl };
  return conversions.gramsEach === null
    ? null
    : { dimension: 'COUNT', value: grams / conversions.gramsEach };
}
