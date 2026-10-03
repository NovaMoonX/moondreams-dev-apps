import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

interface StatTileProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  detail?: ReactNode;
  className?: string;
}

/** One number and a label: the only card allowed inside an A-List screen. */
function StatTile({ label, value, icon, detail, className }: StatTileProps) {
  return (
    <div
      className={join(
        'border-border bg-card flex items-center gap-3 rounded-2xl border px-3 py-3',
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
      <div className='min-w-0'>
        <p className='text-xl leading-tight font-semibold tabular-nums'>
          {value}
        </p>
        <p className='text-muted-foreground text-xs'>{label}</p>
        {detail && (
          <p className='text-muted-foreground mt-0.5 text-xs'>{detail}</p>
        )}
      </div>
    </div>
  );
}

export default StatTile;
