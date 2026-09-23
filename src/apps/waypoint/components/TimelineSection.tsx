import { useMemo, useState } from 'react';

import {
  Button,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AppToggle from '@/components/AppToggle';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import EventCard from '@apps/waypoint/components/EventCard';
import EventFormModal from '@apps/waypoint/components/EventFormModal';
import {
  createEvent,
  deleteEvent,
  updateEvent,
} from '@apps/waypoint/store/actions/eventActions';
import { patchStayPlacePhoto } from '@apps/waypoint/store/actions/stayActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { getErrorMessage } from '@/utils/errorUtils';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getDayCount, getDayLabel } from '@/utils/dateRangeUtils';
import { canEditExistingItem } from '@apps/waypoint/utils/roleGuards';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import { selectActiveStaysForDay } from '@apps/waypoint/store/selectors';
import type { Stay } from '@apps/waypoint/types';

interface TimelineSectionProps {
  trip: TripSpace;
  events: TimelineEvent[];
  currentUserId: string;
  activeDayTab: string;
  onActiveDayTabChange: (value: string) => void;
}

export function TimelineSection({
  trip,
  events,
  currentUserId,
  activeDayTab,
  onActiveDayTabChange,
}: TimelineSectionProps) {
  const dispatch = useAppDispatch();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { addToast } = useToast();
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const memberIds = Object.keys(trip.members);
  const activeDayIndex = activeDayTab === 'all' ? 0 : Number(activeDayTab);
  const activeStays = useAppSelector(selectActiveStaysForDay(activeDayIndex));
  const members = useUserInfo(memberIds)?.map ?? {};
  const memberOptions = memberIds.map((uid) => ({
    label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
    value: uid,
  }));
  const canEdit = canEditExistingItem(trip, currentUserId);
  const [showCovers, setShowCovers] = useLocalStoragePreference('waypoint:showCovers', true);
  const placeBias = getPlaceBiasFromItems(events);
  const renderStayBanners = (dayIndex: number) => {
    if (dayIndex !== activeDayIndex || activeDayTab === 'all' || activeStays.length === 0) {
      return null;
    }

    return (
      <div className='space-y-2'>
        {activeStays.map((stay) => (
          <StayBanner
            key={stay.id}
            stay={stay}
            canEdit={canEdit}
            showCover={showCovers}
          />
        ))}
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
      showCover={showCovers}
      onEdit={(selectedEvent) => {
        setEditingEvent(selectedEvent);
        setIsFormOpen(true);
      }}
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
            previousEvent: editingEvent,
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
    setIsSubmitting(true);
    try {
      await dispatch(deleteEvent({ uid: currentUserId, trip, eventId: event.id })).unwrap();
      setIsFormOpen(false);
      setEditingEvent(undefined);
    } catch (error) {
      addToast({
        title: 'Unable to delete event',
        description: getErrorMessage(error, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <section className='space-y-4'>
        <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          View by day
        </p>
        <Select
          className='sm:hidden'
          options={tabs.map((tab) => ({ value: tab.value, text: tab.label }))}
          value={activeDayTab}
          onChange={onActiveDayTabChange}
        />
        <Tabs
          value={activeDayTab}
          onValueChange={onActiveDayTabChange}
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
          <label className='text-muted-foreground mt-3 flex items-center gap-2 text-sm'>
            <AppToggle
              size='sm'
              checked={showCovers}
              onCheckedChange={setShowCovers}
            />
            Show covers
          </label>
          <TabsContent value='all' className='pt-4'>
            {renderEvents()}
          </TabsContent>
          {tabs.slice(1).map((tab, index) => (
            <TabsContent key={tab.value} value={tab.value} className='pt-4 space-y-2'>
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
        placeBias={placeBias}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingEvent ? () => handleDelete(editingEvent) : undefined}
        onClose={() => {
          setIsFormOpen(false);
          setEditingEvent(undefined);
        }}
      />
    </>
  );
}

function StayBanner({
  stay,
  canEdit,
  showCover,
}: {
  stay: Stay;
  canEdit: boolean;
  showCover: boolean;
}) {
  const imageUrl = showCover ? getDisplayImage(stay) : null;

  return (
    <div className='border-border bg-card flex overflow-hidden rounded-lg border'>
      {imageUrl && (
        <EnrichedImage
          src={imageUrl}
          alt=''
          className='w-28 shrink-0 object-cover sm:w-44'
          refreshFrom={
            stay.place
              ? {
                  place: stay.place,
                  canEdit,
                  onRefreshed: (photoUrl, photoRefreshedAt) =>
                    void patchStayPlacePhoto(stay.tripId, stay.id, photoUrl, photoRefreshedAt),
                }
              : undefined
          }
        />
      )}
      <div className='min-w-0 flex-1 px-4 py-3'>
        <p className='text-muted-foreground text-xs font-medium uppercase tracking-wide'>
          Staying at
        </p>
        <p className='mt-1 font-semibold'>{stay.name}</p>
        <p className='text-muted-foreground text-sm'>{stay.address}</p>
        {stay.linkUrl && (
          <div className='mt-1'>
            <ExternalLinkText href={stay.linkUrl} />
          </div>
        )}
      </div>
    </div>
  );
}

export default TimelineSection;
