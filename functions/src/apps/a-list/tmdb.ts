import { HttpsError } from 'firebase-functions/v2/https';

import type { MovieSearchResult, MovieSnapshot } from './types.js';

const FETCH_TIMEOUT_MS = 6000;
const MAX_SEARCH_RESULTS = 20;
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/';
const UNRATED = new Set(['NR', 'Not Rated', 'Unrated', 'NOT RATED', 'UNRATED']);
// TMDB's two credentials: a v4 read token is a JWT sent as a header, a v3 key goes in the query.
const READ_TOKEN_PATTERN = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;

interface TmdbSearchItem {
  id?: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
}

interface TmdbSearchResponse {
  results?: TmdbSearchItem[];
  total_pages?: number;
}

interface TmdbReleaseDate {
  certification?: string;
  release_date?: string;
  type?: number;
}

interface TmdbTitleResponse {
  title?: string;
  release_date?: string;
  runtime?: number | null;
  poster_path?: string | null;
  release_dates?: { results?: Array<{ iso_3166_1?: string; release_dates?: TmdbReleaseDate[] }> };
}

function getBaseUrl() {
  return process.env.TMDB_API_BASE || 'https://api.themoviedb.org/3';
}

function requireKey(apiKey: string) {
  if (!apiKey) {
    throw new HttpsError('failed-precondition', "Movie search isn't set up yet. You can still add a movie by its title.");
  }
  return apiKey;
}

async function callTmdb<T>(apiKey: string, path: string, params: Record<string, string>): Promise<T> {
  const key = requireKey(apiKey);
  const isReadToken = READ_TOKEN_PATTERN.test(key);
  const url = new URL(`${getBaseUrl()}${path}`);
  Object.entries(isReadToken ? params : { ...params, api_key: key }).forEach(([name, value]) =>
    url.searchParams.set(name, value),
  );

  try {
    const response = await fetch(url, {
      headers: isReadToken ? { Authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 401) {
      throw new HttpsError('failed-precondition', "Movie search isn't set up yet. You can still add a movie by its title.");
    }
    if (response.status === 404) {
      throw new HttpsError('not-found', "We couldn't find that movie.");
    }
    if (response.status === 429) {
      throw new HttpsError('resource-exhausted', 'Movie search is resting for today. You can still add a movie by its title.');
    }
    if (!response.ok) {
      throw new HttpsError('unavailable', 'Movie search is unavailable right now.');
    }
    const result = (await response.json()) as T;
    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    // The request can carry the key, so neither the URL nor the raw error is logged.
    console.warn('TMDB request failed', { kind: error instanceof Error ? error.name : 'unknown' });
    throw new HttpsError('unavailable', 'Movie search is unavailable right now.');
  }
}

/** "2026-10-16" or "2026-10-16T00:00:00.000Z" → UTC midnight of that day; null for anything else. */
export function parseTmdbDate(value: string | undefined | null): number | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }

  const result = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(result) ? null : result;
}

function toPosterUrl(path: string | null | undefined, size: 'w342' | 'w500') {
  const result = path && path.startsWith('/') ? `${IMAGE_BASE_URL}${size}${path}` : null;
  return result && result.length <= 500 ? result : null;
}

function toSearchResult(item: TmdbSearchItem & { id: number; title: string }): MovieSearchResult {
  const year = Number(item.release_date?.slice(0, 4));
  return {
    movieKey: `tmdb-${item.id}`,
    title: item.title.slice(0, 200),
    year: Number.isInteger(year) && year > 0 ? year : null,
    posterUrl: toPosterUrl(item.poster_path, 'w342'),
  };
}

/** Newest first, up to 20: a second page is fetched only when there is one, then merged and sorted by release date. */
export async function searchTmdb(
  apiKey: string,
  query: string,
  beforeUpstreamCall: () => Promise<void>,
): Promise<MovieSearchResult[]> {
  const fetchPage = async (page: number) => {
    await beforeUpstreamCall();
    return callTmdb<TmdbSearchResponse>(apiKey, '/search/movie', {
      query,
      include_adult: 'false',
      language: 'en-US',
      page: String(page),
    });
  };

  const first = await fetchPage(1);
  // A failed second page (timeout, rate limit) still returns the first.
  const second = (first.total_pages ?? 1) > 1 ? await fetchPage(2).catch(() => null) : null;

  const items = [first, second]
    .flatMap((data) => data?.results ?? [])
    .filter(
      (item): item is TmdbSearchItem & { id: number; title: string } =>
        Number.isInteger(item.id) && typeof item.title === 'string' && item.title.length > 0,
    );
  const result = items
    .filter((item, index) => items.findIndex((other) => other.id === item.id) === index)
    .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    .slice(0, MAX_SEARCH_RESULTS)
    .map(toSearchResult);
  return result;
}

/** The earliest US theatrical date (wide, else limited), and the first real US rating (a placeholder like "NR" is skipped). */
function getUsTheatrical(data: TmdbTitleResponse) {
  const usReleases = data.release_dates?.results?.find((entry) => entry.iso_3166_1 === 'US')?.release_dates ?? [];
  const earliest = (type: number) =>
    usReleases
      .filter((release) => release.type === type && parseTmdbDate(release.release_date) !== null)
      .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))[0];
  const theatrical = earliest(3) ?? earliest(2) ?? null;
  const certification =
    [theatrical, ...usReleases]
      .map((release) => release?.certification?.trim())
      .find((value) => value && !UNRATED.has(value)) ?? null;
  return { theatrical, certification };
}

export async function getTmdbTitle(apiKey: string, tmdbId: string): Promise<MovieSnapshot> {
  const data = await callTmdb<TmdbTitleResponse>(apiKey, `/movie/${tmdbId}`, {
    append_to_response: 'release_dates',
    language: 'en-US',
  });

  if (!data.title) {
    throw new HttpsError('not-found', "We couldn't find that movie.");
  }

  const { theatrical, certification } = getUsTheatrical(data);
  const runtime = data.runtime ?? 0;
  const result: MovieSnapshot = {
    title: data.title.slice(0, 200),
    releaseDate: parseTmdbDate(theatrical?.release_date) ?? parseTmdbDate(data.release_date),
    posterUrl: toPosterUrl(data.poster_path, 'w500'),
    runtimeMinutes: Number.isInteger(runtime) && runtime > 0 && runtime <= 1000 ? runtime : null,
    contentRating: certification ? certification.slice(0, 20) : null,
  };
  return result;
}
