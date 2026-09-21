import { useMemo, useState } from 'react';

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@moondreamsdev/dreamer-ui/components';

import EventCard from '@apps/waypoint/components/EventCard';
import EventFormModal from '@apps/waypoint/components/EventFormModal';
import { createEvent } from '@apps/waypoint/store/actions/eventActions';
import { useAppDispatch } from '@/store';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getDayLabel, getTripDayCount } from '@apps/waypoint/utils/dateUtils';

interface TimelineSectionProps {
  trip: TripSpace;
  events: TimelineEvent[];
  currentUserId: string;
}

export function TimelineSection({ trip, events, currentUserId }: TimelineSectionProps) {
  const dispatch = useAppDispatch();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dayCount = getTripDayCount(trip.startDate, trip.endDate);
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

  const renderEvents = (dayIndex?: number) => {
    const visibleEvents =
      dayIndex === undefined
        ? events
        : events.filter((event) => event.dayIndex === dayIndex);
    if (visibleEvents.length === 0) {
      return <p className='text-muted-foreground py-6 text-sm'>No events planned yet.</p>;
    }
    return (
      <div className='space-y-3'>
        {visibleEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    );
  };

  const handleSubmit = async (
    event: Omit<TimelineEvent, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>,
  ) => {
    setIsSubmitting(true);
    try {
      await dispatch(createEvent({ uid: currentUserId, trip, event })).unwrap();
      setIsFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <section className='space-y-4 pt-4'>
        <Tabs defaultValue='all' tabsWidth='full' variant='pills'>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button type='button' className='mt-4 w-full' onClick={() => setIsFormOpen(true)}>
            + Add Event
          </Button>
          <TabsContent value='all' className='pt-4'>
            {renderEvents()}
          </TabsContent>
          {tabs.slice(1).map((tab, index) => (
            <TabsContent key={tab.value} value={tab.value} className='pt-4'>
              {renderEvents(index)}
            </TabsContent>
          ))}
        </Tabs>
      </section>
      <EventFormModal
        isOpen={isFormOpen}
        trip={trip}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onClose={() => setIsFormOpen(false)}
      />
    </>
  );
}

export default TimelineSection;
