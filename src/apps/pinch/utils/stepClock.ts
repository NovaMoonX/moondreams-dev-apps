import {
  MAX_COOK_DURATION_HOURS,
  MAX_RECIPE_STEPS,
} from '@apps/pinch/constants';
import type { CookStepTimes } from '@apps/pinch/types';
import { getStepAnchorText } from '@apps/pinch/utils/notes';

/** Milliseconds spent per place in a cook: the gather screen, or one recipe's step. */
export type StepClockTotals = Record<string, number>;

export interface StepClock {
  totals: StepClockTotals;
  /** Where the time is going now; null while nothing is counted (after Finish). */
  key: string | null;
  since: number;
}

export const GATHER_CLOCK_KEY = 'gather';
const MAX_CLOCK_MS = MAX_COOK_DURATION_HOURS * 3_600_000;
const MAX_CLOCK_KEYS = 1 + 10 * MAX_RECIPE_STEPS;

export const getStepClockKey = (recipeId: string, stepIndex: number) =>
  `${recipeId}:${stepIndex}`;

export const startStepClock = (totals: StepClockTotals): StepClock => ({
  totals,
  key: null,
  since: 0,
});

/** The totals with the time since the current place began added in. */
export const readStepClock = (clock: StepClock, now: number) =>
  clock.key === null
    ? clock.totals
    : {
        ...clock.totals,
        [clock.key]: Math.min(
          MAX_CLOCK_MS,
          (clock.totals[clock.key] ?? 0) + Math.max(0, now - clock.since),
        ),
      };

/** Banks the time spent where the cook was and starts counting at `key`; returning to a place adds to what it already had. */
export const moveStepClock = (
  clock: StepClock,
  key: string | null,
  now: number,
): StepClock => ({ totals: readStepClock(clock, now), key, since: now });

/** A saved clock, or empty when what was saved is not one. */
export const parseStepClock = (value: unknown): StepClockTotals => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' &&
      Number.isFinite(entry[1]) &&
      entry[1] >= 0 &&
      entry[1] <= MAX_CLOCK_MS,
  );
  return entries.length > MAX_CLOCK_KEYS ? {} : Object.fromEntries(entries);
};

/** The whole cook: every place's time added up, so it matches the breakdown and leaves out time the session sat closed. */
export const sumStepClock = (totals: StepClockTotals) =>
  Object.values(totals).reduce((sum, ms) => sum + ms, 0);

const toSeconds = (ms: number | undefined) => Math.round((ms ?? 0) / 1_000);

/** Where one recipe's cook went: the gather time (shared by a plate's recipes) and each step's total, at least 1 for a step shown and 0 only for one never shown. */
export const getCookStepTimes = (
  totals: StepClockTotals,
  recipeId: string,
  steps: string[],
): CookStepTimes => ({
  gatherSeconds: toSeconds(totals[GATHER_CLOCK_KEY]),
  steps: steps.map((step, index) => ({
    text: getStepAnchorText(step),
    seconds:
      getStepClockKey(recipeId, index) in totals
        ? Math.max(1, toSeconds(totals[getStepClockKey(recipeId, index)]))
        : 0,
  })),
});
