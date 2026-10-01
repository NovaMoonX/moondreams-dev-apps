import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { History } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { formatTime } from '@/utils/formatUtils';

import { EventDetailLines } from '@apps/waypoint/components/EventCard';
import StepThroughModal from '@apps/waypoint/components/StepThroughModal';
import { markEventSeen } from '@apps/waypoint/store/actions/eventActions';
import { selectUnseenActivityEvents } from '@apps/waypoint/store/selectors';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';

interface UpdatesIndicatorProps {
  trip: TripSpace;
  currentUserId: string;
  className?: string;
}

function UpdatesIndicator({ trip, currentUserId, className }: UpdatesIndicatorProps) {
  const dispatch = useAppDispatch();
  const unseenEvents = useAppSelector(selectUnseenActivityEvents(trip, currentUserId), shallowEqual);
  const [isOpen, setIsOpen] = useState(false);

  if (unseenEvents.length === 0) {
    return null;
  }

  const dismiss = (event: TimelineEvent) => {
    void dispatch(markEventSeen({ uid: currentUserId, trip, eventId: event.id }));
  };

  const dismissAll = () => {
    unseenEvents.forEach(dismiss);
    setIsOpen(false);
  };

  return (
    <>
      <Button
        type='button'
        variant='tertiary'
        size='sm'
        aria-label={`${unseenEvents.length} recent update${unseenEvents.length === 1 ? '' : 's'}`}
        className={className}
        onClick={() => setIsOpen(true)}
      >
        <History className='h-4 w-4' />
        <span className='text-xs'>{unseenEvents.length}</span>
      </Button>
      <StepThroughModal
        isOpen={isOpen}
        title='Recent updates'
        items={unseenEvents}
        getKey={(event) => event.id}
        onDismissItem={dismiss}
        onDismissAll={dismissAll}
        onClose={() => setIsOpen(false)}
        renderItem={(event) => (
          <div className='space-y-1'>
            <p className='text-muted-foreground text-xs font-medium'>
              {event.createdAt >= trip.startDate ? 'New' : 'Updated'} ·{' '}
              {formatTime(event.startAt)}
            </p>
            <EventDetailLines
              event={event}
              showTitle
              showNotes
              canEdit={false}
              onSaveNotes={async () => {}}
            />
          </div>
        )}
      />
    </>
  );
}

export default UpdatesIndicator;
