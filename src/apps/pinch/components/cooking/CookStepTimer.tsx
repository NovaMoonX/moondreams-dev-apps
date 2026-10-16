import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Pause, Play, RotateCcw } from 'lucide-react';

import { formatClock } from '@/utils/durationUtils';
import {
  getRemainingMs,
  type CookTimer,
} from '@apps/pinch/hooks/useCookTimers';

const TICK_MS = 250;

interface CookStepTimerProps {
  seconds: number;
  /** "30 min", what the timer is called in its labels. */
  label: string;
  /** The timer once started; null while the card waits for Start. */
  timer: CookTimer | null;
  /** The digits' size, from the step's own type ramp. */
  clockClassName: string;
  /** Several cards stack under one step, so each takes less height. */
  isCompact: boolean;
  canStart: boolean;
  onStart: () => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDismiss: (id: string) => void;
  onTick: () => void;
}

/** One time a step mentions, ready to start: the same card then counts down, pauses, and says when it's done. The tick lives here, so only the card re-renders as the seconds pass. */
function CookStepTimer({
  seconds,
  label,
  timer,
  clockClassName,
  isCompact,
  canStart,
  onStart,
  onPause,
  onResume,
  onDismiss,
  onTick,
}: CookStepTimerProps) {
  const mainRef = useRef<HTMLButtonElement>(null);
  const isRunning = timer?.status === 'running';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
      onTick();
    }, TICK_MS);
    return () => window.clearInterval(intervalId);
  }, [isRunning, onTick]);

  const status = timer?.status ?? 'ready';
  const remainingMs =
    timer === null ? seconds * 1000 : getRemainingMs(timer, now);
  const getMain = () => {
    if (timer === null) {
      return {
        text: 'Start',
        icon: <Play className='h-4 w-4' aria-hidden='true' />,
        variant: 'primary' as const,
        onClick: onStart,
      };
    }
    if (timer.status === 'running') {
      return {
        text: 'Pause',
        icon: <Pause className='h-4 w-4' aria-hidden='true' />,
        variant: 'secondary' as const,
        onClick: () => onPause(timer.id),
      };
    }
    if (timer.status === 'paused') {
      return {
        text: 'Resume',
        icon: <Play className='h-4 w-4' aria-hidden='true' />,
        variant: 'primary' as const,
        onClick: () => onResume(timer.id),
      };
    }
    return {
      text: 'Dismiss',
      icon: null,
      variant: 'primary' as const,
      onClick: () => onDismiss(timer.id),
    };
  };
  const main = getMain();
  const getCaption = () => {
    if (status === 'ready') return '⏲️ Timer';
    if (status === 'paused') return 'Paused';
    if (status === 'done') return `${label} timer`;
    return `⏲️ ${label} timer`;
  };

  return (
    <li
      aria-label={`${label} timer`}
      className={join(
        'flex items-center gap-3 rounded-2xl border pr-2.5 pl-4',
        isCompact ? 'py-1.5' : 'py-2.5',
        '[@media(max-height:640px)]:py-1.5',
        status === 'ready' && 'border-border bg-background',
        status === 'running' &&
          'border-[var(--pinch-drizzle)] bg-[var(--pinch-drizzle-soft)]',
        status === 'paused' && 'border-border bg-muted/50',
        status === 'done' && 'border-primary bg-accent',
      )}
    >
      <div className='min-w-0 flex-1'>
        <p className='text-muted-foreground truncate text-xs'>{getCaption()}</p>
        <p
          aria-hidden='true'
          className={join(
            'leading-tight font-semibold tabular-nums',
            clockClassName,
            status === 'paused' && 'text-muted-foreground',
          )}
        >
          {status === 'done' ? "Time's up" : formatClock(remainingMs)}
        </p>
        <span role='status' className='sr-only'>
          {status === 'done' ? `The ${label} timer is done.` : ''}
        </span>
      </div>
      {status === 'paused' && timer !== null && (
        <Button
          type='button'
          variant='tertiary'
          size='icon'
          rounded='full'
          className='size-10 shrink-0'
          aria-label={`Reset the ${label} timer`}
          onClick={() => {
            onDismiss(timer.id);
            window.requestAnimationFrame(() =>
              mainRef.current?.focus({ preventScroll: true }),
            );
          }}
        >
          <RotateCcw className='h-4 w-4' aria-hidden='true' />
        </Button>
      )}
      <Button
        ref={mainRef}
        type='button'
        variant={main.variant}
        className={join(
          'shrink-0 gap-1.5 px-4 text-base',
          isCompact ? 'h-10' : 'h-12',
          '[@media(max-height:640px)]:h-10',
        )}
        aria-label={`${main.text} the ${label} timer`}
        disabled={timer === null && !canStart}
        onClick={main.onClick}
      >
        {main.icon}
        {main.text}
      </Button>
    </li>
  );
}

export default CookStepTimer;
