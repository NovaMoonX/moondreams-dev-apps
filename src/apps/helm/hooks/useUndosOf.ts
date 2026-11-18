import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { loadExecutionsById } from '@apps/helm/store/actions/captureActions';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import type { OpenExecution } from '@apps/helm/types';

/** Every Undo that took part or all of an execution back, from the store or fetched by id; `latest` is the newest one loaded, and `isFailed` once one is known not to open. */
export function useUndosOf(execution: OpenExecution) {
  const { user } = useAuth();
  const byId = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const undoIds = execution.partUndoIds;
  const undos = undoIds.flatMap((id) => byId.get(id) ?? []);
  const missingKey = undoIds.filter((id) => !byId.has(id)).join(',');
  const uid = user?.uid;

  useEffect(() => {
    if (uid && missingKey) void loadExecutionsById(uid, missingKey.split(','));
  }, [uid, missingKey]);

  return {
    undos,
    latest: undos[undos.length - 1] ?? null,
    isFailed: undoIds.some((id) => failedIds.includes(id)),
  };
}
