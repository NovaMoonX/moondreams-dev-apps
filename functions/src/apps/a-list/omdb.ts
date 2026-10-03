import { HttpsError } from 'firebase-functions/v2/https';

import type { MovieSearchResult, MovieSnapshot } from './types.js';

const OMDB_URL = 'https://www.omdbapi.com/';
const FETCH_TIMEOUT_MS = 6000;
const DAY_MS = 86_400_000;

interface OmdbSearchItem {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
}

interface OmdbSearchResponse {
  Response: 'True' | 'False';
  Search?: OmdbSearchItem[];
  Error?: string;
}

interface OmdbTitleResponse {
  Response: 'True' | 'False';
  Title?: string;
  Released?: string;
  Runtime?: string;
  Rated?: string;
  Poster?: string;
  Error?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const UNRATED = new Set(['N/A', 'Not Rated', 'Unrated', 'NOT RATED', 'UNRATED']);

function orNull(value: string | undefined) {
  return !value || value === 'N/A' ? null : value.trim();
}

/** "05 May 2017" → UTC midnight of that day; null for "N/A" or anything unexpected. */
export function parseReleased(value: string | undefined): number | null {
  const match = orNull(value)?.match(/^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/);
  const monthIndex = match ? MONTHS.indexOf(match[2]) : -1;
  if (!match || monthIndex < 0) {
    return null;
  }

  const result = Date.UTC(Number(match[3]), monthIndex, Number(match[1]));
  return result;
}

/** "136 min" → 136. */
export function parseRuntime(value: string | undefined): number | null {
  const minutes = Number(orNull(value)?.match(/^(\d+) min$/)?.[1]);
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1000 ? minutes : null;
}

function toPosterUrl(value: string | undefined) {
  const url = orNull(value);
  return url && /^https:\/\/\S+$/.test(url) && url.length <= 500 ? url : null;
}

function toSearchResult(item: OmdbSearchItem): MovieSearchResult {
  const year = Number(item.Year?.slice(0, 4));
  return {
    movieKey: `imdb-${item.imdbID}`,
    title: item.Title.slice(0, 200),
    year: Number.isInteger(year) ? year : null,
    posterUrl: toPosterUrl(item.Poster),
  };
}

function toSnapshot(data: OmdbTitleResponse): MovieSnapshot {
  const rated = data.Rated?.trim();
  return {
    title: (data.Title ?? '').slice(0, 200),
    releaseDate: parseReleased(data.Released),
    posterUrl: toPosterUrl(data.Poster),
    runtimeMinutes: parseRuntime(data.Runtime),
    contentRating: rated && !UNRATED.has(rated) ? rated.slice(0, 20) : null,
  };
}

// Without a key, the local emulator answers from these OMDb-shaped fixtures so the whole
// flow can be exercised offline; a deployed function never does.
function isFixtureMode(apiKey: string) {
  return !apiKey && process.env.FUNCTIONS_EMULATOR === 'true';
}

function fixtureDate(daysFromNow: number) {
  const date = new Date(Date.now() + daysFromNow * DAY_MS);
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function getFixtures(): Array<Required<Omit<OmdbTitleResponse, 'Error' | 'Response'>> & { imdbID: string; Year: string }> {
  return [
    {
      imdbID: 'tt3896198',
      Title: 'Guardians of the Galaxy Vol. 2',
      Year: '2017',
      Released: '05 May 2017',
      Runtime: '136 min',
      Rated: 'PG-13',
      Poster:
        'https://m.media-amazon.com/images/M/MV5BNWE5MGI3MDctMmU5Ni00YzI2LWEzMTQtZGIyZDA5MzQzNDBhXkEyXkFqcGc@._V1_QL75_UX380_CR0,1,380,562_.jpg',
    },
    { imdbID: 'tt0133093', Title: 'The Matrix', Year: '1999', Released: '31 Mar 1999', Runtime: '136 min', Rated: 'R', Poster: 'N/A' },
    { imdbID: 'tt15239678', Title: 'Dune: Part Two', Year: '2024', Released: '01 Mar 2024', Runtime: '166 min', Rated: 'PG-13', Poster: 'N/A' },
    { imdbID: 'tt15398776', Title: 'Oppenheimer', Year: '2023', Released: '21 Jul 2023', Runtime: '180 min', Rated: 'R', Poster: 'N/A' },
    { imdbID: 'tt0816692', Title: 'Interstellar', Year: '2014', Released: '07 Nov 2014', Runtime: '169 min', Rated: 'PG-13', Poster: 'N/A' },
    { imdbID: 'tt9362722', Title: 'Spider-Man: Across the Spider-Verse', Year: '2023', Released: '02 Jun 2023', Runtime: '140 min', Rated: 'PG', Poster: 'N/A' },
    { imdbID: 'tt1745960', Title: 'Top Gun: Maverick', Year: '2022', Released: '27 May 2022', Runtime: '130 min', Rated: 'PG-13', Poster: 'N/A' },
    { imdbID: 'tt99000001', Title: 'Starlight Harbor', Year: '2026', Released: fixtureDate(3), Runtime: '118 min', Rated: 'PG-13', Poster: 'N/A' },
    { imdbID: 'tt99000002', Title: 'The Last Projectionist', Year: '2026', Released: fixtureDate(6), Runtime: 'N/A', Rated: 'N/A', Poster: 'N/A' },
    { imdbID: 'tt99000003', Title: 'Galaxy Drift', Year: '2026', Released: fixtureDate(24), Runtime: '142 min', Rated: 'PG-13', Poster: 'N/A' },
    { imdbID: 'tt99000004', Title: 'Midnight Matinee', Year: '2026', Released: 'N/A', Runtime: 'N/A', Rated: 'Not Rated', Poster: 'N/A' },
  ];
}

function fixtureSearch(query: string): OmdbSearchResponse {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = getFixtures().filter((movie) => words.every((word) => movie.Title.toLowerCase().includes(word)));
  if (matches.length === 0) {
    return { Response: 'False', Error: 'Movie not found!' };
  }

  const result: OmdbSearchResponse = {
    Response: 'True',
    Search: matches.map(({ Title, Year, imdbID, Poster }) => ({ Title, Year, imdbID, Type: 'movie', Poster })),
  };
  return result;
}

function fixtureTitle(imdbId: string): OmdbTitleResponse {
  const movie = getFixtures().find((fixture) => fixture.imdbID === imdbId);
  return movie ? { Response: 'True', ...movie } : { Response: 'False', Error: 'Incorrect IMDb ID.' };
}

async function callOmdb<T>(apiKey: string, params: Record<string, string>): Promise<T> {
  const url = new URL(OMDB_URL);
  Object.entries({ ...params, apikey: apiKey }).forEach(([name, value]) => url.searchParams.set(name, value));

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.status === 401) {
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
    // The request URL carries the key, so neither it nor the raw error is logged.
    console.warn('OMDb request failed', { kind: error instanceof Error ? error.name : 'unknown' });
    throw new HttpsError('unavailable', 'Movie search is unavailable right now.');
  }
}

export async function searchOmdb(apiKey: string, query: string): Promise<MovieSearchResult[]> {
  const data = isFixtureMode(apiKey)
    ? fixtureSearch(query)
    : await callOmdb<OmdbSearchResponse>(requireKey(apiKey), { s: query, type: 'movie' });

  const result = data.Response === 'True' ? (data.Search ?? []).filter((item) => item.Type === 'movie').slice(0, 10).map(toSearchResult) : [];
  return result;
}

export async function getOmdbTitle(apiKey: string, imdbId: string): Promise<MovieSnapshot> {
  const data = isFixtureMode(apiKey)
    ? fixtureTitle(imdbId)
    : await callOmdb<OmdbTitleResponse>(requireKey(apiKey), { i: imdbId });

  if (data.Response !== 'True' || !data.Title) {
    throw new HttpsError('not-found', "We couldn't find that movie.");
  }

  const result = toSnapshot(data);
  return result;
}

function requireKey(apiKey: string) {
  if (!apiKey) {
    throw new HttpsError('failed-precondition', "Movie search isn't set up yet. You can still add a movie by its title.");
  }
  return apiKey;
}
