import { useMemo } from 'react';

import { useQueries } from '@tanstack/react-query';

import { getLocalDayIndex } from '@/utils/dateRangeUtils';
import { weatherForecastQueryOptions } from '@/lib/weather/weatherQueries';
import type { Stay, TimelineEvent, TripSpace } from '@apps/waypoint/types';
import {
  buildWeatherPlan,
  getDayForecast,
  getDayHours,
  getEventForecast,
  getZonedHourKey,
  type WeatherForecasts,
} from '@apps/waypoint/utils/weather';

/** Forecasts for a trip's visible days and events. A loading or failed request just reads as "no
 * weather", so nothing that renders from this ever waits on, or breaks because of, the provider. */
export function useTripWeather(trip: TripSpace, events: TimelineEvent[], stays: Stay[], now: number) {
  const todayIndex = getLocalDayIndex(trip.startDate, now);
  const plan = useMemo(
    () => buildWeatherPlan(trip, todayIndex, events, stays),
    [trip, todayIndex, events, stays],
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

  const getRemainingHoursToday = (dayIndex: number) => {
    const day = dayIndex === todayIndex ? getDayHours(plan, forecasts, dayIndex) : null;
    const nowKey = day ? getZonedHourKey(now, day.timezone) : null;
    const result = day && nowKey ? day.hours.filter((hour) => hour.time >= nowKey) : [];
    return result;
  };

  return {
    todayIndex,
    hasWeather,
    getDay,
    getRemainingHoursToday,
    getEvent: (eventId: string) => getEventForecast(plan, forecasts, eventId),
  };
}

export type TripWeather = ReturnType<typeof useTripWeather>;
