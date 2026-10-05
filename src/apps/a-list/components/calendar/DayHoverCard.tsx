import { formatDate, formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import ViewingStatusBadge from '@apps/a-list/components/shared/ViewingStatusBadge';
import type { Viewing } from '@apps/a-list/types';

const MAX_ROWS = 5;

interface DayHoverCardProps {
  date: Date;
  viewings: Viewing[];
  now: number;
}

/** What a day's popover shows: each movie with its time and state. */
function DayHoverCard({ date, viewings, now }: DayHoverCardProps) {
  return (
    <div className='space-y-1 text-left'>
      <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
        {formatDate(date.getTime())}
      </p>
      {viewings.slice(0, MAX_ROWS).map((viewing) => (
        <div key={viewing.id} className='flex items-center gap-2.5 py-1'>
          <span className='h-12 w-8 shrink-0 overflow-hidden rounded-md'>
            <PosterCover
              title={viewing.movie.title}
              posterUrl={viewing.movie.posterUrl}
              compact
            />
          </span>
          <div className='min-w-0 flex-1 space-y-0.5'>
            <p className='truncate text-sm font-medium'>{viewing.movie.title}</p>
            <p className='text-muted-foreground text-xs'>
              {formatTime(viewing.showtimeAt)}
            </p>
            <ViewingStatusBadge viewing={viewing} now={now} />
          </div>
        </div>
      ))}
      {viewings.length > MAX_ROWS && (
        <p className='text-muted-foreground pt-1 text-xs'>
          +{viewings.length - MAX_ROWS} more
        </p>
      )}
    </div>
  );
}

export default DayHoverCard;
