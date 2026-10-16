import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Play } from 'lucide-react';

import { formatClock } from '@/utils/durationUtils';

interface CookStepTimerProps {
  seconds: number;
  /** "30 min", what the timer is called in its labels. */
  label: string;
  clockClassName: string;
  /** Several cards stack under one step, so each takes less height. */
  isCompact: boolean;
  canStart: boolean;
  onStart: () => void;
}

/** One time a step mentions, ready to start. Start hands the screen to the timer view, so the card only ever waits. */
function CookStepTimer({
  seconds,
  label,
  clockClassName,
  isCompact,
  canStart,
  onStart,
}: CookStepTimerProps) {
  return (
    <li
      aria-label={`${label} timer`}
      className={join(
        'border-border bg-background flex items-center gap-3 rounded-2xl border pr-2.5 pl-4',
        isCompact ? 'py-1.5' : 'py-2.5',
        '[@media(max-height:640px)]:py-1.5',
      )}
    >
      <div className='min-w-0 flex-1'>
        <p className='text-muted-foreground truncate text-xs'>⏲️ Timer</p>
        <p
          aria-hidden='true'
          className={join(
            'leading-tight font-semibold tabular-nums',
            clockClassName,
          )}
        >
          {formatClock(seconds * 1000)}
        </p>
      </div>
      <Button
        type='button'
        className={join(
          'shrink-0 gap-1.5 px-4 text-base',
          isCompact ? 'h-10' : 'h-12',
          '[@media(max-height:640px)]:h-10',
        )}
        aria-label={`Start the ${label} timer`}
        disabled={!canStart}
        onClick={onStart}
      >
        <Play className='h-4 w-4' aria-hidden='true' />
        Start
      </Button>
    </li>
  );
}

export default CookStepTimer;
