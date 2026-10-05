import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  Button,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { shallowEqual } from 'react-redux';

import { airlinesQueryOptions } from '@/lib/airlines/airlinesQueries';
import { airportsQueryOptions } from '@/lib/airports/airportsQueries';
import EnrichedImage from '@/components/EnrichedImage';
import ExternalLinkText from '@/components/ExternalLinkText';
import DayWeather from '@apps/waypoint/components/DayWeather';
import EventCard from '@apps/waypoint/components/EventCard';
import EventGroupCard from '@apps/waypoint/components/EventGroupCard';
import EventGroupModal from '@apps/waypoint/components/EventGroupModal';
import EventStackCard from '@apps/waypoint/components/EventStackCard';
import EventStackModal from '@apps/waypoint/components/EventStackModal';
import EventFormModal, {
  type EventFormValues,
  type NextLegSeed,
  type SubmitOptions,
} from '@apps/waypoint/components/EventFormModal';
import EventSuggestionsList from '@apps/waypoint/components/EventSuggestionsList';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import TimelineViewOptions from '@apps/waypoint/components/TimelineViewOptions';
import WeatherAttribution from '@apps/waypoint/components/WeatherAttribution';
import WeatherDayStrip from '@apps/waypoint/components/WeatherDayStrip';
import {
  createEvent,
  deleteEvent,
  setEventArchived,
  setEventsGroup,
  setEventsStack,
  updateEvent,
  updateEventNotes,
} from '@apps/waypoint/store/actions/eventActions';
import { useAppDispatch, useAppSelector } from '@/store';
import { useUserInfo } from '@/hooks/useUserInfo';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useNow } from '@/hooks/useNow';
import { useTripWeather } from '@apps/waypoint/hooks/useTripWeather';
import { getErrorMessage } from '@/utils/errorUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  getBucketLabel,
  getDayCount,
  getDayDateLabel,
  getDayLabel,
  getIndexBucket,
  groupByIndexBucket,
  type IndexBucket,
} from '@/utils/dateRangeUtils';
import {
  canArchiveEvent,
  canCreateItem,
  canEditExistingItem,
  hasTripStarted,
} from '@apps/waypoint/utils/roleGuards';
import { buildTimelineItems, getGroupMembers, getStackMembers } from '@apps/waypoint/utils/eventGroups';
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
      getIndexBucket(event.dayIndex ?? null, dayCount, MAX_DAYS_OUTSIDE_TRIP) === 'outside' &&
      (showArchived || !event.isArchived),
  );
  // The tab disappears once nothing is outside the range anymore, so don't stay parked on it.
  const selectedTab = activeDayTab === OUTSIDE_TAB && !hasOutsideEvents ? 'all' : activeDayTab;
  const activeDayIndex = selectedTab === 'all' || selectedTab === OUTSIDE_TAB ? 0 : Number(selectedTab);
  // The few days either side of the trip only get a tab when something is planned on them.
  const dayIndexes = Array.from({ length: dayCount + MAX_DAYS_OUTSIDE_TRIP * 2 }, (_, offset) => offset - MAX_DAYS_OUTSIDE_TRIP).filter(
    (day) =>
      (day >= 0 && day < dayCount) ||
      events.some((event) => event.dayIndex === day && (showArchived || !event.isArchived)),
  );
  const activeStays = useAppSelector(selectActiveStaysForDay(activeDayIndex), shallowEqual);
  const members = useUserInfo(memberIds)?.map ?? {};
  const memberOptions = memberIds.map((uid) => ({
    label: members[uid]?.displayName?.trim() || members[uid]?.email || 'Trip member',
    value: uid,
  }));
  const canEdit = canEditExistingItem(trip, currentUserId);
  const canAddEvents = canCreateItem(trip, currentUserId);
  const queryClient = useQueryClient();

  // The flight form's airline and airport pickers read these, so have them cached before it opens.
  useEffect(() => {
    if (canAddEvents || canEdit) {
      void queryClient.prefetchQuery(airlinesQueryOptions());
      void queryClient.prefetchQuery(airportsQueryOptions());
    }
  }, [canAddEvents, canEdit, queryClient]);
  const [showCovers, setShowCovers] = useLocalStoragePreference('waypoint:showCovers', true);
  const [showAttendees, setShowAttendees] = useLocalStoragePreference('waypoint:showAttendees', true);
  const [attendingOnly, setAttendingOnly] = useState(false);
  const [minimizeWeather, setMinimizeWeather] = useLocalStoragePreference('waypoint:minimizeWeather', false);
  const stays = useAppSelector(selectStays);
  const now = useNow(60_000);
  const weather = useTripWeather(trip, events, stays, now);
  const placeBias = getPlaceBiasFromItems([...stays, ...events]);
  const attendanceFilteredEvents = events
    .filter((event) => showArchived || !event.isArchived)
    .filter((event) => !attendingOnly || getEventAttendeeIds(event, memberIds).includes(currentUserId));

  const [stackingEvent, setStackingEvent] = useState<TimelineEvent | undefined>();
  const [isStackHeaderOrigin, setIsStackHeaderOrigin] = useState(false);
  const stackSuccessRef = useRef<(() => void) | undefined>(undefined);
  const [isStackSubmitting, setIsStackSubmitting] = useState(false);

  const saveStack = async (targets: TimelineEvent[], stackName: string | null) => {
    setIsStackSubmitting(true);
    try {
      await dispatch(
        setEventsStack({ uid: currentUserId, trip, events: targets, stackName }),
      ).unwrap();
      setStackingEvent(undefined);
      stackSuccessRef.current?.();
      stackSuccessRef.current = undefined;
    } catch (stackError) {
      addToast({
        title: 'Unable to update this stack',
        description: getErrorMessage(stackError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsStackSubmitting(false);
    }
  };

  // Stacking moves a whole trip: the event's group of legs travels together.
  const getItinerary = (event: TimelineEvent) => getGroupMembers(events, event);

  const [groupingEvent, setGroupingEvent] = useState<TimelineEvent | undefined>();
  const [isGroupSubmitting, setIsGroupSubmitting] = useState(false);

  const saveGroup = async (targets: TimelineEvent[], groupName: string | null) => {
    setIsGroupSubmitting(true);
    try {
      await dispatch(setEventsGroup({ uid: currentUserId, trip, events: targets, groupName })).unwrap();
      setGroupingEvent(undefined);
    } catch (groupError) {
      addToast({
        title: 'Unable to update this group',
        description: getErrorMessage(groupError, 'Please try again.'),
        type: 'error',
      });
    } finally {
      setIsGroupSubmitting(false);
    }
  };

  const handleUnstackAll = async (event: TimelineEvent) => {
    const confirmed = await confirm({
      title: 'Unstack all',
      message: `Take every trip out of "${event.stackLabel}"? The events stay on the timeline.`,
      destructive: true,
    });
    if (confirmed) {
      await saveStack(getStackMembers(events, event), null);
    }
  };

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
  const tabs = [
    { value: 'all', label: 'All' },
    ...dayIndexes.map((index) => ({
      value: String(index),
      label: getDayLabel(trip.startDate, index, dayCount),
    })),
    ...(hasOutsideEvents ? [{ value: OUTSIDE_TAB, label: 'Outside trip dates' }] : []),
  ];

  const renderEventCard = (event: TimelineEvent) => (
    <div key={event.id} className='space-y-2'>
      <EventCard
        trip={trip}
        event={event}
        canEdit={canEdit}
        canArchive={canArchiveEvent(trip, currentUserId)}
        showCover={showCovers}
        showAttendees={showAttendees}
        weather={weather.getEvent(event.id)}
        isStacked={Boolean(event.stackLabel)}
        isGrouped={Boolean(event.groupLabel)}
        onStack={(selectedEvent, onSuccess) => {
          setIsStackHeaderOrigin(false);
          setStackingEvent(selectedEvent);
          stackSuccessRef.current = onSuccess;
        }}
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

  const renderEventItems = (items: TimelineEvent[]) =>
    buildTimelineItems(items).map((item) => {
      if (item.kind === 'stack') {
        return (
          <EventStackCard
            key={item.key}
            trip={trip}
            stack={item}
            currentUserId={currentUserId}
            showAttendees={showAttendees}
            canEdit={canEdit}
            onManage={(selectedEvent) => {
              setIsStackHeaderOrigin(true);
              setStackingEvent(selectedEvent);
            }}
            onManageGroup={(selectedEvent) => setGroupingEvent(selectedEvent)}
            renderEvent={renderEventCard}
          />
        );
      }
      if (item.kind === 'group') {
        return (
          <EventGroupCard
            key={item.key}
            trip={trip}
            group={item}
            showAttendees={showAttendees}
            canEdit={canEdit}
            onManage={(selectedEvent) => setGroupingEvent(selectedEvent)}
            onStack={(selectedEvent) => {
              setIsStackHeaderOrigin(false);
              setStackingEvent(selectedEvent);
            }}
            renderEvent={renderEventCard}
          />
        );
      }
      return renderEventCard(item.event);
    });

  const renderDivider = (label: string, trailing?: ReactNode) => (
    <SectionDivider label={label} trailing={trailing} />
  );

  const renderDayWeather = (dayIndex: number) => {
    const forecast = weather.getDay(dayIndex);
    return forecast ? (
      <DayWeather forecast={forecast} isMinimized={minimizeWeather} />
    ) : null;
  };

  const renderEvents = (scope: 'all' | 'outside' | number = 'all') => {
    const visibleEvents = attendanceFilteredEvents.filter((event) => {
      if (scope === 'all') return true;
      if (scope === 'outside') {
        return getIndexBucket(event.dayIndex ?? null, dayCount, MAX_DAYS_OUTSIDE_TRIP) === 'outside';
      }
      return event.dayIndex === scope;
    });

    if (visibleEvents.length === 0 && (scope !== 'all' || !weather.hasWeather)) {
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
                {renderEventItems(visibleEvents.filter((event) => event.dayIndex === day))}
              </div>
            ))}
        </div>
      );
    }

    if (scope !== 'all') {
      return <div className='space-y-3'>{renderEventItems(visibleEvents)}</div>;
    }

    const eventDays = groupByIndexBucket(
      visibleEvents,
      (event) => event.dayIndex ?? null,
      dayCount,
      MAX_DAYS_OUTSIDE_TRIP,
    );
    const weatherOnlyDays = Array.from({ length: dayCount }, (_, day) => day)
      .filter((day) => weather.getDay(day) && !eventDays.some(({ bucket }) => bucket === day))
      .map((day) => ({ bucket: day as IndexBucket, items: [] as TimelineEvent[] }));
    const getBucketOrder = (bucket: IndexBucket) =>
      typeof bucket === 'number' ? bucket : bucket === 'outside' ? dayCount + MAX_DAYS_OUTSIDE_TRIP : dayCount + MAX_DAYS_OUTSIDE_TRIP + 1;
    const days = [...eventDays, ...weatherOnlyDays].sort(
      (first, second) => getBucketOrder(first.bucket) - getBucketOrder(second.bucket),
    );

    return (
      <div className='space-y-3'>
        {days.map(
          ({ bucket, items }) => (
            <div key={bucket} className='space-y-3'>
              {renderDivider(
                getBucketLabel(bucket, trip.startDate, dayCount),
                typeof bucket === 'number' && minimizeWeather ? renderDayWeather(bucket) : undefined,
              )}
              {typeof bucket === 'number' && !minimizeWeather && renderDayWeather(bucket)}
              {renderEventItems(items)}
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

  const [legSeed, setLegSeed] = useState<NextLegSeed | undefined>();
  const [legCount, setLegCount] = useState(0);

  const handleSubmit = async (event: EventFormValues, options?: SubmitOptions) => {
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
      setEditingEvent(undefined);
      if (options?.addLeg) {
        setLegSeed({ previous: event, arrivalPlace: options.arrivalPlace ?? null });
        setLegCount((count) => count + 1);
      } else {
        setLegSeed(undefined);
        setIsFormOpen(false);
      }
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

  const weatherDays = Array.from({ length: dayCount }, (_, dayIndex) => ({
    dayIndex,
    forecast: weather.getDay(dayIndex),
  })).flatMap(({ dayIndex, forecast }) => (forecast ? [{ dayIndex, forecast }] : []));
  const selectedDayIndex = selectedTab === 'all' || selectedTab === OUTSIDE_TAB ? null : Number(selectedTab);

  const viewOptionGroups = [
    {
      heading: 'On each card',
      options: [
        { label: 'Show covers', checked: showCovers, onChange: setShowCovers, isCustomized: !showCovers },
        {
          label: "Show who's attending",
          checked: showAttendees,
          onChange: setShowAttendees,
          isCustomized: !showAttendees,
        },
      ],
    },
    ...(weather.hasWeather
      ? [
          {
            heading: 'Weather',
            options: [
              {
                label: 'Compact weather',
                checked: minimizeWeather,
                onChange: setMinimizeWeather,
                isCustomized: minimizeWeather,
              },
            ],
          },
        ]
      : []),
    {
      heading: 'Filters',
      options: [
        {
          label: "Only events I'm attending",
          checked: attendingOnly,
          onChange: setAttendingOnly,
          isCustomized: attendingOnly,
        },
        { label: 'Show archived', checked: showArchived, onChange: setShowArchived, isCustomized: showArchived },
      ],
    },
  ];

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
        {weatherDays.length > 0 && (
          <WeatherDayStrip
            days={weatherDays}
            startDate={trip.startDate}
            todayIndex={weather.todayIndex}
            selectedDayIndex={selectedDayIndex}
            onSelectDay={(day) => onActiveDayTabChange(day === selectedDayIndex ? 'all' : String(day))}
          />
        )}
        <div className='flex items-center justify-between gap-3'>
          <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
            View by day
          </p>
          <TimelineViewOptions groups={viewOptionGroups} />
        </div>
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
          <TabsContent value='all' className='pt-4'>
            {renderEvents()}
          </TabsContent>
          {dayIndexes.map((index) => (
            <TabsContent key={index} value={String(index)} className='pt-4 space-y-2'>
              {renderDayWeather(index)}
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
        {weather.hasWeather && <WeatherAttribution />}
      </section>
      {stackingEvent && (
        <EventStackModal
          key={`${stackingEvent.id}-${stackingEvent.stackLabel ?? 'none'}`}
          isOpen
          event={stackingEvent}
          events={events}
          isSubmitting={isStackSubmitting}
          canRemoveTrip={!isStackHeaderOrigin}
          group={
            stackingEvent.groupLabel
              ? { label: stackingEvent.groupLabel, size: getGroupMembers(events, stackingEvent).length }
              : null
          }
          onStack={(name) => void saveStack(getItinerary(stackingEvent), name)}
          onRename={(name) => void saveStack(getStackMembers(events, stackingEvent), name)}
          onRemove={() => void saveStack(getItinerary(stackingEvent), null)}
          onUnstackAll={() => void handleUnstackAll(stackingEvent)}
          onClose={() => {
            setStackingEvent(undefined);
            stackSuccessRef.current = undefined;
          }}
        />
      )}
      {groupingEvent && (
        <EventGroupModal
          key={`${groupingEvent.id}-${groupingEvent.groupLabel ?? 'none'}`}
          isOpen
          event={groupingEvent}
          legCount={getGroupMembers(events, groupingEvent).length}
          isSubmitting={isGroupSubmitting}
          onRename={(name) => void saveGroup(getGroupMembers(events, groupingEvent), name)}
          onUngroup={() => void saveGroup(getGroupMembers(events, groupingEvent), null)}
          onClose={() => setGroupingEvent(undefined)}
        />
      )}
      <EventFormModal
        key={`${editingEvent?.id ?? 'new'}-${isFormOpen ? 'open' : 'closed'}-${legCount}`}
        isOpen={isFormOpen}
        legFrom={legSeed}
        trip={trip}
        currentUserId={currentUserId}
        memberOptions={memberOptions}
        event={editingEvent}
        events={events}
        placeBias={placeBias}
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onDelete={editingEvent ? () => handleDelete(editingEvent) : undefined}
        onClose={() => {
          setIsFormOpen(false);
          setEditingEvent(undefined);
          setLegSeed(undefined);
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
