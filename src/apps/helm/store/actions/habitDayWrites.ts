import {
  collection,
  doc,
  updateDoc,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { readRejudgeFrom } from '@apps/helm/engine/habitLife';
import { clearRemindersIdle } from '@apps/helm/store/actions/markRemindersChanged';
import { notifyRemindersBack } from '@apps/helm/utils/remindersBackNotice';
import type { HabitCheck } from '@apps/helm/types';
import { toDayKey } from '@apps/helm/utils/planDays';
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

/** Marks a past day's summary so it is written again when that day next opens. Best effort: a missing summary or a failure never touches the tick. */
const markSummaryStale = async (uid: string, dayKey: string) => {
  const timeZone =
    store.getState().helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  const now = Date.now();
  if (dayKey >= toDayKey(now, timeZone)) return;
  if (dayKey < toDayKey(now - 30 * 24 * 60 * 60 * 1000, timeZone)) return;
  await updateDoc(
    doc(db, 'apps', 'helm', 'users', uid, 'daySummaries', dayKey),
    { staleAt: now },
  ).catch(() => undefined);
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
    void markSummaryStale(uid, dayKey);
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
