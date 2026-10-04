import { getApps, initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { reserveLookup } from './lookupBudget.js';
import { isFresh, readCache, writeCache } from './movieCache.js';
import { OMDB_API_KEY, resolveMovieKey, TMDB_API_KEY } from './movieProvider.js';
import type { MovieSnapshot } from './types.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
const RELEASED_CACHE_MS = 30 * DAY_MS;
// Unreleased (or undated) movies are the ones whose dates move, so they're re-checked daily.
const UNRELEASED_CACHE_MS = DAY_MS;

function getCacheAge(movie: MovieSnapshot) {
  const isReleased = movie.releaseDate !== null && movie.releaseDate <= Date.now();
  return isReleased ? RELEASED_CACHE_MS : UNRELEASED_CACHE_MS;
}

export const getMovie = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [OMDB_API_KEY, TMDB_API_KEY],
    cors: ['https://apps.moondreams.dev', /^https:\/\/moondreams-dev-apps.*\.web\.app$/],
  },
  async (request): Promise<MovieSnapshot> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to look up a movie.');
    }

    const movieKey = typeof request.data?.movieKey === 'string' ? request.data.movieKey : '';
    const resolved = resolveMovieKey(movieKey);
    if (!resolved) {
      throw new HttpsError('invalid-argument', 'That movie id is not valid.');
    }

    const cached = await readCache<MovieSnapshot>('movieCache', movieKey);
    if (cached && isFresh(cached, getCacheAge(cached.value))) {
      return cached.value;
    }

    const { provider, providerId } = resolved;
    if (provider.isBudgeted) {
      await reserveLookup(uid);
    }
    const movie = await provider.getTitle(provider.getKey(), providerId);
    await writeCache('movieCache', movieKey, movie);
    return movie;
  },
);
