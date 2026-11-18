import {
  collection,
  doc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { readRejudgeFrom } from '@apps/helm/engine/habitLife';
import { clearRemindersIdle } from '@apps/helm/store/actions/markRemindersChanged';
import { notifyRemindersBack } from '@apps/helm/utils/remindersBackNotice';
import type { HabitCheck } from '@apps/helm/types';
import {
  buildCheckPatch,
  buildTallyPatch,
  buildUncheckPatch,
  buildUntallyPatch,
} from '@apps/helm/utils/habitDayPatch';

const dayRef = (uid: string, dayKey: string) =>
  doc(collection(db, 'apps', 'helm', 'users', uid, 'habitDays'), dayKey);

const habitRef = (uid: string, habitId: string) =>
  doc(collection(db, 'apps', 'helm', 'users', uid, 'habits'), habitId);

/** Adds to a batch writing a habit's day what that day's write means for the habit: a day in a week already judged marks the habit for a re-judge (the earlier week wins), and a check after a long quiet spell ends the idle pause and stamps the change. Says whether reminders came back from idle, for the caller to announce once the batch is committed. */
export const markHabitDay = (
  batch: WriteBatch,
  uid: string,
  dayKey: string,
  habitId: string,
  isCheck: boolean,
) => {
  const habit = store
    .getState()
    .helm.habits.items.find((item) => item.id === habitId);
  const rejudgeFrom = habit
    ? readRejudgeFrom(habit.rejudgeFrom, dayKey, habit.stageWeek)
    : null;
  if (habit && rejudgeFrom !== habit.rejudgeFrom) {
    batch.update(habitRef(uid, habitId), { rejudgeFrom });
  }
  return isCheck && clearRemindersIdle(batch, uid, Date.now());
};

const writeDay = (
  uid: string,
  dayKey: string,
  habitId: string,
  write: (batch: WriteBatch) => void,
  isCheck: boolean,
) => {
  const batch = writeBatch(db);
  write(batch);
  const isBack = markHabitDay(batch, uid, dayKey, habitId, isCheck);
  return batch.commit().then(() => {
    if (isBack) notifyRemindersBack();
  });
};

/** The writes a habit's ticks and tallies make. Each is handed back unawaited by its callers so it works offline; no execution for the person's own taps. */
export const tickHabit = (
  uid: string,
  dayKey: string,
  habitId: string,
  windowId: string,
  check: HabitCheck,
) =>
  writeDay(
    uid,
    dayKey,
    habitId,
    (batch) =>
      batch.set(
        dayRef(uid, dayKey),
        buildCheckPatch(dayKey, habitId, windowId, check),
        { merge: true },
      ),
    true,
  );

export const untickHabit = (
  uid: string,
  dayKey: string,
  habitId: string,
  windowId: string,
) =>
  writeDay(
    uid,
    dayKey,
    habitId,
    (batch) =>
      batch.update(dayRef(uid, dayKey), buildUncheckPatch(habitId, windowId)),
    false,
  );

export const tallyHabit = (
  uid: string,
  dayKey: string,
  habitId: string,
  at: number,
) =>
  writeDay(
    uid,
    dayKey,
    habitId,
    (batch) =>
      batch.set(dayRef(uid, dayKey), buildTallyPatch(dayKey, habitId, at), {
        merge: true,
      }),
    true,
  );

/** Takes one off a tally, never below none: with nothing counted locally there is nothing to take back. */
export const untallyHabit = (
  uid: string,
  dayKey: string,
  habitId: string,
  localCount = 1,
) =>
  localCount < 1
    ? Promise.resolve()
    : writeDay(
        uid,
        dayKey,
        habitId,
        (batch) =>
          batch.set(dayRef(uid, dayKey), buildUntallyPatch(dayKey, habitId), {
            merge: true,
          }),
        false,
      );

/** A day that was never written (an offline first tick not yet synced) has nothing to take away. */
export const isMissingDay = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'not-found';
