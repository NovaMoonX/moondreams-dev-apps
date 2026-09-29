import { useState, type KeyboardEvent, type MouseEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatCountdown, formatDuration, formatTime } from '@/utils/formatUtils';
import { getDayCount, getDayIndex } from '@/utils/dateRangeUtils';
import { isSameLocalCalendarDay } from '@/utils/dateInputUtils';
import { formatTimezoneLabel } from '@/utils/timezoneUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';

import AnnouncementsList from '@apps/waypoint/components/AnnouncementsList';
import { EventDetailLines } from '@apps/waypoint/components/EventCard';
import { StayDetailLines } from '@apps/waypoint/components/StayCard';
import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import StayNotesButton from '@apps/waypoint/components/StayNotesButton';
import { markEventSeen } from '@apps/waypoint/store/actions/eventActions';
import {
  getTripStatus,
  selectActiveEvent,
  selectLiveAnnouncements,
  selectStays,
  selectUnseenActivityEvents,
  selectUpNextEvent,
} from '@apps/waypoint/store/selectors';
import type { Stay, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
  STAY_TYPE_LABELS,
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

/** Shared click/keyboard-activation props for an Overview card that opens a read-only details drawer. */
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
  const activeEvent = useAppSelector(selectActiveEvent(now));
  const upNextEvent = useAppSelector(selectUpNextEvent(now));
  const stays = useAppSelector(selectStays);
  const unseenEvents = useAppSelector(selectUnseenActivityEvents(trip, currentUserId), shallowEqual);
  const announcements = useAppSelector(selectLiveAnnouncements(currentUserId, now), shallowEqual);
  const [detail, setDetail] = useState<OverviewDetail | null>(null);

  if (!isLive) {
    return null;
  }

  const todayIndex = getDayIndex(trip.startDate, now);
  const hasTomorrow = todayIndex + 1 < getDayCount(trip.startDate, trip.endDate);
  const checkInStays = stays.filter((stay) => isSameLocalCalendarDay(stay.checkInAt, now));

  const openEventDetails = (event: TimelineEvent) => {
    setDetail({ type: 'event', event });
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };

  return (
    <div className='space-y-4'>
      {announcements.length > 0 && (
        <AnnouncementsList trip={trip} currentUserId={currentUserId} announcements={announcements} />
      )}
      {unseenEvents.length > 0 && (
        <RecentUpdatesList trip={trip} events={unseenEvents} onOpenDetails={openEventDetails} />
      )}
      {checkInStays.map((stay) => (
        <CheckInStayCard
          key={stay.id}
          stay={stay}
          onOpenDetails={() => setDetail({ type: 'stay', stay })}
        />
      ))}
      {activeEvent && (
        <ActiveNowCard event={activeEvent} now={now} onOpenDetails={() => openEventDetails(activeEvent)} />
      )}
      {upNextEvent && (
        <UpNextCard event={upNextEvent} now={now} onOpenDetails={() => openEventDetails(upNextEvent)} />
      )}
      <div className='flex flex-wrap gap-x-4 gap-y-1 pt-1'>
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

function RecentUpdatesList({
  trip,
  events,
  onOpenDetails,
}: {
  trip: TripSpace;
  events: TimelineEvent[];
  onOpenDetails: (event: TimelineEvent) => void;
}) {
  return (
    <div className='border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 space-y-1 rounded-xl border p-3'>
      <p className='text-amber-700 dark:text-amber-300 text-xs font-bold tracking-wide uppercase'>
        Recent updates
      </p>
      <ul className='space-y-1'>
        {events.map((event) => (
          <li key={event.id}>
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto min-h-0 p-0! text-sm'
              onClick={() => onOpenDetails(event)}
            >
              {event.createdAt >= trip.startDate ? 'New: ' : 'Updated: '}
              {event.title}
            </Button>
          </li>
        ))}
      </ul>
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

function CheckInStayCard({ stay, onOpenDetails }: { stay: Stay; onOpenDetails: () => void }) {
  const imageUrl = getDisplayImage(stay);

  return (
    <article
      {...getOpenDetailsProps(stay.name, onOpenDetails)}
      className='border-sky-500/60 bg-sky-50 dark:bg-sky-950/30 flex cursor-pointer overflow-hidden rounded-xl border border-2'
    >
      {imageUrl && (
        <EnrichedImage src={imageUrl} alt='' className='w-24 shrink-0 object-cover sm:w-36' />
      )}
      <div className='flex min-w-0 flex-1 items-start justify-between gap-3 p-4'>
        <div className='min-w-0'>
          <p className='text-sky-700 dark:text-sky-300 text-xs font-bold tracking-wide uppercase'>
            Checking in today
          </p>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <h3 className='font-semibold'>{stay.name}</h3>
            <Badge variant='muted' outline>
              {STAY_TYPE_LABELS[stay.stayType]}
            </Badge>
          </div>
          <p className='text-muted-foreground mt-1 text-sm'>{stay.address}</p>
          <p className='text-muted-foreground mt-1 text-sm'>
            Check-in at {formatTime(stay.checkInAt)}
            {stay.checkInTimezone ? ` · ${formatTimezoneLabel(stay.checkInTimezone)}` : ''}
          </p>
          {stay.confirmationCode && (
            <p className='text-muted-foreground mt-1 text-sm'>
              Confirmation <span className='text-foreground font-medium'>{stay.confirmationCode}</span>
            </p>
          )}
          {(stay.linkUrl || stay.notes) && (
            <div className='mt-1 flex flex-wrap items-center gap-x-4 gap-y-1' onClick={stopPropagation}>
              <StayNotesButton stay={stay} />
              {stay.linkUrl && <ExternalLinkText href={stay.linkUrl} />}
            </div>
          )}
        </div>
        <div onClick={stopPropagation}>
          <MapNavigationButton
            locationName={stay.name}
            address={stay.address}
            latitude={stay.latitude}
            longitude={stay.longitude}
          />
        </div>
      </div>
    </article>
  );
}

function ActiveNowCard({
  event,
  now,
  onOpenDetails,
}: {
  event: TimelineEvent;
  now: number;
  onOpenDetails: () => void;
}) {
  const duration = event.endAt !== null ? event.endAt - event.startAt : null;
  const progress =
    duration !== null && duration > 0
      ? Math.min(1, Math.max(0, (now - event.startAt) / duration))
      : null;
  // Ignores the Timeline's "Show covers" toggle — Active Now is the one place the
  // cover should always be as prominent as possible.
  const imageUrl = getDisplayImage(event);

  return (
    <article
      {...getOpenDetailsProps(event.title, onOpenDetails)}
      className='border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 cursor-pointer overflow-hidden rounded-xl border-2 shadow-sm'
    >
      {imageUrl && (
        <EnrichedImage
          src={imageUrl}
          alt=''
          className='aspect-video w-full object-cover sm:aspect-2/1'
        />
      )}
      <div className='p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-emerald-700 dark:text-emerald-300 text-xs font-bold tracking-wide uppercase'>
              Active Now
            </p>
            <div className='mt-2 flex flex-wrap items-center gap-2'>
              <EventTypeBadge event={event} />
              <span className='text-muted-foreground text-sm'>
                {formatTime(event.startAt)}
                {event.endAt ? ` - ${formatTime(event.endAt)}` : ''}
              </span>
            </div>
            <h3 className='mt-2 text-xl font-bold'>{event.title}</h3>
            {(event.locationName || event.address) && (
              <LocationLink
                {...event}
                label={[event.locationName, event.address].filter(Boolean).join(' · ')}
                className='mt-1'
              />
            )}
            {event.linkUrl && (
              <div className='mt-1' onClick={stopPropagation}>
                <ExternalLinkText href={event.linkUrl} />
              </div>
            )}
          </div>
          <div onClick={stopPropagation}>
            <MapNavigationButton {...event} />
          </div>
        </div>
        {progress !== null && (
          <div className='mt-4'>
            <div className='bg-emerald-500/20 h-1 overflow-hidden rounded-full'>
              <div
                className='bg-emerald-500 h-full transition-[width]'
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {formatDuration((event.endAt as number) - now)} left
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function UpNextCard({
  event,
  now,
  onOpenDetails,
}: {
  event: TimelineEvent;
  now: number;
  onOpenDetails: () => void;
}) {
  const imageUrl = getDisplayImage(event);

  return (
    <div
      {...getOpenDetailsProps(event.title, onOpenDetails)}
      className='border-border flex cursor-pointer items-start justify-between gap-3 border-l-2 py-1 pl-4 pr-5'
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
              {formatTime(event.startAt)} · {formatCountdown(event.startAt, now)}
            </span>
          </div>
          <h4 className='mt-1 text-sm font-medium'>{event.title}</h4>
          {event.locationName && (
            <p className='text-muted-foreground text-xs'>{event.locationName}</p>
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
