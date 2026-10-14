import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

interface EntryRowProps {
  icon: ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}

/** An entry tile: a round tinted icon, a name and how many it holds. */
function EntryRow({ icon, label, count, onClick }: EntryRowProps) {
  return (
    <Button
      type='button'
      variant='secondary'
      onClick={onClick}
      className='h-14 min-w-0 justify-start gap-2.5 rounded-2xl px-3'
    >
      <span
        className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--pinch-drizzle-soft)] max-[360px]:hidden'
        aria-hidden='true'
      >
        {icon}
      </span>
      <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
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
