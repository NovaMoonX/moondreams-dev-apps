import { pageContentQueryOptions } from '@/lib/pageContent/pageContentQueries';
import { IDEA_LOOKUP_TIMEOUT_MS } from '@apps/pinch/constants';

/** A page's title, site name and picture address: all an idea keeps from a link. */
export function ideaPageQueryOptions(url: string) {
  return pageContentQueryOptions(
    { url, include: ['meta'] },
    { timeoutMs: IDEA_LOOKUP_TIMEOUT_MS },
  );
}
