import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import ChangeBadge from '@apps/waypoint/components/ChangeBadge';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatTime } from '@/utils/formatUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import type { TimelineEvent } from '@apps/waypoint/types';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
} from '@apps/waypoint/constants';

interface EventCardProps {
  event: TimelineEvent;
  canEdit: boolean;
  showCover: boolean;
  onEdit: (event: TimelineEvent) => void;
}

export function EventCard({ event, canEdit, showCover, onEdit }: EventCardProps) {
  const details = event.eventDetails;
  const imageUrl = showCover ? getDisplayImage(event) : null;
  const quickField =
    event.eventType === 'TRAVEL' && details && 'transitType' in details
      ? details.transitType
      : event.eventType === 'DINING' && details && 'mealType' in details
        ? details.mealType
        : event.eventType === 'ACTIVITY' && details && 'settings' in details
          ? details.settings.join(' / ')
          : null;

  return (
    <article className='border-border bg-card overflow-hidden rounded-lg border'>
      {imageUrl && (
        <EnrichedImage
          src={imageUrl}
          alt=''
          className='aspect-video w-full object-cover sm:aspect-[2/1]'
        />
      )}
      <div className='flex items-start justify-between gap-3 p-4'>
        <div className='min-w-0'>
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
          {event.linkUrl && (
            <div className='mt-1'>
              <ExternalLinkText href={event.linkUrl} />
            </div>
          )}
          <ChangeBadge changeHistory={event.changeHistory} />
        </div>
        <div className='flex shrink-0 gap-2'>
          <MapNavigationButton {...event} />
          {canEdit && (
            <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(event)}>
              Modify
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default EventCard;
