import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';

import { generateUuid } from '@/utils';
import {
  HABIT_NAME_MAX,
  LOCK_SCREEN_NAME_MAX,
  HABIT_NOTES_MAX,
  MEDICINE_DOSE_MAX,
  MEDICINE_NAME_MAX,
} from '@apps/helm/constants';
import { openJson, sealJson } from '@apps/helm/security';
import { markRemindersChanged } from '@apps/helm/store/actions/markRemindersChanged';
import { readParentIndex } from '@apps/helm/store/actions/privacyActions';
import type {
  Habit,
  HabitEventKind,
  HabitHistoryEvent,
  HabitReminder,
  HabitSealed,
  HabitStatus,
  HelmEncryption,
  OpenHabit,
  ReminderPace,
  Sealed,
} from '@apps/helm/types';
import type { fromWhenDraft } from '@apps/helm/utils/habitDraft';
import {
  readEffectivePrivacy,
  readPrivacyFacts,
  type PrivacyFacts,
} from '@apps/helm/utils/privacy';
import { parentsOf } from '@apps/helm/utils/privacyParents';

const HISTORY_MAX = 30;

const habitsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'habits');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

export type HabitEditResult = 'saved' | 'offline' | 'missing' | 'unreadable';

const event = (
  kind: HabitEventKind,
  at: number,
  pace: ReminderPace | null = null,
): HabitHistoryEvent => ({
  kind,
  at,
  by: 'person',
  pace,
  stage: null,
});

const addEvent = (
  history: readonly HabitHistoryEvent[],
  kind: HabitEventKind,
  at: number,
  pace: ReminderPace | null = null,
) => [...history, event(kind, at, pace)].slice(-HISTORY_MAX);

export interface NewHabit {
  name: string;
  emoji: string | null;
  notes: string | null;
  isCare: boolean;
  forWhoId: string | null;
  projectId: string | null;
  /** The habit day it starts on, as UTC midnight. */
  startsOn: number;
  when: ReturnType<typeof fromWhenDraft>;
}

/** Makes a habit from what was typed in the app. The write is handed back unawaited so it works offline; Undo deletes it. */
export async function createHabit(
  uid: string,
  encryption: HelmEncryption,
  input: NewHabit,
) {
  const name = input.name.trim().slice(0, HABIT_NAME_MAX);
  if (!name) throw new Error('A habit needs a name.');
  const now = Date.now();
  const id = generateUuid();
  const habit: Habit = {
    status: 'active',
    cadence: input.when.cadence,
    windowState: input.when.windowState,
    timesPerDay: input.when.timesPerDay,
    projectId: input.projectId,
    forWhoId: input.isCare ? input.forWhoId : null,
    isCare: input.isCare,
    startsOn: input.startsOn,
    endsOn: null,
    pausedUntil: null,
    reminder: null,
    lockScreenName: null,
    stage: input.isCare && input.forWhoId !== null ? null : 'building',
    stageAt: now,
    stageWeek: null,
    rejudgeFrom: null,
    careAskedAt: input.isCare ? now : null,
    medicineAskedAt: null,
    untoldSince: null,
    formedAt: null,
    formedKeptAt: null,
    formedKeptCount: 0,
    formedSummary: null,
    history: [event('started', now)],
    createdBy: 'person',
    sourceCaptureId: null,
    executionId: null,
    createdAt: now,
    lastEditedAt: null,
    pausedAt: null,
    endedAt: null,
    retiredAt: null,
    privacy: input.isCare ? 'private' : 'ordinary',
    sealed: await sealJson<HabitSealed>(
      {
        name,
        emoji: input.emoji,
        notes: input.notes?.trim().slice(0, HABIT_NOTES_MAX) || null,
        medicine: null,
        windows: input.when.windows,
        importance: null,
        privateMark: input.isCare ? 'health' : null,
        isPrivacyCleared: false,
      },
      encryption,
    ),
  };
  const ref = doc(habitsOf(uid), id);
  return { id, written: setDoc(ref, habit), undo: () => deleteDoc(ref) };
}

/** Re-reads a habit in one transaction and writes what `change` makes of it, so anything changed on another device meanwhile is kept. Needs a connection. */
async function editHabit(
  uid: string,
  encryption: HelmEncryption,
  habitId: string,
  change: (
    opened: HabitSealed,
    current: Habit,
  ) => {
    sealed: HabitSealed;
    fields: Partial<Habit>;
    /** True when something a reminder depends on changed: the profile is stamped in the same transaction. */
    isReminderChange?: boolean;
  },
): Promise<HabitEditResult> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(habitsOf(uid), habitId);
  try {
    return await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) return 'missing';
      const current = snapshot.data() as Habit;
      const opened = await openJson<HabitSealed>(
        current.sealed as Sealed,
        encryption,
      ).catch(() => null);
      if (!opened) return 'unreadable';
      const next = change(opened, current);
      const now = Date.now();
      transaction.update(ref, {
        ...next.fields,
        sealed: await sealJson<HabitSealed>(next.sealed, encryption),
        lastEditedAt: now,
      });
      if (next.isReminderChange) markRemindersChanged(transaction, uid, now);
      return 'saved';
    });
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

export interface HabitWords {
  name: string;
  emoji: string | null;
  notes: string | null;
  forWhoId: string | null;
  /** Only a care habit has one; undefined leaves it as it is. */
  medicine?: HabitSealed['medicine'];
}

const toMedicine = (medicine: HabitSealed['medicine']) => {
  const name = medicine?.name.trim().slice(0, MEDICINE_NAME_MAX);
  return name
    ? {
        name,
        dose: medicine?.dose?.trim().slice(0, MEDICINE_DOSE_MAX) || null,
      }
    : null;
};

export const updateHabitWords = (
  uid: string,
  encryption: HelmEncryption,
  habitId: string,
  words: HabitWords,
) =>
  editHabit(uid, encryption, habitId, (opened, current) => ({
    sealed: {
      ...opened,
      name: words.name.trim().slice(0, HABIT_NAME_MAX),
      emoji: words.emoji,
      notes: words.notes?.trim().slice(0, HABIT_NOTES_MAX) || null,
      medicine:
        words.medicine === undefined
          ? opened.medicine
          : toMedicine(words.medicine),
    },
    fields: {
      forWhoId: words.forWhoId,
      lockScreenName:
        current.lockScreenName === null
          ? null
          : words.name.trim().slice(0, LOCK_SCREEN_NAME_MAX),
      medicineAskedAt: toMedicine(words.medicine ?? null)
        ? (current.medicineAskedAt ?? Date.now())
        : current.medicineAskedAt,
    },
    isReminderChange: words.forWhoId !== current.forWhoId,
  }));

/** Answers "Which medicine is it?": the medicine, or null for Not now. Either way it is marked asked, so the question never comes back. Needs a connection. */
export const setHabitMedicine = (
  uid: string,
  encryption: HelmEncryption,
  habitId: string,
  medicine: HabitSealed['medicine'],
) =>
  editHabit(uid, encryption, habitId, (opened, current) => ({
    sealed: { ...opened, medicine: toMedicine(medicine) ?? opened.medicine },
    fields: { medicineAskedAt: current.medicineAskedAt ?? Date.now() },
  }));

export const updateHabitWhen = (
  uid: string,
  encryption: HelmEncryption,
  habitId: string,
  when: ReturnType<typeof fromWhenDraft>,
) =>
  editHabit(uid, encryption, habitId, (opened, current) => ({
    sealed: { ...opened, windows: when.windows },
    fields: {
      cadence: when.cadence,
      windowState: when.windowState,
      timesPerDay: when.timesPerDay,
      ...(JSON.stringify(current.cadence) === JSON.stringify(when.cadence)
        ? {}
        : { history: addEvent(current.history, 'restarted', Date.now()) }),
    },
    isReminderChange: true,
  }));

type ChangedFields = Pick<
  Habit,
  | 'status'
  | 'pausedUntil'
  | 'pausedAt'
  | 'endedAt'
  | 'history'
  | 'reminder'
  | 'lockScreenName'
  | 'stage'
  | 'retiredAt'
  | 'formedSummary'
>;

const readBefore = (habit: OpenHabit): ChangedFields => ({
  status: habit.status,
  pausedUntil: habit.pausedUntil,
  pausedAt: habit.pausedAt,
  endedAt: habit.endedAt,
  history: habit.history,
  reminder: habit.reminder,
  lockScreenName: habit.lockScreenName,
  stage: habit.stage,
  retiredAt: habit.retiredAt,
  formedSummary: habit.formedSummary,
});

/** Writes fields on one habit with the reminder stamp in the same batch, and hands back an Undo that writes back only those fields (and stamps again) while the habit, as the store shows it, still carries this change: its last history entry when it added one, and the values it wrote. 'kept' when something wrote to it since. Plain writes, so both queue offline. */
function changeHabit(
  uid: string,
  habit: OpenHabit,
  fields: Partial<ChangedFields> & Pick<ChangedFields, 'history'>,
  now: number,
) {
  const ref = doc(habitsOf(uid), habit.id);
  const before = readBefore(habit);
  const keys = Object.keys(fields) as (keyof ChangedFields)[];
  const written = fields.history[fields.history.length - 1];
  const isStillThis = (live: OpenHabit) => {
    const last = live.history[live.history.length - 1];
    const isHistoryOk =
      fields.history === before.history ||
      (last?.kind === written?.kind && last?.at === written?.at);
    return (
      isHistoryOk &&
      keys.every(
        (key) =>
          key === 'history' ||
          JSON.stringify(live[key]) === JSON.stringify(fields[key]),
      )
    );
  };
  const batch = writeBatch(db);
  batch.update(ref, { ...fields, lastEditedAt: now });
  markRemindersChanged(batch, uid, now);
  return {
    written: batch.commit(),
    undo: async (): Promise<'undone' | 'kept'> => {
      const live = store
        .getState()
        .helm.habits.items.find((item) => item.id === habit.id);
      if (!live || !isStillThis(live)) return 'kept';
      const undoNow = Date.now();
      const undoBatch = writeBatch(db);
      undoBatch.update(ref, {
        ...Object.fromEntries(keys.map((key) => [key, before[key]])),
        lastEditedAt: undoNow,
      });
      markRemindersChanged(undoBatch, uid, undoNow);
      await undoBatch.commit();
      return 'undone';
    },
  };
}

const eventFor = (
  from: HabitStatus,
  to: 'active' | 'paused' | 'ended',
): HabitEventKind | undefined => {
  if (to === 'paused') return 'paused';
  if (to === 'ended') return 'ended';
  if (from === 'paused') return 'resumed';
  return from === 'ended' ? 'restarted' : undefined;
};

/** Pauses, stops or brings a habit back; its earlier state is kept so Undo can write it. Its ticks and weeks are never touched, and stopping it takes its name off the lock screen. */
export function setHabitStatus(
  uid: string,
  habit: OpenHabit,
  next: 'active' | 'paused' | 'ended',
  pausedUntil: number | null = null,
) {
  const now = Date.now();
  const kind = eventFor(habit.status, next);
  return changeHabit(
    uid,
    habit,
    {
      status: next,
      pausedUntil: next === 'paused' ? pausedUntil : null,
      pausedAt: next === 'paused' ? now : null,
      endedAt: next === 'ended' ? now : null,
      history: kind ? addEvent(habit.history, kind, now) : habit.history,
      ...(next === 'ended' ? { lockScreenName: null } : {}),
    },
    now,
  );
}

export type ReminderChange =
  | { kind: 'on'; pace: ReminderPace }
  | { kind: 'off' }
  | { kind: 'pace'; pace: ReminderPace; isEase?: boolean }
  | { kind: 'quietHours'; isAllowed: boolean };

const turnedOn = (pace: ReminderPace, now: number): HabitReminder => ({
  isOn: true,
  pace,
  anyTimeAt: null,
  allowQuietHours: false,
  turnedOnAt: now,
  easedAt: null,
});

/** What a reminder change writes on the habit. Turning off also takes the name off the lock screen, since nothing is sent to show it on. */
const toReminderFields = (
  habit: OpenHabit,
  change: ReminderChange,
  now: number,
): Pick<ChangedFields, 'history' | 'reminder'> &
  Partial<Pick<ChangedFields, 'lockScreenName'>> => {
  const current = habit.reminder;
  if (change.kind === 'on') {
    return {
      reminder: turnedOn(change.pace, now),
      history: addEvent(habit.history, 'reminderOn', now, change.pace),
    };
  }
  if (!current) {
    return { reminder: current, history: habit.history };
  }
  if (change.kind === 'off') {
    return {
      reminder: { ...current, isOn: false },
      history: addEvent(habit.history, 'reminderOff', now),
      lockScreenName: null,
    };
  }
  if (change.kind === 'quietHours') {
    return {
      reminder: { ...current, allowQuietHours: change.isAllowed },
      history: habit.history,
    };
  }
  return {
    reminder: {
      ...current,
      pace: change.pace,
      easedAt: change.isEase ? now : current.easedAt,
    },
    history: addEvent(habit.history, 'reminderPace', now, change.pace),
  };
};

/** Turns a habit's reminder on or off or changes its pace, in the one batch that stamps the profile. */
export const setHabitReminder = (
  uid: string,
  habit: OpenHabit,
  change: ReminderChange,
) => {
  const now = Date.now();
  return changeHabit(uid, habit, toReminderFields(habit, change, now), now);
};

/** Shows the habit's name on the lock screen (a plain-text copy, kept unsealed) or hides it; each is a history entry. Rename and ending keep it in step elsewhere. */
export const setLockScreenName = (
  uid: string,
  habit: OpenHabit,
  isShown: boolean,
) => {
  const now = Date.now();
  return changeHabit(
    uid,
    habit,
    {
      lockScreenName: isShown
        ? habit.name.slice(0, LOCK_SCREEN_NAME_MAX)
        : null,
      history: addEvent(
        habit.history,
        isShown ? 'nameShown' : 'nameHidden',
        now,
      ),
    },
    now,
  );
};

/** Lets a formed habit go: off Today, its weeks and count kept, its reminders and lock-screen name ended in the same batch. */
export function retireHabit(
  uid: string,
  habit: OpenHabit,
  formedSummary: NonNullable<Habit['formedSummary']>,
) {
  const now = Date.now();
  return changeHabit(
    uid,
    habit,
    {
      status: 'retired',
      retiredAt: now,
      formedSummary,
      reminder: habit.reminder ? { ...habit.reminder, isOn: false } : null,
      lockScreenName: null,
      history: addEvent(habit.history, 'retired', now),
    },
    now,
  );
}

/** "Keep it on Today" on the Formed offer: nothing changes but the offer's back-off, which every device reads from the habit. */
export const keepFormedOnToday = (uid: string, habit: OpenHabit) =>
  updateDoc(doc(habitsOf(uid), habit.id), {
    formedKeptAt: Date.now(),
    formedKeptCount: habit.formedKeptCount + 1,
  });

/** Puts a retired habit back on Today as Formed, with its reminders off. */
export function bringHabitBack(uid: string, habit: OpenHabit) {
  const now = Date.now();
  return changeHabit(
    uid,
    habit,
    {
      status: 'active',
      stage: 'formed',
      retiredAt: null,
      formedSummary: null,
      reminder: habit.reminder ? { ...habit.reminder, isOn: false } : null,
      history: addEvent(habit.history, 'broughtBack', now),
    },
    now,
  );
}

/** "This is medicine or care": on makes the habit care and private; off clears both and stops code marking it again. A habit kept for someone the person looks after stays care. Needs a connection. */
export async function setHabitCare(
  uid: string,
  encryption: HelmEncryption,
  habit: OpenHabit,
  isCare: boolean,
) {
  const parents = parentsOf('habit', habit, readParentIndex()).map(
    (parent) => parent.facts,
  );
  const result = await editHabit(
    uid,
    encryption,
    habit.id,
    (opened, current) => {
      const now = Date.now();
      const facts = readPrivacyFacts(opened);
      const next: PrivacyFacts = isCare
        ? {
            privateMark: facts.privateMark === 'care' ? 'care' : 'health',
            isPrivacyCleared: false,
            isCare: true,
          }
        : { privateMark: null, isPrivacyCleared: true, isCare: false };
      const privacy = readEffectivePrivacy(next, parents);
      return {
        sealed: {
          ...opened,
          privateMark: next.privateMark,
          isPrivacyCleared: next.isPrivacyCleared,
        },
        fields: {
          isCare: next.isCare === true,
          privacy,
          stage: habit.forWhoId !== null ? null : (habit.stage ?? 'building'),
          careAskedAt: isCare ? now : habit.careAskedAt,
          ...(privacy === 'private' && current.lockScreenName !== null
            ? {
                lockScreenName: null,
                history: addEvent(current.history, 'nameHidden', now),
              }
            : {}),
          reminder:
            habit.reminder && isCare && habit.reminder.pace === 'adaptive'
              ? { ...habit.reminder, pace: 'start' }
              : habit.reminder,
        },
        isReminderChange: true,
      };
    },
  );
  return {
    result,
    undo: () => setHabitCare(uid, encryption, habit, !isCare),
  };
}
