import { useMemo } from 'react';

import { useQueries } from '@tanstack/react-query';

import { getLocalDayIndex } from '@/utils/dateRangeUtils';
import { weatherForecastQueryOptions } from '@/lib/weather/weatherQueries';
import type { TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  buildWeatherPlan,
  getDayForecast,
  getDayAlso,
  getDayHours,
  getDayTimezone,
  getEventForecast,
  getRemainingHours,
  type WeatherForecasts,
} from '@apps/waypoint/utils/weather';

/** Forecasts for a trip's visible days and events. A loading or failed request just reads as "no
 * weather", so nothing that renders from this ever waits on, or breaks because of, the provider. */
export function useTripWeather(trip: TripSpace, events: TimelineEvent[], now: number) {
  const todayIndex = getLocalDayIndex(trip.startDate, now);
  const plan = useMemo(
    () => buildWeatherPlan(trip, todayIndex, events),
    [trip, todayIndex, events],
  );

  const forecasts = useQueries({
    queries: plan.groups.map((group) => weatherForecastQueryOptions(group.request)),
    combine: (results) =>
      plan.groups.reduce<WeatherForecasts>(
        (acc, group, index) => (results[index]?.data ? { ...acc, [group.key]: results[index].data } : acc),
        {},
      ),
  });

  const getDay = (dayIndex: number) => getDayForecast(plan, forecasts, dayIndex);
  const hasWeather = Object.keys(plan.days).some((dayIndex) => getDay(Number(dayIndex)) !== null);

  const getDayDetails = (dayIndex: number) => {
    const forecast = getDay(dayIndex);
    const target = plan.days[dayIndex];
    return forecast && target
      ? {
          forecast,
          hours: getDayHours(plan, forecasts, dayIndex),
          placeName: target.placeName,
          also: getDayAlso(plan, forecasts, dayIndex),
        }
      : null;
  };

  const getRemainingHoursToday = (dayIndex: number) =>
    dayIndex === todayIndex ? getRemainingHours(plan, forecasts, dayIndex, now) : [];

  return {
    todayIndex,
    hasWeather,
    getDay,
    getDayDetails,
    getTimezone: (dayIndex: number) => getDayTimezone(plan, forecasts, dayIndex),
    getRemainingHoursToday,
    getEvent: (eventId: string) => getEventForecast(plan, forecasts, eventId),
    getEventPlace: (eventId: string) => plan.events[eventId]?.placeName ?? null,
    getAlso: (dayIndex: number) => getDayAlso(plan, forecasts, dayIndex),
    getPlaceName: (dayIndex: number) => plan.days[dayIndex]?.placeName ?? null,
  };
}

export type TripWeather = ReturnType<typeof useTripWeather>;
