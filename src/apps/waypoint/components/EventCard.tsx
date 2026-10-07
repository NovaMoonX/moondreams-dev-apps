import { useState, type KeyboardEvent } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Archive, ArchiveRestore, Layers } from 'lucide-react';

import ChangeBadge from '@apps/waypoint/components/ChangeBadge';
import EventAttendeeAvatars from '@apps/waypoint/components/EventAttendeeAvatars';
import EventWeatherChip from '@apps/waypoint/components/EventWeatherChip';
import LocationLink from '@apps/waypoint/components/LocationLink';
import NotPaidForBadge from '@apps/waypoint/components/NotPaidForBadge';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import NotesField from '@apps/waypoint/components/NotesField';
import FallbackImage from '@/components/FallbackImage';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import ExternalLinkText from '@/components/ExternalLinkText';
import type { HourForecast } from '@/lib/weather/types';
import { formatClockTime } from '@/utils/formatUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { formatEventTimeRange, getEventTime, type ZoneStyle } from '@apps/waypoint/utils/tripTime';
import {
  ACTIVITY_SETTING_LABELS,
  EVENT_LINK_KIND_LABELS,
  EXPENSE_TRACKED_EVENT_TYPES,
  MEAL_TYPE_LABELS,
  TRANSIT_TYPE_LABELS,
} from '@apps/waypoint/constants';
import { getEventBadge } from '@apps/waypoint/utils/eventBadge';
import { getFlightTrackingUrl, getTransitSummary } from '@apps/waypoint/utils/transitDetails';

const EVENT_NOTES_PLACEHOLDER = 'Reservation name, what to bring, where to meet…';

interface EventCardProps {
  trip: TripSpace;
  event: TimelineEvent;
  canEdit: boolean;
  /** Only an admin may archive or restore an event — everyone else, including editors who
   * could otherwise modify it, sees an archived event fully read-only. */
  canArchive: boolean;
  showCover: boolean;
  showAttendees: boolean;
  isStacked: boolean;
  /** The event belongs to a group of legs, so stacking it stacks the whole group. */
  isGrouped?: boolean;
  /** Opens the stack editor for this event; `onSuccess` closes the mobile drawer once it's done. */
  onStack: (event: TimelineEvent, onSuccess?: () => void) => void;
  /** Only true once the trip has started — archiving is unavailable for an upcoming trip. */
  showArchiveToggle: boolean;
  /** `onSuccess`, when given, is the mobile details drawer's own close — call it only once
   * the edit actually completes, not just because the edit modal was opened. */
  onEdit: (event: TimelineEvent, onSuccess?: () => void) => void;
  onSaveNotes: (event: TimelineEvent, notes: string) => Promise<void>;
  onToggleArchived: (event: TimelineEvent, onSuccess?: () => void) => void;
  weather?: HourForecast | null;
}

function getQuickField(event: TimelineEvent): string | null {
  const details = event.eventDetails;
  if (event.eventType === 'TRAVEL' && details && 'transitType' in details) {
    return TRANSIT_TYPE_LABELS[details.transitType] ?? details.transitType;
  }
  if (event.eventType === 'DINING' && details && 'mealType' in details) {
    const cuisines = (details.cuisines ?? []).join(', ');
    return [MEAL_TYPE_LABELS[details.mealType] ?? details.mealType, cuisines]
      .filter(Boolean)
      .join(' · ');
  }
  if (event.eventType === 'ACTIVITY' && details && 'settings' in details) {
    return details.settings.map((setting) => ACTIVITY_SETTING_LABELS[setting] ?? setting).join(' / ');
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
  showAttendees?: boolean;
  /** Cards abbreviate the zone ("PDT"); the full details view spells it out. */
  zoneStyle?: ZoneStyle;
  weather?: HourForecast | null;
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
  showAttendees = true,
  zoneStyle = 'short',
  weather = null,
  canEdit,
  onSaveNotes,
}: EventDetailLinesProps) {
  const quickField = getQuickField(event);
  const badge = getEventBadge(event);
  const locationLabel = [event.locationName, event.address].filter(Boolean).join(' · ');
  const { startMs, endMs } = getEventTime(trip, event);
  const impliedDurationMs = startMs !== null && endMs !== null && endMs > startMs ? endMs - startMs : null;
  const transitLines =
    event.eventType === 'TRAVEL' && event.eventDetails && 'transitType' in event.eventDetails
      ? getTransitSummary(
          event.eventDetails.transitType,
          event.eventDetails.transitDetails,
          event.title,
          impliedDurationMs,
        )
      : [];
  const trackingUrl =
    event.eventType === 'TRAVEL' && event.eventDetails && 'transitType' in event.eventDetails
      ? getFlightTrackingUrl(event.eventDetails.transitType, event.eventDetails.transitDetails)
      : null;

  return (
    <>
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant='base' className={badge.className}>
          {badge.emoji} {badge.label}
        </Badge>
        {event.isArchived && (
          <Badge variant='muted' outline className='items-center gap-1'>
            <Archive className='h-3 w-3' /> Archived
          </Badge>
        )}
        <span className='text-muted-foreground text-sm'>
          {formatEventTimeRange(trip, event, zoneStyle)}
        </span>
        {EXPENSE_TRACKED_EVENT_TYPES.includes(event.eventType) && !event.isArchived && (
          <NotPaidForBadge kind='EVENT' id={event.id} />
        )}
        {weather && <EventWeatherChip weather={weather} />}
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
      {quickField && !event.title.toLowerCase().includes(quickField.toLowerCase()) && (
        <p className='text-muted-foreground text-sm'>{quickField}</p>
      )}
      {transitLines.length > 0 && (
        <dl className='text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm'>
          {transitLines.map((line) => (
            <div key={line.label} className='contents'>
              <dt>{line.label}</dt>
              <dd className='text-foreground'>{line.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {trackingUrl && (
        <div onClick={(clickEvent) => clickEvent.stopPropagation()}>
          <ExternalLinkText href={trackingUrl} label='Track flight status' />
        </div>
      )}
      {showAttendees && event.attendeeTargetType !== 'EVERYONE_INCLUDING_FUTURE' && (
        <EventAttendeeAvatars trip={trip} events={[event]} />
      )}
      {locationLabel && <LocationLink {...event} label={locationLabel} />}
      {(event.venueOpenTime || event.venueCloseTime) && (
        <p className='text-muted-foreground text-sm'>
          Open {event.venueOpenTime ? formatClockTime(event.venueOpenTime) : '?'} -{' '}
          {event.venueCloseTime ? formatClockTime(event.venueCloseTime) : '?'}
        </p>
      )}
      {event.linkUrl && (
        <div className='flex min-w-0 items-center gap-1.5' onClick={(clickEvent) => clickEvent.stopPropagation()}>
          {event.linkKind && (
            <span className='text-muted-foreground shrink-0 text-sm'>
              {EVENT_LINK_KIND_LABELS[event.linkKind]}:
            </span>
          )}
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
  showAttendees,
  isStacked,
  isGrouped = false,
  onStack,
  showArchiveToggle,
  onEdit,
  onSaveNotes,
  onToggleArchived,
  weather = null,
}: EventCardProps) {
  // An archived event is read-only for everyone but an admin, who may only unarchive it.
  const canModify = canEdit && !event.isArchived;
  const canToggleArchive = canArchive;
  const stackActionLabel = isStacked ? 'Edit stack' : isGrouped ? 'Stack whole group' : 'Stack event';
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
          <FallbackImage
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
              showAttendees={showAttendees}
              weather={weather}
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
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  aria-label={stackActionLabel}
                  title={stackActionLabel}
                  onClick={() => onStack(event)}
                >
                  <Layers className={join('h-4 w-4', isStacked && 'fill-current text-primary')} />
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
          onEdit={canModify ? () => { closeDrawer(); onEdit(event); } : null}
          stackLabel={stackActionLabel}
          onStack={canModify ? () => { closeDrawer(); onStack(event); } : null}
          archiveLabel={event.isArchived ? 'Unarchive event' : 'Archive event'}
          onArchive={canToggleArchive && showArchiveToggle ? () => onToggleArchived(event, closeDrawer) : null}
        >
          <EventDetailLines
            trip={trip}
            event={event}
            zoneStyle='long'
            weather={weather}
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
