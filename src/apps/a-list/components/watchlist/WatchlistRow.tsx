import { Badge } from '@moondreamsdev/dreamer-ui/components';

import {
  formatDate,
  formatDateShort,
  formatDateUTC,
} from '@/utils/formatUtils';
import DateChip from '@/components/DateChip';
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
  const { item, isSeen, seenCount, nextPlannedAt, lastWatchedAt } = row;
  const { movie } = item;
  const hasTopBadge = isSeen || item.priority !== 'IF_I_HAVE_TIME';

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
        {(item.preferredFormat !== null || lastWatchedAt !== null) && (
          <div className='flex flex-wrap items-center gap-1.5'>
            {item.preferredFormat !== null && (
              <FormatBadge format={item.preferredFormat} />
            )}
            {lastWatchedAt !== null && (
              <Badge
                variant='muted'
                size='xs'
                className='gap-1 rounded-full! whitespace-nowrap'
              >
                <span aria-hidden='true'>🍿</span>
                Seen {formatDateShort(lastWatchedAt)}
                {seenCount > 1 && ` · ×${seenCount}`}
              </Badge>
            )}
          </div>
        )}
      </div>
      {(hasTopBadge || nextPlannedAt !== null) && (
        <div className='flex shrink-0 flex-col items-end justify-between gap-2'>
          {isSeen ? (
            <Badge
              variant='secondary'
              size='xs'
              className='gap-1 rounded-full! whitespace-nowrap'
            >
              <span aria-hidden='true'>👀</span>
              Seen
            </Badge>
          ) : hasTopBadge ? (
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
