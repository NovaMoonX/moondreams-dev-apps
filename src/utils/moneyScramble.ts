const MARK = '⁠';
const AXIS_SALT = 0x5eed;
const NEAR = Math.log(1.2);
const FAR = Math.log(2.2);
const STEPS = [100_000, 10_000, 1_000, 100];

let scramble: { seed: number; path: string } | null = null;
let isPaused = false;

const topSegment = (path: string) => `/${path.split('/')[1] ?? ''}`;

/** Turns made-up amounts on for every money formatter (a seed) or off (null), only while the page stays under the current path's first segment; one seed always gives the same amounts. */
export const setMoneyScramble = (seed: number | null) => {
  if (seed === scramble?.seed) return;
  scramble =
    seed === null
      ? null
      : { seed, path: topSegment(globalThis.location?.pathname ?? '/') };
};

// A route left for another app renders once before the provider's cleanup runs; the path check keeps that render real.
const getActiveSeed = () => {
  if (scramble === null || isPaused) return null;
  const path = globalThis.location?.pathname;
  if (path !== undefined && topSegment(path) !== scramble.path) return null;
  return scramble.seed;
};

/** Whether made-up amounts are on for the page as it is now. */
export const isMoneyScrambled = () => getActiveSeed() !== null;

/** Runs `build` with real amounts, for text that is kept (a note written from a reading), never shown as a made-up figure. */
export function withRealMoney<T>(build: () => T): T {
  const wasPaused = isPaused;
  isPaused = true;
  try {
    return build();
  } finally {
    isPaused = wasPaused;
  }
}

/** A new seed for `setMoneyScramble`. */
export const createScrambleSeed = () =>
  Math.floor(Math.random() * 0x7fffffff) + 1;

const unitHash = (seed: number, value: number) => {
  const mixed = [0x85ebca6b, 0xc2b2ae35].reduce(
    (hash, multiplier) => Math.imul(hash ^ (hash >>> 15), multiplier) >>> 0,
    (seed ^ Math.imul(value | 0, 0x9e3779b1) ^ Math.floor(value / 2 ** 32)) >>>
      0,
  );
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 2 ** 32;
};

// Never close to 1, so a made-up figure is never the real one give or take a little.
const toFactor = (unit: number) => {
  const size = NEAR + (FAR - NEAR) * Math.abs(unit * 2 - 1);
  return Math.exp(unit < 0.5 ? -size : size);
};

const roundLike = (cents: number, like: number) => {
  const step =
    STEPS.find((size) => like % size === 0 && cents >= size) ??
    (like % 100 === 0 ? 100 : 1);
  return Math.max(step, Math.round(cents / step) * step);
};

const scale = (cents: number, factor: number) =>
  Math.sign(cents) *
  roundLike(Math.round(Math.abs(cents) * factor), Math.abs(cents));

/** The made-up figure for an amount while made-up amounts are on, else the amount. Each amount is changed on its own, so one known price says nothing about the rest. */
export function scrambleCents(cents: number): number {
  const seed = getActiveSeed();
  if (seed === null || cents === 0) return cents;
  return scale(cents, toFactor(unitHash(seed, Math.abs(cents))));
}

/** Like `scrambleCents` but one factor for every amount, for a chart's axis, so its ticks stay in order. */
export function scrambleAxisCents(cents: number): number {
  const seed = getActiveSeed();
  if (seed === null || cents === 0) return cents;
  return scale(cents, toFactor(unitHash(seed, AXIS_SALT)));
}

/** Tags formatted money while made-up amounts are on (an invisible character), so a write can refuse text that carries one. */
export const markScrambled = (text: string) =>
  getActiveSeed() === null ? text : `${text}${MARK}`;

/** Whether a string (or a JSON payload) holds a made-up amount. */
export const hasScrambledMoney = (text: string) => text.includes(MARK);
