import { queryOptions } from '@tanstack/react-query';

import {
  fetchPageContent,
  type PageContentRequest,
} from '@/lib/pageContent/fetchPageContent';
import { BotCheckError, isBotCheckPage } from '@/lib/pageContent/botCheck';
import { pageContentQueryKeys } from '@/lib/pageContent/pageContentQueries';

const request = (url: string): PageContentRequest => ({
  url,
  include: ['text', 'meta', 'structuredData'],
  schemaTypes: ['Product'],
});

/** A product page's text, title, description and any Product data it publishes. */
export function productPageQueryOptions(url: string) {
  return queryOptions({
    queryKey: pageContentQueryKeys.byRequest(request(url)),
    queryFn: async () => {
      const page = await fetchPageContent(request(url)).catch(
        (error: unknown) => {
          // Page data a function build can't encode for the browser shouldn't cost the whole reading: the text is enough.
          if (!/cannot be decoded/i.test(String(error))) {
            throw error;
          }
          console.warn('Reading the page without its published data', error);
          return fetchPageContent({ url, include: ['text', 'meta'] });
        },
      );
      if (isBotCheckPage(page)) {
        throw new BotCheckError();
      }
      return page;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
  });
}
