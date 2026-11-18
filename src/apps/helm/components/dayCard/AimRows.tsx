import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import TickMark from '@/components/TickMark';
import PrivateTitle from '@apps/helm/components/privacy/PrivateTitle';
import { HELM_COPY } from '@apps/helm/constants';
import type { AimRow } from '@apps/helm/hooks/useDayCard';
import type { OpenTask } from '@apps/helm/types';
import { formatAimLength } from '@apps/helm/utils/dayCard';

interface AimTickProps {
  title: string;
  isDone: boolean;
  onTick: () => void;
  onUndoTick: () => void;
}

/** The round done mark of an aim, with its 40px tap area. */
export function AimTick({ title, isDone, onTick, onUndoTick }: AimTickProps) {
  return (
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
      onClick={isDone ? onUndoTick : onTick}
    >
      {isDone && <TickMark className='size-6' />}
    </Button>
  );
}

/** An aim's length: a guess has a hollow ring and opens the picker, one said or fixed is plain words. */
export function AimLength({
  row,
  onFix,
}: {
  row: AimRow;
  onFix: (row: AimRow) => void;
}) {
  if (row.minutes !== null) {
    return <span>{formatAimLength(row.minutes)}</span>;
  }
  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-label={HELM_COPY.dayAimsFixLength(row.title)}
      className="text-muted-foreground relative -my-1 h-6 min-h-0 gap-1.5 px-1! text-[13px] font-normal before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
      onClick={() => onFix(row)}
    >
      <span
        aria-hidden='true'
        className='border-muted-foreground size-2.5 rounded-full border'
      />
      <span>
        {HELM_COPY.dayAimsGuess(formatAimLength(row.guessMinutes ?? 30))}
      </span>
    </Button>
  );
}

interface AimRowsProps {
  rows: AimRow[];
  fitLine: string | null;
  isRest: boolean;
  heldIds: ReadonlySet<string>;
  onTick: (task: OpenTask) => void;
  onUndoTick: (taskId: string) => void;
  onFixLength: (row: AimRow) => void;
  onOpenToday: () => void;
}

/** The day's aims with their times and lengths, under the line that says whether they fit. Breaks between them are never drawn. */
function AimRows({
  rows,
  fitLine,
  isRest,
  heldIds,
  onTick,
  onUndoTick,
  onFixLength,
  onOpenToday,
}: AimRowsProps) {
  if (rows.length === 0) return null;
  return (
    <div className='space-y-3'>
      {fitLine && <p className='text-[15px] text-pretty'>{fitLine}</p>}
      <ul className='divide-border divide-y'>
        {rows.map((row) => {
          const isDone = row.isDone || heldIds.has(row.taskId);
          return (
            <li key={row.taskId} className='flex items-start gap-3 py-3'>
              <span className='mt-0.5'>
                <AimTick
                  title={row.title}
                  isDone={isDone}
                  onTick={() => onTick(row.task)}
                  onUndoTick={() => onUndoTick(row.taskId)}
                />
              </span>
              <span className='min-w-0 flex-1'>
                <PrivateTitle
                  kind='task'
                  record={row.task}
                  className={join(
                    'text-[15px] leading-[21px]',
                    isDone && 'text-muted-foreground line-through',
                  )}
                >
                  {row.title}
                </PrivateTitle>
                <span className='text-muted-foreground flex flex-wrap items-center gap-x-2 text-[13px]'>
                  <span>
                    {isDone
                      ? HELM_COPY.rowDone
                      : (row.timeLabel ??
                        (row.doesntFit
                          ? HELM_COPY.dayAimsNoFit
                          : HELM_COPY.dayAimsAnyTime))}
                  </span>
                  <AimLength row={row} onFix={onFixLength} />
                </span>
                {(row.overlap || row.doesntFit) && !isDone && (
                  <Button
                    type='button'
                    variant='base'
                    className='relative mt-1 flex h-auto items-start gap-1.5 p-0 text-left text-[13px] text-[var(--helm-overdue)] after:absolute after:inset-x-0 after:-inset-y-2.5'
                    onClick={onOpenToday}
                  >
                    <TriangleAlert
                      className='mt-0.5 size-3.5 shrink-0'
                      aria-hidden='true'
                    />
                    <span className='min-w-0 break-words'>
                      {row.overlap
                        ? HELM_COPY.planNowOverlaps(row.overlap.title)
                        : HELM_COPY.dayAimsMoveOnToday}
                    </span>
                    <ChevronRight
                      className='mt-0.5 size-3.5 shrink-0'
                      aria-hidden='true'
                    />
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {isRest && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.dayAimsRestDay}
        </p>
      )}
    </div>
  );
}

export default AimRows;
