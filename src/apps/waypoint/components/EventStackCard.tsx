import { useState, type PointerEvent, type ReactNode } from 'react';

import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';

import { getDayDateLabel } from '@/utils/dateRangeUtils';
import EventAttendeeAvatars from '@apps/waypoint/components/EventAttendeeAvatars';
import { getGroupBadge } from '@apps/waypoint/utils/eventBadge';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventAttendeeIds } from '@apps/waypoint/utils/attendeeCalculators';
import type { EventStack } from '@apps/waypoint/utils/eventGroups';
import { formatEventTimeRange, getEventTime } from '@apps/waypoint/utils/tripTime';

const SWIPE_THRESHOLD_PX = 50;
const MINUTE_MS = 60_000;
const MAX_PEEKING_CARDS = 2;

interface EventStackCardProps {
  trip: TripSpace;
  stack: EventStack;
  currentUserId: string;
  showAttendees: boolean;
  canEdit: boolean;
  onManage: (event: TimelineEvent) => void;
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
  };
  const day = first.event.dayIndex === null ? '' : `${getDayDateLabel(trip.startDate, first.event.dayIndex)} · `;
  const result = `${day}${formatEventTimeRange(trip, span)}`;
  return result;
}

interface ItineraryLegsProps {
  trip: TripSpace;
  member: EventStack['members'][number];
  renderEvent: (event: TimelineEvent) => ReactNode;
}

/** One traveler's itinerary: a single event, or every leg of their group laid out top to bottom. */
function Itinerary({ trip, member, renderEvent }: ItineraryLegsProps) {
  if (member.kind === 'event') {
    return <>{renderEvent(member.event)}</>;
  }

  return (
    <div className='space-y-2'>
      <p className='text-muted-foreground px-1 text-sm font-medium'>{member.label}</p>
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

function EventStackCard({ trip, stack, currentUserId, showAttendees, canEdit, onManage, renderEvent }: EventStackCardProps) {
  const memberIds = Object.keys(trip.members);
  const yourIndex = stack.members.findIndex((member) =>
    (member.kind === 'event' ? [member.event] : member.events).some((event) =>
      getEventAttendeeIds(event, memberIds).includes(currentUserId),
    ),
  );
  const [activeIndex, setActiveIndex] = useState(Math.max(0, yourIndex));
  const [swipeStart, setSwipeStart] = useState<{ x: number; y: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const badge = getGroupBadge(stack.events);
  const lastIndex = stack.members.length - 1;
  const currentIndex = Math.min(activeIndex, lastIndex);
  const currentMember = stack.members[currentIndex];
  const currentEvent = currentMember.kind === 'event' ? currentMember.event : currentMember.events[0];
  const peekingCards = Math.min(lastIndex, MAX_PEEKING_CARDS);

  const goTo = (index: number) => setActiveIndex(Math.max(0, Math.min(lastIndex, index)));

  const handlePointerMove = (pointerEvent: PointerEvent<HTMLDivElement>) => {
    if (swipeStart === null) {
      return;
    }

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    setDragX(Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : 0);
  };

  const handlePointerEnd = (pointerEvent: PointerEvent<HTMLDivElement>) => {
    if (swipeStart === null) {
      return;
    }

    const deltaX = pointerEvent.clientX - swipeStart.x;
    const deltaY = pointerEvent.clientY - swipeStart.y;
    setSwipeStart(null);
    setDragX(0);
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY)) {
      goTo(currentIndex + (deltaX < 0 ? 1 : -1));
    }
  };

  return (
    <div className='space-y-2'>
      <div className='flex items-start justify-between gap-3 px-1'>
        <div className='min-w-0 space-y-1'>
          <div className='flex items-center gap-2'>
            <Layers className='text-primary h-4 w-4 shrink-0' aria-hidden='true' />
            <h3 className='truncate font-semibold'>{stack.label}</h3>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='base' className={badge.className}>
              {badge.emoji} {badge.label}
            </Badge>
            <span className='text-muted-foreground text-sm'>{formatStackSpan(trip, stack.events)}</span>
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
            size='icon'
            aria-label='Previous trip'
            className='hidden sm:inline-flex'
            disabled={currentIndex === 0}
            onClick={() => goTo(currentIndex - 1)}
          >
            <ChevronLeft className='h-4 w-4' />
          </Button>
          <span className='text-muted-foreground text-xs tabular-nums'>
            {currentIndex + 1} / {stack.members.length}
          </span>
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-label='Next trip'
            className='hidden sm:inline-flex'
            disabled={currentIndex === lastIndex}
            onClick={() => goTo(currentIndex + 1)}
          >
            <ChevronRight className='h-4 w-4' />
          </Button>
        </div>
      </div>
      <div className='relative isolate' style={{ marginRight: peekingCards * 6 }}>
        {Array.from({ length: peekingCards }, (_, index) => (
          <div
            key={index}
            aria-hidden='true'
            className='border-border bg-card absolute rounded-lg border shadow-sm'
            style={{
              top: (index + 1) * 6,
              bottom: (index + 1) * 6,
              right: -(index + 1) * 6,
              left: 'calc(100% - 8px)',
              zIndex: -(index + 1),
            }}
          />
        ))}
        <div
          className='touch-pan-y'
          style={{
            transform: dragX ? `translateX(${dragX}px)` : undefined,
            transition: swipeStart === null ? 'transform 150ms ease-out' : undefined,
          }}
          onPointerDown={(pointerEvent) => setSwipeStart({ x: pointerEvent.clientX, y: pointerEvent.clientY })}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={() => {
            setSwipeStart(null);
            setDragX(0);
          }}
        >
          <Itinerary trip={trip} member={currentMember} renderEvent={renderEvent} />
        </div>
      </div>
      <div className='flex items-center justify-center gap-1.5'>
        {stack.members.map((member, index) => (
          <Button
            key={member.kind === 'event' ? member.event.id : member.key}
            type='button'
            variant='tertiary'
            aria-label={`Show trip ${index + 1}`}
            aria-current={index === currentIndex}
            className={join(
              'h-1.5 min-h-0 w-1.5 min-w-0 rounded-full p-0',
              index === currentIndex ? 'bg-primary' : 'bg-muted-foreground/30',
            )}
            onClick={() => goTo(index)}
          />
        ))}
      </div>
    </div>
  );
}

export default EventStackCard;
