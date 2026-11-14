import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils';
import { HABIT_NAME_MAX, HABIT_NOTES_MAX } from '@apps/helm/constants';
import { openJson, sealJson } from '@apps/helm/security';
import { readParentIndex } from '@apps/helm/store/actions/privacyActions';
import type {
  Habit,
  HabitEventKind,
  HabitHistoryEvent,
  HabitSealed,
  HabitStatus,
  HelmEncryption,
  OpenHabit,
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

const event = (kind: HabitEventKind, at: number): HabitHistoryEvent => ({
  kind,
  at,
  by: 'person',
  pace: null,
  stage: null,
});

const addEvent = (
  history: readonly HabitHistoryEvent[],
  kind: HabitEventKind,
  at: number,
) => [...history, event(kind, at)].slice(-HISTORY_MAX);

export interface NewHabit {
  name: string;
  emoji: string | null;
  notes: string | null;
  isCare: boolean;
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
    projectId: null,
    forWhoId: null,
    isCare: input.isCare,
    startsOn: input.startsOn,
    endsOn: null,
    pausedUntil: null,
    reminder: null,
    lockScreenName: null,
    stage: input.isCare ? null : 'building',
    stageAt: now,
    stageWeek: null,
    rejudgeFrom: null,
    careAskedAt: input.isCare ? now : null,
    untoldSince: null,
    formedAt: null,
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
      transaction.update(ref, {
        ...next.fields,
        sealed: await sealJson<HabitSealed>(next.sealed, encryption),
        lastEditedAt: Date.now(),
      });
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
}

export const updateHabitWords = (
  uid: string,
  encryption: HelmEncryption,
  habitId: string,
  words: HabitWords,
) =>
  editHabit(uid, encryption, habitId, (opened) => ({
    sealed: {
      ...opened,
      name: words.name.trim().slice(0, HABIT_NAME_MAX),
      emoji: words.emoji,
      notes: words.notes?.trim().slice(0, HABIT_NOTES_MAX) || null,
    },
    fields: {},
  }));

export const updateHabitWhen = (
  uid: string,
  encryption: HelmEncryption,
  habitId: string,
  when: ReturnType<typeof fromWhenDraft>,
) =>
  editHabit(uid, encryption, habitId, (opened) => ({
    sealed: { ...opened, windows: when.windows },
    fields: {
      cadence: when.cadence,
      windowState: when.windowState,
      timesPerDay: when.timesPerDay,
    },
  }));

type StatusFields = Pick<
  Habit,
  'status' | 'pausedUntil' | 'pausedAt' | 'endedAt' | 'history'
>;

const readStatusFields = (habit: OpenHabit): StatusFields => ({
  status: habit.status,
  pausedUntil: habit.pausedUntil,
  pausedAt: habit.pausedAt,
  endedAt: habit.endedAt,
  history: habit.history,
});

const eventFor = (
  from: HabitStatus,
  to: 'active' | 'paused' | 'ended',
): HabitEventKind | undefined => {
  if (to === 'paused') return 'paused';
  if (to === 'ended') return 'ended';
  if (from === 'paused') return 'resumed';
  return from === 'ended' ? 'restarted' : undefined;
};

/** Pauses, stops or brings a habit back; its earlier state is kept so Undo can write it. Its ticks and weeks are never touched. */
export function setHabitStatus(
  uid: string,
  habit: OpenHabit,
  next: 'active' | 'paused' | 'ended',
  pausedUntil: number | null = null,
) {
  const now = Date.now();
  const kind = eventFor(habit.status, next);
  const ref = doc(habitsOf(uid), habit.id);
  const before = readStatusFields(habit);
  const fields: StatusFields = {
    status: next,
    pausedUntil: next === 'paused' ? pausedUntil : null,
    pausedAt: next === 'paused' ? now : null,
    endedAt: next === 'ended' ? now : null,
    history: kind ? addEvent(habit.history, kind, now) : habit.history,
  };
  return {
    written: updateDoc(ref, { ...fields, lastEditedAt: now }),
    undo: () => updateDoc(ref, { ...before, lastEditedAt: Date.now() }),
  };
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
  const result = await editHabit(uid, encryption, habit.id, (opened) => {
    const facts = readPrivacyFacts(opened);
    const next: PrivacyFacts = isCare
      ? {
          privateMark: facts.privateMark === 'care' ? 'care' : 'health',
          isPrivacyCleared: false,
          isCare: true,
        }
      : { privateMark: null, isPrivacyCleared: true, isCare: false };
    return {
      sealed: {
        ...opened,
        privateMark: next.privateMark,
        isPrivacyCleared: next.isPrivacyCleared,
      },
      fields: {
        isCare: next.isCare === true,
        privacy: readEffectivePrivacy(next, parents),
        stage: isCare ? null : (habit.stage ?? 'building'),
        careAskedAt: isCare ? Date.now() : habit.careAskedAt,
      },
    };
  });
  return {
    result,
    undo: () => setHabitCare(uid, encryption, habit, !isCare),
  };
}
