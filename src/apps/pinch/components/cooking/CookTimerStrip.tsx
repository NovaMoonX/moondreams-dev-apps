import { useEffect, useState, type ReactNode, type Ref } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pause, Play, X } from 'lucide-react';

import { formatClock } from '@/utils/durationUtils';
import {
  getRemainingMs,
  type CookTimer,
} from '@apps/pinch/hooks/useCookTimers';
import { getTimerCaption } from '@apps/pinch/utils/cooks';

const TICK_MS = 250;

interface CookTimerStripProps {
  timers: CookTimer[];
  listRef: Ref<HTMLUListElement>;
  onTick: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Shows the timer's recipe and step; null while the screen holds a draft it shouldn't leave. */
  onJump: ((timer: CookTimer) => void) | null;
}

/** The tick lives here, so only the pills re-render as the seconds pass. */
function CookTimerStrip({
  timers,
  listRef,
  onTick,
  onPause,
  onResume,
  onDismiss,
  onJump,
}: CookTimerStripProps) {
  const hasRunning = timers.some((timer) => timer.status === 'running');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [hasRunning, onTick]);

  if (timers.length === 0) {
    return null;
  }

  const renderTarget = (
    timer: CookTimer,
    className: string,
    children: ReactNode,
  ) =>
    onJump ? (
      <Button
        type='button'
        variant='tertiary'
        className={join(
          'text-foreground! h-auto min-h-10 min-w-0 flex-1 justify-start rounded-full px-0! py-1 text-left font-normal hover:bg-transparent',
          className,
        )}
        onClick={() => onJump(timer)}
      >
        {children}
      </Button>
    ) : (
      <span className={join('min-w-0 flex-1', className)}>{children}</span>
    );

  return (
    <ul
      ref={listRef}
      tabIndex={-1}
      aria-label='Timers'
      className='grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2 outline-none'
    >
      {timers.map((timer) => {
        const name = getTimerCaption(timer);
        const caption = `${name} · ${timer.label}`;
        return timer.status === 'done' ? (
          <li
            key={timer.id}
            className='bg-accent border-primary flex min-h-11 items-center gap-2 rounded-full border py-0.5 pr-1 pl-4'
          >
            {renderTarget(
              timer,
              'text-sm font-semibold',
              <span className='min-w-0'>{caption} is done</span>,
            )}
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-10 shrink-0 rounded-full px-4'
              onClick={() => onDismiss(timer.id)}
            >
              Dismiss
            </Button>
          </li>
        ) : (
          <li
            key={timer.id}
            className='border-border bg-background flex min-h-11 items-center gap-1 rounded-full border py-0.5 pr-0.5 pl-4'
          >
            {renderTarget(
              timer,
              timer.recipeTitle === null
                ? 'flex items-baseline gap-2'
                : 'flex items-center gap-2',
              <>
                <span
                  className={join(
                    'text-lg font-semibold tabular-nums',
                    timer.status === 'paused' && 'text-muted-foreground',
                  )}
                >
                  {formatClock(getRemainingMs(timer, now))}
                </span>
                <span className='text-muted-foreground min-w-0 text-xs'>
                  {timer.recipeTitle !== null && (
                    <span className='block truncate'>{timer.recipeTitle}</span>
                  )}
                  <span className='block truncate'>
                    {timer.stepName}
                    {timer.status === 'paused' && ' · paused'}
                  </span>
                </span>
              </>,
            )}
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              className='size-10 shrink-0'
              aria-label={`${timer.status === 'running' ? 'Pause' : 'Resume'} the ${timer.label} timer: ${name}`}
              onClick={() =>
                timer.status === 'running'
                  ? onPause(timer.id)
                  : onResume(timer.id)
              }
            >
              {timer.status === 'running' ? (
                <Pause className='h-4 w-4' aria-hidden='true' />
              ) : (
                <Play className='h-4 w-4' aria-hidden='true' />
              )}
            </Button>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              className='size-10 shrink-0'
              aria-label={`Dismiss the ${timer.label} timer: ${name}`}
              onClick={() => onDismiss(timer.id)}
            >
              <X className='h-4 w-4' aria-hidden='true' />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export default CookTimerStrip;
