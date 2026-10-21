/** One picture a search found: the addresses are https, and the thumbnail is the only one a browser loads before a person picks. */
export interface ImageResult {
  thumbUrl: string;
  imageUrl: string;
  title: string;
  /** The site the picture was found on, without `www.`. */
  host: string;
}

export interface FetchInit {
  headers: Record<string, string>;
  signal: AbortSignal;
  redirect?: 'follow' | 'error';
}

export type FetchLike = (url: string, init: FetchInit) => Promise<Response>;

export interface ProviderContext {
  fetch: FetchLike;
  signal: AbortSignal;
  requestTimeoutMs?: number;
}

/** Counted in the quota's own time zone, so our day ends when theirs does. */
export interface ProviderQuota {
  dailyCap: number;
  timeZone: string;
}

export interface ImageProvider {
  id: string;
  quota: ProviderQuota | null;
  /** False while it can't be used (no key, paused); it is then skipped without counting against its quota. */
  isAvailable: (signal: AbortSignal) => Promise<boolean>;
  search: (query: string, context: ProviderContext) => Promise<ImageResult[]>;
}

/** Why a provider could not answer: a short code safe to log, never a URL or a key. */
export class ProviderFailure extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ProviderFailure';
  }
}

export type ImageSearchErrorCode = 'unavailable' | 'rate_limited';

export class ImageSearchError extends Error {
  constructor(readonly code: ImageSearchErrorCode) {
    super(code);
    this.name = 'ImageSearchError';
  }
}
