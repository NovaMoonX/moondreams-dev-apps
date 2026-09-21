import { Badge } from '@moondreamsdev/dreamer-ui/components';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import { formatEventTime } from '@apps/waypoint/utils/dateUtils';
import type { TimelineEvent } from '@apps/waypoint/types';

interface EventCardProps {
  event: TimelineEvent;
}

const EVENT_LABELS: Record<TimelineEvent['eventType'], string> = {
  TRAVEL: 'Travel',
  MEAL: 'Meal',
  ACTIVITY: 'Activity',
  FREE_TIME: 'Free time',
};

export function EventCard({ event }: EventCardProps) {
  const details = event.eventDetails;
  const quickField =
    event.eventType === 'TRAVEL' && details && 'transitType' in details
      ? details.transitType
      : event.eventType === 'MEAL' && details && 'mealType' in details
        ? details.mealType
        : event.eventType === 'ACTIVITY' && details && 'settings' in details
          ? details.settings.join(' / ')
          : null;

  return (
    <article className='border-border bg-card rounded-lg border p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='muted'>{EVENT_LABELS[event.eventType]}</Badge>
            <span className='text-muted-foreground text-sm'>
              {formatEventTime(event.startAt)}
              {event.endAt ? ` – ${formatEventTime(event.endAt)}` : ''}
            </span>
          </div>
          <h3 className='mt-2 font-semibold'>{event.title}</h3>
          {quickField && (
            <p className='text-muted-foreground mt-1 text-sm'>{quickField}</p>
          )}
          {event.locationName && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {event.locationName}
              {event.address ? ` · ${event.address}` : ''}
            </p>
          )}
        </div>
        <MapNavigationButton
          locationName={event.locationName}
          address={event.address}
          latitude={event.latitude}
          longitude={event.longitude}
        />
      </div>
    </article>
  );
}

export default EventCard;
