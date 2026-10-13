import {
  NUTRITION_BASIS_OPTIONS,
  NUTRITION_ENTRY_UNITS,
  NUTRITION_METRICS,
} from '@apps/pinch/constants';
import type { NutritionValues, Unit } from '@apps/pinch/types';
import { bridge, toBase, type Conversions } from '@apps/pinch/utils/quantity';

export type NutritionBasis = (typeof NUTRITION_BASIS_OPTIONS)[number]['value'];
export type NutritionEntryUnit =
  (typeof NUTRITION_ENTRY_UNITS)[number]['value'];

export interface Serving {
  amount: number;
  unit: Unit;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Grams in one serving, through the ingredient's density or weight each; null when it can't be weighed. */
export function getServingGrams(
  serving: Serving,
  conversions: Conversions,
): number | null {
  const grams =
    bridge(toBase(serving.amount, serving.unit), 'MASS', conversions)?.value ??
    null;

  return grams !== null && Number.isFinite(grams) && grams > 0 ? grams : null;
}

/** Grams in `amount` of a nutrition label's unit; null for servings when the serving can't be weighed. */
export function getEntryGrams(
  amount: number,
  unit: NutritionEntryUnit,
  servingGrams: number | null,
): number | null {
  if (unit === 'SERVING') {
    return servingGrams === null ? null : amount * servingGrams;
  }

  return toBase(amount, unit).value;
}

/** A number typed for `grams` of an ingredient, as the per-100 g number that is stored (two decimals at most). */
export const toPer100g = (typed: number, grams: number) =>
  grams === 100 ? typed : round((typed * 100) / grams);

/** Nutrition for another amount: every known metric multiplied, unknown ones left unknown. */
export const scaleNutrition = (
  values: NutritionValues,
  factor: number,
): NutritionValues =>
  Object.fromEntries(
    NUTRITION_METRICS.map((metric) => [
      metric,
      values[metric] === null ? null : values[metric] * factor,
    ]),
  ) as unknown as NutritionValues;
