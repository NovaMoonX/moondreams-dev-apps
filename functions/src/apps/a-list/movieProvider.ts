import { defineSecret } from 'firebase-functions/params';

import { getOmdbTitle, searchOmdb } from './omdb.js';
import { getTmdbTitle, searchTmdb } from './tmdb.js';
import type { MovieSearchResult, MovieSnapshot } from './types.js';

export const OMDB_API_KEY = defineSecret('OMDB_API_KEY');
export const TMDB_API_KEY = defineSecret('TMDB_API_KEY');

export interface MovieProvider {
  id: 'tmdb' | 'omdb';
  /** Only OMDb's free key is rationed; see lookupBudget.ts. */
  isBudgeted: boolean;
  getKey: () => string;
  search: (apiKey: string, query: string, beforeUpstreamCall: () => Promise<void>) => Promise<MovieSearchResult[]>;
  getTitle: (apiKey: string, providerId: string) => Promise<MovieSnapshot>;
}

const PROVIDERS: Record<MovieProvider['id'], MovieProvider> = {
  tmdb: { id: 'tmdb', isBudgeted: false, getKey: () => TMDB_API_KEY.value(), search: searchTmdb, getTitle: getTmdbTitle },
  omdb: { id: 'omdb', isBudgeted: true, getKey: () => OMDB_API_KEY.value(), search: searchOmdb, getTitle: getOmdbTitle },
};

/** TMDB whenever its key is set, otherwise OMDb; `MOVIE_PROVIDER=omdb|tmdb` forces one. */
export function pickProvider(): MovieProvider {
  const forced = process.env.MOVIE_PROVIDER;
  if (forced === 'omdb' || forced === 'tmdb') {
    return PROVIDERS[forced];
  }

  const result = TMDB_API_KEY.value() ? PROVIDERS.tmdb : PROVIDERS.omdb;
  return result;
}

const KEY_PATTERNS: Array<{ provider: MovieProvider['id']; pattern: RegExp }> = [
  { provider: 'omdb', pattern: /^imdb-(tt[0-9]{7,10})$/ },
  { provider: 'tmdb', pattern: /^tmdb-([0-9]{1,9})$/ },
];

/** A saved movie keeps asking the provider that issued its key, whichever one is the default now. */
export function resolveMovieKey(movieKey: string): { provider: MovieProvider; providerId: string } | null {
  const match = KEY_PATTERNS.map(({ provider, pattern }) => ({ provider, id: movieKey.match(pattern)?.[1] })).find(
    ({ id }) => id,
  );
  const result = match?.id ? { provider: PROVIDERS[match.provider], providerId: match.id } : null;
  return result;
}
