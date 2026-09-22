import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import ChangeBadge from '@apps/waypoint/components/ChangeBadge';
import EnrichedImage from '@apps/waypoint/components/EnrichedImage';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import { formatTime } from '@/utils/formatUtils';
import type { TimelineEvent } from '@apps/waypoint/types';
import { getDisplayImage, getDisplayLink } from '@apps/waypoint/utils/enrichment';
import { patchEventPlacePhoto } from '@apps/waypoint/store/actions/eventActions';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
} from '@apps/waypoint/constants';

interface EventCardProps {
  event: TimelineEvent;
  canEdit: boolean;
  showRichContent: boolean;
  onEdit: (event: TimelineEvent) => void;
}

export function EventCard({ event, canEdit, showRichContent, onEdit }: EventCardProps) {
  const details = event.eventDetails;
  const imageUrl = showRichContent ? getDisplayImage(event) : null;
  const linkHref = showRichContent ? getDisplayLink(event) : null;
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
          className='h-36 w-full object-cover'
          refreshFrom={
            event.place
              ? {
                  place: event.place,
                  canEdit,
                  onRefreshed: (photoUrl, photoRefreshedAt) =>
                    void patchEventPlacePhoto(event.tripId, event.id, photoUrl, photoRefreshedAt),
                }
              : undefined
          }
        />
      )}
      <div className='flex items-start justify-between gap-3 p-4'>
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
          <ChangeBadge changeHistory={event.changeHistory} />
        </div>
        <div className='flex shrink-0 flex-col items-end gap-2'>
          <div className='flex gap-2'>
            <MapNavigationButton {...event} />
            {canEdit && (
              <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(event)}>
                Modify
              </Button>
            )}
          </div>
          {linkHref && (
            <a
              href={linkHref}
              target='_blank'
              rel='noreferrer'
              className='text-primary text-xs font-medium hover:underline'
            >
              View link
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export default EventCard;
