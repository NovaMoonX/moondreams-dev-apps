import { logger } from 'firebase-functions/v2';
import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Query,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import { toGroups, toSteps, type ProcedureWords } from './procedureStore.js';
import type { ContextRun } from './nomos/buildContext.js';
import { flattenSteps, groupSteps } from './stepGroups.js';

const OPEN_RUNS_READ = 50;

export interface RunStepState {
  order: number;
  groupId: string | null;
  doneAt: number | null;
  isExtra: boolean;
}

export interface RunAttachment {
  kind: 'project' | 'synced';
  id: string;
}

/** A run as a turn read it, its words opened. */
export interface LiveRun extends ProcedureWords {
  id: string;
  procedureId: string;
  procedureVersion: number;
  attachedTo: RunAttachment | null;
  attachedLabel: string | null;
  dueOn: number | null;
  stepState: Record<string, RunStepState>;
  groupOrder: string[];
  startedAt: number;
  finishedAt: number | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStepState = (value: unknown): Record<string, RunStepState> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, place]) =>
          isRecord(place) && typeof place.order === 'number'
            ? [
                [
                  id,
                  {
                    order: place.order,
                    groupId:
                      typeof place.groupId === 'string' ? place.groupId : null,
                    doneAt:
                      typeof place.doneAt === 'number' ? place.doneAt : null,
                    isExtra: place.isExtra === true,
                  },
                ] as [string, RunStepState],
              ]
            : [],
        ),
      )
    : {};

const toAttachment = (value: unknown): RunAttachment | null =>
  isRecord(value) &&
  (value.kind === 'project' || value.kind === 'synced') &&
  typeof value.id === 'string'
    ? { kind: value.kind, id: value.id }
    : null;

/** Opens a run document; null when its words will not open. */
export const openLiveRun = (
  key: HelmKey,
  id: string,
  data: DocumentData,
): LiveRun | null => {
  try {
    const words = openForHelm(key, data.sealed as SealedPayload);
    return typeof words.title === 'string' &&
      words.title !== '' &&
      typeof data.procedureId === 'string'
      ? {
          id,
          title: words.title,
          procedureId: data.procedureId,
          procedureVersion:
            typeof data.procedureVersion === 'number'
              ? data.procedureVersion
              : 1,
          attachedTo: toAttachment(data.attachedTo),
          attachedLabel:
            typeof words.attachedLabel === 'string'
              ? words.attachedLabel
              : null,
          dueOn: typeof data.dueOn === 'number' ? data.dueOn : null,
          stepState: toStepState(data.stepState),
          groupOrder: Array.isArray(data.groupOrder)
            ? data.groupOrder.filter(
                (entry): entry is string => typeof entry === 'string',
              )
            : [],
          steps: toSteps(words.steps),
          groups: toGroups(words.groups),
          startedAt: typeof data.startedAt === 'number' ? data.startedAt : 0,
          finishedAt:
            typeof data.finishedAt === 'number' ? data.finishedAt : null,
        }
      : null;
  } catch {
    return null;
  }
};

/** The runs not yet finished, in no order: the query has no `orderBy`, so it needs no index. */
export const openRunsQuery = (firestore: Firestore, base: string): Query =>
  firestore
    .collection(`${base}/procedureRuns`)
    .where('finishedAt', '==', null)
    .limit(OPEN_RUNS_READ);

/** Opened runs, newest first; one that will not open is left out. */
export const openRunDocs = (
  key: HelmKey,
  docs: { id: string; data: () => DocumentData }[],
): LiveRun[] =>
  docs
    .flatMap((doc) => {
      const run = openLiveRun(key, doc.id, doc.data());
      return run ? [run] : [];
    })
    .sort((a, b) => b.startedAt - a.startedAt);

/** The open runs of one procedure: two equalities, so no composite index. */
export const procedureOpenRunsQuery = (
  firestore: Firestore,
  base: string,
  procedureId: string,
): Query =>
  firestore
    .collection(`${base}/procedureRuns`)
    .where('procedureId', '==', procedureId)
    .where('finishedAt', '==', null);

/** The ids among `procedureIds` that still have a procedure. */
export async function readLiveProcedureIds(
  firestore: Firestore,
  base: string,
  procedureIds: string[],
  read: (refs: DocumentReference[]) => Promise<DocumentSnapshot[]> = (refs) =>
    firestore.getAll(...refs),
): Promise<Set<string>> {
  const ids = [...new Set(procedureIds)];
  const snaps =
    ids.length === 0
      ? []
      : await read(ids.map((id) => firestore.doc(`${base}/procedures/${id}`)));
  return new Set(snaps.filter((snap) => snap.exists).map((snap) => snap.id));
}

/** The person's open runs, opened, for the model to know which exist; the run on screen is always among them, and a run whose procedure is gone is left out. A failed read is logged and leaves the turn without them. */
export async function readOpenRuns(
  firestore: Firestore,
  base: string,
  key: HelmKey,
  screenRunId: string | null,
): Promise<LiveRun[]> {
  try {
    const [snapshot, screenSnap] = await Promise.all([
      openRunsQuery(firestore, base).get(),
      screenRunId
        ? firestore.doc(`${base}/procedureRuns/${screenRunId}`).get()
        : Promise.resolve(null),
    ]);
    const runs = openRunDocs(key, [
      ...snapshot.docs,
      ...(screenSnap?.exists &&
      !snapshot.docs.some((doc) => doc.id === screenSnap.id)
        ? [{ id: screenSnap.id, data: () => screenSnap.data() ?? {} }]
        : []),
    ]).filter((run) => run.finishedAt === null);
    const live = await readLiveProcedureIds(
      firestore,
      base,
      runs.map((run) => run.procedureId),
    );
    return runs.filter((run) => live.has(run.procedureId));
  } catch (error) {
    logger.warn('helm.sort.runsUnreadable', {
      cause: error instanceof Error ? error.name : 'error',
    });
    return [];
  }
}

/** A run as the model sees it: its undone steps in their groups' order, ungrouped first. */
export const toContextRun = (run: LiveRun, isOpen: boolean): ContextRun => {
  const steps = flattenSteps(groupSteps(run));
  return {
    id: run.id,
    title: run.title,
    forLabel: run.attachedLabel,
    isOpen,
    doneCount: steps.filter((step) => run.stepState[step.id]?.doneAt !== null)
      .length,
    total: steps.length,
    undone: steps
      .filter((step) => run.stepState[step.id]?.doneAt === null)
      .map((step) => ({
        id: step.id,
        text: step.text,
        group:
          step.groupId === null
            ? null
            : (run.groups[step.groupId]?.name ?? null),
      })),
  };
};
