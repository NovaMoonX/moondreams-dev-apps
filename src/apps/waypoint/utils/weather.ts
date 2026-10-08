import type { DayForecast, HourForecast, WeatherForecast, WeatherRequest } from '@/lib/weather/types';
import { roundCoordinate } from '@/lib/weather/weatherQueries';
import { getDayCount, getDayInputValue } from '@/utils/dateRangeUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { toMinutes } from '@apps/waypoint/utils/timelineLogistics';
import { getEventTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';

const FORECAST_WINDOW_DAYS = 14;
// The provider serves 92 days of past data; stay clear of the edge.
const MAX_PAST_DAYS = 90;
/** Plans closer than this share a forecast: one place, not two. */
const CLUSTER_KM = 35;

interface Located {
  latitude: number;
  longitude: number;
  timezone: string | null;
  /** The plan the forecast is for, so the details can say where the weather is from. */
  placeName: string | null;
  /** How many of the day's plans are in this place. */
  count: number;
}

export interface WeatherGroup {
  key: string;
  request: WeatherRequest;
}

export interface WeatherPlan {
  groups: WeatherGroup[];
  /** `also` is every other place the day's plans are in, in the order its first plan happens. */
  days: Record<number, { key: string; date: string; placeName: string | null; also: { key: string; placeName: string | null }[] }>;
  /** `placeName` is set only for an event outside the day's main place. */
  events: Record<string, { key: string; time: string; placeName: string | null }>;
}

export type WeatherForecasts = Record<string, WeatherForecast>;

/** Every trip day inside the provider's window, however far the trip is from today: the next two
 * weeks, and as far back as it keeps history — so a trip that is over still shows how it went. A few
 * days either side of the trip count too when something is planned on them. */
export function getWeatherDayIndexes(trip: TripSpace, todayIndex: number, events: TimelineEvent[] = []) {
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  const eventDays = new Set(
    events.filter((event) => !event.isArchived).map((event) => getEventTime(trip, event).dayIndex),
  );
  const first = todayIndex - MAX_PAST_DAYS;
  const last = todayIndex + FORECAST_WINDOW_DAYS - 1;
  const result = Array.from({ length: dayCount + MAX_DAYS_OUTSIDE_TRIP * 2 }, (_, offset) => offset - MAX_DAYS_OUTSIDE_TRIP).filter(
    (day) => day >= first && day <= last && ((day >= 0 && day < dayCount) || eventDays.has(day)),
  );
  return result;
}

function toLocated(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  timezone: string | null,
  placeName: string | null = null,
  count = 1,
): Located | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  return { latitude, longitude, timezone, placeName, count };
}

function getTripCityLocation(trip: TripSpace): Located | null {
  const { city } = trip;
  return city ? toLocated(city.latitude, city.longitude, null, city.name) : null;
}

/** The town from a US-style address ("3801 Discovery Park Blvd, Seattle, WA" is Seattle); otherwise the venue's own name. */
function getPlaceLabel(event: TimelineEvent) {
  const parts = (event.address ?? '').split(',').map((part) => part.trim());
  const isStateLast = /^[A-Z]{2}(\s+\d{5})?$/.test(parts.at(-1) ?? '');
  const town = isStateLast && parts.length >= 2 ? parts.at(-2) : null;
  return town || event.locationName?.trim() || event.title.trim() || null;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function getDistanceKm(first: Located, second: Located) {
  const dLat = toRadians(second.latitude - first.latitude);
  const dLon = toRadians(second.longitude - first.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(first.latitude)) * Math.cos(toRadians(second.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** A day's places, from its plans in time order: plans within `CLUSTER_KM` of a place's first plan belong to it.
 * Travel legs start from wherever each person is, so they don't say where the day is. The main place has
 * the most plans (the latest wins a tie: where the day ends is where people are); `others` keep the order
 * their first plan happens. */
function getDayPlaces(trip: TripSpace, dayIndex: number, events: TimelineEvent[], city: Located | null) {
  const located = events
    .filter(
      (event) =>
        !event.isArchived && event.eventType !== 'TRAVEL' && getEventTime(trip, event).dayIndex === dayIndex,
    )
    .map((event) => ({
      minutes: toMinutes(getEventTime(trip, event).startTime) ?? -1,
      location: toLocated(
        event.latitude,
        event.longitude,
        getEventTime(trip, event).timezone,
        getPlaceLabel(event),
      ),
    }))
    .filter((entry): entry is { minutes: number; location: Located } => entry.location !== null)
    .sort((first, second) => first.minutes - second.minutes);

  const clusters = located.reduce<Located[]>((acc, { location }) => {
    const index = acc.findIndex((cluster) => getDistanceKm(cluster, location) <= CLUSTER_KM);
    return index === -1
      ? [...acc, location]
      : acc.map((cluster, position) => (position === index ? { ...cluster, count: cluster.count + 1 } : cluster));
  }, []);
  const labelled = clusters.map((cluster) =>
    city && getDistanceKm(city, cluster) <= CLUSTER_KM ? { ...cluster, placeName: city.placeName } : cluster,
  );
  const main = labelled.reduce<Located | null>(
    (best, cluster) => (best === null || cluster.count >= best.count ? cluster : best),
    null,
  );
  const result = { main, others: labelled.filter((cluster) => cluster !== main) };
  return result;
}

function getLocationKey({ latitude, longitude, timezone }: Located) {
  return `${roundCoordinate(latitude)},${roundCoordinate(longitude)},${timezone ?? 'auto'}`;
}

interface WeatherNeed {
  location: Located;
  date: string;
}

export function buildWeatherPlan(
  trip: TripSpace,
  todayIndex: number,
  events: TimelineEvent[],
): WeatherPlan {
  const dayIndexes = getWeatherDayIndexes(trip, todayIndex, events);
  const visibleDays = new Set(dayIndexes);

  const cityLocation = getTripCityLocation(trip);
  const dayNeeds = dayIndexes.flatMap((dayIndex) => {
    const { main, others } = getDayPlaces(trip, dayIndex, events, cityLocation);
    const location = main ?? cityLocation;
    return location ? [{ dayIndex, location, others, date: getDayInputValue(trip.startDate, dayIndex) }] : [];
  });
  const dayPlaces = new Map(dayNeeds.map(({ dayIndex, location, others }) => [dayIndex, { main: location, others }]));

  // Legacy absolute trips store instants without a zone, so an event's hour can't be placed reliably.
  const eventNeeds = isRelativeTrip(trip)
    ? events.flatMap((event) => {
        const { dayIndex, startTime, timezone } = getEventTime(trip, event);
        const location = toLocated(event.latitude, event.longitude, timezone);
        if (event.isArchived || !location || startTime === null || dayIndex === null || !visibleDays.has(dayIndex)) {
          return [];
        }
        const date = getDayInputValue(trip.startDate, dayIndex);
        const places = dayPlaces.get(dayIndex);
        const isOutsideMain = places !== undefined && getDistanceKm(places.main, location) > CLUSTER_KM;
        const placeName = isOutsideMain
          ? (places.others.find((other) => getDistanceKm(other, location) <= CLUSTER_KM)?.placeName ??
            event.locationName?.trim() ??
            null)
          : null;
        return [{ eventId: event.id, location, date, placeName, time: `${date}T${startTime.slice(0, 2)}:00` }];
      })
    : [];

  // The location can be on a different calendar day than the viewer, so today's request spans both neighbours.
  const todayNeeds = dayNeeds
    .filter(({ dayIndex }) => dayIndex === todayIndex)
    .flatMap(({ location }) =>
      [todayIndex - 1, todayIndex + 1].map((dayIndex) => ({
        location,
        date: getDayInputValue(trip.startDate, dayIndex),
      })),
    );
  const alsoNeeds = dayNeeds.flatMap(({ others, date }) => others.map((location) => ({ location, date })));
  const needs: WeatherNeed[] = [...dayNeeds, ...alsoNeeds, ...eventNeeds, ...todayNeeds];
  const groupsByKey = needs.reduce<Record<string, WeatherGroup>>((groups, { location, date }) => {
    const key = getLocationKey(location);
    const existing = groups[key];
    const request: WeatherRequest = existing
      ? {
          ...existing.request,
          startDate: date < existing.request.startDate ? date : existing.request.startDate,
          endDate: date > existing.request.endDate ? date : existing.request.endDate,
        }
      : {
          latitude: location.latitude,
          longitude: location.longitude,
          timezone: location.timezone,
          startDate: date,
          endDate: date,
        };
    return { ...groups, [key]: { key, request } };
  }, {});

  const result: WeatherPlan = {
    groups: Object.values(groupsByKey),
    days: Object.fromEntries(
      dayNeeds.map(({ dayIndex, location, others, date }) => [
        dayIndex,
        {
          key: getLocationKey(location),
          date,
          placeName: location.placeName,
          also: others.map((other) => ({ key: getLocationKey(other), placeName: other.placeName })),
        },
      ]),
    ),
    events: Object.fromEntries(
      eventNeeds.map(({ eventId, location, time, placeName }) => [
        eventId,
        { key: getLocationKey(location), time, placeName },
      ]),
    ),
  };
  return result;
}

export function getDayForecast(
  plan: WeatherPlan,
  forecasts: WeatherForecasts,
  dayIndex: number,
): DayForecast | null {
  const target = plan.days[dayIndex];
  const result = target ? (forecasts[target.key]?.days.find((day) => day.date === target.date) ?? null) : null;
  return result;
}

/** Every hour of the day, in the location's own time. */
export function getDayHours(plan: WeatherPlan, forecasts: WeatherForecasts, dayIndex: number): HourForecast[] {
  const target = plan.days[dayIndex];
  const result = target ? (forecasts[target.key]?.hours.filter((hour) => hour.time.startsWith(target.date)) ?? []) : [];
  return result;
}

/** The next 24 hours from the location's current hour — independent of the trip's dates and events. */
export function getRemainingHours(
  plan: WeatherPlan,
  forecasts: WeatherForecasts,
  dayIndex: number,
  now: number,
): HourForecast[] {
  const target = plan.days[dayIndex];
  const forecast = target ? forecasts[target.key] : undefined;
  const nowKey = forecast ? getZonedHourKey(now, forecast.timezone) : null;
  if (!forecast || !nowKey) {
    return [];
  }

  const result = forecast.hours.filter((hour) => hour.time >= nowKey).slice(0, 24);
  return result;
}

/** The other places a day's plans are in, each with that place's forecast for the day. */
export function getDayAlso(plan: WeatherPlan, forecasts: WeatherForecasts, dayIndex: number) {
  const target = plan.days[dayIndex];
  const result = (target?.also ?? []).flatMap(({ key, placeName }) => {
    const forecast = forecasts[key]?.days.find((day) => day.date === target?.date) ?? null;
    return forecast ? [{ placeName, forecast }] : [];
  });
  return result;
}

export function getDayTimezone(plan: WeatherPlan, forecasts: WeatherForecasts, dayIndex: number) {
  const target = plan.days[dayIndex];
  const result = target ? (forecasts[target.key]?.timezone ?? null) : null;
  return result;
}

export function getEventForecast(
  plan: WeatherPlan,
  forecasts: WeatherForecasts,
  eventId: string,
): HourForecast | null {
  const target = plan.events[eventId];
  const result = target ? (forecasts[target.key]?.hours.find((hour) => hour.time === target.time) ?? null) : null;
  return result;
}

export function getZonedHourKey(now: number, timezone: string | null) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '00';
    const result = `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:00`;
    return result;
  } catch {
    return null;
  }
}
