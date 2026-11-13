import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { loadExecutionsById } from '@apps/helm/store/actions/captureActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenExecution } from '@apps/helm/types';

/** The Undo that took an execution back, from the store or fetched by id; `isFailed` once it is known not to open. */
export function useUndoOf(execution: OpenExecution) {
  const { user } = useAuth();
  const byId = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const undoId = execution.undoneByExecutionId;
  const undo = undoId ? (byId.get(undoId) ?? null) : null;
  const uid = user?.uid;
  const needsLoad = undoId !== null && undo === null;

  useEffect(() => {
    if (uid && undoId && needsLoad) void loadExecutionsById(uid, [undoId]);
  }, [uid, undoId, needsLoad]);

  return {
    undo,
    isFailed: undoId !== null && failedIds.includes(undoId),
  };
}
