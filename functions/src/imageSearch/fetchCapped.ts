import { ProviderFailure, type FetchLike, type FetchInit } from './types.js';

export const REQUEST_TIMEOUT_MS = 4000;

interface CappedRequest {
  fetch: FetchLike;
  url: string;
  init: Omit<FetchInit, 'signal'>;
  signal: AbortSignal;
  maxBytes: number;
  timeoutMs?: number;
}

/** A body longer than `maxBytes` is cut off, so a hostile answer can't use up the instance's memory or time. */
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

/** A failure carries a short code, never the address or the error's own text, which can hold a key. */
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
