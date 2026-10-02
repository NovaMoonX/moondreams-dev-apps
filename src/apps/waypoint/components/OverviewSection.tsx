import { useState, type KeyboardEvent, type MouseEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { LogIn, PlayCircle } from 'lucide-react';

import { useAppDispatch, useAppSelector } from '@/store';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatClockTime, formatCountdown, formatDuration } from '@/utils/formatUtils';
import { getDayCount, getLocalDayIndex } from '@/utils/dateRangeUtils';
import { isSameLocalCalendarDay } from '@/utils/dateInputUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';

import { EventDetailLines } from '@apps/waypoint/components/EventCard';
import { StayDetailLines } from '@apps/waypoint/components/StayCard';
import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import SharedAlbumSection from '@apps/waypoint/components/SharedAlbumSection';
import StayNotesButton from '@apps/waypoint/components/StayNotesButton';
import TodayAgenda from '@apps/waypoint/components/TodayAgenda';
import { markEventSeen } from '@apps/waypoint/store/actions/eventActions';
import {
  getTripStatus,
  selectActiveEvent,
  selectStays,
  selectUpNextEvent,
} from '@apps/waypoint/store/selectors';
import type { Stay, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  formatEventTimeRange,
  getEventTime,
  getStayTime,
  getStayTimezoneLabel,
  isRelativeTrip,
} from '@apps/waypoint/utils/tripTime';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
} from '@apps/waypoint/constants';

type OverviewDetail = { type: 'event'; event: TimelineEvent } | { type: 'stay'; stay: Stay };

interface OverviewSectionProps {
  trip: TripSpace;
  currentUserId: string;
  onViewDay: (dayIndex: number) => void;
}

function stopPropagation(clickEvent: MouseEvent) {
  clickEvent.stopPropagation();
}

function getStayLocation(stay: Stay) {
  return {
    locationName: stay.stayType === 'HOTEL' ? stay.name : null,
    address: stay.address,
    latitude: stay.latitude,
    longitude: stay.longitude,
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

function OverviewSection({ trip, currentUserId, onViewDay }: OverviewSectionProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const isLive = getTripStatus(trip, now) === 'ACTIVE';
  const activeEvent = useAppSelector(selectActiveEvent(trip, now));
  const upNextEvent = useAppSelector(selectUpNextEvent(trip, now));
  const stays = useAppSelector(selectStays);
  const [detail, setDetail] = useState<OverviewDetail | null>(null);
  const isSmallScreen = useMediaQuery().isBelow('sm');

  if (!isLive) {
    return null;
  }

  const todayIndex = getLocalDayIndex(trip.startDate, now);
  const hasTomorrow = todayIndex + 1 < getDayCount(trip.startDate, trip.endDate);
  const isCheckInToday = (stay: Stay) =>
    isRelativeTrip(trip)
      ? getStayTime(trip, stay).checkIn.dayIndex === todayIndex
      : stay.checkInAt !== null && isSameLocalCalendarDay(stay.checkInAt, now);
  const checkInStays = stays
    .filter(isCheckInToday)
    .sort((a, b) => (getStayTime(trip, a).checkInMs ?? 0) - (getStayTime(trip, b).checkInMs ?? 0));
  // Nothing left today — no event running right now, and whatever's next (if
  // anything) isn't until a later day.
  const isDoneForToday =
    !activeEvent &&
    (!upNextEvent || getEventTime(trip, upNextEvent).dayIndex !== todayIndex);

  // Below `sm`, Active Now/Up Next/Checking-in cards are too tight for the full
  // details, so tapping opens the drawer — same split Timeline/EventCard use.
  // At `sm`+, the cards show everything inline instead and are never clickable.
  const openEventDrawer = (event: TimelineEvent) => {
    setDetail({ type: 'event', event });
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };

  const openStayDrawer = (stay: Stay) => {
    setDetail({ type: 'stay', stay });
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
        {activeEvent && (
          <ActiveNowCard
            trip={trip}
            event={activeEvent}
            now={now}
            isSmallScreen={isSmallScreen}
            onOpenDetails={() => openEventDrawer(activeEvent)}
          />
        )}
        {upNextEvent && (
          <UpNextCard
            trip={trip}
            event={upNextEvent}
            now={now}
            isSmallScreen={isSmallScreen}
            onOpenDetails={() => openEventDrawer(upNextEvent)}
          />
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
            title='Today'
            dayIndex={todayIndex}
            now={now}
            onOpenEvent={openEventDrawer}
          />
          {hasTomorrow && (
            <TodayAgenda
              trip={trip}
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


function EventTypeBadge({ event }: { event: TimelineEvent }) {
  return (
    <Badge variant='base' className={EVENT_TYPE_BADGE_CLASSES[event.eventType]}>
      {EVENT_TYPE_EMOJIS[event.eventType]} {EVENT_TYPE_LABELS[event.eventType]}
    </Badge>
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
          <EnrichedImage
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
            <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
              <StayNotesButton stay={stay} />
              {stay.linkUrl && <ExternalLinkText href={stay.linkUrl} />}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ActiveNowCard({
  trip,
  event,
  now,
  isSmallScreen,
  onOpenDetails,
}: {
  trip: TripSpace;
  event: TimelineEvent;
  now: number;
  isSmallScreen: boolean;
  onOpenDetails: () => void;
}) {
  const { startMs, endMs } = getEventTime(trip, event);
  const duration = startMs !== null && endMs !== null ? endMs - startMs : null;
  const progress =
    duration !== null && duration > 0 && startMs !== null
      ? Math.min(1, Math.max(0, (now - startMs) / duration))
      : null;
  const imageUrl = getDisplayImage(event);
  const clickProps = isSmallScreen ? getOpenDetailsProps(event.title, onOpenDetails) : {};

  return (
    <article
      {...clickProps}
      className={join(
        'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 overflow-hidden rounded-xl border-2 shadow-sm',
        isSmallScreen && 'cursor-pointer',
      )}
    >
      {imageUrl && (
        <EnrichedImage src={imageUrl} alt='' className='aspect-video w-full object-cover' />
      )}
      <div className='p-3.5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <p className='text-emerald-700 dark:text-emerald-300 flex items-center gap-1 text-xs font-bold tracking-wide uppercase'>
                <PlayCircle className='h-3 w-3' /> Active now
              </p>
              <EventTypeBadge event={event} />
            </div>
            <h3 className='mt-1 truncate text-lg font-bold'>{event.title}</h3>
            <p className='text-muted-foreground text-xs'>
              {formatEventTimeRange(trip, event)}
            </p>
            {(event.locationName || event.address) && (
              <LocationLink
                {...event}
                label={[event.locationName, event.address].filter(Boolean).join(' · ')}
                className='mt-1'
              />
            )}
            {!isSmallScreen && event.linkUrl && (
              <div className='mt-1'>
                <ExternalLinkText href={event.linkUrl} />
              </div>
            )}
          </div>
          <div onClick={stopPropagation}>
            <MapNavigationButton {...event} variant='primary' />
          </div>
        </div>
        {progress !== null && (
          <div className='mt-2'>
            <div className='bg-emerald-500/20 h-1 overflow-hidden rounded-full'>
              <div
                className='bg-emerald-500 h-full transition-[width]'
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {formatDuration((endMs as number) - now)} left
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function UpNextCard({
  trip,
  event,
  now,
  isSmallScreen,
  onOpenDetails,
}: {
  trip: TripSpace;
  event: TimelineEvent;
  now: number;
  isSmallScreen: boolean;
  onOpenDetails: () => void;
}) {
  const imageUrl = getDisplayImage(event);
  const clickProps = isSmallScreen ? getOpenDetailsProps(event.title, onOpenDetails) : {};
  const locationLabel = [event.locationName, event.address].filter(Boolean).join(' · ');
  const { startTime, startMs } = getEventTime(trip, event);

  return (
    <div
      {...clickProps}
      className={join(
        'border-border flex items-start justify-between gap-3 border-l-2 py-1 pl-4 pr-5',
        isSmallScreen && 'cursor-pointer',
      )}
    >
      <div className='flex items-start gap-3'>
        {imageUrl && (
          <EnrichedImage
            src={imageUrl}
            alt=''
            className='h-12 w-12 shrink-0 rounded object-cover'
          />
        )}
        <div>
          <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
            Up Next
          </p>
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <EventTypeBadge event={event} />
            <span className='text-muted-foreground text-sm'>
              {startTime ? formatClockTime(startTime) : ''}
              {startMs !== null ? ` · ${formatCountdown(startMs, now)}` : ''}
            </span>
          </div>
          <h4 className='mt-1 text-sm font-medium'>{event.title}</h4>
          {isSmallScreen ? (
            event.locationName && (
              <p className='text-muted-foreground text-xs'>{event.locationName}</p>
            )
          ) : (
            locationLabel && <LocationLink {...event} label={locationLabel} className='text-xs' />
          )}
          {!isSmallScreen && event.linkUrl && (
            <div className='mt-1'>
              <ExternalLinkText href={event.linkUrl} />
            </div>
          )}
        </div>
      </div>
      <div onClick={stopPropagation}>
        <MapNavigationButton {...event} />
      </div>
    </div>
  );
}

export default OverviewSection;
