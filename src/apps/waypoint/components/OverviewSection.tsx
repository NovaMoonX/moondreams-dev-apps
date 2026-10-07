import { useState, type KeyboardEvent } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Car, KeyRound, LogIn } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import FallbackImage from '@/components/FallbackImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatClockTime, formatCountdown } from '@/utils/formatUtils';
import { getDayCount, getLocalDayIndex } from '@/utils/dateRangeUtils';
import { isSameLocalCalendarDay } from '@/utils/dateInputUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import { formatTimezoneAbbreviation, formatTimezoneLabel } from '@/utils/timezoneUtils';

import DayWeather from '@apps/waypoint/components/DayWeather';
import { EventDetailLines } from '@apps/waypoint/components/EventCard';
import { RentalDetailLines } from '@apps/waypoint/components/RentalCard';
import { StayDetailLines } from '@apps/waypoint/components/StayCard';
import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import SharedAlbumSection from '@apps/waypoint/components/SharedAlbumSection';
import NotesViewButton from '@apps/waypoint/components/NotesViewButton';
import TodayAgenda from '@apps/waypoint/components/TodayAgenda';
import WeatherAttribution from '@apps/waypoint/components/WeatherAttribution';
import { useTripWeather } from '@apps/waypoint/hooks/useTripWeather';
import { markEventSeen } from '@apps/waypoint/store/actions/eventActions';
import {
  getTripStatus,
  selectActiveEvent,
  selectRentals,
  selectSortedTimelineEvents,
  selectStays,
  selectUpNextEvent,
} from '@apps/waypoint/store/selectors';
import type { Rental, Stay, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  getEventTime,
  getRentalTime,
  getRentalTimezoneLabel,
  getStayTime,
  getStayTimezoneLabel,
  isRelativeTrip,
} from '@apps/waypoint/utils/tripTime';

type OverviewDetail =
  | { type: 'event'; event: TimelineEvent }
  | { type: 'stay'; stay: Stay }
  | { type: 'rental'; rental: Rental; leg: RentalLeg };

type RentalLeg = 'pickup' | 'return';

interface RentalToday {
  rental: Rental;
  leg: RentalLeg;
}

interface OverviewSectionProps {
  trip: TripSpace;
  currentUserId: string;
  onViewDay: (dayIndex: number) => void;
}

function getRentalLocation(rental: Rental, leg: RentalLeg) {
  if (leg === 'return' && rental.returnAddress !== null) {
    return {
      locationName: null,
      address: rental.returnAddress,
      latitude: rental.returnLatitude,
      longitude: rental.returnLongitude,
    };
  }
  return {
    locationName: null,
    address: rental.pickupAddress,
    latitude: rental.pickupLatitude,
    longitude: rental.pickupLongitude,
  };
}

function getOpenDetailsProps(label: string, onOpenDetails: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': `Open details for ${label}`,
    onClick: onOpenDetails,
    onKeyDown: (keyEvent: KeyboardEvent<HTMLElement>) => {
      if (keyEvent.target === keyEvent.currentTarget && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) {
        keyEvent.preventDefault();
        onOpenDetails();
      }
    },
  };
}

function getStayLocation(stay: Stay) {
  return {
    locationName: stay.stayType === 'HOTEL' ? stay.name : null,
    address: stay.address,
    latitude: stay.latitude,
    longitude: stay.longitude,
  };
}

function OverviewSection({ trip, currentUserId, onViewDay }: OverviewSectionProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const isLive = getTripStatus(trip, now) === 'ACTIVE';
  const activeEvent = useAppSelector(selectActiveEvent(trip, now, currentUserId));
  const upNextEvent = useAppSelector(selectUpNextEvent(trip, now, currentUserId));
  const stays = useAppSelector(selectStays);
  const events = useAppSelector(selectSortedTimelineEvents);
  const weather = useTripWeather(trip, events, stays, now);
  const rentals = useAppSelector(selectRentals);
  const [detail, setDetail] = useState<OverviewDetail | null>(null);
  const isSmallScreen = useMediaQuery().isBelow('sm');

  if (!isLive) {
    return null;
  }

  const todayIndex = getLocalDayIndex(trip.startDate, now);
  const todayWeather = weather.getDay(todayIndex);
  const weatherZone = weather.getTimezone(todayIndex);
  const showWeatherZone = weatherZone !== null && weatherZone !== Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hasTomorrow = todayIndex + 1 < getDayCount(trip.startDate, trip.endDate);
  const isCheckInToday = (stay: Stay) =>
    isRelativeTrip(trip)
      ? getStayTime(trip, stay).checkIn.dayIndex === todayIndex
      : stay.checkInAt !== null && isSameLocalCalendarDay(stay.checkInAt, now);
  const checkInStays = stays
    .filter(isCheckInToday)
    .sort((a, b) => (getStayTime(trip, a).checkInMs ?? 0) - (getStayTime(trip, b).checkInMs ?? 0));
  const getLegTime = ({ rental, leg }: RentalToday) =>
    leg === 'pickup' ? rental.pickupTime : rental.returnTime;
  const rentalsToday = rentals
    .flatMap((rental): RentalToday[] => [
      ...(rental.pickupDayIndex === todayIndex ? [{ rental, leg: 'pickup' as const }] : []),
      ...(rental.returnDayIndex === todayIndex ? [{ rental, leg: 'return' as const }] : []),
    ])
    .sort((a, b) => getLegTime(a).localeCompare(getLegTime(b)));
  // Nothing left today — no event running right now, and whatever's next (if
  // anything) isn't until a later day.
  const isDoneForToday =
    !activeEvent &&
    (!upNextEvent || getEventTime(trip, upNextEvent).dayIndex !== todayIndex);

  // Below `sm`, the Checking-in and pickup cards are too tight for the full
  // details, so tapping opens the drawer — same split Timeline/EventCard use.
  // At `sm`+, the cards show everything inline instead and are never clickable.
  const openEventDrawer = (event: TimelineEvent) => {
    setDetail({ type: 'event', event });
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };

  const openStayDrawer = (stay: Stay) => {
    setDetail({ type: 'stay', stay });
  };

  const openRentalDrawer = (rental: Rental, leg: RentalLeg) => {
    setDetail({ type: 'rental', rental, leg });
  };

  return (
    <div className='space-y-5 sm:space-y-3'>
      <div className='space-y-3'>
        {checkInStays.map((stay) => (
          <CheckInStayCard
            key={stay.id}
            trip={trip}
            stay={stay}
            now={now}
            isSmallScreen={isSmallScreen}
            onOpenDetails={() => openStayDrawer(stay)}
          />
        ))}
        {rentalsToday.map(({ rental, leg }) => (
          <RentalTodayCard
            key={`${rental.id}-${leg}`}
            trip={trip}
            rental={rental}
            leg={leg}
            now={now}
            isSmallScreen={isSmallScreen}
            onOpenDetails={() => openRentalDrawer(rental, leg)}
          />
        ))}
        {todayWeather && (
          <section className='border-border mt-5 space-y-2 border-t pt-5'>
            <div className='flex items-baseline justify-between gap-3'>
              <h3 className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                Today&apos;s weather
              </h3>
              {showWeatherZone && (
                <span className='text-muted-foreground text-[11px]' title={formatTimezoneLabel(weatherZone)}>
                  Times in {formatTimezoneAbbreviation(weatherZone, now)}
                </span>
              )}
            </div>
            <DayWeather
              forecast={todayWeather}
              hours={weather.getRemainingHoursToday(todayIndex)}
              isMinimized={false}
            />
            <WeatherAttribution />
          </section>
        )}
        {isDoneForToday && (
          <SharedAlbumSection trip={trip} currentUserId={currentUserId} variant='banner' />
        )}
      </div>
      {isSmallScreen && (
        <>
          <hr className='border-border' />
          <TodayAgenda
            trip={trip}
            currentUserId={currentUserId}
            title='Today'
            dayIndex={todayIndex}
            now={now}
            onOpenEvent={openEventDrawer}
          />
          {hasTomorrow && (
            <TodayAgenda
              trip={trip}
              currentUserId={currentUserId}
              title='Tomorrow'
              dayIndex={todayIndex + 1}
              now={now}
              limit={3}
              onViewAll={() => onViewDay(todayIndex + 1)}
              onOpenEvent={openEventDrawer}
            />
          )}
        </>
      )}
      <div className='hidden flex-wrap gap-x-4 gap-y-1 pt-3 sm:flex'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='h-auto p-0 text-xs'
          onClick={() => onViewDay(todayIndex)}
        >
          View today&apos;s full schedule
        </Button>
        {hasTomorrow && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={() => onViewDay(todayIndex + 1)}
          >
            View tomorrow&apos;s schedule
          </Button>
        )}
      </div>
      {detail?.type === 'event' && (
        <PlaceDetailsDrawer
          key={detail.event.id}
          isOpen
          onClose={() => setDetail(null)}
          title={detail.event.title}
          imageUrl={getDisplayImage(detail.event)}
          location={detail.event}
          linkUrl={detail.event.linkUrl}
          onEdit={null}
        >
          <EventDetailLines
            trip={trip}
            event={detail.event}
            zoneStyle='long'
            weather={weather.getEvent(detail.event.id)}
            showTitle={false}
            showNotes
            canEdit={false}
            onSaveNotes={async () => {}}
          />
        </PlaceDetailsDrawer>
      )}
      {detail?.type === 'stay' && (
        <PlaceDetailsDrawer
          key={detail.stay.id}
          isOpen
          onClose={() => setDetail(null)}
          title={detail.stay.name}
          imageUrl={getDisplayImage(detail.stay)}
          location={getStayLocation(detail.stay)}
          linkUrl={detail.stay.linkUrl}
          onEdit={null}
        >
          <StayDetailLines
            trip={trip}
            stay={detail.stay}
            zoneStyle='long'
            showTitle={false}
            showExtras
            canEdit={false}
            onSaveNotes={async () => {}}
          />
        </PlaceDetailsDrawer>
      )}
      {detail?.type === 'rental' && (
        <PlaceDetailsDrawer
          key={detail.rental.id}
          isOpen
          onClose={() => setDetail(null)}
          title={detail.rental.name}
          imageUrl={getDisplayImage({ place: detail.rental.pickupPlace, linkPreview: detail.rental.linkPreview })}
          location={getRentalLocation(detail.rental, detail.leg)}
          linkUrl={detail.rental.linkUrl}
          onEdit={null}
        >
          <RentalDetailLines
            trip={trip}
            rental={detail.rental}
            zoneStyle='long'
            showTitle={false}
            showExtras
            canEdit={false}
            onSaveNotes={async () => {}}
          />
        </PlaceDetailsDrawer>
      )}
    </div>
  );
}


function CheckInStayCard({
  trip,
  stay,
  now,
  isSmallScreen,
  onOpenDetails,
}: {
  trip: TripSpace;
  stay: Stay;
  now: number;
  isSmallScreen: boolean;
  onOpenDetails: () => void;
}) {
  const imageUrl = getDisplayImage(stay);
  const clickProps = isSmallScreen ? getOpenDetailsProps(stay.name, onOpenDetails) : {};
  const { checkIn, checkInMs } = getStayTime(trip, stay);
  const hasCheckedIn = checkInMs !== null && checkInMs <= now;
  const timezoneLabel = getStayTimezoneLabel(trip, stay);

  return (
    <article
      {...clickProps}
      className={join(
        'border-border bg-card rounded-xl border p-3',
        isSmallScreen && 'cursor-pointer',
      )}
    >
      <div className='flex items-start gap-3'>
        {imageUrl && (
          <FallbackImage
            src={imageUrl}
            alt=''
            className='h-12 w-12 shrink-0 rounded-lg object-cover sm:h-16 sm:w-16'
          />
        )}
        <div className='min-w-0 flex-1 space-y-0.5'>
          <p className='text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase'>
            <LogIn className='h-3 w-3' /> {hasCheckedIn ? 'Checked in' : 'Checking in today'}
          </p>
          <h3 className='truncate text-sm font-semibold sm:text-base'>{stay.name}</h3>
          <p className='text-muted-foreground truncate text-xs'>
            {checkIn.time ? formatClockTime(checkIn.time) : ''}
            {hasCheckedIn || checkInMs === null ? '' : ` · ${formatCountdown(checkInMs, now)}`}
            {timezoneLabel ? ` · ${timezoneLabel}` : ''}
          </p>
        </div>
        {!isSmallScreen && (
          <MapNavigationButton
            locationName={stay.name}
            address={stay.address}
            latitude={stay.latitude}
            longitude={stay.longitude}
          />
        )}
      </div>
      {!isSmallScreen && (
        <div className='mt-2 space-y-1'>
          <LocationLink
            locationName={stay.stayType === 'HOTEL' ? stay.name : null}
            address={stay.address}
            latitude={stay.latitude}
            longitude={stay.longitude}
            label={stay.address}
            className='text-xs'
          />
          {stay.confirmationCode && (
            <p className='text-xs'>
              <span className='text-muted-foreground'>Confirmation · </span>
              <span className='font-medium'>{stay.confirmationCode}</span>
            </p>
          )}
          {(stay.linkUrl || stay.notes) && (
            <div className='flex min-w-0 items-center gap-x-3'>
              <NotesViewButton title={stay.name} notes={stay.notes} />
              {stay.linkUrl && <ExternalLinkText href={stay.linkUrl} />}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function RentalTodayCard({
  trip,
  rental,
  leg,
  now,
  isSmallScreen,
  onOpenDetails,
}: {
  trip: TripSpace;
  rental: Rental;
  leg: RentalLeg;
  now: number;
  isSmallScreen: boolean;
  onOpenDetails: () => void;
}) {
  const isPickup = leg === 'pickup';
  const imageUrl = getDisplayImage({ place: rental.pickupPlace, linkPreview: rental.linkPreview });
  const clickProps = isSmallScreen ? getOpenDetailsProps(rental.name, onOpenDetails) : {};
  const { pickupMs, returnMs } = getRentalTime(trip, rental);
  const legMs = isPickup ? pickupMs : returnMs;
  const isDone = legMs !== null && legMs <= now;
  const location = getRentalLocation(rental, leg);
  const timezoneLabel = getRentalTimezoneLabel(trip, rental, 'short', legMs);
  const label = isPickup
    ? isDone ? 'Picked up' : 'Picking up today'
    : isDone ? 'Returned' : 'Returning today';
  const Icon = isPickup ? Car : KeyRound;

  return (
    <article
      {...clickProps}
      className={join(
        'border-border bg-card rounded-xl border p-3',
        isSmallScreen && 'cursor-pointer',
      )}
    >
      <div className='flex items-start gap-3'>
        {imageUrl && (
          <FallbackImage
            src={imageUrl}
            alt=''
            className='h-12 w-12 shrink-0 rounded-lg object-cover sm:h-16 sm:w-16'
          />
        )}
        <div className='min-w-0 flex-1 space-y-0.5'>
          <p className='text-muted-foreground flex items-center gap-1 text-xs font-medium tracking-wide uppercase'>
            <Icon className='h-3 w-3' /> {label}
          </p>
          <h3 className='truncate text-sm font-semibold sm:text-base'>{rental.name}</h3>
          <p className='text-muted-foreground truncate text-xs'>
            {formatClockTime(isPickup ? rental.pickupTime : rental.returnTime)}
            {isDone || legMs === null ? '' : ` · ${formatCountdown(legMs, now)}`}
            {timezoneLabel ? ` · ${timezoneLabel}` : ''}
          </p>
        </div>
        {!isSmallScreen && <MapNavigationButton {...location} />}
      </div>
      {!isSmallScreen && (
        <div className='mt-2 space-y-1'>
          <LocationLink {...location} label={location.address} className='text-xs' />
          {rental.vehicle && <p className='text-xs'>{rental.vehicle}</p>}
          {rental.confirmationCode && (
            <p className='text-xs'>
              <span className='text-muted-foreground'>Confirmation · </span>
              <span className='font-medium'>{rental.confirmationCode}</span>
            </p>
          )}
          {(rental.linkUrl || rental.notes) && (
            <div className='flex min-w-0 items-center gap-x-3'>
              <NotesViewButton title={rental.name} notes={rental.notes} />
              {rental.linkUrl && <ExternalLinkText href={rental.linkUrl} />}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default OverviewSection;
