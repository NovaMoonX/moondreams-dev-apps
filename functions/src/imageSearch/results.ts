import type { ImageResult } from './types.js';

export const MAX_RESULTS = 6;
// A hostile answer of a million rows costs the same as a normal one.

export const MAX_ROWS_READ = 60;
const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 120;
const MAX_HOST_LENGTH = 80;

const CONTROL_CHARACTERS = /\p{Cc}/gu;

const asText = (value: unknown) => (typeof value === 'string' ? value : null);

export const toHttpsUrl = (value: unknown): string | null => {
  const text = asText(value)?.trim() ?? '';
  if (text === '' || text.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(text);
    const isPlain =
      url.protocol === 'https:' &&
      url.hostname !== '' &&
      url.username === '' &&
      url.password === '';
    return isPlain ? url.toString() : null;
  } catch {
    return null;
  }
};

const toHost = (value: unknown): string | null => {
  const text = asText(value)?.trim() ?? '';
  if (text === '' || text.length > MAX_URL_LENGTH) return null;
  try {
    const host = new URL(text).hostname.replace(/^www\./, '');
    return host !== '' && host.length <= MAX_HOST_LENGTH ? host : null;
  } catch {
    return null;
  }
};

const toTitle = (value: unknown) =>
  (asText(value) ?? '')
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE_LENGTH);

export interface RawImage {
  thumbnail: unknown;
  image: unknown;
  title: unknown;
  page: unknown;
}

/** Both addresses must be https, and a thumbnail never falls back to the full picture: that would tell an arbitrary site the person's address before they pick. */
export const toImageResult = (raw: RawImage): ImageResult | null => {
  const thumbUrl = toHttpsUrl(raw.thumbnail);
  const imageUrl = toHttpsUrl(raw.image);
  if (thumbUrl === null || imageUrl === null) return null;
  const host = toHost(raw.page) ?? toHost(imageUrl);
  return host === null
    ? null
    : { thumbUrl, imageUrl, title: toTitle(raw.title), host };
};

export const toImageResults = (
  rows: unknown,
  toRaw: (row: Record<string, unknown>) => RawImage,
): ImageResult[] => {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows
    .slice(0, MAX_ROWS_READ)
    .flatMap((row) =>
      row !== null && typeof row === 'object'
        ? [toImageResult(toRaw(row as Record<string, unknown>))]
        : [],
    )
    .filter((result): result is ImageResult => {
      if (result === null || seen.has(result.imageUrl)) return false;
      seen.add(result.imageUrl);
      return true;
    })
    .slice(0, MAX_RESULTS);
};
