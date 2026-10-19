import { createHash } from 'node:crypto';

import {
  ImageSearchError,
  ProviderFailure,
  type FetchLike,
  type ImageProvider,
  type ImageResult,
  type ProviderQuota,
} from './types.js';

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;
// "Nothing found" is kept only ten minutes, so a gap in a provider never sticks; a failure is never kept.

export const RESULTS_TTL_MS = 7 * 86_400_000;
export const EMPTY_TTL_MS = 10 * 60_000;
export const SEARCH_DEADLINE_MS = 10_000;
// Bump when the shape of results changes, so an older cached answer is not served.

const CACHE_VERSION = 1;

export const normalizeQuery = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH).trim()
    : '';

/** The provider list is part of the key, so changing it takes effect at once instead of serving the old list's answers. */
export const getCacheId = (query: string, providerIds: string[]) =>
  createHash('sha256')
    .update(`v${CACHE_VERSION}|${providerIds.join(',')}|${query.toLowerCase()}`)
    .digest('hex')
    .slice(0, 40);

export interface CacheEntry {
  results: ImageResult[];
  cachedAt: number;
}

export const isCacheFresh = (entry: CacheEntry, now: number) =>
  now - entry.cachedAt <=
  (entry.results.length > 0 ? RESULTS_TTL_MS : EMPTY_TTL_MS);

export interface SearchDeps {
  providers: ImageProvider[];
  fetch: FetchLike;
  now: () => number;
  cache: {
    get: (id: string) => Promise<CacheEntry | null>;
    set: (id: string, entry: CacheEntry) => Promise<void>;
  };
  reserve: (providerId: string, quota: ProviderQuota) => Promise<boolean>;
  takeTurn: () => Promise<boolean>;
  log: (message: string, detail: Record<string, string>) => void;
  timeouts?: { searchMs: number; requestMs: number };
}

type Attempt = 'skipped' | 'failed' | ImageResult[];

const tryProvider = async (
  provider: ImageProvider,
  query: string,
  signal: AbortSignal,
  deps: SearchDeps,
): Promise<Attempt> => {
  if (!(await provider.isAvailable(signal).catch(() => false))) {
    return 'skipped';
  }
  const hasRoom =
    provider.quota === null ||
    (await deps.reserve(provider.id, provider.quota));
  if (!hasRoom) {
    deps.log('image search provider used up its day', {
      provider: provider.id,
    });
    return 'skipped';
  }
  const context = {
    fetch: deps.fetch,
    signal,
    requestTimeoutMs: deps.timeouts?.requestMs,
  };
  return provider.search(query, context).catch((error) => {
    deps.log('image search provider failed', {
      provider: provider.id,
      reason: error instanceof ProviderFailure ? error.reason : 'unexpected',
    });
    return 'failed' as const;
  });
};

/** The first answer with pictures wins. Null: none could answer at all. `[]`: at least one answered with nothing. */
const tryProviders = async (
  [provider, ...rest]: ImageProvider[],
  query: string,
  signal: AbortSignal,
  deps: SearchDeps,
  hasAnswered = false,
): Promise<ImageResult[] | null> => {
  if (provider === undefined) return hasAnswered ? [] : null;
  const attempt = await tryProvider(provider, query, signal, deps);
  if (attempt === 'skipped' || attempt === 'failed') {
    return tryProviders(rest, query, signal, deps, hasAnswered);
  }
  return attempt.length > 0
    ? attempt
    : tryProviders(rest, query, signal, deps, true);
};

/** The person's limit and each provider's day are counted only for a search that has to go out. */
export async function searchImages(
  rawQuery: string,
  deps: SearchDeps,
): Promise<ImageResult[]> {
  const query = normalizeQuery(rawQuery);
  const cacheId = getCacheId(
    query,
    deps.providers.map((provider) => provider.id),
  );
  const cached = await deps.cache.get(cacheId).catch(() => null);
  if (cached && isCacheFresh(cached, deps.now())) return cached.results;

  if (!(await deps.takeTurn())) throw new ImageSearchError('rate_limited');

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    deps.timeouts?.searchMs ?? SEARCH_DEADLINE_MS,
  );
  try {
    const results = await tryProviders(
      deps.providers,
      query,
      controller.signal,
      deps,
    );
    if (results === null) throw new ImageSearchError('unavailable');
    await deps.cache
      .set(cacheId, { results, cachedAt: deps.now() })
      .catch(() => undefined);
    return results;
  } finally {
    clearTimeout(timer);
  }
}
