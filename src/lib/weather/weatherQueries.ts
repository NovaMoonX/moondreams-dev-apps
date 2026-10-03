import { queryOptions } from '@tanstack/react-query';

import type { WeatherRequest } from './types';
import { fetchForecast } from './weatherApi';

const WEATHER_STALE_MS = 30 * 60 * 1000;

// A forecast barely changes across ~10km, so a trip's nearby venues share one cached request.
export function roundCoordinate(value: number) {
  return Number(value.toFixed(1));
}

export const weatherQueryKeys = {
  all: ['weather'] as const,
  forecast: ({ latitude, longitude, timezone, startDate, endDate }: WeatherRequest) =>
    [
      ...weatherQueryKeys.all,
      'forecast',
      roundCoordinate(latitude),
      roundCoordinate(longitude),
      timezone,
      startDate,
      endDate,
    ] as const,
};

export function weatherForecastQueryOptions(request: WeatherRequest) {
  return queryOptions({
    queryKey: weatherQueryKeys.forecast(request),
    queryFn: () =>
      fetchForecast({
        ...request,
        latitude: roundCoordinate(request.latitude),
        longitude: roundCoordinate(request.longitude),
      }),
    staleTime: WEATHER_STALE_MS,
    retry: false,
    meta: { persist: true },
  });
}
