import { useMemo, useState } from 'react';

import {
  Button,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ChevronRight } from 'lucide-react';

import SectionDivider from '@/components/SectionDivider';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import HelmHeader from '@apps/helm/components/shell/HelmHeader';
import ConnectCalendarRow from '@apps/helm/components/today/ConnectCalendarRow';
import DayPlan from '@apps/helm/components/today/DayPlan';
import DayStrip from '@apps/helm/components/today/DayStrip';
import PastDay from '@apps/helm/components/today/PastDay';
import SuggestionSheet, {
  type SuggestionTarget,
} from '@apps/helm/components/today/SuggestionSheet';
import SyncedToday from '@apps/helm/components/today/SyncedToday';
import NewTaskSheet from '@apps/helm/components/tasks/NewTaskSheet';
import TaskRow from '@apps/helm/components/tasks/TaskRow';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import { HELM_COPY, OPEN_TASKS_LIMIT } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useAutoPlanToday, usePlanSources } from '@apps/helm/hooks/usePlanDays';
import { useScreenContext } from '@apps/helm/hooks/useScreenContext';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import type { RestoreResult } from '@apps/helm/store/actions/taskActions';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import { getStripKeys, toDayKey } from '@apps/helm/utils/planDays';
import {
  DUE_SOON_DAYS,
  getDueDaysAway,
  getDueSortKey,
} from '@apps/helm/utils/taskDue';

const { option } = DropdownMenuFactories;
const NEW_TASK = 'new-task';

interface TodayViewProps {
  onBack: () => void;
  onHome: () => void;
  onOpenTasks: () => void;
}

/** Today: a strip of days with each day's events and plan (what was kept and what is suggested), and on today the open tasks that are awake and overdue or due in the next week, soonest first, with a door to all of them; its first-run line until there is a task. */
function TodayView({ onBack, onHome, onOpenTasks }: TodayViewProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const assistantName = useAssistantName();
  const now = useNow(60_000);
  const nowMinute = Math.floor(now / 60_000) * 60_000;
  const {
    items: tasks,
    isLoaded,
    isFailed,
  } = useAppSelector((state) => state.helm.openTasks);
  const {
    active,
    latent,
    byId: activityById,
  } = useAppSelector((state) => selectTaskActivity(state, nowMinute));
  const tasksById = useAppSelector(selectOpenTasksById);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const { held, tick, undoTick, forget } = useTaskTicks(user?.uid ?? null);
  const { pending, showUndo, undo } = useUndoRemoval();
  const [openId, setOpenId] = useState<string | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SuggestionTarget | null>(null);
  const sources = usePlanSources(nowMinute);
  const todayKey = toDayKey(nowMinute, timeZone);
  const selectedKey = pickedKey ?? todayKey;
  const isToday = selectedKey === todayKey;
  useAutoPlanToday(isToday);

  const dueSoon = useMemo(
    () =>
      [
        ...active,
        ...[...held.values()]
          .map((entry) => entry.task)
          .filter((task) => !tasksById.has(task.id)),
      ]
        .flatMap((task) =>
          task.due && getDueDaysAway(task.due, timeZone, now) <= DUE_SOON_DAYS
            ? [{ task, due: task.due }]
            : [],
        )
        .sort((a, b) => getDueSortKey(a.due) - getDueSortKey(b.due)),
    [active, held, tasksById, timeZone, now],
  );
  const visibleRefs = dueSoon.map(({ task }) => ({
    collection: 'tasks' as const,
    id: task.id,
  }));
  useScreenContext('today', null, visibleRefs, {
    ask: HELM_COPY.askToday,
    chip: HELM_COPY.chipToday,
    back: HELM_COPY.backToToday,
  });
  const openTask = openId
    ? (held.get(openId)?.task ?? tasksById.get(openId) ?? null)
    : null;
  const isCapped = tasks.length >= OPEN_TASKS_LIMIT;

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
      <HelmHeader
        backLabel='Home'
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
        <h1 className='helm-serif text-[28px] leading-[34px]'>Today</h1>
        {isFailed && !isLoaded && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.tasksFailed}
          </p>
        )}
        {isLoaded && tasks.length === 0 && held.size === 0 && (
          <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
            {HELM_COPY.todayFirstRun(assistantName)}
          </p>
        )}
        {sources && (
          <DayStrip
            keys={getStripKeys(todayKey)}
            todayKey={todayKey}
            selectedKey={selectedKey}
            onSelect={setPickedKey}
          />
        )}
        <ConnectCalendarRow />
        {sources &&
          (selectedKey < todayKey ? (
            <PastDay dayKey={selectedKey} sources={sources} />
          ) : (
            <DayPlan
              dayKey={selectedKey}
              sources={sources}
              getTask={(taskId) =>
                tasksById.get(taskId) ?? held.get(taskId)?.task ?? null
              }
              heldIds={new Set(held.keys())}
              onOpenTask={setOpenId}
              onOpenSuggestion={setSuggestion}
              onTick={tick}
              onUndoTick={(taskId) => void undoTick(taskId)}
              onSelectDay={setPickedKey}
            />
          ))}
        {isToday && <SyncedToday now={now} />}
        {isToday && isLoaded && (tasks.length > 0 || held.size > 0) && (
          <section className='space-y-3'>
            <SectionDivider label={HELM_COPY.todayDueSoon} />
            {dueSoon.length === 0 ? (
              !isCapped && (
                <p className='helm-card text-muted-foreground p-4 text-[15px] text-pretty'>
                  {HELM_COPY.nothingDueSoon}
                </p>
              )
            ) : (
              <ul className='helm-card divide-border divide-y overflow-hidden'>
                {dueSoon.map(({ task }) => (
                  <li key={task.id}>
                    <TaskRow
                      task={task}
                      timeZone={timeZone}
                      now={now}
                      isDone={held.has(task.id)}
                      onOpen={(opened) => setOpenId(opened.id)}
                      onTick={tick}
                      onUndoTick={(taskId) => void undoTick(taskId)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {isCapped && (
              <p className='text-muted-foreground text-[13px] text-pretty'>
                {HELM_COPY.openTasksCapped(OPEN_TASKS_LIMIT)}
              </p>
            )}
            <Button
              type='button'
              variant='tertiary'
              className='helm-card flex h-auto w-full items-center justify-between gap-3 px-4 py-3 text-left'
              onClick={onOpenTasks}
            >
              <span className='text-[15px]'>
                {HELM_COPY.allTasks} ·{' '}
                {HELM_COPY.openCount(active.length + latent.length)}
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </section>
        )}
      </main>
      <NewTaskSheet
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={setOpenId}
      />
      <TaskSheet
        task={openTask}
        screen={{ view: 'today', visible: visibleRefs }}
        doneAt={openId ? (held.get(openId)?.completedAt ?? null) : null}
        activity={openId ? (activityById.get(openId) ?? null) : null}
        onClose={() => setOpenId(null)}
        onTick={tick}
        onUndoTick={(taskId) => void undoTick(taskId)}
        onDeleted={handleDeleted}
      />
      <SuggestionSheet
        target={suggestion}
        sources={sources}
        onClose={() => setSuggestion(null)}
        onSkipped={showUndo}
      />
      <UndoSnackbar pending={pending} onUndo={undo} />
    </>
  );
}

export default TodayView;
