import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';

import type { TheatreResult } from './types.js';

export const AMC_API_KEY = defineSecret('AMC_API_KEY');

const FETCH_TIMEOUT_MS = 6000;
const MAX_THEATRES = 10;
const NOT_SET_UP = "Theater search isn't set up yet.";

interface AmcLink {
  href?: string;
}

interface AmcSuggestionsResponse {
  _embedded?: { suggestions?: Array<{ title?: string; _links?: Record<string, AmcLink | undefined> }> };
}

interface AmcTheatre {
  id?: number | string;
  name?: string;
  timezone?: string;
  location?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface AmcLocationsResponse {
  _embedded?: Record<string, Array<{ distance?: number; _embedded?: Record<string, AmcTheatre | undefined> }> | undefined>;
}

function getBaseUrl() {
  return process.env.AMC_API_BASE || 'https://api.amctheatres.com';
}

// Without a key, the local emulator answers from these so the whole flow can be driven offline.
export function isFixtureMode(apiKey: string) {
  return !apiKey && process.env.FUNCTIONS_EMULATOR === 'true';
}

async function callAmc<T>(apiKey: string, path: string, params: Record<string, string>): Promise<T> {
  if (!apiKey) {
    throw new HttpsError('failed-precondition', NOT_SET_UP);
  }

  const url = new URL(`${getBaseUrl()}${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));

  try {
    const response = await fetch(url, {
      headers: { 'X-AMC-Vendor-Key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      throw new HttpsError('failed-precondition', NOT_SET_UP);
    }
    if (response.status === 429) {
      throw new HttpsError('resource-exhausted', 'Theater search is resting for today. Try again tomorrow.');
    }
    if (!response.ok) {
      throw new HttpsError('unavailable', 'Theater search is unavailable right now.');
    }
    const result = (await response.json()) as T;
    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    // The request carries the key, so neither the URL nor the raw error is logged.
    throw new HttpsError('unavailable', 'Theater search is unavailable right now.');
  }
}

export interface AmcPoint {
  latitude: number;
  longitude: number;
  /** What AMC matched the search text to, like "Overland Park, KS". */
  area: string | null;
}

const FIXTURE_POINT: AmcPoint = { latitude: 38.98, longitude: -94.67, area: 'Overland Park, KS' };

/** AMC's location suggestions turn text (a zip code, a city) into the coordinates its theater lookup needs. */
export async function suggestPoint(apiKey: string, query: string): Promise<AmcPoint | null> {
  if (isFixtureMode(apiKey)) {
    return FIXTURE_POINT;
  }

  const data = await callAmc<AmcSuggestionsResponse>(apiKey, '/v2/location-suggestions', { query });
  const points = (data._embedded?.suggestions ?? []).flatMap((suggestion) =>
    Object.values(suggestion._links ?? {}).flatMap((link) => {
      const params = toSearchParams(link?.href);
      const latitude = Number(params?.get('latitude') || Number.NaN);
      const longitude = Number(params?.get('longitude') || Number.NaN);
      return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? [{ latitude, longitude, area: suggestion.title ?? null }]
        : [];
    }),
  );
  return points[0] ?? null;
}

function toSearchParams(href: string | undefined) {
  try {
    return href ? new URL(href, getBaseUrl()).searchParams : null;
  } catch {
    return null;
  }
}

function toText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toTimeZone(value: unknown) {
  const zone = toText(value);
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

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTheatreResult(theatre: AmcTheatre | undefined, distance: unknown): TheatreResult | null {
  const theatreId = String(theatre?.id ?? '');
  const name = toText(theatre?.name);
  if (!/^[0-9]{1,8}$/.test(theatreId) || !name) {
    return null;
  }

  const result: TheatreResult = {
    theatreId,
    name,
    addressLine: toText(theatre?.location?.addressLine1),
    city: toText(theatre?.location?.city),
    state: toText(theatre?.location?.state),
    postalCode: toText(theatre?.location?.postalCode),
    latitude: toNumber(theatre?.location?.latitude),
    longitude: toNumber(theatre?.location?.longitude),
    timeZone: toTimeZone(theatre?.timezone),
    distanceMiles: toNumber(distance),
  };
  return result;
}

const FIXTURE_THEATRES: TheatreResult[] = [
  ['2105', 'AMC Town Center 20', '4701 Town Center Dr', 'Leawood', 'KS', '66211', 38.9, -94.62, 4.1],
  ['2078', 'AMC Dine-In Mission Valley 20', '5000 Metcalf Ave', 'Overland Park', 'KS', '66202', 38.99, -94.66, 1.2],
  ['2236', 'AMC Barrywoods 24', '8600 N Church Rd', 'Kansas City', 'MO', '64157', 39.25, -94.57, 19.4],
].map(([theatreId, name, addressLine, city, state, postalCode, latitude, longitude, distanceMiles]) => ({
  timeZone: 'America/Chicago',
  theatreId: theatreId as string,
  name: name as string,
  addressLine: addressLine as string,
  city: city as string,
  state: state as string,
  postalCode: postalCode as string,
  latitude: latitude as number,
  longitude: longitude as number,
  distanceMiles: distanceMiles as number,
}));

/** The closest theaters to a point, nearest first. */
export async function findNearbyTheatres(apiKey: string, latitude: number, longitude: number): Promise<TheatreResult[]> {
  if (isFixtureMode(apiKey)) {
    return FIXTURE_THEATRES;
  }

  const data = await callAmc<AmcLocationsResponse>(apiKey, '/v2/locations', {
    latitude: String(latitude),
    longitude: String(longitude),
    'page-size': String(MAX_THEATRES),
  });
  const locations = Object.values(data._embedded ?? {}).flatMap((entries) => entries ?? []);
  const result = locations
    .map((location) =>
      toTheatreResult(
        Object.values(location._embedded ?? {}).find((embedded) => embedded?.id !== undefined),
        location.distance,
      ),
    )
    .filter((theatre): theatre is TheatreResult => theatre !== null)
    .slice(0, MAX_THEATRES);
  return result;
}
