import type { AirlineOption } from '@/lib/airlines/airlinesQueries';
import type { AirportOption } from '@/lib/airports/airportsQueries';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount, getDayDateLabel } from '@/utils/dateRangeUtils';
import { formatClockTime } from '@/utils/formatUtils';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { DEFAULT_REMINDER_MINUTES_BEFORE, MAX_DAYS_OUTSIDE_TRIP, TRANSIT_TYPE_EMOJIS } from '@apps/waypoint/constants';
import type {
  ExtractedBooking,
  ExtractedRental,
  ExtractedStay,
  ExtractedTravel,
} from '@apps/waypoint/lib/extractBookingFromFile';
import type { RentalFormFields } from '@apps/waypoint/store/actions/rentalActions';
import type { EventFields } from '@apps/waypoint/store/actions/eventActions';
import type { Stay, TransitDetails, TransitType, TripSpace } from '@apps/waypoint/types';
import { buildTransitDetails, EMPTY_TRANSIT_DRAFT, getDerivedTravelTitle } from '@apps/waypoint/utils/transitDetails';

const DAY_MS = 86_400_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type StayFields = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

export interface ProposedEntry<T> {
  /** What was read, as the person will recognise it on their confirmation. */
  title: string;
  /** When it happens, in the form it will read on the trip. */
  when: string;
  emoji: string;
  /** More than a few days beyond the trip's dates, so it would sit under "Outside trip dates". */
  isOutsideTrip: boolean;
  fields: T;
  /** The airport the leg leaves from and lands at, so the first can be turned into a place. */
  airports?: { departure: AirportOption | null; arrival: AirportOption | null };
}

export interface ProposedBooking {
  travel: ProposedEntry<EventFields>[];
  stays: ProposedEntry<StayFields>[];
  rentals: ProposedEntry<RentalFormFields>[];
  /** Entries the document had but that lacked a date or time to place them on the trip. */
  skippedCount: number;
}

const clean = (value: string | null | undefined) => value?.trim() || null;

const isTime = (value: string | null | undefined): value is string => typeof value === 'string' && TIME_PATTERN.test(value.trim());

/** A day number against the trip's first day, or `null` when the date is missing or unreadable. */
export function getDayIndexForDate(trip: TripSpace, date: string | null | undefined) {
  const parsed = date ? fromDateInputValue(date.trim()) : undefined;
  return parsed === undefined ? null : Math.round((parsed - trip.startDate) / DAY_MS);
}

function isOutsideTrip(trip: TripSpace, ...dayIndexes: number[]) {
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  return dayIndexes.some((day) => day < -MAX_DAYS_OUTSIDE_TRIP || day >= dayCount + MAX_DAYS_OUTSIDE_TRIP);
}

function getValidZone(zone: string | null | undefined) {
  if (!zone) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function formatWhen(trip: TripSpace, dayIndex: number, time: string) {
  return `${getDayDateLabel(trip.startDate, dayIndex)}, ${formatClockTime(time)}`;
}

function formatRange(trip: TripSpace, start: { day: number; time: string }, end: { day: number; time: string } | null) {
  const from = formatWhen(trip, start.day, start.time);
  return end ? `${from} → ${formatWhen(trip, end.day, end.time)}` : from;
}

function findAirport(airports: AirportOption[], code: string | null) {
  const normalized = code?.trim().toUpperCase();
  return normalized ? (airports.find((airport) => airport.iataCode === normalized) ?? null) : null;
}

function matchAirline(airlines: AirlineOption[], carrier: string | null, flightNumber: string | null) {
  const prefix = /^([A-Za-z0-9]{2})\s?\d/.exec(flightNumber?.trim() ?? '')?.[1]?.toUpperCase();
  const byName = carrier
    ? airlines.find((airline) => airline.name.toLowerCase() === carrier.trim().toLowerCase())
    : undefined;
  const result = byName ?? airlines.find((airline) => airline.iataCode === prefix) ?? null;
  return result;
}

function getTransitValues(
  transitType: TransitType,
  item: ExtractedTravel,
  airlines: AirlineOption[],
  departure: AirportOption | null,
  arrival: AirportOption | null,
): Record<string, string> {
  const carrier = clean(item.carrier);
  const confirmationCode = clean(item.confirmationCode) ?? '';
  const from = clean(item.departureLocation) ?? '';
  const to = clean(item.arrivalLocation) ?? '';
  if (transitType === 'FLIGHT') {
    const airline = matchAirline(airlines, carrier, clean(item.flightNumber));
    return {
      airline: airline?.name ?? carrier ?? '',
      airlineIataCode: airline?.iataCode ?? '',
      airlineIcaoCode: airline?.icaoCode ?? '',
      flightNumber: clean(item.flightNumber) ?? '',
      confirmationCode,
      departureAirportCode: departure?.iataCode ?? clean(item.departureCode)?.toUpperCase() ?? '',
      arrivalAirportCode: arrival?.iataCode ?? clean(item.arrivalCode)?.toUpperCase() ?? '',
    };
  }
  if (transitType === 'TRAIN') {
    return { operator: carrier ?? '', trainNumber: clean(item.trainNumber) ?? '', confirmationCode, departureStation: from, arrivalStation: to };
  }
  if (transitType === 'FERRY') {
    return { operator: carrier ?? '', confirmationCode, departurePort: from, arrivalPort: to };
  }
  if (transitType === 'DRIVE') {
    return { startLocation: from, endLocation: to };
  }
  return {};
}

function resolveTravel(
  trip: TripSpace,
  uid: string,
  item: ExtractedTravel,
  airports: AirportOption[],
  airlines: AirlineOption[],
): ProposedEntry<EventFields> | null {
  const startDay = getDayIndexForDate(trip, item.departureDate);
  if (startDay === null || !isTime(item.departureTime)) {
    return null;
  }

  const transitType: TransitType = item.transitType ?? 'OTHER';
  const departure = transitType === 'FLIGHT' ? findAirport(airports, item.departureCode) : null;
  const arrival = transitType === 'FLIGHT' ? findAirport(airports, item.arrivalCode) : null;
  const startZone = getValidZone(departure?.timezone) ?? getValidZone(item.departureTimezone) ?? trip.timezone;
  const endZone = getValidZone(arrival?.timezone) ?? getValidZone(item.arrivalTimezone) ?? startZone;
  const startTime = item.departureTime.trim();
  const endDay = getDayIndexForDate(trip, item.arrivalDate);
  const endTime = isTime(item.arrivalTime) ? item.arrivalTime.trim() : null;
  const hasEnd = endDay !== null && endTime !== null;
  const toMoment = (day: number, time: string, zone: string | null) =>
    zonedDateTimeToEpoch(new Date(trip.startDate + day * DAY_MS).toISOString().slice(0, 10), time, zone ?? 'UTC');
  const endsAfterStart =
    hasEnd && toMoment(endDay, endTime, endZone) > toMoment(startDay, startTime, startZone);
  const keepEnd = hasEnd && endsAfterStart;

  const values = getTransitValues(transitType, item, airlines, departure, arrival);
  const details = {
    ...buildTransitDetails(transitType, { ...EMPTY_TRANSIT_DRAFT, values, notes: clean(item.notes) ?? '' }),
    estimatedTravelTimeMs: null,
  } as TransitDetails;
  const mirrorLocation = departure?.name ?? clean(item.departureLocation);
  const fields: EventFields = {
    eventType: 'TRAVEL',
    dayIndex: startDay,
    endDayIndex: keepEnd ? endDay : startDay,
    startAt: null,
    endAt: null,
    startTime,
    endTime: keepEnd ? endTime : null,
    timezone: startZone === trip.timezone ? null : startZone,
    endTimezone: keepEnd && endZone !== startZone ? endZone : null,
    title: getDerivedTravelTitle(transitType, details),
    locationName: mirrorLocation,
    address: null,
    latitude: departure?.latitude ?? null,
    longitude: departure?.longitude ?? null,
    eventDetails: { transitType, transitDetails: details },
    notes: null,
    attendeeTargetType: 'SPECIFIC_MEMBERS',
    assignedMemberIds: [uid],
    venueOpenTime: null,
    venueCloseTime: null,
    changeHistory: [],
    place: null,
    linkUrl: null,
    linkPreview: null,
    linkKind: null,
    groupLabel: null,
    stackLabel: null,
    reminderMinutesBefore: DEFAULT_REMINDER_MINUTES_BEFORE,
    reminderEnabled: true,
    reminderId: null,
    isArchived: false,
    archivedBy: null,
    archivedAt: null,
    seenBy: {},
  };
  const route = [
    values.departureAirportCode ?? values.departureStation ?? values.departurePort ?? values.startLocation,
    values.arrivalAirportCode ?? values.arrivalStation ?? values.arrivalPort ?? values.endLocation,
  ].filter(Boolean);
  return {
    title: route.length === 2 ? `${fields.title} · ${route.join(' → ')}` : fields.title,
    when: formatRange(trip, { day: startDay, time: startTime }, keepEnd ? { day: endDay, time: endTime } : null),
    emoji: TRANSIT_TYPE_EMOJIS[transitType],
    isOutsideTrip: isOutsideTrip(trip, startDay, ...(keepEnd ? [endDay] : [])),
    fields,
    airports: { departure, arrival },
  };
}

function resolveStay(trip: TripSpace, item: ExtractedStay): ProposedEntry<StayFields> | null {
  const checkInDay = getDayIndexForDate(trip, item.checkInDate);
  const checkOutDay = getDayIndexForDate(trip, item.checkOutDate);
  const name = clean(item.name);
  if (checkInDay === null || checkOutDay === null || !name) {
    return null;
  }

  const checkInTime = isTime(item.checkInTime) ? item.checkInTime.trim() : '15:00';
  const checkOutTime = isTime(item.checkOutTime) ? item.checkOutTime.trim() : '11:00';
  const isOrdered = checkOutDay > checkInDay || (checkOutDay === checkInDay && checkOutTime > checkInTime);
  if (!isOrdered) {
    return null;
  }

  const fields: StayFields = {
    name,
    stayType: item.stayType ?? 'HOTEL',
    address: clean(item.address) ?? name,
    latitude: null,
    longitude: null,
    checkInAt: null,
    checkOutAt: null,
    checkInTimezone: null,
    plannedArrivalAt: null,
    plannedDepartureAt: null,
    checkInDayIndex: checkInDay,
    checkInTime,
    checkOutDayIndex: checkOutDay,
    checkOutTime,
    plannedArrivalDayIndex: checkInDay,
    plannedArrivalTime: checkInTime,
    plannedDepartureDayIndex: checkOutDay,
    plannedDepartureTime: checkOutTime,
    confirmationCode: clean(item.confirmationCode),
    notes: clean(item.notes),
    place: null,
    linkUrl: null,
    linkPreview: null,
    changeHistory: [],
    seenBy: {},
  };
  return {
    title: name,
    when: formatRange(trip, { day: checkInDay, time: checkInTime }, { day: checkOutDay, time: checkOutTime }),
    emoji: '🛏️',
    isOutsideTrip: isOutsideTrip(trip, checkInDay, checkOutDay),
    fields,
  };
}

function resolveRental(trip: TripSpace, item: ExtractedRental): ProposedEntry<RentalFormFields> | null {
  const pickupDay = getDayIndexForDate(trip, item.pickupDate);
  const returnDay = getDayIndexForDate(trip, item.returnDate);
  const company = clean(item.company);
  const pickupAddress = clean(item.pickupAddress);
  if (pickupDay === null || returnDay === null || !isTime(item.pickupTime) || !isTime(item.returnTime) || !company || !pickupAddress) {
    return null;
  }

  const pickupTime = item.pickupTime.trim();
  const returnTime = item.returnTime.trim();
  const isOrdered = returnDay > pickupDay || (returnDay === pickupDay && returnTime > pickupTime);
  if (!isOrdered) {
    return null;
  }

  const fields: RentalFormFields = {
    rentalType: 'CAR',
    name: company,
    vehicle: clean(item.vehicle),
    pickupAddress,
    pickupLatitude: null,
    pickupLongitude: null,
    pickupPlace: null,
    returnAddress: clean(item.returnAddress),
    returnLatitude: null,
    returnLongitude: null,
    returnPlace: null,
    pickupDayIndex: pickupDay,
    pickupTime,
    returnDayIndex: returnDay,
    returnTime,
    timezone: null,
    confirmationCode: clean(item.confirmationCode),
    linkUrl: null,
    linkPreview: null,
  };
  return {
    title: [company, clean(item.vehicle)].filter(Boolean).join(' · '),
    when: formatRange(trip, { day: pickupDay, time: pickupTime }, { day: returnDay, time: returnTime }),
    emoji: '🚗',
    isOutsideTrip: isOutsideTrip(trip, pickupDay, returnDay),
    fields,
  };
}

const keepResolved = <T>(entries: (T | null)[]) => entries.filter((entry): entry is T => entry !== null);

/** Turns what was read from a document into entries placed on this trip. Anything that can't be
 * placed (no date or time) is counted rather than guessed at. */
export function proposeBooking(
  trip: TripSpace,
  uid: string,
  extracted: ExtractedBooking,
  airports: AirportOption[],
  airlines: AirlineOption[],
): ProposedBooking {
  const travel = keepResolved(extracted.travel.map((item) => resolveTravel(trip, uid, item, airports, airlines)));
  const stays = keepResolved(extracted.stays.map((item) => resolveStay(trip, item)));
  const rentals = keepResolved(extracted.rentals.map((item) => resolveRental(trip, item)));
  const total = extracted.travel.length + extracted.stays.length + extracted.rentals.length;
  return { travel, stays, rentals, skippedCount: total - travel.length - stays.length - rentals.length };
}
