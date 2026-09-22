import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import { formatCountdown, formatTime } from '@/utils/formatUtils';
import { getDayCount, getDayIndex } from '@/utils/dateRangeUtils';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import {
  getTripStatus,
  selectActiveEvent,
  selectUpNextEvent,
} from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
} from '@apps/waypoint/constants';

interface OverviewSectionProps {
  trip: TripSpace;
  onViewDay: (dayIndex: number) => void;
}

function OverviewSection({ trip, onViewDay }: OverviewSectionProps) {
  const now = useNow();
  const isLive = getTripStatus(trip, now) === 'ACTIVE';
  const activeEvent = useAppSelector(selectActiveEvent(now));
  const upNextEvent = useAppSelector(selectUpNextEvent(now));

  if (!isLive) {
    return null;
  }

  const todayIndex = getDayIndex(trip.startDate, now);
  const hasTomorrow = todayIndex + 1 < getDayCount(trip.startDate, trip.endDate);

  return (
    <div className='space-y-3'>
      {activeEvent && <ActiveNowCard event={activeEvent} />}
      {upNextEvent && <UpNextCard event={upNextEvent} now={now} />}
      <div className='flex flex-wrap gap-x-4 gap-y-1 pt-1'>
        <Button
          type='button'
          variant='link'
          size='sm'
          className='h-auto p-0 text-xs'
          onClick={() => onViewDay(todayIndex)}
        >
          View today&apos;s full schedule
        </Button>
        {hasTomorrow && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={() => onViewDay(todayIndex + 1)}
          >
            View tomorrow&apos;s schedule
          </Button>
        )}
      </div>
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

function ActiveNowCard({ event }: { event: TimelineEvent }) {
  return (
    <article className='border-primary bg-card rounded-xl border-2 p-5 shadow-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-primary text-xs font-bold tracking-wide uppercase'>
            Active Now
          </p>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <EventTypeBadge event={event} />
            <span className='text-muted-foreground text-sm'>
              {formatTime(event.startAt)}
              {event.endAt ? ` – ${formatTime(event.endAt)}` : ''}
            </span>
          </div>
          <h3 className='mt-2 text-xl font-bold'>{event.title}</h3>
          {event.locationName && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {event.locationName}
            </p>
          )}
        </div>
        <MapNavigationButton {...event} />
      </div>
    </article>
  );
}

function UpNextCard({ event, now }: { event: TimelineEvent; now: number }) {
  return (
    <div className='flex items-start justify-between gap-3 px-1'>
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
      <MapNavigationButton {...event} />
    </div>
  );
}

export default OverviewSection;
