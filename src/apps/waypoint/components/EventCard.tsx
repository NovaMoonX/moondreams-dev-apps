import { useState, type KeyboardEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import ChangeBadge from '@apps/waypoint/components/ChangeBadge';
import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import EnrichedImage from '@/components/EnrichedImage';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatClockTime, formatTime } from '@/utils/formatUtils';
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

function getQuickField(event: TimelineEvent): string | null {
  const details = event.eventDetails;
  if (event.eventType === 'TRAVEL' && details && 'transitType' in details) {
    return details.transitType;
  }
  if (event.eventType === 'DINING' && details && 'mealType' in details) {
    return details.mealType;
  }
  if (event.eventType === 'ACTIVITY' && details && 'settings' in details) {
    return details.settings.join(' / ');
  }
  return null;
}

interface EventDetailLinesProps {
  event: TimelineEvent;
  showTitle: boolean;
  showNotes: boolean;
}

function EventDetailLines({ event, showTitle, showNotes }: EventDetailLinesProps) {
  const quickField = getQuickField(event);
  const locationLabel = [event.locationName, event.address].filter(Boolean).join(' · ');

  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='base' className={EVENT_TYPE_BADGE_CLASSES[event.eventType]}>
          {EVENT_TYPE_EMOJIS[event.eventType]} {EVENT_TYPE_LABELS[event.eventType]}
        </Badge>
        <span className='text-muted-foreground text-sm'>
          {formatTime(event.startAt)}
          {event.endAt ? ` - ${formatTime(event.endAt)}` : ''}
        </span>
      </div>
      {showTitle && <h3 className='pt-1 font-semibold'>{event.title}</h3>}
      {quickField && <p className='text-muted-foreground text-sm'>{quickField}</p>}
      {locationLabel && <LocationLink {...event} label={locationLabel} />}
      {(event.venueOpenTime || event.venueCloseTime) && (
        <p className='text-muted-foreground text-sm'>
          Open {event.venueOpenTime ? formatClockTime(event.venueOpenTime) : '?'} -{' '}
          {event.venueCloseTime ? formatClockTime(event.venueCloseTime) : '?'}
        </p>
      )}
      {event.linkUrl && (
        <div onClick={(clickEvent) => clickEvent.stopPropagation()}>
          <ExternalLinkText href={event.linkUrl} />
        </div>
      )}
      {showNotes && event.notes && (
        <p className='text-sm whitespace-pre-line'>{event.notes}</p>
      )}
      <ChangeBadge changeHistory={event.changeHistory} />
    </>
  );
}

export function EventCard({ event, canEdit, showCover, onEdit }: EventCardProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isSmallScreen = useMediaQuery().isBelow('sm');
  const imageUrl = showCover ? getDisplayImage(event) : null;
  const drawerTriggerProps = isSmallScreen
    ? {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Open details for ${event.title}`,
        onClick: () => setIsDrawerOpen(true),
        onKeyDown: (keyEvent: KeyboardEvent<HTMLElement>) => {
          if (keyEvent.target === keyEvent.currentTarget && (keyEvent.key === 'Enter' || keyEvent.key === ' ')) {
            keyEvent.preventDefault();
            setIsDrawerOpen(true);
          }
        },
      }
    : {};

  return (
    <>
      <article
        {...drawerTriggerProps}
        className={join(
          'border-border bg-card overflow-hidden rounded-lg border',
          isSmallScreen && 'cursor-pointer',
        )}
      >
        {imageUrl && (
          <EnrichedImage
            src={imageUrl}
            alt=''
            className='aspect-video w-full object-cover sm:aspect-2/1'
          />
        )}
        <div className='flex items-start justify-between gap-3 p-4'>
          <div className='min-w-0 space-y-1'>
            <EventDetailLines event={event} showTitle showNotes={false} />
          </div>
          {!isSmallScreen && (
            <div className='flex shrink-0 gap-2'>
              <MapNavigationButton {...event} />
              {canEdit && (
                <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(event)}>
                  Modify
                </Button>
              )}
            </div>
          )}
        </div>
      </article>
      {isSmallScreen && (
        <PlaceDetailsDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title={event.title}
          imageUrl={getDisplayImage(event)}
          location={event}
          linkUrl={event.linkUrl}
          onEdit={canEdit ? () => onEdit(event) : null}
        >
          <EventDetailLines event={event} showTitle={false} showNotes />
        </PlaceDetailsDrawer>
      )}
    </>
  );
}

export default EventCard;
