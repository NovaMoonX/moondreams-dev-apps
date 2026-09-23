import { queryOptions } from '@tanstack/react-query';

import { fetchLinkMetadata } from './fetchLinkMetadata';

export const linkMetadataQueryKeys = {
  all: ['linkMetadata'] as const,
  byUrl: (url: string) => [...linkMetadataQueryKeys.all, url] as const,
};

export function linkMetadataQueryOptions(url: string) {
  return queryOptions({
    queryKey: linkMetadataQueryKeys.byUrl(url),
    queryFn: () => fetchLinkMetadata(url),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}
