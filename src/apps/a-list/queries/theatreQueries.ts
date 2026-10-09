import { queryOptions } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase/config';
import { DAY_MS } from '@/lib/query/queryClient';
import { normalizeString } from '@/utils/stringUtils';
import { THEATRE_STALE_MS } from '@apps/a-list/constants';
import type { TheatrePlace, TheatreSearchResult } from '@apps/a-list/types';

export type TheatreSearch =
  | { kind: 'text'; query: string }
  | { kind: 'coordinates'; latitude: number; longitude: number }
  | { kind: 'state'; state: string };

interface FindTheatresResponse {
  theatres: TheatreSearchResult[];
  places: TheatrePlace[];
  area: string | null;
}

const findTheatresCallable = httpsCallable<
  | { query: string }
  | { latitude: number; longitude: number }
  | { state: string },
  FindTheatresResponse
>(functions, 'findTheatres');

const getSearchKey = (search: TheatreSearch) => {
  if (search.kind === 'text') return normalizeString(search.query);
  if (search.kind === 'state') return `state:${search.state}`;
  return `${search.latitude},${search.longitude}`;
};

const getSearchPayload = (search: TheatreSearch) => {
  if (search.kind === 'text') return { query: normalizeString(search.query) };
  if (search.kind === 'state') return { state: search.state };
  return { latitude: search.latitude, longitude: search.longitude };
};

export const theatreQueryKeys = {
  all: ['a-list', 'theatres'] as const,
  find: (search: TheatreSearch) =>
    [...theatreQueryKeys.all, 'find', 'v2', getSearchKey(search)] as const,
};

// Not persisted: the key can hold the member's position, which should not outlive the session.
export function findTheatresQueryOptions(search: TheatreSearch) {
  return queryOptions({
    queryKey: theatreQueryKeys.find(search),
    queryFn: async () => {
      const result = await findTheatresCallable(getSearchPayload(search));
      return result.data;
    },
    staleTime: THEATRE_STALE_MS,
    gcTime: DAY_MS,
    retry: false,
  });
}
