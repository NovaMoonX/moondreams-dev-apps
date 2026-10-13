import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { fetchPublicPage, MAX_URL_LENGTH, resolveUrl } from './safeFetch.js';

/**
 * Reads a user-attached link (booking/listing page, a business's website, or a
 * Google Maps link) and returns whatever preview metadata we can find — most
 * importantly an image. Fetch once, store on the doc; this function never runs on
 * a schedule and never runs on render.
 */

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

interface LinkMetadataResult {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  fetchedAt: number;
  mapsPlace: { name: string; latitude: number; longitude: number } | null;
}

function isMapsHost(hostname: string) {
  return (
    hostname === 'maps.app.goo.gl' ||
    hostname === 'goo.gl' ||
    hostname === 'google.com' ||
    hostname === 'www.google.com'
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractMetaContent(
  head: string,
  key: string,
  attr: 'property' | 'name',
): string | null {
  // Matches either attribute order: <meta property="og:image" content="..."> or
  // <meta content="..." property="og:image">.
  const patterns = [
    new RegExp(
      `<meta[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = head.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }
  return null;
}

function extractTitleTag(head: string): string | null {
  const match = head.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function extractJsonLdImage(head: string): string | null {
  const scripts = head.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1]) as Record<string, unknown>;
      const image = parsed.image;
      if (typeof image === 'string') return image;
      if (Array.isArray(image) && typeof image[0] === 'string') return image[0];
      if (image && typeof image === 'object' && 'url' in image) {
        const url = (image as Record<string, unknown>).url;
        if (typeof url === 'string') return url;
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return null;
}

function parseGoogleMapsPlace(
  finalUrl: string,
): { name: string; latitude: number; longitude: number } | null {
  const match = finalUrl.match(
    /\/maps\/place\/([^/]+)\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
  );
  if (!match) return null;

  const [, encodedName, latitude, longitude] = match;
  return {
    name: decodeURIComponent(encodedName.replace(/\+/g, ' ')),
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

async function readCappedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const decoder = new TextDecoder();
  let result = '';
  let bytesRead = 0;

  while (bytesRead < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    result += decoder.decode(value, { stream: true });

    // Head-only content is all we parse, so stop once we have it.
    if (/<\/head>/i.test(result)) break;
  }

  await reader.cancel().catch(() => undefined);
  return result;
}

function parseMetadata(html: string, finalUrl: string): LinkMetadataResult {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch?.[1] ?? html;

  let imageUrl =
    extractMetaContent(head, 'og:image', 'property') ??
    extractMetaContent(head, 'twitter:image', 'name') ??
    extractJsonLdImage(head);
  if (imageUrl) {
    imageUrl = resolveUrl(imageUrl, finalUrl);
  }

  const hostname = new URL(finalUrl).hostname;
  const mapsPlace = isMapsHost(hostname)
    ? parseGoogleMapsPlace(finalUrl)
    : null;

  if (mapsPlace) {
    // A Maps place photo lives on googleusercontent.com; a plain address instead
    // gets a static-map placeholder image, which we deliberately drop.
    imageUrl =
      imageUrl && imageUrl.includes('googleusercontent.com') ? imageUrl : null;
  } else if (imageUrl && !imageUrl.startsWith('https://')) {
    imageUrl = null; // keep https images only
  }

  const title =
    extractMetaContent(head, 'og:title', 'property') ??
    extractMetaContent(head, 'twitter:title', 'name') ??
    extractTitleTag(head);
  const description =
    extractMetaContent(head, 'og:description', 'property') ??
    extractMetaContent(head, 'twitter:description', 'name') ??
    extractMetaContent(head, 'description', 'name');
  const siteName =
    extractMetaContent(head, 'og:site_name', 'property') ?? hostname;

  return {
    title,
    description,
    imageUrl,
    siteName,
    fetchedAt: Date.now(),
    mapsPlace,
  };
}

export const fetchLinkMetadata = onCall(
  {
    region: 'us-central1',
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError(
        'unauthenticated',
        'You must be signed in to attach a link.',
      );
    }

    const payload = request.data ?? {};
    const rawUrl = typeof payload.url === 'string' ? payload.url.trim() : '';

    if (!rawUrl || rawUrl.length > MAX_URL_LENGTH) {
      throw new HttpsError('invalid-argument', 'Provide a valid link.');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new HttpsError('invalid-argument', 'Provide a valid link.');
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new HttpsError(
        'invalid-argument',
        'Only http/https links are supported.',
      );
    }

    try {
      const { html, finalUrl } = await fetchPublicPage(rawUrl, {
        maxBytes: MAX_BODY_BYTES,
        stopAtHead: true,
      });
      if (!html) {
        return {
          title: null,
          description: null,
          imageUrl: null,
          siteName: parsedUrl.hostname,
          fetchedAt: Date.now(),
          mapsPlace: null,
        } satisfies LinkMetadataResult;
      }
      return parseMetadata(html, finalUrl);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        'unavailable',
        "Couldn't load a preview for that link.",
      );
    }
  },
);

export default fetchLinkMetadata;
