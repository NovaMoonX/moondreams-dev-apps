import { useMemo, useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';

import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppSelector } from '@/store';
import { formatDateUTC } from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import NewTaskSheet from '@apps/helm/components/tasks/NewTaskSheet';
import TaskRow from '@apps/helm/components/tasks/TaskRow';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import { HELM_COPY, OPEN_TASKS_LIMIT } from '@apps/helm/constants';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import type { RestoreResult } from '@apps/helm/store/actions/taskActions';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type { OpenTask, TaskActivity } from '@apps/helm/types';
import { getDueSortKey } from '@apps/helm/utils/taskDue';

const { option } = DropdownMenuFactories;
const NEW_TASK = 'new-task';

interface TasksViewProps {
  onBack: () => void;
  onHome: () => void;
}

const getCondition = (
  activity: TaskActivity,
  titleOf: (taskId: string) => string,
) => {
  if (activity.kind === 'notYet') {
    return HELM_COPY.conditionNotUntil(formatDateUTC(activity.until));
  }
  if (activity.kind !== 'waiting') return null;
  const [first] = activity.onTaskIds;
  return first
    ? HELM_COPY.conditionWaitsOnTask(
        titleOf(first),
        activity.onTaskIds.length - 1,
      )
    : HELM_COPY.conditionWaitsOnWho;
};

/** Tasks: every open task awake today by its day then the ones with none, and the ones that cannot start yet folded below. */
function TasksView({ onBack, onHome }: TasksViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const nowMinute = Math.floor(now / 60_000) * 60_000;
  const { isLoaded, isFailed, items } = useAppSelector(
    (state) => state.helm.openTasks,
  );
  const {
    active,
    latent,
    byId: activityById,
  } = useAppSelector((state) => selectTaskActivity(state, nowMinute));
  const tasksById = useAppSelector(selectOpenTasksById);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const { held, tick, undoTick } = useTaskTicks(user?.uid ?? null);
  const { pending, showUndo, undo } = useUndoRemoval();
  const [openId, setOpenId] = useState<string | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [isNotYetOpen, setIsNotYetOpen] = useState(false);

  const heldTasks = useMemo(
    () => [...held.values()].map((entry) => entry.task),
    [held],
  );
  const awake = useMemo(
    () => [...active, ...heldTasks.filter((task) => !tasksById.has(task.id))],
    [active, heldTasks, tasksById],
  );
  const dated = useMemo(
    () =>
      awake
        .flatMap((task) => (task.due ? [{ task, due: task.due }] : []))
        .sort((a, b) => getDueSortKey(a.due) - getDueSortKey(b.due))
        .map(({ task }) => task),
    [awake],
  );
  const undated = useMemo(
    () =>
      awake
        .filter((task) => !task.due)
        .sort((a, b) => b.createdAt - a.createdAt),
    [awake],
  );
  const openTask = openId
    ? (held.get(openId)?.task ?? tasksById.get(openId) ?? null)
    : null;
  const titleOf = (taskId: string) => {
    const task = tasksById.get(taskId);
    return task && !task.isUnreadable ? task.title : HELM_COPY.unreadable;
  };
  const isEmpty = awake.length === 0 && latent.length === 0;

  const renderRow = (task: OpenTask, condition: string | null = null) => (
    <li key={task.id}>
      <TaskRow
        task={task}
        timeZone={timeZone}
        now={now}
        isDone={held.has(task.id)}
        condition={condition}
        onOpen={(opened) => setOpenId(opened.id)}
        onTick={tick}
        onUndoTick={(taskId) => void undoTick(taskId)}
      />
    </li>
  );

  const handleDeleted = (
    title: string,
    restore: () => Promise<RestoreResult>,
  ) => {
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
      <HelmHeader
        backLabel='Today'
        onBack={onBack}
        onHome={onHome}
        menu={{
          items: [option({ label: HELM_COPY.newTask, value: NEW_TASK })],
          onItemSelect: (value) => {
            if (value === NEW_TASK) setIsNewOpen(true);
          },
        }}
      />
      <main className='space-y-4 pt-4'>
        <h1 className='helm-serif text-[28px] leading-[34px]'>
          {HELM_COPY.tasksTitle}
        </h1>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.tasksFailed}
          </p>
        )}
        {isLoaded && isEmpty && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.tasksEmpty}
          </p>
        )}
        {dated.length > 0 && (
          <section className='space-y-3'>
            <SectionDivider label={HELM_COPY.tasksDue} />
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {dated.map((task) => renderRow(task))}
            </ul>
          </section>
        )}
        {undated.length > 0 && (
          <section className='space-y-3'>
            <SectionDivider label={HELM_COPY.tasksAnyTime} />
            <ul className='helm-card divide-border divide-y overflow-hidden'>
              {undated.map((task) => renderRow(task))}
            </ul>
          </section>
        )}
        {latent.length > 0 && (
          <section className='space-y-3'>
            <SectionDivider label={HELM_COPY.notYetDivider(latent.length)} />
            <ShowMoreButton
              isOpen={isNotYetOpen}
              onClick={() => setIsNotYetOpen((isOpen) => !isOpen)}
            >
              {isNotYetOpen ? HELM_COPY.hideNotYet : HELM_COPY.showNotYet}
            </ShowMoreButton>
            {isNotYetOpen && (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {latent.map(({ task, activity }) =>
                  renderRow(task, getCondition(activity, titleOf)),
                )}
              </ul>
            )}
          </section>
        )}
        {items.length >= OPEN_TASKS_LIMIT && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.openTasksCapped(OPEN_TASKS_LIMIT)}
          </p>
        )}
      </main>
      <NewTaskSheet
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={setOpenId}
      />
      <TaskSheet
        task={openTask}
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

export default TasksView;
