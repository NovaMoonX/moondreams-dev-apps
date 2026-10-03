import { getApps, initializeApp } from 'firebase-admin/app';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { reserveLookup } from './lookupBudget.js';
import { isFresh, readCache, writeCache } from './movieCache.js';
import { getOmdbTitle } from './omdb.js';
import { OMDB_API_KEY } from './searchMovies.js';
import type { MovieSnapshot } from './types.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
const RELEASED_CACHE_MS = 30 * DAY_MS;
// Unreleased (or undated) movies are the ones whose dates move, so they're re-checked daily.
const UNRELEASED_CACHE_MS = DAY_MS;
const MOVIE_KEY_PATTERN = /^imdb-(tt[0-9]{7,10})$/;

function getCacheAge(movie: MovieSnapshot) {
  const isReleased = movie.releaseDate !== null && movie.releaseDate <= Date.now();
  return isReleased ? RELEASED_CACHE_MS : UNRELEASED_CACHE_MS;
}

export const getMovie = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [OMDB_API_KEY],
    cors: ['https://apps.moondreams.dev', /^https:\/\/moondreams-dev-apps.*\.web\.app$/],
  },
  async (request): Promise<MovieSnapshot> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to look up a movie.');
    }

    const movieKey = typeof request.data?.movieKey === 'string' ? request.data.movieKey : '';
    const imdbId = movieKey.match(MOVIE_KEY_PATTERN)?.[1];
    if (!imdbId) {
      throw new HttpsError('invalid-argument', 'That movie id is not valid.');
    }

    const cached = await readCache<MovieSnapshot>('movieCache', movieKey);
    if (cached && isFresh(cached, getCacheAge(cached.value))) {
      return cached.value;
    }

    await reserveLookup(uid);
    const movie = await getOmdbTitle(OMDB_API_KEY.value(), imdbId);
    await writeCache('movieCache', movieKey, movie);
    return movie;
  },
);
