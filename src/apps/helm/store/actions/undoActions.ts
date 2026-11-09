import { createSealedReader } from '@lib/security';

import { store } from '@/store';
import { undoExecution, type UndoResult } from '@apps/helm/nomos/undoExecution';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { openJson } from '@apps/helm/security';
import {
  addEarlierExecutions,
  markExecutionUndone,
} from '@apps/helm/store/helmSlice';
import { fetchExecutionsById } from '@apps/helm/store/listeners/executionListener';

/** Takes an execution back and brings the new Undo line into the store. */
export async function takeBack(
  uid: string,
  executionId: string,
): Promise<UndoResult> {
  const encryption = await getHelmEncryption(uid);
  const result = await undoExecution(uid, encryption, executionId);
  if (result.kind !== 'done' || store.getState().helm.uid !== uid) {
    return result;
  }
  store.dispatch(
    markExecutionUndone({
      executionId,
      undoExecutionId: result.undoExecutionId,
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
