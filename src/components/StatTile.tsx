import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

interface StatTileProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  detail?: ReactNode;
  /** Icon above the number instead of beside it, for tiles that sit three across. */
  isStacked?: boolean;
  /** A target to show progress toward; a met one tints the whole tile. */
  goal?: { current: number; target: number };
  /** Dims the tile and invites setting something up (a goal) with a button, instead of showing progress. */
  prompt?: { label: string; onClick: () => void };
  className?: string;
}

/** One number and a label: the only card allowed inside an A-List screen. */
function StatTile({
  label,
  value,
  icon,
  detail,
  isStacked = false,
  goal,
  prompt,
  className,
}: StatTileProps) {
  const isGoalMet = goal !== undefined && goal.current >= goal.target;
  const progress = goal
    ? Math.min(100, Math.round((goal.current / goal.target) * 100))
    : 0;

  return (
    <div
      className={join(
        'border-border bg-card flex gap-3 rounded-2xl border px-3 py-3',
        isStacked ? 'flex-col items-center text-center' : 'items-center',
        isGoalMet && 'border-success/40 bg-success/10',
        prompt && 'border-dashed bg-transparent',
        className,
      )}
    >
      {icon && (
        <span
          className='bg-secondary text-secondary-foreground grid size-10 shrink-0 place-items-center rounded-full text-xl'
          aria-hidden='true'
        >
          {icon}
        </span>
      )}
      <div className='w-full min-w-0'>
        <p
          className={join(
            'leading-tight font-semibold tabular-nums',
            isStacked ? 'text-xl' : 'text-lg sm:text-xl',
            prompt && 'text-muted-foreground',
          )}
        >
          {value}
        </p>
        <p className='text-muted-foreground text-xs'>{label}</p>
        {prompt && (
          <Button
            type='button'
            size='sm'
            rounded='full'
            variant='secondary'
            className='mt-2 w-full text-xs'
            onClick={prompt.onClick}
          >
            {prompt.label}
          </Button>
        )}
        {goal && (
          <div
            className='bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full'
            role='progressbar'
            aria-valuenow={goal.current}
            aria-valuemax={goal.target}
            aria-label={`${label} goal`}
          >
            <div
              className={join(
                'h-full rounded-full',
                isGoalMet ? 'bg-success' : 'bg-primary',
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        {(isGoalMet || detail) && (
          <p
            className={join(
              'text-xs',
              isGoalMet ? 'text-success font-medium mt-1' : 'text-muted-foreground',
            )}
          >
            {isGoalMet ? '🏆 Goal met' : detail}
          </p>
        )}
      </div>
    </div>
  );
}

export default StatTile;
