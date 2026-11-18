import type { Unit } from '@apps/pinch/types';
import { getSpoonMeasure } from '@apps/pinch/utils/kitchenMeasure';

export interface ToolLine {
  name: string;
  amount: number;
  unit: Unit;
  isLiquid: boolean;
}

export interface MeasuringTool {
  key: 'SCALE' | 'LIQUID_CUP' | 'DRY_CUPS' | 'SPOONS';
  name: string;
  /** The sizes the lines call for, smallest last ("1 cup, ⅓ cup"); empty when sizes don't apply. */
  sizes: string[];
  /** The lines it measures, in recipe order. */
  names: string[];
}

const EPSILON = 0.02;

const POURED_FAMILY_IDS = new Set([
  'cat-fam-milk',
  'cat-fam-oil',
  'cat-fam-vinegar',
  'cat-fam-broth',
  'cat-fam-drinks',
]);

const POURED_INGREDIENT_IDS = new Set([
  'cat-soy-sauce',
  'cat-hot-sauce',
  'cat-worcestershire-sauce',
  'cat-fish-sauce',
  'cat-teriyaki-sauce',
  'cat-honey',
  'cat-maple-syrup',
  'cat-molasses',
  'cat-agave-syrup',
  'cat-corn-syrup',
]);

/** Poured rather than scooped (milk, oil, stock, soy sauce, syrups), so a cup of it wants a cup with a spout. */
export const isPouredIngredient = (
  ingredient: { id: string; familyId: string | null } | undefined,
) =>
  ingredient !== undefined &&
  (POURED_INGREDIENT_IDS.has(ingredient.id) ||
    POURED_FAMILY_IDS.has(ingredient.familyId ?? ''));

const near = (value: number, target: number) =>
  Math.abs(value - target) < EPSILON;

const getFraction = (amount: number) => amount - Math.floor(amount + EPSILON);

/** The spoons that measure an amount in teaspoons: whole ones and the usual ½, ¼ and ⅛. */
const getTeaspoonSizes = (teaspoons: number) => {
  const rest = getFraction(teaspoons);
  const whole = teaspoons + EPSILON >= 1 ? ['1 tsp'] : [];
  if (near(rest, 0)) return whole;
  if (near(rest, 1 / 8)) return [...whole, '⅛ tsp'];
  if (near(rest, 1 / 4)) return [...whole, '¼ tsp'];
  if (near(rest, 1 / 2)) return [...whole, '½ tsp'];
  if (near(rest, 3 / 4)) return [...whole, '½ tsp', '¼ tsp'];
  return [...whole, '¼ tsp'];
};

const getCupSizes = (cups: number) => {
  const rest = getFraction(cups);
  const whole = cups + EPSILON >= 1 ? ['1 cup'] : [];
  if (near(rest, 0)) return whole;
  if (near(rest, 1 / 2)) return [...whole, '½ cup'];
  if (near(rest, 1 / 4)) return [...whole, '¼ cup'];
  if (near(rest, 3 / 4)) return [...whole, '½ cup', '¼ cup'];
  return [...whole, '⅓ cup'];
};

/** The sizes for the spoon or cup amount as the row shows it, so "⅓ cup" on screen is the ⅓ cup measure. */
const getSizes = (line: ToolLine) => {
  const measure = getSpoonMeasure(line.amount, line.unit);
  if (measure === null || measure.kind === 'PINCH') return [];
  if (measure.unit === 'CUP') return getCupSizes(measure.value);
  if (measure.unit === 'TSP') return getTeaspoonSizes(measure.value);
  const half = near(getFraction(measure.value), 0.5);
  return [
    ...(measure.value + EPSILON >= 1 ? ['1 tbsp'] : []),
    ...(half ? ['1 tsp', '½ tsp'] : []),
  ];
};

const SIZE_ORDER = [
  '1 cup',
  '½ cup',
  '⅓ cup',
  '¼ cup',
  '1 tbsp',
  '1 tsp',
  '½ tsp',
  '¼ tsp',
  '⅛ tsp',
];

const sortSizes = (sizes: string[]) =>
  Array.from(new Set(sizes)).sort(
    (a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b),
  );

/** A weight in whole pounds or kilograms is nearly always a package as bought, so it needs no scale. */
const isWeighed = (line: ToolLine) =>
  line.unit === 'G' ||
  line.unit === 'OZ' ||
  ((line.unit === 'LB' || line.unit === 'KG') &&
    !near(getFraction(line.amount), 0));

const getToolKey = (line: ToolLine): MeasuringTool['key'] | null => {
  if (isWeighed(line)) return 'SCALE';
  if (line.unit === 'ML' || line.unit === 'L' || line.unit === 'FL_OZ') {
    return 'LIQUID_CUP';
  }
  const measure = getSpoonMeasure(line.amount, line.unit);
  if (measure === null || measure.kind === 'PINCH') return null;
  if (measure.unit !== 'CUP') return 'SPOONS';
  return line.isLiquid ? 'LIQUID_CUP' : 'DRY_CUPS';
};

const TOOL_NAMES: Record<MeasuringTool['key'], string> = {
  SCALE: 'Kitchen scale',
  LIQUID_CUP: 'Liquid measuring cup',
  DRY_CUPS: 'Measuring cups',
  SPOONS: 'Measuring spoons',
};

const TOOL_ORDER: MeasuringTool['key'][] = [
  'SCALE',
  'LIQUID_CUP',
  'DRY_CUPS',
  'SPOONS',
];

/** The measuring tools a set of measured lines calls for, with the cup and spoon sizes each needs. */
export function getMeasuringTools(lines: ToolLine[]): MeasuringTool[] {
  const grouped = lines.reduce<Map<MeasuringTool['key'], ToolLine[]>>(
    (result, line) => {
      const key = line.amount > 0 ? getToolKey(line) : null;
      return key === null
        ? result
        : result.set(key, [...(result.get(key) ?? []), line]);
    },
    new Map(),
  );
  return TOOL_ORDER.flatMap((key) => {
    const matched = grouped.get(key);
    if (!matched) return [];
    const sizes =
      key === 'SPOONS' || key === 'DRY_CUPS'
        ? sortSizes(matched.flatMap(getSizes))
        : [];
    return [
      {
        key,
        name: TOOL_NAMES[key],
        sizes,
        names: Array.from(new Set(matched.map((line) => line.name))),
      },
    ];
  });
}
