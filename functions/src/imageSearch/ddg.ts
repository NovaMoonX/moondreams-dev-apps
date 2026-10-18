import { fetchCapped } from './fetchCapped.js';
import { toImageResults } from './results.js';
import {
  ProviderFailure,
  type ImageProvider,
  type ImageResult,
  type ProviderContext,
} from './types.js';

// DuckDuckGo has no public image API. This follows the two requests its own page makes (a token from the results page, then the JSON the picture grid loads), which can change or be blocked at any time; nothing here has been run against the live service.
const PAGE_URL = 'https://duckduckgo.com/';
const IMAGES_URL = 'https://duckduckgo.com/i.js';
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_PAGE_BYTES = 600 * 1024;
const MAX_IMAGES_BYTES = 1024 * 1024;
const MIN_TOKEN_LENGTH = 4;
const MAX_TOKEN_LENGTH = 64;
const MAX_TOKEN_TRIES = 5;
const FAILURES_BEFORE_PAUSE = 3;
const PAUSE_MS = 5 * 60_000;
const DAILY_CAP = 1500;

/** The `vqd` token in the results page: the digits and dashes after `vqd=`, with or without a quote. It scans with `indexOf` and looks at 65 characters at a time, never a pattern over the whole page, and tries the next `vqd=` when one has no usable token. */
export const findToken = (
  page: string,
  from = 0,
  tries = MAX_TOKEN_TRIES,
): string | null => {
  const marker = page.indexOf('vqd=', from);
  if (marker === -1 || tries === 0) return null;
  const afterMarker = marker + 'vqd='.length;
  const start = afterMarker + (/["']/.test(page[afterMarker] ?? '') ? 1 : 0);
  const token =
    /^[0-9-]+/.exec(page.slice(start, start + MAX_TOKEN_LENGTH + 1))?.[0] ?? '';
  return token.length >= MIN_TOKEN_LENGTH && token.length <= MAX_TOKEN_LENGTH
    ? token
    : findToken(page, afterMarker, tries - 1);
};

const parseImages = (text: string): ImageResult[] => {
  const parse = () => {
    try {
      return JSON.parse(text) as { results?: unknown } | null;
    } catch {
      throw new ProviderFailure('bad_json');
    }
  };
  return toImageResults(parse()?.results, (row) => ({
    thumbnail: row.thumbnail,
    image: row.image,
    title: row.title,
    page: row.url,
  }));
};

const getHeaders = () => ({
  'User-Agent': USER_AGENT,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: PAGE_URL,
});

const getImages = async (
  query: string,
  token: string,
  { fetch, signal, requestTimeoutMs }: ProviderContext,
) => {
  const params = new URLSearchParams({
    l: 'us-en',
    o: 'json',
    q: query,
    vqd: token,
    f: ',,,',
    p: '1',
  });
  const response = await fetchCapped({
    fetch,
    url: `${IMAGES_URL}?${params}`,
    init: { headers: getHeaders() },
    signal,
    maxBytes: MAX_IMAGES_BYTES,
    timeoutMs: requestTimeoutMs,
  });
  if (response.status !== 200) {
    throw new ProviderFailure(`http_${response.status}`);
  }
  return parseImages(response.text);
};

/** The pictures request, tried once more when it fails or comes back empty: the first answer for a fresh token is sometimes empty. */
const getImagesWithRetry = async (
  query: string,
  token: string,
  context: ProviderContext,
) => {
  const attempt = () =>
    getImages(query, token, context).then(
      (results) => ({ results }),
      (error: unknown) => ({ error }),
    );
  const first = await attempt();
  if ('results' in first && first.results.length > 0) return first.results;
  if (context.signal.aborted) throw new ProviderFailure('timeout');
  const second = await attempt();
  if ('results' in second) return second.results;
  if ('results' in first) return first.results;
  throw second.error;
};

const search = async (query: string, context: ProviderContext) => {
  const page = await fetchCapped({
    fetch: context.fetch,
    url: `${PAGE_URL}?${new URLSearchParams({ q: query, iax: 'images', ia: 'images' })}`,
    init: { headers: getHeaders(), redirect: 'follow' },
    signal: context.signal,
    maxBytes: MAX_PAGE_BYTES,
    timeoutMs: context.requestTimeoutMs,
  });
  if (page.status !== 200) throw new ProviderFailure(`http_${page.status}`);
  const token = findToken(page.text);
  if (token === null) throw new ProviderFailure('token_missing');
  return getImagesWithRetry(query, token, context);
};

/** Option 3: DuckDuckGo images, no key, safe search on. After three failures in a row it steps aside for five minutes, so a blocked address costs a search no time while Google answers. */
export function createDdgProvider(now: () => number = Date.now): ImageProvider {
  const state = { failures: 0, pausedUntil: 0 };

  return {
    id: 'ddg',
    quota: { dailyCap: DAILY_CAP, timeZone: 'UTC' },
    isAvailable: async () => now() >= state.pausedUntil,
    search: async (query, context) => {
      try {
        const results = await search(query, context);
        state.failures = 0;
        return results;
      } catch (error) {
        state.failures += 1;
        if (state.failures >= FAILURES_BEFORE_PAUSE) {
          state.pausedUntil = now() + PAUSE_MS;
          state.failures = 0;
        }
        throw error;
      }
    },
  };
}
