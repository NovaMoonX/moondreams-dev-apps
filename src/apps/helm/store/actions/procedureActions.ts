import {
  collection,
  doc,
  type DocumentData,
  getDoc,
  getDocFromCache,
  getDocsFromServer,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { generateUuid } from '@/utils';
import {
  HELM_COPY,
  PROCEDURE_STEPS_MAX,
  PROCEDURE_TITLE_CAP,
} from '@apps/helm/constants';
import { openJson, sealJson } from '@apps/helm/security';
import {
  isUnavailable,
  type DocumentChange,
} from '@apps/helm/store/actions/topicActions';
import type {
  HelmEncryption,
  OpenTask,
  Procedure,
  ProcedureSealed,
  ProcedureVersion,
  ProcedureVersionSealed,
  Sealed,
} from '@apps/helm/types';
import {
  addStep,
  fromProcedure,
  summarizeEdit,
  updateStep,
  toContent,
  toStoredParts,
  type ProcedureDraft,
} from '@apps/helm/utils/procedureDraft';
import type { StepPlace } from '@apps/helm/utils/stepGroups';
import { getOrderedSteps } from '@apps/helm/utils/taskEdits';

const CHUNK = 400;

const proceduresOf = (uid: string) =>
  collection(doc(db, 'apps', 'helm', 'users', uid), 'procedures');

const toChunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) =>
    items.slice(index * CHUNK, (index + 1) * CHUNK),
  );

/** What a version holds: where each step sits, the group order and the sealed words. */
export interface ProcedureParts {
  stepState: Record<string, StepPlace>;
  groupOrder: string[];
  body: ProcedureSealed;
}

/** A procedure's version document as the person's device writes it, holding the whole procedure at that version. */
export async function buildProcedureVersionDoc(
  encryption: HelmEncryption,
  input: {
    version: number;
    parts: ProcedureParts;
    reason: ProcedureVersion['reason'];
    restoredFromVersion: number | null;
    changeSummary: string;
    executionId: string | null;
    now: number;
  },
): Promise<ProcedureVersion> {
  return {
    version: input.version,
    restoredFromVersion: input.restoredFromVersion,
    createdBy: 'person',
    reason: input.reason,
    stepState: input.parts.stepState,
    groupOrder: input.parts.groupOrder,
    sourceCaptureId: null,
    executionId: input.executionId,
    createdAt: input.now,
    sealed: await sealJson<ProcedureVersionSealed>(
      {
        ...input.parts.body,
        changeSummary: input.changeSummary.slice(0, 200),
        requestQuote: null,
      },
      encryption,
    ),
  };
}

export type ProcedureMade =
  { kind: 'made'; id: string; written: Promise<void> } | { kind: 'empty' };

/** Keeps a procedure: the document and its first version go in one batch, handed back unawaited so it is safe offline. */
export async function createProcedure(
  uid: string,
  encryption: HelmEncryption,
  draft: ProcedureDraft,
  sourceTaskId: string | null = null,
): Promise<ProcedureMade> {
  const content = toContent(draft);
  if (!content.title || content.steps.length === 0) return { kind: 'empty' };
  const parts = toStoredParts(content);
  const id = generateUuid();
  const ref = doc(proceduresOf(uid), id);
  const now = Date.now();
  const made: Procedure = {
    stepState: parts.stepState,
    groupOrder: parts.groupOrder,
    version: 1,
    createdBy: 'person',
    sourceCaptureId: null,
    sourceTaskId,
    executionId: null,
    createdAt: now,
    lastEditedAt: now,
    sealed: await sealJson<ProcedureSealed>(parts.body, encryption),
  };
  const batch = writeBatch(db);
  batch.set(ref, made);
  batch.set(
    doc(ref, 'versions', '1'),
    await buildProcedureVersionDoc(encryption, {
      version: 1,
      parts,
      reason: 'created',
      restoredFromVersion: null,
      changeSummary: '',
      executionId: null,
      now,
    }),
  );
  return { kind: 'made', id, written: batch.commit() };
}

/** A task's steps in the person's order become a procedure's steps, ungrouped, up to the cap; the task is left as it was. */
export async function createProcedureFromTask(
  uid: string,
  encryption: HelmEncryption,
  task: Pick<OpenTask, 'id' | 'title' | 'steps' | 'stepState'>,
): Promise<ProcedureMade & { title: string; isCut: boolean }> {
  const ordered = getOrderedSteps(task);
  const made = await createProcedure(
    uid,
    encryption,
    {
      title: task.title,
      groups: [],
      steps: ordered.map((step) => ({
        id: generateUuid(),
        text: step.text,
        detail: null,
        groupId: null,
      })),
    },
    task.id,
  );
  return {
    ...made,
    title: task.title.trim().slice(0, PROCEDURE_TITLE_CAP),
    isCut: ordered.length > PROCEDURE_STEPS_MAX,
  };
}

/** Writes the next version in one transaction that re-reads the procedure first: `expectedVersion` must still be its newest. Needs a connection. */
async function writeVersion(
  uid: string,
  encryption: HelmEncryption,
  procedureId: string,
  expectedVersion: number,
  plan: (
    live: ProcedureDraft,
    readVersion: (version: number) => Promise<ProcedureParts | null>,
  ) => Promise<{
    parts: ProcedureParts;
    reason: ProcedureVersion['reason'];
    restoredFromVersion: number | null;
    changeSummary: string;
  } | null>,
): Promise<DocumentChange> {
  if (!navigator.onLine) return 'offline';
  const ref = doc(proceduresOf(uid), procedureId);
  try {
    return await runTransaction(
      db,
      async (transaction): Promise<DocumentChange> => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) return 'missing';
        const live = snapshot.data() as Procedure;
        if (live.version !== expectedVersion) return 'changed';
        const opened = await openJson<ProcedureSealed>(
          live.sealed as Sealed,
          encryption,
        ).catch(() => null);
        if (!opened) return 'unreadable';
        const step = await plan(
          fromProcedure({
            ...opened,
            stepState: live.stepState,
            groupOrder: live.groupOrder,
          }),
          async (version) => {
            const earlier = await transaction.get(
              doc(ref, 'versions', String(version)),
            );
            if (!earlier.exists()) return null;
            const data = earlier.data() as ProcedureVersion;
            const body = await openJson<ProcedureVersionSealed>(
              data.sealed,
              encryption,
            ).catch(() => null);
            return body
              ? {
                  stepState: data.stepState,
                  groupOrder: data.groupOrder,
                  body: {
                    title: body.title,
                    steps: body.steps,
                    groups: body.groups,
                  },
                }
              : null;
          },
        );
        if (!step) return 'missing';
        const now = Date.now();
        const version = live.version + 1;
        transaction.update(ref, {
          stepState: step.parts.stepState,
          groupOrder: step.parts.groupOrder,
          sealed: await sealJson<ProcedureSealed>(step.parts.body, encryption),
          version,
          lastEditedAt: now,
        });
        transaction.set(
          doc(ref, 'versions', String(version)),
          await buildProcedureVersionDoc(encryption, {
            version,
            parts: step.parts,
            reason: step.reason,
            restoredFromVersion: step.restoredFromVersion,
            changeSummary: step.changeSummary,
            executionId: null,
            now,
          }),
        );
        return 'saved';
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return 'offline';
    throw error;
  }
}

/** Saves the person's edit as a new version; `expectedVersion` is the newest the form was opened on. */
export function saveProcedure(
  uid: string,
  encryption: HelmEncryption,
  procedureId: string,
  expectedVersion: number,
  draft: ProcedureDraft,
): Promise<DocumentChange> {
  const content = toContent(draft);
  if (!content.title || content.steps.length === 0) {
    return Promise.resolve('missing');
  }
  return writeVersion(
    uid,
    encryption,
    procedureId,
    expectedVersion,
    async (live) => ({
      parts: toStoredParts(content),
      reason: 'personEdit',
      restoredFromVersion: null,
      changeSummary: summarizeEdit(toContent(live), content),
    }),
  );
}

/** Adds one step, ungrouped, at the end of the routine as a new version; `expectedVersion` is the newest the run's page saw. The step is the words of one a run added for itself. */
export function addStepFromRun(
  uid: string,
  encryption: HelmEncryption,
  procedureId: string,
  expectedVersion: number,
  text: string,
): Promise<DocumentChange> {
  const stepId = generateUuid();
  return writeVersion(
    uid,
    encryption,
    procedureId,
    expectedVersion,
    async (live) => {
      const next = toContent(
        updateStep(addStep(live, stepId, null), stepId, { text }),
      );
      return next.steps.some((step) => step.id === stepId)
        ? {
            parts: toStoredParts(next),
            reason: 'fromRun',
            restoredFromVersion: null,
            changeSummary: HELM_COPY.procedureSummaryAdded(1, [text]),
          }
        : null;
    },
  );
}

/** Writes an earlier version's steps again as the newest version; `expectedVersion` is the newest the caller saw. Restoring the newest's predecessor is Undo, which refuses on the first version. */
export function restoreProcedureVersion(
  uid: string,
  encryption: HelmEncryption,
  procedureId: string,
  expectedVersion: number,
  target: number,
): Promise<DocumentChange> {
  if (target < 1 || target >= expectedVersion) {
    return Promise.resolve(target < 1 ? 'first' : 'changed');
  }
  return writeVersion(
    uid,
    encryption,
    procedureId,
    expectedVersion,
    async (_live, readVersion) => {
      const parts = await readVersion(target);
      return parts
        ? {
            parts,
            reason: 'restored',
            restoredFromVersion: target,
            changeSummary: HELM_COPY.procedureSummaryRestored(target),
          }
        : null;
    },
  );
}

export type ProcedureRestore = 'restored' | 'exists' | 'offline';

/** Deletes a procedure and its history. Undo sets every document back from what was read here, unless the procedure is back already. Needs a connection. */
export async function deleteProcedure(uid: string, procedureId: string) {
  const ref = doc(proceduresOf(uid), procedureId);
  const raw = (await getDocFromCache(ref).catch(() => getDoc(ref))).data() as
    DocumentData | undefined;
  if (!raw) throw new Error('This is already gone.');
  const versions = await getDocsFromServer(collection(ref, 'versions'));
  const snapshot = versions.docs.map((entry) => ({
    ref: entry.ref,
    data: entry.data(),
  }));
  await toChunks([ref, ...snapshot.map((entry) => entry.ref)]).reduce(
    (chain, chunk) =>
      chain.then(() => {
        const batch = writeBatch(db);
        chunk.forEach((target) => batch.delete(target));
        return batch.commit();
      }),
    Promise.resolve(),
  );
  return {
    restore: async (): Promise<ProcedureRestore> => {
      if (!navigator.onLine) return 'offline';
      if ((await getDoc(ref)).exists()) return 'exists';
      await toChunks([...snapshot, { ref, data: raw }]).reduce(
        (chain, chunk) =>
          chain.then(() => {
            const batch = writeBatch(db);
            chunk.forEach((entry) => batch.set(entry.ref, entry.data));
            return batch.commit();
          }),
        Promise.resolve(),
      );
      return 'restored';
    },
  };
}
