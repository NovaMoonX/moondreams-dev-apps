import { getApps, initializeApp } from 'firebase-admin/app';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { reserveLookup } from './lookupBudget.js';
import { isFresh, readCache, toCacheId, writeCache } from './movieCache.js';
import { searchOmdb } from './omdb.js';
import type { MovieSearchResult } from './types.js';

if (getApps().length === 0) {
  initializeApp();
}

export const OMDB_API_KEY = defineSecret('OMDB_API_KEY');

const SEARCH_CACHE_MS = 7 * 86_400_000;
// Bump when the shape or order of results changes, so older cached searches are not served.
const SEARCH_CACHE_VERSION = 2;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

export const searchMovies = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [OMDB_API_KEY],
    cors: ['https://apps.moondreams.dev', /^https:\/\/moondreams-dev-apps.*\.web\.app$/],
  },
  async (request): Promise<{ results: MovieSearchResult[] }> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to search for movies.');
    }

    const rawQuery = typeof request.data?.query === 'string' ? request.data.query : '';
    const query = rawQuery.trim().replace(/\s+/g, ' ').toLowerCase();
    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      throw new HttpsError('invalid-argument', 'Search for a title between 2 and 100 characters.');
    }

    const cacheId = toCacheId(`v${SEARCH_CACHE_VERSION}:${query}`);
    const cached = await readCache<MovieSearchResult[]>('searchCache', cacheId);
    if (cached && isFresh(cached, SEARCH_CACHE_MS)) {
      return { results: cached.value };
    }

    const results = await searchOmdb(OMDB_API_KEY.value(), query, () => reserveLookup(uid));
    await writeCache('searchCache', cacheId, results);
    return { results };
  },
);
