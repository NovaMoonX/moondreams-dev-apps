import { isForcedFixture, isRunningInEmulator } from '../emulator.js';
import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import type { FetchLike } from '../imageSearch/types.js';
import type {
  FoundVideo,
  VideoSearchInput,
  VideoSearchResult,
} from './types.js';
import { searchYoutube } from './youtube.js';

export const YOUTUBE_KEY_NAME = 'YOUTUBE_API_KEY';
export const QUERY_CAP = 100;
const SEARCH_DEADLINE_MS = 10_000;

export interface VideoSearchDeps {
  fetch: FetchLike;
  /** Reads the key when the code runs, never bound to a function, so a deploy never needs it. */
  readSecret: (name: string, signal: AbortSignal) => Promise<string | null>;
  /** Takes one search from the day's budget; false once it is used up. */
  reserve: () => Promise<boolean>;
}

export const createVideoSearchDeps = (
  reserve: VideoSearchDeps['reserve'],
): VideoSearchDeps => {
  const fetchLike: FetchLike = (url, init) => fetch(url, init);
  return {
    fetch: fetchLike,
    readSecret: createOptionalSecretReader({ fetch: fetchLike }),
    reserve,
  };
};

/** Two sample videos with fixed ids, so the emulator shows the whole flow with no key; their thumbnails never load, which is what the player's fallback tile is for. */
export const toFixtureVideos = (query: string, limit: number): FoundVideo[] =>
  [
    {
      videoId: 'fixture0001',
      title: `A sample video about ${query}`.slice(0, 120),
      channel: 'Sample Channel',
      durationSec: 480,
    },
    {
      videoId: 'fixture0002',
      title: `More on ${query}, a second sample`.slice(0, 120),
      channel: 'Sample Channel',
      durationSec: 720,
    },
  ].slice(0, limit);

const toQuery = (value: string) =>
  value.replace(/\s+/g, ' ').trim().slice(0, QUERY_CAP).trim();

/** Videos for a query that can be played in a page: embeddable, safe search strict, between the two lengths, in YouTube's own order. Never throws: with no key it skips (`noKey`), past the day's budget it skips (`capped`), and a failed call is `failed`. On the emulator it answers from a fixture, with a key or without. */
export async function searchVideos(
  input: VideoSearchInput,
  deps: VideoSearchDeps,
): Promise<VideoSearchResult> {
  const query = toQuery(input.query);
  if (query === '' || input.limit < 1) return { videos: [], skipped: null };
  if (isForcedFixture('youtube')) {
    return { videos: toFixtureVideos(query, input.limit), skipped: null };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_DEADLINE_MS);
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  try {
    const key = await deps.readSecret(YOUTUBE_KEY_NAME, signal);
    if (key === null) {
      return isRunningInEmulator()
        ? { videos: toFixtureVideos(query, input.limit), skipped: null }
        : { videos: [], skipped: 'noKey' };
    }
    if (!(await deps.reserve())) return { videos: [], skipped: 'capped' };
    const videos = await searchYoutube({
      fetch: deps.fetch,
      key,
      query,
      limit: input.limit,
      minSeconds: input.minSeconds,
      maxSeconds: input.maxSeconds,
      signal,
    });
    return { videos, skipped: null };
  } catch {
    return { videos: [], skipped: 'failed' };
  } finally {
    clearTimeout(timer);
  }
}
