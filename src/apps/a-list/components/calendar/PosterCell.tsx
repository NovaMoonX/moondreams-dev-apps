import { join } from '@moondreamsdev/dreamer-ui/utils';

import PosterSplit from '@apps/a-list/components/calendar/PosterSplit';
import type { Viewing } from '@apps/a-list/types';

interface PosterCellProps {
  date: Date;
  viewings: Viewing[];
  isSelected: boolean;
  isToday: boolean;
}

function PosterCell({ date, viewings, isSelected, isToday }: PosterCellProps) {
  const hasCovers = viewings.length > 0;

  return (
    <span className='absolute inset-0 block'>
      {hasCovers && <PosterSplit viewings={viewings} />}
      <span
        className={join(
          'absolute top-0.5 left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
          isToday && 'bg-primary text-primary-foreground',
          !isToday && hasCovers && 'bg-black/45 text-white',
        )}
      >
        {date.getDate()}
      </span>
      {isSelected && (
        <span className='ring-primary pointer-events-none absolute inset-0 ring-2 ring-inset' />
      )}
    </span>
  );
}

export default PosterCell;
