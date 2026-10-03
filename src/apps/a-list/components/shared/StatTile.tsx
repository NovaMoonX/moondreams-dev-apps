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
        'border-border bg-card rounded-xl border px-3 py-2.5',
        className,
      )}
    >
      <div className='flex items-center gap-2'>
        {icon && (
          <span className='text-lg' aria-hidden='true'>
            {icon}
          </span>
        )}
        <span className='text-xl font-semibold tabular-nums'>{value}</span>
      </div>
      <p className='text-muted-foreground text-xs'>{label}</p>
      {detail && (
        <p className='text-muted-foreground mt-0.5 text-xs'>{detail}</p>
      )}
    </div>
  );
}

export default StatTile;
