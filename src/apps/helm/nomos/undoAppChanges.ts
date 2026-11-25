import { collection, doc, getDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import { undoAppChange } from '@lib/connections/connectionCalls';
import { HELM_COPY } from '@apps/helm/constants';
import {
  planAppChangeUndo,
  readUndoFields,
  settleAppChangeUndo,
} from '@apps/helm/nomos/planUndo';
import type { UndoResult } from '@apps/helm/nomos/undoExecution';
import { sealJson } from '@apps/helm/security';
import { runHeldTransaction } from '@apps/helm/store/actions/heldTransaction';
import type {
  Execution,
  ExecutionSealed,
  HelmEncryption,
} from '@apps/helm/types';

const executionsOf = (uid: string) =>
  collection(doc(db, 'apps', 'helm', 'users', uid), 'executions');

const isUnavailable = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  ['unavailable', 'functions/unavailable'].includes(
    String((error as { code?: unknown }).code),
  );

/** Takes back an execution whose effects are changes an app made for an outside assistant: the app decides in its own transaction (and says why when it can't), and Helm records the Undo only for what it took back. Allowed whether or not the switch is still on. */
export async function undoAppChangeExecution(
  uid: string,
  encryption: HelmEncryption,
  executionId: string,
  docIds: string[] | undefined,
): Promise<UndoResult> {
  if (!navigator.onLine) return { kind: 'offline' };
  const executionRef = doc(executionsOf(uid), executionId);
  try {
    const peek = await getDoc(executionRef);
    if (!peek.exists()) {
      return { kind: 'refused', reason: 'missing', report: null };
    }
    const first = peek.data() as Execution;
    if (first.undoneByExecutionId !== null) {
      return { kind: 'refused', reason: 'alreadyUndone', report: null };
    }
    const calls = planAppChangeUndo(
      { ...first, ...readUndoFields(first) },
      docIds ?? null,
    );
    if (calls.length === 0) {
      return { kind: 'refused', reason: 'nothingToTakeBack', report: null };
    }
    const answers = await Promise.all(
      calls.map((call) =>
        undoAppChange({
          connectorId: call.connectorId,
          changeId: call.changeId,
          from: 'helm',
        }),
      ),
    );
    const settled = settleAppChangeUndo(calls, answers);
    const { refusals } = settled;
    const takenBackDocIds = [
      ...settled.takenBackDocIds,
      ...settled.settledDocIds,
    ];
    if (takenBackDocIds.length === 0) {
      return {
        kind: 'refused',
        reason: 'notUndoable',
        report: refusals[0] ?? HELM_COPY.appChangeNotTakenBack,
      };
    }
    const undoRef = doc(executionsOf(uid));
    const report = [
      ...(settled.takenBackDocIds.length > 0
        ? [HELM_COPY.appChangeTookBackReport]
        : []),
      ...refusals,
    ].join(' ');
    return await runHeldTransaction(
      uid,
      async (transaction): Promise<UndoResult> => {
        const snapshot = await transaction.get(executionRef);
        const original = snapshot.exists()
          ? (snapshot.data() as Execution)
          : null;
        if (!original) {
          return { kind: 'refused', reason: 'missing', report: null };
        }
        const earlier = readUndoFields(original);
        const now = Date.now();
        const undoneDocIds = [
          ...new Set([...earlier.undoneDocIds, ...takenBackDocIds]),
        ];
        const isFinal = original.effectRefs.every((ref) =>
          undoneDocIds.includes(ref.docId),
        );
        transaction.set(undoRef, {
          captureId: original.captureId,
          actor: 'person',
          via: null,
          category: 'undo',
          autonomyLevel: 1,
          state: 'succeeded',
          effectRefs: original.effectRefs
            .filter((ref) => takenBackDocIds.includes(ref.docId))
            .map((ref) => ({ ...ref, op: 'update' as const })),
          linkedWhoIds: [],
          linkedPlaceIds: [],
          undoesExecutionId: executionId,
          undoneByExecutionId: null,
          undoneDocIds: null,
          partUndoIds: null,
          questionRef: null,
          errorCode: null,
          privacy: original.privacy ?? null,
          createdAt: now,
          decidedAt: now,
          finishedAt: now,
          sealed: await sealJson<ExecutionSealed>(
            {
              summary: HELM_COPY.appChangeTookBackSummary,
              said: null,
              commands: [],
              effects: [],
              undoReport: report,
              spoken: null,
              heldSpoken: null,
              goneIds: null,
              undoReason: null,
              lines: null,
              abilityOffer: null,
              awayZoneOffer: null,
            },
            encryption,
          ),
        } satisfies Execution);
        transaction.update(executionRef, {
          undoneDocIds,
          partUndoIds: [...earlier.partUndoIds, undoRef.id],
          ...(isFinal && { undoneByExecutionId: undoRef.id }),
        });
        return {
          kind: 'done',
          undoExecutionId: undoRef.id,
          report,
          isFinal,
          undoneDocIds,
          objectPaths: [],
        };
      },
    );
  } catch (error) {
    if (isUnavailable(error)) return { kind: 'offline' };
    throw error;
  }
}
