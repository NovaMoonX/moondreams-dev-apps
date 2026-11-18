import {
  collection,
  doc,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { runHeldTransaction } from '@apps/helm/store/actions/heldTransaction';

import { store } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson, sealJson } from '@apps/helm/security';
import { addEvent } from '@apps/helm/store/actions/habitActions';
import { markRemindersChanged } from '@apps/helm/store/actions/markRemindersChanged';
import { keepInheritedPrivate } from '@apps/helm/store/actions/privacyActions';
import {
  createProject,
  setProjectStatus,
} from '@apps/helm/store/actions/projectActions';
import type {
  OpenHabit,
  OpenProject,
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

/** The why as the person's words leave it, or null for empty words. */
export const whyFromText = (previous: GoalWhy | null, text: string | null) => {
  const words = text?.trim().slice(0, WHY_VERBATIM_CAP) ?? '';
  return words ? nextWhyFromWords(previous, words, Date.now(), null) : null;
};
const toWhy = whyFromText;

const goalHabitsOf = (projectId: string) =>
  store
    .getState()
    .helm.habits.items.filter((habit) => habit.projectId === projectId);

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
  await runHeldTransaction(uid, async (transaction) => {
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

/** Starts a goal: a project of kind goal with the person's why kept word for word. The write is handed back unawaited so it works offline; Undo deletes the goal. */
export async function createGoal(
  uid: string,
  input: { name: string; emoji: string | null; whyText: string | null },
) {
  return createProject(uid, await getHelmEncryption(uid), {
    name: input.name,
    emoji: input.emoji,
    objective: null,
    targetDate: null,
    kind: 'goal',
    why: toWhy(null, input.whyText),
  });
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

const WRITES_MAX = 399;
const TRANSACTION_MAX = 400;

interface Op {
  ref: DocumentReference;
  data: DocumentData | null;
}

const toGroups = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

/** Fires the writes in batches of at most 399 (the reminders stamp makes 400) without waiting for the server, so it works offline; the promise settles when every batch is accepted. */
const commitOps = (uid: string, ops: Op[], now: number) =>
  Promise.all(
    toGroups(ops, WRITES_MAX).map((group) => {
      const batch = writeBatch(db);
      group.forEach((op) =>
        op.data === null
          ? batch.delete(op.ref)
          : batch.update(op.ref, { ...op.data, lastEditedAt: now }),
      );
      markRemindersChanged(batch, uid, now);
      return batch.commit();
    }),
  ).then(() => undefined);

const quick = (uid: string, forward: Op[], back: Op[], now: number) => ({
  written: commitOps(uid, forward, now),
  undo: () => commitOps(uid, back, Date.now()),
});

interface RestoreStep {
  ref: DocumentReference;
  make: (
    live: DocumentSnapshot,
  ) => { mode: 'set' | 'update'; data: DocumentData } | null;
}

const restoreSteps = (uid: string, steps: RestoreStep[]) =>
  toGroups(steps, TRANSACTION_MAX).reduce(
    (chain, group) =>
      chain.then(() =>
        runHeldTransaction(uid, async (transaction) => {
          const live = await Promise.all(
            group.map((step) => transaction.get(step.ref)),
          );
          const undoNow = Date.now();
          group.forEach((step, at) => {
            const made = step.make(live[at]);
            if (!made) return;
            const data = { ...made.data, lastEditedAt: undoNow };
            if (made.mode === 'set') transaction.set(step.ref, data);
            else transaction.update(step.ref, data);
          });
          markRemindersChanged(transaction, uid, undoNow);
        }),
      ),
    Promise.resolve(),
  );

const guardedBack = (
  ref: DocumentReference,
  data: DocumentData,
  now: number,
): RestoreStep => ({
  ref,
  make: (live) =>
    live.exists() && live.data()?.lastEditedAt === now
      ? { mode: 'update', data }
      : null,
});

const pausedBy = (habit: OpenHabit, goalPausedAt: number) =>
  habit.status === 'paused' &&
  habit.history.filter((entry) => entry.kind === 'paused').at(-1)?.at ===
    goalPausedAt;

const pauseFields = (habit: OpenHabit) => ({
  status: habit.status,
  pausedAt: habit.pausedAt,
  pausedUntil: habit.pausedUntil,
  history: habit.history,
});

const projectPauseFields = (project: OpenProject | undefined) => ({
  status: project?.status ?? 'active',
  pausedAt: project?.pausedAt ?? null,
  pausedUntil: project?.pausedUntil ?? null,
});

const asideOf = (project: OpenProject | undefined) =>
  project?.status === 'paused' ? project.pausedAt : null;

const resumedHabits = (
  habits: OpenHabit[],
  goalPausedAt: number | null,
  now: number,
) =>
  habits
    .filter((habit) => goalPausedAt !== null && pausedBy(habit, goalPausedAt))
    .map((habit) => ({
      habit,
      forward: {
        status: 'active',
        pausedAt: null,
        pausedUntil: null,
        history: addEvent(habit.history, 'resumed', now),
      },
    }));

/** Sets a goal aside: the project pauses and so does each active habit in it (one whose words can't be read too), in one batch, so a pause the person made themselves is never mistaken for this one. A goal already aside is left as it is. Undo puts every field back. */
export function setGoalAside(uid: string, projectId: string) {
  const project = openProjectOf(projectId);
  if (project?.status === 'paused') {
    return { written: Promise.resolve(), undo: () => Promise.resolve() };
  }
  const now = Date.now();
  const habits = goalHabitsOf(projectId).filter(
    (habit) =>
      habit.status === 'active' ||
      (habit.status === 'paused' &&
        habit.pausedUntil !== null &&
        habit.pausedUntil <= now),
  );
  return quick(
    uid,
    [
      {
        ref: projectRef(uid, projectId),
        data: { status: 'paused', pausedAt: now, pausedUntil: null },
      },
      ...habits.map((habit) => ({
        ref: habitRef(uid, habit.id),
        data: {
          status: 'paused',
          pausedAt: now,
          pausedUntil: null,
          history: addEvent(habit.history, 'paused', now),
        },
      })),
    ],
    [
      { ref: projectRef(uid, projectId), data: projectPauseFields(project) },
      ...habits.map((habit) => ({
        ref: habitRef(uid, habit.id),
        data: pauseFields(habit),
      })),
    ],
    now,
  );
}

const pickUpOps = (
  uid: string,
  projectId: string,
  projectFields: Record<string, unknown>,
  now: number,
) => {
  const project = openProjectOf(projectId);
  const resumed = resumedHabits(goalHabitsOf(projectId), asideOf(project), now);
  const ref = projectRef(uid, projectId);
  return {
    forward: [
      { ref, data: projectFields },
      ...resumed.map((entry) => ({
        ref: habitRef(uid, entry.habit.id),
        data: entry.forward,
      })),
    ],
    back: [
      { ref, data: { ...projectPauseFields(project), finishedAt: null } },
      ...resumed.map((entry) => ({
        ref: habitRef(uid, entry.habit.id),
        data: pauseFields(entry.habit),
      })),
    ],
  };
};

/** Picks a goal back up, resuming only the habits its pause paused. Undo sets it aside again exactly as it was. */
export function pickGoalBackUp(uid: string, projectId: string) {
  const now = Date.now();
  const { forward, back } = pickUpOps(
    uid,
    projectId,
    { status: 'active', pausedAt: null, pausedUntil: null },
    now,
  );
  return quick(uid, forward, back, now);
}

/** Finishes or reopens a goal. Finishing one that is set aside picks it up in the same batch first, so its paused habits resume instead of staying paused under a finished goal. */
export function setGoalStatus(
  uid: string,
  project: OpenProject,
  next: 'active' | 'finished',
) {
  if (next !== 'finished' || project.status !== 'paused') {
    return setProjectStatus(uid, project, next);
  }
  const now = Date.now();
  const { forward, back } = pickUpOps(
    uid,
    project.id,
    { status: 'finished', finishedAt: now, pausedAt: null, pausedUntil: null },
    now,
  );
  return quick(uid, forward, back, now);
}

const isNamed = (habit: OpenHabit) =>
  !habit.isUnreadable && habit.status !== 'ended';

/** What a goal's change does to its habits. "Keep" unlinks the ones still going (resuming those the goal's pause paused) and unlinks stopped ones; "delete" removes the ones the choice sheet names and treats the rest (stopped, or unreadable here) as "keep". */
interface HabitPlan {
  ref: DocumentReference;
  forward: DocumentData | null;
  step: RestoreStep;
}

async function planHabits(
  uid: string,
  projectId: string,
  choice: 'keep' | 'delete',
  goalPausedAt: number | null,
  now: number,
) {
  const found = goalHabitsOf(projectId);
  const raws =
    choice === 'delete' && found.some(isNamed)
      ? new Map<string, DocumentData>(
          (
            await getDocs(
              query(
                collection(userOf(uid), 'habits'),
                where('projectId', '==', projectId),
              ),
            )
          ).docs.map((entry) => [entry.id, entry.data()]),
        )
      : new Map<string, DocumentData>();
  const resumed = new Map(
    resumedHabits(found, goalPausedAt, now).map((entry) => [
      entry.habit.id,
      entry.forward,
    ]),
  );
  const acted = found.flatMap((habit): HabitPlan[] => {
    const ref = habitRef(uid, habit.id);
    if (choice === 'delete' && isNamed(habit)) {
      const raw = raws.get(habit.id);
      const step: RestoreStep = {
        ref,
        make: (live) =>
          live.exists() || !raw ? null : { mode: 'set', data: raw },
      };
      return [{ ref, forward: null, step }];
    }
    if (habit.status === 'ended') {
      return [
        {
          ref,
          forward: { projectId: null },
          step: guardedBack(ref, { projectId }, now),
        },
      ];
    }
    return [
      {
        ref,
        forward: { projectId: null, ...resumed.get(habit.id) },
        step: guardedBack(ref, { projectId, ...pauseFields(habit) }, now),
      },
    ];
  });
  return {
    ops: acted.map((entry): Op => ({ ref: entry.ref, data: entry.forward })),
    steps: acted.map((entry) => entry.step),
  };
}

/** Makes a goal an ordinary project again, in one batch with what happens to its habits. A goal that was set aside is picked up too (its paused habits resume when they are kept), since a paused plain project has nowhere to show. Its why stays sealed in place. Undo puts the goal, its pause and its habits back. */
export async function turnIntoProject(
  uid: string,
  projectId: string,
  habits: 'keep' | 'delete',
) {
  const now = Date.now();
  const project = openProjectOf(projectId);
  const plan = await planHabits(uid, projectId, habits, asideOf(project), now);
  const ref = projectRef(uid, projectId);
  return {
    written: commitOps(
      uid,
      [
        {
          ref,
          data: {
            kind: 'project',
            ...(project?.status === 'paused'
              ? { status: 'active', pausedAt: null, pausedUntil: null }
              : {}),
          },
        },
        ...plan.ops,
      ],
      now,
    ),
    undo: () =>
      restoreSteps(uid, [
        guardedBack(ref, { kind: 'goal', ...projectPauseFields(project) }, now),
        ...plan.steps,
      ]),
  };
}

/** Deletes a goal in one batch with its habits' settling and its tasks' link to it (chunked at 400 writes). Restore puts the goal back first (and stops there if it exists again), then the tasks' link and the habits. */
export async function deleteGoal(
  uid: string,
  projectId: string,
  habits: 'keep' | 'delete',
) {
  await keepInheritedPrivate(uid, 'project', projectId);
  const now = Date.now();
  const ref = projectRef(uid, projectId);
  const [raw, tasks] = await Promise.all([
    getDoc(ref),
    getDocs(
      query(
        collection(userOf(uid), 'tasks'),
        where('projectId', '==', projectId),
      ),
    ),
  ]);
  if (!raw.exists()) throw new Error('This goal is already gone.');
  const plan = await planHabits(
    uid,
    projectId,
    habits,
    asideOf(openProjectOf(projectId)),
    now,
  );
  const project = raw.data();
  return {
    written: commitOps(
      uid,
      [
        { ref, data: null },
        ...tasks.docs.map((entry): Op => ({
          ref: entry.ref,
          data: { projectId: null },
        })),
        ...plan.ops,
      ],
      now,
    ),
    restore: async (): Promise<'restored' | 'exists'> => {
      const isBack = await runHeldTransaction(uid, async (transaction) => {
        if ((await transaction.get(ref)).exists()) return false;
        transaction.set(ref, { ...project, lastEditedAt: Date.now() });
        return true;
      });
      if (!isBack) return 'exists';
      await restoreSteps(uid, [
        ...tasks.docs.map((entry): RestoreStep => ({
          ref: entry.ref,
          make: (live) =>
            live.exists() && live.data()?.projectId === null
              ? { mode: 'update', data: { projectId } }
              : null,
        })),
        ...plan.steps,
      ]);
      return 'restored';
    },
  };
}
