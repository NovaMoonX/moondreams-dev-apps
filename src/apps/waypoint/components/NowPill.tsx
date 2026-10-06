import { useState } from 'react';

import { Button, Modal } from '@moondreamsdev/dreamer-ui/components';
import { CircleDot, SkipForward } from 'lucide-react';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useNow } from '@/hooks/useNow';
import { useAppDispatch, useAppSelector } from '@/store';
import { formatClockTime, formatCountdown, formatDuration } from '@/utils/formatUtils';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import EnrichedImage from '@/components/EnrichedImage';
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

  const showView = (target: View) =>
    setPeekedFor(target === 'next' ? (activeEvent?.id ?? null) : undefined);

  const renderStatus = (target: TimelineEvent, rowView: View) => (
    <span className='flex min-w-0 items-center gap-2.5'>
      <span
        aria-hidden
        className={join(
          'h-2.5 w-2.5 shrink-0 rounded-full',
          rowView === 'now' ? 'animate-pulse bg-emerald-500' : 'bg-muted-foreground/50',
        )}
      />
      <span className='min-w-0 text-left'>
        <span className='text-muted-foreground block text-[11px] leading-tight font-medium tracking-wide whitespace-nowrap uppercase'>
          {getStatusLine(trip, target, rowView, now)}
        </span>
        <span className='text-foreground block max-w-48 truncate text-sm leading-tight font-semibold sm:max-w-96'>
          {target.title}
        </span>
      </span>
    </span>
  );

  const renderPhoneItem = (target: TimelineEvent, itemView: View) => {
    const isExpanded = view === itemView;
    const label = `${getStatusLine(trip, target, itemView, now)}: ${target.title}`;
    return (
      <div
        key={itemView}
        role='status'
        className={join(
          'bg-popover min-w-0 basis-12 overflow-hidden rounded-full border shadow-lg transition-[flex-grow] duration-700 ease-in-out',
          isExpanded ? 'grow' : 'grow-0',
          itemView === 'now' ? 'border-emerald-500/60' : 'border-border',
        )}
      >
        <Button
          type='button'
          variant='tertiary'
          aria-label={isExpanded ? `${label}. Show details` : `Show ${itemView === 'now' ? 'what is happening now' : 'what is up next'}`}
          className='relative h-12 w-full min-w-0 justify-start gap-0 rounded-full p-0'
          onClick={() => (isExpanded ? open(target) : showView(itemView))}
        >
          <span
            className={join(
              'absolute inset-y-0 left-0 flex w-12 items-center justify-center transition-opacity duration-700',
              isExpanded ? 'opacity-0' : 'opacity-100',
            )}
          >
            {itemView === 'now' ? (
              <CircleDot className='h-5 w-5 text-emerald-500' />
            ) : (
              <SkipForward className='h-5 w-5' />
            )}
          </span>
          <span
            className={join(
              'min-w-0 flex-1 overflow-hidden px-4 whitespace-nowrap transition-opacity duration-700',
              isExpanded ? 'opacity-100' : 'opacity-0',
            )}
          >
            {renderStatus(target, itemView)}
          </span>
        </Button>
      </div>
    );
  };

  const renderSurface = () => {
    if (isPhone) {
      return (
        <div className='pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-30 flex justify-center px-4'>
          <div className='pointer-events-auto flex w-[min(100%,22rem)] gap-2'>
            {activeEvent && renderPhoneItem(activeEvent, 'now')}
            {upNextEvent && renderPhoneItem(upNextEvent, 'next')}
          </div>
        </div>
      );
    }
    const rows = [activeEvent && { target: activeEvent, rowView: 'now' as const }, upNextEvent && { target: upNextEvent, rowView: 'next' as const }].filter(
      (row): row is { target: TimelineEvent; rowView: View } => Boolean(row),
    );
    const shownIndex = rows.findIndex((row) => row.rowView === view);
    return (
      <div className='bg-background/95 border-border fixed inset-x-0 bottom-9 z-20 border-t backdrop-blur'>
        <div className='mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-1'>
          <div role='status' className='h-12 min-w-0 flex-1 overflow-hidden'>
            <div
              className='transition-transform duration-300 ease-in-out'
              style={{ transform: `translateY(-${shownIndex * 3}rem)` }}
            >
              {rows.map(({ target, rowView }) => (
                <div key={rowView} className='flex h-12 items-center' aria-hidden={rowView !== view}>
                  {renderStatus(target, rowView)}
                </div>
              ))}
            </div>
          </div>
          <div className='flex shrink-0 items-center gap-2'>
            <Button type='button' size='sm' variant='tertiary' className='h-10' onClick={() => open(event)}>
              Details
            </Button>
            {canSwap && (
              <Button
                type='button'
                size='sm'
                variant='secondary'
                className='h-10'
                onClick={() => showView(view === 'now' ? 'next' : 'now')}
              >
                {view === 'now' ? "See what's next" : "See what's happening now"}
              </Button>
            )}
          </div>
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
              {getDisplayImage(openEvent) && (
                <EnrichedImage src={getDisplayImage(openEvent) as string} alt='' className='aspect-video w-full rounded-lg object-cover' />
              )}
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
