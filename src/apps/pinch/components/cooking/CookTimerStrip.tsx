import { useEffect, useState, type ReactNode, type Ref } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pause, Play, RotateCcw } from 'lucide-react';

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
  className?: string;
}

const ICON_BUTTON_CLASS =
  "relative size-9 shrink-0 after:absolute after:-inset-0.5 after:content-['']";

/** One slim row however many timers run, scrolling sideways past what fits, so it never grows over the step above it. The tick lives here, so only the pills re-render as the seconds pass. */
function CookTimerStrip({
  timers,
  listRef,
  onTick,
  onPause,
  onResume,
  onDismiss,
  onJump,
  className,
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

  const isPlate = timers.some((timer) => timer.recipeTitle !== null);
  const renderTarget = (timer: CookTimer, children: ReactNode) =>
    onJump ? (
      <Button
        type='button'
        variant='tertiary'
        className="text-foreground! relative h-full min-h-0 min-w-0 flex-1 justify-start rounded-full px-0! py-0! text-left font-normal after:absolute after:inset-x-0 after:-inset-y-px after:content-[''] hover:bg-transparent"
        onClick={() => onJump(timer)}
      >
        {children}
      </Button>
    ) : (
      <span className='flex min-w-0 flex-1'>{children}</span>
    );

  return (
    <ul
      ref={listRef}
      tabIndex={-1}
      aria-label='Timers'
      className={join(
        'flex snap-x gap-2 overflow-x-auto outline-none',
        className,
      )}
    >
      {timers.map((timer) => {
        const name = getTimerCaption(timer);
        const caption = `${name} · ${timer.label}`;
        const pillClass = join(
          'flex h-10 flex-1 snap-start items-center gap-2 rounded-full border py-0 pr-0.5 pl-4',
          isPlate ? 'min-w-[min(18rem,85%)]' : 'min-w-[min(14rem,80%)]',
        );
        return timer.status === 'done' ? (
          <li
            key={timer.id}
            className={join(pillClass, 'bg-accent border-primary pr-1')}
          >
            {renderTarget(
              timer,
              <span className='min-w-0 truncate text-sm font-semibold'>
                Time's up: {caption}
              </span>,
            )}
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className="relative h-8 shrink-0 rounded-full px-3 after:absolute after:-inset-1 after:content-['']"
              aria-label={`Dismiss the ${timer.label} timer: ${name}`}
              onClick={() => onDismiss(timer.id)}
            >
              Dismiss
            </Button>
          </li>
        ) : (
          <li
            key={timer.id}
            className={join(pillClass, 'border-border bg-background')}
          >
            {renderTarget(
              timer,
              <span
                className={join(
                  'flex min-w-0 flex-1 gap-2',
                  timer.recipeTitle === null
                    ? 'items-baseline'
                    : 'items-center',
                )}
              >
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
                    {timers.some(
                      (other) =>
                        other.id !== timer.id &&
                        other.recipeId === timer.recipeId &&
                        other.stepNumber === timer.stepNumber,
                    ) && ` · ${timer.label}`}
                    {timer.status === 'paused' && ' · paused'}
                  </span>
                </span>
              </span>,
            )}
            <span className='flex shrink-0 items-center gap-3'>
              {timer.status === 'paused' && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='icon'
                  rounded='full'
                  className={ICON_BUTTON_CLASS}
                  aria-label={`Reset the ${timer.label} timer: ${name}`}
                  onClick={() => onDismiss(timer.id)}
                >
                  <RotateCcw className='h-4 w-4' aria-hidden='true' />
                </Button>
              )}
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                rounded='full'
                className={ICON_BUTTON_CLASS}
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
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default CookTimerStrip;
