import { pageContentQueryOptions } from '@/lib/pageContent/pageContentQueries';
import { IDEA_LOOKUP_TIMEOUT_MS } from '@apps/pinch/constants';

export function ideaPageQueryOptions(url: string) {
  return pageContentQueryOptions(
    { url, include: ['meta'] },
    { timeoutMs: IDEA_LOOKUP_TIMEOUT_MS },
  );
}
