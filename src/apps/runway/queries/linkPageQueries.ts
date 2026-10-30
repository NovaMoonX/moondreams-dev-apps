import { pageContentQueryOptions } from '@/lib/pageContent/pageContentQueries';
import { LINK_LOOKUP_TIMEOUT_MS } from '@apps/runway/constants';

export function linkPageQueryOptions(url: string) {
  return pageContentQueryOptions(
    { url, include: ['meta'] },
    { timeoutMs: LINK_LOOKUP_TIMEOUT_MS },
  );
}
