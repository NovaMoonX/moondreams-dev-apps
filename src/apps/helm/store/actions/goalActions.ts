import {
  collection,
  doc,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import { addEvent } from '@apps/helm/store/actions/habitActions';
import { markRemindersChanged } from '@apps/helm/store/actions/markRemindersChanged';
import {
  createProject,
  deleteProject,
} from '@apps/helm/store/actions/projectActions';
import type {
  OpenHabit,
  Project,
  ProjectSealed,
  Sealed,
} from '@apps/helm/types';
import {
  nextWhyFromWords,
  WHY_VERBATIM_CAP,
  type GoalWhy,
  type WhyCleanedState,
} from '@apps/helm/utils/goalWhy';

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);
const projectRef = (uid: string, projectId: string) =>
  doc(collection(userOf(uid), 'projects'), projectId);
const habitRef = (uid: string, habitId: string) =>
  doc(collection(userOf(uid), 'habits'), habitId);

const toWhy = (previous: GoalWhy | null, text: string | null) => {
  const words = text?.trim().slice(0, WHY_VERBATIM_CAP) ?? '';
  return words ? nextWhyFromWords(previous, words, Date.now(), null) : null;
};

const goalHabitsOf = (projectId: string) =>
  store
    .getState()
    .helm.habits.items.filter(
      (habit) => habit.projectId === projectId && !habit.isUnreadable,
    );

const openProjectOf = (projectId: string) =>
  store.getState().helm.projects.items.find((item) => item.id === projectId);

/** Re-reads a project in one transaction and reseals what `change` makes of its words, so anything changed on another device meanwhile is kept. Needs a connection. */
async function changeSealed(
  uid: string,
  projectId: string,
  change: (opened: ProjectSealed) => ProjectSealed,
) {
  const encryption = await getHelmEncryption(uid);
  const ref = projectRef(uid, projectId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('This goal is already gone.');
    const opened = await openJson<ProjectSealed>(
      (snapshot.data() as Project).sealed as Sealed,
      encryption,
    );
    transaction.update(ref, {
      sealed: await sealJson<ProjectSealed>(change(opened), encryption),
      lastEditedAt: Date.now(),
    });
  });
}

/** Starts a goal: a project of kind goal with the person's why kept word for word. */
export async function createGoal(
  uid: string,
  input: { name: string; emoji: string | null; whyText: string | null },
): Promise<string> {
  const made = await createProject(uid, await getHelmEncryption(uid), {
    name: input.name,
    emoji: input.emoji,
    objective: null,
    targetDate: null,
    kind: 'goal',
    why: toWhy(null, input.whyText),
  });
  await made.written;
  return made.id;
}

/** Sets the why to the person's new words: a tidied version made from the old words is dropped, and empty words clear the why. */
export const editGoalWhy = (
  uid: string,
  projectId: string,
  whyText: string | null,
) =>
  changeSealed(uid, projectId, (opened) => ({
    ...opened,
    why: toWhy(opened.why ?? null, whyText),
  }));

/** Takes or leaves Helm's tidied version; the person's words are never touched. */
export const setWhyChoice = (
  uid: string,
  projectId: string,
  choice: Extract<WhyCleanedState, 'accepted' | 'declined'>,
) =>
  changeSealed(uid, projectId, (opened) => ({
    ...opened,
    why:
      opened.why && opened.why.cleaned !== null
        ? { ...opened.why, cleanedState: choice }
        : (opened.why ?? null),
  }));

const pausedBy = (habit: OpenHabit, goalPausedAt: number) =>
  habit.status === 'paused' &&
  habit.history.filter((entry) => entry.kind === 'paused').at(-1)?.at ===
    goalPausedAt;

/** Sets a goal aside: the project pauses and so does each active habit in it, in one batch, so a pause the person made themselves is never mistaken for this one. */
export async function setGoalAside(uid: string, projectId: string) {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(projectRef(uid, projectId), {
    status: 'paused',
    pausedAt: now,
    pausedUntil: null,
    lastEditedAt: now,
  });
  goalHabitsOf(projectId)
    .filter((habit) => habit.status === 'active')
    .forEach((habit) =>
      batch.update(habitRef(uid, habit.id), {
        status: 'paused',
        pausedAt: now,
        pausedUntil: null,
        history: addEvent(habit.history, 'paused', now),
        lastEditedAt: now,
      }),
    );
  markRemindersChanged(batch, uid, now);
  await batch.commit();
}

/** Picks a goal back up, resuming only the habits its pause paused. */
export async function pickGoalBackUp(uid: string, projectId: string) {
  const goalPausedAt = openProjectOf(projectId)?.pausedAt ?? null;
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(projectRef(uid, projectId), {
    status: 'active',
    pausedAt: null,
    pausedUntil: null,
    lastEditedAt: now,
  });
  goalHabitsOf(projectId)
    .filter((habit) => goalPausedAt !== null && pausedBy(habit, goalPausedAt))
    .forEach((habit) =>
      batch.update(habitRef(uid, habit.id), {
        status: 'active',
        pausedAt: null,
        pausedUntil: null,
        history: addEvent(habit.history, 'resumed', now),
        lastEditedAt: now,
      }),
    );
  markRemindersChanged(batch, uid, now);
  await batch.commit();
}

/** Keeps a goal's habits as habits of their own, or deletes them; ended ones are included either way, and reminders are re-planned. */
async function settleHabits(
  uid: string,
  projectId: string,
  habits: 'keep' | 'delete',
) {
  const found = goalHabitsOf(projectId);
  if (found.length === 0) return;
  const now = Date.now();
  const batch = writeBatch(db);
  found.forEach((habit) =>
    habits === 'delete'
      ? batch.delete(habitRef(uid, habit.id))
      : batch.update(habitRef(uid, habit.id), {
          projectId: null,
          lastEditedAt: now,
        }),
  );
  markRemindersChanged(batch, uid, now);
  await batch.commit();
}

/** Makes a goal an ordinary project again. Its why stays sealed in place, so turning it back loses nothing. */
export async function turnIntoProject(
  uid: string,
  projectId: string,
  habits: 'keep' | 'delete',
) {
  await settleHabits(uid, projectId, habits);
  await updateDoc(projectRef(uid, projectId), {
    kind: 'project',
    lastEditedAt: Date.now(),
  });
}

/** Deletes a goal and its tasks' link to it; the project goes first, so a failure leaves the habits as they were. */
export async function deleteGoal(
  uid: string,
  projectId: string,
  habits: 'keep' | 'delete',
) {
  await deleteProject(uid, projectId);
  await settleHabits(uid, projectId, habits);
}
