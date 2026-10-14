import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pause, Play, X } from 'lucide-react';

import { formatClock } from '@/utils/durationUtils';
import {
  getRemainingMs,
  type CookTimer,
} from '@apps/pinch/hooks/useCookTimers';

const TICK_MS = 250;

interface CookTimerStripProps {
  timers: CookTimer[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDismiss: (id: string) => void;
}

/** The running timers, one pill each. Only this strip re-renders as the seconds pass. */
function CookTimerStrip({
  timers,
  onPause,
  onResume,
  onDismiss,
}: CookTimerStripProps) {
  const hasRunning = timers.some((timer) => timer.status === 'running');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasRunning) {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [hasRunning]);

  if (timers.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label='Timers'
      className='grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2'
    >
      {timers.map((timer) => {
        const caption = `Step ${timer.stepNumber} · ${timer.label}`;
        return timer.status === 'done' ? (
          <li
            key={timer.id}
            className='bg-accent border-primary flex min-h-11 items-center gap-2 rounded-full border py-0.5 pr-1 pl-4'
          >
            <span className='min-w-0 flex-1 text-sm font-semibold'>
              {caption} is done
            </span>
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
            <span className='flex min-w-0 flex-1 items-baseline gap-2'>
              <span
                className={join(
                  'text-lg font-semibold tabular-nums',
                  timer.status === 'paused' && 'text-muted-foreground',
                )}
              >
                {formatClock(getRemainingMs(timer, now))}
              </span>
              <span className='text-muted-foreground min-w-0 truncate text-xs'>
                Step {timer.stepNumber}
                {timer.status === 'paused' && ' · paused'}
              </span>
            </span>
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              rounded='full'
              className='size-10 shrink-0'
              aria-label={`${timer.status === 'running' ? 'Pause' : 'Resume'} the ${timer.label} timer for step ${timer.stepNumber}`}
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
              aria-label={`Dismiss the ${timer.label} timer for step ${timer.stepNumber}`}
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
