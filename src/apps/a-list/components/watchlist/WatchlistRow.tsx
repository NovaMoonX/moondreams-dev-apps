import { formatDateUTC } from '@/utils/formatUtils';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import PriorityBadge from '@apps/a-list/components/shared/PriorityBadge';
import type { WatchlistItem } from '@apps/a-list/types';

interface WatchlistRowProps {
  item: WatchlistItem;
  /** The viewer's local today as UTC midnight, the same kind of value as a release date. */
  todayDay: number;
}

function WatchlistRow({ item, todayDay }: WatchlistRowProps) {
  const { movie } = item;

  const getReleaseLabel = () => {
    if (movie.releaseDate === null) return 'Release date not announced';
    if (movie.releaseDate > todayDay)
      return `Opens ${formatDateUTC(movie.releaseDate)}`;
    return `Released ${formatDateUTC(movie.releaseDate)}`;
  };

  return (
    <div className='flex items-center gap-3 py-2.5'>
      <span className='h-16 w-11 shrink-0 overflow-hidden rounded'>
        <PosterCover title={movie.title} posterUrl={movie.posterUrl} compact />
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='truncate font-medium'>{movie.title}</p>
        <p className='text-muted-foreground text-xs'>{getReleaseLabel()}</p>
        <div className='flex flex-wrap items-center gap-1.5'>
          <PriorityBadge priority={item.priority} />
          {item.preferredFormat === null ? (
            <span className='text-muted-foreground text-xs'>
              No format preference
            </span>
          ) : (
            <FormatBadge format={item.preferredFormat} />
          )}
        </div>
      </div>
    </div>
  );
}

export default WatchlistRow;
