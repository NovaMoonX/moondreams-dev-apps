import { useState, type ReactNode } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import EventAttendeeAvatars from '@apps/waypoint/components/EventAttendeeAvatars';
import { getGroupBadge } from '@apps/waypoint/utils/eventBadge';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import type { EventGroup } from '@apps/waypoint/utils/eventGroups';
import { formatEventStartTime, getEventTime } from '@apps/waypoint/utils/tripTime';

const MINUTE_MS = 60_000;

interface EventGroupCardProps {
  trip: TripSpace;
  group: EventGroup;
  showAttendees: boolean;
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

function EventGroupCard({ trip, group, showAttendees, renderEvent }: EventGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const isTravel = group.eventType === 'TRAVEL';
  const badge = getGroupBadge(group.events);
  const lastIndex = group.events.length - 1;
  const currentIndex = Math.min(activeIndex, lastIndex);
  const currentEvent = group.events[currentIndex];
  const previousEvent = currentIndex > 0 ? group.events[currentIndex - 1] : null;
  const layover = previousEvent ? formatLayover(trip, previousEvent, currentEvent) : null;

  const goTo = (index: number) => setActiveIndex(Math.max(0, Math.min(lastIndex, index)));

  return (
    <div className='space-y-2'>
      <div className='border-border bg-card flex items-center gap-3 rounded-lg border p-3'>
        <div className='min-w-0 flex-1 space-y-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='base' className={badge.className}>
              {badge.emoji} {badge.label}
            </Badge>
            <span className='text-muted-foreground text-sm'>
              {group.events.length} events
            </span>
          </div>
          <h3 className='truncate font-semibold'>{group.label}</h3>
          {showAttendees && (
            <EventAttendeeAvatars trip={trip} events={group.events} includeEveryone />
          )}
        </div>
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
      {isExpanded && (
        <div className='ml-4 space-y-3 border-l-2 pl-4'>
          {isTravel ? (
            <>
              <ol className='space-y-1'>
                {group.events.map((event, index) => (
                  <li key={event.id}>
                    <Button
                      type='button'
                      variant='tertiary'
                      size='sm'
                      aria-current={index === currentIndex}
                      className={join(
                        'h-auto w-full justify-start gap-2 px-2 py-1.5 text-left',
                        index === currentIndex && 'bg-muted',
                      )}
                      onClick={() => goTo(index)}
                    >
                      <span className='min-w-0 flex-1 truncate'>{event.title}</span>
                      <span className='text-muted-foreground shrink-0 text-xs'>
                        {formatEventStartTime(trip, event)}
                      </span>
                      {showAttendees && (
                        <EventAttendeeAvatars trip={trip} events={[event]} includeEveryone />
                      )}
                    </Button>
                  </li>
                ))}
              </ol>
              {layover && (
                <p className='text-muted-foreground text-xs'>Layover · {layover}</p>
              )}
              {renderEvent(currentEvent)}
              {group.events.length > 1 && (
                <div className='flex items-center justify-between sm:justify-center'>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    className='sm:hidden'
                    aria-label='Previous leg'
                    disabled={currentIndex === 0}
                    onClick={() => goTo(currentIndex - 1)}
                  >
                    <ChevronLeft className='h-4 w-4' />
                  </Button>
                  <span className='text-muted-foreground text-xs'>
                    {currentIndex + 1} of {group.events.length}
                  </span>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    className='sm:hidden'
                    aria-label='Next leg'
                    disabled={currentIndex === lastIndex}
                    onClick={() => goTo(currentIndex + 1)}
                  >
                    <ChevronRight className='h-4 w-4' />
                  </Button>
                </div>
              )}
            </>
          ) : (
            group.events.map((event) => renderEvent(event))
          )}
        </div>
      )}
    </div>
  );
}

export default EventGroupCard;
