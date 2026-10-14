import { lookup } from 'node:dns/promises';

import { HttpsError } from 'firebase-functions/v2/https';

/** Fetching a user-supplied link from a Cloud Function, guarded against requests into private networks. Shared by every function that reads a page. */

export const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 6000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; MoondreamsLinkPreview/1.0; +https://apps.moondreams.dev)';

// Manual private/reserved range checks — no extra dependency for this. Covers the
// ranges that matter for an SSRF guard against a Cloud Functions egress path:
// loopback, link-local, private, and other non-routable blocks.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true; // malformed — treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast/reserved
  return false;
}

/** Only global unicast (2000::/3) is allowed, minus 6to4 and Teredo/documentation space; loopback, link-local, unique-local, mapped, NAT64 and the unspecified address all fall outside it. */
function isPrivateIPv6(ip: string): boolean {
  const first = parseInt(ip.split(':')[0] || '0', 16);
  const second = parseInt(ip.split(':')[1] || '0', 16);
  if (Number.isNaN(first) || (first & 0xe000) !== 0x2000) return true;
  if (first === 0x2002) return true; // 6to4 embeds an IPv4 address
  if (first === 0x2001 && (second === 0 || second === 0xdb8)) return true;
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new HttpsError('invalid-argument', 'Could not resolve that link.');
  }

  if (addresses.length === 0) {
    throw new HttpsError('invalid-argument', 'Could not resolve that link.');
  }

  for (const { address, family } of addresses) {
    const isPrivate =
      family === 6 ? isPrivateIPv6(address) : isPrivateIPv4(address);
    if (isPrivate) {
      throw new HttpsError('invalid-argument', 'That link is not allowed.');
    }
  }
}

export function resolveUrl(maybeRelative: string, base: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

async function readCappedBody(
  response: Response,
  maxBytes: number,
  stopAtHead: boolean,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const decoder = new TextDecoder();
  let result = '';
  let bytesRead = 0;

  while (bytesRead < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    result += decoder.decode(value, { stream: true });

    if (stopAtHead && /<\/head>/i.test(result)) break;
  }

  await reader.cancel().catch(() => undefined);
  return result;
}

async function fetchOnce(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    redirect: 'manual',
    signal,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en',
    },
  });
}

export async function fetchPublicPage(
  startUrl: string,
  { maxBytes, stopAtHead }: { maxBytes: number; stopAtHead: boolean },
): Promise<{
  html: string;
  finalUrl: string;
}> {
  let currentUrl = startUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const parsed = new URL(currentUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new HttpsError(
          'invalid-argument',
          'Only http/https links are supported.',
        );
      }
      await assertPublicHost(parsed.hostname);

      const response = await fetchOnce(currentUrl, controller.signal);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          throw new HttpsError(
            'unavailable',
            'That link could not be reached.',
          );
        }
        const nextUrl = resolveUrl(location, currentUrl);
        if (!nextUrl) {
          throw new HttpsError(
            'unavailable',
            'That link could not be reached.',
          );
        }
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        throw new HttpsError(
          'unavailable',
          `That link returned an error (${response.status}).`,
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        return { html: '', finalUrl: currentUrl };
      }

      const html = await readCappedBody(response, maxBytes, stopAtHead);
      return { html, finalUrl: currentUrl };
    }

    throw new HttpsError('unavailable', 'That link redirected too many times.');
  } finally {
    clearTimeout(timeout);
  }
}
