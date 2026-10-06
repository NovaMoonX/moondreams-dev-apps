import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { Play, SkipForward } from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatClockTime, formatCountdown, formatDuration } from '@/utils/formatUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import { EventDetailLines } from '@apps/waypoint/components/EventCard';
import MapNavigationButton from '@apps/waypoint/components/MapNavigationButton';
import PlaceDetailsDrawer from '@apps/waypoint/components/PlaceDetailsDrawer';
import { markEventSeen } from '@apps/waypoint/store/actions/eventActions';
import { selectActiveEvent, selectUpNextEvent } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventTime } from '@apps/waypoint/utils/tripTime';

interface NowPillProps {
  trip: TripSpace;
  currentUserId: string;
}

type View = 'now' | 'next';

function getStatusLine(trip: TripSpace, event: TimelineEvent, view: View, now: number) {
  const { startTime, startMs, endMs } = getEventTime(trip, event);
  if (view === 'now') {
    return endMs !== null ? `Now · ${formatDuration(endMs - now)} left` : 'Now';
  }
  const when = startTime ? formatClockTime(startTime) : '';
  return startMs !== null ? `Up next · ${when} · ${formatCountdown(startMs, now)}` : `Up next · ${when}`;
}

/** What is happening and what comes after, kept in view while the rest of the trip is browsed. It changes minute to minute, so it floats instead of taking a place in the page. */
function NowPill({ trip, currentUserId }: NowPillProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const isPhone = useMediaQuery().isBelow('sm');
  const activeEvent = useAppSelector(selectActiveEvent(trip, now, currentUserId));
  const upNextEvent = useAppSelector(selectUpNextEvent(trip, now, currentUserId));
  const [peekedFor, setPeekedFor] = useState<string | null | undefined>(undefined);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const getView = (): View | null => {
    if (peekedFor === (activeEvent?.id ?? null) && upNextEvent) return 'next';
    if (activeEvent) return 'now';
    return upNextEvent ? 'next' : null;
  };
  const view = getView();
  const event = view === 'now' ? activeEvent : upNextEvent;

  if (!view || !event) {
    return null;
  }

  const canSwap = Boolean(activeEvent && upNextEvent);
  const isOpen = openEventId === event.id;
  const open = () => {
    setOpenEventId(event.id);
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };
  const details = (
    <EventDetailLines
      trip={trip}
      event={event}
      zoneStyle='long'
      showTitle={false}
      showNotes
      canEdit={false}
      onSaveNotes={async () => {}}
    />
  );

  return (
    <>
      <div className='pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-30 flex justify-center px-4 sm:bottom-24'>
        <div className='pointer-events-auto flex max-w-full items-center gap-2'>
          <div
            role='status'
            className={join(
              'bg-popover flex min-w-0 items-center rounded-full border p-1 shadow-lg',
              view === 'now' ? 'border-emerald-500/60' : 'border-border',
            )}
          >
            <Button
              type='button'
              variant='tertiary'
              aria-label={`${getStatusLine(trip, event, view, now)}: ${event.title}. Show details`}
              className='h-auto min-w-0 justify-start gap-2.5 rounded-full px-3 py-1.5 text-left'
              onClick={open}
            >
              <span
                aria-hidden
                className={join(
                  'h-2.5 w-2.5 shrink-0 rounded-full',
                  view === 'now' ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/50',
                )}
              />
              <span className='min-w-0'>
                <span className='text-muted-foreground block text-[11px] leading-tight font-medium tracking-wide uppercase'>
                  {getStatusLine(trip, event, view, now)}
                </span>
                <span className='text-foreground block max-w-48 truncate text-sm leading-tight font-semibold sm:max-w-80'>
                  {event.title}
                </span>
              </span>
            </Button>
          </div>
          {canSwap && (
            <Button
              type='button'
              variant='secondary'
              rounded='full'
              aria-label={view === 'now' ? 'Show what is up next' : 'Show what is happening now'}
              title={view === 'now' ? 'Up next' : 'Now'}
              className='bg-popover! size-12 min-w-12 shrink-0 border p-0 shadow-lg'
              onClick={() => setPeekedFor(view === 'now' ? (activeEvent?.id ?? null) : undefined)}
            >
              {view === 'now' ? <SkipForward className='h-5 w-5' /> : <Play className='h-5 w-5' />}
            </Button>
          )}
        </div>
      </div>
      {isOpen &&
        (isPhone ? (
          <PlaceDetailsDrawer
            key={event.id}
            isOpen
            onClose={() => setOpenEventId(null)}
            title={event.title}
            imageUrl={getDisplayImage(event)}
            location={event}
            linkUrl={event.linkUrl}
            onEdit={null}
          >
            {details}
          </PlaceDetailsDrawer>
        ) : (
          <Modal isOpen onClose={() => setOpenEventId(null)} title={event.title}>
            <div className='space-y-4'>
              {details}
              <div className='flex items-center gap-2'>
                <MapNavigationButton {...event} variant='primary' />
                {event.linkUrl && (
                  <Button href={event.linkUrl} target='_blank' rel='noreferrer' variant='secondary'>
                    Visit site
                  </Button>
                )}
              </div>
            </div>
          </Modal>
        ))}
    </>
  );
}

export default NowPill;
