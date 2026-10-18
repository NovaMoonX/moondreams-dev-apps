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

/** `fetch`, narrowed to what the providers use so a check can hand them a fake. */
export type FetchLike = (url: string, init: FetchInit) => Promise<Response>;

export interface ProviderContext {
  fetch: FetchLike;
  /** Aborts every request of one search when its time is up. */
  signal: AbortSignal;
  /** How long one request may take; `REQUEST_TIMEOUT_MS` when omitted. */
  requestTimeoutMs?: number;
}

/** A day's calls a provider allows, counted in the quota's own time zone so our day ends when theirs does. */
export interface ProviderQuota {
  dailyCap: number;
  timeZone: string;
}

/** A provider of picture results. Adding one is one file that exports a factory and one line in `providers.ts`. */
export interface ImageProvider {
  id: string;
  quota: ProviderQuota | null;
  /** False while the provider can't be used (a missing key, a pause after repeated failures); it is skipped without counting against its quota. */
  isAvailable: (signal: AbortSignal) => Promise<boolean>;
  /** Resolves with its results (maybe none) and throws a `ProviderFailure` when it could not answer. */
  search: (query: string, context: ProviderContext) => Promise<ImageResult[]>;
}

/** Why a provider could not answer: a short code safe to log, never a URL or a key. */
export class ProviderFailure extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'ProviderFailure';
  }
}

/** What the search refuses with; the callable turns the code into one warm sentence. */
export type ImageSearchErrorCode = 'unavailable' | 'rate_limited';

export class ImageSearchError extends Error {
  constructor(readonly code: ImageSearchErrorCode) {
    super(code);
    this.name = 'ImageSearchError';
  }
}
