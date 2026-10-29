import { formatDate, formatTime } from '@/utils/formatUtils';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import ViewingStatusBadge from '@apps/a-list/components/shared/ViewingStatusBadge';
import type { Viewing } from '@apps/a-list/types';
import type { WatchlistRowData } from '@apps/a-list/utils/watchlistRows';

const MAX_ROWS = 5;
const MAX_OPENING_TITLES = 3;

interface DayHoverCardProps {
  date: Date;
  viewings: Viewing[];
  openings: WatchlistRowData[];
  now: number;
}

/** What a day's popover shows: each movie with its time and state, then what opens that day. */
function DayHoverCard({ date, viewings, openings, now }: DayHoverCardProps) {
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
      {openings.length > 0 && (
        <p className='pt-1 text-sm'>
          <span aria-hidden='true'>🎬 </span>
          <span className='font-medium'>Opening:</span>{' '}
          {openings
            .slice(0, MAX_OPENING_TITLES)
            .map((row) => row.item.movie.title)
            .join(', ')}
          {openings.length > MAX_OPENING_TITLES &&
            ` +${openings.length - MAX_OPENING_TITLES} more`}
        </p>
      )}
    </div>
  );
}

export default DayHoverCard;
