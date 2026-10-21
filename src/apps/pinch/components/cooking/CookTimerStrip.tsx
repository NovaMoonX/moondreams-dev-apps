import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { BellRing } from 'lucide-react';

import { useOnTabReturn } from '@/hooks/useOnTabReturn';
import { formatClock } from '@/utils/durationUtils';
import {
  getRemainingMs,
  type CookTimer,
} from '@apps/pinch/hooks/useCookTimers';
import { getTimerCaption } from '@apps/pinch/utils/cooks';

const TICK_MS = 250;

interface CookTimerStripProps {
  /** Finished ones first, then in the order they started. */
  timers: CookTimer[];
  onTick: () => void;
  /** Brings a timer into focus; null while the screen holds a draft the timer view shouldn't cover. */
  onFocus: ((id: string) => void) | null;
  className?: string;
}

/** The timers running in the background as one row of pills, each only its time left and a short name; a tap brings that timer into focus, where its controls are. The pills mount only while there are timers, so each return from the timer view reads the clock afresh instead of showing the last tick, and the tick lives here, so only the pills re-render as the seconds pass. */
function CookTimerStrip(props: CookTimerStripProps) {
  if (props.timers.length === 0) {
    return null;
  }
  return <Pills {...props} />;
}

function Pills({ timers, onTick, onFocus, className }: CookTimerStripProps) {
  const hasRunning = timers.some((timer) => timer.status === 'running');
  const [now, setNow] = useState(() => Date.now());

  useOnTabReturn(() => setNow(Date.now()));

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

  return (
    <ul
      aria-label='Timers'
      className={join('flex snap-x gap-2 overflow-x-auto', className)}
    >
      {timers.map((timer) => {
        const isSharedStep =
          timer.recipeId !== null &&
          timers.some(
            (other) =>
              other.id !== timer.id &&
              other.recipeId === timer.recipeId &&
              other.stepNumber === timer.stepNumber,
          );
        const name = isSharedStep
          ? `${timer.label} · ${timer.stepName}`
          : timer.stepName;
        const status =
          timer.status === 'done'
            ? ", time's up"
            : timer.status === 'paused'
              ? ', paused'
              : '';
        const pillClass = join(
          'flex h-10 w-full min-w-0 snap-start items-center justify-start gap-2 rounded-full border px-3.5 text-left',
          timer.status === 'done' && 'border-primary bg-accent',
          timer.status === 'paused' && 'border-border bg-muted/50',
          timer.status === 'running' && 'border-border bg-background',
        );
        const content = [
          timer.status === 'done' && (
            <BellRing
              key='icon'
              className='h-4 w-4 shrink-0'
              aria-hidden='true'
            />
          ),
          <span
            key='time'
            className={join(
              'shrink-0 text-base font-semibold whitespace-nowrap tabular-nums',
              timer.status === 'paused' && 'text-muted-foreground',
            )}
          >
            {timer.status === 'done'
              ? "Time's up"
              : formatClock(getRemainingMs(timer, now))}
          </span>,
          <span
            key='name'
            className='text-muted-foreground min-w-0 truncate text-sm'
          >
            {timer.status === 'paused' ? `Paused · ${name}` : name}
          </span>,
        ];
        return (
          <li key={timer.id} className='flex max-w-72 shrink-0'>
            {onFocus ? (
              <Button
                type='button'
                variant='tertiary'
                className={join('text-foreground! py-0 font-normal', pillClass)}
                aria-label={`${getTimerCaption(timer)}, ${timer.label} timer${status}`}
                onClick={() => onFocus(timer.id)}
              >
                {content}
              </Button>
            ) : (
              <span className={pillClass}>{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default CookTimerStrip;
