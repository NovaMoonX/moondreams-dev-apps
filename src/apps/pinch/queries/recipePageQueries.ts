import { queryOptions } from '@tanstack/react-query';

import {
  fetchPageContent,
  type PageContentRequest,
} from '@/lib/pageContent/fetchPageContent';
import { pageContentQueryKeys } from '@/lib/pageContent/pageContentQueries';

const request = (url: string): PageContentRequest => ({
  url,
  include: ['text', 'meta', 'structuredData'],
  schemaTypes: ['Recipe'],
});

/** What a recipe reading needs from a page: its text, its title and description, and any Recipe data it publishes. */
export function recipePageQueryOptions(url: string) {
  return queryOptions({
    queryKey: pageContentQueryKeys.byRequest(request(url)),
    queryFn: () =>
      fetchPageContent(request(url)).catch((error: unknown) => {
        // Page data a function build can't encode for the browser shouldn't cost the whole reading: the text is enough.
        if (!/cannot be decoded/i.test(String(error))) throw error;
        console.warn('Reading the page without its published data', error);
        return fetchPageContent({ url, include: ['text', 'meta'] });
      }),
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}
