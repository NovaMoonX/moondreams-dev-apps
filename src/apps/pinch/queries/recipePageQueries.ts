import { pageContentQueryOptions } from '@/lib/pageContent/pageContentQueries';

/** What a recipe reading needs from a page: its text, its title and description, and any Recipe data it publishes. */
export function recipePageQueryOptions(url: string) {
  return pageContentQueryOptions({
    url,
    include: ['text', 'meta', 'structuredData'],
    schemaTypes: ['Recipe'],
  });
}
