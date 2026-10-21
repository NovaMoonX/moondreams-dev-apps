import { NUTRITION_CELLS } from '@apps/pinch/constants';
import type { NutritionSwitches, NutritionValues } from '@apps/pinch/types';

interface NutritionLineProps {
  values: NutritionValues;
  /** The metrics the person has switched on; omitted shows whatever has a value. */
  show?: NutritionSwitches;
  /** A short line for a row ("165 cal · 31 g protein"), or all four metrics when nothing says which are on. */
  isCompact?: boolean;
}

const formatAmount = (value: number) => String(Math.round(value * 10) / 10);

/** The nutrition a person can see: the metrics switched on that have a value, per whatever the caller says it is per. */
function NutritionLine({
  values,
  show,
  isCompact = false,
}: NutritionLineProps) {
  const parts = NUTRITION_CELLS.flatMap((cell) => {
    const isShown = show
      ? show[cell.key]
      : !isCompact || cell.key === 'calories' || cell.key === 'protein';
    const value = values[cell.key];

    return isShown && value !== null
      ? [
          `${formatAmount(value)}${cell.key === 'calories' ? ' cal' : ` g ${cell.key}`}`,
        ]
      : [];
  });

  if (parts.length === 0) {
    return null;
  }

  return <span>{parts.join(' · ')}</span>;
}

export default NutritionLine;
