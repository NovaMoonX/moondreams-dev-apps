import { useCallback, useMemo, useState } from 'react';

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
import { Bell, Clock, Link2, MapPin, Route, Sun, Type, Users, Utensils, X } from 'lucide-react';


import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import SectionDivider from '@/components/forms/SectionDivider';
import LinkAttachField from '@/components/forms/LinkAttachField';
import PlaceAutocompleteInput from '@/components/forms/PlaceAutocompleteInput';
import TimezoneSelect from '@/components/forms/TimezoneSelect';
import type { LinkPreview } from '@/lib/linkMetadata/types';
import { UNLINKED_PLACE } from '@/lib/places/placesApi';
import { findTopPlace } from '@/lib/places/placesLookup';
import { normalizeLabel } from '@apps/waypoint/utils/eventGroups';
import { airportsQueryOptions, type AirportOption } from '@/lib/airports/airportsQueries';
import type {
  PlaceRef,
  PlaceSelectionBias,
  PlaceSelectionResult,
} from '@/lib/places/types';
import { getDayCount, getDayOptions } from '@/utils/dateRangeUtils';
import { fromDayMinutes, shiftRangeEnd, toDayMinutes } from '@/utils/dayTimeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatClockTime, formatTime } from '@/utils/formatUtils';
import DeleteIconButton from '@/components/DeleteIconButton';
import ModalFooterActions from '@/components/ModalFooterActions';
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
  MAX_REMINDER_MINUTES_BEFORE,
  REMINDER_STEP_MINUTES,
  TRANSIT_LOCATION_LABELS,
  TRANSIT_LOCATION_MIRROR_KEYS,
  TRANSIT_TYPE_EMOJIS,
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
  TransitDetails,
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

export type EventFormValues = Omit<
  TimelineEvent,
  'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'
>;

export interface NextLegSeed {
  previous: EventFormValues;
  /** Where the previous leg lands, looked up when it was saved. */
  arrivalPlace: PlaceSelectionResult | null;
}

export interface SubmitOptions {
  addLeg: boolean;
  arrivalPlace?: PlaceSelectionResult | null;
}

/** Known fields to open a new event already filled in (e.g. from an idea); the form still asks for day and time. */
export interface EventPrefill {
  eventType: Extract<EventType, 'DINING' | 'ACTIVITY'>;
  title: string;
  notes: string | null;
  linkUrl: string | null;
  cuisines: string[];
  settings: ActivitySetting[];
  dayIndex: number;
  time: string;
}

interface EventFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  memberOptions: { label: string; value: string }[];
  event?: TimelineEvent;
  prefill?: EventPrefill;
  events?: TimelineEvent[];
  /** A rough center point (from an existing trip event/stay) to bias place search
   * results toward, so "starbucks" finds the one near this trip first. */
  placeBias?: PlaceSelectionBias;
  isSubmitting?: boolean;
  /** The leg just saved, when this form is opened to add the next one of the same flight. */
  legFrom?: NextLegSeed;
  /** `addLeg` saves this event and reopens the form for the next leg, departing from `arrivalPlace`. */
  onSubmit: (event: EventFormValues, options?: SubmitOptions) => Promise<void> | void;
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
const transitTypeOptions = Object.entries(TRANSIT_TYPE_LABELS).map(([value, text]) => ({
  value,
  text: `${TRANSIT_TYPE_EMOJIS[value as TransitType]} ${text}`,
}));
const mealTypeOptions = toSelectOptions(MEAL_TYPE_LABELS);
const attendeeTargetOptions = toSelectOptions(EVENT_ATTENDEE_TARGET_LABELS);
const reminderHourOptions = Array.from(
  { length: Math.floor(MAX_REMINDER_MINUTES_BEFORE / 60) + 1 },
  (_, hours) => ({ value: String(hours), text: `${hours} hr` }),
);

function getReminderMinuteOptions(hours: number) {
  const maxMinutes = Math.min(59, MAX_REMINDER_MINUTES_BEFORE - hours * 60);
  return Array.from({ length: Math.floor(maxMinutes / REMINDER_STEP_MINUTES) + 1 }, (_, step) => step * REMINDER_STEP_MINUTES)
    .filter((minutes) => hours > 0 || minutes > 0)
    .map((minutes) => ({ value: String(minutes), text: `${minutes} min` }));
}

function clampReminderMinutes(hours: number, minutes: number) {
  const total = Math.min(MAX_REMINDER_MINUTES_BEFORE, Math.max(REMINDER_STEP_MINUTES, hours * 60 + minutes));
  return total;
}

interface EventDraft {
  eventType: EventType;
  title: string;
  hasTitle: boolean;
  dayIndex: number | null;
  endDayIndex: number | null;
  hasEndTime: boolean;
  time: string;
  endTime: string;
  /** Override of the trip's time zone; `null` follows the trip. */
  timezone: string | null;
  /** Transit type for travel, meal type for dining; unused otherwise. */
  quickField: string;
  isMealTouched: boolean;
  settings: ActivitySetting[];
  hasSettings: boolean;
  hasAddress: boolean;
  hasLocation: boolean;
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

function getMealForTime(time: string): MealType {
  const hour = Number(time.split(':')[0]);
  if (hour >= 5 && hour < 11) return 'BREAKFAST';
  if (hour >= 11 && hour < 15) return 'LUNCH';
  if (hour >= 15 && hour < 17) return 'SNACK';
  return 'DINNER';
}

function getDefaultSubtype(eventType: EventType, time: string): string {
  if (eventType === 'TRAVEL') return 'FLIGHT';
  if (eventType === 'DINING') return getMealForTime(time);
  return '';
}

function getDayChoices(trip: TripSpace, current: number | null, allowNoDay: boolean) {
  const days = getDayOptions(trip.startDate, trip.endDate, current).map(({ value, label }) => ({
    value,
    text: label,
  }));
  const none = allowNoDay ? [{ text: 'No specific day', value: NO_DAY_VALUE }] : [];
  return [...none, ...days];
}

function getDerivedTitle(draft: EventDraft): string {
  if (draft.eventType === 'TRAVEL') {
    const transitType = draft.quickField as TransitType;
    return getDerivedTravelTitle(transitType, buildTransitDetails(transitType, draft.transit));
  }
  if (draft.locationName.trim()) {
    return draft.locationName.trim();
  }
  if (draft.eventType === 'DINING') {
    return MEAL_TYPE_LABELS[draft.quickField as MealType] ?? EVENT_TYPE_LABELS.DINING;
  }
  return EVENT_TYPE_LABELS[draft.eventType];
}

/** The next leg of a flight starts where the last one landed, with the same airline, booking
 * and travelers; only the flight itself still needs entering. */
function getNextLegDraft(trip: TripSpace, { previous, arrivalPlace }: NextLegSeed): EventDraft {
  const base = getBaseDraft(trip, undefined);
  const time = getEventTime(trip, previous);
  const details =
    previous.eventDetails && 'transitDetails' in previous.eventDetails
      ? (previous.eventDetails.transitDetails as unknown as Record<string, string | null> | null)
      : null;
  const carried = ['airline', 'airlineIataCode', 'airlineIcaoCode', 'confirmationCode'];
  return {
    ...base,
    eventType: 'TRAVEL',
    quickField: 'FLIGHT',
    dayIndex: time.endDayIndex ?? time.dayIndex,
    endDayIndex: time.endDayIndex ?? time.dayIndex,
    time: time.endTime ?? time.startTime ?? base.time,
    timezone: previous.timezone,
    locationName: arrivalPlace?.name ?? '',
    address: arrivalPlace?.address ?? '',
    hasAddress: Boolean(arrivalPlace?.address),
    latitude: arrivalPlace?.latitude ?? null,
    longitude: arrivalPlace?.longitude ?? null,
    place: arrivalPlace?.place ?? null,
    isGrouped: true,
    groupLabel: previous.groupLabel ?? '',
    hasAttendeeOverride: previous.attendeeTargetType !== 'EVERYONE_INCLUDING_FUTURE',
    attendeeTargetType: previous.attendeeTargetType,
    assignedMemberIds: previous.assignedMemberIds,
    transit: {
      ...EMPTY_TRANSIT_DRAFT,
      values: {
        ...Object.fromEntries(carried.map((key) => [key, details?.[key] ?? ''])),
        departureAirportCode: details?.arrivalAirportCode ?? '',
      },
    },
  };
}

function getPrefilledDraft(trip: TripSpace, prefill: EventPrefill): EventDraft {
  const base = getBaseDraft(trip, undefined);
  return {
    ...base,
    eventType: prefill.eventType,
    hasTitle: true,
    title: prefill.title,
    dayIndex: prefill.dayIndex,
    endDayIndex: prefill.dayIndex,
    time: prefill.time,
    quickField: getDefaultSubtype(prefill.eventType, prefill.time),
    settings: prefill.settings,
    hasSettings: prefill.settings.length > 0,
    cuisines: prefill.cuisines.join(', '),
    hasCuisines: prefill.cuisines.length > 0,
    linkUrl: prefill.linkUrl ?? '',
    hasLink: Boolean(prefill.linkUrl),
  };
}

function getInitialDraft(
  trip: TripSpace,
  event: TimelineEvent | undefined,
  legFrom?: NextLegSeed,
  prefill?: EventPrefill,
): EventDraft {
  if (legFrom) {
    return getNextLegDraft(trip, legFrom);
  }
  if (prefill && !event) {
    return getPrefilledDraft(trip, prefill);
  }
  const draft = getBaseDraft(trip, event);
  const mirrorKey =
    event?.eventType === 'TRAVEL'
      ? TRANSIT_LOCATION_MIRROR_KEYS[draft.quickField as TransitType]
      : undefined;
  const withLocation = {
    ...draft,
    locationName: draft.locationName || (mirrorKey ? (draft.transit.values[mirrorKey] ?? '') : ''),
  };
  const hasTitle = Boolean(event) && event?.title !== getDerivedTitle(withLocation);
  return { ...withLocation, hasTitle, title: hasTitle ? (event?.title ?? '') : '' };
}

function getBaseDraft(trip: TripSpace, event: TimelineEvent | undefined): EventDraft {
  const time = event ? getEventTime(trip, event) : null;
  return {
    eventType: event?.eventType ?? 'ACTIVITY',
    title: '',
    hasTitle: false,
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
          : event
            ? ''
            : getDefaultSubtype('ACTIVITY', '09:00'),
    isMealTouched: Boolean(event),
    settings:
      event?.eventType === 'ACTIVITY' && event.eventDetails && 'settings' in event.eventDetails
        ? (event.eventDetails.settings ?? [])
        : [],
    hasSettings: Boolean(
      event?.eventType === 'ACTIVITY' &&
        event.eventDetails &&
        'settings' in event.eventDetails &&
        event.eventDetails.settings?.length,
    ),
    hasAddress: Boolean(event?.address),
    hasLocation: Boolean(event?.locationName),
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
  prefill,
  events = [],
  legFrom,
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
  const [draft, setDraft] = useState<EventDraft>(() => getInitialDraft(trip, event, legFrom, prefill));
  const isRelative = isRelativeTrip(trip);
  const sameTypeGroupLabels = useMemo(
    () =>
      events
        .filter((other) => other.eventType === draft.eventType && other.groupLabel)
        .map((other) => other.groupLabel as string)
        .filter(
          (label, index, all) =>
            all.findIndex((candidate) => normalizeLabel(candidate) === normalizeLabel(label)) === index,
        ),
    [events, draft.eventType],
  );
  const isTravel = draft.eventType === 'TRAVEL';
  const dayCount = getDayCount(trip.startDate, trip.endDate);

  const updateDraft = (changes: Partial<EventDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // Moving the start keeps the same start->end window by shifting the end by the same delta.
  const updateStart = (nextDayIndex: number | null, nextTime: string) => {
    const applyChanges = (changes: Partial<EventDraft>) =>
      updateDraft({
        ...(draft.eventType === 'DINING' && !draft.isMealTouched
          ? { quickField: getMealForTime(nextTime) }
          : {}),
        ...changes,
      });
    if (nextDayIndex === null) {
      applyChanges({ dayIndex: null, endDayIndex: null, time: nextTime, hasEndTime: false, endTime: '' });
      return;
    }
    if (draft.dayIndex === null) {
      applyChanges({ dayIndex: nextDayIndex, endDayIndex: nextDayIndex, time: nextTime });
      return;
    }
    if (!draft.hasEndTime || draft.endTime === '') {
      applyChanges({ dayIndex: nextDayIndex, endDayIndex: nextDayIndex, time: nextTime });
      return;
    }

    const nextEnd = shiftRangeEnd({
      start: { day: draft.dayIndex, time: draft.time },
      end: { day: draft.endDayIndex ?? draft.dayIndex, time: draft.endTime },
      nextStart: { day: nextDayIndex, time: nextTime },
      max: nextDayIndex < dayCount ? { day: dayCount - 1, time: '23:59' } : undefined,
    });
    applyChanges({
      dayIndex: nextDayIndex,
      time: nextTime,
      endDayIndex: nextEnd.day,
      endTime: nextEnd.time,
    });
  };

  const fillLocationFromAirport = useCallback(
    async (airport: AirportOption) => {
      const result = await findTopPlace(
        queryClient,
        `${airport.name} ${airport.iataCode}`,
        { latitude: airport.latitude, longitude: airport.longitude },
        ['airport'],
      ).catch(() => null);
      if (result) {
        setDraft((current) => ({
          ...current,
          locationName: result.name,
          address: result.address,
          hasAddress: Boolean(result.address) || current.hasAddress,
          latitude: result.latitude,
          longitude: result.longitude,
          place: result.place,
        }));
      }
    },
    [queryClient],
  );

  const handleNext = () => {
    if (!draft.time || (draft.dayIndex === null && !isRelative)) {
      setError('Enter a day and start time.');
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

  const handleSubmit = async (addLeg = false) => {
    if (!timeFields) {
      setError('Choose a valid day and start time.');
      return;
    }

    const transitType = draft.quickField as TransitType;
    const getTransitDetails = () => {
      const built = buildTransitDetails(transitType, draft.transit);
      const mirrorKey = TRANSIT_LOCATION_MIRROR_KEYS[transitType];
      return {
        ...built,
        ...(mirrorKey ? { [mirrorKey]: draft.locationName.trim() || null } : {}),
        ...(draft.hasEndTime ? { estimatedTravelTimeMs: null } : {}),
      } as TransitDetails;
    };
    const transitDetails = isTravel ? getTransitDetails() : null;
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
        return { settings: draft.hasSettings ? draft.settings : [] };
      }
      return {};
    };
    const eventDetails = getEventDetails();
    const title = draft.hasTitle && draft.title.trim() ? draft.title : getDerivedTitle(draft);
    const linkKinds = EVENT_LINK_KINDS_BY_TYPE[draft.eventType];
    const getGroupLabel = () => {
      if (draft.isGrouped && draft.groupLabel.trim()) {
        return draft.groupLabel.trim();
      }
      if (!addLeg) {
        return null;
      }

      const arrival = draft.transit.values.arrivalAirportCode;
      const base = arrival ? `Flights to ${arrival}` : 'Flight legs';
      const pick = (attempt: number): string => {
        const candidate = attempt === 1 ? base : `${base} (${attempt})`;
        return sameTypeGroupLabels.some((label) => normalizeLabel(label) === normalizeLabel(candidate))
          ? pick(attempt + 1)
          : candidate;
      };
      return pick(1);
    };
    const groupLabel = getGroupLabel();
    const getArrivalPlace = async () => {
      const code = draft.transit.values.arrivalAirportCode;
      if (!addLeg || !code) {
        return null;
      }

      const airports = await queryClient.fetchQuery(airportsQueryOptions()).catch(() => []);
      const airport = airports.find((candidate) => candidate.iataCode === code);
      return airport
        ? findTopPlace(
            queryClient,
            `${airport.name} ${airport.iataCode}`,
            { latitude: airport.latitude, longitude: airport.longitude },
            ['airport'],
          ).catch(() => null)
        : null;
    };
    const arrivalPlace = await getArrivalPlace();

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
        notes: event?.notes ?? prefill?.notes ?? null,
        attendeeTargetType: draft.attendeeTargetType,
        assignedMemberIds,
        venueOpenTime: draft.hasVenueHours ? draft.venueOpenTime || null : null,
        venueCloseTime: draft.hasVenueHours ? draft.venueCloseTime || null : null,
        changeHistory: event?.changeHistory ?? [],
        place: draft.place,
        linkUrl: isLinkable ? draft.linkUrl : null,
        linkPreview: isLinkable ? draft.linkPreview : null,
        linkKind:
          isLinkable && draft.linkUrl.trim()
            ? draft.linkKind && linkKinds.includes(draft.linkKind)
              ? draft.linkKind
              : (linkKinds[0] ?? null)
            : null,
        groupLabel,
        stackLabel: event?.stackLabel ?? legFrom?.previous.stackLabel ?? null,
        reminderMinutesBefore: draft.reminderMinutesBefore,
        reminderEnabled: draft.reminderEnabled,
        reminderId: event?.reminderId ?? null,
        isArchived: event?.isArchived ?? false,
        archivedBy: event?.archivedBy ?? null,
        archivedAt: event?.archivedAt ?? null,
        seenBy: event?.seenBy ?? {},
      }, { addLeg, arrivalPlace });
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

  const isLinkable = LINK_ATTACHABLE_EVENT_TYPES.includes(draft.eventType);
  const isPlaceEvent = draft.eventType === 'DINING' || draft.eventType === 'ACTIVITY';
  const attendeesLabel = isTravel ? "Who's traveling" : 'Attendees';
  const transitType = draft.quickField as TransitType;
  const isLocationVisible = isTravel
    ? transitType === 'FLIGHT'
      ? Boolean(draft.transit.values.departureAirportCode) && !draft.place
      : true
    : isPlaceEvent || (draft.eventType === 'FREE_TIME' && draft.hasLocation);
  const isAddressShown = draft.hasAddress;
  const detailChips = [
    { key: 'title', label: 'Title', icon: <Type className='h-4 w-4' />, isShown: draft.hasTitle },
    { key: 'link', label: 'Link', icon: <Link2 className='h-4 w-4' />, isShown: !isLinkable || draft.hasLink },
    {
      key: 'cuisines',
      label: 'Cuisine',
      icon: <Utensils className='h-4 w-4' />,
      isShown: draft.eventType !== 'DINING' || draft.hasCuisines,
    },
    {
      key: 'settings',
      label: 'Indoor / outdoor',
      icon: <Sun className='h-4 w-4' />,
      isShown: draft.eventType !== 'ACTIVITY' || draft.hasSettings,
    },
    {
      key: 'location',
      label: 'Location',
      icon: <MapPin className='h-4 w-4' />,
      isShown: draft.eventType !== 'FREE_TIME' || draft.hasLocation,
    },
    {
      key: 'address',
      label: 'Address',
      icon: <MapPin className='h-4 w-4' />,
      isShown: !isLocationVisible || isAddressShown,
    },
    {
      key: 'venueHours',
      label: 'Business hours',
      icon: <Clock className='h-4 w-4' />,
      isShown: !isPlaceEvent || draft.hasVenueHours,
    },
    { key: 'group', label: 'Group', icon: <Route className='h-4 w-4' />, isShown: draft.isGrouped },
    {
      key: 'reminder',
      label: 'Reminder',
      icon: <Bell className='h-4 w-4' />,
      isShown: draft.dayIndex === null || draft.hasReminderOverride,
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
        title: { hasTitle: true },
        link: { hasLink: true },
        cuisines: { hasCuisines: true },
        settings: { hasSettings: true },
        location: { hasLocation: true },
        address: { hasAddress: true },
        group: { isGrouped: true },
        reminder: { hasReminderOverride: true },
        venueHours: { hasVenueHours: true },
        attendees: { hasAttendeeOverride: true },
      }[key] ?? {},
    );

  const locationField = (label: string) => (
    <div className='space-y-4'>
      <PlaceAutocompleteInput
        label={label}
        quickSearch={{ label: 'Search by title', value: draft.hasTitle ? draft.title : '' }}
        placeholder='Ichiran Shibuya'
        value={draft.locationName}
        onChange={(locationName) => updateDraft({ locationName, ...UNLINKED_PLACE })}
        bias={placeBias}
        onSelect={(result: PlaceSelectionResult) =>
          updateDraft({
            locationName: result.name,
            address: result.address,
            hasAddress: Boolean(result.address) || draft.hasAddress,
            latitude: result.latitude,
            longitude: result.longitude,
            place: result.place,
          })
        }
        className='mb-0' // overwrite space-y-4
      />
      {isAddressShown && (
        <RemovableField
          label='Address'
          removeLabel='Remove address'
          onRemove={() => updateDraft({ hasAddress: false, address: '' })}
        >
          <Input
            placeholder='Street address'
            value={draft.address}
            onChange={(event) => updateDraft({ address: event.target.value, ...UNLINKED_PLACE })}
          />
        </RemovableField>
      )}
    </div>
  );
  const travelLocationLabel = TRANSIT_LOCATION_LABELS[transitType];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Timeline event'>
      <div className='space-y-4'>
        <p className='text-muted-foreground text-sm'>
          Step {step} of 2 · {step === 1 ? 'What & when' : 'Details'}
        </p>
        {legFrom && (
          <p className='text-muted-foreground text-xs'>
            Next leg of {legFrom.previous.groupLabel ?? 'this flight'}: the airline, booking and travelers carry over.
          </p>
        )}
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
                    quickField: getDefaultSubtype(value as EventType, draft.time),
                    isMealTouched: false,
                    isGrouped: false,
                    groupLabel: '',
                  })
                }
              />
            </div>
            {isTravel && (
              <div className='space-y-1.5'>
                <Label>Transit type</Label>
                <Select
                  options={transitTypeOptions}
                  value={draft.quickField}
                  onChange={(value) => updateDraft({ quickField: value })}
                />
              </div>
            )}
            {draft.eventType === 'DINING' && (
              <div className='space-y-1.5'>
                <Label>Meal</Label>
                <Select
                  options={mealTypeOptions}
                  value={draft.quickField}
                  onChange={(value) => updateDraft({ quickField: value, isMealTouched: true })}
                />
              </div>
            )}
            <div className='space-y-1.5'>
              <Label>{isTravel ? 'Departs' : 'Starts at'}</Label>
              <div className='grid gap-3 sm:grid-cols-2'>
                <Select
                  options={getDayChoices(trip, draft.dayIndex, isRelative)}
                  value={draft.dayIndex === null ? NO_DAY_VALUE : String(draft.dayIndex)}
                  onChange={(value) =>
                    updateStart(value === NO_DAY_VALUE ? null : Number(value), draft.time)
                  }
                />
                <Input
                  type='time'
                  aria-label='Start time'
                  value={draft.time}
                  onChange={(event) => updateStart(draft.dayIndex, event.target.value)}
                />
              </div>
            </div>
            {draft.dayIndex === null ? null : draft.hasEndTime ? (
              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <Label>{isTravel ? 'Arrives' : 'Ends at'}</Label>
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
                {isTravel ? '+ Add arrival time' : '+ Add end time'}
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
            {isTravel && (
              <TransitDetailsFields
                transitType={transitType}
                value={draft.transit}
                onChange={(transit) => updateDraft({ transit })}
                onDepartureAirportPicked={(airport) => void fillLocationFromAirport(airport)}
                hasEndTime={draft.hasEndTime}
                routeLocation={
                  transitType === 'FLIGHT'
                    ? isLocationVisible
                      ? locationField('Departure location')
                      : undefined
                    : locationField(travelLocationLabel ?? 'Where to navigate')
                }
              />
            )}
            {isPlaceEvent && (
              <>
                <SectionDivider label='Where to navigate' />
                {locationField('Location')}
              </>
            )}
            {draft.eventType === 'FREE_TIME' && draft.hasLocation && (
              <>
                <SectionDivider label='Where to navigate' />
                <RemovableField
                  label='Location'
                  removeLabel='Remove location'
                  onRemove={() =>
                    updateDraft({
                      hasLocation: false,
                      hasAddress: false,
                      locationName: '',
                      address: '',
                      ...UNLINKED_PLACE,
                    })
                  }
                >
                  {locationField('')}
                </RemovableField>
              </>
            )}
            <SectionDivider label='More details' />
            {draft.hasTitle && (
              <RemovableField
                label='Title'
                removeLabel='Remove title'
                onRemove={() => updateDraft({ hasTitle: false, title: '' })}
              >
                <Input
                  value={draft.title}
                  placeholder={getDerivedTitle(draft)}
                  onChange={(event) => updateDraft({ title: event.target.value })}
                />
              </RemovableField>
            )}
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
                  currentTitle={draft.hasTitle ? draft.title : ''}
                  onUseTitle={(title) => updateDraft({ title, hasTitle: true })}
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
                        sameTypeGroupLabels.find(
                          (label) => normalizeLabel(label) === normalizeLabel(draft.groupLabel),
                        ) ?? ADD_NEW_OPTION
                      }
                      onChange={(value) => updateDraft({ groupLabel: value === ADD_NEW_OPTION ? '' : value })}
                    />
                  )}
                  {!sameTypeGroupLabels.some(
                    (label) => normalizeLabel(label) === normalizeLabel(draft.groupLabel),
                  ) && (
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
                <div className='flex items-center gap-2'>
                  <Select
                    className='flex-1'
                    disabled={!draft.reminderEnabled}
                    options={reminderHourOptions}
                    value={String(Math.floor(draft.reminderMinutesBefore / 60))}
                    onChange={(value) =>
                      updateDraft({
                        reminderMinutesBefore: clampReminderMinutes(
                          Number(value),
                          draft.reminderMinutesBefore % 60,
                        ),
                      })
                    }
                  />
                  <Select
                    className='flex-1'
                    disabled={!draft.reminderEnabled}
                    options={getReminderMinuteOptions(Math.floor(draft.reminderMinutesBefore / 60))}
                    value={String(draft.reminderMinutesBefore % 60)}
                    onChange={(value) =>
                      updateDraft({
                        reminderMinutesBefore: clampReminderMinutes(
                          Math.floor(draft.reminderMinutesBefore / 60),
                          Number(value),
                        ),
                      })
                    }
                  />
                  <span className='text-muted-foreground shrink-0 text-sm'>before</span>
                </div>
                <label className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={!draft.reminderEnabled}
                    onCheckedChange={(checked) => updateDraft({ reminderEnabled: checked !== true })}
                  />
                  Don&apos;t remind me
                </label>
                {reminderText !== null && (
                  <p className='text-muted-foreground text-xs'>Will remind at {reminderText}</p>
                )}
              </RemovableField>
            )}
            {draft.eventType === 'ACTIVITY' && draft.hasSettings && (
              <RemovableField
                label='Indoor / outdoor'
                removeLabel='Remove indoor / outdoor'
                onRemove={() => updateDraft({ hasSettings: false, settings: [] })}
              >
                <div className='flex flex-wrap gap-4'>
                  {(Object.keys(ACTIVITY_SETTING_LABELS) as ActivitySetting[]).map((setting) => (
                    <label key={setting} className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={draft.settings.includes(setting)}
                        onCheckedChange={(checked) =>
                          updateDraft({
                            settings:
                              checked === true
                                ? [...draft.settings, setting]
                                : draft.settings.filter((existing) => existing !== setting),
                          })
                        }
                      />
                      {ACTIVITY_SETTING_LABELS[setting]}
                    </label>
                  ))}
                </div>
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
            <AddFieldChips heading='Add to this event' chips={detailChips} onAdd={revealDetail} />
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
                <>
                  {isTravel && transitType === 'FLIGHT' && (
                    <Button
                      type='button'
                      variant='tertiary'
                      disabled={isSubmitting}
                      onClick={() => void handleSubmit(true)}
                    >
                      Add another flight
                    </Button>
                  )}
                  <Button
                    type='button'
                    loading={isSubmitting}
                    onClick={() => void handleSubmit()}
                  >
                    {isSubmitting ? 'Saving…' : event ? 'Save' : 'Add'}
                  </Button>
                </>
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
