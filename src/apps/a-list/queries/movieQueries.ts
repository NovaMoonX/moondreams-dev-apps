import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import { DAY_MS } from '@/lib/query/queryClient';
import { normalizeString } from '@/utils/stringUtils';
import { MOVIE_DETAILS_STALE_MS } from '@apps/a-list/constants';
import type { MovieSearchResult, MovieSnapshot } from '@apps/a-list/types';

const searchMoviesCallable = httpsCallable<
  { query: string },
  { results: MovieSearchResult[] }
>(functions, 'searchMovies');
const getMovieCallable = httpsCallable<{ movieKey: string }, MovieSnapshot>(
  functions,
  'getMovie',
);

export const movieQueryKeys = {
  all: ['a-list', 'movies'] as const,
  search: (query: string) =>
    [...movieQueryKeys.all, 'search', 'v2', normalizeString(query)] as const,
  details: (movieKey: string) =>
    [...movieQueryKeys.all, 'details', movieKey] as const,
};

// Both reach a third party through the shared, budgeted lookup functions and hold only
// public movie data, so they persist: a repeat is free and works with poor signal.
export function movieSearchQueryOptions(query: string) {
  return queryOptions({
    queryKey: movieQueryKeys.search(query),
    queryFn: async () => {
      const result = await searchMoviesCallable({
        query: normalizeString(query),
      });
      return result.data.results;
    },
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    retry: false,
    meta: { persist: true },
  });
}

export function movieDetailsQueryOptions(movieKey: string) {
  return queryOptions({
    queryKey: movieQueryKeys.details(movieKey),
    queryFn: async () => {
      const result = await getMovieCallable({ movieKey });
      return result.data;
    },
    staleTime: MOVIE_DETAILS_STALE_MS,
    gcTime: DAY_MS,
    retry: false,
    meta: { persist: true },
  });
}
