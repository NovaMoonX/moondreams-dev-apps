import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

import TickMark from '@/components/TickMark';
import { HELM_COPY } from '@apps/helm/constants';
import type { OpenTask } from '@apps/helm/types';

interface PlannedCardProps {
  task: OpenTask;
  /** "10:00 to 10:15 AM", or null for a task kept with no time. */
  timeLine: string | null;
  /** Set while the card is the one just ticked, kept in view with its Undo. */
  isDone: boolean;
  onOpen: (task: OpenTask) => void;
  onTick: (task: OpenTask) => void;
  onUndoTick: (taskId: string) => void;
}

/** A task the person kept for today: a solid card with its tick, opening the task's sheet. */
function PlannedCard({
  task,
  timeLine,
  isDone,
  onOpen,
  onTick,
  onUndoTick,
}: PlannedCardProps) {
  const title = task.isUnreadable ? HELM_COPY.unreadable : task.title;
  return (
    <div className='helm-card flex items-center pl-4'>
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
        className='flex h-auto min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-none border-0 py-3 pr-4 pl-3 text-left focus-visible:-outline-offset-2'
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
          {timeLine && (
            <span className='text-muted-foreground block text-[13px] break-words'>
              {isDone ? HELM_COPY.rowDone : timeLine}
            </span>
          )}
        </span>
        <ChevronRight
          className='text-muted-foreground size-4 shrink-0'
          aria-hidden='true'
        />
      </Button>
    </div>
  );
}

export default PlannedCard;
