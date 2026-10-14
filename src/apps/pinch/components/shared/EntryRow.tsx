import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronRight } from 'lucide-react';

interface EntryRowProps {
  icon: ReactNode;
  label: string;
  count: number;
  detail?: ReactNode;
  onClick: () => void;
  className?: string;
}

function EntryRow({
  icon,
  label,
  count,
  detail,
  onClick,
  className,
}: EntryRowProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      onClick={onClick}
      className={join(
        'min-w-0 justify-start gap-2.5 rounded-2xl px-3',
        detail ? 'h-auto min-h-14 py-2' : 'h-14',
        className,
      )}
    >
      <span
        className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)] max-[360px]:hidden'
        aria-hidden='true'
      >
        {icon}
      </span>
      <span className='min-w-0 flex-1 text-left'>
        <span className='block truncate'>{label}</span>
        {detail}
      </span>
      {count > 0 && (
        <span className='text-muted-foreground text-sm font-normal'>
          {count}
        </span>
      )}
      <ChevronRight
        className='text-muted-foreground h-4 w-4 shrink-0 max-[400px]:hidden'
        aria-hidden='true'
      />
    </Button>
  );
}

export default EntryRow;
