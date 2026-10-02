import { useMemo, useRef, useState } from 'react';

import {
  Button,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import AppToggle from '@/components/AppToggle';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import EventCard from '@apps/waypoint/components/EventCard';
import EventFormModal from '@apps/waypoint/components/EventFormModal';
import EventSuggestionsList from '@apps/waypoint/components/EventSuggestionsList';
import SectionHeader from '@apps/waypoint/components/SectionHeader';
import {
  createEvent,
  deleteEvent,
  setEventArchived,
  updateEvent,
  updateEventNotes,
} from '@apps/waypoint/store/actions/eventActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { getErrorMessage } from '@/utils/errorUtils';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  getBucketLabel,
  getDayCount,
  getDayDateLabel,
  getDayLabel,
  getIndexBucket,
  groupByIndexBucket,
} from '@/utils/dateRangeUtils';
import {
  canArchiveEvent,
  canCreateItem,
  canEditExistingItem,
  hasTripStarted,
} from '@apps/waypoint/utils/roleGuards';
import { getEventAttendeeIds } from '@apps/waypoint/utils/attendeeCalculators';
import { getDisplayImage } from '@/utils/enrichmentUtils';
import { getPlaceBiasFromItems } from '@/lib/places/placesApi';
import { selectActiveStaysForDay, selectStays } from '@apps/waypoint/store/selectors';
import type { Stay } from '@apps/waypoint/types';

const OUTSIDE_TAB = 'outside';

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
  // The mobile details drawer's own close, threaded through from whichever EventCard
  // opened the edit form — invoked only once that edit actually succeeds, never on cancel.
  const editSuccessRef = useRef<(() => void) | undefined>(undefined);
  const { addToast } = useToast();
  const { confirm } = useActionModal();
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const [showArchived, setShowArchived] = useState(false);
  const memberIds = Object.keys(trip.members);
  const hasOutsideEvents = events.some(
    (event) =>
      getIndexBucket(event.dayIndex ?? null, dayCount) === 'outside' &&
      (showArchived || !event.isArchived),
  );
  // The tab disappears once nothing is outside the range anymore, so don't stay parked on it.
  const selectedTab = activeDayTab === OUTSIDE_TAB && !hasOutsideEvents ? 'all' : activeDayTab;
  const activeDayIndex = selectedTab === 'all' || selectedTab === OUTSIDE_TAB ? 0 : Number(selectedTab);
  const activeStays = useAppSelector(selectActiveStaysForDay(activeDayIndex), shallowEqual);
  const members = useUserInfo(memberIds)?.map ?? {};
  const memberOptions = memberIds.map((uid) => ({
    label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
    value: uid,
  }));
  const canEdit = canEditExistingItem(trip, currentUserId);
  const canAddEvents = canCreateItem(trip, currentUserId);
  const [showCovers, setShowCovers] = useLocalStoragePreference('waypoint:showCovers', true);
  const [attendingOnly, setAttendingOnly] = useState(false);
  const stays = useAppSelector(selectStays);
  const placeBias = getPlaceBiasFromItems([...stays, ...events]);
  const attendanceFilteredEvents = events
    .filter((event) => showArchived || !event.isArchived)
    .filter((event) => !attendingOnly || getEventAttendeeIds(event, memberIds).includes(currentUserId));

  const handleToggleArchived = async (event: TimelineEvent, onSuccess?: () => void) => {
    if (!event.isArchived) {
      const confirmed = await confirm({
        title: 'Archive event',
        message: 'Archive this event? It will stay available under Show archived and can be restored later.',
      });
      if (!confirmed) {
        return;
      }
    }

    try {
      await dispatch(
        setEventArchived({
          uid: currentUserId,
          trip,
          event,
          isArchived: !event.isArchived,
        }),
      ).unwrap();
      onSuccess?.();
    } catch (archiveError) {
      addToast({
        title: 'Unable to update this event',
        description: getErrorMessage(archiveError, 'Please try again.'),
        type: 'error',
      });
    }
  };
  const renderStayBanners = (dayIndex: number) => {
    if (dayIndex !== activeDayIndex || selectedTab === 'all' || selectedTab === OUTSIDE_TAB || activeStays.length === 0) {
      return null;
    }

    return (
      <div className='space-y-3'>
        {renderDivider('Stays')}
        <div className='space-y-2'>
          {activeStays.map((stay) => (
            <StayBanner
              key={stay.id}
              stay={stay}
              showCover={showCovers}
            />
          ))}
        </div>
        {renderDivider('Activities')}
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
      ...(hasOutsideEvents ? [{ value: OUTSIDE_TAB, label: 'Outside trip dates' }] : []),
    ],
    [dayCount, trip.startDate, hasOutsideEvents],
  );

  const renderEventCard = (event: TimelineEvent) => (
    <div key={event.id} className='space-y-2'>
      <EventCard
        trip={trip}
        event={event}
        canEdit={canEdit}
        canArchive={canArchiveEvent(trip, currentUserId)}
        showCover={showCovers}
        showArchiveToggle={hasTripStarted(trip)}
        onEdit={(selectedEvent, onSuccess) => {
          setEditingEvent(selectedEvent);
          setIsFormOpen(true);
          editSuccessRef.current = onSuccess;
        }}
        onSaveNotes={async (selectedEvent, notes) => {
          await dispatch(
            updateEventNotes({ uid: currentUserId, trip, event: selectedEvent, notes }),
          ).unwrap();
        }}
        onToggleArchived={(selectedEvent, onSuccess) =>
          void handleToggleArchived(selectedEvent, onSuccess)
        }
      />
      <EventSuggestionsList trip={trip} event={event} currentUserId={currentUserId} />
    </div>
  );

  const renderDivider = (label: string) => (
    <div className='flex items-center gap-3'>
      <div className='border-border flex-1 border-t' />
      <span className='text-muted-foreground text-sm font-medium'>{label}</span>
      <div className='border-border flex-1 border-t' />
    </div>
  );

  const renderEvents = (scope: 'all' | 'outside' | number = 'all') => {
    const visibleEvents = attendanceFilteredEvents.filter((event) => {
      if (scope === 'all') return true;
      if (scope === 'outside') {
        return getIndexBucket(event.dayIndex ?? null, dayCount) === 'outside';
      }
      return event.dayIndex === scope;
    });

    if (visibleEvents.length === 0) {
      return <p className='text-muted-foreground py-6 text-sm'>No events planned yet.</p>;
    }

    if (scope === 'outside') {
      return (
        <div className='space-y-3'>
          {Array.from(new Set(visibleEvents.map((event) => event.dayIndex as number)))
            .sort((first, second) => first - second)
            .map((day) => (
              <div key={day} className='space-y-3'>
                {renderDivider(getDayDateLabel(trip.startDate, day))}
                {visibleEvents.filter((event) => event.dayIndex === day).map(renderEventCard)}
              </div>
            ))}
        </div>
      );
    }

    if (scope !== 'all') {
      return <div className='space-y-3'>{visibleEvents.map(renderEventCard)}</div>;
    }

    return (
      <div className='space-y-3'>
        {groupByIndexBucket(visibleEvents, (event) => event.dayIndex ?? null, dayCount).map(
          ({ bucket, items }) => (
            <div key={bucket} className='space-y-3'>
              {renderDivider(getBucketLabel(bucket, trip.startDate))}
              {items.map(renderEventCard)}
            </div>
          ),
        )}
      </div>
    );
  };

  const resolveEditSuccess = () => {
    editSuccessRef.current?.();
    editSuccessRef.current = undefined;
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
      resolveEditSuccess();
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
      resolveEditSuccess();
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
      <section className='space-y-4 pt-4'>
        <SectionHeader
          title='Timeline'
          action={
            canAddEvents && (
              <Button
                type='button'
                onClick={() => {
                  setEditingEvent(undefined);
                  setIsFormOpen(true);
                }}
              >
                Add event
              </Button>
            )
          }
        />
        <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
          View by day
        </p>
        <Select
          className='sm:hidden'
          options={tabs.map((tab) => ({ value: tab.value, text: tab.label }))}
          value={selectedTab}
          onChange={onActiveDayTabChange}
        />
        <Tabs
          value={selectedTab}
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
          <div className='mt-3 flex flex-wrap items-center gap-4'>
            <label className='text-muted-foreground flex items-center gap-2 text-sm'>
              <AppToggle
                size='sm'
                checked={showCovers}
                onCheckedChange={setShowCovers}
              />
              Show covers
            </label>
            <label className='text-muted-foreground flex items-center gap-2 text-sm'>
              <AppToggle
                size='sm'
                checked={attendingOnly}
                onCheckedChange={setAttendingOnly}
              />
              Only events I&apos;m attending
            </label>
            <label className='text-muted-foreground flex items-center gap-2 text-sm'>
              <AppToggle
                size='sm'
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              Show archived
            </label>
          </div>
          <TabsContent value='all' className='pt-4'>
            {renderEvents()}
          </TabsContent>
          {Array.from({ length: dayCount }, (_, index) => (
            <TabsContent key={index} value={String(index)} className='pt-4 space-y-2'>
              {renderStayBanners(index)}
              {renderEvents(index)}
            </TabsContent>
          ))}
          {hasOutsideEvents && (
            <TabsContent value={OUTSIDE_TAB} className='pt-4'>
              {renderEvents('outside')}
            </TabsContent>
          )}
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
          // Canceling leaves the mobile drawer open, if it's the one that opened this modal.
          editSuccessRef.current = undefined;
        }}
      />
    </>
  );
}

function StayBanner({ stay, showCover }: { stay: Stay; showCover: boolean }) {
  const imageUrl = showCover ? getDisplayImage(stay) : null;

  return (
    <div className='border-border bg-card flex overflow-hidden rounded-lg border'>
      {imageUrl && (
        <EnrichedImage
          src={imageUrl}
          alt=''
          className='w-28 shrink-0 object-cover sm:w-44'
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
