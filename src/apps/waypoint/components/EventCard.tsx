import { useState, type KeyboardEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Archive, ArchiveRestore } from 'lucide-react';

import ChangeBadge from '@apps/waypoint/components/ChangeBadge';
import LocationLink from '@apps/waypoint/components/LocationLink';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import NotesField from '@apps/waypoint/components/NotesField';
import EnrichedImage from '@/components/EnrichedImage';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatClockTime } from '@/utils/formatUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { formatEventTimeRange } from '@apps/waypoint/utils/tripTime';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
} from '@apps/waypoint/constants';

const EVENT_NOTES_PLACEHOLDER = 'Reservation name, what to bring, where to meet…';

interface EventCardProps {
  trip: TripSpace;
  event: TimelineEvent;
  canEdit: boolean;
  /** Only an admin may archive or restore an event — everyone else, including editors who
   * could otherwise modify it, sees an archived event fully read-only. */
  canArchive: boolean;
  showCover: boolean;
  /** Only true once the trip has started — archiving is unavailable for an upcoming trip. */
  showArchiveToggle: boolean;
  /** `onSuccess`, when given, is the mobile details drawer's own close — call it only once
   * the edit actually completes, not just because the edit modal was opened. */
  onEdit: (event: TimelineEvent, onSuccess?: () => void) => void;
  onSaveNotes: (event: TimelineEvent, notes: string) => Promise<void>;
  onToggleArchived: (event: TimelineEvent, onSuccess?: () => void) => void;
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

export interface EventDetailLinesProps {
  trip: TripSpace;
  event: TimelineEvent;
  showTitle: boolean;
  showNotes: boolean;
  showNotesIndicator?: boolean;
  showChangeHistory?: boolean;
  canEdit: boolean;
  onSaveNotes: (event: TimelineEvent, notes: string) => Promise<void>;
}

export function EventDetailLines({
  trip,
  event,
  showTitle,
  showNotes,
  showNotesIndicator,
  showChangeHistory = true,
  canEdit,
  onSaveNotes,
}: EventDetailLinesProps) {
  const quickField = getQuickField(event);
  const locationLabel = [event.locationName, event.address].filter(Boolean).join(' · ');

  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='base' className={EVENT_TYPE_BADGE_CLASSES[event.eventType]}>
          {EVENT_TYPE_EMOJIS[event.eventType]} {EVENT_TYPE_LABELS[event.eventType]}
        </Badge>
        {event.isArchived && (
          <Badge variant='muted' outline className='items-center gap-1'>
            <Archive className='h-3 w-3' /> Archived
          </Badge>
        )}
        <span className='text-muted-foreground text-sm'>
          {formatEventTimeRange(trip, event)}
        </span>
        {showNotesIndicator && event.notes && (
          <span
            className='bg-primary inline-block h-1.5 w-1.5 shrink-0 rounded-full'
            role='img'
            aria-label='Has notes'
            title='Has notes'
          />
        )}
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
      {showNotes && (
        <NotesField
          key={event.id}
          notes={event.notes}
          canEdit={canEdit}
          onSave={(notes) => onSaveNotes(event, notes)}
          variant='link'
          placeholder={EVENT_NOTES_PLACEHOLDER}
        />
      )}
      {showChangeHistory && (
        <div onClick={(clickEvent) => clickEvent.stopPropagation()}>
          <ChangeBadge changeHistory={event.changeHistory ?? []} />
        </div>
      )}
    </>
  );
}

export function EventCard({
  trip,
  event,
  canEdit,
  canArchive,
  showCover,
  showArchiveToggle,
  onEdit,
  onSaveNotes,
  onToggleArchived,
}: EventCardProps) {
  // An archived event is read-only for everyone but an admin, who may only unarchive it.
  const canModify = canEdit && !event.isArchived;
  const canToggleArchive = canArchive;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const closeDrawer = () => setIsDrawerOpen(false);
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
          event.isArchived && 'opacity-60',
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
            <EventDetailLines
              trip={trip}
              event={event}
              showTitle
              showNotes={false}
              showNotesIndicator={isSmallScreen}
              canEdit={canModify}
              onSaveNotes={onSaveNotes}
            />
          </div>
          {!isSmallScreen && (
            <div className='flex shrink-0 gap-2'>
              {!event.isArchived && <MapNavigationButton {...event} />}
              {canToggleArchive && showArchiveToggle && (
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  aria-label={event.isArchived ? 'Unarchive event' : 'Archive event'}
                  onClick={() => onToggleArchived(event)}
                >
                  {event.isArchived ? (
                    <ArchiveRestore className='h-4 w-4' />
                  ) : (
                    <Archive className='h-4 w-4' />
                  )}
                </Button>
              )}
              {canModify && (
                <Button type='button' size='sm' variant='secondary' onClick={() => onEdit(event)}>
                  Modify
                </Button>
              )}
            </div>
          )}
        </div>
        {!isSmallScreen && (event.notes || canModify) && (
          <div className='-mt-2 px-4 pb-3'>
            <NotesField
              key={event.id}
              notes={event.notes}
              canEdit={canModify}
              onSave={(notes) => onSaveNotes(event, notes)}
              variant='subtle'
              placeholder={EVENT_NOTES_PLACEHOLDER}
            />
          </div>
        )}
      </article>
      {isSmallScreen && (
        <PlaceDetailsDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title={event.title}
          imageUrl={getDisplayImage(event)}
          location={event}
          linkUrl={event.linkUrl}
          onEdit={canModify ? () => onEdit(event, closeDrawer) : null}
          archiveLabel={event.isArchived ? 'Unarchive event' : 'Archive event'}
          onArchive={canToggleArchive && showArchiveToggle ? () => onToggleArchived(event, closeDrawer) : null}
        >
          <EventDetailLines
            trip={trip}
            event={event}
            showTitle={false}
            showNotes
            canEdit={canModify}
            onSaveNotes={onSaveNotes}
          />
        </PlaceDetailsDrawer>
      )}
    </>
  );
}

export default EventCard;
