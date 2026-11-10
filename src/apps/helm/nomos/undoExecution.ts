import { collection, doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { createSealedReader } from '@lib/security';

import { openJson, sealJson } from '@apps/helm/security';
import { openExecution } from '@apps/helm/store/listeners/executionListener';
import {
  planUndo,
  type UndoRefusal,
  type UndoTarget,
} from '@apps/helm/nomos/planUndo';
import type {
  EffectRef,
  ExecutionSealed,
  HelmEncryption,
  Sealed,
  TaskSealed,
} from '@apps/helm/types';

export type UndoResult =
  | { kind: 'done'; undoExecutionId: string; report: string }
  | { kind: 'refused'; reason: UndoRefusal | 'missing'; report: string | null }
  | { kind: 'offline' };

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: unknown }).code === 'unavailable';

/** Takes an execution back in one transaction that re-reads it and every record it touched, so it only restores what is still as the assistant left it. */
export async function undoExecution(
  uid: string,
  encryption: HelmEncryption,
  executionId: string,
): Promise<UndoResult> {
  if (!navigator.onLine) return { kind: 'offline' };
  const executions = collection(userOf(uid), 'executions');
  const tasks = collection(userOf(uid), 'tasks');
  const facts = collection(userOf(uid), 'facts');
  const collectionOf = (name: EffectRef['collection']) =>
    name === 'tasks'
      ? tasks
      : name === 'facts'
        ? facts
        : collection(userOf(uid), name);
  const undoRef = doc(executions);
  const executionRef = doc(executions, executionId);
  const read = createSealedReader(encryption, openJson);

  try {
    return await runTransaction(
      db,
      async (transaction): Promise<UndoResult> => {
        const snapshot = await transaction.get(executionRef);
        if (!snapshot.exists()) {
          return { kind: 'refused', reason: 'missing', report: null };
        }
        const original = await openExecution(snapshot, read);
        const refs = [
          ...new Map(
            original.effectRefs.map((ref) => [ref.docId, ref]),
          ).values(),
        ];
        const targets = new Map<string, UndoTarget>(
          await Promise.all(
            refs.map(async (ref): Promise<[string, UndoTarget]> => {
              const { docId } = ref;
              const isTask = ref.collection === 'tasks';
              const entry = await transaction.get(
                doc(collectionOf(ref.collection), docId),
              );
              const data = entry.exists()
                ? (entry.data() as Record<string, unknown>)
                : null;
              if (!isTask) return [docId, { docId, data, opened: null }];
              const opened = await (
                data?.sealed
                  ? openJson<TaskSealed>(data.sealed as Sealed, encryption)
                  : Promise.reject(new Error('No sealed words.'))
              ).catch(() => null);
              return [docId, { docId, data, opened }];
            }),
          ),
        );
        const plan = planUndo({
          original,
          targets,
          undoExecutionId: undoRef.id,
          now: Date.now(),
        });
        if (plan.kind === 'refused') {
          return { kind: 'refused', reason: plan.reason, report: plan.report };
        }
        const resealed = await Promise.all(
          plan.updates.map(async (update) =>
            update.reseal
              ? {
                  sealed: await sealJson<TaskSealed>(update.reseal, encryption),
                }
              : {},
          ),
        );
        const sealed = await sealJson<ExecutionSealed>(
          plan.undoSealed,
          encryption,
        );
        plan.deletes.forEach(({ docId, collection: from }) =>
          transaction.delete(doc(collectionOf(from), docId)),
        );
        plan.updates.forEach((update, index) =>
          transaction.update(doc(tasks, update.docId), {
            ...update.fields,
            ...resealed[index],
          }),
        );
        transaction.set(undoRef, { ...plan.undoExecution, sealed });
        transaction.update(executionRef, { undoneByExecutionId: undoRef.id });
        return {
          kind: 'done',
          undoExecutionId: undoRef.id,
          report: plan.report,
        };
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}
