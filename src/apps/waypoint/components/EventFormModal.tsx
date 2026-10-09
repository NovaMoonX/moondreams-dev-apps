import { useCallback, useMemo, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import {
  Button,
  Input,
  Label,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Bell, Clock, Link2, MapPin, Route, Sun, Ticket, Type, Utensils } from 'lucide-react';


import AddFieldChips, { RemovableField } from '@/components/forms/AddFieldChips';
import Pill from '@/components/Pill';
import PickOrCreate, { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { MultiPillGroup, PillGroup, PillRow } from '@/components/PillGroup';
import SectionDivider from '@/components/SectionDivider';
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
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import { getDayCount, getDayOptions } from '@/utils/dateRangeUtils';
import { formatTimezoneAbbreviation } from '@/utils/timezoneUtils';
import { fromDayMinutes, shiftRangeEnd, toDayMinutes } from '@/utils/dayTimeUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatClockTime, formatTime } from '@/utils/formatUtils';
import DeleteIconButton from '@/components/DeleteIconButton';
import FormScreen from '@/components/FormScreen';
import ModalFooterActions from '@/components/ModalFooterActions';
import ItineraryPlacePicks from '@apps/waypoint/components/ItineraryPlacePicks';
import TransitDetailsFields from '@apps/waypoint/components/TransitDetailsFields';
import UploadAutofill from '@apps/waypoint/components/UploadAutofill';
import { flightToPrefill } from '@apps/waypoint/utils/bookingImport';
import { getLiveLink, isLinkedTo } from '@apps/waypoint/utils/bookingItems';
import { BOOKING_TRACKED_EVENT_TYPES } from '@apps/waypoint/constants';
import {
  ACTIVITY_SETTING_LABELS,
  DEFAULT_REMINDER_MINUTES_BEFORE,
  MAX_DAYS_OUTSIDE_TRIP,
  EVENT_LINK_KIND_LABELS,
  TRANSIT_ARRIVAL,
  TRANSIT_PLACE_PLACEHOLDERS,
  EVENT_LINK_KINDS_BY_TYPE,
  EVENT_TYPE_EMOJIS,
  EVENT_TYPE_LABELS,
  MEAL_TYPE_EMOJIS,
  MEAL_TYPE_LABELS,
  MAX_REMINDER_MINUTES_BEFORE,
  REMINDER_STEP_MINUTES,
  TRANSIT_LOCATION_LABELS,
  TRANSIT_LOCATION_MIRROR_KEYS,
  TRANSIT_TYPE_EMOJIS,
  TRANSIT_TYPE_LABELS,
  ARRIVE_BY_EVENT_TYPES,
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
  getDefaultDayIndex,
  buildEventTimeFields,
  getEventTime,
  isRelativeTrip,
} from '@apps/waypoint/utils/tripTime';
import { join } from '@moondreamsdev/dreamer-ui/utils';

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
  /** The to-dos to link once the event is saved; left out when the form never offered them. */
  bookings?: { picked: string[]; initial: string[] };
}

/** Known fields to open a new event already filled in (from an idea, a travel prompt or an imported
 * booking); the form still lets the person change any of it. */
export interface EventPrefill {
  eventType: EventType;
  title: string;
  notes: string | null;
  linkUrl: string | null;
  cuisines: string[];
  settings: ActivitySetting[];
  dayIndex: number;
  time: string;
  /** Who the event is for; leave out to keep it for everyone. */
  attendeeUids?: string[];
  transitType?: TransitType;
  /** Transit field values by key (`airline`, `flightNumber`, `departureAirportCode`…). */
  transitValues?: Record<string, string>;
  endDayIndex?: number;
  endTime?: string;
  timezone?: string | null;
  endTimezone?: string | null;
  locationName?: string;
  place?: PlaceSelectionResult;
  groupLabel?: string;
}

interface EventFormModalProps {
  isOpen: boolean;
  trip: TripSpace;
  currentUserId: string;
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

const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];
const TRANSIT_TYPES = Object.keys(TRANSIT_TYPE_LABELS) as TransitType[];
const MEAL_TYPES = Object.keys(MEAL_TYPE_LABELS) as MealType[];
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
  /** Zone the end is in when it differs from the start's; `null` means the same zone. */
  endTimezone: string | null;
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
  /** Attendees were filled in by the form (travel is for just you by default), not chosen by the person. */
  isAttendeeAuto: boolean;
  /** Pick people was chosen, even if the only one picked so far is the signed-in user. */
  isPickingPeople: boolean;
  hasCuisines: boolean;
  transit: TransitDraft;
  cuisines: string;
  attendeeTargetType: EventAttendeeTargetType;
  assignedMemberIds: string[];
  hasArriveBy: boolean;
  arriveByTime: string;
  arriveByNote: string;
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

function getClockMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function fromClockMinutes(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Moving the start moves a chosen arrival with it, keeping its lead; it is dropped when nothing earlier fits. */
function getShiftedArriveBy(draft: EventDraft, nextTime: string): Partial<EventDraft> {
  if (!draft.hasArriveBy || !draft.arriveByTime || !draft.time || !nextTime) {
    return {};
  }
  const latest = getClockMinutes(nextTime) - 1;
  if (latest < 0) {
    return { hasArriveBy: false, arriveByTime: '', arriveByNote: '' };
  }
  const shifted = getClockMinutes(draft.arriveByTime) + getClockMinutes(nextTime) - getClockMinutes(draft.time);
  return { arriveByTime: fromClockMinutes(Math.min(Math.max(shifted, 0), latest)) };
}

/** Half an hour before the start, kept on the same day; empty when the start is too early to fit one. */
function getSuggestedArriveBy(startTime: string) {
  const total = getClockMinutes(startTime) - 30;
  return Number.isNaN(total) || total < 0 ? '' : fromClockMinutes(total);
}

function getDefaultSubtype(eventType: EventType, time: string): string {
  if (eventType === 'TRAVEL') return 'DRIVE';
  if (eventType === 'DINING') return getMealForTime(time);
  return '';
}

function getDayChoices(trip: TripSpace, current: number | null, allowNoDay: boolean) {
  const days = getDayOptions(trip.startDate, trip.endDate, current, MAX_DAYS_OUTSIDE_TRIP).map(({ value, label }) => ({
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
    timezone: previous.endTimezone ?? previous.timezone,
    endTimezone: null,
    locationName: arrivalPlace?.name ?? '',
    address: arrivalPlace?.address ?? '',
    hasAddress: Boolean(arrivalPlace?.address),
    latitude: arrivalPlace?.latitude ?? null,
    longitude: arrivalPlace?.longitude ?? null,
    place: arrivalPlace?.place ?? null,
    isGrouped: true,
    groupLabel: previous.groupLabel ?? '',
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
  const hasEnd = prefill.endTime !== undefined;
  const isSpecific = prefill.attendeeUids !== undefined;
  return {
    ...base,
    eventType: prefill.eventType,
    hasTitle: Boolean(prefill.title),
    title: prefill.title,
    dayIndex: prefill.dayIndex,
    endDayIndex: prefill.endDayIndex ?? prefill.dayIndex,
    hasEndTime: hasEnd,
    endTime: prefill.endTime ?? '',
    time: prefill.time,
    timezone: prefill.timezone ?? null,
    endTimezone: prefill.endTimezone ?? null,
    quickField: prefill.transitType ?? getDefaultSubtype(prefill.eventType, prefill.time),
    settings: prefill.settings,
    hasSettings: prefill.settings.length > 0,
    cuisines: prefill.cuisines.join(', '),
    hasCuisines: prefill.cuisines.length > 0,
    linkUrl: prefill.linkUrl ?? '',
    hasLink: Boolean(prefill.linkUrl),
    locationName: prefill.place?.name ?? prefill.locationName ?? '',
    hasLocation: Boolean(prefill.place ?? prefill.locationName),
    address: prefill.place?.address ?? '',
    hasAddress: Boolean(prefill.place?.address),
    latitude: prefill.place?.latitude ?? null,
    longitude: prefill.place?.longitude ?? null,
    place: prefill.place?.place ?? null,
    isGrouped: Boolean(prefill.groupLabel),
    groupLabel: prefill.groupLabel ?? '',
    attendeeTargetType: isSpecific ? 'SPECIFIC_MEMBERS' : base.attendeeTargetType,
    assignedMemberIds: prefill.attendeeUids ?? [],
    transit: prefill.transitValues
      ? { ...EMPTY_TRANSIT_DRAFT, values: prefill.transitValues }
      : EMPTY_TRANSIT_DRAFT,
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
    dayIndex: event ? (time?.dayIndex ?? null) : getDefaultDayIndex(trip),
    endDayIndex: event ? (time?.endDayIndex ?? null) : getDefaultDayIndex(trip),
    hasEndTime: Boolean(time?.endTime),
    time: time?.startTime || '09:00',
    endTime: time?.endTime ?? '',
    timezone: event?.timezone ?? null,
    endTimezone: event?.endTimezone ?? null,
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
    isAttendeeAuto: false,
    isPickingPeople: false,
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
    attendeeTargetType: event?.attendeeTargetType ?? 'EVERYONE_INCLUDING_FUTURE',
    assignedMemberIds: event?.assignedMemberIds ?? [],
    hasArriveBy: Boolean(event?.arriveByTime),
    arriveByTime: event?.arriveByTime ?? '',
    arriveByNote: event?.arriveByNote ?? '',
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


interface ZoneFieldProps {
  label: string;
  zone: string;
  at: number;
  isTripDefault: boolean;
  onChange: (zone: string) => void;
}

function ZoneField({ label, zone, at, isTripDefault, onChange }: ZoneFieldProps) {
  return (
    <div className='flex flex-wrap items-center gap-x-2 gap-y-1 pl-4'>
      <span className='text-muted-foreground text-xs'>{label}</span>
      <TimezoneSelect pill value={zone} at={at} onChange={onChange} />
      {isTripDefault && <span className='text-muted-foreground text-xs'>Trip default</span>}
    </div>
  );
}

const ATTENDEE_CHOICES: { type: EventAttendeeTargetType | 'ME'; label: string; emoji: string }[] = [
  { type: 'EVERYONE_INCLUDING_FUTURE', label: 'Everyone', emoji: '👥' },
  { type: 'ME', label: 'Just me', emoji: '🙋' },
  { type: 'SPECIFIC_MEMBERS', label: 'Pick people', emoji: '🎯' },
  { type: 'EVERYONE_CURRENT', label: 'Everyone here now', emoji: '📸' },
];

function EventFormModal({
  isOpen,
  trip,
  currentUserId,
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
  const isPhone = useMediaQuery().isBelow('sm');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<EventDraft>(() => getInitialDraft(trip, event, legFrom, prefill));
  const checklistItems = useAppSelector((state) => state.waypoint.checklist.items);
  const bookingEventIds = useMemo(() => new Set(events.map((other) => other.id)), [events]);
  const bookingChoices = useMemo(
    () =>
      checklistItems
        .filter(
          (item) =>
            (event && isLinkedTo(item, { kind: 'EVENT', id: event.id }, bookingEventIds)) ||
            (!item.isCompleted && getLiveLink(item, bookingEventIds) === null),
        )
        .sort((first, second) => Number(second.category === 'BOOKINGS') - Number(first.category === 'BOOKINGS')),
    [checklistItems, event, bookingEventIds],
  );
  const [initialBookingIds] = useState(() =>
    event
      ? checklistItems
          .filter((item) => isLinkedTo(item, { kind: 'EVENT', id: event.id }, bookingEventIds))
          .map((item) => item.id)
      : [],
  );
  const [bookingItemIds, setBookingItemIds] = useState<string[] | null>(() =>
    initialBookingIds.length > 0 ? initialBookingIds : null,
  );
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
  const canArriveEarly =
    isRelative && ARRIVE_BY_EVENT_TYPES.includes(draft.eventType) && draft.dayIndex !== null && draft.time !== '';
  const arrival = isTravel ? TRANSIT_ARRIVAL[draft.quickField as TransitType] : undefined;
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const lastDayWithBuffer = dayCount + MAX_DAYS_OUTSIDE_TRIP - 1;
  const startZone = draft.timezone ?? trip.timezone;
  const endZone = draft.endTimezone ?? startZone;
  const startDayAt = trip.startDate + (draft.dayIndex ?? 0) * 86_400_000;
  const endDayAt = trip.startDate + (draft.endDayIndex ?? draft.dayIndex ?? 0) * 86_400_000;

  const updateDraft = (changes: Partial<EventDraft>) =>
    setDraft((current) => ({ ...current, ...changes }));

  // Moving the start keeps the same start->end window by shifting the end by the same delta.
  const updateStart = (nextDayIndex: number | null, nextTime: string) => {
    const applyChanges = (changes: Partial<EventDraft>) =>
      updateDraft({
        ...(draft.eventType === 'DINING' && !draft.isMealTouched
          ? { quickField: getMealForTime(nextTime) }
          : {}),
        ...getShiftedArriveBy(draft, nextTime),
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
      max: nextDayIndex <= lastDayWithBuffer ? { day: lastDayWithBuffer, time: '23:59' } : undefined,
    });
    applyChanges({
      dayIndex: nextDayIndex,
      time: nextTime,
      endDayIndex: nextEnd.day,
      endTime: nextEnd.time,
    });
  };

  const selectEventType = (eventType: EventType) => {
    const isNewEvent = !event && !prefill && !legFrom;
    const becomesTravel =
      eventType === 'TRAVEL' && isNewEvent && draft.attendeeTargetType === 'EVERYONE_INCLUDING_FUTURE';
    const leavesTravel = eventType !== 'TRAVEL' && draft.isAttendeeAuto;
    updateDraft({
      eventType,
      quickField: getDefaultSubtype(eventType, draft.time),
      isMealTouched: false,
      isGrouped: false,
      groupLabel: '',
      ...(becomesTravel
        ? {
            isAttendeeAuto: true,
            attendeeTargetType: 'SPECIFIC_MEMBERS' as const,
            assignedMemberIds: [currentUserId],
          }
        : {}),
      ...(leavesTravel
        ? {
            isAttendeeAuto: false,
            attendeeTargetType: 'EVERYONE_INCLUDING_FUTURE' as const,
            assignedMemberIds: [],
          }
        : {}),
    });
  };

  const setStartZone = (zone: string) =>
    updateDraft({ timezone: zone === trip.timezone ? null : zone });
  const setEndZone = (zone: string) =>
    updateDraft({ endTimezone: zone === (draft.timezone ?? trip.timezone) ? null : zone });

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

  // An airport knows its own zone, so a flight lands in the right one without anyone looking it up.
  const handleDepartureAirport = (airport: AirportOption) => {
    void fillLocationFromAirport(airport);
    if (isRelative && airport.timezone) {
      setStartZone(airport.timezone);
    }
  };
  const handleArrivalAirport = (airport: AirportOption) => {
    if (isRelative && airport.timezone) {
      setDraft((current) => {
        const suggested = fromDayMinutes(toDayMinutes(current.dayIndex ?? 0, current.time) + 60);
        return {
          ...current,
          hasEndTime: true,
          endDayIndex: current.hasEndTime ? current.endDayIndex : suggested.day,
          endTime: current.hasEndTime && current.endTime ? current.endTime : suggested.time,
          endTimezone: airport.timezone === (current.timezone ?? trip.timezone) ? null : airport.timezone,
        };
      });
    }
  };

  const timeFields = buildEventTimeFields(trip, {
    dayIndex: draft.dayIndex,
    endDayIndex: draft.endDayIndex,
    startTime: draft.time,
    endTime: draft.hasEndTime ? draft.endTime : null,
    timezone: draft.timezone,
    endTimezone: draft.endTimezone,
  });

  const getTimeError = () => {
    if (!draft.time || (draft.dayIndex === null && !isRelative)) {
      return 'Pick a day and a start time.';
    }
    if (canArriveEarly && draft.hasArriveBy) {
      if (!draft.arriveByTime) {
        return 'Pick an arrival time, or remove it.';
      }
      if (draft.arriveByTime >= draft.time) {
        return 'The arrival needs to be before the start time.';
      }
    }
    if (!draft.hasEndTime) {
      return null;
    }
    if (!draft.endTime) {
      return 'Pick an end time, or remove it.';
    }
    const resolved = timeFields ? getEventTime(trip, timeFields) : null;
    if (resolved?.startMs != null && resolved.endMs != null) {
      return resolved.endMs > resolved.startMs ? null : 'The end needs to come after the start.';
    }
    const isSameDay = (draft.endDayIndex ?? draft.dayIndex) === draft.dayIndex;
    return isSameDay && draft.endTime <= draft.time ? 'The end needs to come after the start.' : null;
  };
  const timeError = getTimeError();

  const canLinkBookings = BOOKING_TRACKED_EVENT_TYPES.includes(draft.eventType) && bookingChoices.length > 0;

  const handleSubmit = async (addLeg = false) => {
    if (!timeFields || timeError) {
      setError(timeError ?? 'Choose a valid day and start time.');
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
        arriveByTime: canArriveEarly && draft.hasArriveBy ? draft.arriveByTime || null : null,
        arriveByNote: canArriveEarly && draft.hasArriveBy && draft.arriveByTime ? draft.arriveByNote.trim() || null : null,
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
      }, { addLeg, arrivalPlace, bookings: canLinkBookings && (bookingItemIds !== null || initialBookingIds.length > 0) ? { picked: bookingItemIds ?? [], initial: initialBookingIds } : undefined });
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
        toDayMinutes(timeFields.dayIndex, canArriveEarly && draft.hasArriveBy && draft.arriveByTime ? draft.arriveByTime : draft.time) -
          draft.reminderMinutesBefore,
      );
      return formatClockTime(time);
    }

    const startMs = getEventTime(trip, timeFields).startMs;
    return startMs === null ? null : formatTime(startMs - draft.reminderMinutesBefore * 60_000);
  };
  const reminderText = getReminderText();

  const isLinkable = LINK_ATTACHABLE_EVENT_TYPES.includes(draft.eventType);
  const isPlaceEvent = draft.eventType === 'DINING' || draft.eventType === 'ACTIVITY';
  const attendeesLabel = isTravel ? "Who's traveling" : "Who's coming";
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
    { key: 'bookings', label: 'Bookings', icon: <Ticket className='h-4 w-4' />, isShown: !canLinkBookings || bookingItemIds !== null },
    {
      key: 'reminder',
      label: 'Reminder',
      icon: <Bell className='h-4 w-4' />,
      isShown: draft.dayIndex === null || (draft.hasReminderOverride && draft.reminderEnabled),
    },
  ].filter((chip) => !chip.isShown);

  const revealDetail = (key: string) =>
    key === 'bookings' ? setBookingItemIds(initialBookingIds) : updateDraft(
      {
        title: { hasTitle: true },
        link: { hasLink: true },
        cuisines: { hasCuisines: true },
        settings: { hasSettings: true },
        location: { hasLocation: true },
        address: { hasAddress: true },
        group: { isGrouped: true },
        reminder: { hasReminderOverride: true, reminderEnabled: true },
        venueHours: { hasVenueHours: true },
      }[key] ?? {},
    );

  const locationField = (label: string) => (
    <div className='space-y-4'>
      <PlaceAutocompleteInput
        label={label}
        quickSearch={{ label: 'Search by title', value: draft.hasTitle ? draft.title : '' }}
        placeholder={isTravel ? (TRANSIT_PLACE_PLACEHOLDERS[draft.quickField as TransitType] ?? 'Pike Place Market') : 'Ichiran Shibuya'}
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
      {isTravel && TRANSIT_LOCATION_LABELS[transitType] !== null && (
        <ItineraryPlacePicks
          current={{ name: draft.locationName, address: draft.address }}
          excludeEventId={event?.id}
          onPick={(pick) =>
            updateDraft({
              locationName: pick.name,
              address: pick.address,
              hasAddress: true,
              latitude: pick.latitude,
              longitude: pick.longitude,
              place: pick.place,
            })
          }
        />
      )}
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
  const attendeeChoice: EventAttendeeTargetType | 'ME' =
    draft.attendeeTargetType === 'SPECIFIC_MEMBERS' &&
    !draft.isPickingPeople &&
    draft.assignedMemberIds.length === 1 &&
    draft.assignedMemberIds[0] === currentUserId
      ? 'ME'
      : draft.attendeeTargetType;

  const chooseAttendees = (choice: EventAttendeeTargetType | 'ME') =>
    updateDraft({
      isAttendeeAuto: false,
      isPickingPeople: choice === 'SPECIFIC_MEMBERS',
      attendeeTargetType: choice === 'ME' ? 'SPECIFIC_MEMBERS' : choice,
      assignedMemberIds:
        choice === 'ME'
          ? [currentUserId]
          : choice === 'SPECIFIC_MEMBERS'
            ? draft.assignedMemberIds
            : [],
    });

  // Turning an end on starts it an hour after the start (a quick default, never left blank).
  const startEndTime = () => {
    const suggested = fromDayMinutes(toDayMinutes(draft.dayIndex ?? 0, draft.time) + 60);
    updateDraft({
      hasEndTime: true,
      endDayIndex: suggested.day,
      endTime: draft.endTime || suggested.time,
    });
  };

  const endFields = (
    <div className='space-y-2'>
      <div className='grid gap-3 sm:grid-cols-2'>
        <Select
          options={getDayChoices(trip, draft.endDayIndex, false)}
          value={String(draft.endDayIndex ?? draft.dayIndex)}
          onChange={(value) => updateDraft({ endDayIndex: Number(value) })}
        />
        <Input
          type='time'
          aria-label='End time'
          value={draft.endTime}
          onChange={(changeEvent) => updateDraft({ endTime: changeEvent.target.value })}
        />
      </div>
      {isRelative && endZone && (
        <ZoneField
          label={arrival ? arrival.zoneLabel : 'Ends in'}
          zone={endZone}
          at={endDayAt}
          isTripDefault={false}
          onChange={setEndZone}
        />
      )}
      {isRelative && draft.endTimezone !== null && (
        <p className='text-muted-foreground text-xs'>
          {formatTimezoneAbbreviation(startZone ?? endZone ?? '', startDayAt)} to{' '}
          {formatTimezoneAbbreviation(endZone ?? '', endDayAt)}: the clock times are each in their own zone.
        </p>
      )}
    </div>
  );

  const addAnotherFlightButton = isTravel && transitType === 'FLIGHT' && (
    <Button
      type='button'
      variant='tertiary'
      className='max-sm:w-full'
      disabled={isSubmitting || timeError !== null}
      onClick={() => void handleSubmit(true)}
    >
      Add another flight
    </Button>
  );

  return (
    <FormScreen isOpen={isOpen} onClose={onClose} title='Timeline event'>
      <div className='space-y-5'>
        {legFrom && (
          <p className='text-muted-foreground text-xs'>
            Next leg of {legFrom.previous.groupLabel ?? 'this flight'}: the airline, booking and travelers carry over.
          </p>
        )}
        <div className='space-y-3'>
          <PillRow label='Event type'>
            {EVENT_TYPES.map((type) => (
              <Pill
                key={type}
                emoji={EVENT_TYPE_EMOJIS[type]}
                isSelected={draft.eventType === type}
                onClick={() => selectEventType(type)}
              >
                {EVENT_TYPE_LABELS[type]}
              </Pill>
            ))}
          </PillRow>
          {isTravel && (
            <PillRow label='Transit type'>
              {TRANSIT_TYPES.map((type) => (
                <Pill
                  key={type}
                  emoji={TRANSIT_TYPE_EMOJIS[type]}
                  isSelected={draft.quickField === type}
                  onClick={() => updateDraft({ quickField: type })}
                >
                  {TRANSIT_TYPE_LABELS[type]}
                </Pill>
              ))}
            </PillRow>
          )}
          {draft.eventType === 'DINING' && (
            <PillRow label='Meal'>
              {MEAL_TYPES.map((meal) => (
                <Pill
                  key={meal}
                  emoji={MEAL_TYPE_EMOJIS[meal]}
                  isSelected={draft.quickField === meal}
                  onClick={() => updateDraft({ quickField: meal, isMealTouched: true })}
                >
                  {MEAL_TYPE_LABELS[meal]}
                </Pill>
              ))}
            </PillRow>
          )}
        </div>
        {isTravel && draft.quickField === 'FLIGHT' && !event && !legFrom && isRelative && (
          <UploadAutofill
            kind='flight'
            trip={trip}
            noun='flight confirmation'
            convert={(extracted, { airports, airlines }) => {
              const result = flightToPrefill(trip, currentUserId, extracted, airports, airlines);
              if (!result) {
                return null;
              }
              const note =
                result.extraFlights > 0
                  ? `Found ${result.extraFlights} more ${result.extraFlights === 1 ? 'flight' : 'flights'} on it. This fills the first; add the rest after you save.`
                  : undefined;
              return { ...result, note };
            }}
            onFilled={({ value }) =>
              setDraft((current) => ({
                ...getPrefilledDraft(trip, value),
                title: current.title,
                hasTitle: current.hasTitle,
                linkUrl: current.linkUrl,
                linkPreview: current.linkPreview,
                linkKind: current.linkKind,
                hasLink: current.hasLink,
                groupLabel: current.groupLabel,
                isGrouped: current.isGrouped,
              }))
            }
          />
        )}

        <SectionDivider label='When' />
        <div className='space-y-2'>
          <Label>{isTravel ? 'Departs' : 'Starts'}</Label>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Select
              options={getDayChoices(trip, draft.dayIndex, isRelative)}
              value={draft.dayIndex === null ? NO_DAY_VALUE : String(draft.dayIndex)}
              onChange={(value) => updateStart(value === NO_DAY_VALUE ? null : Number(value), draft.time)}
            />
            <Input
              type='time'
              aria-label='Start time'
              value={draft.time}
              onChange={(changeEvent) => updateStart(draft.dayIndex, changeEvent.target.value)}
            />
          </div>
          {isRelative && startZone && (
            <ZoneField
              label={draft.hasEndTime ? 'Leaves in' : 'In'}
              zone={startZone}
              at={startDayAt}
              isTripDefault={draft.timezone === null}
              onChange={setStartZone}
            />
          )}
        </div>
        {draft.dayIndex === null ? null : arrival ? (
          <div className='space-y-3'>
            <div className='space-y-2'>
              <Label>
                {arrival.emoji} {arrival.question}
              </Label>
              <PillGroup
                label='Arrival time'
                options={[
                  { value: 'yes', label: 'Yes, I know' },
                  { value: 'no', label: 'Not yet' },
                ]}
                value={draft.hasEndTime ? 'yes' : 'no'}
                onChange={(value) =>
                  value === 'yes' ? startEndTime() : updateDraft({ hasEndTime: false, endDayIndex: draft.dayIndex, endTime: '', endTimezone: null })
                }
              />
            </div>
            {draft.hasEndTime && endFields}
          </div>
        ) : draft.hasEndTime ? (
          <RemovableField
            label='Ends'
            removeLabel='Remove end time'
            onRemove={() =>
              updateDraft({
                hasEndTime: false,
                endDayIndex: draft.dayIndex,
                endTime: '',
                endTimezone: null,
              })
            }
          >
            {endFields}
          </RemovableField>
        ) : (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto px-0! py-0!'
            onClick={startEndTime}
          >
            + Add end time
          </Button>
        )}

        {canArriveEarly && draft.hasArriveBy ? (
          <RemovableField
            label='Arrive by'
            removeLabel='Remove arrival time'
            onRemove={() => updateDraft({ hasArriveBy: false, arriveByTime: '', arriveByNote: '' })}
          >
            <div className='space-y-3'>
              <Input
                type='time'
                aria-label='Arrival time'
                value={draft.arriveByTime}
                onChange={(changeEvent) => updateDraft({ arriveByTime: changeEvent.target.value })}
              />
              <p
                className={join(
                  'text-xs',
                  draft.arriveByTime && draft.time && draft.arriveByTime >= draft.time ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {draft.arriveByTime && draft.time && draft.arriveByTime >= draft.time
                  ? `The arrival needs to be before the start time, ${formatClockTime(draft.time)}.`
                  : `Starts at ${draft.time ? formatClockTime(draft.time) : 'the start time'}. Arrive before that.`}
              </p>
              <Input
                aria-label='Why arrive early'
                placeholder='Why? Parking fills up early'
                maxLength={500}
                value={draft.arriveByNote}
                onChange={(changeEvent) => updateDraft({ arriveByNote: changeEvent.target.value })}
              />
            </div>
          </RemovableField>
        ) : (
          canArriveEarly && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto px-0! py-0!'
              onClick={() => updateDraft({ hasArriveBy: true, arriveByTime: draft.arriveByTime || getSuggestedArriveBy(draft.time) })}
            >
              + Add arrival time
            </Button>
          )
        )}

        {isTravel && (
          <TransitDetailsFields
            transitType={transitType}
            value={draft.transit}
            onChange={(transit) => updateDraft({ transit })}
            onDepartureAirportPicked={handleDepartureAirport}
            onArrivalAirportPicked={handleArrivalAirport}
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
            <SectionDivider label='Where' />
            {locationField('Location')}
          </>
        )}
        {draft.eventType === 'FREE_TIME' && draft.hasLocation && (
          <>
            <SectionDivider label='Where' />
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

        <div className='space-y-2'>
          <SectionDivider label={attendeesLabel} />
          <PillRow label={attendeesLabel}>
            {ATTENDEE_CHOICES.map((choice) => (
              <Pill
                key={choice.type}
                emoji={choice.emoji}
                isSelected={attendeeChoice === choice.type}
                onClick={() => chooseAttendees(choice.type)}
              >
                {choice.label}
              </Pill>
            ))}
          </PillRow>
          {draft.attendeeTargetType === 'SPECIFIC_MEMBERS' && attendeeChoice !== 'ME' && (
            <MultiPillGroup
              label='People'
              options={memberOptions.map((member) => ({ value: member.value, label: member.label }))}
              values={draft.assignedMemberIds}
              onChange={(assignedMemberIds) => updateDraft({ assignedMemberIds })}
            />
          )}
          <p className='text-muted-foreground text-xs'>
            Your Overview shows only the events you&apos;re part of.
          </p>
        </div>
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
              onChange={(changeEvent) => updateDraft({ title: changeEvent.target.value })}
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
              <PillRow label='Link type'>
                {EVENT_LINK_KINDS_BY_TYPE[draft.eventType].map((kind) => (
                  <Pill
                    key={kind}
                    isSelected={(draft.linkKind ?? EVENT_LINK_KINDS_BY_TYPE[draft.eventType][0]) === kind}
                    onClick={() => updateDraft({ linkKind: kind })}
                  >
                    {EVENT_LINK_KIND_LABELS[kind]}
                  </Pill>
                ))}
              </PillRow>
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
              onChange={(changeEvent) => updateDraft({ cuisines: changeEvent.target.value })}
            />
          </RemovableField>
        )}
        {draft.isGrouped && (
          <RemovableField
            label='Group'
            removeLabel='Remove from group'
            onRemove={() => updateDraft({ isGrouped: false, groupLabel: '' })}
          >
            <PickOrCreate
              label='Group'
              options={sameTypeGroupLabels.map((groupLabel) => ({ value: groupLabel, label: groupLabel }))}
              choice={
                sameTypeGroupLabels.find((groupLabel) => normalizeLabel(groupLabel) === normalizeLabel(draft.groupLabel)) ??
                (draft.groupLabel === '' ? '' : NEW_CHOICE)
              }
              newText={draft.groupLabel}
              newPillLabel='New group'
              newPlaceholder={isTravel ? 'Flights to Lisbon' : 'Group name'}
              onChange={(choice, newText) => updateDraft({ groupLabel: choice === NEW_CHOICE ? newText : choice })}
            />
          </RemovableField>
        )}
        {draft.dayIndex !== null && draft.hasReminderOverride && draft.reminderEnabled && (
          <RemovableField
            label='Reminder'
            removeLabel="Don't remind me"
            onRemove={() =>
              updateDraft({
                hasReminderOverride: false,
                reminderEnabled: false,
                reminderMinutesBefore: DEFAULT_REMINDER_MINUTES_BEFORE,
              })
            }
          >
            <div className='flex items-center gap-2'>
              <Select
                className='flex-1'
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
            <PillRow label='Indoor or outdoor'>
              {(Object.keys(ACTIVITY_SETTING_LABELS) as ActivitySetting[]).map((setting) => (
                <Pill
                  key={setting}
                  emoji={setting === 'INDOOR' ? '🏛️' : '🌲'}
                  isSelected={draft.settings.includes(setting)}
                  onClick={() =>
                    updateDraft({
                      settings: draft.settings.includes(setting)
                        ? draft.settings.filter((existing) => existing !== setting)
                        : [...draft.settings, setting],
                    })
                  }
                >
                  {ACTIVITY_SETTING_LABELS[setting]}
                </Pill>
              ))}
            </PillRow>
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
                onChange={(changeEvent) => updateDraft({ venueOpenTime: changeEvent.target.value })}
              />
              <Input
                type='time'
                aria-label='Closes at'
                value={draft.venueCloseTime}
                onChange={(changeEvent) => updateDraft({ venueCloseTime: changeEvent.target.value })}
              />
            </div>
          </RemovableField>
        )}
        {canLinkBookings && bookingItemIds !== null && (
          <RemovableField label='Bookings' removeLabel='Remove bookings' onRemove={() => setBookingItemIds(null)}>
            <div className='space-y-2'>
              <MultiPillGroup
                label='To-dos for this event'
                options={bookingChoices.map((item) => ({
                  value: item.id,
                  label: item.isCompleted ? `✓ ${item.title}` : item.title,
                }))}
                values={bookingItemIds}
                onChange={setBookingItemIds}
              />
              <p className='text-muted-foreground text-xs'>
                Pick what needs doing before this event. Unpicking one only unlinks it; it stays on your checklist.
              </p>
            </div>
          </RemovableField>
        )}
        <AddFieldChips heading='Add to this event' chips={detailChips} onAdd={revealDetail} />

        {(error ?? timeError) && (
          <p className='text-destructive text-sm'>{error ?? timeError}</p>
        )}
        {isPhone && addAnotherFlightButton}
        <ModalFooterActions
          leftActions={
            event &&
            onDelete && (
              <DeleteIconButton onClick={() => void handleDelete()} disabled={isSubmitting} />
            )
          }
          cancelAction={
              <Button type='button' variant='secondary' onClick={onClose}>
                Cancel
              </Button>
          }
          rightActions={
            <>
              {!isPhone && addAnotherFlightButton}
              <Button
                type='button'
                loading={isSubmitting}
                disabled={isSubmitting || timeError !== null}
                onClick={() => void handleSubmit()}
              >
                {isSubmitting ? 'Saving…' : event ? 'Save' : 'Add'}
              </Button>
            </>
          }
        />
      </div>
    </FormScreen>
  );
}

export default EventFormModal;
