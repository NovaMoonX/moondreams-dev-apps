import { formatDate, formatDateUTC } from '@/utils/formatUtils';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import PriorityBadge from '@apps/a-list/components/shared/PriorityBadge';
import type { WatchlistRowData } from '@apps/a-list/utils/watchlistRows';

interface WatchlistRowProps {
  row: WatchlistRowData;
  /** The viewer's local today as UTC midnight, the same kind of value as a release date. */
  todayDay: number;
  /** Set on the Opening tab: days until the release. */
  daysUntil?: number;
}

function WatchlistRow({ row, todayDay, daysUntil }: WatchlistRowProps) {
  const { item, isSeen, seenCount, nextPlannedAt, lastWatchedAt } = row;
  const { movie } = item;

  const getReleaseLabel = () => {
    if (movie.releaseDate === null) return 'Release date not announced';
    if (daysUntil !== undefined) {
      const when =
        daysUntil === 0
          ? 'today'
          : daysUntil === 1
            ? 'tomorrow'
            : `in ${daysUntil} days`;
      return `Opens ${formatDateUTC(movie.releaseDate)} · ${when}`;
    }
    if (movie.releaseDate >= todayDay)
      return `Opens ${formatDateUTC(movie.releaseDate)}`;
    return `Released ${formatDateUTC(movie.releaseDate)}`;
  };

  const getActivityLine = () => {
    if (nextPlannedAt !== null)
      return `📅 Planned ${formatDate(nextPlannedAt)}`;
    if (lastWatchedAt !== null) {
      return `✓ Seen ${formatDate(lastWatchedAt)}${seenCount > 1 ? ` · ×${seenCount}` : ''}`;
    }
    return null;
  };

  const activityLine = getActivityLine();

  return (
    <div className='flex w-full items-center gap-3 py-2.5'>
      <span className='h-16 w-11 shrink-0 overflow-hidden rounded'>
        <PosterCover title={movie.title} posterUrl={movie.posterUrl} compact />
      </span>
      <div className='min-w-0 flex-1 space-y-1'>
        <p className='truncate font-medium'>
          {isSeen && (
            <span className='text-success mr-1' aria-label='Seen'>
              ✓
            </span>
          )}
          {movie.title}
        </p>
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
        {activityLine && (
          <p className='text-muted-foreground text-xs'>{activityLine}</p>
        )}
      </div>
    </div>
  );
}

export default WatchlistRow;
