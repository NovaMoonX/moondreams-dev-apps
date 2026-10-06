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

/** What is happening and what comes after, kept in view while the rest of the trip is browsed. It changes minute to minute, so it never takes a place in the page: a floating pill on phones, a docked bar on tablets and a side card on wide screens. */
function NowPill({ trip, currentUserId }: NowPillProps) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const breakpoints = useMediaQuery();
  const isPhone = breakpoints.isBelow('sm');
  const isWide = breakpoints.isAtLeast('xl');
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
  const openEvent = [activeEvent, upNextEvent].find((candidate) => candidate?.id === openEventId) ?? null;
  const open = (target: TimelineEvent) => {
    setOpenEventId(target.id);
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: target.id }));
  };
  const swap = () => setPeekedFor(view === 'now' ? (activeEvent?.id ?? null) : undefined);
  const details = openEvent && (
    <EventDetailLines
      trip={trip}
      event={openEvent}
      zoneStyle='long'
      showTitle={false}
      showNotes
      canEdit={false}
      onSaveNotes={async () => {}}
    />
  );

  const renderRow = (target: TimelineEvent, rowView: View, className?: string) => (
    <Button
      type='button'
      variant='tertiary'
      aria-label={`${getStatusLine(trip, target, rowView, now)}: ${target.title}. Show details`}
      className={join('h-auto min-w-0 justify-start gap-2.5 rounded-full px-3 py-1.5 text-left', className)}
      onClick={() => open(target)}
    >
      <span
        aria-hidden
        className={join(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          rowView === 'now' ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/50',
        )}
      />
      <span className='min-w-0'>
        <span className='text-muted-foreground block text-[11px] leading-tight font-medium tracking-wide uppercase'>
          {getStatusLine(trip, target, rowView, now)}
        </span>
        <span className='text-foreground block max-w-48 truncate text-sm leading-tight font-semibold sm:max-w-80'>
          {target.title}
        </span>
      </span>
    </Button>
  );

  const swapButton = canSwap && (
    <Button
      type='button'
      variant='secondary'
      rounded='full'
      aria-label={view === 'now' ? 'Show what is up next' : 'Show what is happening now'}
      title={view === 'now' ? 'Up next' : 'Now'}
      className='bg-popover! size-12 min-w-12 shrink-0 border p-0 shadow-lg'
      onClick={swap}
    >
      {view === 'now' ? <SkipForward className='h-5 w-5' /> : <Play className='h-5 w-5' />}
    </Button>
  );

  const renderSurface = () => {
    if (isWide) {
      return (
        <aside
          aria-label='Happening now'
          className='bg-popover fixed top-28 right-6 z-30 w-64 space-y-1 rounded-2xl border p-2 shadow-lg'
        >
          {activeEvent && renderRow(activeEvent, 'now', 'w-full rounded-xl')}
          {upNextEvent && renderRow(upNextEvent, 'next', 'w-full rounded-xl')}
        </aside>
      );
    }
    if (isPhone) {
      return (
        <div className='pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-30 flex justify-center px-4'>
          <div className='pointer-events-auto flex max-w-full items-center gap-2'>
            <div
              role='status'
              className={join(
                'bg-popover flex min-w-0 items-center rounded-full border p-1 shadow-lg',
                view === 'now' ? 'border-emerald-500/60' : 'border-border',
              )}
            >
              {renderRow(event, view)}
            </div>
            {swapButton}
          </div>
        </div>
      );
    }
    return (
      <div
        role='status'
        className='bg-background/95 border-border fixed inset-x-0 bottom-9 z-20 border-t backdrop-blur'
      >
        <div className='mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-1'>
          {renderRow(event, view, 'rounded-lg')}
          {canSwap && (
            <Button type='button' size='sm' variant='secondary' className='h-10 shrink-0' onClick={swap}>
              {view === 'now' ? 'Up next' : 'Now'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {renderSurface()}
      {openEvent &&
        (isPhone ? (
          <PlaceDetailsDrawer
            key={openEvent.id}
            isOpen
            onClose={() => setOpenEventId(null)}
            title={openEvent.title}
            imageUrl={getDisplayImage(openEvent)}
            location={openEvent}
            linkUrl={openEvent.linkUrl}
            onEdit={null}
          >
            {details}
          </PlaceDetailsDrawer>
        ) : (
          <Modal isOpen onClose={() => setOpenEventId(null)} title={openEvent.title}>
            <div className='space-y-4'>
              {details}
              <div className='flex items-center gap-2'>
                <MapNavigationButton {...openEvent} variant='primary' />
                {openEvent.linkUrl && (
                  <Button href={openEvent.linkUrl} target='_blank' rel='noreferrer' variant='secondary'>
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
