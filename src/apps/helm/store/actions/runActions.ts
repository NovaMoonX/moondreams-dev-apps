import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import {
  RUN_EXTRA_MAX,
  RUN_EXTRA_TEXT_CAP,
  RUN_STEPS_MAX,
} from '@apps/helm/constants';
import { openJson, sealJson } from '@apps/helm/security';
import { isUnavailable } from '@apps/helm/store/actions/topicActions';
import type {
  HelmEncryption,
  OpenProcedure,
  ProcedureRun,
  RunAttachment,
  RunSealed,
  RunStepPlace,
  Sealed,
} from '@apps/helm/types';
import { toExtraStep, toTickFields } from '@apps/helm/utils/runSteps';

const runsOf = (uid: string) =>
  collection(db, 'apps', 'helm', 'users', uid, 'procedureRuns');

const LABEL_CAP = 120;

export interface RunStart {
  procedure: OpenProcedure;
  attachment: RunAttachment;
  /** The trip's, event's or project's name, kept so the run still reads when it is gone. */
  label: string | null;
  /** The first day of a trip or event, a UTC midnight. */
  dueOn: number | null;
}

/** Starts a run holding the procedure's steps as they are now. The write is handed back unawaited so it works offline. */
export async function startRun(
  uid: string,
  encryption: HelmEncryption,
  { procedure, attachment, label, dueOn }: RunStart,
) {
  const ref = doc(runsOf(uid));
  const now = Date.now();
  const stepState = Object.fromEntries(
    Object.entries(procedure.stepState)
      .filter(([id]) => id in procedure.steps)
      .slice(0, RUN_STEPS_MAX)
      .map(([id, place]): [string, RunStepPlace] => [
        id,
        {
          order: place.order,
          groupId: place.groupId,
          doneAt: null,
          isExtra: false,
        },
      ]),
  );
  const run: ProcedureRun = {
    procedureId: procedure.id,
    procedureVersion: procedure.version,
    attachedTo: attachment,
    dueOn,
    stepState,
    groupOrder: procedure.groupOrder,
    startedAt: now,
    finishedAt: null,
    createdBy: 'person',
    executionId: null,
    lastEditedAt: null,
    sealed: await sealJson<RunSealed>(
      {
        title: procedure.title,
        steps: Object.fromEntries(
          Object.keys(stepState).map((id) => [id, procedure.steps[id]]),
        ),
        groups: procedure.groups,
        attachedLabel: label?.trim().slice(0, LABEL_CAP) || null,
      },
      encryption,
    ),
  };
  return { id: ref.id, written: setDoc(ref, run) };
}

/** Ticks or unticks steps in one write that touches only their `doneAt`, handed back unawaited so it works offline. */
export const tickRunSteps = (
  uid: string,
  runId: string,
  stepIds: string[],
  isDone: boolean,
) => {
  const now = Date.now();
  return updateDoc(doc(runsOf(uid), runId), {
    ...toTickFields(stepIds, isDone ? now : null),
    lastEditedAt: now,
  });
};

export type ExtraResult =
  | { kind: 'saved'; stepId: string }
  | { kind: 'offline' | 'missing' | 'unreadable' | 'full' | 'finished' };

/** Adds a step to this run alone, in one transaction that re-reads the run first. Needs a connection. */
export async function addExtraStep(
  uid: string,
  encryption: HelmEncryption,
  runId: string,
  text: string,
): Promise<ExtraResult> {
  const words = text.trim().slice(0, RUN_EXTRA_TEXT_CAP);
  if (!words) return { kind: 'missing' };
  if (!navigator.onLine) return { kind: 'offline' };
  const ref = doc(runsOf(uid), runId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<ExtraResult> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return { kind: 'missing' };
        const data = snapshot.data() as Pick<
          ProcedureRun,
          'sealed' | 'stepState' | 'finishedAt'
        >;
        if (data.finishedAt !== null) return { kind: 'finished' };
        const places = Object.values(data.stepState);
        if (
          places.length >= RUN_STEPS_MAX ||
          places.filter((place) => place.isExtra).length >= RUN_EXTRA_MAX
        ) {
          return { kind: 'full' };
        }
        const opened = await openJson<RunSealed>(
          data.sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return { kind: 'unreadable' };
        const { id, place } = toExtraStep(data.stepState);
        transaction.update(ref, {
          sealed: await sealJson<RunSealed>(
            {
              ...opened,
              steps: { ...opened.steps, [id]: { text: words, detail: null } },
            },
            encryption,
          ),
          [`stepState.${id}`]: place,
          lastEditedAt: Date.now(),
        });
        return { kind: 'saved', stepId: id };
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}

/** Files the run: what is not ticked stays on it as not done. Handed back unawaited. */
export const finishRun = (uid: string, runId: string) => {
  const now = Date.now();
  return updateDoc(doc(runsOf(uid), runId), {
    finishedAt: now,
    lastEditedAt: now,
  });
};

export const reopenRun = (uid: string, runId: string) =>
  updateDoc(doc(runsOf(uid), runId), {
    finishedAt: null,
    lastEditedAt: Date.now(),
  });

export type RunRestore = 'restored' | 'exists';

/** Deletes a run, keeping it as it was so `restore` can put it back unless something has taken its id. The delete is handed back unawaited, so it works offline. */
export async function deleteRun(uid: string, runId: string) {
  const ref = doc(runsOf(uid), runId);
  const raw = (await getDocFromCache(ref).catch(() => getDoc(ref))).data();
  if (!raw) throw new Error('This run is already gone.');
  const written = deleteDoc(ref);
  const restore = async (): Promise<RunRestore> => {
    if ((await getDoc(ref)).exists()) return 'exists';
    await setDoc(ref, raw);
    return 'restored';
  };
  return { written, restore };
}
