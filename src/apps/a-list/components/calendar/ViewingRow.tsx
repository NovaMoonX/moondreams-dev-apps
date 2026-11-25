import { formatTime } from '@/utils/formatUtils';
import FormatBadge from '@apps/a-list/components/shared/FormatBadge';
import PosterCover from '@apps/a-list/components/shared/PosterCover';
import StarRating from '@/components/StarRating';
import ViewingStatusBadge from '@apps/a-list/components/shared/ViewingStatusBadge';
import type { Viewing } from '@apps/a-list/types';
import { formatCents } from '@/utils/moneyUtils';
import {
  joinNames,
  type FriendsAlsoGoing,
} from '@apps/a-list/utils/friendShowings';

function getAlsoGoingLine({ sameTime, otherTimes }: FriendsAlsoGoing) {
  const verb = (names: string[]) => (names.length === 1 ? 'is' : 'are');
  const others = otherTimes.map(
    ({ showtimeAt, names }) =>
      `${joinNames(names)} at ${formatTime(showtimeAt)}`,
  );
  if (sameTime.length > 0) {
    return [
      `${joinNames(sameTime)} ${verb(sameTime)} going at the same time`,
      ...others,
    ].join(' · ');
  }
  if (otherTimes.length === 0) return null;

  const [first] = otherTimes;
  return [
    `${joinNames(first.names)} ${verb(first.names)} going at ${formatTime(first.showtimeAt)}`,
    ...others.slice(1),
  ].join(', ');
}

interface ViewingRowProps {
  viewing: Viewing;
  now: number;
  /** Friends seeing the same movie this day, and when. */
  alsoGoing?: FriendsAlsoGoing;
}

function ViewingRow({ viewing, now, alsoGoing }: ViewingRowProps) {
  const alsoGoingLine = alsoGoing ? getAlsoGoingLine(alsoGoing) : null;
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
        {alsoGoingLine && (
          <p className='text-muted-foreground text-xs text-pretty'>
            {alsoGoingLine}
          </p>
        )}
      </div>
    </div>
  );
}

export default ViewingRow;
