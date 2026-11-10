import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  increment,
  runTransaction,
  type Transaction,
  where,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { deleteFile } from '@lib/firebase/storage';
import { createSealedReader } from '@lib/security';

import { openJson, sealJson } from '@apps/helm/security';
import {
  readIndexIn,
  writeIndexIn,
} from '@apps/helm/store/actions/keyDateIndexStore';
import {
  applyChanges,
  type IndexChange,
  type IndexEntry,
} from '@apps/helm/utils/keyDateIndex';
import { getMediaObjectPath } from '@apps/helm/utils/mediaPath';
import { openExecution } from '@apps/helm/store/listeners/executionListener';
import {
  planReopen,
  planUndo,
  type UndoPlan,
  type UndoRefusal,
  type UndoTarget,
} from '@apps/helm/nomos/planUndo';
import type {
  EffectRef,
  ExecutionSealed,
  HelmEncryption,
  KeyDateSealed,
  ProjectSealed,
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
      return (['tasks', 'captures', 'facts'] as const).map(async (name) => {
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

type WritePlan = Extract<UndoPlan, { kind: 'write' }>;

const toKeyEntry = (id: string, sealed: KeyDateSealed): IndexEntry => [
  id,
  sealed.kind === 'anniversary' || sealed.kind === 'custom'
    ? sealed.kind
    : 'birthday',
  sealed.month ?? 1,
  sealed.day,
  sealed.year,
  sealed.kind === 'custom' ? sealed.label : null,
];

interface DateStep {
  whoId: string;
  isMoment: boolean;
  /** A moment is never in the index. */
  change: IndexChange | null;
  delta: number;
}

/** What an undo does to dates: the index's changes (yearly dates only) and each person's counters, `yearlyDateCount` and `momentCount` apart. */
const toDateChanges = (
  plan: WritePlan,
  targets: Map<string, UndoTarget>,
): {
  changes: IndexChange[];
  deltas: Map<string, number>;
  momentDeltas: Map<string, number>;
} => {
  const whoOf = (docId: string) => {
    const whoId = targets.get(docId)?.data?.whoId;
    return typeof whoId === 'string' ? whoId : null;
  };
  const isMomentDoc = (docId: string) =>
    targets.get(docId)?.data?.shape === 'moment';
  const removed = plan.deletes.flatMap(
    ({ docId, collection: from }): DateStep[] => {
      const whoId = from === 'keyDates' ? whoOf(docId) : null;
      const isMoment = isMomentDoc(docId);
      return whoId
        ? [
            {
              whoId,
              isMoment,
              change: isMoment
                ? null
                : { op: 'remove', whoId, keyDateId: docId },
              delta: -1,
            },
          ]
        : [];
    },
  );
  const restored = plan.updates.flatMap((update): DateStep[] => {
    const whoId = update.collection === 'keyDates' ? whoOf(update.docId) : null;
    const sealed = update.reseal as KeyDateSealed | null;
    return whoId && sealed && !isMomentDoc(update.docId)
      ? [
          {
            whoId,
            isMoment: false,
            change: {
              op: 'upsert',
              whoId,
              entry: toKeyEntry(update.docId, sealed),
            },
            delta: 0,
          },
        ]
      : [];
  });
  const recreated = plan.creates.flatMap((entry): DateStep[] => {
    const whoId = entry.fields.whoId;
    const isMoment = entry.fields.shape === 'moment';
    return typeof whoId === 'string'
      ? [
          {
            whoId,
            isMoment,
            change: isMoment
              ? null
              : {
                  op: 'upsert',
                  whoId,
                  entry: toKeyEntry(entry.docId, entry.seal),
                },
            delta: 1,
          },
        ]
      : [];
  });
  const all = [...removed, ...restored, ...recreated];
  const sumOf = (isMoment: boolean) =>
    all
      .filter((step) => step.isMoment === isMoment)
      .reduce(
        (sums, { whoId, delta }) =>
          sums.set(whoId, (sums.get(whoId) ?? 0) + delta),
        new Map<string, number>(),
      );
  return {
    changes: all.flatMap(({ change }) => (change ? [change] : [])),
    deltas: sumOf(false),
    momentDeltas: sumOf(true),
  };
};

interface DatesRead {
  changes: IndexChange[];
  deltas: Map<string, number>;
  momentDeltas: Map<string, number>;
  index: Awaited<ReturnType<typeof readIndexIn>> | null;
  whoHere: Set<string>;
}

/** Reads the index and the people whose counters move, before anything is written. */
async function readDatesIn(
  transaction: Transaction,
  uid: string,
  encryption: HelmEncryption,
  plan: UndoPlan,
  targets: Map<string, UndoTarget>,
): Promise<DatesRead> {
  const none = {
    changes: [],
    deltas: new Map<string, number>(),
    momentDeltas: new Map<string, number>(),
    index: null,
    whoHere: new Set<string>(),
  };
  if (plan.kind !== 'write') return none;
  const { changes, deltas, momentDeltas } = toDateChanges(plan, targets);
  const moving = [
    ...new Set(
      [...deltas.entries(), ...momentDeltas.entries()]
        .filter(([, delta]) => delta !== 0)
        .map(([whoId]) => whoId),
    ),
  ];
  if (changes.length === 0 && moving.length === 0) return none;
  const index =
    changes.length > 0 ? await readIndexIn(transaction, uid, encryption) : null;
  const owners = await Promise.all(
    moving.map(async (whoId) => ({
      whoId,
      snapshot: await transaction.get(doc(userOf(uid), 'who', whoId)),
    })),
  );
  return {
    changes,
    deltas,
    momentDeltas,
    index,
    whoHere: new Set(
      owners.flatMap(({ whoId, snapshot }) =>
        snapshot.exists() ? [whoId] : [],
      ),
    ),
  };
}

/** Moves each counter by the dates taken back or put back and rewrites the index, in the undo's own transaction. */
async function writeDatesIn(
  transaction: Transaction,
  uid: string,
  encryption: HelmEncryption,
  plan: UndoPlan,
  dates: DatesRead,
) {
  if (plan.kind !== 'write') return;
  const deletedWho = new Set(
    plan.deletes
      .filter(({ collection: from }) => from === 'who')
      .map(({ docId }) => docId),
  );
  await Promise.all(
    plan.creates.map(async ({ docId, collection: from, fields, seal }) =>
      transaction.set(doc(collection(userOf(uid), from), docId), {
        ...fields,
        sealed: await sealJson<KeyDateSealed>(seal, encryption),
      }),
    ),
  );
  const counters = [
    ...new Set([...dates.deltas.keys(), ...dates.momentDeltas.keys()]),
  ]
    .filter((whoId) => dates.whoHere.has(whoId) && !deletedWho.has(whoId))
    .map((whoId) => ({
      whoId,
      yearly: dates.deltas.get(whoId) ?? 0,
      moments: dates.momentDeltas.get(whoId) ?? 0,
    }))
    .filter(({ yearly, moments }) => yearly !== 0 || moments !== 0);
  counters.forEach(({ whoId, yearly, moments }) =>
    transaction.update(doc(userOf(uid), 'who', whoId), {
      ...(yearly !== 0 && { yearlyDateCount: increment(yearly) }),
      ...(moments !== 0 && { momentCount: increment(moments) }),
    }),
  );
  if (!dates.index) return;
  const next = applyChanges(dates.index.byWho, dates.changes);
  await writeIndexIn(transaction, uid, encryption, {
    byWho: next.byWho,
    rebuiltAt: dates.index.rebuiltAt,
    existingIds: dates.index.existingIds,
    now: Date.now(),
  });
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
                ref.collection === 'tasks' ||
                ref.collection === 'who' ||
                ref.collection === 'projects' ||
                ref.collection === 'keyDates';
              const entry = await transaction.get(docOf(ref));
              if (ref.collection === 'keyDates' && ref.op === 'delete') {
                const whoId =
                  original.effects[original.effectRefs.indexOf(ref)]?.previous
                    ?.whoId;
                const owner =
                  typeof whoId === 'string'
                    ? await transaction.get(doc(userOf(uid), 'who', whoId))
                    : null;
                return [
                  docId,
                  {
                    docId,
                    data: entry.exists()
                      ? (entry.data() as Record<string, unknown>)
                      : null,
                    opened: null,
                    isOwnerHere: owner?.exists() ?? false,
                  },
                ];
              }
              const data = entry.exists()
                ? (entry.data() as Record<string, unknown>)
                : null;
              if (!isOpened) return [docId, { docId, data, opened: null }];
              const opened = await (
                data?.sealed
                  ? openJson<
                      TaskSealed | WhoSealed | KeyDateSealed | ProjectSealed
                    >(data.sealed as Sealed, encryption)
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
        const dates = await readDatesIn(
          transaction,
          uid,
          encryption,
          plan,
          targets,
        );
        const questionCaptureId = original.questionRef?.captureId ?? null;
        const captureRef = questionCaptureId
          ? doc(userOf(uid), 'captures', questionCaptureId)
          : null;
        const captureSnap = captureRef
          ? await transaction.get(captureRef)
          : null;
        const reopen = planReopen(
          original,
          captureSnap?.exists()
            ? (captureSnap.data() as {
                status: string;
                questionState: Record<
                  string,
                  { kind: string; answeredAt: number | null }
                >;
              })
            : null,
        );
        const resealed = await Promise.all(
          plan.updates.map(async (update) =>
            update.reseal
              ? {
                  sealed: await sealJson<
                    TaskSealed | WhoSealed | KeyDateSealed | ProjectSealed
                  >(update.reseal, encryption),
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
        await writeDatesIn(transaction, uid, encryption, plan, dates);
        if (captureRef && reopen) transaction.update(captureRef, reopen);
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
