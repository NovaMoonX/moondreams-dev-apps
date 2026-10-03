import type { DayForecast, HourForecast, WeatherForecast, WeatherRequest } from '@/lib/weather/types';
import { roundCoordinate } from '@/lib/weather/weatherQueries';
import { getDayCount, getDayInputValue } from '@/utils/dateRangeUtils';
import type { Stay, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import { getEventTime, getStayTime, isRelativeTrip } from '@apps/waypoint/utils/tripTime';

const FORECAST_WINDOW_DAYS = 14;
// The provider serves 92 days of past data; stay clear of the edge.
const MAX_PAST_DAYS = 90;

interface Located {
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export interface WeatherGroup {
  key: string;
  request: WeatherRequest;
}

export interface WeatherPlan {
  groups: WeatherGroup[];
  days: Record<number, { key: string; date: string }>;
  events: Record<string, { key: string; time: string }>;
}

export type WeatherForecasts = Record<string, WeatherForecast>;

/** Which trip days get weather: none once the trip is over, nothing beyond the 14-day forecast window,
 * and past days of a live trip back to its first day. `todayIndex` is the viewer's local day. */
export function getWeatherDayIndexes(trip: TripSpace, todayIndex: number) {
  const dayCount = getDayCount(trip.startDate, trip.endDate);
  if (todayIndex >= dayCount) {
    return [];
  }

  const first = Math.max(0, todayIndex - MAX_PAST_DAYS);
  const last = Math.min(dayCount - 1, todayIndex + FORECAST_WINDOW_DAYS - 1);
  const result = Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => first + offset);
  return result;
}

function toLocated(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  timezone: string | null,
): Located | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  return { latitude, longitude, timezone };
}

const isLocated = (value: Located | null): value is Located => value !== null;

/** A day's weather is only as trustworthy as its location, so it's the day's first event with
 * coordinates, then a stay covering the day — never a guess from elsewhere on the trip. */
function getDayLocation(
  trip: TripSpace,
  dayIndex: number,
  events: TimelineEvent[],
  stays: Stay[],
): Located | null {
  const fromEvent = events
    .filter((event) => !event.isArchived && getEventTime(trip, event).dayIndex === dayIndex)
    .map((event) => toLocated(event.latitude, event.longitude, getEventTime(trip, event).timezone))
    .find(isLocated);
  if (fromEvent) {
    return fromEvent;
  }

  const fromStay = stays
    .filter((stay) => {
      const { plannedArrival, plannedDeparture } = getStayTime(trip, stay);
      return (
        plannedArrival.dayIndex !== null &&
        plannedDeparture.dayIndex !== null &&
        plannedArrival.dayIndex <= dayIndex &&
        dayIndex <= plannedDeparture.dayIndex
      );
    })
    .map((stay) => toLocated(stay.latitude, stay.longitude, getStayTime(trip, stay).timezone))
    .find(isLocated);
  return fromStay ?? null;
}

function getLocationKey({ latitude, longitude, timezone }: Located) {
  return `${roundCoordinate(latitude)},${roundCoordinate(longitude)},${timezone ?? 'auto'}`;
}

interface WeatherNeed {
  location: Located;
  date: string;
}

/** Every forecast the trip's visible days and events need, merged so each distinct place is one request. */
export function buildWeatherPlan(
  trip: TripSpace,
  todayIndex: number,
  events: TimelineEvent[],
  stays: Stay[],
): WeatherPlan {
  const dayIndexes = getWeatherDayIndexes(trip, todayIndex);
  const visibleDays = new Set(dayIndexes);

  const dayNeeds = dayIndexes.flatMap((dayIndex) => {
    const location = getDayLocation(trip, dayIndex, events, stays);
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

  const needs: WeatherNeed[] = [...dayNeeds, ...eventNeeds];
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
      dayNeeds.map(({ dayIndex, location, date }) => [dayIndex, { key: getLocationKey(location), date }]),
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

export function getDayHours(
  plan: WeatherPlan,
  forecasts: WeatherForecasts,
  dayIndex: number,
): { hours: HourForecast[]; timezone: string | null } | null {
  const target = plan.days[dayIndex];
  const forecast = target ? forecasts[target.key] : undefined;
  if (!target || !forecast) {
    return null;
  }

  const hours = forecast.hours.filter((hour) => hour.time.startsWith(target.date));
  const result = hours.length > 0 ? { hours, timezone: forecast.timezone } : null;
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

/** The current hour as the provider writes it (`YYYY-MM-DDTHH:00`) in `timezone`, for the live "Now" marker. */
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
