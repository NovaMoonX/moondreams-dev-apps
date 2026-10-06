import {
  fromLocalDateAndTimeInputValues,
  getEndOfLocalDay,
  toLocalTimeInputValue,
} from '@/utils/dateInputUtils';
import { getDayCount, getDayDateLabel, getDayInputValue } from '@/utils/dateRangeUtils';
import { formatClockTime, formatDateTime } from '@/utils/formatUtils';
import {
  formatTimezoneAbbreviation,
  formatTimezoneLabel,
  zonedDateTimeToEpoch,
} from '@/utils/timezoneUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import type {
  EventSuggestion,
  Rental,
  Stay,
  TimelineEvent,
  TripSpace,
  TripTimeModel,
} from '@apps/waypoint/types';

const DAY_MS = 86_400_000;

export function getTimeModel(trip: TripSpace): TripTimeModel {
  return trip.timeModel ?? 'ABSOLUTE';
}

/** Today's day number while the trip is on, otherwise its first day: where a new item most likely belongs. */
export function getDefaultDayIndex(trip: TripSpace, now: number = Date.now()) {
  const today = Math.floor((now - trip.startDate) / DAY_MS);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  return today >= 0 && today < dayCount ? today : 0;
}

export function isRelativeTrip(trip: TripSpace) {
  return getTimeModel(trip) === 'RELATIVE';
}

export function getEffectiveTimezone(trip: TripSpace, override: string | null | undefined) {
  return override ?? trip.timezone ?? null;
}

/** For "now" comparisons and reminders only — relative times are never displayed through an instant. */
export function toTripMoment(
  trip: TripSpace,
  dayIndex: number,
  time: string,
  timezone: string | null = null,
) {
  const date = getDayInputValue(trip.startDate, dayIndex);
  const zone = getEffectiveTimezone(trip, timezone);
  if (!zone) {
    return fromLocalDateAndTimeInputValues(date, time) ?? null;
  }

  try {
    return zonedDateTimeToEpoch(date, time, zone);
  } catch {
    return fromLocalDateAndTimeInputValues(date, time) ?? null;
  }
}

/** A day within the trip or its few days of buffer on either side, which is as far out as a time can be placed. */
function isInTripRange(trip: TripSpace, dayIndex: number | null): dayIndex is number {
  const result =
    dayIndex !== null &&
    dayIndex >= -MAX_DAYS_OUTSIDE_TRIP &&
    dayIndex < getDayCount(trip.startDate, trip.endDate) + MAX_DAYS_OUTSIDE_TRIP;
  return result;
}

export interface ResolvedEventTime {
  dayIndex: number | null;
  endDayIndex: number | null;
  startTime: string | null;
  endTime: string | null;
  /** The zone the start is in. */
  timezone: string | null;
  /** The zone the end is in: the start's own unless the event overrides it. */
  endTimezone: string | null;
  /** Real instants; `null` when the event has no day or sits outside the trip's dates. */
  startMs: number | null;
  endMs: number | null;
  /** The explicit end, or the end of the event's own day when it has none. */
  impliedEndMs: number | null;
}

export type EventTimeSource = Pick<
  TimelineEvent,
  'dayIndex' | 'endDayIndex' | 'startAt' | 'endAt' | 'startTime' | 'endTime' | 'timezone'
> &
  Partial<Pick<TimelineEvent, 'endTimezone'>>;

export function getEventTime(trip: TripSpace, event: EventTimeSource): ResolvedEventTime {
  if (!isRelativeTrip(trip)) {
    const startAt = event.startAt ?? null;
    const endAt = event.endAt ?? null;
    return {
      dayIndex: event.dayIndex ?? null,
      endDayIndex: event.endDayIndex ?? event.dayIndex ?? null,
      startTime: toLocalTimeInputValue(startAt) || null,
      endTime: toLocalTimeInputValue(endAt) || null,
      timezone: null,
      endTimezone: null,
      startMs: startAt,
      endMs: endAt,
      impliedEndMs: endAt ?? (startAt === null ? null : getEndOfLocalDay(startAt)),
    };
  }

  const dayIndex = event.dayIndex ?? null;
  const endDayIndex = event.endDayIndex ?? dayIndex;
  const startTime = event.startTime ?? null;
  const endTime = event.endTime ?? null;
  const timezone = getEffectiveTimezone(trip, event.timezone);
  const endTimezone = getEffectiveTimezone(trip, event.endTimezone ?? event.timezone);
  const isTimed = isInTripRange(trip, dayIndex) && startTime !== null;
  const startMs = isTimed ? toTripMoment(trip, dayIndex, startTime, timezone) : null;
  const endMs =
    isTimed && endTime !== null && endDayIndex !== null
      ? toTripMoment(trip, endDayIndex, endTime, endTimezone)
      : null;
  const impliedEndMs = isTimed ? (endMs ?? toTripMoment(trip, dayIndex + 1, '00:00', timezone)) : null;

  return { dayIndex, endDayIndex, startTime, endTime, timezone, endTimezone, startMs, endMs, impliedEndMs };
}

export interface DayTimeValue {
  dayIndex: number | null;
  time: string | null;
}

export interface ResolvedStayTime {
  checkIn: DayTimeValue;
  checkOut: DayTimeValue;
  plannedArrival: DayTimeValue;
  plannedDeparture: DayTimeValue;
  timezone: string | null;
  /** Real instants; `null` when that point has no day/time or is outside the trip's dates. */
  checkInMs: number | null;
  checkOutMs: number | null;
}

/** Whole UTC days between the trip's start and an absolute timestamp — how legacy stays map onto trip days. */
function getAbsoluteDayIndex(trip: TripSpace, timestamp: number | null) {
  return timestamp === null ? null : Math.floor((timestamp - trip.startDate) / DAY_MS);
}

export type StayTimeSource = Pick<
  Stay,
  | 'checkInAt'
  | 'checkOutAt'
  | 'plannedArrivalAt'
  | 'plannedDepartureAt'
  | 'checkInTimezone'
  | 'checkInDayIndex'
  | 'checkInTime'
  | 'checkOutDayIndex'
  | 'checkOutTime'
  | 'plannedArrivalDayIndex'
  | 'plannedArrivalTime'
  | 'plannedDepartureDayIndex'
  | 'plannedDepartureTime'
>;

export function getStayTime(trip: TripSpace, stay: StayTimeSource): ResolvedStayTime {
  if (!isRelativeTrip(trip)) {
    const absolute = (timestamp: number | null | undefined): DayTimeValue => ({
      dayIndex: getAbsoluteDayIndex(trip, timestamp ?? null),
      time: toLocalTimeInputValue(timestamp ?? null) || null,
    });
    return {
      checkIn: absolute(stay.checkInAt),
      checkOut: absolute(stay.checkOutAt),
      plannedArrival: absolute(stay.plannedArrivalAt ?? stay.checkInAt),
      plannedDeparture: absolute(stay.plannedDepartureAt ?? stay.checkOutAt),
      timezone: stay.checkInTimezone ?? null,
      checkInMs: stay.checkInAt ?? null,
      checkOutMs: stay.checkOutAt ?? null,
    };
  }

  const timezone = getEffectiveTimezone(trip, stay.checkInTimezone);
  const relative = (dayIndex: number | null | undefined, time: string | null | undefined) => ({
    dayIndex: dayIndex ?? null,
    time: time ?? null,
  });
  const checkIn = relative(stay.checkInDayIndex, stay.checkInTime);
  const checkOut = relative(stay.checkOutDayIndex, stay.checkOutTime);
  const toMs = ({ dayIndex, time }: DayTimeValue) =>
    isInTripRange(trip, dayIndex) && time !== null
      ? toTripMoment(trip, dayIndex, time, timezone)
      : null;

  return {
    checkIn,
    checkOut,
    plannedArrival: relative(
      stay.plannedArrivalDayIndex ?? stay.checkInDayIndex,
      stay.plannedArrivalTime ?? stay.checkInTime,
    ),
    plannedDeparture: relative(
      stay.plannedDepartureDayIndex ?? stay.checkOutDayIndex,
      stay.plannedDepartureTime ?? stay.checkOutTime,
    ),
    timezone,
    checkInMs: toMs(checkIn),
    checkOutMs: toMs(checkOut),
  };
}

export type RentalTimeSource = Pick<
  Rental,
  'pickupDayIndex' | 'pickupTime' | 'returnDayIndex' | 'returnTime' | 'timezone'
>;

export interface ResolvedRentalTime {
  /** Real instants; `null` when that point sits outside the trip's dates. */
  pickupMs: number | null;
  returnMs: number | null;
}

export function getRentalTime(trip: TripSpace, rental: RentalTimeSource): ResolvedRentalTime {
  const timezone = getEffectiveTimezone(trip, rental.timezone);
  const toMs = (dayIndex: number, time: string) =>
    isInTripRange(trip, dayIndex) ? toTripMoment(trip, dayIndex, time, timezone) : null;

  return {
    pickupMs: toMs(rental.pickupDayIndex, rental.pickupTime),
    returnMs: toMs(rental.returnDayIndex, rental.returnTime),
  };
}

export type EventTimeFields = Pick<
  TimelineEvent,
  'dayIndex' | 'endDayIndex' | 'startAt' | 'endAt' | 'startTime' | 'endTime' | 'timezone' | 'endTimezone'
>;

export interface EventTimeDraft {
  dayIndex: number | null;
  endDayIndex: number | null;
  startTime: string;
  endTime: string | null;
  timezone: string | null;
  /** `null` keeps the end in the start's zone. */
  endTimezone: string | null;
}

/** `null` when a legacy draft has no day to build a timestamp from. */
export function buildEventTimeFields(trip: TripSpace, draft: EventTimeDraft): EventTimeFields | null {
  if (isRelativeTrip(trip)) {
    const hasEnd = draft.endTime !== null && draft.dayIndex !== null;
    return {
      dayIndex: draft.dayIndex,
      endDayIndex: draft.dayIndex === null ? null : hasEnd ? (draft.endDayIndex ?? draft.dayIndex) : draft.dayIndex,
      startAt: null,
      endAt: null,
      startTime: draft.startTime,
      endTime: hasEnd ? draft.endTime : null,
      timezone: draft.timezone,
      endTimezone: hasEnd && draft.endTimezone !== draft.timezone ? draft.endTimezone : null,
    };
  }

  if (draft.dayIndex === null) {
    return null;
  }

  const startAt =
    fromLocalDateAndTimeInputValues(getDayInputValue(trip.startDate, draft.dayIndex), draft.startTime) ?? null;
  if (startAt === null) {
    return null;
  }

  const endDayIndex = draft.endDayIndex ?? draft.dayIndex;
  const endAt =
    draft.endTime === null
      ? null
      : (fromLocalDateAndTimeInputValues(getDayInputValue(trip.startDate, endDayIndex), draft.endTime) ?? null);

  return {
    dayIndex: draft.dayIndex,
    endDayIndex: draft.endTime === null ? draft.dayIndex : Math.max(draft.dayIndex, endDayIndex),
    startAt,
    endAt,
    startTime: null,
    endTime: null,
    timezone: null,
    endTimezone: null,
  };
}

export type StayTimeFields = Pick<
  Stay,
  | 'checkInAt'
  | 'checkOutAt'
  | 'plannedArrivalAt'
  | 'plannedDepartureAt'
  | 'checkInDayIndex'
  | 'checkInTime'
  | 'checkOutDayIndex'
  | 'checkOutTime'
  | 'plannedArrivalDayIndex'
  | 'plannedArrivalTime'
  | 'plannedDepartureDayIndex'
  | 'plannedDepartureTime'
>;

export interface StayTimeDraft {
  checkIn: { dayIndex: number; time: string };
  checkOut: { dayIndex: number; time: string };
  plannedArrival: { dayIndex: number; time: string };
  plannedDeparture: { dayIndex: number; time: string };
}

/** The four day + time points of a relative-trip stay. Legacy stays keep the date-picker form
 * and its own timestamp building, so there is no absolute counterpart here. */
export function buildStayTimeFields(draft: StayTimeDraft): StayTimeFields {
  return {
    checkInAt: null,
    checkOutAt: null,
    plannedArrivalAt: null,
    plannedDepartureAt: null,
    checkInDayIndex: draft.checkIn.dayIndex,
    checkInTime: draft.checkIn.time,
    checkOutDayIndex: draft.checkOut.dayIndex,
    checkOutTime: draft.checkOut.time,
    plannedArrivalDayIndex: draft.plannedArrival.dayIndex,
    plannedArrivalTime: draft.plannedArrival.time,
    plannedDepartureDayIndex: draft.plannedDeparture.dayIndex,
    plannedDepartureTime: draft.plannedDeparture.time,
  };
}

export type ZoneStyle = 'short' | 'long';

const formatZone = (zone: string, style: ZoneStyle, at: number | null) =>
  style === 'long' ? formatTimezoneLabel(zone) : formatTimezoneAbbreviation(zone, at ?? undefined);

export function formatEventTimeRange(
  trip: TripSpace,
  event: EventTimeSource,
  zoneStyle: ZoneStyle = 'short',
) {
  const { dayIndex, endDayIndex, startTime, endTime, timezone, endTimezone, startMs, endMs } = getEventTime(
    trip,
    event,
  );
  if (!startTime) {
    return '';
  }

  const isRelative = isRelativeTrip(trip);
  const hasOwnEndZone = isRelative && endTime !== null && endTimezone !== timezone;
  const endsOnAnotherDay = dayIndex !== null && endDayIndex !== null && endDayIndex !== dayIndex;
  const endDay =
    endsOnAnotherDay && endDayIndex !== null
      ? `${endDayIndex >= 0 ? `Day ${endDayIndex + 1}` : getDayDateLabel(trip.startDate, endDayIndex)} `
      : '';
  const startZone =
    isRelative && timezone && (hasOwnEndZone || timezone !== trip.timezone)
      ? ` ${formatZone(timezone, zoneStyle, startMs)}`
      : '';
  const endZone = hasOwnEndZone && endTimezone ? ` ${formatZone(endTimezone, zoneStyle, endMs)}` : '';
  const end = endTime ? ` - ${endDay}${formatClockTime(endTime)}${endZone}` : '';
  const result = hasOwnEndZone
    ? `${formatClockTime(startTime)}${startZone}${end}`
    : `${formatClockTime(startTime)}${end}${startZone ? ` ·${startZone}` : ''}`;
  return result;
}

function formatDayTime(trip: TripSpace, point: DayTimeValue) {
  if (point.dayIndex === null || !point.time) {
    return '';
  }
  return `${getDayDateLabel(trip.startDate, point.dayIndex)}, ${formatClockTime(point.time)}`;
}

export function formatRentalTimeRange(trip: TripSpace, rental: RentalTimeSource) {
  const pickup = { dayIndex: rental.pickupDayIndex, time: rental.pickupTime };
  const returned = { dayIndex: rental.returnDayIndex, time: rental.returnTime };
  return `${formatDayTime(trip, pickup)} - ${formatDayTime(trip, returned)}`;
}

/** Only an override that differs from the trip's own zone is worth showing. */
export function getRentalTimezoneLabel(
  trip: TripSpace,
  rental: RentalTimeSource,
  zoneStyle: ZoneStyle = 'short',
  at: number | null = null,
) {
  const zone = rental.timezone;
  if (!zone || zone === trip.timezone) {
    return null;
  }
  return formatZone(zone, zoneStyle, at ?? getRentalTime(trip, rental).pickupMs);
}

export function formatStayTimeRange(trip: TripSpace, stay: StayTimeSource) {
  if (!isRelativeTrip(trip)) {
    const { checkInAt, checkOutAt } = stay;
    return checkInAt !== null && checkOutAt !== null
      ? `${formatDateTime(checkInAt)} - ${formatDateTime(checkOutAt)}`
      : '';
  }

  const { checkIn, checkOut } = getStayTime(trip, stay);
  return `${formatDayTime(trip, checkIn)} - ${formatDayTime(trip, checkOut)}`;
}

/** The stay's own zone label — always for legacy stays, only an override for relative ones. */
export function getStayTimezoneLabel(
  trip: TripSpace,
  stay: StayTimeSource,
  zoneStyle: ZoneStyle = 'short',
) {
  const zone = stay.checkInTimezone;
  if (!zone || (isRelativeTrip(trip) && zone === trip.timezone)) {
    return null;
  }
  return formatZone(zone, zoneStyle, getStayTime(trip, stay).checkInMs);
}

export function formatSuggestedTime(
  trip: TripSpace,
  suggestion: Pick<EventSuggestion, 'suggestedStartAt' | 'suggestedDayIndex' | 'suggestedStartTime'>,
) {
  if (!isRelativeTrip(trip)) {
    return suggestion.suggestedStartAt === null ? '' : formatDateTime(suggestion.suggestedStartAt);
  }

  return formatDayTime(trip, {
    dayIndex: suggestion.suggestedDayIndex ?? null,
    time: suggestion.suggestedStartTime ?? null,
  });
}

export function formatEventStartTime(trip: TripSpace, event: EventTimeSource) {
  const { startTime } = getEventTime(trip, event);
  return startTime ? formatClockTime(startTime) : '';
}

export function formatStayClockRange(trip: TripSpace, stay: StayTimeSource) {
  const { checkIn, checkOut } = getStayTime(trip, stay);
  return `${checkIn.time ? formatClockTime(checkIn.time) : ''} - ${checkOut.time ? formatClockTime(checkOut.time) : ''}`;
}
