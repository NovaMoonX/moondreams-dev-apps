import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { undoExecution, type UndoResult } from '@apps/helm/nomos/undoExecution';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import {
  addEarlierExecutions,
  markExecutionPartUndone,
} from '@apps/helm/store/helmSlice';
import { fetchExecutionsById } from '@apps/helm/store/listeners/executionListener';

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
