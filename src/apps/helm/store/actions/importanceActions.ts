import { collection, doc, writeBatch } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { store } from '@/store';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  applyImportance,
  findImportanceTie,
  readImportanceOrder,
  stepCommand,
  withPlaceChanges,
  type ApplyResult,
  type ImportanceCommand,
  type ImportancePlace,
  type ImportanceRelation,
  type ImportanceTie,
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

const placeNow = (id: string): ImportancePlace | null =>
  projectOf(id)?.importance ?? habitOf(id)?.importance ?? null;

export type ImportanceResult =
  | {
      kind: 'written';
      /** Settles when the server has the change; never awaited by the caller, so an offline change shows at once. */
      written: Promise<void>;
      /** Puts every thing it moved back to the place it held. */
      undo: () => Promise<void>;
      changedIds: string[];
      /** Three or more now share a place the change touched: the question "Which comes first?" is due. */
      tie: ImportanceTie | null;
    }
  | { kind: 'unchanged' }
  | { kind: 'refused'; id: string }
  | { kind: 'missing' };

const toResult = (
  uid: string,
  encryption: HelmEncryption,
  today: number,
  applied: Extract<ApplyResult, { kind: 'applied' }>,
): ImportanceResult => {
  const before = applied.changes.map(({ id }): Write => ({
    id,
    place: placeNow(id),
  }));
  const items = selectImportanceItems(store.getState());
  const order = readImportanceOrder(
    withPlaceChanges(items, applied.changes),
    today,
  );
  return {
    kind: 'written',
    written: commit(uid, applied.changes, encryption),
    undo: () => commit(uid, before, encryption),
    changedIds: applied.changes.map(({ id }) => id),
    tie: findImportanceTie(order, new Set(applied.changes.map(({ id }) => id))),
  };
};

/** Applies one relation to the order as it stands and writes every place it changes, in one batch. `today` is date-only. */
export async function placeImportance(
  uid: string,
  today: number,
  command: ImportanceCommand,
): Promise<ImportanceResult> {
  const order = readImportanceOrder(
    selectImportanceItems(store.getState()),
    today,
  );
  const result = applyImportance(order, command, Date.now());
  if (result.kind === 'applied')
    return toResult(uid, await getHelmEncryption(uid), today, result);
  return result.kind === 'refused'
    ? { kind: 'refused', id: result.id }
    : result.kind === 'missing'
      ? { kind: 'missing' }
      : { kind: 'unchanged' };
}

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

/** Puts it beside another thing, sharing its place. */
export const placeBeside = (
  uid: string,
  today: number,
  id: string,
  otherId: string,
) => placeImportance(uid, today, byHand(id, 'same', otherId));

/** Moves it to Can wait, below everything not placed. */
export const moveToCanWait = (uid: string, today: number, id: string) =>
  placeImportance(uid, today, byHand(id, 'canWait', null));

/** Takes it out of the order: it goes back to being ordered by its date. */
export const takeOutOfOrder = (uid: string, today: number, id: string) =>
  placeImportance(uid, today, byHand(id, 'clear', null));

/** One place up or down; from Not said yet an up puts it at the foot of In order, from Can wait an up takes it back to Not said yet. */
export async function moveStep(
  uid: string,
  today: number,
  id: string,
  direction: 'up' | 'down',
): Promise<ImportanceResult> {
  const order = readImportanceOrder(
    selectImportanceItems(store.getState()),
    today,
  );
  const command = stepCommand(order, id, direction);
  return command ? placeImportance(uid, today, command) : { kind: 'unchanged' };
}

/** "Which comes first?": the pick goes just above the others, which keep sharing their place. */
export async function answerWhichComesFirst(
  uid: string,
  today: number,
  tieIds: string[],
  pickedId: string,
): Promise<ImportanceResult> {
  const other = tieIds.find((id) => id !== pickedId);
  return other
    ? placeImportance(uid, today, {
        ...byHand(pickedId, 'above', other),
        words: placeNow(pickedId)?.words ?? null,
      })
    : { kind: 'unchanged' };
}
