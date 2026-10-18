import { fetchCapped } from './fetchCapped.js';
import { MAX_RESULTS, toImageResults } from './results.js';
import {
  ProviderFailure,
  type ImageProvider,
  type ImageResult,
  type ProviderContext,
} from './types.js';

// Field names are from Google's public reference; nothing here has run against the live service.
const ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const MAX_BYTES = 256 * 1024;
// The free tier is 100 queries a day from midnight Pacific; stopping ten short keeps a miscount off the paid tier.

const DAILY_CAP = 90;
const QUOTA_ZONE = 'America/Los_Angeles';

const parseImages = (text: string): ImageResult[] => {
  const parse = () => {
    try {
      return JSON.parse(text) as { items?: unknown } | null;
    } catch {
      throw new ProviderFailure('bad_json');
    }
  };
  return toImageResults(parse()?.items, (row) => {
    const image =
      row.image !== null && typeof row.image === 'object'
        ? (row.image as Record<string, unknown>)
        : {};
    return {
      thumbnail: image.thumbnailLink,
      image: row.link,
      title: row.title,
      page: image.contextLink ?? row.link,
    };
  });
};

export type SecretReader = (
  name: string,
  signal: AbortSignal,
) => Promise<string | null>;

/** Skipped, never an error, until both `GOOGLE_CSE_KEY` and `GOOGLE_CSE_CX` can be read. */
export function createGoogleProvider(readSecret: SecretReader): ImageProvider {
  const readCredentials = async (signal: AbortSignal) => {
    const [key, cx] = await Promise.all([
      readSecret('GOOGLE_CSE_KEY', signal),
      readSecret('GOOGLE_CSE_CX', signal),
    ]);
    return key !== null && cx !== null ? { key, cx } : null;
  };

  return {
    id: 'google',
    quota: { dailyCap: DAILY_CAP, timeZone: QUOTA_ZONE },
    isAvailable: async (signal) => (await readCredentials(signal)) !== null,
    search: async (query, context: ProviderContext) => {
      const credentials = await readCredentials(context.signal);
      if (credentials === null) throw new ProviderFailure('not_configured');
      const params = new URLSearchParams({
        key: credentials.key,
        cx: credentials.cx,
        q: query,
        searchType: 'image',
        num: String(MAX_RESULTS),
        safe: 'active',
      });
      const response = await fetchCapped({
        fetch: context.fetch,
        url: `${ENDPOINT}?${params}`,
        init: { headers: { Accept: 'application/json' }, redirect: 'error' },
        signal: context.signal,
        maxBytes: MAX_BYTES,
        timeoutMs: context.requestTimeoutMs,
      });
      if (response.status !== 200) {
        throw new ProviderFailure(`http_${response.status}`);
      }
      return parseImages(response.text);
    },
  };
}
