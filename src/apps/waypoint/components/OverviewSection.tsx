import { useState, type KeyboardEvent, type MouseEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import EnrichedImage from '@/components/EnrichedImage';
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
import SharedAlbumSection from '@apps/waypoint/components/SharedAlbumSection';
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
  // Nothing left today — no event running right now, and whatever's next (if
  // anything) isn't until a later day.
  const isDoneForToday =
    !activeEvent &&
    (!upNextEvent || getDayIndex(trip.startDate, upNextEvent.startAt) !== todayIndex);

  const openEventDetails = (event: TimelineEvent) => {
    setDetail({ type: 'event', event });
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };

  const dismissAllUnseen = () => {
    unseenEvents.forEach((event) => {
      void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
    });
  };

  return (
    <div className='space-y-3'>
      {announcements.length > 0 && (
        <AnnouncementsList trip={trip} currentUserId={currentUserId} announcements={announcements} />
      )}
      {unseenEvents.length > 0 && (
        <RecentUpdatesList
          trip={trip}
          events={unseenEvents}
          onOpenDetails={openEventDetails}
          onDismissAll={dismissAllUnseen}
        />
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
      {isDoneForToday && (
        <SharedAlbumSection trip={trip} currentUserId={currentUserId} variant='banner' />
      )}
      <div className='grid grid-cols-2 gap-2 sm:hidden'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => onViewDay(todayIndex)}
        >
          Today&apos;s schedule
        </Button>
        {hasTomorrow && (
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => onViewDay(todayIndex + 1)}
          >
            Tomorrow&apos;s schedule
          </Button>
        )}
      </div>
      <div className='hidden flex-wrap gap-x-4 gap-y-1 pt-1 sm:flex'>
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
  onDismissAll,
}: {
  trip: TripSpace;
  events: TimelineEvent[];
  onOpenDetails: (event: TimelineEvent) => void;
  onDismissAll: () => void;
}) {
  const [firstEvent, ...restEvents] = events;

  return (
    <div className='border-amber-500/60 bg-amber-50 dark:bg-amber-950/30 flex items-center gap-2 rounded-xl border p-2.5'>
      <p className='text-amber-700 dark:text-amber-300 shrink-0 text-xs font-bold tracking-wide uppercase'>
        Updates
      </p>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        className='h-auto min-h-0 min-w-0 flex-1 justify-start p-0! text-left'
        onClick={() => onOpenDetails(firstEvent)}
      >
        <span className='block min-w-0 truncate text-sm underline underline-offset-2'>
          {(firstEvent.createdAt >= trip.startDate ? 'New: ' : 'Updated: ') + firstEvent.title}
        </span>
      </Button>
      {restEvents.length > 0 && (
        <span className='text-muted-foreground shrink-0 text-xs'>+{restEvents.length} more</span>
      )}
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        aria-label='Dismiss all recent updates'
        className='text-muted-foreground hover:text-foreground size-5 shrink-0 bg-transparent! hover:bg-transparent!'
        onClick={onDismissAll}
      >
        <X className='h-3.5 w-3.5' />
      </Button>
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
      className='border-sky-500/60 bg-sky-50 dark:bg-sky-950/30 flex cursor-pointer items-center gap-3 rounded-xl border p-3'
    >
      {imageUrl && (
        <EnrichedImage src={imageUrl} alt='' className='h-12 w-12 shrink-0 rounded-lg object-cover' />
      )}
      <div className='min-w-0 flex-1 space-y-0.5'>
        <p className='text-sky-700 dark:text-sky-300 text-xs font-bold tracking-wide uppercase'>
          Checking in today
        </p>
        <h3 className='truncate text-sm font-semibold'>{stay.name}</h3>
        <p className='text-muted-foreground truncate text-xs'>
          {formatTime(stay.checkInAt)}
          {stay.checkInTimezone ? ` · ${formatTimezoneLabel(stay.checkInTimezone)}` : ''}
        </p>
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
          className='h-36 w-full object-cover sm:aspect-2/1 sm:h-auto'
        />
      )}
      <div className='p-3.5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <p className='text-emerald-700 dark:text-emerald-300 text-xs font-bold tracking-wide uppercase'>
                Active Now
              </p>
              <EventTypeBadge event={event} />
            </div>
            <h3 className='mt-1 truncate text-lg font-bold'>{event.title}</h3>
            <p className='text-muted-foreground text-xs'>
              {formatTime(event.startAt)}
              {event.endAt ? ` - ${formatTime(event.endAt)}` : ''}
            </p>
            {(event.locationName || event.address) && (
              <LocationLink
                {...event}
                label={[event.locationName, event.address].filter(Boolean).join(' · ')}
                className='mt-1'
              />
            )}
          </div>
          <div onClick={stopPropagation}>
            <MapNavigationButton {...event} />
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
