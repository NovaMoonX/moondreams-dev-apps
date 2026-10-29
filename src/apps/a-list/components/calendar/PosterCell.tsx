import { Popover } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import DayHoverCard from '@apps/a-list/components/calendar/DayHoverCard';
import PosterSplit from '@apps/a-list/components/calendar/PosterSplit';
import type { Viewing } from '@apps/a-list/types';
import type { WatchlistRowData } from '@apps/a-list/utils/watchlistRows';

interface PosterCellProps {
  date: Date;
  viewings: Viewing[];
  /** Watchlist movies released this day that aren't planned yet. */
  openings: WatchlistRowData[];
  isSelected: boolean;
  isToday: boolean;
  now: number;
  /** Controlled by the calendar so only one day's peek is ever open. */
  isPeekOpen: boolean;
  onPeekOpenChange: (isOpen: boolean) => void;
}

function getPopoverAlignment(date: Date) {
  if (date.getDay() === 0) return 'start';
  if (date.getDay() === 6) return 'end';
  return 'center';
}

function PosterCell({
  date,
  viewings,
  openings,
  isSelected,
  isToday,
  now,
  isPeekOpen,
  onPeekOpenChange,
}: PosterCellProps) {
  const hasCovers = viewings.length > 0;
  const hasOpenings = openings.length > 0;

  const face = (
    <span className='relative block h-full w-full overflow-hidden rounded-xl'>
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
      {hasOpenings && (
        <span className='bg-accent-foreground text-accent ring-background absolute right-1 bottom-1 flex h-4 items-center gap-0.5 rounded-full px-1 text-[10px] leading-none font-semibold shadow-sm ring-1'>
          <span aria-hidden='true'>🎬</span>
          {openings.length > 1 && openings.length}
          <span className='sr-only'>
            {openings.length === 1
              ? '1 movie opening'
              : `${openings.length} movies opening`}
          </span>
        </span>
      )}
      {isSelected && (
        <span className='ring-primary pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset' />
      )}
    </span>
  );

  // Popover's wrapper is an inline-block, so it is stretched to fill the cell.
  return (
    <span className='absolute inset-0 block [&>div]:block [&>div]:h-full [&>div]:w-full'>
      {hasCovers || hasOpenings ? (
        <Popover
          hoverable
          isOpen={isPeekOpen}
          onOpenChange={onPeekOpenChange}
          placement='bottom'
          alignment={getPopoverAlignment(date)}
          className='w-64 p-3 max-sm:hidden!'
          trigger={face}
          offset={4}
        >
          <DayHoverCard
            date={date}
            viewings={viewings}
            openings={openings}
            now={now}
          />
        </Popover>
      ) : (
        face
      )}
    </span>
  );
}

export default PosterCell;
