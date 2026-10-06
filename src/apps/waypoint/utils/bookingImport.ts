import type { AirlineOption } from '@/lib/airlines/airlinesQueries';
import type { AirportOption } from '@/lib/airports/airportsQueries';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getDayCount } from '@/utils/dateRangeUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import type { EventPrefill } from '@apps/waypoint/components/EventFormModal';
import type {
  ExtractedBooking,
  ExtractedRental,
  ExtractedStay,
  ExtractedTravel,
} from '@apps/waypoint/lib/extractBookingFromFile';
import type { RentalFormFields } from '@apps/waypoint/store/actions/rentalActions';
import type { Stay, TripSpace } from '@apps/waypoint/types';

const DAY_MS = 86_400_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type StayFields = Omit<Stay, 'id' | 'tripId' | 'createdBy' | 'createdAt' | 'lastEditedAt'>;

/** What a form was filled with from a document, and what it could not read so the person can check it. */
export interface Autofill<T> {
  value: T;
  unread: string[];
}

const clean = (value: string | null | undefined) => value?.trim() || null;

const isTime = (value: string | null | undefined): value is string => typeof value === 'string' && TIME_PATTERN.test(value.trim());

/** A day number against the trip's first day, or `null` when the date is missing, unreadable or too far
 * from the trip to be believed (a misread year), so it is reported rather than filled in. */
export function getDayIndexForDate(trip: TripSpace, date: string | null | undefined) {
  const parsed = date ? fromDateInputValue(date.trim()) : undefined;
  if (parsed === undefined) {
    return null;
  }
  const day = Math.round((parsed - trip.startDate) / DAY_MS);
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  return day < -MAX_DAYS_OUTSIDE_TRIP || day >= dayCount + MAX_DAYS_OUTSIDE_TRIP ? null : day;
}

const unreadWhen = (labels: [string, string], day: number | null, time: string | null) => [
  ...(day === null ? [labels[0]] : []),
  ...(time === null ? [labels[1]] : []),
];

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

function toMoment(trip: TripSpace, day: number, time: string, zone: string) {
  return zonedDateTimeToEpoch(new Date(trip.startDate + day * DAY_MS).toISOString().slice(0, 10), time, zone);
}

/** The first flight on the document as a prefill for the event form. A flight is placed even when part
 * of it could not be read: the missing pieces come back in `unread`. Later flights are counted. */
export function flightToPrefill(
  trip: TripSpace,
  uid: string,
  extracted: ExtractedBooking,
  airports: AirportOption[],
  airlines: AirlineOption[],
): (Autofill<EventPrefill> & { extraFlights: number }) | null {
  const item: ExtractedTravel | undefined = extracted.travel[0];
  if (!item) {
    return null;
  }

  const departure = findAirport(airports, item.departureCode);
  const arrival = findAirport(airports, item.arrivalCode);
  const startDay = getDayIndexForDate(trip, item.departureDate);
  const startTime = isTime(item.departureTime) ? item.departureTime.trim() : null;
  const endDay = getDayIndexForDate(trip, item.arrivalDate);
  const endTime = isTime(item.arrivalTime) ? item.arrivalTime.trim() : null;
  const startZone = getValidZone(departure?.timezone) ?? getValidZone(item.departureTimezone) ?? trip.timezone ?? 'UTC';
  const endZone = getValidZone(arrival?.timezone) ?? getValidZone(item.arrivalTimezone) ?? startZone;
  const keepEnd =
    startDay !== null &&
    startTime !== null &&
    endDay !== null &&
    endTime !== null &&
    toMoment(trip, endDay, endTime, endZone) > toMoment(trip, startDay, startTime, startZone);
  const endFields = keepEnd ? { endDayIndex: endDay as number, endTime: endTime as string } : {};

  const carrier = clean(item.carrier);
  const flightNumber = clean(item.flightNumber);
  const airline = matchAirline(airlines, carrier, flightNumber);
  const departureCode = departure?.iataCode ?? clean(item.departureCode)?.toUpperCase() ?? '';
  const arrivalCode = arrival?.iataCode ?? clean(item.arrivalCode)?.toUpperCase() ?? '';

  const prefill: EventPrefill = {
    eventType: 'TRAVEL',
    title: '',
    notes: null,
    linkUrl: null,
    cuisines: [],
    settings: [],
    dayIndex: startDay ?? 0,
    time: startTime ?? '09:00',
    attendeeUids: [uid],
    transitType: 'FLIGHT',
    transitValues: {
      airline: airline?.name ?? carrier ?? '',
      airlineIataCode: airline?.iataCode ?? '',
      airlineIcaoCode: airline?.icaoCode ?? '',
      flightNumber: flightNumber ?? '',
      confirmationCode: clean(item.confirmationCode) ?? '',
      departureAirportCode: departureCode,
      arrivalAirportCode: arrivalCode,
    },
    ...endFields,
    timezone: startZone === trip.timezone ? null : startZone,
    endTimezone: keepEnd && endZone !== startZone ? endZone : null,
    locationName: departure?.name ?? clean(item.departureLocation) ?? undefined,
  };

  const unread = [
    ...unreadWhen(['departure date', 'departure time'], startDay, startTime),
    ...(keepEnd ? [] : ['arrival time']),
    ...(flightNumber ? [] : ['flight number']),
    ...(departureCode && arrivalCode ? [] : ['airports']),
  ];
  return { value: prefill, unread, extraFlights: Math.max(0, extracted.travel.length - 1) };
}

export function stayToFields(trip: TripSpace, extracted: ExtractedBooking): Autofill<StayFields> | null {
  const item: ExtractedStay | undefined = extracted.stays[0];
  if (!item) {
    return null;
  }

  const checkInDay = getDayIndexForDate(trip, item.checkInDate);
  const checkOutDay = getDayIndexForDate(trip, item.checkOutDate);
  const checkInTime = isTime(item.checkInTime) ? item.checkInTime.trim() : null;
  const checkOutTime = isTime(item.checkOutTime) ? item.checkOutTime.trim() : null;
  const inDay = checkInDay ?? 0;
  const outDay = checkOutDay !== null && checkOutDay >= inDay ? checkOutDay : Math.max(inDay, 0);
  const inTime = checkInTime ?? '15:00';
  const outTime = checkOutTime ?? '11:00';
  const name = clean(item.name);
  const isOrdered = outDay > inDay || (outDay === inDay && outTime > inTime);
  const finalOutDay = isOrdered ? outDay : inDay + 1;

  const value: StayFields = {
    name: name ?? '',
    stayType: item.stayType ?? 'HOTEL',
    address: clean(item.address) ?? '',
    latitude: null,
    longitude: null,
    checkInAt: null,
    checkOutAt: null,
    checkInTimezone: null,
    plannedArrivalAt: null,
    plannedDepartureAt: null,
    checkInDayIndex: inDay,
    checkInTime: inTime,
    checkOutDayIndex: finalOutDay,
    checkOutTime: outTime,
    plannedArrivalDayIndex: inDay,
    plannedArrivalTime: inTime,
    plannedDepartureDayIndex: finalOutDay,
    plannedDepartureTime: outTime,
    confirmationCode: clean(item.confirmationCode),
    notes: clean(item.notes),
    place: null,
    linkUrl: null,
    linkPreview: null,
    changeHistory: [],
    seenBy: {},
  };
  const unread = [
    ...(name ? [] : ['name']),
    ...(clean(item.address) ? [] : ['address']),
    ...unreadWhen(['check-in date', 'check-in time'], checkInDay, checkInTime),
    ...unreadWhen(['check-out date', 'check-out time'], checkOutDay, checkOutTime),
  ];
  return { value, unread };
}

export function rentalToFields(trip: TripSpace, extracted: ExtractedBooking): Autofill<RentalFormFields> | null {
  const item: ExtractedRental | undefined = extracted.rentals[0];
  if (!item) {
    return null;
  }

  const pickupDay = getDayIndexForDate(trip, item.pickupDate);
  const returnDay = getDayIndexForDate(trip, item.returnDate);
  const pickupTime = isTime(item.pickupTime) ? item.pickupTime.trim() : null;
  const returnTime = isTime(item.returnTime) ? item.returnTime.trim() : null;
  const company = clean(item.company);
  const pickupAddress = clean(item.pickupAddress);
  const fromDay = pickupDay ?? 0;
  const fromTime = pickupTime ?? '10:00';
  const toTime = returnTime ?? '10:00';
  const toDay = returnDay !== null && returnDay >= fromDay ? returnDay : fromDay + 1;
  const isOrdered = toDay > fromDay || toTime > fromTime;

  const value: RentalFormFields = {
    rentalType: 'CAR',
    name: company ?? '',
    vehicle: clean(item.vehicle),
    pickupAddress: pickupAddress ?? '',
    pickupLatitude: null,
    pickupLongitude: null,
    pickupPlace: null,
    returnAddress: clean(item.returnAddress),
    returnLatitude: null,
    returnLongitude: null,
    returnPlace: null,
    pickupDayIndex: fromDay,
    pickupTime: fromTime,
    returnDayIndex: isOrdered ? toDay : fromDay + 1,
    returnTime: toTime,
    timezone: null,
    confirmationCode: clean(item.confirmationCode),
    linkUrl: null,
    linkPreview: null,
  };
  const unread = [
    ...(company ? [] : ['company']),
    ...(pickupAddress ? [] : ['pickup address']),
    ...unreadWhen(['pickup date', 'pickup time'], pickupDay, pickupTime),
    ...unreadWhen(['return date', 'return time'], returnDay, returnTime),
  ];
  return { value, unread };
}
