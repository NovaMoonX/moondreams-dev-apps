import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import type { FinishedTask, PlannerTask } from './planner.js';
import type { SlotRecord } from './dayJob.js';

const FINISHED_READ = 30;

export const userPath = (uid: string) => `apps/helm/users/${uid}`;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export const readSlots = (data: DocumentData | undefined) => {
  const raw: unknown = data?.slots;
  return Object.fromEntries(
    Object.entries(isRecord(raw) ? raw : {}).flatMap(
      ([id, slot]): [string, SlotRecord][] =>
        isRecord(slot) &&
        typeof slot.taskId === 'string' &&
        (slot.status === 'suggested' ||
          slot.status === 'kept' ||
          slot.status === 'notToday')
          ? [
              [
                id,
                {
                  taskId: slot.taskId,
                  startAt: toNumber(slot.startAt),
                  endAt: toNumber(slot.endAt),
                  status: slot.status,
                  source: slot.source === 'person' ? 'person' : 'nomos',
                  decidedAt: toNumber(slot.decidedAt),
                  overlapsEventRef:
                    typeof slot.overlapsEventRef === 'string'
                      ? slot.overlapsEventRef
                      : null,
                },
              ],
            ]
          : [],
    ),
  );
};

/** A task's readable fields as the planner reads them; `isCare` and `projectPlace` come from its opened words and the importance order, and the title is never needed. */
export const toPlannerTask = (
  id: string,
  data: DocumentData,
  extra: { isCare: boolean; projectPlace: number | null } = {
    isCare: false,
    projectPlace: null,
  },
): PlannerTask => ({
  id,
  isCare: extra.isCare,
  projectPlace: extra.projectPlace,
  title: '',
  due: isRecord(data.due) ? (data.due as PlannerTask['due']) : null,
  importance:
    data.importance === 'must' ||
    data.importance === 'should' ||
    data.importance === 'could'
      ? data.importance
      : null,
  isUrgent: data.isUrgent === true,
  durationMinutes: toNumber(data.durationMinutes),
  energy:
    data.energy === 'low' || data.energy === 'medium' || data.energy === 'high'
      ? data.energy
      : null,
  placeIds: Array.isArray(data.placeIds)
    ? data.placeIds.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [],
  projectId: typeof data.projectId === 'string' ? data.projectId : null,
  context:
    data.context === 'atHome' ||
    data.context === 'out' ||
    data.context === 'atComputer' ||
    data.context === 'onPhone'
      ? data.context
      : null,
  effort:
    data.effort === 'light' ||
    data.effort === 'moderate' ||
    data.effort === 'heavy'
      ? data.effort
      : null,
});

export const readFinished = async (
  firestore: Firestore,
  uid: string,
): Promise<FinishedTask[]> => {
  const snap = await firestore
    .collection(`${userPath(uid)}/tasks`)
    .where('status', '==', 'done')
    .orderBy('createdAt', 'desc')
    .limit(FINISHED_READ)
    .get();
  return snap.docs.map((doc) => {
    const task = toPlannerTask(doc.id, doc.data());
    return {
      projectId: task.projectId ?? null,
      context: task.context ?? null,
      durationMinutes: task.durationMinutes,
      completedAt: toNumber(doc.get('completedAt')),
    };
  });
};
