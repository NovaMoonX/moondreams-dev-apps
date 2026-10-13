import { queryOptions } from '@tanstack/react-query';

import { fetchPageContent } from './fetchPageContent';

export const pageContentQueryKeys = {
  all: ['pageContent'] as const,
  byUrl: (url: string) => [...pageContentQueryKeys.all, url] as const,
};

/** A page read once for a form: kept a few minutes so a retry of a failed reading doesn't refetch it, never persisted. */
export function pageContentQueryOptions(url: string) {
  return queryOptions({
    queryKey: pageContentQueryKeys.byUrl(url),
    queryFn: () => fetchPageContent(url),
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}
