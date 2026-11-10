import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarDays, ChevronRight } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import UndoSnackbar from '@/components/UndoSnackbar';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useUndoRemoval } from '@/hooks/useUndoRemoval';
import { readConnectorAppId } from '@/lib/connections/contract';
import { useAppSelector } from '@/store';
import {
  formatDateShort,
  formatDateShortUTC,
  formatTime,
} from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import SyncedSheet from '@apps/helm/components/today/SyncedSheet';
import { DAY_MS, HELM_COPY } from '@apps/helm/constants';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import type { RestoreResult } from '@apps/helm/store/actions/taskActions';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type { SourceRef, SyncedRecord } from '@apps/helm/types';
import { formatTaskDue } from '@apps/helm/utils/taskDue';

type SyncedSource = Extract<SourceRef, { kind: 'synced' }>;

const ROW =
  'flex h-auto min-h-12 w-full items-center justify-start gap-3 rounded-none border-0 px-0 py-2.5 text-left';

interface RowBodyProps {
  mark: React.ReactNode;
  title: string;
  detail: string | null;
  hasDoor: boolean;
}

function RowBody({ mark, title, detail, hasDoor }: RowBodyProps) {
  return (
    <>
      {mark}
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {title}
        </span>
        {detail && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {detail}
          </span>
        )}
      </span>
      {hasDoor && (
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      )}
    </>
  );
}

function TaskSourceRow({ taskId }: { taskId: string }) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const nowMinute = Math.floor(now / 60_000) * 60_000;
  const tasksById = useAppSelector(selectOpenTasksById);
  const activity = useAppSelector((state) =>
    selectTaskActivity(state, nowMinute),
  );
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const { held, tick, undoTick, forget } = useTaskTicks(user?.uid ?? null);
  const { pending, showUndo, undo } = useUndoRemoval();
  const [isOpen, setIsOpen] = useState(false);
  const task = held.get(taskId)?.task ?? tasksById.get(taskId) ?? null;

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

  if (!task) {
    return (
      <p className='text-muted-foreground py-2.5 text-[13px]'>
        {HELM_COPY.answerTaskGone}
      </p>
    );
  }
  const title = task.isUnreadable ? HELM_COPY.unreadable : task.title;
  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className={ROW}
        aria-label={HELM_COPY.answerOpenSource(title)}
        onClick={() => setIsOpen(true)}
      >
        <RowBody
          mark={null}
          title={title}
          detail={task.due ? formatTaskDue(task.due, timeZone, now) : null}
          hasDoor
        />
      </Button>
      <TaskSheet
        task={isOpen ? task : null}
        screen={{
          view: 'tasks',
          visible: [{ collection: 'tasks', id: task.id }],
        }}
        doneAt={held.get(task.id)?.completedAt ?? null}
        activity={activity.byId.get(task.id) ?? null}
        onClose={() => setIsOpen(false)}
        onTick={tick}
        onUndoTick={(taskId) => void undoTick(taskId)}
        onDeleted={handleDeleted}
      />
      <UndoSnackbar pending={pending} onUndo={undo} />
    </>
  );
}

const isDateOnly = (startAt: number) => startAt % DAY_MS === 0;

const toSyncedDay = (
  source: SyncedSource,
  record: SyncedRecord | null,
): string | null => {
  const startAt = record ? record.startAt : source.startAt;
  if (startAt === null) return null;
  const isAllDay = record ? record.isAllDay : isDateOnly(startAt);
  return isAllDay
    ? formatDateShortUTC(startAt)
    : `${formatDateShort(startAt)}, ${formatTime(startAt)}`;
};

function SyncedSourceRow({ source }: { source: SyncedSource }) {
  const now = useNow(60_000);
  const record = useAppSelector(
    (state) =>
      state.helm.synced.items.find((entry) => entry.id === source.id) ?? null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const isCalendar = source.connectorId === 'google:calendar';
  const mark = isCalendar ? (
    <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
      <CalendarDays className='size-5' aria-hidden='true' />
    </span>
  ) : (
    <AppLogo
      appId={readConnectorAppId(source.connectorId) ?? ''}
      className='size-9 rounded-lg'
    />
  );
  const title = record?.sealed.title ?? source.title ?? HELM_COPY.unreadable;
  const detail = toSyncedDay(source, record);
  if (!record) {
    return (
      <div className={`${ROW} text-left`}>
        <RowBody mark={mark} title={title} detail={detail} hasDoor={false} />
      </div>
    );
  }
  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className={ROW}
        aria-label={HELM_COPY.answerOpenSource(title)}
        onClick={() => setIsOpen(true)}
      >
        <RowBody mark={mark} title={title} detail={detail} hasDoor />
      </Button>
      <SyncedSheet
        record={isOpen ? record : null}
        now={now}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

interface AnswerSourcesProps {
  sources: SourceRef[];
}

/** Where a records answer came from, one row per source that can be opened; a kind not built yet draws nothing. */
function AnswerSources({ sources }: AnswerSourcesProps) {
  const rows = sources.flatMap((source) =>
    source.kind === 'task'
      ? [<TaskSourceRow key={`task:${source.id}`} taskId={source.id} />]
      : source.kind === 'synced'
        ? [<SyncedSourceRow key={`synced:${source.id}`} source={source} />]
        : [],
  );
  if (rows.length === 0) return null;
  return (
    <div
      role='group'
      aria-label={HELM_COPY.answerSourcesLabel}
      className='divide-border border-border flex flex-col divide-y border-t'
    >
      {rows}
    </div>
  );
}

export default AnswerSources;
