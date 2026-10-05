import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import { DAY_MS } from '@/lib/query/queryClient';
import { normalizeString } from '@/utils/stringUtils';
import { THEATRE_STALE_MS } from '@apps/a-list/constants';
import type { TheatreSearchResult } from '@apps/a-list/types';

export type TheatreSearch =
  | { kind: 'text'; query: string }
  | { kind: 'coordinates'; latitude: number; longitude: number };

interface FindTheatresResponse {
  theatres: TheatreSearchResult[];
  area: string | null;
}

const findTheatresCallable = httpsCallable<
  { query: string } | { latitude: number; longitude: number },
  FindTheatresResponse
>(functions, 'findTheatres');

export const theatreQueryKeys = {
  all: ['a-list', 'theatres'] as const,
  find: (search: TheatreSearch) =>
    [
      ...theatreQueryKeys.all,
      'find',
      'v1',
      search.kind === 'text'
        ? normalizeString(search.query)
        : `${search.latitude},${search.longitude}`,
    ] as const,
};

// Not persisted: the key can hold the member's position, which should not outlive the session.
export function findTheatresQueryOptions(search: TheatreSearch) {
  return queryOptions({
    queryKey: theatreQueryKeys.find(search),
    queryFn: async () => {
      const result = await findTheatresCallable(
        search.kind === 'text'
          ? { query: normalizeString(search.query) }
          : { latitude: search.latitude, longitude: search.longitude },
      );
      return result.data;
    },
    staleTime: THEATRE_STALE_MS,
    gcTime: DAY_MS,
    retry: false,
  });
}
