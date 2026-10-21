import { getApps, initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { isFresh, readCache, toCacheId, writeCache } from './movieCache.js';
import { OMDB_API_KEY, pickProvider, TMDB_API_KEY } from './movieProvider.js';
import type { PopularMovie } from './types.js';

if (getApps().length === 0) {
  initializeApp();
}

const POPULAR_CACHE_MS = 86_400_000;
// Bump when the shape or order of results changes, so older cached lists are not served.
const POPULAR_CACHE_VERSION = 3;

export const getPopularMovies = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [OMDB_API_KEY, TMDB_API_KEY],
    cors: ['https://apps.moondreams.dev', /^https:\/\/moondreams-dev-apps.*\.web\.app$/],
  },
  async (request): Promise<{ results: PopularMovie[] }> => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to see popular movies.');
    }

    const provider = pickProvider();
    const cacheId = toCacheId(`${provider.id}:popular:v${POPULAR_CACHE_VERSION}`);
    const cached = await readCache<PopularMovie[]>('searchCache', cacheId);
    if (cached && isFresh(cached, POPULAR_CACHE_MS)) {
      return { results: cached.value };
    }

    const results = await provider.popular(provider.getKey());
    // An empty answer is not cached, so a parsing gap or a provider without a list doesn't stick for a day.
    if (results.length > 0) {
      await writeCache('searchCache', cacheId, results);
    }
    return { results };
  },
);
