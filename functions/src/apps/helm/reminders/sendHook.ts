import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import type { ReminderSendHook } from '../../../notifications/sendScheduledReminders.js';
import {
  dayPartWindows,
  habitDayKey,
  readWindowSpans,
  windowInstants,
  type ClockWindow,
  type DayPart,
} from '../nomos/habitDay.js';
import { lockScreenBody, reminderBody } from '../nomos/habitReminders.js';
import {
  HABITS_READ,
  readClock,
  readDay,
  readHabit,
  readProfile,
  userPath,
  type PlanHabit,
} from './readRecords.js';

const REF_PATTERN = /^([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})$/;

type Ref = { habitId: string; windowId: string };

/** The person a planned reminder belongs to: its one target, who is also its creator. */
const ownerOf = (reminder: DocumentData): string | null => {
  const uids: unknown = reminder.targetUids;
  return Array.isArray(uids) &&
    uids.length === 1 &&
    typeof uids[0] === 'string' &&
    uids[0] === reminder.createdBy
    ? uids[0]
    : null;
};

const refsOf = (reminder: DocumentData): Ref[] | null =>
  Array.isArray(reminder.subjectRefs)
    ? reminder.subjectRefs.slice(0, HABITS_READ * 4).flatMap((ref: unknown) => {
        const match = typeof ref === 'string' ? REF_PATTERN.exec(ref) : null;
        return match ? [{ habitId: match[1], windowId: match[2] }] : [];
      })
    : null;

/** A window holds the fire time when it covers it, or, for a reminder bundled with an earlier one, when it is unchanged since planning and has not closed. */
const isWindowHolding = (
  habit: PlanHabit,
  windowId: string,
  fireAt: number,
  plannedAt: number,
  dayKey: string,
  timeZone: string,
) => {
  if (windowId === 'day')
    return (
      habit.timesPerDay !== null || Object.keys(habit.windowState).length === 0
    );
  if (habit.timesPerDay !== null) return false;
  const span = readWindowSpans(habit, dayKey, timeZone).find(
    (one) => one.id === windowId,
  );
  const editedAt = habit.windowState[windowId]?.editedAt ?? null;
  return (
    span !== undefined &&
    fireAt < span.endAt &&
    (span.startAt <= fireAt || editedAt === null || editedAt <= plannedAt)
  );
};

const partAt = (
  fireAt: number,
  dayKey: string,
  profile: Parameters<typeof dayPartWindows>[0] & { timeZone: string },
): DayPart | null =>
  (Object.entries(dayPartWindows(profile)) as [DayPart, ClockWindow][]).find(
    ([, window]) => {
      const span = windowInstants(dayKey, window, profile.timeZone);
      return span.startAt <= fireAt && fireAt < span.endAt;
    },
  )?.[0] ?? null;

interface Check {
  isIdle: boolean;
  kept: Ref[];
  dayKey: string;
  habits: Map<string, PlanHabit>;
  part: DayPart | null;
  isLive: boolean;
}

/** What is still wanted of a planned reminder as of now. The profile, the habits it names and the one habit day holding its fire time are the only reads, all by path from the reminder's own person. */
const check = async (
  firestore: Firestore,
  reminder: DocumentData,
): Promise<Check | null> => {
  const uid = ownerOf(reminder);
  const refs = refsOf(reminder);
  if (uid === null || refs === null) return null;
  const fireAt = reminder.scheduledFor as number;
  const plannedAt =
    typeof reminder.createdAt === 'number' ? reminder.createdAt : 0;
  const profileSnap = await firestore.doc(userPath(uid)).get();
  if (!profileSnap.exists)
    return {
      isIdle: false,
      kept: [],
      dayKey: '',
      habits: new Map(),
      part: null,
      isLive: false,
    };
  const profile = readProfile(profileSnap.data() ?? {});
  if (refs.length === 0)
    return {
      isIdle: true,
      kept: [],
      dayKey: '',
      habits: new Map(),
      part: null,
      isLive:
        profile.habitRemindersIdleAt !== null &&
        profile.remindersPausedAt === null,
    };
  const { dayKey, timeZone } = readClock(fireAt, profile);
  const allHabitIds = [...new Set(refs.map((ref) => ref.habitId))];
  if (allHabitIds.length > HABITS_READ)
    logger.warn('helm.reminders.habitsTruncated', { who: uid.slice(0, 4) });
  const habitIds = allHabitIds.slice(0, HABITS_READ);
  const [habitSnaps, daySnap] = await Promise.all([
    firestore.getAll(
      ...habitIds.map((id) => firestore.doc(`${userPath(uid)}/habits/${id}`)),
    ),
    firestore
      .doc(`${userPath(uid)}/habitDays/${habitDayKey(fireAt, timeZone)}`)
      .get(),
  ]);
  const habits = new Map(
    habitSnaps.flatMap((snap) =>
      snap.exists
        ? [[snap.id, readHabit(snap.id, snap.data() ?? {}, timeZone)] as const]
        : [],
    ),
  );
  const day = readDay(daySnap.data());
  const kept = refs.filter(({ habitId, windowId }) => {
    const habit = habits.get(habitId);
    if (!habit || habit.status !== 'active' || habit.reminder?.isOn !== true)
      return false;
    if (profile.remindersPausedAt !== null) return false;
    if (!isWindowHolding(habit, windowId, fireAt, plannedAt, dayKey, timeZone))
      return false;
    const entry = day.entries[habitId];
    const status = entry?.checks[windowId]?.status;
    if (status === 'done' || status === 'skipped') return false;
    return !(
      habit.timesPerDay !== null && (entry?.count ?? 0) >= habit.timesPerDay
    );
  });
  const parts = kept.map(
    ({ habitId, windowId }) =>
      habits.get(habitId)?.windowState[windowId]?.part ??
      partAt(fireAt, dayKey, { ...profile, timeZone }),
  );
  return {
    isIdle: false,
    kept,
    dayKey: habitDayKey(fireAt, timeZone),
    habits,
    part:
      parts.length > 0 && parts.every((part) => part === parts[0])
        ? parts[0]
        : null,
    isLive: true,
  };
};

export const helmReminderSendHook: ReminderSendHook = {
  async prepare(firestore, reminder) {
    const stored = {
      title: reminder.title as string,
      body: reminder.body as string,
    };
    const result = await check(firestore, reminder);
    if (result === null) return stored;
    if (!result.isLive) return null;
    if (result.isIdle) return stored;
    if (result.kept.length === 0) return null;
    const left = new Set(result.kept.map((ref) => ref.habitId));
    const names = [...left].sort().flatMap((id) => {
      const name = result.habits.get(id)?.lockScreenName;
      return name ? [name] : [];
    });
    return {
      title: stored.title,
      body:
        names.length > 0
          ? lockScreenBody(names, left.size, result.part)
          : reminderBody({ part: result.part, count: left.size }),
    };
  },

  async settle(firestore, reminder, sentAt) {
    const uid = ownerOf(reminder);
    const result = await check(firestore, reminder);
    if (uid === null || result === null || result.kept.length === 0) return;
    const ref = firestore.doc(`${userPath(uid)}/habitDays/${result.dayKey}`);
    const reminded = result.kept.reduce<Record<string, Record<string, number>>>(
      (all, { habitId, windowId }) => ({
        ...all,
        [habitId]: { ...(all[habitId] ?? {}), [windowId]: sentAt },
      }),
      {},
    );
    await firestore.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (snap.exists) {
        transaction.update(
          ref,
          Object.fromEntries(
            result.kept.map(({ habitId, windowId }) => [
              `entries.${habitId}.reminded.${windowId}`,
              sentAt,
            ]),
          ),
        );
        return;
      }
      transaction.set(ref, {
        date: Date.parse(`${result.dayKey}T00:00:00Z`),
        isInUse: false,
        entries: Object.fromEntries(
          Object.entries(reminded).map(([habitId, windows]) => [
            habitId,
            { reminded: windows },
          ]),
        ),
      });
    });
  },
};
