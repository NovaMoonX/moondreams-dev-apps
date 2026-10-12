import type { NutritionValues } from '@apps/pinch/types';

interface NutritionLineProps {
  values: NutritionValues;
  /** A short line for a row ("165 cal · 31 g protein") or all four metrics spelled out. */
  isCompact?: boolean;
}

const formatAmount = (value: number) => String(Math.round(value * 10) / 10);

/** The nutrition a person can see: the metrics that have a value, per whatever the caller says it is per. */
function NutritionLine({ values, isCompact = false }: NutritionLineProps) {
  const parts = [
    values.calories !== null && `${formatAmount(values.calories)} cal`,
    values.protein !== null && `${formatAmount(values.protein)} g protein`,
    ...(isCompact
      ? []
      : [
          values.carbs !== null && `${formatAmount(values.carbs)} g carbs`,
          values.fat !== null && `${formatAmount(values.fat)} g fat`,
        ]),
  ].filter((part): part is string => part !== false);

  if (parts.length === 0) {
    return null;
  }

  return <span>{parts.join(' · ')}</span>;
}

export default NutritionLine;
