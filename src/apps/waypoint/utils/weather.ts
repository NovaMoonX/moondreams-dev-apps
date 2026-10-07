import type { DayForecast, HourForecast, WeatherForecast, WeatherRequest } from '@/lib/weather/types';
import { roundCoordinate } from '@/lib/weather/weatherQueries';
import { getDayCount, getDayInputValue } from '@/utils/dateRangeUtils';
import { MAX_DAYS_OUTSIDE_TRIP } from '@apps/waypoint/constants';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';

const FORECAST_WINDOW_DAYS = 14;
// The provider serves 92 days of past data; stay clear of the edge.
const MAX_PAST_DAYS = 90;

interface Located {
  latitude: number;
  longitude: number;
  timezone: string | null;
  /** The plan the forecast is for, so the details can say where the weather is from. */
  placeName: string | null;
}

export interface WeatherGroup {
  key: string;
  request: WeatherRequest;
}

export interface WeatherPlan {
  groups: WeatherGroup[];
  days: Record<number, { key: string; date: string; placeName: string | null }>;
  events: Record<string, { key: string; time: string }>;
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
): Located | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  return { latitude, longitude, timezone, placeName };
}

const isLocated = (value: Located | null): value is Located => value !== null;

function getTripCityLocation(trip: TripSpace): Located | null {
  const { city } = trip;
  return city ? toLocated(city.latitude, city.longitude, trip.timezone, city.name) : null;
}

// Travel legs start from wherever each person is, so the first plan that isn't travel says where the day is.
function getDayLocation(trip: TripSpace, dayIndex: number, events: TimelineEvent[]): Located | null {
  const fromEvent = events
    .filter(
      (event) =>
        !event.isArchived && event.eventType !== 'TRAVEL' && getEventTime(trip, event).dayIndex === dayIndex,
    )
    .map((event) =>
      toLocated(
        event.latitude,
        event.longitude,
        getEventTime(trip, event).timezone,
        event.locationName?.trim() || event.title.trim() || null,
      ),
    )
    .find(isLocated);
  return fromEvent ?? null;
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
    const location = cityLocation ?? getDayLocation(trip, dayIndex, events);
    return location ? [{ dayIndex, location, date: getDayInputValue(trip.startDate, dayIndex) }] : [];
  });

  // Legacy absolute trips store instants without a zone, so an event's hour can't be placed reliably.
  const eventNeeds = isRelativeTrip(trip)
    ? events.flatMap((event) => {
        const { dayIndex, startTime, timezone } = getEventTime(trip, event);
        const location = toLocated(event.latitude, event.longitude, timezone);
        if (event.isArchived || !location || startTime === null || dayIndex === null || !visibleDays.has(dayIndex)) {
          return [];
        }
        const date = getDayInputValue(trip.startDate, dayIndex);
        return [{ eventId: event.id, location, date, time: `${date}T${startTime.slice(0, 2)}:00` }];
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
  const needs: WeatherNeed[] = [...dayNeeds, ...eventNeeds, ...todayNeeds];
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
      dayNeeds.map(({ dayIndex, location, date }) => [
        dayIndex,
        { key: getLocationKey(location), date, placeName: location.placeName },
      ]),
    ),
    events: Object.fromEntries(
      eventNeeds.map(({ eventId, location, time }) => [eventId, { key: getLocationKey(location), time }]),
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
