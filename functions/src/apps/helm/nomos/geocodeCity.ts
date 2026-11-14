import type { City } from './whereabouts.js';

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const GEOCODE_TIMEOUT_MS = 4000;

const PACIFIC = 'America/Los_Angeles';

const FIXTURE_CITIES: City[] = [
  {
    name: 'Seattle',
    region: 'Washington',
    country: 'United States',
    latitude: 47.6062,
    longitude: -122.3321,
    timezone: PACIFIC,
  },
  {
    name: 'Portland',
    region: 'Oregon',
    country: 'United States',
    latitude: 45.5152,
    longitude: -122.6784,
    timezone: PACIFIC,
  },
  {
    name: 'Leavenworth',
    region: 'Washington',
    country: 'United States',
    latitude: 47.5962,
    longitude: -120.6615,
    timezone: PACIFIC,
  },
  {
    name: 'Lisbon',
    region: 'Lisbon',
    country: 'Portugal',
    latitude: 38.7167,
    longitude: -9.1333,
    timezone: 'Europe/Lisbon',
  },
  {
    name: 'Tacoma',
    region: 'Washington',
    country: 'United States',
    latitude: 47.2529,
    longitude: -122.4443,
    timezone: PACIFIC,
  },
];

const toText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const fold = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** The top match for a city name, or null when none is found or the lookup fails. Only the name leaves the server. */
export async function geocodeCity(name: string): Promise<City | null> {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return (
      FIXTURE_CITIES.find((city) => fold(city.name) === fold(name)) ?? null
    );
  }
  try {
    const url = `${GEOCODE_URL}?${new URLSearchParams({
      name,
      count: '1',
      language: 'en',
      format: 'json',
    }).toString()}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { results?: unknown };
    const top: Record<string, unknown> | undefined = Array.isArray(body.results)
      ? body.results[0]
      : undefined;
    const cityName = top ? toText(top.name) : null;
    if (!top || !cityName) return null;
    if (!isNumber(top.latitude) || !isNumber(top.longitude)) return null;
    return {
      name: cityName,
      region: toText(top.admin1),
      country: toText(top.country),
      latitude: top.latitude,
      longitude: top.longitude,
      timezone: toText(top.timezone),
    };
  } catch {
    return null;
  }
}
