import { queryOptions } from '@tanstack/react-query';

import { searchCities } from './cityApi';

const CITY_STALE_MS = 24 * 60 * 60 * 1000;

export const cityQueryKeys = {
  all: ['cities'] as const,
  search: (query: string) => [...cityQueryKeys.all, 'search', query.trim().toLowerCase()] as const,
};

export function citySearchQueryOptions(query: string) {
  return queryOptions({
    queryKey: cityQueryKeys.search(query),
    queryFn: () => searchCities(query.trim()),
    staleTime: CITY_STALE_MS,
    retry: false,
    meta: { persist: true },
  });
}
