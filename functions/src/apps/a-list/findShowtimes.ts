import { getApps, initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { AMC_API_KEY, fetchShowtimeDay, pickMovieShowtimes, type DayShowtime } from './amc.js';
import { reserveLookup, THEATRE_BUDGET } from './lookupBudget.js';
import { isFresh, readCache, toCacheId, writeCache } from './movieCache.js';
import type { ShowtimeOption } from './types.js';

if (getApps().length === 0) {
  initializeApp();
}

// Prices and sold-out flags move through the day, so a day's showings are only kept briefly.
const SHOWTIMES_CACHE_MS = 15 * 60_000;
// Bump when the shape of results changes, so older cached lookups are not served.
const CACHE_VERSION = 1;
const MAX_TITLE_LENGTH = 200;

export const findShowtimes = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 45,
    secrets: [AMC_API_KEY],
    cors: ['https://apps.moondreams.dev', /^https:\/\/moondreams-dev-apps.*\.web\.app$/],
  },
  async (request): Promise<{ showtimes: ShowtimeOption[] }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to look up showtimes.');
    }

    const theatreId = typeof request.data?.theatreId === 'string' ? request.data.theatreId : '';
    const date = typeof request.data?.date === 'string' ? request.data.date : '';
    const title = typeof request.data?.title === 'string' ? request.data.title.trim() : '';
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
    if (!/^[0-9]{1,8}$/.test(theatreId) || !isValidDate || title.length === 0 || title.length > MAX_TITLE_LENGTH) {
      throw new HttpsError('invalid-argument', 'Pick a theater, a day and a movie to look up showtimes.');
    }

    // The whole day is cached once per theater, so every movie asked about that day shares one upstream call.
    const cacheId = toCacheId(`v${CACHE_VERSION}:showtimes:${theatreId}:${date}`);
    const cached = await readCache<DayShowtime[]>('theatreCache', cacheId);
    if (cached && isFresh(cached, SHOWTIMES_CACHE_MS)) {
      return { showtimes: pickMovieShowtimes(cached.value, title) };
    }

    await reserveLookup(uid, THEATRE_BUDGET);
    const day = await fetchShowtimeDay(AMC_API_KEY.value(), theatreId, date);
    await writeCache('theatreCache', cacheId, day);
    return { showtimes: pickMovieShowtimes(day, title) };
  },
);
