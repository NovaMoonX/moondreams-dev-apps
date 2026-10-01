import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Check } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppSelector } from '@/store';
import { formatTime } from '@/utils/formatUtils';

import { getEventStatus, selectEventsByDay } from '@apps/waypoint/store/selectors';
import type { TimelineEvent } from '@apps/waypoint/types';
import { EVENT_TYPE_EMOJIS } from '@apps/waypoint/constants';

interface TodayAgendaProps {
  title: string;
  dayIndex: number;
  now: number;
  limit?: number;
  onViewAll?: () => void;
  onOpenEvent: (event: TimelineEvent) => void;
}

function TodayAgenda({ title, dayIndex, now, limit, onViewAll, onOpenEvent }: TodayAgendaProps) {
  const dayEvents = useAppSelector(selectEventsByDay(dayIndex), shallowEqual);
  const events = dayEvents
    .filter((event) => !event.isArchived)
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, limit);

  if (events.length === 0) {
    return null;
  }

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
        {events.map((event) => {
          const status = getEventStatus(event, now);
          const isDone = status === 'COMPLETED';

          return (
            <li key={event.id}>
              <Button
                type='button'
                variant='tertiary'
                onClick={() => onOpenEvent(event)}
                className='h-auto w-full justify-start gap-3 rounded-none px-3 py-2.5 text-left'
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
                  {isDone ? <Check className='h-3.5 w-3.5' /> : EVENT_TYPE_EMOJIS[event.eventType]}
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
                  {status === 'ACTIVE' ? 'Now' : formatTime(event.startAt)}
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default TodayAgenda;
