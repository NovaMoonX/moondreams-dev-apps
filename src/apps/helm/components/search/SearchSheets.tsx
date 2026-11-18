import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import UndoSnackbar from '@/components/UndoSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { queryClient } from '@lib/query/queryClient';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppSelector } from '@/store';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import KeptMediaViewer from '@apps/helm/components/media/KeptMediaViewer';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import SyncedSheet from '@apps/helm/components/today/SyncedSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import {
  markDoneAgain,
  reopenTask,
  type RestoreResult,
} from '@apps/helm/store/actions/taskActions';
import { doneTasksQueryOptions } from '@apps/helm/queries/doneTaskQueries';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type { OpenTask } from '@apps/helm/types';
import type { SearchTarget } from '@apps/helm/utils/searchRecords';

export type SearchOpen = Extract<
  SearchTarget,
  { kind: 'task' | 'note' | 'synced' | 'media' }
>;

interface SearchSheetsProps {
  open: SearchOpen | null;
  /** Open and done tasks, the live store's copy winning. */
  tasks: OpenTask[];
  onClose: () => void;
}

/** The record a result opens when it has no page of its own: a task, note or synced record in its sheet, a photo or file in its viewer, over Search. */
function SearchSheets({ open, tasks, onClose }: SearchSheetsProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const nowMinute = Math.floor(now / 60_000) * 60_000;
  const activity = useAppSelector((state) =>
    selectTaskActivity(state, nowMinute),
  );
  const synced = useAppSelector((state) => state.helm.synced.items);
  const media = useAppSelector((state) => state.helm.media.items);
  const { held, tick, undoTick, forget } = useTaskTicks(user?.uid ?? null);
  const { pending, showUndo, undo } = useUndoRemoval();

  const openTask =
    open?.kind === 'task'
      ? (held.get(open.id)?.task ??
        tasks.find((task) => task.id === open.id) ??
        null)
      : null;
  const doneAt = openTask
    ? (held.get(openTask.id)?.completedAt ??
      (openTask.status === 'done'
        ? (openTask.completedAt ?? openTask.createdAt)
        : null))
    : null;

  const reopen = (taskId: string) => {
    if (!user) return;
    const uid = user.uid;
    const task = tasks.find((entry) => entry.id === taskId);
    reopenTask(uid, taskId).catch((error: unknown) => {
      console.error('Helm task was not reopened', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
    addToast({
      title: HELM_COPY.taskReopenedToast(task?.title ?? ''),
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void markDoneAgain(uid, taskId, task?.completedAt ?? null)
            .then((isUndone) => {
              if (!isUndone) {
                addToast({ title: HELM_COPY.undoChangedSince, type: 'info' });
              }
            })
            .catch((error: unknown) => {
              console.error('Helm task was not put back', error);
              addToast({ title: HELM_COPY.undoFailed, type: 'error' });
            }),
      },
    });
    onClose();
  };

  const handleDeleted = (
    taskId: string,
    title: string,
    restore: () => Promise<RestoreResult>,
  ) => {
    forget(taskId);
    onClose();
    const doneKey = doneTasksQueryOptions(user?.uid ?? '').queryKey;
    queryClient.setQueryData(doneKey, (old) =>
      old?.filter((task) => task.id !== taskId),
    );
    showUndo(HELM_COPY.deletedTask(title), () => {
      restore()
        .then((result) => {
          void queryClient.invalidateQueries({ queryKey: doneKey });
          if (result === 'exists') {
            addToast({ title: HELM_COPY.restoreExists, type: 'info' });
          }
        })
        .catch((error: unknown) => {
          console.error('Helm task was not restored', error);
          addToast({ title: HELM_COPY.undoFailed, type: 'error' });
        });
    });
  };

  const openMedia =
    open?.kind === 'media'
      ? (media.find((entry) => entry.id === open.id) ?? null)
      : null;

  return (
    <>
      <TaskSheet
        task={openTask}
        screen={{
          view: 'tasks',
          visible: openTask ? [{ collection: 'tasks', id: openTask.id }] : [],
        }}
        doneAt={doneAt}
        activity={openTask ? (activity.byId.get(openTask.id) ?? null) : null}
        onClose={onClose}
        onTick={tick}
        onUndoTick={(taskId) =>
          held.has(taskId) ? void undoTick(taskId) : reopen(taskId)
        }
        onDeleted={handleDeleted}
      />
      <NoteSheet
        noteId={open?.kind === 'note' ? open.id : null}
        onClose={onClose}
      />
      <SyncedSheet
        record={
          open?.kind === 'synced'
            ? (synced.find((entry) => entry.id === open.id) ?? null)
            : null
        }
        now={now}
        onClose={onClose}
      />
      {openMedia && (
        <KeptMediaViewer media={openMedia} record={null} onClose={onClose} />
      )}
      <UndoSnackbar pending={pending} onUndo={undo} />
    </>
  );
}

export default SearchSheets;
