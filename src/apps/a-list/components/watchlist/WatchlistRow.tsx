import { formatDate, formatDateUTC } from '@/utils/formatUtils';
import DateChip from '@apps/a-list/components/shared/DateChip';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import PriorityBadge from '@apps/a-list/components/shared/PriorityBadge';
import { getReleaseLabel } from '@apps/a-list/utils/releaseLabel';
import type { WatchlistRowData } from '@apps/a-list/utils/watchlistRows';

interface WatchlistRowProps {
  row: WatchlistRowData;
  /** The viewer's local today as UTC midnight, the same kind of value as a release date. */
  todayDay: number;
  /** Set when the Opening filter is on: days until the release. */
  daysUntil?: number;
}

function WatchlistRow({ row, todayDay, daysUntil }: WatchlistRowProps) {
  const { item, seenCount, nextPlannedAt, lastWatchedAt } = row;
  const { movie } = item;
  const hasPriorityBadge = item.priority !== 'IF_I_HAVE_TIME';

  const getReleaseText = () => {
    if (movie.releaseDate === null || daysUntil === undefined)
      return getReleaseLabel(movie.releaseDate, todayDay);
    const when =
      daysUntil === 0
        ? 'today'
        : daysUntil === 1
          ? 'tomorrow'
          : `in ${daysUntil} days`;
    return `Opens ${formatDateUTC(movie.releaseDate)} · ${when}`;
  };

  const activityLine =
    lastWatchedAt === null
      ? null
      : `🍿 Seen ${formatDate(lastWatchedAt)}${seenCount > 1 ? ` · ×${seenCount}` : ''}`;

  return (
    <div className='border-border bg-card flex w-full items-stretch gap-3 rounded-2xl border p-2.5 text-left'>
      <span className='relative min-h-24 w-16 shrink-0 self-stretch'>
        <span className='absolute inset-0 overflow-hidden rounded-xl shadow-sm'>
          <PosterCover
            title={movie.title}
            posterUrl={movie.posterUrl}
            compact
          />
        </span>
      </span>
      <div className='min-w-0 flex-1 space-y-1 py-0.5'>
        <p className='line-clamp-2 font-medium'>{movie.title}</p>
        <p className='text-muted-foreground text-xs'>{getReleaseText()}</p>
        <div className='flex flex-wrap items-center gap-1.5'>
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
      {(hasPriorityBadge || nextPlannedAt !== null) && (
        <div className='flex shrink-0 flex-col items-end justify-between gap-2'>
          {hasPriorityBadge ? (
            <PriorityBadge priority={item.priority} />
          ) : (
            <span />
          )}
          {nextPlannedAt !== null && (
            <span aria-label={`Planned ${formatDate(nextPlannedAt)}`}>
              <DateChip timestamp={nextPlannedAt} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default WatchlistRow;
