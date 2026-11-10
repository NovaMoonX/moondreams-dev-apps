import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import UndoSnackbar from '@/components/UndoSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import TaskRow from '@apps/helm/components/tasks/TaskRow';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import { HELM_COPY } from '@apps/helm/constants';
import type { ContentView } from '@apps/helm/hooks/useScreenContext';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import type { RestoreResult } from '@apps/helm/store/actions/taskActions';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type { OpenTask } from '@apps/helm/types';

interface LinkedTasksProps {
  tasks: OpenTask[];
  emptyLine: string;
  view: ContentView;
  ownerId: string;
}

/** The open tasks linked to a who or a place, as rows that open the task's sheet like every other list does. */
function LinkedTasks({ tasks, emptyLine, view, ownerId }: LinkedTasksProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const nowMinute = Math.floor(now / 60_000) * 60_000;
  const { byId: activityById } = useAppSelector((state) =>
    selectTaskActivity(state, nowMinute),
  );
  const tasksById = useAppSelector(selectOpenTasksById);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const { held, tick, undoTick, forget } = useTaskTicks(user?.uid ?? null);
  const { pending, showUndo, undo } = useUndoRemoval();
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = [
    ...tasks,
    ...[...held.values()]
      .map((entry) => entry.task)
      .filter((task) => !tasks.some((entry) => entry.id === task.id)),
  ];
  const openTask = openId
    ? (held.get(openId)?.task ?? tasksById.get(openId) ?? null)
    : null;

  const handleDeleted = (
    taskId: string,
    title: string,
    restore: () => Promise<RestoreResult>,
  ) => {
    forget(taskId);
    showUndo(HELM_COPY.deletedTask(title), () => {
      restore()
        .then((result) => {
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

  return (
    <>
      {rows.length === 0 ? (
        <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
          {emptyLine}
        </p>
      ) : (
        <ul className='helm-card divide-border divide-y overflow-hidden'>
          {rows.map((task) => (
            <li key={task.id}>
              <TaskRow
                task={task}
                timeZone={timeZone}
                now={now}
                isDone={held.has(task.id)}
                omitLinkedId={ownerId}
                onOpen={(opened) => setOpenId(opened.id)}
                onTick={tick}
                onUndoTick={(taskId) => void undoTick(taskId)}
              />
            </li>
          ))}
        </ul>
      )}
      <TaskSheet
        task={openTask}
        screen={{
          view,
          visible: tasks.map((task) => ({
            collection: 'tasks' as const,
            id: task.id,
          })),
        }}
        doneAt={openId ? (held.get(openId)?.completedAt ?? null) : null}
        activity={openId ? (activityById.get(openId) ?? null) : null}
        onClose={() => setOpenId(null)}
        onTick={tick}
        onUndoTick={(taskId) => void undoTick(taskId)}
        onDeleted={handleDeleted}
      />
      <UndoSnackbar pending={pending} onUndo={undo} />
    </>
  );
}

export default LinkedTasks;
