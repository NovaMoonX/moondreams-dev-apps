import {
  DEFAULT_LITTER_FILL_DEPTH,
  DEFAULT_LITTER_FILL_DEPTH_UNIT,
  LITTER_TYPE_LABELS,
} from '@apps/nine-lives/constants/litter';
import type {
  CustomLitterType,
  Litter,
  LitterBox,
  LitterDepthUnit,
  LitterEntry,
  LitterType,
} from '@apps/nine-lives/types';

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

export interface LitterFillTarget {
  depth: number | null;
  depthUnit: LitterDepthUnit;
  weight: number | null;
  weightUnit: 'lb' | 'kg';
}

/** Boxes created before fill levels existed have none of these keys, so they get the recommended depth. */
export function getLitterFillTarget(
  box: Pick<LitterBox, 'fillDepth' | 'fillDepthUnit' | 'fillWeight' | 'fillWeightUnit'>,
): LitterFillTarget {
  const hasFillLevel = 'fillDepth' in box || 'fillWeight' in box;

  return {
    depth: hasFillLevel ? (box.fillDepth ?? null) : DEFAULT_LITTER_FILL_DEPTH,
    depthUnit: box.fillDepthUnit ?? DEFAULT_LITTER_FILL_DEPTH_UNIT,
    weight: box.fillWeight ?? null,
    weightUnit: box.fillWeightUnit ?? 'lb',
  };
}

export function formatLitterFillTarget(target: LitterFillTarget): string | null {
  const parts = [
    target.depth !== null ? `${target.depth} ${target.depthUnit}` : null,
    target.weight !== null ? `${target.weight} ${target.weightUnit}` : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function getLitterTypeLabel(
  litterType: LitterType,
  customLitterTypeId: string | null,
  customTypes: CustomLitterType[],
): string {
  if (litterType === 'custom') {
    return customTypes.find((type) => type.id === customLitterTypeId)?.label ?? 'Custom';
  }

  return LITTER_TYPE_LABELS[litterType];
}
