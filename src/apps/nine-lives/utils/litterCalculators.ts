import type { Litter, LitterEntry } from '@apps/nine-lives/types';

const LB_PER_KG = 2.20462;

/** The box's weight left standing after this check — what the next check's usage is measured against. */
export function getLitterEntryEndingWeight(
  entry: Pick<LitterEntry, 'weightBefore' | 'refillWeight'>,
): number {
  return entry.refillWeight ?? entry.weightBefore;
}

export function convertWeight(
  weight: number,
  fromUnit: 'lb' | 'kg',
  toUnit: 'lb' | 'kg',
): number {
  if (fromUnit === toUnit) {
    return weight;
  }

  return fromUnit === 'kg' ? weight * LB_PER_KG : weight / LB_PER_KG;
}

/** Derives the cost of a usage amount from the litter product's price per bag, converting units as needed. */
export function calculateLitterUsageCost(
  usageWeight: number,
  usageUnit: 'lb' | 'kg',
  litter: Pick<Litter, 'cost' | 'weight' | 'weightUnit'>,
): number | null {
  if (litter.cost == null || litter.weight <= 0 || usageWeight <= 0) {
    return null;
  }

  const litterWeightInUsageUnit = convertWeight(litter.weight, litter.weightUnit, usageUnit);
  const pricePerWeightUnit = litter.cost / litterWeightInUsageUnit;

  return usageWeight * pricePerWeightUnit;
}
