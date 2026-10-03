import { join } from '@moondreamsdev/dreamer-ui/utils';

import { formatDate, formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import ViewingStatusBadge from '@apps/a-list/components/shared/ViewingStatusBadge';
import type { Viewing } from '@apps/a-list/types';

interface DayHoverCardProps {
  date: Date;
  viewings: Viewing[];
  now: number;
}

/** A pointer-only peek at a day, shown by the cell's own hover; touch screens go straight to the day's drawer. */
function DayHoverCard({ date, viewings, now }: DayHoverCardProps) {
  const column = date.getDay();

  return (
    <span
      role='presentation'
      className={join(
        'border-border bg-popover text-popover-foreground pointer-events-none absolute top-full z-30 mt-2 hidden w-64 space-y-1 rounded-2xl border p-3 text-left shadow-xl group-hover:block max-sm:hidden',
        column === 0 && 'left-0',
        column === 6 && 'right-0',
        column !== 0 && column !== 6 && 'left-1/2 -translate-x-1/2',
      )}
    >
      <span className='text-muted-foreground block text-xs font-semibold tracking-wide uppercase'>
        {formatDate(date.getTime())}
      </span>
      {viewings.map((viewing) => (
        <span key={viewing.id} className='flex items-center gap-2.5 py-1'>
          <span className='h-12 w-8 shrink-0 overflow-hidden rounded-md'>
            <PosterCover
              title={viewing.movie.title}
              posterUrl={viewing.movie.posterUrl}
              compact
            />
          </span>
          <span className='min-w-0 flex-1 space-y-0.5'>
            <span className='block truncate text-sm font-medium'>
              {viewing.movie.title}
            </span>
            <span className='text-muted-foreground block text-xs'>
              {formatTime(viewing.showtimeAt)}
            </span>
            <ViewingStatusBadge viewing={viewing} now={now} />
          </span>
        </span>
      ))}
    </span>
  );
}

export default DayHoverCard;
