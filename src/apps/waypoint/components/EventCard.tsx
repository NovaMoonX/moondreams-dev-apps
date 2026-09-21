import { Badge } from '@moondreamsdev/dreamer-ui/components';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import { formatTime } from '@/utils/formatUtils';
import type { TimelineEvent } from '@apps/waypoint/types';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
} from '@apps/waypoint/constants';

interface EventCardProps {
  event: TimelineEvent;
}

export function EventCard({ event }: EventCardProps) {
  const details = event.eventDetails;
  const quickField =
    event.eventType === 'TRAVEL' && details && 'transitType' in details
      ? details.transitType
      : event.eventType === 'DINING' && details && 'mealType' in details
        ? details.mealType
        : event.eventType === 'ACTIVITY' && details && 'settings' in details
          ? details.settings.join(' / ')
          : null;

  return (
    <article className='border-border bg-card rounded-lg border p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='base' className={EVENT_TYPE_BADGE_CLASSES[event.eventType]}>
              {EVENT_TYPE_EMOJIS[event.eventType]} {EVENT_TYPE_LABELS[event.eventType]}
            </Badge>
            <span className='text-muted-foreground text-sm'>
              {formatTime(event.startAt)}
              {event.endAt ? ` – ${formatTime(event.endAt)}` : ''}
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
        <MapNavigationButton {...event} />
      </div>
    </article>
  );
}

export default EventCard;
