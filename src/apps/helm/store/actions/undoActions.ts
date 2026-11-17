import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { toOfferDocIds } from '@apps/helm/nomos/planUndo';
import { undoExecution, type UndoResult } from '@apps/helm/nomos/undoExecution';
import { resolveQuestion } from '@apps/helm/queries/nomosMutations';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import {
  addEarlierExecutions,
  markExecutionPartUndone,
} from '@apps/helm/store/helmSlice';
import { loadExecutionsById } from '@apps/helm/store/actions/captureActions';
import { isExecutionHeld } from '@apps/helm/store/actions/privacyActions';
import { fetchExecutionsById } from '@apps/helm/store/listeners/executionListener';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import type { HelmQuestion } from '@apps/helm/types';

/** Takes an execution back and brings the new Undo line into the store. */
export async function takeBack(
  uid: string,
  executionId: string,
  options?: Parameters<typeof undoExecution>[3],
): Promise<UndoResult> {
  const encryption = await getHelmEncryption(uid);
  const result = await undoExecution(uid, encryption, executionId, options);
  if (result.kind !== 'done' || store.getState().helm.uid !== uid) {
    return result;
  }
  const { helm } = store.getState();
  const isKept = [
    ...helm.earlierExecutions,
    ...helm.recentExecutions.items,
  ].some((entry) => entry.id === executionId);
  const original = helm.activity.items.find(
    (entry) => entry.id === executionId,
  );
  // The undo's own write can push the original out of the activity window while its sheet is open.
  if (!isKept && original) store.dispatch(addEarlierExecutions([original]));
  store.dispatch(
    markExecutionPartUndone({
      executionId,
      undoExecutionId: result.undoExecutionId,
      undoneDocIds: result.undoneDocIds,
      isFinal: result.isFinal,
    }),
  );
  const read = createSealedReader(encryption, openJson);
  const { opened } = await fetchExecutionsById(uid, read, [
    result.undoExecutionId,
  ]);
  if (store.getState().helm.uid === uid) {
    store.dispatch(addEarlierExecutions(opened));
  }
  return result;
}

export type UndoOfferOutcome =
  | { kind: 'undone'; report: string; isHeld: boolean }
  | { kind: 'kept' }
  | { kind: 'already' }
  | { kind: 'nothing'; report: string | null; isHeld: boolean }
  | { kind: 'offline' }
  | { kind: 'failed' };

/** Answers an undo offer: takes back what the chosen option names, then records the answer, so a retry after a failed record finds nothing left and only records. Keeping records the answer alone. */
export async function answerUndoOffer(
  uid: string,
  input: {
    captureId: string;
    questionId: string;
    question: HelmQuestion;
    optionId: string;
    by: 'tap' | 'voice';
  },
): Promise<UndoOfferOutcome> {
  const { captureId, questionId, question, optionId, by } = input;
  const record = () => resolveQuestion(captureId, questionId, { by, optionId });
  const choice = question.undoChoices.find(
    (entry) => entry.optionId === optionId,
  );
  if (!choice) {
    if (optionId !== 'no' && optionId !== 'keep') return { kind: 'failed' };
    const recorded = await record();
    return recorded.kind === 'done' || recorded.kind === 'answered'
      ? { kind: 'kept' }
      : recorded.kind === 'offline'
        ? { kind: 'offline' }
        : { kind: 'failed' };
  }
  if (!navigator.onLine) return { kind: 'offline' };
  await loadExecutionsById(uid, [choice.executionId]);
  const execution = selectExecutionsById(store.getState()).get(
    choice.executionId,
  );
  if (!execution) return { kind: 'failed' };
  const docIds = toOfferDocIds(choice, execution);
  const isHeld = isExecutionHeld(execution);
  if (docIds.length === 0) {
    await record();
    return { kind: 'already' };
  }
  const result = await takeBack(uid, choice.executionId, {
    docIds,
    questionRef: { captureId, questionId },
    reason: { reason: choice.reason, quote: choice.quote, via: 'offer' },
  });
  if (result.kind === 'offline') return { kind: 'offline' };
  if (result.kind === 'refused') {
    if (result.reason === 'alreadyUndone') {
      await record();
      return { kind: 'already' };
    }
    if (result.reason === 'nothingToTakeBack') {
      await record();
      return { kind: 'nothing', report: result.report, isHeld };
    }
    return { kind: 'failed' };
  }
  await record();
  return { kind: 'undone', report: result.report, isHeld };
}
