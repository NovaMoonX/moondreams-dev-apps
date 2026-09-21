import { useMemo, useState } from 'react';

import {
  Button,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';

import EventCard from '@apps/waypoint/components/EventCard';
import EventFormModal from '@apps/waypoint/components/EventFormModal';
import {
  createEvent,
  deleteEvent,
  updateEvent,
} from '@apps/waypoint/store/actions/eventActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { useUserInfo } from '@/hooks/useUserInfo';
import { getErrorMessage } from '@/utils/errorUtils';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import { hasTripRole } from '@apps/waypoint/utils/roleGuards';
import { selectActiveStaysForDay } from '@apps/waypoint/store/selectors';
import type { Stay } from '@apps/waypoint/types';

interface TimelineSectionProps {
  trip: TripSpace;
  events: TimelineEvent[];
  currentUserId: string;
}

export function TimelineSection({ trip, events, currentUserId }: TimelineSectionProps) {
  const dispatch = useAppDispatch();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const memberIds = Object.keys(trip.members);
  const activeDayIndex = activeTab === 'all' ? 0 : Number(activeTab);
  const activeStays = useAppSelector(selectActiveStaysForDay(activeDayIndex));
  const members = useUserInfo(memberIds)?.map ?? {};
  const memberOptions = memberIds.map((uid) => ({
    label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
    value: uid,
  }));
  const canEdit = hasTripRole(trip, currentUserId, ['ADMIN', 'EDITOR']);
  const renderStayBanners = (dayIndex: number) => {
    if (dayIndex !== activeDayIndex || activeTab === 'all' || activeStays.length === 0) {
      return null;
    }

    return (
      <div className='space-y-2'>
        {activeStays.map((stay) => <StayBanner key={stay.id} stay={stay} />)}
      </div>
    );
  };
  const tabs = useMemo(
    () => [
      { value: 'all', label: 'All' },
      ...Array.from({ length: dayCount }, (_, index) => ({
        value: String(index),
        label: getDayLabel(trip.startDate, index),
      })),
    ],
    [dayCount, trip.startDate],
  );

  const renderEventCard = (event: TimelineEvent) => (
    <EventCard
      key={event.id}
      event={event}
      canEdit={canEdit}
      onEdit={(selectedEvent) => {
        setEditingEvent(selectedEvent);
        setIsFormOpen(true);
      }}
      onDelete={(selectedEvent) => void handleDelete(selectedEvent)}
    />
  );

  const renderDayDivider = (groupDayIndex: number) => (
    <div className='flex items-center gap-3'>
      <div className='border-border flex-1 border-t' />
      <span className='text-muted-foreground text-sm font-medium'>
        {getDayLabel(trip.startDate, groupDayIndex)}
      </span>
      <div className='border-border flex-1 border-t' />
    </div>
  );

  const renderEvents = (dayIndex?: number) => {
    const visibleEvents = [...(
      dayIndex === undefined
        ? events
        : events.filter((event) => event.dayIndex === dayIndex)
    )].sort((a, b) => a.startAt - b.startAt);

    if (visibleEvents.length === 0) {
      return <p className='text-muted-foreground py-6 text-sm'>No events planned yet.</p>;
    }

    if (dayIndex !== undefined) {
      return <div className='space-y-3'>{visibleEvents.map(renderEventCard)}</div>;
    }

    const eventsByDay = new Map<number, TimelineEvent[]>();
    for (const event of visibleEvents) {
      const dayEvents = eventsByDay.get(event.dayIndex) ?? [];
      dayEvents.push(event);
      eventsByDay.set(event.dayIndex, dayEvents);
    }
    const sortedDayIndices = Array.from(eventsByDay.keys()).sort((a, b) => a - b);

    return (
      <div className='space-y-3'>
        {sortedDayIndices.map((groupDayIndex) => (
          <div key={groupDayIndex} className='space-y-3'>
            {renderDayDivider(groupDayIndex)}
            {(eventsByDay.get(groupDayIndex) ?? []).map(renderEventCard)}
          </div>
        ))}
      </div>
    );
  };

  const handleSubmit = async (
    event: Omit<TimelineEvent, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>,
  ) => {
    setIsSubmitting(true);
    try {
      if (editingEvent) {
        await dispatch(
          updateEvent({
            uid: currentUserId,
            trip,
            eventId: editingEvent.id,
            event: { ...editingEvent, ...event },
          }),
        ).unwrap();
      } else {
        await dispatch(createEvent({ uid: currentUserId, trip, event })).unwrap();
      }
      setIsFormOpen(false);
      setEditingEvent(undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (event: TimelineEvent) => {
    const confirmed = await confirm({
      title: 'Delete timeline event',
      message: `Are you sure you want to delete “${event.title}”? This cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      await dispatch(deleteEvent({ uid: currentUserId, trip, eventId: event.id })).unwrap();
    } catch (error) {
      addToast({
        title: 'Unable to delete event',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    }
  };

  return (
    <>
      <section className='space-y-4 pt-4'>
        <Select
          className='sm:hidden'
          options={tabs.map((tab) => ({ value: tab.value, text: tab.label }))}
          value={activeTab}
          onChange={setActiveTab}
        />
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          tabsWidth='full'
          variant='pills'
        >
          <TabsList className='hidden sm:flex'>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            type='button'
            className='mt-4 w-full'
            onClick={() => {
              setEditingEvent(undefined);
              setIsFormOpen(true);
            }}
          >
            + Add Event
          </Button>
          <TabsContent value='all' className='pt-4'>
            {renderEvents()}
          </TabsContent>
          {tabs.slice(1).map((tab, index) => (
            <TabsContent key={tab.value} value={tab.value} className='pt-4'>
              {renderStayBanners(index)}
              {renderEvents(index)}
            </TabsContent>
          ))}
        </Tabs>
      </section>
      <EventFormModal
        key={`${editingEvent?.id ?? 'new'}-${isFormOpen ? 'open' : 'closed'}`}
        isOpen={isFormOpen}
        trip={trip}
        memberOptions={memberOptions}
        event={editingEvent}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onClose={() => {
          setIsFormOpen(false);
          setEditingEvent(undefined);
        }}
      />
    </>
  );
}

function StayBanner({ stay }: { stay: Stay }) {
  return (
    <div className='border-border bg-card rounded-lg border px-4 py-3'>
      <p className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
        Staying at
      </p>
      <p className='mt-1 font-semibold'>{stay.name}</p>
      <p className='text-muted-foreground text-sm'>{stay.address}</p>
    </div>
  );
}

export default TimelineSection;
