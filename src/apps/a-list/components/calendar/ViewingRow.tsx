import { formatTime } from '@/utils/formatUtils';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import StarRating from '@apps/a-list/components/shared/StarRating';
import ViewingStatusBadge from '@apps/a-list/components/shared/ViewingStatusBadge';
import type { Viewing } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';

interface ViewingRowProps {
  viewing: Viewing;
  now: number;
}

function ViewingRow({ viewing, now }: ViewingRowProps) {
  return (
    <div className='flex w-full items-center gap-3 py-2.5'>
      <span className='h-16 w-11 shrink-0 overflow-hidden rounded-lg shadow-sm'>
        <PosterCover
          title={viewing.movie.title}
          posterUrl={viewing.movie.posterUrl}
          compact
        />
      </span>
      <div className='min-w-0 flex-1 space-y-1 text-left'>
        <p className='truncate font-medium'>{viewing.movie.title}</p>
        <p className='text-muted-foreground text-xs'>
          {formatTime(viewing.showtimeAt)}
          {viewing.ticket && ` · ${formatCents(viewing.ticket.totalCents)}`}
        </p>
        <div className='flex flex-wrap items-center gap-1.5'>
          <ViewingStatusBadge viewing={viewing} now={now} />
          {viewing.ticket && <FormatBadge format={viewing.ticket.format} />}
          {viewing.status === 'SEEN' && viewing.rating ? (
            <StarRating value={viewing.rating} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ViewingRow;
