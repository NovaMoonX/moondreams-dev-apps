import { join } from '@moondreamsdev/dreamer-ui/utils';

import DayHoverCard from '@apps/a-list/components/calendar/DayHoverCard';
import PosterSplit from '@apps/a-list/components/calendar/PosterSplit';
import type { Viewing } from '@apps/a-list/types';

interface PosterCellProps {
  date: Date;
  viewings: Viewing[];
  isSelected: boolean;
  isToday: boolean;
  now: number;
}

function PosterCell({
  date,
  viewings,
  isSelected,
  isToday,
  now,
}: PosterCellProps) {
  const hasCovers = viewings.length > 0;

  return (
    <span className='absolute inset-0 block'>
      <span className='absolute inset-0 block overflow-hidden rounded-xl'>
        {hasCovers && <PosterSplit viewings={viewings} />}
        <span
          className={join(
            'absolute top-1 left-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
            isToday && 'bg-primary text-primary-foreground',
            !isToday && hasCovers && 'bg-black/50 text-white',
          )}
        >
          {date.getDate()}
        </span>
        {isSelected && (
          <span className='ring-primary pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset' />
        )}
      </span>
      {hasCovers && <DayHoverCard date={date} viewings={viewings} now={now} />}
    </span>
  );
}

export default PosterCell;
