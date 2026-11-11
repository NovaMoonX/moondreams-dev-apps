import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Stethoscope,
} from 'lucide-react';

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
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import TaskSheet from '@apps/helm/components/tasks/TaskSheet';
import SyncedSheet from '@apps/helm/components/today/SyncedSheet';
import { DAY_MS, HELM_COPY } from '@apps/helm/constants';
import { useTaskTicks } from '@apps/helm/hooks/useTaskTicks';
import type { RestoreResult } from '@apps/helm/store/actions/taskActions';
import { selectOpenTasksById } from '@apps/helm/store/selectors/captureSelectors';
import {
  selectAllTopics,
  selectNoteById,
} from '@apps/helm/store/selectors/knowledgeSelectors';
import { selectTaskActivity } from '@apps/helm/store/selectors/taskSelectors';
import type { SourceRef, SyncedRecord } from '@apps/helm/types';
import { formatTaskDue } from '@apps/helm/utils/taskDue';
import { pathOf } from '@apps/helm/utils/topicTree';

type SyncedSource = Extract<SourceRef, { kind: 'synced' }>;
type ConnectionSource = Extract<SourceRef, { kind: 'connection' }>;
type NoteSource = Extract<SourceRef, { kind: 'note' }>;

const ROW =
  'flex h-auto min-h-12 w-full items-center justify-start gap-3 rounded-none border-0 px-0! py-2.5! text-left';

interface RowBodyProps {
  mark: React.ReactNode;
  title: string;
  detail: string | string[] | null;
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
        {(Array.isArray(detail) ? detail : [detail]).flatMap((line) =>
          line ? (
            <span
              key={line}
              className='text-muted-foreground block text-[13px] break-words'
            >
              {line}
            </span>
          ) : (
            []
          ),
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

function SourceMark({ connectorId }: { connectorId: string }) {
  return connectorId === 'google:calendar' ? (
    <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
      <CalendarDays className='size-5' aria-hidden='true' />
    </span>
  ) : (
    <AppLogo
      appId={readConnectorAppId(connectorId) ?? ''}
      className='size-9 rounded-lg'
    />
  );
}

function PlainRow({ mark, title, detail }: Omit<RowBodyProps, 'hasDoor'>) {
  return (
    <div className={ROW}>
      <RowBody mark={mark} title={title} detail={detail} hasDoor={false} />
    </div>
  );
}

interface RowProps {
  canOpen: boolean;
}

function TaskSourceRow({ taskId, canOpen }: RowProps & { taskId: string }) {
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
  const detail = task.due ? formatTaskDue(task.due, timeZone, now) : null;
  if (!canOpen) return <PlainRow mark={null} title={title} detail={detail} />;
  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        className={ROW}
        aria-label={HELM_COPY.answerOpenSource(title)}
        onClick={() => setIsOpen(true)}
      >
        <RowBody mark={null} title={title} detail={detail} hasDoor />
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

function SyncedSourceRow({
  source,
  canOpen,
}: RowProps & { source: SyncedSource }) {
  const now = useNow(60_000);
  const record = useAppSelector(
    (state) =>
      state.helm.synced.items.find((entry) => entry.id === source.id) ?? null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const mark = <SourceMark connectorId={source.connectorId} />;
  const title = record
    ? (record.sealed.title ?? HELM_COPY.unreadable)
    : (source.title ?? HELM_COPY.answerSyncedGone);
  const detail = toSyncedDay(source, record);
  if (!record || !canOpen) {
    return <PlainRow mark={mark} title={title} detail={detail} />;
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

function NoteSourceRow({ source, canOpen }: RowProps & { source: NoteSource }) {
  const note = useAppSelector(selectNoteById).get(source.id) ?? null;
  const topics = useAppSelector(selectAllTopics);
  const isLoaded = useAppSelector((state) => state.helm.notes.isLoaded);
  const [isOpen, setIsOpen] = useState(false);
  const liveTopic = note
    ? topics.find((topic) => note.topicIds.includes(topic.id))
    : undefined;
  const place = liveTopic
    ? `${liveTopic.emoji ? `${liveTopic.emoji} ` : ''}${pathOf(liveTopic.id, topics).join(' › ')}`
    : null;
  if (!note && isLoaded) {
    return (
      <p className='text-muted-foreground py-2.5 text-[13px]'>
        {HELM_COPY.answerNoteGone}
      </p>
    );
  }
  if (!note) {
    return (
      <PlainRow
        mark={
          <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
            <BookOpen className='size-5' aria-hidden='true' />
          </span>
        }
        title={source.title || HELM_COPY.noteUntitled}
        detail={[
          HELM_COPY.answerNoteMark(
            source.topicPath
              ? `${source.topicEmoji ? `${source.topicEmoji} ` : ''}${source.topicPath}`
              : null,
          ),
        ]}
      />
    );
  }
  const title = note.isUnreadable
    ? HELM_COPY.unreadable
    : note.title || HELM_COPY.noteUntitled;
  const detail = [
    HELM_COPY.answerNoteMark(place),
    ...(note.isFromGeneralAnswer
      ? [
          note.checkedAt === null
            ? HELM_COPY.answerNoteNotChecked
            : HELM_COPY.answerNoteChecked,
        ]
      : []),
    ...(note.hasHealthCaution ? [HELM_COPY.answerHealthCaution] : []),
  ];
  const mark = (
    <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
      {note.hasHealthCaution ? (
        <Stethoscope className='size-5' aria-hidden='true' />
      ) : (
        <BookOpen className='size-5' aria-hidden='true' />
      )}
    </span>
  );
  if (!canOpen) return <PlainRow mark={mark} title={title} detail={detail} />;
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
      <NoteSheet
        noteId={isOpen ? note.id : null}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

function ConnectionSourceRow({ source }: { source: ConnectionSource }) {
  return (
    <PlainRow
      mark={<SourceMark connectorId={source.connectorId} />}
      title={source.name}
      detail={source.label}
    />
  );
}

interface AnswerSourcesProps {
  sources: SourceRef[];
  /** Inside a sheet a source can't open a sheet of its own, so its row only names it. */
  canOpen: boolean;
}

/** Where a records answer came from, one row per source; a kind not built yet draws nothing. */
function AnswerSources({ sources, canOpen }: AnswerSourcesProps) {
  const rows = sources.flatMap((source) => {
    if (source.kind === 'task') {
      return [
        <TaskSourceRow
          key={`task:${source.id}`}
          taskId={source.id}
          canOpen={canOpen}
        />,
      ];
    }
    if (source.kind === 'note') {
      return [
        <NoteSourceRow
          key={`note:${source.id}`}
          source={source}
          canOpen={canOpen}
        />,
      ];
    }
    if (source.kind === 'synced') {
      return [
        <SyncedSourceRow
          key={`synced:${source.id}`}
          source={source}
          canOpen={canOpen}
        />,
      ];
    }
    if (source.kind === 'connection') {
      return [
        <ConnectionSourceRow
          key={`connection:${source.connectorId}:${source.accountId}`}
          source={source}
        />,
      ];
    }
    return [];
  });
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
