import type { City } from './types';

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

interface GeocodingResponse {
  results?: {
    name?: string;
    admin1?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
  }[];
}

export const getCityLabel = ({ name, region, country }: Pick<City, 'name' | 'region' | 'country'>) =>
  [name, region, country].filter(Boolean).join(', ');

/** Open-Meteo's geocoder is keyless, like its forecast API (CC BY 4.0). */
export async function searchCities(query: string): Promise<City[]> {
  const params = new URLSearchParams({ name: query, count: '6', language: 'en', format: 'json' });
  const response = await fetch(`${GEOCODING_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`City search failed (${response.status})`);
  }

  const data: GeocodingResponse = await response.json();
  const cities = (data.results ?? []).flatMap((result) =>
    result.name && typeof result.latitude === 'number' && typeof result.longitude === 'number'
      ? [
          {
            name: result.name,
            region: result.admin1 ?? null,
            country: result.country ?? null,
            latitude: result.latitude,
            longitude: result.longitude,
            timezone: result.timezone ?? null,
          },
        ]
      : [],
  );
  return cities;
}
