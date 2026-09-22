import { Badge } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import { formatCountdown, formatTime } from '@/utils/formatUtils';

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
}

function OverviewSection({ trip }: OverviewSectionProps) {
  const now = useNow();
  const isLive = getTripStatus(trip, now) === 'ACTIVE';
  const activeEvent = useAppSelector(selectActiveEvent(now));
  const upNextEvent = useAppSelector(selectUpNextEvent(now));

  if (!isLive || (!activeEvent && !upNextEvent)) {
    return null;
  }

  return (
    <div className='space-y-3'>
      {activeEvent && <ActiveNowCard event={activeEvent} />}
      {upNextEvent && <UpNextCard event={upNextEvent} now={now} />}
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
    <article className='border-primary bg-card rounded-lg border-2 p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-primary text-xs font-semibold tracking-wide uppercase'>
            Active Now
          </p>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <EventTypeBadge event={event} />
            <span className='text-muted-foreground text-sm'>
              {formatTime(event.startAt)}
              {event.endAt ? ` – ${formatTime(event.endAt)}` : ''}
            </span>
          </div>
          <h3 className='mt-2 text-lg font-semibold'>{event.title}</h3>
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
    <article className='border-border bg-card rounded-lg border p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            Up Next
          </p>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            <EventTypeBadge event={event} />
            <span className='text-muted-foreground text-sm'>
              {formatTime(event.startAt)} · {formatCountdown(event.startAt, now)}
            </span>
          </div>
          <h3 className='mt-2 font-semibold'>{event.title}</h3>
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

export default OverviewSection;
