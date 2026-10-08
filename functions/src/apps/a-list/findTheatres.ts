import { getApps, initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { AMC_API_KEY, findNearbyTheatres, isFixtureMode, suggestPoint, type AmcPoint } from './amc.js';
import { reserveLookup, THEATRE_BUDGET } from './lookupBudget.js';
import { isFresh, readCache, toCacheId, writeCache } from './movieCache.js';
import type { TheatreResult } from './types.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
const POINT_CACHE_MS = 30 * DAY_MS;
const NEARBY_CACHE_MS = 7 * DAY_MS;
// Bump when the shape of results changes, so older cached lookups are not served.
const CACHE_VERSION = 2;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 60;

interface FindTheatresResponse {
  theatres: TheatreResult[];
  /** What the search text was matched to; null for a search by coordinates. */
  area: string | null;
}

function toCoordinate(value: unknown, limit: number) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
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

    const resolvePoint = async (): Promise<AmcPoint | null> => {
      if (latitude !== null && longitude !== null) {
        return { latitude, longitude, area: null };
      }
      if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
        throw new HttpsError('invalid-argument', 'Enter a zip code or city, or use your location.');
      }

      const cacheId = toCacheId(`v${CACHE_VERSION}:point:${query}`);
      const cached = await readCache<AmcPoint | null>('theatreCache', cacheId);
      if (cached && isFresh(cached, POINT_CACHE_MS)) {
        return cached.value;
      }

      await reserveLookup(uid, THEATRE_BUDGET);
      const point = await suggestPoint(apiKey, query);
      // An empty answer is never kept: it may be a parsing gap or one bad response, and would stick for weeks.
      if (point && !isFixtureMode(apiKey)) {
        await writeCache('theatreCache', cacheId, point);
      }
      return point;
    };

    const point = await resolvePoint();
    if (!point) {
      return { theatres: [], area: null };
    }

    // About a kilometre of precision is plenty to rank the nearest theaters, and every member in a cell then shares the same answer.
    const cellLatitude = Math.round(point.latitude * 100) / 100;
    const cellLongitude = Math.round(point.longitude * 100) / 100;
    const cacheId = toCacheId(`v${CACHE_VERSION}:near:${cellLatitude},${cellLongitude}`);
    const cached = await readCache<TheatreResult[]>('theatreCache', cacheId);
    if (cached && isFresh(cached, NEARBY_CACHE_MS)) {
      return { theatres: cached.value, area: point.area };
    }

    await reserveLookup(uid, THEATRE_BUDGET);
    const theatres = await findNearbyTheatres(apiKey, cellLatitude, cellLongitude);
    if (theatres.length > 0 && !isFixtureMode(apiKey)) {
      await writeCache('theatreCache', cacheId, theatres);
    }
    return { theatres, area: point.area };
  },
);
