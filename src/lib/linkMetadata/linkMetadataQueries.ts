import { queryOptions } from '@tanstack/react-query';

import { DAY_MS } from '@/lib/query/queryClient';

import { fetchLinkMetadata } from './fetchLinkMetadata';

export const linkMetadataQueryKeys = {
  all: ['linkMetadata'] as const,
  byUrl: (url: string) => [...linkMetadataQueryKeys.all, url] as const,
};

export function linkMetadataQueryOptions(url: string) {
  return queryOptions({
    queryKey: linkMetadataQueryKeys.byUrl(url),
    queryFn: () => fetchLinkMetadata(url),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    retry: false,
  });
}
