import { UNIT_LABELS } from '@apps/pinch/constants';
import type { Unit } from '@apps/pinch/types';

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

const readTeaspoons = (value: number) => {
  if (value < 1 / 16) return 'a pinch';
  return readGrid(
    value,
    value < 1 ? SMALL_SPOON_FRACTIONS : CUP_FRACTIONS,
    UNIT_LABELS.TSP,
  );
};

const readTablespoons = (value: number) => {
  if (value < 1 - EPSILON) return readTeaspoons(value * 3);

  const rounded = nearestOnGrid(value, HALVES);
  if (isClose(value, rounded)) return say(rounded, UNIT_LABELS.TBSP, false);
  if (value < 2) return readTeaspoons(value * 3);
  return say(rounded, UNIT_LABELS.TBSP, true);
};

const readCups = (value: number) => {
  if (value < 1 / 4 - EPSILON) return readTablespoons(value * 16);

  const rounded = nearestOnGrid(value, CUP_FRACTIONS);
  const label = rounded > 1 ? 'cups' : UNIT_LABELS.CUP;
  if (isClose(value, rounded)) return say(rounded, label, false);
  if (value <= 1 / 2) return readTablespoons(value * 16);
  return say(rounded, label, true);
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
      return readCups(amount);
    case 'TBSP':
      return readTablespoons(amount);
    case 'TSP':
      return readTeaspoons(amount);
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
