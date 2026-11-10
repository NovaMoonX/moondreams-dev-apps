import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { deleteFile } from '@lib/firebase/storage';
import { createSealedReader } from '@lib/security';

import { openJson, sealJson } from '@apps/helm/security';
import { getMediaObjectPath } from '@apps/helm/utils/mediaPath';
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
  WhoSealed,
} from '@apps/helm/types';

export type UndoResult =
  | {
      kind: 'done';
      undoExecutionId: string;
      report: string;
      /** Sealed photo objects the undo left without a document; deleted once it commits. */
      objectPaths: string[];
    }
  | { kind: 'refused'; reason: UndoRefusal | 'missing'; report: string | null }
  | { kind: 'offline' };

const userOf = (uid: string) => doc(db, 'apps', 'helm', 'users', uid);

/** The people and places an execution made that a task or turn outside it also links; a transaction can't query, so this reads just before it. */
async function readUsedIds(
  uid: string,
  executionId: string,
): Promise<Set<string>> {
  const snapshot = await getDoc(doc(userOf(uid), 'executions', executionId));
  if (!snapshot.exists()) return new Set();
  const data = snapshot.data() as {
    captureId?: unknown;
    effectRefs?: EffectRef[];
  };
  const refs = Array.isArray(data.effectRefs) ? data.effectRefs : [];
  const own = new Set([
    ...refs.map((ref) => ref.docId),
    ...(typeof data.captureId === 'string' ? [data.captureId] : []),
  ]);
  const made = refs.filter(
    (ref) =>
      ref.op === 'create' &&
      (ref.collection === 'who' || ref.collection === 'places'),
  );
  const checks = await Promise.all(
    made.flatMap((ref) => {
      const field = ref.collection === 'who' ? 'whoIds' : 'placeIds';
      return (['tasks', 'captures'] as const).map(async (name) => {
        const found = await getDocs(
          query(
            collection(userOf(uid), name),
            where(field, 'array-contains', ref.docId),
            limit(own.size + 1),
          ),
        );
        return found.docs.some((entry) => !own.has(entry.id))
          ? [ref.docId]
          : [];
      });
    }),
  );
  return new Set(checks.flat());
}

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
  const docOf = (ref: Pick<EffectRef, 'collection' | 'docId'>) =>
    ref.collection === 'profile'
      ? userOf(uid)
      : doc(collectionOf(ref.collection), ref.docId);
  const undoRef = doc(executions);
  const executionRef = doc(executions, executionId);
  const read = createSealedReader(encryption, openJson);

  try {
    const usedIds = await readUsedIds(uid, executionId);
    const result = await runTransaction(
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
              const isOpened =
                ref.collection === 'tasks' || ref.collection === 'who';
              const entry = await transaction.get(docOf(ref));
              const data = entry.exists()
                ? (entry.data() as Record<string, unknown>)
                : null;
              if (!isOpened) return [docId, { docId, data, opened: null }];
              const opened = await (
                data?.sealed
                  ? openJson<TaskSealed | WhoSealed>(
                      data.sealed as Sealed,
                      encryption,
                    )
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
          usedIds,
        });
        if (plan.kind === 'refused') {
          return { kind: 'refused', reason: plan.reason, report: plan.report };
        }
        const resealed = await Promise.all(
          plan.updates.map(async (update) =>
            update.reseal
              ? {
                  sealed: await sealJson<TaskSealed | WhoSealed>(
                    update.reseal,
                    encryption,
                  ),
                }
              : {},
          ),
        );
        const sealed = await sealJson<ExecutionSealed>(
          plan.undoSealed,
          encryption,
        );
        plan.deletes.forEach(({ docId, collection: from }) =>
          transaction.delete(docOf({ docId, collection: from })),
        );
        plan.updates.forEach((update, index) =>
          transaction.update(docOf(update), {
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
          objectPaths: plan.deletes.flatMap(({ docId, collection: from }) =>
            from === 'media'
              ? [
                  getMediaObjectPath(uid, docId, false),
                  ...(targets.get(docId)?.data?.hasThumb === true
                    ? [getMediaObjectPath(uid, docId, true)]
                    : []),
                ]
              : [],
          ),
        };
      },
    );
    if (result.kind === 'done') {
      const deleted = await Promise.allSettled(
        result.objectPaths.map((path) => deleteFile(path)),
      );
      deleted.forEach((outcome) => {
        if (outcome.status === 'rejected')
          console.error('A taken-back photo was not deleted', outcome.reason);
      });
    }
    return result;
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}
