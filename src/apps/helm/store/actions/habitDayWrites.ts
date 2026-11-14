import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import type { HabitCheck } from '@apps/helm/types';
import {
  buildCheckPatch,
  buildTallyPatch,
  buildUncheckPatch,
  buildUntallyPatch,
} from '@apps/helm/utils/habitDayPatch';

const dayRef = (uid: string, dayKey: string) =>
  doc(collection(db, 'apps', 'helm', 'users', uid, 'habitDays'), dayKey);

/** The writes a habit's ticks and tallies make. Each is handed back unawaited by its callers so it works offline; no execution for the person's own taps. */
export const tickHabit = (
  uid: string,
  dayKey: string,
  habitId: string,
  windowId: string,
  check: HabitCheck,
) =>
  setDoc(
    dayRef(uid, dayKey),
    buildCheckPatch(dayKey, habitId, windowId, check),
    { merge: true },
  );

export const untickHabit = (
  uid: string,
  dayKey: string,
  habitId: string,
  windowId: string,
) => updateDoc(dayRef(uid, dayKey), buildUncheckPatch(habitId, windowId));

export const tallyHabit = (
  uid: string,
  dayKey: string,
  habitId: string,
  at: number,
) =>
  setDoc(dayRef(uid, dayKey), buildTallyPatch(dayKey, habitId, at), {
    merge: true,
  });

export const untallyHabit = (uid: string, dayKey: string, habitId: string) =>
  setDoc(dayRef(uid, dayKey), buildUntallyPatch(dayKey, habitId), {
    merge: true,
  });
