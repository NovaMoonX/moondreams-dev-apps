import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';

import Pill from '@/components/Pill';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { formatTime } from '@/utils/formatUtils';
import { AMC_FORMAT_LABELS } from '@apps/a-list/constants';
import { findShowtimesQueryOptions } from '@apps/a-list/queries/showtimeQueries';
import type { ShowtimeOption, TheatreSnapshot } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';

interface ShowtimePickerProps {
  theatre: TheatreSnapshot;
  /** The viewer's local day to look up, "YYYY-MM-DD". */
  dateKey: string;
  title: string;
  now: number;
  selectedShowtimeId: string | null;
  onPick: (option: ShowtimeOption) => void;
}

/** Upcoming showings of a movie at a theater, from AMC, each with its format and list price. Past days get an honest note instead. */
function ShowtimePicker({
  theatre,
  dateKey,
  title,
  now,
  selectedShowtimeId,
  onPick,
}: ShowtimePickerProps) {
  const isPastDay = dateKey < toLocalDateInputValue(now);
  const showtimes = useQuery({
    ...findShowtimesQueryOptions({
      theatreId: theatre.theatreId,
      date: dateKey,
      title,
    }),
    enabled: !isPastDay && dateKey !== '',
  });

  const getNote = () => {
    if (dateKey === '') return null;
    if (isPastDay)
      return 'AMC only shares showtimes and prices for upcoming days, so this one is yours to enter.';
    if (showtimes.isPending) return 'Looking up showtimes…';
    if (
      showtimes.error instanceof FirebaseError &&
      (showtimes.error.code === 'functions/resource-exhausted' ||
        showtimes.error.code === 'functions/failed-precondition')
    )
      return 'Showtime lookup is resting for today. You can still pick the time yourself.';
    if (showtimes.error)
      return 'Showtimes aren’t available right now. You can still pick the time yourself.';
    return null;
  };

  const upcoming = (showtimes.data ?? []).filter(
    (option) => option.startsAt > now,
  );
  const open = upcoming.filter((option) => !option.isSoldOut);
  const soldOutCount = upcoming.length - open.length;
  const note = getNote();

  return (
    <div className='space-y-2'>
      <p className='font-medium'>🕒 Showtimes at {theatre.name}</p>
      {note && <p className='text-muted-foreground text-sm'>{note}</p>}
      {!note && open.length === 0 && (
        <p className='text-muted-foreground text-sm'>
          {soldOutCount > 0
            ? 'Everything left that day is sold out.'
            : `AMC doesn’t list ${title} at this theater that day.`}
        </p>
      )}
      {open.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {open.map((option) => (
            <Pill
              key={option.showtimeId}
              isSelected={option.showtimeId === selectedShowtimeId}
              onClick={() => onPick(option)}
            >
              {[
                formatTime(option.startsAt),
                option.format === 'STANDARD'
                  ? null
                  : AMC_FORMAT_LABELS[option.format],
                option.priceCents === null
                  ? null
                  : formatCents(option.priceCents),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Pill>
          ))}
        </div>
      )}
      {open.length > 0 && (
        <p className='text-muted-foreground text-xs'>
          Prices are AMC's list price before tax and fees
          {soldOutCount > 0 ? `, and ${soldOutCount} sold out` : ''}.
        </p>
      )}
    </div>
  );
}

export default ShowtimePicker;
