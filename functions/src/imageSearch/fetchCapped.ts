import { ProviderFailure, type FetchLike, type FetchInit } from './types.js';

export const REQUEST_TIMEOUT_MS = 4000;

interface CappedRequest {
  fetch: FetchLike;
  url: string;
  init: Omit<FetchInit, 'signal'>;
  /** The search's own signal; a request also gives up after `timeoutMs` (`REQUEST_TIMEOUT_MS`) on its own. */
  signal: AbortSignal;
  maxBytes: number;
  timeoutMs?: number;
}

/** What an upstream answered: its status and at most `maxBytes` of body as text. A longer body is cut off, so a hostile answer can't use up the instance's memory or time. */
export interface CappedResponse {
  status: number;
  text: string;
}

const readCapped = async (response: Response, maxBytes: number) => {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  const read = async (total: number): Promise<void> => {
    if (total >= maxBytes) return;
    const { done, value } = await reader.read();
    if (done) return;
    chunks.push(value);
    return read(total + value.byteLength);
  };
  await read(0).finally(() => reader.cancel().catch(() => undefined));
  return Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8');
};

/** One request with a timeout and a size cap; any network error, timeout or abort is a `ProviderFailure` with a short code (never the address or the error's own text, which can carry a key). */
export async function fetchCapped({
  fetch,
  url,
  init,
  signal,
  maxBytes,
  timeoutMs = REQUEST_TIMEOUT_MS,
}: CappedRequest): Promise<CappedResponse> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const combined = AbortSignal.any([signal, timeout.signal]);
  try {
    const response = await fetch(url, { ...init, signal: combined });
    const text = await readCapped(response, maxBytes);
    return { status: response.status, text };
  } catch (error) {
    throw new ProviderFailure(
      combined.aborted
        ? 'timeout'
        : `network_${(error as Error)?.name ?? 'error'}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
