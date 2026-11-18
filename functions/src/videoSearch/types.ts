/** One video a search found: the id is a plain 11-character YouTube id, so a page can build its player address from it. */
export interface FoundVideo {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
}

export interface VideoSearchInput {
  query: string;
  limit: number;
  minSeconds: number;
  maxSeconds: number;
  signal?: AbortSignal;
}

/** Why a search came back with nothing: no key to read, the day's budget used up, or the service failed. Null when it answered (even with no videos). */
export type VideoSearchSkip = 'noKey' | 'capped' | 'failed';

export interface VideoSearchResult {
  videos: FoundVideo[];
  skipped: VideoSearchSkip | null;
}
