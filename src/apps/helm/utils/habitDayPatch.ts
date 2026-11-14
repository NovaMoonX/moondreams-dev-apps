import { deleteField, increment } from 'firebase/firestore';

import type { HabitCheck } from '@apps/helm/types';

const toDate = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);

/** A tick, or a "not today": a merge that creates the day when it is missing and lands beside another device's tick in a different window. */
export const buildCheckPatch = (
  dayKey: string,
  habitId: string,
  windowId: string,
  check: HabitCheck,
) => ({
  date: toDate(dayKey),
  isInUse: true,
  entries: { [habitId]: { checks: { [windowId]: check } } },
});

/** One more on a tally: an increment, so two devices adding at once make two. */
export const buildTallyPatch = (
  dayKey: string,
  habitId: string,
  at: number,
) => ({
  date: toDate(dayKey),
  isInUse: true,
  entries: {
    [habitId]: { count: increment(1), lastCountAt: at },
  },
});

/** One fewer on a tally, for Undo. */
export const buildUntallyPatch = (dayKey: string, habitId: string) => ({
  date: toDate(dayKey),
  entries: { [habitId]: { count: increment(-1) } },
});

/** Takes one check away; written with an update so no other window is touched. */
export const buildUncheckPatch = (habitId: string, windowId: string) => ({
  [`entries.${habitId}.checks.${windowId}`]: deleteField(),
});
