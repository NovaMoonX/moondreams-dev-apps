import { UNIT_LABELS } from '@apps/pinch/constants';
import type { PinchUnitSettings, Unit } from '@apps/pinch/types';

const CLOSE_ENOUGH = 0.05;
const EPSILON = 1e-6;

const GLYPHS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];
const CUP_FRACTIONS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
const SMALL_SPOON_FRACTIONS = [0, 1 / 8, ...CUP_FRACTIONS.slice(1)];
const QUARTERS = [0, 1 / 4, 1 / 2, 3 / 4];
const HALVES = [0, 1 / 2];

const nearestOnGrid = (value: number, fractions: number[]) => {
  const whole = Math.floor(value);
  const candidates = [...fractions.map((part) => whole + part), whole + 1]
    .filter((candidate) => candidate > 0)
    .sort((a, b) => Math.abs(a - value) - Math.abs(b - value));

  return candidates[0];
};

const isClose = (value: number, rounded: number) =>
  Math.abs(rounded - value) / value <= CLOSE_ENOUGH;

const formatFraction = (value: number) => {
  const whole = Math.floor(value + EPSILON);
  const rest = value - whole;
  if (rest < EPSILON) return String(whole);

  const glyph = GLYPHS.find(([part]) => Math.abs(part - rest) < EPSILON)?.[1];
  if (!glyph) return String(Math.round(value * 100) / 100);

  return whole === 0 ? glyph : `${whole}${glyph}`;
};

const say = (value: number, label: string, isApprox: boolean) =>
  `${isApprox ? 'about ' : ''}${formatFraction(value)}${label === '' ? '' : ` ${label}`}`;

const readGrid = (value: number, fractions: number[], label: string) => {
  const rounded = nearestOnGrid(value, fractions);
  return say(rounded, label, !isClose(value, rounded));
};

/** A spoon or cup amount rounded the way a cook measures it, or a pinch. */
export type SpoonMeasure =
  | { kind: 'PINCH' }
  | {
      kind: 'MEASURE';
      value: number;
      unit: 'TSP' | 'TBSP' | 'CUP';
      isApprox: boolean;
    };

const onGrid = (
  value: number,
  fractions: number[],
  unit: 'TSP' | 'TBSP' | 'CUP',
): SpoonMeasure => {
  const rounded = nearestOnGrid(value, fractions);
  return {
    kind: 'MEASURE',
    value: rounded,
    unit,
    isApprox: !isClose(value, rounded),
  };
};

const measureTeaspoons = (value: number): SpoonMeasure => {
  if (value < 1 / 16) return { kind: 'PINCH' };
  return onGrid(
    value,
    value < 1 ? SMALL_SPOON_FRACTIONS : CUP_FRACTIONS,
    'TSP',
  );
};

const measureTablespoons = (value: number): SpoonMeasure => {
  if (value < 1 - EPSILON) return measureTeaspoons(value * 3);

  const rounded = nearestOnGrid(value, HALVES);
  if (isClose(value, rounded)) {
    return { kind: 'MEASURE', value: rounded, unit: 'TBSP', isApprox: false };
  }
  if (value < 2) return measureTeaspoons(value * 3);
  return { kind: 'MEASURE', value: rounded, unit: 'TBSP', isApprox: true };
};

const measureCups = (value: number): SpoonMeasure => {
  if (value < 1 / 4 - EPSILON) return measureTablespoons(value * 16);

  const rounded = nearestOnGrid(value, CUP_FRACTIONS);
  if (isClose(value, rounded)) {
    return { kind: 'MEASURE', value: rounded, unit: 'CUP', isApprox: false };
  }
  if (value <= 1 / 2) return measureTablespoons(value * 16);
  return { kind: 'MEASURE', value: rounded, unit: 'CUP', isApprox: true };
};

/** The spoon or cup a volume is measured with, rounded as `formatKitchenAmount` shows it; null for any other unit. */
export function getSpoonMeasure(
  amount: number,
  unit: Unit,
): SpoonMeasure | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === 'CUP') return measureCups(amount);
  if (unit === 'TBSP') return measureTablespoons(amount);
  if (unit === 'TSP') return measureTeaspoons(amount);
  return null;
}

const saySpoon = (measure: SpoonMeasure) => {
  if (measure.kind === 'PINCH') return 'a pinch';
  const label =
    measure.unit === 'CUP' && measure.value > 1
      ? 'cups'
      : UNIT_LABELS[measure.unit];
  return say(measure.value, label, measure.isApprox);
};

const readCount = (value: number, label: string) => {
  const rounded =
    value >= 3 ? Math.round(value) : Math.max(0.5, Math.round(value * 2) / 2);
  return say(rounded, label, Math.abs(rounded - value) > 0.01);
};

const readMetric = (value: number, label: string) => {
  const rounded =
    value >= 10
      ? Math.round(value)
      : Math.max(0.1, Math.round(value * 10) / 10);
  return `${rounded} ${label}`;
};

const readLarge = (value: number, label: string) =>
  `${Math.round(value * 100) / 100} ${label}`;

/** An amount the way a cook measures it ("⅓ cup", "5 tbsp", "about 8"): kitchen fractions, a smaller unit when the larger one would need a sliver of it, and "about" when it had to round. Display only: the amount itself is never changed. */
export function formatKitchenAmount(amount: number, unit: Unit) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return `${Math.round(amount * 100) / 100} ${UNIT_LABELS[unit]}`;
  }

  switch (unit) {
    case 'CUP':
      return saySpoon(measureCups(amount));
    case 'TBSP':
      return saySpoon(measureTablespoons(amount));
    case 'TSP':
      return saySpoon(measureTeaspoons(amount));
    case 'LB':
      return amount < 1 / 4 - EPSILON
        ? readGrid(amount * 16, HALVES, UNIT_LABELS.OZ)
        : readGrid(amount, QUARTERS, UNIT_LABELS.LB);
    case 'OZ':
    case 'FL_OZ':
      return readGrid(amount, HALVES, UNIT_LABELS[unit]);
    case 'KG':
      return amount < 0.1
        ? readMetric(amount * 1000, UNIT_LABELS.G)
        : readLarge(amount, UNIT_LABELS.KG);
    case 'L':
      return amount < 0.1
        ? readMetric(amount * 1000, UNIT_LABELS.ML)
        : readLarge(amount, UNIT_LABELS.L);
    case 'G':
    case 'ML':
      return readMetric(amount, UNIT_LABELS[unit]);
    case 'PINCH':
      return amount <= 1.25 ? 'a pinch' : readCount(amount, 'pinches');
    case 'EACH':
      return readCount(amount, '');
  }
}

const OUNCES_PER_POUND = 16;

const readPoundsAndOunces = (ounces: number) => {
  const whole = Math.round(ounces);
  const pounds = Math.floor(whole / OUNCES_PER_POUND);
  const rest = whole % OUNCES_PER_POUND;
  const about = isClose(ounces, whole) ? '' : 'about ';
  return `${about}${pounds} ${UNIT_LABELS.LB}${rest === 0 ? '' : ` ${rest} ${UNIT_LABELS.OZ}`}`;
};

const landsOn = (value: number, fractions: number[]) =>
  isClose(value, nearestOnGrid(value, fractions));

const allowsCups = (units: PinchUnitSettings | null) =>
  units === null || units.volume === 'AS_WRITTEN' || units.volume === 'CUPS';

/** The amount in the next unit up when it has outgrown its own and reads cleanly there (6 tsp is 2 tbsp, 16 tbsp is 1 cup, 1500 g is 1.5 kg); cups only for someone who measures in cups. */
export function stepUpAmount(
  amount: number,
  unit: Unit,
  units: PinchUnitSettings | null = null,
): { amount: number; unit: Unit } {
  if (!Number.isFinite(amount) || amount <= 0) return { amount, unit };
  if (unit === 'TSP' && amount >= 3 - EPSILON && landsOn(amount / 3, HALVES)) {
    return stepUpAmount(amount / 3, 'TBSP', units);
  }
  if (
    unit === 'TBSP' &&
    amount >= 4 - EPSILON &&
    allowsCups(units) &&
    landsOn(amount / 16, CUP_FRACTIONS)
  ) {
    return { amount: amount / 16, unit: 'CUP' };
  }
  if (unit === 'G' && amount >= 1000 - EPSILON) {
    return { amount: amount / 1000, unit: 'KG' };
  }
  if (unit === 'ML' && amount >= 1000 - EPSILON) {
    return { amount: amount / 1000, unit: 'L' };
  }
  return { amount, unit };
}

/** A weight in pounds and ounces together, as a scale's lb:oz mode shows it ("2 lb 8 oz", "12 oz"); null for anything that isn't ounces or pounds, or when the person didn't pick that way of weighing. */
export function readScaleWeight(
  amount: number,
  unit: Unit,
  units: PinchUnitSettings | null,
) {
  if (units?.weight !== 'LB_OZ' || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (unit !== 'OZ' && unit !== 'LB') return null;
  const ounces = unit === 'LB' ? amount * OUNCES_PER_POUND : amount;
  return ounces >= OUNCES_PER_POUND - EPSILON
    ? readPoundsAndOunces(ounces)
    : formatKitchenAmount(ounces, 'OZ');
}

/** An amount to read on a recipe, in cooking or on a list: `formatKitchenAmount` after stepping up to the larger unit it has outgrown ("2 tbsp", not "6 tsp"); ounces stay ounces unless the person weighs in pounds and ounces. Never for an answer in a unit the person asked for. */
export function formatReadableAmount(
  amount: number,
  unit: Unit,
  units: PinchUnitSettings | null = null,
) {
  const scale = readScaleWeight(amount, unit, units);
  if (scale !== null) return scale;
  const shown = stepUpAmount(amount, unit, units);
  return formatKitchenAmount(shown.amount, shown.unit);
}
