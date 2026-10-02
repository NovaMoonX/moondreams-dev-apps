import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check, ChevronDown } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { formatClockTime } from '@/utils/formatUtils';

import { getEventStatus, selectEventsByDay } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { groupEventsByLabel, type EventGroup } from '@apps/waypoint/utils/eventGroups';
import { getEventTime } from '@apps/waypoint/utils/tripTime';
import { getEventBadge, getGroupBadge } from '@apps/waypoint/utils/eventBadge';

interface TodayAgendaProps {
  trip: TripSpace;
  title: string;
  dayIndex: number;
  now: number;
  limit?: number;
  onViewAll?: () => void;
  onOpenEvent: (event: TimelineEvent) => void;
}

function TodayAgenda({ trip, title, dayIndex, now, limit, onViewAll, onOpenEvent }: TodayAgendaProps) {
  const dayEvents = useAppSelector(selectEventsByDay(dayIndex), shallowEqual);
  const items = groupEventsByLabel(
    dayEvents
      .filter((event) => !event.isArchived)
      .sort((a, b) => (getEventTime(trip, a).startMs ?? 0) - (getEventTime(trip, b).startMs ?? 0)),
  ).slice(0, limit);

  if (items.length === 0) {
    return null;
  }

  const renderRow = (event: TimelineEvent, isNested = false) => {
    const status = getEventStatus(trip, event, now);
    const isDone = status === 'COMPLETED';

    return (
      <li key={event.id}>
        <Button
          type='button'
          variant='tertiary'
          onClick={() => onOpenEvent(event)}
          className={join(
            'h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 text-left',
            isNested && 'pl-6',
          )}
        >
          <span
            aria-hidden
            className={join(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs',
              isDone && 'bg-muted text-muted-foreground',
              status === 'ACTIVE' && 'bg-emerald-500/15 text-emerald-600',
              status === 'UPCOMING' && 'bg-muted',
            )}
          >
            {isDone ? <Check className='h-3.5 w-3.5' /> : getEventBadge(event).emoji}
          </span>
          <span className='min-w-0 flex-1'>
            <span
              className={join(
                'block truncate text-sm font-medium',
                isDone && 'text-muted-foreground',
              )}
            >
              {event.title}
            </span>
            {event.locationName && (
              <span className='text-muted-foreground block truncate text-xs'>
                {event.locationName}
              </span>
            )}
          </span>
          <span
            className={join(
              'shrink-0 text-xs',
              status === 'ACTIVE' ? 'font-medium text-emerald-600' : 'text-muted-foreground',
            )}
          >
            {status === 'ACTIVE' ? 'Now' : formatClockTime(getEventTime(trip, event).startTime ?? '00:00')}
          </span>
        </Button>
      </li>
    );
  };

  return (
    <section className='space-y-1'>
      <div className='flex items-center justify-between px-1'>
        <h3 className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {title}
        </h3>
        {onViewAll && (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={onViewAll}
          >
            See all
          </Button>
        )}
      </div>
      <ul className='divide-border border-border divide-y rounded-xl border'>
        {items.map((item) =>
          item.kind === 'group' ? (
            <AgendaGroup key={item.key} group={item} renderRow={renderRow} />
          ) : (
            renderRow(item.event)
          ),
        )}
      </ul>
    </section>
  );
}

interface AgendaGroupProps {
  group: EventGroup;
  renderRow: (event: TimelineEvent, isNested?: boolean) => React.ReactNode;
}

function AgendaGroup({ group, renderRow }: AgendaGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <li>
      <Button
        type='button'
        variant='tertiary'
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
        className='h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 text-left'
      >
        <span
          aria-hidden
          className='bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs'
        >
          {getGroupBadge(group.events).emoji}
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-sm font-medium'>{group.label}</span>
          <span className='text-muted-foreground block text-xs'>{group.events.length} events</span>
        </span>
        <ChevronDown
          className={join('h-4 w-4 shrink-0 transition-transform', isExpanded && 'rotate-180')}
        />
      </Button>
      {isExpanded && (
        <ul className='divide-border border-border divide-y border-t'>
          {group.events.map((event) => renderRow(event, true))}
        </ul>
      )}
    </li>
  );
}

export default TodayAgenda;
