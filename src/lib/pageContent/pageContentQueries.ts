import { queryOptions } from '@tanstack/react-query';

import {
  fetchPageContent,
  type PageContentOptions,
  type PageContentRequest,
} from './fetchPageContent';

export const pageContentQueryKeys = {
  all: ['pageContent'] as const,
  byRequest: ({
    url,
    include,
    schemaTypes,
    maxTextChars,
  }: PageContentRequest) =>
    [
      ...pageContentQueryKeys.all,
      url,
      include?.join(',') ?? '',
      schemaTypes?.join(',') ?? '',
      maxTextChars ?? 0,
    ] as const,
};

/** A page read once for a screen: kept a few minutes so a retry of the same request isn't fetched again, never persisted. */
export function pageContentQueryOptions(
  request: PageContentRequest,
  options: PageContentOptions = {},
) {
  return queryOptions({
    queryKey: pageContentQueryKeys.byRequest(request),
    queryFn: () => fetchPageContent(request, options),
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}
