import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';

import ExternalLinkText from '@/components/ExternalLinkText';
import Pill from '@/components/Pill';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { formatTime } from '@/utils/formatUtils';
import { AMC_FORMAT_LABELS } from '@apps/a-list/constants';
import { findShowtimesQueryOptions } from '@apps/a-list/queries/showtimeQueries';
import type { ShowtimeOption, TheatreSnapshot } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';
import { isTypedTheatre } from '@apps/a-list/utils/theatres';

interface ShowtimePickerProps {
  theatre: TheatreSnapshot;
  /** The viewer's local day to look up, "YYYY-MM-DD". */
  dateKey: string;
  title: string;
  now: number;
  selectedShowtimeId: string | null;
  onPick: (option: ShowtimeOption) => void;
  /** On the buy screen there is no form to fall back to, so a way to buy on AMC's own site is offered instead. */
  offersAmcFallback?: boolean;
}

/** Upcoming showings of a movie at a theater, from AMC, each with its format and list price. Past days get an honest note instead. */
function ShowtimePicker({
  theatre,
  dateKey,
  title,
  now,
  selectedShowtimeId,
  onPick,
  offersAmcFallback = false,
}: ShowtimePickerProps) {
  const isPastDay = dateKey < toLocalDateInputValue(now);
  const isTyped = isTypedTheatre(theatre);
  const showtimes = useQuery({
    ...findShowtimesQueryOptions({
      theatreId: theatre.theatreId,
      date: dateKey,
      title,
    }),
    enabled: !isPastDay && !isTyped && dateKey !== '',
  });

  const isLooking = showtimes.isPending && showtimes.fetchStatus !== 'idle';

  const getNote = () => {
    if (dateKey === '') return null;
    if (isPastDay)
      return 'AMC only shares showtimes and prices for upcoming days, so this one is yours to enter.';
    if (isTyped)
      return `${theatre.name} was typed in by hand, so AMC can't list its showtimes. This one is yours to enter.`;
    if (isLooking) return 'Looking up showtimes…';
    if (
      showtimes.error instanceof FirebaseError &&
      (showtimes.error.code === 'functions/resource-exhausted' ||
        showtimes.error.code === 'functions/failed-precondition')
    )
      return 'Showtime lookup is resting for today.';
    if (showtimes.error) return 'Showtimes aren’t available right now.';
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
      <p className='flex gap-1.5 font-medium'>
        <span className='w-5 shrink-0 text-center' aria-hidden='true'>
          ⏰
        </span>
        <span className='min-w-0'>Showtimes at {theatre.name}</span>
      </p>
      {note && <p className='text-muted-foreground text-sm'>{note}</p>}
      {!note && open.length === 0 && (
        <p className='text-muted-foreground text-sm'>
          {soldOutCount > 0
            ? 'Everything left that day is sold out.'
            : `AMC isn’t showing ${title} at this theater that day yet. Schedules usually post a few weeks ahead.`}
        </p>
      )}
      {offersAmcFallback && !isLooking && open.length === 0 && (
        <ExternalLinkText
          href='https://www.amctheatres.com/'
          label='Buy on amctheatres.com instead'
        />
      )}
      {open.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {open.map((option) => (
            <Pill
              key={option.showtimeId}
              className='min-h-9'
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
