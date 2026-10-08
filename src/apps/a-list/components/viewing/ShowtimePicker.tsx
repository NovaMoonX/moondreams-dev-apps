import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';

import ExternalLinkText from '@/components/ExternalLinkText';
import Pill from '@/components/Pill';
import { toLocalDateInputValue } from '@/utils/dateInputUtils';
import { AMC_FORMAT_LABELS } from '@apps/a-list/constants';
import { findShowtimesQueryOptions } from '@apps/a-list/queries/showtimeQueries';
import type { ShowtimeOption, TheatreSnapshot } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';
import { isTypedTheatre } from '@apps/a-list/utils/theatres';
import {
  formatTimeInZone,
  getZoneName,
  sharesClockWithDevice,
} from '@apps/a-list/utils/theatreTime';

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

const COLLAPSED_COUNT = 6;

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
  const [isExpanded, setIsExpanded] = useState(false);
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

  if (isPastDay) {
    return null;
  }

  const upcoming = (showtimes.data ?? []).filter(
    (option) => option.startsAt > now,
  );
  const open = upcoming.filter((option) => !option.isSoldOut);
  const soldOutCount = upcoming.length - open.length;
  const note = getNote();
  const hiddenCount = Math.max(0, open.length - COLLAPSED_COUNT);
  const visible = isExpanded
    ? open
    : open.filter(
        (option, index) =>
          index < COLLAPSED_COUNT || option.showtimeId === selectedShowtimeId,
      );
  const timeZone = theatre.timeZone ?? null;
  const picked = open.find(
    (option) => option.showtimeId === selectedShowtimeId,
  );
  const firstStart = open[0]?.startsAt ?? now;
  const isDifferentClock =
    timeZone !== null && !sharesClockWithDevice(firstStart, timeZone);

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
      {open.length > 0 && timeZone && (
        <p className='text-muted-foreground flex gap-1.5 text-xs'>
          <span className='w-5 shrink-0 text-center' aria-hidden='true'>
            🌎
          </span>
          <span className='min-w-0'>
            Times are the theater&apos;s own:{' '}
            {getZoneName(firstStart, timeZone)}
            {isDifferentClock ? ', which isn’t your time zone' : ''}.
          </span>
        </p>
      )}
      {open.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {visible.map((option) => (
            <Pill
              key={option.showtimeId}
              className='min-h-10'
              isSelected={option.showtimeId === selectedShowtimeId}
              onClick={() => onPick(option)}
            >
              {[
                formatTimeInZone(option.startsAt, timeZone),
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
      {hiddenCount > 0 && (
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-10 px-0!'
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? 'Show fewer' : `Show ${hiddenCount} more`}
        </Button>
      )}
      {picked && isDifferentClock && (
        <p className='text-muted-foreground text-xs'>
          {formatTimeInZone(picked.startsAt, timeZone)} there is{' '}
          {formatTimeInZone(picked.startsAt, null)} for you, which is how it
          shows on your calendar.
        </p>
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
