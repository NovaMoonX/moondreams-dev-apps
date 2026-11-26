import type { PinchUnitSettings, Unit } from '@apps/pinch/types';
import {
  formatKitchenAmount,
  formatReadableAmount,
  getSpoonMeasure,
} from '@apps/pinch/utils/kitchenMeasure';
import { convertForIngredient } from '@apps/pinch/utils/units';

export interface ToolLine {
  name: string;
  amount: number;
  unit: Unit;
  isLiquid: boolean;
  /** What turns its weight into a volume, so a weighed line can say what it is in cups without a scale. */
  gramsPerMl: number | null;
}

export interface MeasuringTool {
  key: 'SCALE' | 'LIQUID_CUP' | 'DRY_CUPS' | 'SPOONS';
  name: string;
  /** What to reach for, largest first: the cup and spoon sizes ("1 cup", "⅓ cup"), or for a scale or a liquid cup the amounts it measures ("8 oz", "¼ cup"). */
  sizes: string[];
  /** The lines it measures, in recipe order. */
  names: string[];
  /** For a scale: each weighed line in cups or spoons, where its ingredient's density is known. */
  swaps: { name: string; text: string }[];
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

const toCups = (line: ToolLine) =>
  line.gramsPerMl === null
    ? null
    : convertForIngredient(line.amount, line.unit, 'CUP', {
        gramsPerMl: line.gramsPerMl,
      });

/** One swap per ingredient, its weighed lines added up in cups; an ingredient with no density has none. */
const getSwaps = (lines: ToolLine[]) => {
  const cupsByName = lines.reduce<Map<string, number>>((result, line) => {
    const cups = toCups(line);
    return cups === null || cups <= 0
      ? result
      : result.set(line.name, (result.get(line.name) ?? 0) + cups);
  }, new Map());
  return Array.from(cupsByName, ([name, cups]) => ({
    name,
    text: formatKitchenAmount(cups, 'CUP'),
  }));
};

const getToolSizes = (
  key: MeasuringTool['key'],
  lines: ToolLine[],
  units: PinchUnitSettings | null,
) =>
  key === 'SPOONS' || key === 'DRY_CUPS'
    ? sortSizes(lines.flatMap(getSizes))
    : Array.from(
        new Set(
          lines.map((line) =>
            formatReadableAmount(line.amount, line.unit, units),
          ),
        ),
      );

/** The measuring tools a set of measured lines calls for, with the cup and spoon sizes each needs. */
export function getMeasuringTools(
  lines: ToolLine[],
  units: PinchUnitSettings | null,
): MeasuringTool[] {
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
    return [
      {
        key,
        name: TOOL_NAMES[key],
        sizes: getToolSizes(key, matched, units),
        names: Array.from(new Set(matched.map((line) => line.name))),
        swaps: key === 'SCALE' ? getSwaps(matched) : [],
      },
    ];
  });
}

interface SharedMeasureRow {
  id: string;
  name: string;
  isLiquid: boolean;
  measure: { amount: number; unit: Unit; gramsPerMl: number | null } | null;
}

const getRowSizes = (row: SharedMeasureRow) =>
  row.measure === null || row.measure.amount <= 0
    ? []
    : getSizes({ ...row.measure, name: row.name, isLiquid: row.isLiquid });

const nameList = (names: string[], many: string) =>
  names.length === 1
    ? names[0]
    : names.length === 2
      ? `${names[0]} and ${names[1]}`
      : many;

/** A step's lines with the dry ones measured before a liquid that needs the same cup or spoon, so the measure stays dry, and the line that says so; otherwise the lines as written and no hint. */
export function orderDryFirst<T extends SharedMeasureRow>(
  rows: T[],
): { rows: T[]; hint: string | null } {
  const sized = rows.map((row) => ({ row, sizes: getRowSizes(row) }));
  const dry = sized.filter(({ row }) => !row.isLiquid);
  const pairs = sized
    .filter(({ row }) => row.isLiquid)
    .flatMap((liquid) =>
      dry.flatMap((solid) => {
        const size = sortSizes(
          liquid.sizes.filter((each) => solid.sizes.includes(each)),
        ).at(-1);
        return size === undefined
          ? []
          : [{ liquid: liquid.row, solid: solid.row, size }];
      }),
    );
  if (pairs.length === 0) return { rows, hint: null };

  const liquidIds = new Set(pairs.map((pair) => pair.liquid.id));
  const solidIds = new Set(pairs.map((pair) => pair.solid.id));
  const rest = rows.filter((row) => !liquidIds.has(row.id));
  const lastSolid = rest.reduce(
    (last, row, index) => (solidIds.has(row.id) ? index : last),
    -1,
  );
  const moved = rows.filter((row) => liquidIds.has(row.id));
  const ordered = [
    ...rest.slice(0, lastSolid + 1),
    ...moved,
    ...rest.slice(lastSolid + 1),
  ];
  const solids = rest
    .filter((row) => solidIds.has(row.id))
    .map((row) => row.name);
  const liquids = moved.map((row) => row.name);
  const sizes = Array.from(new Set(pairs.map((pair) => pair.size)));
  const measure = sizes.length === 1 ? `the ${sizes[0]}` : 'the same measures';
  return {
    rows: ordered,
    hint: `Same measure: ${nameList(solids, 'the dry ones')} first, then ${nameList(liquids, 'the liquids')}, so ${measure} stays dry.`,
  };
}
