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
/** A found set is kept a week; "nothing found" only ten minutes, so a gap in a provider never sticks. A failed answer is never kept. */
export const RESULTS_TTL_MS = 7 * 86_400_000;
export const EMPTY_TTL_MS = 10 * 60_000;
/** The whole search, every provider included, gives up after this long. */
export const SEARCH_DEADLINE_MS = 10_000;
/** Bump when the shape of results changes, so an older cached answer is not served. */
const CACHE_VERSION = 1;

/** Trimmed, one space between words, at most `MAX_QUERY_LENGTH` characters; empty when there is nothing to search for. */
export const normalizeQuery = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH).trim()
    : '';

/** One cache entry per search text and per list of providers, so changing `IMAGE_SEARCH_PROVIDERS` takes effect at once instead of serving the old list's answers. */
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
  /** Counts one call against the provider's day; false when the day is used up. */
  reserve: (providerId: string, quota: ProviderQuota) => Promise<boolean>;
  /** Counts one uncached search against the person's limit; false when they are over it. */
  takeTurn: () => Promise<boolean>;
  log: (message: string, detail: Record<string, string>) => void;
  /** Overrides `SEARCH_DEADLINE_MS` and the per-request limit, for a check that wants to see a timeout without waiting for it. */
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

/** Tries the providers in order. The first answer with pictures wins; null means none of them could answer at all, and `[]` that at least one answered with nothing. */
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

/** Pictures for a search text: a fresh cached answer first, then the providers in order. The person's limit and each provider's day are counted only for a search that has to go out. Throws `ImageSearchError` when it is refused or no provider could answer. */
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
