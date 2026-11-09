import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import TickMark from '@/components/TickMark';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenTask } from '@apps/helm/types';
import { formatTaskDue, isOverdue } from '@apps/helm/utils/taskDue';
import { getOrderedSteps } from '@apps/helm/utils/taskEdits';

interface TaskRowProps {
  task: OpenTask;
  timeZone: string;
  now: number;
  /** Set while the row is the one just ticked, kept in view with its Undo. */
  isDone: boolean;
  /** Why the task is not awake yet ("Not until Fri, Nov 13"), shown in place of its day. */
  condition?: string | null;
  onOpen: (task: OpenTask) => void;
  onTick: (task: OpenTask) => void;
  onUndoTick: (taskId: string) => void;
}

/** One task: its tick, its words and a line of what is worth knowing at a glance. Opens the task's sheet. */
function TaskRow({
  task,
  timeZone,
  now,
  isDone,
  condition = null,
  onOpen,
  onTick,
  onUndoTick,
}: TaskRowProps) {
  const title = task.isUnreadable ? HELM_COPY.unreadable : task.title;
  const steps = getOrderedSteps(task);
  const dueLine = task.due && formatTaskDue(task.due, timeZone, now);
  const isLate =
    !isDone &&
    !condition &&
    task.due !== null &&
    isOverdue(task.due, timeZone, now);
  const dayPart = isDone
    ? HELM_COPY.rowDone
    : (condition ??
      (isLate && dueLine ? HELM_COPY.overdueDue(dueLine) : dueLine));
  const otherParts = isDone
    ? []
    : [
        ...(steps.length > 0
          ? [
              HELM_COPY.stepsCount(
                steps.filter((step) => step.doneAt !== null).length,
                steps.length,
              ),
            ]
          : []),
        ...(task.isUrgent ? [HELM_COPY.urgentLabel] : []),
      ];

  return (
    <div className='flex items-center pl-4'>
      <Button
        type='button'
        variant='tertiary'
        rounded='full'
        className={join(
          "relative size-6 min-h-0 min-w-0 shrink-0 border-2 p-0! after:absolute after:-inset-2.5 after:content-['']",
          isDone
            ? 'border-transparent'
            : 'border-muted-foreground/60 bg-transparent',
        )}
        aria-label={
          isDone ? HELM_COPY.markNotDone(title) : HELM_COPY.markDone(title)
        }
        onClick={() => (isDone ? onUndoTick(task.id) : onTick(task))}
      >
        {isDone && <TickMark className='size-6' />}
      </Button>
      <Button
        type='button'
        variant='tertiary'
        className='flex h-auto min-w-0 flex-1 items-center justify-between gap-3 rounded-none border-0 py-3 pr-4 pl-3 text-left focus-visible:-outline-offset-2'
        onClick={() => onOpen(task)}
      >
        <span className='min-w-0 flex-1'>
          <span
            className={join(
              'block text-[15px] leading-[21px] break-words',
              isDone ? 'text-muted-foreground line-through' : 'text-foreground',
            )}
          >
            {title}
          </span>
          {(dayPart || otherParts.length > 0) && (
            <span className='text-muted-foreground block text-[13px] break-words'>
              {dayPart && (
                <span className={join(isLate && 'text-[var(--helm-overdue)]')}>
                  {dayPart}
                </span>
              )}
              {otherParts.map((part, index) => (
                <span key={part}>
                  {dayPart || index > 0 ? ' · ' : ''}
                  {part}
                </span>
              ))}
            </span>
          )}
        </span>
        {!isDone && (
          <ChevronRight
            className='text-muted-foreground size-4 shrink-0'
            aria-hidden='true'
          />
        )}
      </Button>
      {isDone && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='mr-3 shrink-0 font-semibold'
          onClick={() => onUndoTick(task.id)}
        >
          {HELM_COPY.undo}
        </Button>
      )}
    </div>
  );
}

export default TaskRow;
