import { Badge, Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import { useNow } from '@/hooks/useNow';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import { formatCountdown, formatDuration, formatTime } from '@/utils/formatUtils';
import { getDayCount, getDayIndex } from '@/utils/dateRangeUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';

import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import {
  getTripStatus,
  selectActiveEvent,
  selectUpNextEvent,
} from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  EVENT_TYPE_BADGE_CLASSES,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
} from '@apps/waypoint/constants';

interface OverviewSectionProps {
  trip: TripSpace;
  onViewDay: (dayIndex: number) => void;
}

function OverviewSection({ trip, onViewDay }: OverviewSectionProps) {
  const now = useNow();
  const isLive = getTripStatus(trip, now) === 'ACTIVE';
  const activeEvent = useAppSelector(selectActiveEvent(now));
  const upNextEvent = useAppSelector(selectUpNextEvent(now));

  if (!isLive) {
    return null;
  }

  const todayIndex = getDayIndex(trip.startDate, now);
  const hasTomorrow = todayIndex + 1 < getDayCount(trip.startDate, trip.endDate);

  return (
    <div className='space-y-4'>
      {activeEvent && <ActiveNowCard event={activeEvent} now={now} />}
      {upNextEvent && <UpNextCard event={upNextEvent} now={now} />}
      <div className='flex flex-wrap gap-x-4 gap-y-1 pt-1'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='h-auto p-0 text-xs'
          onClick={() => onViewDay(todayIndex)}
        >
          View today&apos;s full schedule
        </Button>
        {hasTomorrow && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-auto p-0 text-xs'
            onClick={() => onViewDay(todayIndex + 1)}
          >
            View tomorrow&apos;s schedule
          </Button>
        )}
      </div>
    </div>
  );
}

function EventTypeBadge({ event }: { event: TimelineEvent }) {
  return (
    <Badge variant='base' className={EVENT_TYPE_BADGE_CLASSES[event.eventType]}>
      {EVENT_TYPE_EMOJIS[event.eventType]} {EVENT_TYPE_LABELS[event.eventType]}
    </Badge>
  );
}

function ActiveNowCard({ event, now }: { event: TimelineEvent; now: number }) {
  const duration = event.endAt !== null ? event.endAt - event.startAt : null;
  const progress =
    duration !== null && duration > 0
      ? Math.min(1, Math.max(0, (now - event.startAt) / duration))
      : null;
  // Ignores the Timeline's "Show covers" toggle — Active Now is the one place the
  // cover should always be as prominent as possible.
  const imageUrl = getDisplayImage(event);

  return (
    <article className='border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 overflow-hidden rounded-xl border-2 shadow-sm'>
      {imageUrl && (
        <EnrichedImage
          src={imageUrl}
          alt=''
          className='aspect-video w-full object-cover sm:aspect-[2/1]'
        />
      )}
      <div className='p-5'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-emerald-700 dark:text-emerald-300 text-xs font-bold tracking-wide uppercase'>
              Active Now
            </p>
            <div className='mt-2 flex flex-wrap items-center gap-2'>
              <EventTypeBadge event={event} />
              <span className='text-muted-foreground text-sm'>
                {formatTime(event.startAt)}
                {event.endAt ? ` - ${formatTime(event.endAt)}` : ''}
              </span>
            </div>
            <h3 className='mt-2 text-xl font-bold'>{event.title}</h3>
            {(event.locationName || event.address) && (
              <p className='text-muted-foreground mt-1 text-sm'>
                {event.locationName}
                {event.locationName && event.address ? ' · ' : ''}
                {event.address}
              </p>
            )}
            {event.linkUrl && (
              <div className='mt-1'>
                <ExternalLinkText href={event.linkUrl} />
              </div>
            )}
          </div>
          <MapNavigationButton {...event} />
        </div>
        {progress !== null && (
          <div className='mt-4'>
            <div className='bg-emerald-500/20 h-1 overflow-hidden rounded-full'>
              <div
                className='bg-emerald-500 h-full transition-[width]'
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {formatDuration((event.endAt as number) - now)} left
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function UpNextCard({ event, now }: { event: TimelineEvent; now: number }) {
  const imageUrl = getDisplayImage(event);

  return (
    <div className='border-border flex items-start justify-between gap-3 border-l-2 py-1 pl-4 pr-5'>
      <div className='flex items-start gap-3'>
        {imageUrl && (
          <EnrichedImage
            src={imageUrl}
            alt=''
            className='h-12 w-12 shrink-0 rounded object-cover'
          />
        )}
        <div>
          <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
            Up Next
          </p>
          <div className='mt-1 flex flex-wrap items-center gap-2'>
            <EventTypeBadge event={event} />
            <span className='text-muted-foreground text-sm'>
              {formatTime(event.startAt)} · {formatCountdown(event.startAt, now)}
            </span>
          </div>
          <h4 className='mt-1 text-sm font-medium'>{event.title}</h4>
          {event.locationName && (
            <p className='text-muted-foreground text-xs'>{event.locationName}</p>
          )}
        </div>
      </div>
      <MapNavigationButton {...event} />
    </div>
  );
}

export default OverviewSection;
