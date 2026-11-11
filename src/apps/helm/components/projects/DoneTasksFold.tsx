import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import TaskRow from '@apps/helm/components/tasks/TaskRow';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import { HELM_COPY } from '@apps/helm/constants';
import { clearDoneTasks } from '@apps/helm/store/actions/projectActions';
import { reopenTask } from '@apps/helm/store/actions/taskActions';
import type { OpenTask } from '@apps/helm/types';

interface DoneTasksFoldProps {
  projectId: string;
  /** The project's done tasks that have not been cleared. */
  tasks: OpenTask[];
}

/** A project's done tasks in one fold, ticked; "Clear done tasks" hides them from it and says how many it really cleared. A cleared task is still found by search. */
function DoneTasksFold({ projectId, tasks }: DoneTasksFoldProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [isOpen, setIsOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openTask = tasks.find((task) => task.id === openId) ?? null;

  const reopen = (taskId: string) => {
    if (!user) return;
    reopenTask(user.uid, taskId).catch((error: unknown) => {
      console.error('Helm task was not reopened', error);
      addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
    });
    setOpenId(null);
  };

  const clear = async () => {
    if (!user || isClearing) return;
    if (!navigator.onLine) {
      addToast({ title: HELM_COPY.clearDoneNeedsConnection, type: 'info' });
      return;
    }
    setIsClearing(true);
    try {
      const cleared = await clearDoneTasks(
        user.uid,
        projectId,
        tasks.map((task) => task.id),
      );
      if (cleared.count === 0) {
        addToast({ title: HELM_COPY.clearDoneNone, type: 'info' });
        return;
      }
      addToast({
        title: HELM_COPY.doneTasksCleared(cleared.count),
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () =>
            void cleared.undo().catch((error: unknown) => {
              console.error('Helm cleared tasks were not put back', error);
              addToast({ title: HELM_COPY.projectUndoFailed, type: 'error' });
            }),
        },
      });
    } catch (error) {
      console.error('Helm done tasks were not cleared', error);
      addToast({ title: HELM_COPY.editFailed, type: 'error' });
    } finally {
      setIsClearing(false);
    }
  };

  if (tasks.length === 0) return null;
  return (
    <div className='space-y-2'>
      <ShowMoreButton
        isOpen={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen
          ? HELM_COPY.doneTasksHide
          : HELM_COPY.doneTasksFold(tasks.length)}
      </ShowMoreButton>
      {isOpen && (
        <>
          <ul className='helm-card divide-border divide-y overflow-hidden'>
            {tasks.map((task) => (
              <li key={task.id}>
                <TaskRow
                  task={task}
                  timeZone={timeZone}
                  now={now}
                  isDone
                  hasUndo={false}
                  omitLinkedId={projectId}
                  onOpen={(opened) => setOpenId(opened.id)}
                  onTick={() => undefined}
                  onUndoTick={reopen}
                />
              </li>
            ))}
          </ul>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            loading={isClearing}
            onClick={() => void clear()}
          >
            {HELM_COPY.clearDoneTasks}
          </Button>
        </>
      )}
      <TaskSheet
        task={openTask}
        screen={{
          view: 'project',
          visible: tasks.map((task) => ({
            collection: 'tasks' as const,
            id: task.id,
          })),
        }}
        doneAt={openTask ? (openTask.completedAt ?? openTask.createdAt) : null}
        activity={null}
        onClose={() => setOpenId(null)}
        onTick={() => undefined}
        onUndoTick={reopen}
        onDeleted={(_, title, restore) =>
          addToast({
            title: HELM_COPY.deletedTask(title),
            type: 'success',
            action: {
              label: HELM_COPY.undo,
              onClick: () =>
                void restore().catch((error: unknown) => {
                  console.error('Helm task was not restored', error);
                  addToast({ title: HELM_COPY.undoFailed, type: 'error' });
                }),
            },
          })
        }
      />
    </div>
  );
}

export default DoneTasksFold;
