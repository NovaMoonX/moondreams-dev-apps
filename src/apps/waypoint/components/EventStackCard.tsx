import { useState, type ReactNode } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronLeft, ChevronRight, Layers, Route } from 'lucide-react';

import { getDayDateLabel } from '@/utils/dateRangeUtils';
import EventAttendeeAvatars from '@apps/waypoint/components/EventAttendeeAvatars';
import { getGroupBadge } from '@apps/waypoint/utils/eventBadge';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventAttendeeIds } from '@apps/waypoint/utils/attendeeCalculators';
import type { EventStack } from '@apps/waypoint/utils/eventGroups';
import { formatEventTimeRange, getEventTime } from '@apps/waypoint/utils/tripTime';

const MINUTE_MS = 60_000;

interface EventStackCardProps {
  trip: TripSpace;
  stack: EventStack;
  currentUserId: string;
  showAttendees: boolean;
  canEdit: boolean;
  onManage: (event: TimelineEvent) => void;
  onManageGroup: (event: TimelineEvent) => void;
  /** Renders one event as its full card. */
  renderEvent: (event: TimelineEvent) => ReactNode;
}

function formatLayover(trip: TripSpace, previous: TimelineEvent, next: TimelineEvent) {
  const previousEnd = getEventTime(trip, previous).endMs;
  const nextStart = getEventTime(trip, next).startMs;
  if (previousEnd === null || nextStart === null || nextStart <= previousEnd) {
    return null;
  }

  const totalMinutes = Math.round((nextStart - previousEnd) / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const label = [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ');
  return label;
}

/** Where the whole stack starts and ends: the earliest start through the latest end. */
function formatStackSpan(trip: TripSpace, events: TimelineEvent[]) {
  const timed = events.map((event) => ({ event, time: getEventTime(trip, event) }));
  const first = timed.reduce((best, item) => ((item.time.startMs ?? Infinity) < (best.time.startMs ?? Infinity) ? item : best), timed[0]);
  const last = timed.reduce(
    (best, item) =>
      (item.time.endMs ?? item.time.startMs ?? -Infinity) > (best.time.endMs ?? best.time.startMs ?? -Infinity) ? item : best,
    timed[0],
  );
  const span = {
    ...first.event,
    endDayIndex: last.event.endDayIndex ?? last.event.dayIndex,
    endTime: last.event.endTime ?? last.event.startTime,
    endAt: last.event.endAt ?? last.event.startAt,
    endTimezone: last.event.endTime ? (last.event.endTimezone ?? last.event.timezone) : last.event.timezone,
  };
  const day = first.event.dayIndex === null ? '' : `${getDayDateLabel(trip.startDate, first.event.dayIndex)} · `;
  const result = `${day}${formatEventTimeRange(trip, span)}`;
  return result;
}

interface ItineraryLegsProps {
  trip: TripSpace;
  member: EventStack['members'][number];
  renderEvent: (event: TimelineEvent) => ReactNode;
  onManageGroup: ((event: TimelineEvent) => void) | null;
}

/** One traveler's itinerary: a single event, or every leg of their group laid out top to bottom. */
function Itinerary({ trip, member, renderEvent, onManageGroup }: ItineraryLegsProps) {
  if (member.kind === 'event') {
    return <>{renderEvent(member.event)}</>;
  }

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-2 px-1'>
        <p className='text-muted-foreground text-sm font-medium'>{member.label}</p>
        {onManageGroup && (
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-label='Edit group'
            onClick={() => onManageGroup(member.events[0])}
          >
            <Route className='h-4 w-4' />
          </Button>
        )}
      </div>
      {member.events.map((leg, index) => {
        const layover =
          index > 0 && member.eventType === 'TRAVEL' ? formatLayover(trip, member.events[index - 1], leg) : null;
        return (
          <div key={leg.id} className='space-y-2'>
            {layover && <p className='text-muted-foreground px-1 text-xs'>Layover · {layover}</p>}
            {renderEvent(leg)}
          </div>
        );
      })}
    </div>
  );
}

function EventStackCard({ trip, stack, currentUserId, showAttendees, canEdit, onManage, onManageGroup, renderEvent }: EventStackCardProps) {
  const memberIds = Object.keys(trip.members);
  const yourIndex = stack.members.findIndex((member) =>
    (member.kind === 'event' ? [member.event] : member.events).some((event) =>
      getEventAttendeeIds(event, memberIds).includes(currentUserId),
    ),
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, yourIndex));
  const badge = getGroupBadge(stack.events);
  const lastIndex = stack.members.length - 1;
  const currentIndex = Math.min(activeIndex, lastIndex);
  const currentMember = stack.members[currentIndex];
  const currentEvent = currentMember.kind === 'event' ? currentMember.event : currentMember.events[0];

  const goTo = (index: number) => setActiveIndex(Math.max(0, Math.min(lastIndex, index)));

  return (
    <div className='space-y-2'>
      <div className='border-border bg-card flex items-start justify-between gap-3 rounded-lg border p-3'>
        <div className='min-w-0 space-y-1'>
          <div className='flex items-center gap-2'>
            <Layers className='text-primary h-4 w-4 shrink-0' aria-hidden='true' />
            <h3 className='truncate font-semibold'>{stack.label}</h3>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='base' className={badge.className}>
              {badge.emoji} {badge.label}
            </Badge>
            <span className='text-muted-foreground text-sm'>
              {stack.members.length} {stack.members.length === 1 ? 'trip' : 'trips'} · {formatStackSpan(trip, stack.events)}
            </span>
          </div>
          {showAttendees && <EventAttendeeAvatars trip={trip} events={stack.events} includeEveryone />}
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          {canEdit && (
            <Button
              type='button'
              variant='tertiary'
              size='icon'
              aria-label='Edit stack'
              onClick={() => onManage(currentEvent)}
            >
              <Layers className='h-4 w-4 fill-current' />
            </Button>
          )}
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            aria-expanded={isExpanded}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? 'Hide' : 'Show'}
            <ChevronDown
              className={join('ml-1 h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
            />
          </Button>
        </div>
      </div>
      {isExpanded && (
        <div className='ml-4 space-y-3 border-l-2 border-primary/30 pl-4'>
          {stack.members.length > 1 && (
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-xs tabular-nums'>
              Trip {currentIndex + 1} of {stack.members.length}
            </span>
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label='Previous trip'
                disabled={currentIndex === 0}
                onClick={() => goTo(currentIndex - 1)}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <Button
                type='button'
                variant='tertiary'
                size='icon'
                aria-label='Next trip'
                disabled={currentIndex === lastIndex}
                onClick={() => goTo(currentIndex + 1)}
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
            </div>
          </div>
          )}
          <Itinerary
            trip={trip}
            member={currentMember}
            renderEvent={renderEvent}
            onManageGroup={canEdit ? onManageGroup : null}
          />
          {stack.members.length > 1 && (
          <div className='flex items-center justify-center'>
            {stack.members.map((member, index) => (
              <Button
                key={member.kind === 'event' ? member.event.id : member.key}
                type='button'
                variant='tertiary'
                aria-label={`Show trip ${index + 1}`}
                aria-current={index === currentIndex}
                className='h-6 min-h-0 w-6 min-w-0 p-0'
                onClick={() => goTo(index)}
              >
                <span
                  className={join(
                    'h-1.5 w-1.5 rounded-full',
                    index === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30',
                  )}
                />
              </Button>
            ))}
          </div>
          )}
          <p className='text-muted-foreground text-center text-xs'>End of {stack.label}</p>
        </div>
      )}
    </div>
  );
}

export default EventStackCard;
