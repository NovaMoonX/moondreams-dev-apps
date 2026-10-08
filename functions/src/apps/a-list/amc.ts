import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';

import type { AmcFormat, ShowtimeOption, TheatreResult } from './types.js';

export const AMC_API_KEY = defineSecret('AMC_API_KEY');

const FETCH_TIMEOUT_MS = 6000;
const MAX_THEATRES = 10;
const NOT_SET_UP = "Theater search isn't set up yet.";

interface AmcLink {
  href?: string;
}

interface AmcSuggestionsResponse {
  _embedded?: { suggestions?: Array<{ title?: string; _links?: Record<string, AmcLink | undefined> }> };
}

interface AmcTheatre {
  id?: number | string;
  name?: string;
  timezone?: string;
  location?: {
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
  };
}

interface AmcLocationsResponse {
  _embedded?: Record<string, Array<{ distance?: number; _embedded?: Record<string, AmcTheatre | undefined> }> | undefined>;
}

function getBaseUrl() {
  return process.env.AMC_API_BASE || 'https://api.amctheatres.com';
}

// Without a key, the local emulator answers from these so the whole flow can be driven offline.
export function isFixtureMode(apiKey: string) {
  return !apiKey && process.env.FUNCTIONS_EMULATOR === 'true';
}

async function callAmc<T>(apiKey: string, path: string, params: Record<string, string>): Promise<T> {
  if (!apiKey) {
    throw new HttpsError('failed-precondition', NOT_SET_UP);
  }

  const url = new URL(`${getBaseUrl()}${path}`);
  Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));

  try {
    const response = await fetch(url, {
      headers: { 'X-AMC-Vendor-Key': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 401 || response.status === 403) {
      throw new HttpsError('failed-precondition', NOT_SET_UP);
    }
    if (response.status === 429) {
      throw new HttpsError('resource-exhausted', 'Theater search is resting for today. Try again tomorrow.');
    }
    if (!response.ok) {
      throw new HttpsError('unavailable', 'Theater search is unavailable right now.');
    }
    const result = (await response.json()) as T;
    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    // The request carries the key, so neither the URL nor the raw error is logged.
    throw new HttpsError('unavailable', 'Theater search is unavailable right now.');
  }
}

export interface AmcPoint {
  latitude: number;
  longitude: number;
  /** What AMC matched the search text to, like "Overland Park, KS". */
  area: string | null;
}

const FIXTURE_POINT: AmcPoint = { latitude: 38.98, longitude: -94.67, area: 'Overland Park, KS' };

/** AMC's location suggestions turn text (a zip code, a city) into the coordinates its theater lookup needs. */
export async function suggestPoint(apiKey: string, query: string): Promise<AmcPoint | null> {
  if (isFixtureMode(apiKey)) {
    return FIXTURE_POINT;
  }

  const data = await callAmc<AmcSuggestionsResponse>(apiKey, '/v2/location-suggestions', { query });
  const points = (data._embedded?.suggestions ?? []).flatMap((suggestion) =>
    Object.values(suggestion._links ?? {}).flatMap((link) => {
      const params = toSearchParams(link?.href);
      const latitude = Number(params?.get('latitude') || Number.NaN);
      const longitude = Number(params?.get('longitude') || Number.NaN);
      return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        ? [{ latitude, longitude, area: suggestion.title ?? null }]
        : [];
    }),
  );
  return points[0] ?? null;
}

function toSearchParams(href: string | undefined) {
  try {
    return href ? new URL(href, getBaseUrl()).searchParams : null;
  } catch {
    return null;
  }
}

function toText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toTimeZone(value: unknown) {
  const zone = toText(value);
  if (!zone) {
    return null;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTheatreResult(theatre: AmcTheatre | undefined, distance: unknown): TheatreResult | null {
  const theatreId = String(theatre?.id ?? '');
  const name = toText(theatre?.name);
  if (!/^[0-9]{1,8}$/.test(theatreId) || !name) {
    return null;
  }

  const result: TheatreResult = {
    theatreId,
    name,
    addressLine: toText(theatre?.location?.addressLine1),
    city: toText(theatre?.location?.city),
    state: toText(theatre?.location?.state),
    postalCode: toText(theatre?.location?.postalCode),
    latitude: toNumber(theatre?.location?.latitude),
    longitude: toNumber(theatre?.location?.longitude),
    timeZone: toTimeZone(theatre?.timezone),
    distanceMiles: toNumber(distance),
  };
  return result;
}

const FIXTURE_THEATRES: TheatreResult[] = [
  ['2105', 'AMC Town Center 20', '4701 Town Center Dr', 'Leawood', 'KS', '66211', 38.9, -94.62, 4.1],
  ['2078', 'AMC Dine-In Mission Valley 20', '5000 Metcalf Ave', 'Overland Park', 'KS', '66202', 38.99, -94.66, 1.2],
  ['2236', 'AMC Barrywoods 24', '8600 N Church Rd', 'Kansas City', 'MO', '64157', 39.25, -94.57, 19.4],
].map(([theatreId, name, addressLine, city, state, postalCode, latitude, longitude, distanceMiles]) => ({
  timeZone: 'America/Chicago',
  theatreId: theatreId as string,
  name: name as string,
  addressLine: addressLine as string,
  city: city as string,
  state: state as string,
  postalCode: postalCode as string,
  latitude: latitude as number,
  longitude: longitude as number,
  distanceMiles: distanceMiles as number,
}));

/** The closest theaters to a point, nearest first. */
export async function findNearbyTheatres(apiKey: string, latitude: number, longitude: number): Promise<TheatreResult[]> {
  if (isFixtureMode(apiKey)) {
    return FIXTURE_THEATRES;
  }

  const data = await callAmc<AmcLocationsResponse>(apiKey, '/v2/locations', {
    latitude: String(latitude),
    longitude: String(longitude),
    'page-size': String(MAX_THEATRES),
  });
  const locations = Object.values(data._embedded ?? {}).flatMap((entries) => entries ?? []);
  const result = locations
    .map((location) =>
      toTheatreResult(
        Object.values(location._embedded ?? {}).find((embedded) => embedded?.id !== undefined),
        location.distance,
      ),
    )
    .filter((theatre): theatre is TheatreResult => theatre !== null)
    .slice(0, MAX_THEATRES);
  return result;
}

interface AmcShowtime {
  id?: number | string;
  movieName?: string;
  showDateTimeUtc?: string;
  isSoldOut?: boolean;
  isCanceled?: boolean;
  purchaseUrl?: string;
  mobilePurchaseUrl?: string;
  attributes?: Array<{ code?: string; name?: string }>;
  ticketPrices?: Array<{ type?: string; price?: number }>;
}

interface AmcShowtimesResponse {
  count?: number;
  _embedded?: { showtimes?: AmcShowtime[] };
}

const SHOWTIMES_PAGE_SIZE = 200;
const MAX_SHOWTIME_PAGES = 3;
const AMC_HOST = /^https:\/\/([a-z0-9-]+\.)*amctheatres\.com(\/|$)/;

// A caption or format tag in parentheses is not part of the title; anything else is, so a sequel never matches its predecessor.
function normalizeTitle(value: string | undefined) {
  return (value ?? '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function isSameMovie(amcTitle: string | undefined, title: string) {
  const left = normalizeTitle(amcTitle);
  return left !== '' && left === normalizeTitle(title);
}

/** AMC's showtime endpoint takes `M-D-YYYY`, not an ISO date. */
function toAmcDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${month}-${day}-${year}`;
}

const FORMAT_KEYWORDS: Array<[string, AmcFormat]> = [
  ['imax', 'IMAX'],
  ['dolby', 'DOLBY_CINEMA'],
  ['prime', 'PRIME'],
  ['reald', 'REALD_3D'],
  ['3d', 'REALD_3D'],
  ['laser', 'LASER'],
];

function toFormat(showtime: AmcShowtime): AmcFormat {
  const text = (showtime.attributes ?? []).map((attribute) => `${attribute.code ?? ''} ${attribute.name ?? ''}`.toLowerCase()).join(' ');
  const match = FORMAT_KEYWORDS.find(([keyword]) => text.includes(keyword));
  return match ? match[1] : 'STANDARD';
}

function toAdultPriceCents(showtime: AmcShowtime) {
  const adult = (showtime.ticketPrices ?? []).find((entry) => entry.type?.toLowerCase() === 'adult');
  return typeof adult?.price === 'number' && adult.price >= 0 ? Math.round(adult.price * 100) : null;
}

function toHttpsUrl(value: string | undefined) {
  return typeof value === 'string' && AMC_HOST.test(value) && !/\s/.test(value) && value.length <= 500 ? value : null;
}

/** One showing of any movie; `movieTitle` is what AMC calls it, matched later against the member's title. */
export interface DayShowtime extends ShowtimeOption {
  movieTitle: string;
}

function fixtureDay(date: string): DayShowtime[] {
  const at = (time: string) => Date.parse(`${date}T${time}:00-05:00`);
  return [
    ['13:10', 'STANDARD', 1489],
    ['16:00', 'IMAX', 2149],
    ['19:00', 'STANDARD', 1689],
    ['19:40', 'DOLBY_CINEMA', 2049],
    ['22:15', 'STANDARD', 1689],
  ].map(([time, format, priceCents], index) => ({
    showtimeId: `${date.replaceAll('-', '')}${index}`,
    startsAt: at(time as string),
    format: format as AmcFormat,
    priceCents: priceCents as number,
    standardPriceCents: null,
    purchaseUrl: `https://www.amctheatres.com/order/fixture/${date}/${index + 1}`,
    isSoldOut: index === 4,
    // Matches every title, so any movie the emulator is asked about has showings.
    movieTitle: '*',
  }));
}

/** Every showing at one theater on one day (`YYYY-MM-DD`), all movies, earliest first. */
export async function fetchShowtimeDay(apiKey: string, theatreId: string, date: string): Promise<DayShowtime[]> {
  if (isFixtureMode(apiKey)) {
    return fixtureDay(date);
  }

  const fetchPages = async (page: number, found: AmcShowtime[]): Promise<AmcShowtime[]> => {
    const data = await callAmc<AmcShowtimesResponse>(apiKey, `/v2/theatres/${theatreId}/showtimes/${toAmcDate(date)}`, {
      'page-number': String(page),
      'page-size': String(SHOWTIMES_PAGE_SIZE),
    });
    const embedded = data._embedded?.showtimes ?? [];
    const all = [...found, ...embedded];
    const isDone = embedded.length < SHOWTIMES_PAGE_SIZE || all.length >= (data.count ?? 0) || page >= MAX_SHOWTIME_PAGES;
    return isDone ? all : fetchPages(page + 1, all);
  };
  const collected = await fetchPages(1, []);

  const result = collected
    .filter((showtime) => !showtime.isCanceled)
    .flatMap((showtime) => {
      const startsAt = Date.parse(showtime.showDateTimeUtc ?? '');
      const purchaseUrl = toHttpsUrl(showtime.purchaseUrl) ?? toHttpsUrl(showtime.mobilePurchaseUrl);
      return Number.isFinite(startsAt) && purchaseUrl && showtime.id !== undefined && showtime.movieName
        ? [
            {
              showtimeId: String(showtime.id),
              startsAt,
              format: toFormat(showtime),
              priceCents: toAdultPriceCents(showtime),
              standardPriceCents: null,
              purchaseUrl,
              isSoldOut: Boolean(showtime.isSoldOut),
              movieTitle: showtime.movieName,
            } satisfies DayShowtime,
          ]
        : [];
    })
    .sort((left, right) => left.startsAt - right.startsAt);
  return result;
}

/** One movie's showings from a day's list; each premium one carries the Standard price of the showing nearest in time that is still on sale, so a prime-time IMAX isn't compared with a matinee. */
export function pickMovieShowtimes(day: DayShowtime[], title: string): ShowtimeOption[] {
  const matches = day.filter((showtime) => showtime.movieTitle === '*' || isSameMovie(showtime.movieTitle, title));
  const now = Date.now();
  const standards = matches.filter(
    (showtime) => showtime.format === 'STANDARD' && showtime.priceCents !== null && !showtime.isSoldOut && showtime.startsAt > now,
  );
  const getBaseline = (startsAt: number) => {
    const nearest = [...standards].sort(
      (left, right) => Math.abs(left.startsAt - startsAt) - Math.abs(right.startsAt - startsAt) || left.startsAt - right.startsAt,
    )[0];
    return nearest ? nearest.priceCents : null;
  };
  const result = matches.map((showtime) => ({
    showtimeId: showtime.showtimeId,
    startsAt: showtime.startsAt,
    format: showtime.format,
    priceCents: showtime.priceCents,
    standardPriceCents: showtime.format === 'STANDARD' ? null : getBaseline(showtime.startsAt),
    purchaseUrl: showtime.purchaseUrl,
    isSoldOut: showtime.isSoldOut,
  }));
  return result;
}
