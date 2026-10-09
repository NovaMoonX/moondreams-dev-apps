import { getApps, initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  AMC_API_KEY,
  findNearbyTheatres,
  findStateTheatres,
  isFixtureMode,
  listAllTheatres,
  suggestPlaces,
  type AmcPlace,
} from './amc.js';
import { reserveLookup, THEATRE_BUDGET } from './lookupBudget.js';
import { isFresh, readCache, toCacheId, writeCache } from './movieCache.js';
import type { TheatreResult } from './types.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
const POINT_CACHE_MS = 30 * DAY_MS;
const NEARBY_CACHE_MS = 7 * DAY_MS;
const ALL_CACHE_MS = 7 * DAY_MS;
// Bump when the shape of results changes, so older cached lookups are not served.
const CACHE_VERSION = 3;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 60;
const MAX_NAME_MATCHES = 6;
const MAX_PLACES = 5;

interface FindTheatresResponse {
  theatres: TheatreResult[];
  /** The zip codes, cities and states a typed name could mean, for the member to confirm. */
  places: AmcPlace[];
  /** What the search was matched to; null for a search by coordinates or a typed name. */
  area: string | null;
}

function toCoordinate(value: unknown, limit: number) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function toWords(text: string) {
  const result = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return result;
}

export const findTheatres = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [AMC_API_KEY],
    cors: ['https://apps.moondreams.dev', /^https:\/\/moondreams-dev-apps.*\.web\.app$/],
  },
  async (request): Promise<FindTheatresResponse> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to find theaters.');
    }

    const apiKey = AMC_API_KEY.value();
    const rawQuery = typeof request.data?.query === 'string' ? request.data.query : '';
    const query = rawQuery.trim().replace(/\s+/g, ' ').toLowerCase();
    const latitude = toCoordinate(request.data?.latitude, 90);
    const longitude = toCoordinate(request.data?.longitude, 180);
    const state = typeof request.data?.state === 'string' && /^[a-z0-9-]{2,40}$/.test(request.data.state) ? request.data.state : null;

    const cached = async <T>(key: string, maxAgeMs: number, load: () => Promise<T | null>, isWorthKeeping: (value: T) => boolean) => {
      const cacheId = toCacheId(`v${CACHE_VERSION}:${key}`);
      const entry = await readCache<T>('theatreCache', cacheId);
      if (entry && isFresh(entry, maxAgeMs)) {
        return entry.value;
      }

      await reserveLookup(uid, THEATRE_BUDGET);
      const value = await load();
      // An empty answer is never kept: it may be a parsing gap or one bad response, and would stick for weeks.
      if (value !== null && isWorthKeeping(value) && !isFixtureMode(apiKey)) {
        await writeCache('theatreCache', cacheId, value);
      }
      return value;
    };

    const nearby = async (pointLatitude: number, pointLongitude: number) => {
      // About a kilometre of precision is plenty to rank the nearest theaters, and every member in a cell then shares the same answer.
      const cellLatitude = Math.round(pointLatitude * 100) / 100;
      const cellLongitude = Math.round(pointLongitude * 100) / 100;
      const theatres = await cached(
        `near:${cellLatitude},${cellLongitude}`,
        NEARBY_CACHE_MS,
        () => findNearbyTheatres(apiKey, cellLatitude, cellLongitude),
        (value) => value.length > 0,
      );
      return theatres ?? [];
    };

    if (latitude !== null && longitude !== null) {
      return { theatres: await nearby(latitude, longitude), places: [], area: null };
    }

    if (state) {
      const theatres = await cached(`state:${state}`, NEARBY_CACHE_MS, () => findStateTheatres(apiKey, state), (value) => value.length > 0);
      return { theatres: theatres ?? [], places: [], area: null };
    }

    const zip = query.match(/^([0-9]{5})(-[0-9]{4})?$/)?.[1] ?? null;
    if (/^[0-9-]+$/.test(query) && !zip) {
      throw new HttpsError('invalid-argument', 'Zip codes are 5 digits.');
    }
    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      throw new HttpsError('invalid-argument', 'Enter a zip code or city, or use your location.');
    }

    const places = (
      (await cached(`places:${zip ?? query}`, POINT_CACHE_MS, () => suggestPlaces(apiKey, zip ?? query), (value) => value.length > 0)) ?? []
    ).slice(0, MAX_PLACES);

    if (zip) {
      const point = places.find((place) => place.latitude !== null && place.longitude !== null);
      if (!point || point.latitude === null || point.longitude === null) {
        return { theatres: [], places: [], area: null };
      }
      return { theatres: await nearby(point.latitude, point.longitude), places: [], area: point.label };
    }

    const everyTheatre = (await cached('all', ALL_CACHE_MS, () => listAllTheatres(apiKey), (value) => value.length > 0)) ?? [];
    // "amc" is on every theater, so it narrows nothing; a search of only that matches no theater by name.
    const words = toWords(query).filter((word) => word !== 'amc');
    const matches = (words.length === 0 ? [] : everyTheatre)
      .filter((theatre) => {
        const nameWords = toWords(theatre.name);
        return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)));
      })
      .slice(0, MAX_NAME_MATCHES);
    return { theatres: matches, places, area: null };
  },
);
