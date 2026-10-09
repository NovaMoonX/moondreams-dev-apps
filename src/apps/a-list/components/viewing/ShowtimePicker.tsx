import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useQuery } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';

import ExternalLinkText from '@/components/ExternalLinkText';
import Pill from '@/components/Pill';
import {
  AMC_FORMAT_DISPLAY_ORDER,
  AMC_FORMAT_LABELS,
} from '@apps/a-list/constants';
import { findShowtimesQueryOptions } from '@apps/a-list/queries/showtimeQueries';
import type { ShowtimeOption, TheatreSnapshot } from '@apps/a-list/types';
import { formatCents } from '@apps/a-list/utils/money';
import TheaterSheetModal from '@apps/a-list/components/theaters/TheaterSheetModal';
import { isTypedTheatre } from '@apps/a-list/utils/theatres';
import {
  formatTimeInZone,
  getDayInZone,
  getZoneName,
  sharesClockWithDevice,
} from '@apps/a-list/utils/theatreTime';

interface ShowtimePickerProps {
  theatre: TheatreSnapshot;
  /** The day to look up, "YYYY-MM-DD", used until the showing has a time. */
  dateKey: string;
  /** When the showing is set, the day looked up is that moment's day at the theater, so a late show never lands on the next day for a viewer in another zone. */
  showingAt?: number | null;
  title: string;
  now: number;
  selectedShowtimeId: string | null;
  onPick: (option: ShowtimeOption) => void;
  /** On the buy screen there is no form to fall back to, so a way to buy on AMC's own site is offered instead. */
  offersAmcFallback?: boolean;
  /** Called once a typed theater has been linked, with the AMC theater that replaced it. */
  onLinked?: (theatre: TheatreSnapshot) => void;
}

const COLLAPSED_COUNT = 6;

/** Upcoming showings of a movie at a theater, from AMC, each with its format and list price. Past days get an honest note instead. */
function ShowtimePicker({
  theatre,
  dateKey: pickedDateKey,
  showingAt = null,
  title,
  now,
  selectedShowtimeId,
  onPick,
  offersAmcFallback = false,
  onLinked,
}: ShowtimePickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const timeZone = theatre.timeZone ?? null;
  const dateKey =
    showingAt !== null && timeZone
      ? getDayInZone(showingAt, timeZone)
      : pickedDateKey;
  const isPastDay = dateKey < getDayInZone(now, timeZone);
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

  const getFormatRank = (option: ShowtimeOption) =>
    AMC_FORMAT_DISPLAY_ORDER.indexOf(option.format);
  const upcoming = (showtimes.data ?? [])
    .filter((option) => option.startsAt > now)
    .sort(
      (left, right) =>
        getFormatRank(left) - getFormatRank(right) ||
        Number(left.isSoldOut) - Number(right.isSoldOut) ||
        left.startsAt - right.startsAt,
    );
  const open = upcoming.filter((option) => !option.isSoldOut);
  const soldOutCount = upcoming.length - open.length;
  const note = getNote();
  const hiddenCount = Math.max(0, upcoming.length - COLLAPSED_COUNT);
  const visible = isExpanded
    ? upcoming
    : upcoming.filter(
        (option, index) =>
          index < COLLAPSED_COUNT || option.showtimeId === selectedShowtimeId,
      );
  const groups = visible.reduce<
    { format: ShowtimeOption['format']; options: ShowtimeOption[] }[]
  >((accumulated, option) => {
    const last = accumulated[accumulated.length - 1];
    return last?.format === option.format
      ? [
          ...accumulated.slice(0, -1),
          { ...last, options: [...last.options, option] },
        ]
      : [...accumulated, { format: option.format, options: [option] }];
  }, []);
  const isOnlyStandard = groups.length === 1 && groups[0].format === 'STANDARD';
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
      {isTyped && (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>
            <strong className='text-foreground'>
              See showtimes by linking {theatre.name} to AMC.
            </strong>{' '}
            It was typed in by hand, so AMC can’t list its showtimes until it’s
            matched to its AMC theater.
          </p>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            rounded='full'
            className="relative h-8 w-full whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] sm:w-auto"
            onClick={() => setIsLinking(true)}
          >
            🔗 Link to the AMC theater
          </Button>
          {isLinking && (
            <TheaterSheetModal
              linking={theatre}
              onClose={() => setIsLinking(false)}
              onDone={(linked) => onLinked?.(linked)}
            />
          )}
        </div>
      )}
      {note && <p className='text-muted-foreground text-sm'>{note}</p>}
      {!note && !isTyped && open.length === 0 && (
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
      {groups.map((group) => (
        <div key={group.format} className='space-y-1.5'>
          {!isOnlyStandard && (
            <p className='text-muted-foreground text-xs font-medium'>
              {AMC_FORMAT_LABELS[group.format]}
            </p>
          )}
          <div className='flex flex-wrap gap-x-2 gap-y-3'>
            {group.options.map((option) => (
              <Pill
                key={option.showtimeId}
                isThin
                isDisabled={option.isSoldOut}
                className='disabled:bg-muted! disabled:text-muted-foreground! disabled:opacity-100!'
                isSelected={option.showtimeId === selectedShowtimeId}
                onClick={() => onPick(option)}
              >
                {[
                  formatTimeInZone(option.startsAt, timeZone),
                  option.isSoldOut
                    ? 'Sold out'
                    : option.priceCents === null
                      ? null
                      : formatCents(option.priceCents),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Pill>
            ))}
          </div>
        </div>
      ))}
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
          Prices are AMC's list price before tax and fees.
        </p>
      )}
    </div>
  );
}

export default ShowtimePicker;
