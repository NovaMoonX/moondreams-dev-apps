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
    name: 'Portland',
    region: 'Maine',
    country: 'United States',
    latitude: 43.6591,
    longitude: -70.2568,
    timezone: 'America/New_York',
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

const CACHE_CAP = 200;
const cache = new Map<string, City | null>();

const remember = (key: string, city: City | null) => {
  if (cache.size >= CACHE_CAP)
    cache.delete(cache.keys().next().value as string);
  cache.set(key, city);
  return city;
};

const splitName = (name: string) => {
  const [first = '', ...rest] = name.split(',');
  return { first: first.trim(), rest: fold(rest.join(' ')) };
};

const matchesRest = (
  rest: string,
  region: string | null,
  country: string | null,
) =>
  rest === '' ||
  [region, country].some((part) => part !== null && fold(part) === rest);

/** The best match for a city name ("Portland" or "Portland, Oregon"), or null when none is found or the lookup fails. Only the name leaves the server. */
export async function geocodeCity(name: string): Promise<City | null> {
  const key = fold(name);
  if (cache.has(key)) return cache.get(key) ?? null;
  const { first, rest } = splitName(name);
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const named = FIXTURE_CITIES.filter(
      (city) => fold(city.name) === fold(first),
    );
    return remember(
      key,
      named.find((city) => matchesRest(rest, city.region, city.country)) ??
        named[0] ??
        null,
    );
  }
  try {
    const url = `${GEOCODE_URL}?${new URLSearchParams({
      name: first,
      count: '10',
      language: 'en',
      format: 'json',
    }).toString()}`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { results?: unknown };
    const results: Record<string, unknown>[] = Array.isArray(body.results)
      ? body.results.filter(
          (entry): entry is Record<string, unknown> =>
            typeof entry === 'object' && entry !== null,
        )
      : [];
    const top =
      results.find((entry) =>
        matchesRest(rest, toText(entry.admin1), toText(entry.country)),
      ) ?? results[0];
    const cityName = top ? toText(top.name) : null;
    if (!top || !cityName) return null;
    if (!isNumber(top.latitude) || !isNumber(top.longitude)) return null;
    return remember(key, {
      name: cityName,
      region: toText(top.admin1),
      country: toText(top.country),
      latitude: top.latitude,
      longitude: top.longitude,
      timezone: toText(top.timezone),
    });
  } catch {
    return null;
  }
}
