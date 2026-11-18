import { fetchCapped } from '../imageSearch/fetchCapped.js';
import { ProviderFailure, type FetchLike } from '../imageSearch/types.js';
import type { FoundVideo } from './types.js';

// Field names are from YouTube's public reference; nothing here has run against the live service.
const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const MAX_BYTES = 256 * 1024;
const CANDIDATES = 6;
const TEXT_CAP = 120;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) =>
  typeof value === 'string'
    ? value
        .replace(/[\p{Cc}\s]+/gu, ' ')
        .trim()
        .slice(0, TEXT_CAP)
        .trim()
    : '';

/** Seconds in an ISO 8601 duration such as `PT1H2M3S`; 0 for anything else (a live stream is `P0D`). */
export const parseIsoDuration = (value: unknown) => {
  const match =
    typeof value === 'string'
      ? /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value)
      : null;
  return match
    ? Number(match[1] ?? 0) * 3600 +
        Number(match[2] ?? 0) * 60 +
        Number(match[3] ?? 0)
    : 0;
};

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderFailure('bad_json');
  }
};

const request = async (
  fetch: FetchLike,
  url: string,
  key: string,
  signal: AbortSignal,
) => {
  const response = await fetchCapped({
    fetch,
    url,
    init: {
      headers: { Accept: 'application/json', 'X-Goog-Api-Key': key },
      redirect: 'error',
    },
    signal,
    maxBytes: MAX_BYTES,
  });
  if (response.status !== 200) {
    throw new ProviderFailure(`http_${response.status}`);
  }
  return parse(response.text);
};

/** Embeddable, safe-search-strict videos for a query, in YouTube's own order, kept to those whose length falls between the two limits. Two calls: a search, then the lengths of what it found. */
export async function searchYoutube(input: {
  fetch: FetchLike;
  key: string;
  query: string;
  limit: number;
  minSeconds: number;
  maxSeconds: number;
  signal: AbortSignal;
}): Promise<FoundVideo[]> {
  const found = await request(
    input.fetch,
    `${SEARCH_ENDPOINT}?${new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      videoDuration: 'medium',
      maxResults: String(CANDIDATES),
      q: input.query,
    })}`,
    input.key,
    input.signal,
  );
  const ids = (isRecord(found) && Array.isArray(found.items) ? found.items : [])
    .flatMap((item) =>
      isRecord(item) && isRecord(item.id) && typeof item.id.videoId === 'string'
        ? [item.id.videoId]
        : [],
    )
    .filter((id) => VIDEO_ID.test(id));
  if (ids.length === 0) return [];
  const details = await request(
    input.fetch,
    `${VIDEOS_ENDPOINT}?${new URLSearchParams({
      part: 'contentDetails,snippet',
      id: ids.join(','),
    })}`,
    input.key,
    input.signal,
  );
  const byId = new Map(
    (isRecord(details) && Array.isArray(details.items) ? details.items : [])
      .filter(isRecord)
      .flatMap((item): [string, FoundVideo][] => {
        const snippet = isRecord(item.snippet) ? item.snippet : {};
        const contentDetails = isRecord(item.contentDetails)
          ? item.contentDetails
          : {};
        const videoId = typeof item.id === 'string' ? item.id : '';
        const title = toText(snippet.title);
        return VIDEO_ID.test(videoId) && title !== ''
          ? [
              [
                videoId,
                {
                  videoId,
                  title,
                  channel: toText(snippet.channelTitle),
                  durationSec: parseIsoDuration(contentDetails.duration),
                },
              ],
            ]
          : [];
      }),
  );
  return ids
    .flatMap((id) => byId.get(id) ?? [])
    .filter(
      (video) =>
        video.durationSec >= input.minSeconds &&
        video.durationSec <= input.maxSeconds,
    )
    .slice(0, input.limit);
}
