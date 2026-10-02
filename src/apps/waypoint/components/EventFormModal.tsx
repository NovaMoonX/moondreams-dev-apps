import { useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Checkbox,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Bell, Clock, Layers, Link2, Users, Utensils, X } from 'lucide-react';


import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import LinkAttachField from '@/components/forms/LinkAttachField';
import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import type { LinkPreview } from '@/lib/linkMetadata/types';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import { findTopPlace } from '@/lib/places/placesLookup';
import type { AirportOption } from '@/lib/airports/airportsQueries';
import type {
  PlaceRef,
  PlaceSelectionBias,
  PlaceSelectionResult,
} from '@/lib/places/types';
import { getDayCount, getDayOptions } from '@/utils/dateRangeUtils';
import { fromDayMinutes, shiftRangeEnd, toDayMinutes } from '@/utils/dayTimeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatClockTime, formatTime } from '@/utils/formatUtils';
import DeleteIconButton from '@apps/waypoint/components/DeleteIconButton';
import ModalFooterActions from '@apps/waypoint/components/ModalFooterActions';
import TransitDetailsFields from '@apps/waypoint/components/TransitDetailsFields';
import {
  ACTIVITY_SETTING_LABELS,
  ADD_NEW_OPTION,
  DEFAULT_REMINDER_MINUTES_BEFORE,
  EVENT_ATTENDEE_TARGET_LABELS,
  EVENT_LINK_KIND_LABELS,
  EVENT_LINK_KINDS_BY_TYPE,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
  MEAL_TYPE_LABELS,
  REMINDER_MINUTES_BEFORE_OPTIONS,
  TRANSIT_TYPE_LABELS,
} from '@apps/waypoint/constants';
import type {
  ActivitySetting,
  EventAttendeeTargetType,
  EventDetails,
  EventLinkKind,
  EventType,
  MealType,
  TimelineEvent,
  TransitType,
  TripSpace,
} from '@apps/waypoint/types';
import {
  buildTransitDetails,
  EMPTY_TRANSIT_DRAFT,
  getDerivedTravelTitle,
  getInitialTransitDraft,
  type TransitDraft,
} from '@apps/waypoint/utils/transitDetails';
import {
  buildEventTimeFields,
  getEventTime,
  isRelativeTrip,
} from '@apps/waypoint/utils/tripTime';

interface EventFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  memberOptions: { label: string; value: string }[];
  event?: TimelineEvent;
  events?: TimelineEvent[];
  /** A rough center point (from an existing trip event/stay) to bias place search
   * results toward, so "starbucks" finds the one near this trip first. */
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  onSubmit: (
    event: Omit<
      TimelineEvent,
      'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'
    >,
  ) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}

function toSelectOptions<T extends string>(labels: Record<T, string>) {
  return Object.entries(labels).map(([value, text]) => ({
    value,
    text: text as string,
  }));
}

const eventTypeOptions = Object.entries(EVENT_TYPE_LABELS).map(
  ([value, text]) => ({
    value,
    text: `${EVENT_TYPE_EMOJIS[value as EventType]} ${text}`,
  }),
);
const transitTypeOptions = toSelectOptions(TRANSIT_TYPE_LABELS);
const mealTypeOptions = toSelectOptions(MEAL_TYPE_LABELS);
const activitySettingOptions = toSelectOptions(ACTIVITY_SETTING_LABELS);
const attendeeTargetOptions = toSelectOptions(EVENT_ATTENDEE_TARGET_LABELS);
const reminderOptions = [
  { value: 'off', text: "Don't remind me" },
  ...REMINDER_MINUTES_BEFORE_OPTIONS.map((minutes) => ({
    value: String(minutes),
    text: `${minutes} minutes before`,
  })),
];

interface EventDraft {
  eventType: EventType;
  title: string;
  dayIndex: number | null;
  endDayIndex: number | null;
  hasEndTime: boolean;
  time: string;
  endTime: string;
  /** Override of the trip's time zone; `null` follows the trip. */
  timezone: string | null;
  quickField: string;
  locationName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  place: PlaceRef | null;
  linkUrl: string;
  linkPreview: LinkPreview | null;
  linkKind: EventLinkKind | null;
  groupLabel: string;
  isGrouped: boolean;
  hasLink: boolean;
  hasCuisines: boolean;
  transit: TransitDraft;
  cuisines: string;
  hasAttendeeOverride: boolean;
  attendeeTargetType: EventAttendeeTargetType;
  assignedMemberIds: string[];
  hasVenueHours: boolean;
  venueOpenTime: string;
  venueCloseTime: string;
  hasReminderOverride: boolean;
  reminderMinutesBefore: number;
  reminderEnabled: boolean;
}

const LINK_ATTACHABLE_EVENT_TYPES: readonly EventType[] = [
  'DINING',
  'ACTIVITY',
  'TRAVEL',
];

const NO_DAY_VALUE = 'none';

const DEFAULT_QUICK_FIELD: Record<EventType, string> = {
  TRAVEL: 'FLIGHT',
  DINING: 'DINNER',
  ACTIVITY: 'INDOOR',
  FREE_TIME: 'INDOOR',
};

function getDayChoices(trip: TripSpace, current: number | null, allowNoDay: boolean) {
  const days = getDayOptions(trip.startDate, trip.endDate, current).map(({ value, label }) => ({
    value,
    text: label,
  }));
  const none = allowNoDay ? [{ text: 'No specific day', value: NO_DAY_VALUE }] : [];
  return [...none, ...days];
}

function getInitialDraft(trip: TripSpace, event: TimelineEvent | undefined): EventDraft {
  const time = event ? getEventTime(trip, event) : null;
  return {
    eventType: event?.eventType ?? 'ACTIVITY',
    title: event?.title ?? '',
    dayIndex: event ? (time?.dayIndex ?? null) : 0,
    endDayIndex: event ? (time?.endDayIndex ?? null) : 0,
    hasEndTime: Boolean(time?.endTime),
    time: time?.startTime || '09:00',
    endTime: time?.endTime ?? '',
    timezone: event?.timezone ?? null,
    quickField:
      event?.eventType === 'TRAVEL' &&
      event.eventDetails &&
      'transitType' in event.eventDetails
        ? event.eventDetails.transitType
        : event?.eventType === 'DINING' &&
            event.eventDetails &&
            'mealType' in event.eventDetails
          ? event.eventDetails.mealType
          : event?.eventType === 'ACTIVITY' &&
              event.eventDetails &&
              'settings' in event.eventDetails
            ? (event.eventDetails.settings[0] ?? 'INDOOR')
            : 'INDOOR',
    locationName: event?.locationName ?? '',
    address: event?.address ?? '',
    latitude: event?.latitude ?? null,
    longitude: event?.longitude ?? null,
    place: event?.place ?? null,
    linkUrl: event?.linkUrl ?? '',
    linkPreview: event?.linkPreview ?? null,
    linkKind: event?.linkKind ?? null,
    groupLabel: event?.groupLabel ?? '',
    isGrouped: Boolean(event?.groupLabel),
    hasLink: Boolean(event?.linkUrl),
    hasCuisines: Boolean(
      event?.eventType === 'DINING' &&
        event.eventDetails &&
        'cuisines' in event.eventDetails &&
        event.eventDetails.cuisines?.length,
    ),
    transit:
      event?.eventType === 'TRAVEL' && event.eventDetails && 'transitType' in event.eventDetails
        ? getInitialTransitDraft(event.eventDetails.transitType, event.eventDetails.transitDetails)
        : EMPTY_TRANSIT_DRAFT,
    cuisines:
      event?.eventType === 'DINING' && event.eventDetails && 'mealType' in event.eventDetails
        ? (event.eventDetails.cuisines ?? []).join(', ')
        : '',
    hasAttendeeOverride: Boolean(
      event && event.attendeeTargetType !== 'EVERYONE_INCLUDING_FUTURE',
    ),
    attendeeTargetType: event?.attendeeTargetType ?? 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: event?.assignedMemberIds ?? [],
    hasVenueHours: Boolean(event?.venueOpenTime || event?.venueCloseTime),
    venueOpenTime: event?.venueOpenTime ?? '',
    venueCloseTime: event?.venueCloseTime ?? '',
    hasReminderOverride: Boolean(
      event &&
        (event.reminderEnabled === false ||
          event.reminderMinutesBefore !== DEFAULT_REMINDER_MINUTES_BEFORE),
    ),
    reminderMinutesBefore:
      event?.reminderMinutesBefore ?? DEFAULT_REMINDER_MINUTES_BEFORE,
    reminderEnabled: event?.reminderEnabled ?? true,
  };
}

function EventFormModal({
  isOpen,
  trip,
  memberOptions,
  event,
  events = [],
  placeBias,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: EventFormModalProps) {
  const { confirm } = useActionModal();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(() => getInitialDraft(trip, event));
  const isRelative = isRelativeTrip(trip);
  const sameTypeGroupLabels = useMemo(
    () =>
      Array.from(
        new Set(
          events
            .filter((other) => other.eventType === draft.eventType && other.groupLabel)
            .map((other) => other.groupLabel as string),
        ),
      ),
    [events, draft.eventType],
  );
  const isTravel = draft.eventType === 'TRAVEL';
  const dayCount = getDayCount(trip.startDate, trip.endDate);

  const updateDraft = (changes: Partial<EventDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // Moving the start keeps the same start->end window by shifting the end by the same delta.
  const updateStart = (nextDayIndex: number | null, nextTime: string) => {
    if (nextDayIndex === null) {
      updateDraft({ dayIndex: null, endDayIndex: null, time: nextTime, hasEndTime: false, endTime: '' });
      return;
    }
    if (draft.dayIndex === null) {
      updateDraft({ dayIndex: nextDayIndex, endDayIndex: nextDayIndex, time: nextTime });
      return;
    }
    if (!draft.hasEndTime || draft.endTime === '') {
      updateDraft({ dayIndex: nextDayIndex, endDayIndex: nextDayIndex, time: nextTime });
      return;
    }

    const nextEnd = shiftRangeEnd({
      start: { day: draft.dayIndex, time: draft.time },
      end: { day: draft.endDayIndex ?? draft.dayIndex, time: draft.endTime },
      nextStart: { day: nextDayIndex, time: nextTime },
      max: nextDayIndex < dayCount ? { day: dayCount - 1, time: '23:59' } : undefined,
    });
    updateDraft({
      dayIndex: nextDayIndex,
      time: nextTime,
      endDayIndex: nextEnd.day,
      endTime: nextEnd.time,
    });
  };

  const fillLocationFromAirport = async (airport: AirportOption) => {
    const result = await findTopPlace(
      queryClient,
      `${airport.name} ${airport.iataCode}`,
      { latitude: airport.latitude, longitude: airport.longitude },
      ['airport'],
    ).catch(() => null);
    if (result) {
      updateDraft({
        locationName: result.name,
        address: result.address,
        latitude: result.latitude,
        longitude: result.longitude,
        place: result.place,
      });
    }
  };

  const handleNext = () => {
    if ((!isTravel && !draft.title.trim()) || !draft.time || (draft.dayIndex === null && !isRelative)) {
      setError(isTravel ? 'Enter a day and start time.' : 'Enter a title, day, and start time.');
      return;
    }
    if (draft.hasEndTime && !draft.endTime) {
      setError('Enter an end time, or remove the end time.');
      return;
    }
    const isSameDay = (draft.endDayIndex ?? draft.dayIndex) === draft.dayIndex;
    if (draft.hasEndTime && isSameDay && draft.endTime <= draft.time) {
      setError('The end time needs to be after the start time.');
      return;
    }
    setError(null);
    setStep(2);
  };

  const timeFields = buildEventTimeFields(trip, {
    dayIndex: draft.dayIndex,
    endDayIndex: draft.endDayIndex,
    startTime: draft.time,
    endTime: draft.hasEndTime ? draft.endTime : null,
    timezone: draft.timezone,
  });

  const handleSubmit = async () => {
    if (!timeFields) {
      setError('Choose a valid day and start time.');
      return;
    }

    const transitType = draft.quickField as TransitType;
    const transitDetails = isTravel ? buildTransitDetails(transitType, draft.transit) : null;
    const getEventDetails = (): EventDetails => {
      if (draft.eventType === 'TRAVEL') {
        return { transitType, transitDetails };
      }
      if (draft.eventType === 'DINING') {
        const cuisines = draft.cuisines
          .split(',')
          .map((cuisine) => cuisine.trim())
          .filter(Boolean);
        return { mealType: draft.quickField as MealType, cuisines };
      }
      if (draft.eventType === 'ACTIVITY') {
        return { settings: [draft.quickField as ActivitySetting] };
      }
      return {};
    };
    const eventDetails = getEventDetails();
    const title = isTravel && !draft.title.trim()
      ? getDerivedTravelTitle(transitType, transitDetails)
      : draft.title;
    const linkKinds = EVENT_LINK_KINDS_BY_TYPE[draft.eventType];

    const assignedMemberIds =
      draft.attendeeTargetType === 'SPECIFIC_MEMBERS'
        ? draft.assignedMemberIds
        : draft.attendeeTargetType === 'EVERYONE_CURRENT'
          ? memberOptions.map((member) => member.value)
          : [];

    try {
      await onSubmit({
        eventType: draft.eventType,
        ...timeFields,
        title,
        locationName: draft.locationName,
        address: draft.address,
        latitude: draft.latitude,
        longitude: draft.longitude,
        eventDetails,
        notes: event?.notes ?? null,
        attendeeTargetType: draft.attendeeTargetType,
        assignedMemberIds,
        venueOpenTime: draft.hasVenueHours ? draft.venueOpenTime || null : null,
        venueCloseTime: draft.hasVenueHours ? draft.venueCloseTime || null : null,
        changeHistory: event?.changeHistory ?? [],
        place: draft.place,
        linkUrl: isLinkable ? draft.linkUrl : null,
        linkPreview: isLinkable ? draft.linkPreview : null,
        linkKind: isLinkable && draft.linkUrl.trim() ? (draft.linkKind ?? linkKinds[0] ?? null) : null,
        groupLabel: draft.isGrouped ? draft.groupLabel.trim() || null : null,
        reminderMinutesBefore: draft.reminderMinutesBefore,
        reminderEnabled: draft.reminderEnabled,
        reminderId: event?.reminderId ?? null,
        isArchived: event?.isArchived ?? false,
        archivedBy: event?.archivedBy ?? null,
        archivedAt: event?.archivedAt ?? null,
        seenBy: event?.seenBy ?? {},
      });
      setStep(1);
      setError(null);
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save this event.'));
    }
  };

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete timeline event',
      message: `Delete "${event?.title}"? This action cannot be undone.`,
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    await onDelete();
  };

  const getReminderText = () => {
    if (!draft.reminderEnabled || !timeFields || timeFields.dayIndex === null) {
      return null;
    }
    if (isRelative) {
      const { time } = fromDayMinutes(
        toDayMinutes(timeFields.dayIndex, draft.time) - draft.reminderMinutesBefore,
      );
      return formatClockTime(time);
    }

    const startMs = getEventTime(trip, timeFields).startMs;
    return startMs === null ? null : formatTime(startMs - draft.reminderMinutesBefore * 60_000);
  };
  const reminderText = getReminderText();
  const effectiveTimezone = draft.timezone ?? trip.timezone;

  const quickLabel =
    draft.eventType === 'TRAVEL'
      ? 'Transit type'
      : draft.eventType === 'DINING'
        ? 'Meal type'
        : 'Setting';
  const quickOptions =
    draft.eventType === 'TRAVEL'
      ? transitTypeOptions
      : draft.eventType === 'DINING'
        ? mealTypeOptions
        : activitySettingOptions;

  const isLinkable = LINK_ATTACHABLE_EVENT_TYPES.includes(draft.eventType);
  const attendeesLabel = isTravel ? "Who's traveling" : 'Attendees';
  const detailChips = [
    { key: 'link', label: 'Link', icon: <Link2 className='h-4 w-4' />, isShown: !isLinkable || draft.hasLink },
    {
      key: 'cuisines',
      label: 'Cuisine',
      icon: <Utensils className='h-4 w-4' />,
      isShown: draft.eventType !== 'DINING' || draft.hasCuisines,
    },
    { key: 'group', label: 'Group', icon: <Layers className='h-4 w-4' />, isShown: draft.isGrouped },
    {
      key: 'reminder',
      label: 'Reminder',
      icon: <Bell className='h-4 w-4' />,
      isShown: draft.dayIndex === null || draft.hasReminderOverride,
    },
    {
      key: 'venueHours',
      label: 'Business hours',
      icon: <Clock className='h-4 w-4' />,
      isShown: draft.hasVenueHours,
    },
    {
      key: 'attendees',
      label: attendeesLabel,
      icon: <Users className='h-4 w-4' />,
      isShown: draft.hasAttendeeOverride,
    },
  ].filter((chip) => !chip.isShown);

  const revealDetail = (key: string) =>
    updateDraft(
      {
        link: { hasLink: true },
        cuisines: { hasCuisines: true },
        group: { isGrouped: true },
        reminder: { hasReminderOverride: true },
        venueHours: { hasVenueHours: true },
        attendees: { hasAttendeeOverride: true },
      }[key] ?? {},
    );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Timeline event'>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>Step {step} of 2</p>
        {step === 1 ? (
          <>
            <div className='space-y-1.5'>
              <Label>Event type</Label>
              <Select
                options={eventTypeOptions}
                value={draft.eventType}
                onChange={(value) =>
                  updateDraft({
                    eventType: value as EventType,
                    quickField: DEFAULT_QUICK_FIELD[value as EventType],
                    isGrouped: false,
                    groupLabel: '',
                  })
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Title</Label>
              <Input
                value={draft.title}
                placeholder={
                  isTravel
                    ? getDerivedTravelTitle(
                        draft.quickField as TransitType,
                        buildTransitDetails(draft.quickField as TransitType, draft.transit),
                      )
                    : 'Dinner at Ichiran'
                }
                onChange={(event) => updateDraft({ title: event.target.value })}
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Day</Label>
              <Select
                options={getDayChoices(trip, draft.dayIndex, isRelative)}
                value={draft.dayIndex === null ? NO_DAY_VALUE : String(draft.dayIndex)}
                onChange={(value) =>
                  updateStart(value === NO_DAY_VALUE ? null : Number(value), draft.time)
                }
              />
            </div>
            <div className='space-y-1.5'>
              <Label>Start time</Label>
              <Input
                type='time'
                value={draft.time}
                onChange={(event) => updateStart(draft.dayIndex, event.target.value)}
              />
            </div>
            {draft.dayIndex === null ? null : draft.hasEndTime ? (
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <Label>End day &amp; time</Label>
                  <Button
                    type='button'
                    variant='tertiary'
                    size='icon'
                    aria-label='Remove end time'
                    onClick={() =>
                      updateDraft({
                        hasEndTime: false,
                        endDayIndex: draft.dayIndex,
                        endTime: '',
                      })
                    }
                  >
                    <X className='h-4 w-4' />
                  </Button>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Select
                    options={getDayChoices(trip, draft.endDayIndex, false)}
                    value={String(draft.endDayIndex ?? draft.dayIndex)}
                    onChange={(value) =>
                      updateDraft({ endDayIndex: Number(value) })
                    }
                  />
                  <Input
                    type='time'
                    value={draft.endTime}
                    onChange={(event) =>
                      updateDraft({ endTime: event.target.value })
                    }
                  />
                </div>
              </div>
            ) : (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0'
                onClick={() => updateDraft({ hasEndTime: true })}
              >
                + Add end time
              </Button>
            )}
            {isRelative && effectiveTimezone && (
              <div className='space-y-1.5'>
                <Label>Time zone</Label>
                <div className='flex flex-wrap items-center gap-2'>
                  <TimezoneSelect
                    pill
                    value={effectiveTimezone}
                    onChange={(value) =>
                      updateDraft({ timezone: value === trip.timezone ? null : value })
                    }
                  />
                  {draft.timezone === null && (
                    <span className='text-muted-foreground text-xs'>Trip default</span>
                  )}
                </div>
              </div>
            )}
            <ModalFooterActions
              leftActions={
                event &&
                onDelete && (
                  <DeleteIconButton
                    onClick={() => void handleDelete()}
                    disabled={isSubmitting}
                  />
                )
              }
              rightActions={
                <>
                  <Button type='button' variant='secondary' onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type='button' onClick={handleNext}>
                    Next
                  </Button>
                </>
              }
            />
          </>
        ) : (
          <>
            {draft.eventType !== 'FREE_TIME' && (
              <div className='space-y-1.5'>
                <Label>{quickLabel}</Label>
                <Select
                  options={quickOptions}
                  value={draft.quickField}
                  onChange={(value) => updateDraft({ quickField: value })}
                />
              </div>
            )}
            {isTravel && (
              <TransitDetailsFields
                transitType={draft.quickField as TransitType}
                value={draft.transit}
                onChange={(transit) => updateDraft({ transit })}
                onDepartureAirportPicked={(airport) => void fillLocationFromAirport(airport)}
              />
            )}
            <PlaceAutocompleteInput
              label='Location'
              quickSearch={{ label: 'Search by title', value: draft.title }}
              placeholder='Ichiran Shibuya'
              value={draft.locationName}
              onChange={(locationName) =>
                updateDraft({ locationName, ...UNLINKED_PLACE })
              }
              bias={placeBias}
              onSelect={(result: PlaceSelectionResult) =>
                updateDraft({
                  title: draft.title.trim() || isTravel ? draft.title : result.name,
                  locationName: result.name,
                  address: result.address,
                  latitude: result.latitude,
                  longitude: result.longitude,
                  place: result.place,
                })
              }
              className='mb-0' // overwrite space-y-4
            />
            <div className='space-y-1.5'>
              <Label>Address</Label>
              <Input
                placeholder='Street address'
                value={draft.address}
                onChange={(event) =>
                  updateDraft({
                    address: event.target.value,
                    ...UNLINKED_PLACE,
                  })
                }
              />
            </div>
            {isLinkable && draft.hasLink && (
              <RemovableField
                label='Link'
                removeLabel='Remove link'
                onRemove={() =>
                  updateDraft({ hasLink: false, linkUrl: '', linkPreview: null, linkKind: null })
                }
              >
                <LinkAttachField
                  url={draft.linkUrl}
                  preview={draft.linkPreview}
                  label=''
                  startRevealed
                  placeholder='https://…'
                  onChange={(linkUrl, linkPreview) => updateDraft({ linkUrl, linkPreview })}
                  currentTitle={draft.title}
                  onUseTitle={(title) => updateDraft({ title })}
                />
                {draft.linkUrl.trim() && (
                  <Select
                    options={EVENT_LINK_KINDS_BY_TYPE[draft.eventType].map((kind) => ({
                      value: kind,
                      text: EVENT_LINK_KIND_LABELS[kind],
                    }))}
                    value={draft.linkKind ?? EVENT_LINK_KINDS_BY_TYPE[draft.eventType][0]}
                    onChange={(value) => updateDraft({ linkKind: value as EventLinkKind })}
                  />
                )}
              </RemovableField>
            )}
            {draft.eventType === 'DINING' && draft.hasCuisines && (
              <RemovableField
                label='Cuisine'
                removeLabel='Remove cuisine'
                onRemove={() => updateDraft({ hasCuisines: false, cuisines: '' })}
              >
                <Input
                  placeholder='Ramen, Japanese'
                  value={draft.cuisines}
                  onChange={(event) => updateDraft({ cuisines: event.target.value })}
                />
              </RemovableField>
            )}
            {draft.isGrouped && (
              <RemovableField
                label='Group'
                removeLabel='Remove from group'
                onRemove={() => updateDraft({ isGrouped: false, groupLabel: '' })}
              >
                <div className='space-y-2'>
                  {sameTypeGroupLabels.length > 0 && (
                    <Select
                      options={[
                        ...sameTypeGroupLabels.map((label) => ({ value: label, text: label })),
                        { value: ADD_NEW_OPTION, text: 'New group…' },
                      ]}
                      value={
                        sameTypeGroupLabels.includes(draft.groupLabel)
                          ? draft.groupLabel
                          : ADD_NEW_OPTION
                      }
                      onChange={(value) =>
                        updateDraft({ groupLabel: value === ADD_NEW_OPTION ? '' : value })
                      }
                    />
                  )}
                  {!sameTypeGroupLabels.includes(draft.groupLabel) && (
                    <Input
                      placeholder={isTravel ? 'Flights to Lisbon' : 'Group name'}
                      value={draft.groupLabel}
                      onChange={(event) => updateDraft({ groupLabel: event.target.value })}
                    />
                  )}
                </div>
              </RemovableField>
            )}
            {draft.dayIndex !== null && draft.hasReminderOverride && (
              <RemovableField
                label='Reminder'
                removeLabel='Reset reminder'
                onRemove={() =>
                  updateDraft({
                    hasReminderOverride: false,
                    reminderEnabled: true,
                    reminderMinutesBefore: DEFAULT_REMINDER_MINUTES_BEFORE,
                  })
                }
              >
                <Select
                  options={reminderOptions}
                  value={draft.reminderEnabled ? String(draft.reminderMinutesBefore) : 'off'}
                  onChange={(value) =>
                    value === 'off'
                      ? updateDraft({ reminderEnabled: false })
                      : updateDraft({ reminderEnabled: true, reminderMinutesBefore: Number(value) })
                  }
                />
                {reminderText !== null && (
                  <p className='text-muted-foreground text-xs'>Will remind at {reminderText}</p>
                )}
              </RemovableField>
            )}
            {draft.hasVenueHours && (
              <RemovableField
                label='Business hours'
                removeLabel='Remove venue hours'
                onRemove={() =>
                  updateDraft({ hasVenueHours: false, venueOpenTime: '', venueCloseTime: '' })
                }
              >
                <div className='grid gap-3 sm:grid-cols-2'>
                  <Input
                    type='time'
                    aria-label='Opens at'
                    value={draft.venueOpenTime}
                    onChange={(event) => updateDraft({ venueOpenTime: event.target.value })}
                  />
                  <Input
                    type='time'
                    aria-label='Closes at'
                    value={draft.venueCloseTime}
                    onChange={(event) => updateDraft({ venueCloseTime: event.target.value })}
                  />
                </div>
              </RemovableField>
            )}
            {draft.hasAttendeeOverride && (
              <RemovableField
                label={attendeesLabel}
                removeLabel='Reset attendees'
                onRemove={() =>
                  updateDraft({
                    hasAttendeeOverride: false,
                    attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE',
                    assignedMemberIds: [],
                  })
                }
              >
                <div className='space-y-3'>
                  <Select
                    options={attendeeTargetOptions}
                    value={draft.attendeeTargetType}
                    onChange={(value) =>
                      updateDraft({ attendeeTargetType: value as EventAttendeeTargetType })
                    }
                  />
                  {draft.attendeeTargetType === 'SPECIFIC_MEMBERS' && (
                    <div className='space-y-2'>
                      {memberOptions.map((member) => (
                        <label key={member.value} className='flex items-center gap-2 text-sm'>
                          <Checkbox
                            checked={draft.assignedMemberIds.includes(member.value)}
                            onCheckedChange={(checked) =>
                              updateDraft({
                                assignedMemberIds: checked
                                  ? [...draft.assignedMemberIds, member.value]
                                  : draft.assignedMemberIds.filter((uid) => uid !== member.value),
                              })
                            }
                          />
                          {member.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </RemovableField>
            )}
            <AddFieldChips chips={detailChips} onAdd={revealDetail} />
            <ModalFooterActions
              leftActions={
                <>
                  {event && onDelete && (
                    <DeleteIconButton
                      onClick={() => void handleDelete()}
                      disabled={isSubmitting}
                    />
                  )}
                  <Button
                    type='button'
                    variant='secondary'
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                </>
              }
              rightActions={
                <Button
                  type='button'
                  loading={isSubmitting}
                  onClick={() => void handleSubmit()}
                >
                  {isSubmitting ? 'Saving…' : event ? 'Save' : 'Add'}
                </Button>
              }
            />
          </>
        )}
        {error && <p className='text-destructive text-sm'>{error}</p>}
      </div>
    </Modal>
  );
}

export default EventFormModal;
