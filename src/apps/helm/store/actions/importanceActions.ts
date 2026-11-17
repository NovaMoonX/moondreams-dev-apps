import { collection, doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  applyImportance,
  readImportanceOrder,
  readUnderGoalIds,
  withPlaceChanges,
  type ApplyResult,
  type ImportanceCommand,
  type ImportancePlace,
  type ImportanceRelation,
} from '@apps/helm/engine/importance';
import { sealJson } from '@apps/helm/security';
import { selectImportanceItems } from '@apps/helm/store/selectors/importanceSelectors';
import type {
  HabitSealed,
  HelmEncryption,
  OpenHabit,
  OpenProject,
  ProjectSealed,
} from '@apps/helm/types';

const BATCH_MAX = 399;

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

const toGroups = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const projectOf = (id: string): OpenProject | undefined =>
  store
    .getState()
    .helm.projects.items.find((item) => item.id === id && !item.isUnreadable);

const habitOf = (id: string): OpenHabit | undefined =>
  store
    .getState()
    .helm.habits.items.find((item) => item.id === id && !item.isUnreadable);

const projectSealed = (
  project: OpenProject,
  importance: ImportancePlace | null,
): ProjectSealed => ({
  name: project.name,
  emoji: project.emoji,
  objective: project.objective,
  milestones: project.milestones,
  why: project.why,
  roleNotes: project.roleNotes,
  importance,
  privateMark: project.privateMark,
  isPrivacyCleared: project.isPrivacyCleared,
  quietMark: project.quietMark,
  quietUntil: project.quietUntil,
  isQuietCleared: project.isQuietCleared,
});

const habitSealed = (
  habit: OpenHabit,
  importance: ImportancePlace | null,
): HabitSealed => ({
  name: habit.name,
  emoji: habit.emoji,
  notes: habit.notes,
  medicine: habit.medicine,
  windows: habit.windows,
  importance,
  privateMark: habit.privateMark,
  isPrivacyCleared: habit.isPrivacyCleared,
});

interface Write {
  id: string;
  place: ImportancePlace | null;
}

/** Reseals each thing from the copy this device holds, so the write never waits for the server and works offline. */
async function commit(
  uid: string,
  writes: Write[],
  encryption: HelmEncryption,
): Promise<void> {
  const now = Date.now();
  const sealed = await Promise.all(
    writes.flatMap(({ id, place }) => {
      const project = projectOf(id);
      if (project) {
        return [
          sealJson<ProjectSealed>(
            projectSealed(project, place),
            encryption,
          ).then((payload) => ({
            ref: doc(collection(userOf(uid), 'projects'), id),
            payload,
          })),
        ];
      }
      const habit = habitOf(id);
      return habit
        ? [
            sealJson<HabitSealed>(habitSealed(habit, place), encryption).then(
              (payload) => ({
                ref: doc(collection(userOf(uid), 'habits'), id),
                payload,
              }),
            ),
          ]
        : [];
    }),
  );
  await Promise.all(
    toGroups(sealed, BATCH_MAX).map((group) => {
      const batch = writeBatch(db);
      group.forEach(({ ref, payload }) =>
        batch.update(ref, { sealed: payload, lastEditedAt: now }),
      );
      return batch.commit();
    }),
  );
}

/** What this device has written and the store may not show yet, so a second move reads the first one's result. Dropped once the server has it, and kept per person so another sign-in never reads it. */
const unsyncedByUid = new Map<string, Map<string, ImportancePlace | null>>();

const unsyncedFor = (uid: string) => {
  const kept = unsyncedByUid.get(uid);
  if (kept) return kept;
  unsyncedByUid.clear();
  const fresh = new Map<string, ImportancePlace | null>();
  unsyncedByUid.set(uid, fresh);
  return fresh;
};

/** One action at a time: a move reads the order the one before it left. */
const queue = { tail: Promise.resolve() };

const inTurn = <T>(run: () => Promise<T>): Promise<T> => {
  const next = queue.tail.then(run);
  queue.tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
};

const currentItems = (uid: string) =>
  withPlaceChanges(
    selectImportanceItems(store.getState()),
    [...unsyncedFor(uid)].map(([id, place]) => ({ id, place })),
  );

const placeNow = (uid: string, id: string): ImportancePlace | null => {
  const unsynced = unsyncedFor(uid);
  return unsynced.has(id)
    ? (unsynced.get(id) ?? null)
    : (projectOf(id)?.importance ?? habitOf(id)?.importance ?? null);
};

const write = (
  uid: string,
  writes: Write[],
  encryption: HelmEncryption,
): Promise<void> => {
  const unsynced = unsyncedFor(uid);
  writes.forEach(({ id, place }) => unsynced.set(id, place));
  const written = commit(uid, writes, encryption);
  const settle = () =>
    writes.forEach(({ id, place }) => {
      if (unsynced.get(id) === place) unsynced.delete(id);
    });
  written.then(settle, settle);
  return written;
};

export type ImportanceResult =
  | {
      kind: 'written';
      /** Settles when the server has the change; never awaited by the caller, so an offline change shows at once. */
      written: Promise<void>;
      /** Puts every thing it moved back to the place it held. */
      undo: () => Promise<void>;
    }
  | { kind: 'unchanged' }
  | { kind: 'refused'; id: string }
  | { kind: 'missing' };

const toResult = (
  uid: string,
  encryption: HelmEncryption,
  applied: Extract<ApplyResult, { kind: 'applied' }>,
): ImportanceResult => {
  const before = applied.changes.map(({ id }): Write => ({
    id,
    place: placeNow(uid, id),
  }));
  return {
    kind: 'written',
    written: write(uid, applied.changes, encryption),
    undo: () => write(uid, before, encryption),
  };
};

/** Applies one relation to the order as it stands and writes every place it changes, in one batch. `today` is date-only. */
export const placeImportance = (
  uid: string,
  today: number,
  command: ImportanceCommand,
): Promise<ImportanceResult> =>
  inTurn(async () => {
    const result = applyImportance(
      readImportanceOrder(currentItems(uid), today),
      command,
      Date.now(),
    );
    if (result.kind === 'applied')
      return toResult(uid, await getHelmEncryption(uid), result);
    return result.kind === 'refused'
      ? { kind: 'refused', id: result.id }
      : result.kind === 'missing'
        ? { kind: 'missing' }
        : { kind: 'unchanged' };
  });

const byHand = (
  subjectId: string,
  relation: ImportanceRelation,
  otherId: string | null,
): ImportanceCommand => ({
  subjectId,
  relation,
  otherId,
  words: null,
  until: null,
  captureId: null,
});

/** Makes it come first, alone: what was first moves to second. */
export const placeFirst = (uid: string, today: number, id: string) =>
  placeImportance(uid, today, byHand(id, 'most', null));

/** Puts it just above another thing in the order. */
export const placeAbove = (
  uid: string,
  today: number,
  id: string,
  otherId: string,
) => placeImportance(uid, today, byHand(id, 'above', otherId));

/** Puts it just after another thing in the order. */
export const placeAfter = (
  uid: string,
  today: number,
  id: string,
  otherId: string,
) => placeImportance(uid, today, byHand(id, 'below', otherId));

/** Moves it to Can wait, below everything not placed. */
export const moveToCanWait = (uid: string, today: number, id: string) =>
  placeImportance(uid, today, byHand(id, 'canWait', null));

/** Takes it out of the order: it goes back to being ordered by its date. */
export const takeOutOfOrder = (uid: string, today: number, id: string) =>
  placeImportance(uid, today, byHand(id, 'clear', null));

/** Takes every thing still in the order out of it in one write; Undo puts each back where it was. */
export const clearImportanceOrder = (uid: string): Promise<ImportanceResult> =>
  inTurn(async () => {
    const items = currentItems(uid);
    const underGoal = new Set(readUnderGoalIds(items));
    const placed = items.filter(
      (item) =>
        item.place !== null &&
        item.status !== 'out' &&
        !item.isCare &&
        !underGoal.has(item.id),
    );
    if (placed.length === 0) return { kind: 'unchanged' };
    const encryption = await getHelmEncryption(uid);
    const before = placed.map(({ id }): Write => ({
      id,
      place: placeNow(uid, id),
    }));
    return {
      kind: 'written',
      written: write(
        uid,
        placed.map(({ id }): Write => ({ id, place: null })),
        encryption,
      ),
      undo: () => write(uid, before, encryption),
    };
  });
