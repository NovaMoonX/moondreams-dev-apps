import {
  convertMeasure,
  isMeasureUnit,
  MEASURE_TO_BASE,
  type MeasureUnit,
  roundMeasure,
} from '@/utils/measureUtils';
import type {
  PinchUnitSettings,
  RecipeIngredient,
  Unit,
} from '@apps/pinch/types';

export interface Measured {
  amount: number;
  unit: Unit;
}

export const AS_WRITTEN_UNITS: PinchUnitSettings = {
  weight: 'AS_WRITTEN',
  volume: 'AS_WRITTEN',
  keepSpoons: true,
};

export const hasUnitPreference = (units: PinchUnitSettings) =>
  units.weight !== 'AS_WRITTEN' || units.volume !== 'AS_WRITTEN';

const SPOONS: MeasureUnit[] = ['TSP', 'TBSP'];
const ML_PER_QUARTER_CUP = MEASURE_TO_BASE.CUP / 4;

const pickWeightUnit = (
  grams: number,
  units: PinchUnitSettings,
): MeasureUnit | null => {
  if (units.weight === 'METRIC') return grams < 1000 ? 'G' : 'KG';
  if (units.weight === 'US') return grams < MEASURE_TO_BASE.LB ? 'OZ' : 'LB';
  return null;
};

const pickSmallSpoon = (ml: number): MeasureUnit =>
  ml < MEASURE_TO_BASE.TBSP ? 'TSP' : 'TBSP';

const pickVolumeUnit = (
  ml: number,
  from: MeasureUnit,
  units: PinchUnitSettings,
): MeasureUnit | null => {
  const isSpoon = SPOONS.includes(from);
  switch (units.volume) {
    case 'METRIC':
      if (isSpoon && units.keepSpoons) return null;
      return ml < 1000 ? 'ML' : 'L';
    case 'CUPS':
      if (ml >= ML_PER_QUARTER_CUP) return 'CUP';
      return isSpoon ? null : pickSmallSpoon(ml);
    case 'FL_OZ':
      if (ml >= MEASURE_TO_BASE.FL_OZ) return 'FL_OZ';
      return isSpoon ? null : pickSmallSpoon(ml);
    default:
      return null;
  }
};

/** The unit an amount reads in under the person's units, or null when it stays as written (a pinch, a count, a spoon they keep, or no preference for its kind). */
export function getPreferredUnit(
  amount: number,
  unit: Unit,
  units: PinchUnitSettings,
): MeasureUnit | null {
  if (!isMeasureUnit(unit)) return null;
  const base = amount * MEASURE_TO_BASE[unit];
  const target =
    unit === 'G' || unit === 'KG' || unit === 'OZ' || unit === 'LB'
      ? pickWeightUnit(base, units)
      : pickVolumeUnit(base, unit, units);
  return target === unit ? null : target;
}

/** The amount in the person's units without rounding, for a screen that formats it as a cook measures; the same amount when it stays as written. */
export function toPreferredUnits(
  amount: number,
  unit: Unit,
  units: PinchUnitSettings,
): Measured {
  const target = getPreferredUnit(amount, unit, units);
  if (target === null || !isMeasureUnit(unit)) return { amount, unit };
  const converted = convertMeasure(amount, unit, target);
  return converted === null
    ? { amount, unit }
    : { amount: converted, unit: target };
}

/** The amount in the person's units, rounded to one a cook would measure; null when it stays as written. */
export function adaptAmount(
  amount: number,
  unit: Unit,
  units: PinchUnitSettings,
): Measured | null {
  const target = getPreferredUnit(amount, unit, units);
  if (target === null || !isMeasureUnit(unit)) return null;
  const converted = convertMeasure(amount, unit, target);
  if (converted === null) return null;
  return { amount: roundMeasure(converted, target), unit: target };
}

/** A recipe's lines adapted to the person's units, each changed line remembering what it was; a line already adapted keeps its first original. */
export function adaptLines<
  Line extends Pick<RecipeIngredient, 'amount' | 'unit' | 'adaptedFrom'>,
>(lines: Line[], units: PinchUnitSettings): { lines: Line[]; count: number } {
  return lines.reduce<{ lines: Line[]; count: number }>(
    (acc, line) => {
      const adapted =
        line.amount === null
          ? null
          : adaptAmount(line.amount, line.unit, units);
      if (adapted === null || line.amount === null) {
        return { ...acc, lines: [...acc.lines, line] };
      }
      return {
        lines: [
          ...acc.lines,
          {
            ...line,
            amount: adapted.amount,
            unit: adapted.unit,
            adaptedFrom: line.adaptedFrom ?? {
              amount: line.amount,
              unit: line.unit,
            },
          },
        ],
        count: acc.count + 1,
      };
    },
    { lines: [], count: 0 },
  );
}

const VOLUME_LADDER: MeasureUnit[] = ['TSP', 'TBSP', 'CUP', 'FL_OZ', 'ML', 'L'];
const WEIGHT_LADDER: MeasureUnit[] = ['G', 'KG', 'OZ', 'LB'];

/** Whether an amount in this unit is a size a cook would actually measure it in (no 0.02 cups, no 40 teaspoons). */
const isSensibleIn = (base: number, unit: MeasureUnit) => {
  switch (unit) {
    case 'TSP':
      return base <= MEASURE_TO_BASE.TBSP * 2;
    case 'TBSP':
      return base >= MEASURE_TO_BASE.TSP && base <= MEASURE_TO_BASE.CUP / 2;
    case 'CUP':
      return base >= ML_PER_QUARTER_CUP / 2;
    case 'FL_OZ':
      return base >= MEASURE_TO_BASE.TBSP;
    case 'L':
    case 'KG':
      return base >= 500;
    case 'LB':
      return base >= MEASURE_TO_BASE.LB / 2;
    default:
      return true;
  }
};

/** What turns a weight into a volume for one ingredient. */
export interface Density {
  gramsPerMl: number | null;
}

/** The same amount in every unit a cook might want it in, its own unit first: the other units of its kind, then the other kind when the ingredient's density is known. Empty for a pinch or a count. */
export function getConversions(
  amount: number,
  unit: Unit,
  { gramsPerMl }: Density,
): Measured[] {
  if (!isMeasureUnit(unit) || amount <= 0) return [];
  const base = amount * MEASURE_TO_BASE[unit];
  const isWeight = WEIGHT_LADDER.includes(unit);
  const otherBase =
    gramsPerMl === null || gramsPerMl <= 0
      ? null
      : isWeight
        ? base / gramsPerMl
        : base * gramsPerMl;

  const inLadder = (ladder: MeasureUnit[], value: number) =>
    ladder
      .filter((target) => target !== unit && isSensibleIn(value, target))
      .map((target) => ({
        amount: value / MEASURE_TO_BASE[target],
        unit: target as Unit,
      }));

  return [
    { amount, unit },
    ...inLadder(isWeight ? WEIGHT_LADDER : VOLUME_LADDER, base),
    ...(otherBase === null
      ? []
      : inLadder(isWeight ? VOLUME_LADDER : WEIGHT_LADDER, otherBase)),
  ];
}

/** The amount in a unit the person named, through the ingredient's density when the kinds differ; null when it can't be converted. */
export function convertForIngredient(
  amount: number,
  unit: Unit,
  target: MeasureUnit,
  { gramsPerMl }: Density,
): number | null {
  if (!isMeasureUnit(unit)) return null;
  const same = convertMeasure(amount, unit, target);
  if (same !== null) return same;
  if (gramsPerMl === null || gramsPerMl <= 0) return null;
  const base = amount * MEASURE_TO_BASE[unit];
  const isWeight = WEIGHT_LADDER.includes(unit);
  const otherBase = isWeight ? base / gramsPerMl : base * gramsPerMl;
  return otherBase / MEASURE_TO_BASE[target];
}
