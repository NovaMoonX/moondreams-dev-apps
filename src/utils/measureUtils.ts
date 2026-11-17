/** Kitchen measures that convert to one another: weights to weights, volumes to volumes. */
export type MeasureUnit =
  'G' | 'KG' | 'OZ' | 'LB' | 'ML' | 'L' | 'TSP' | 'TBSP' | 'CUP' | 'FL_OZ';

export type MeasureKind = 'MASS' | 'VOLUME';

export const MEASURE_UNITS: MeasureUnit[] = [
  'G',
  'KG',
  'OZ',
  'LB',
  'ML',
  'L',
  'TSP',
  'TBSP',
  'CUP',
  'FL_OZ',
];

export const MEASURE_KIND: Record<MeasureUnit, MeasureKind> = {
  G: 'MASS',
  KG: 'MASS',
  OZ: 'MASS',
  LB: 'MASS',
  ML: 'VOLUME',
  L: 'VOLUME',
  TSP: 'VOLUME',
  TBSP: 'VOLUME',
  CUP: 'VOLUME',
  FL_OZ: 'VOLUME',
};

/** Grams for a weight, millilitres for a volume (US customary cups and spoons). */
export const MEASURE_TO_BASE: Record<MeasureUnit, number> = {
  G: 1,
  KG: 1000,
  OZ: 28.349523125,
  LB: 453.59237,
  ML: 1,
  L: 1000,
  TSP: 4.92892159375,
  TBSP: 14.78676478125,
  CUP: 236.5882365,
  FL_OZ: 29.5735295625,
};

const EPSILON = 1e-9;

export const isMeasureUnit = (unit: string): unit is MeasureUnit =>
  (MEASURE_UNITS as string[]).includes(unit);

/** The same amount in another unit of its kind; null between a weight and a volume. */
export function convertMeasure(
  amount: number,
  from: MeasureUnit,
  to: MeasureUnit,
): number | null {
  if (MEASURE_KIND[from] !== MEASURE_KIND[to]) return null;
  return (amount * MEASURE_TO_BASE[from]) / MEASURE_TO_BASE[to];
}

const SPOON_FRACTIONS = [0, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
const CUP_FRACTIONS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
const QUARTERS = [0, 1 / 4, 1 / 2, 3 / 4];
const HALVES = [0, 1 / 2];

/** The parts of one whole a cook measures at, for units read in fractions; null for units read in decimal steps. */
const getFractions = (unit: MeasureUnit, whole: number): number[] | null => {
  if (unit === 'TSP') return whole === 0 ? SPOON_FRACTIONS : QUARTERS;
  if (unit === 'TBSP') return whole === 0 ? CUP_FRACTIONS : HALVES;
  if (unit === 'CUP') return CUP_FRACTIONS;
  if (unit === 'LB') return QUARTERS;
  return null;
};

/** The decimal step a cook measures at for an amount this size. */
const getStep = (unit: MeasureUnit, value: number): number => {
  switch (unit) {
    case 'G':
      if (value < 5) return 0.5;
      if (value < 50) return 1;
      if (value < 200) return 5;
      if (value < 1000) return 10;
      return 25;
    case 'ML':
      if (value < 10) return 1;
      if (value < 250) return 5;
      if (value < 1000) return 10;
      return 25;
    case 'KG':
    case 'L':
      return value < 2 ? 0.05 : 0.25;
    case 'OZ':
      if (value < 2) return 0.25;
      if (value < 16) return 0.5;
      return 1;
    case 'FL_OZ':
      return value < 4 ? 0.5 : 1;
    default:
      return 1;
  }
};

/** Every amount a cook would measure in this unit, ascending, from the smallest up to past `max`. */
const getGridPoints = (unit: MeasureUnit, max: number): number[] => {
  const limit = max * 1.5 + 1;
  const firstFractions = getFractions(unit, 0);
  if (firstFractions !== null) {
    const wholes = Array.from({ length: Math.ceil(limit) + 1 }, (_, i) => i);
    return wholes
      .flatMap((whole) =>
        (getFractions(unit, whole) ?? []).map((part) => whole + part),
      )
      .filter((point) => point > 0);
  }
  const grow = (points: number[]): number[] => {
    const last = points[points.length - 1] ?? 0;
    if (last > limit) return points;
    const step = getStep(unit, last);
    return grow([...points, Math.round((last + step) / step) * step]);
  };
  return grow([]);
};

/** An amount snapped to the nearest one a cook would measure in its unit (113.4 g is 115 g, 0.35 cup is ⅓ cup). */
export function roundMeasure(amount: number, unit: MeasureUnit): number {
  if (!Number.isFinite(amount) || amount <= 0) return amount;
  const points = getGridPoints(unit, amount);
  return points.reduce((best, point) =>
    Math.abs(point - amount) < Math.abs(best - amount) ? point : best,
  );
}

/** The next amount a cook would measure above (`1`) or below (`-1`) this one; the same amount when nothing is below it. */
export function stepMeasure(
  amount: number,
  unit: MeasureUnit,
  direction: 1 | -1,
): number {
  const points = getGridPoints(unit, Math.max(amount, 0));
  if (direction === 1) {
    return points.find((point) => point > amount + EPSILON) ?? amount;
  }
  const below = points.filter((point) => point < amount - EPSILON);
  return below.length === 0 ? amount : below[below.length - 1];
}

const GLYPH_VALUES: Record<string, number> = {
  '⅛': 1 / 8,
  '¼': 1 / 4,
  '⅓': 1 / 3,
  '⅜': 3 / 8,
  '½': 1 / 2,
  '⅝': 5 / 8,
  '⅔': 2 / 3,
  '¾': 3 / 4,
  '⅞': 7 / 8,
};

/** A typed amount ("1 ½", "1 1/2", "1½", "3/4", "1.5", "1,5") as a number; null when it isn't one. */
export function parseAmountText(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;

  const glyph = trimmed.match(/^(\d+(?:\.\d+)?)?\s*([⅛¼⅓⅜½⅝⅔¾⅞])$/);
  if (glyph) return Number(glyph[1] ?? 0) + GLYPH_VALUES[glyph[2]];

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed && Number(mixed[3]) > 0)
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);

  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction && Number(fraction[2]) > 0)
    return Number(fraction[1]) / Number(fraction[2]);

  if (!/^\d*\.?\d+$|^\d+\.$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** An amount as a cook writes it: "1 ½", "⅓", "2", "0.4"; eighths and thirds are glyphs, anything else up to two decimals. */
export function formatAmountText(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const whole = Math.floor(amount + 1e-6);
  const rest = amount - whole;
  if (Math.abs(rest) < 1e-6) return String(whole);
  const glyph = Object.entries(GLYPH_VALUES).find(
    ([, part]) => Math.abs(part - rest) < 1e-6,
  );
  if (glyph) return whole === 0 ? glyph[0] : `${whole} ${glyph[0]}`;
  return String(Math.round(amount * 100) / 100);
}

const UNIT_WORDS: Record<string, MeasureUnit> = {
  g: 'G',
  gram: 'G',
  grams: 'G',
  gm: 'G',
  gms: 'G',
  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  kilos: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',
  oz: 'OZ',
  ounce: 'OZ',
  ounces: 'OZ',
  lb: 'LB',
  lbs: 'LB',
  pound: 'LB',
  pounds: 'LB',
  ml: 'ML',
  mls: 'ML',
  milliliter: 'ML',
  milliliters: 'ML',
  millilitre: 'ML',
  millilitres: 'ML',
  l: 'L',
  liter: 'L',
  liters: 'L',
  litre: 'L',
  litres: 'L',
  tsp: 'TSP',
  tsps: 'TSP',
  teaspoon: 'TSP',
  teaspoons: 'TSP',
  tbsp: 'TBSP',
  tbsps: 'TBSP',
  tablespoon: 'TBSP',
  tablespoons: 'TBSP',
  cup: 'CUP',
  cups: 'CUP',
  'fl oz': 'FL_OZ',
  'fluid ounce': 'FL_OZ',
  'fluid ounces': 'FL_OZ',
};

/** A unit as someone writes or says it ("grams", "tbsp", "fl oz", "Cups."); null for any other word. */
export function readMeasureUnitWord(text: string): MeasureUnit | null {
  const word = text
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return Object.hasOwn(UNIT_WORDS, word) ? UNIT_WORDS[word] : null;
}
