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
  _embedded?: { suggestions?: Array<{ title?: string; type?: string; _links?: Record<string, AmcLink | undefined> }> };
}

interface AmcTheatresResponse {
  _embedded?: { theatres?: AmcTheatre[] };
}

interface AmcTheatre {
  id?: number | string;
  name?: string;
  timezone?: string;
  isClosed?: boolean;
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

// Only the suggestions lookup answers "nothing matches" with a 400; on any other call a 4xx means our request is wrong, which must not read as an empty result.
async function callAmc<T>(
  apiKey: string,
  path: string,
  params: Record<string, string>,
  isNoMatchAnswer = false,
): Promise<T | null> {
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
    if (isNoMatchAnswer && (response.status === 400 || response.status === 404)) {
      return null;
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

export interface AmcPlace {
  label: string;
  kind: 'zipcode' | 'city' | 'state';
  latitude: number | null;
  longitude: number | null;
  /** AMC's name for the state, like "washington", for kind "state". */
  state: string | null;
}

const FIXTURE_PLACES: AmcPlace[] = [
  { label: 'Overland Park, KS', kind: 'city', latitude: 38.98, longitude: -94.67, state: null },
  { label: 'Kansas', kind: 'state', latitude: null, longitude: null, state: 'kansas' },
];

const PLACE_KINDS = ['zipcode', 'city', 'state'];

function toPlace(suggestion: { title?: string; type?: string; _links?: Record<string, AmcLink | undefined> }): AmcPlace | null {
  const label = toText(suggestion.title);
  const kind = PLACE_KINDS.find((candidate) => candidate === suggestion.type) as AmcPlace['kind'] | undefined;
  if (!label || !kind) {
    return null;
  }

  const links = Object.entries(suggestion._links ?? {}).filter(([name]) => name !== 'self');
  const places = links.flatMap(([, link]): AmcPlace[] => {
    const url = toUrl(link?.href);
    const stateName = url?.pathname.match(/\/states\/([a-z0-9-]{2,40})$/)?.[1] ?? null;
    const latitude = Number(url?.searchParams.get('latitude') || Number.NaN);
    const longitude = Number(url?.searchParams.get('longitude') || Number.NaN);
    if (stateName) {
      return [{ label, kind, latitude: null, longitude: null, state: stateName }];
    }
    return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? [{ label, kind, latitude, longitude, state: null }]
      : [];
  });
  return places[0] ?? null;
}

/** AMC's suggestions for typed text: the zip codes, cities and states it matches, each with where to look. Theaters by name come from the theater list instead. */
export async function suggestPlaces(apiKey: string, query: string): Promise<AmcPlace[]> {
  if (isFixtureMode(apiKey)) {
    return /^[0-9]/.test(query) ? FIXTURE_PLACES.slice(0, 1) : FIXTURE_PLACES;
  }

  const data = await callAmc<AmcSuggestionsResponse>(apiKey, '/v2/location-suggestions', { query }, true);
  const places = (data?._embedded?.suggestions ?? []).flatMap((suggestion) => {
    const place = toPlace(suggestion);
    return place ? [place] : [];
  });
  return places;
}

function toUrl(href: string | undefined) {
  try {
    return href ? new URL(href, getBaseUrl()) : null;
  } catch {
    return null;
  }
}

function toText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const ZONE_BY_NAME: Record<string, string> = {
  'EASTERN TIME': 'America/New_York',
  'CENTRAL TIME': 'America/Chicago',
  'MOUNTAIN TIME': 'America/Denver',
  'PACIFIC TIME': 'America/Los_Angeles',
};

// AMC names a zone ("CENTRAL TIME"), not an IANA id. Arizona is the one Mountain place that never changes its clock.
function toTimeZone(theatre: AmcTheatre | undefined) {
  const name = toText(theatre?.timezone)?.toUpperCase() ?? '';
  if (name === 'MOUNTAIN TIME' && theatre?.location?.state === 'AZ') {
    return 'America/Phoenix';
  }
  return ZONE_BY_NAME[name] ?? null;
}

// AMC writes cities in capitals ("SAINT LOUIS"); this is for display, so "Mckinney" becomes "McKinney".
export function toTitleCase(text: string) {
  const result = text
    .toLowerCase()
    .replace(/(^|[\s\-.(])([a-z])/g, (_match, edge: string, letter: string) => edge + letter.toUpperCase())
    .replace(/^([a-z])'([a-z])/i, (_match, first: string, second: string) => `${first.toUpperCase()}'${second.toUpperCase()}`)
    .replace(/\bMc([a-z])/g, (_match, letter: string) => `Mc${letter.toUpperCase()}`);
  return result;
}

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTheatreResult(theatre: AmcTheatre | undefined, distance: unknown): TheatreResult | null {
  const theatreId = String(theatre?.id ?? '');
  const name = toText(theatre?.name);
  if (!/^[0-9]{1,8}$/.test(theatreId) || !name || theatre?.isClosed === true) {
    return null;
  }

  const city = toText(theatre?.location?.city);
  const result: TheatreResult = {
    theatreId,
    name,
    addressLine: toText(theatre?.location?.addressLine1),
    city: city ? toTitleCase(city) : null,
    state: toText(theatre?.location?.state),
    postalCode: toText(theatre?.location?.postalCode),
    latitude: toNumber(theatre?.location?.latitude),
    longitude: toNumber(theatre?.location?.longitude),
    timeZone: toTimeZone(theatre),
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

function toTheatreResults(data: AmcLocationsResponse | null, limit: number) {
  const locations = Object.values(data?._embedded ?? {}).flatMap((entries) => entries ?? []);
  const result = locations
    .map((location) =>
      toTheatreResult(
        Object.values(location._embedded ?? {}).find((embedded) => embedded?.id !== undefined),
        location.distance,
      ),
    )
    .filter((theatre): theatre is TheatreResult => theatre !== null)
    .slice(0, limit);
  return result;
}

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
  const result = toTheatreResults(data, MAX_THEATRES);
  return result;
}

export const MAX_STATE_THEATRES = 25;

/** The theaters AMC lists for a state, by AMC's own name for it ("washington"). */
export async function findStateTheatres(apiKey: string, state: string): Promise<TheatreResult[]> {
  if (isFixtureMode(apiKey)) {
    return FIXTURE_THEATRES;
  }

  const data = await callAmc<AmcLocationsResponse>(apiKey, `/v2/locations/states/${encodeURIComponent(state)}`, {
    'page-size': String(MAX_STATE_THEATRES),
  });
  const result = toTheatreResults(data, MAX_STATE_THEATRES);
  return result;
}

/** Every open AMC theater, for matching a typed name. */
export async function listAllTheatres(apiKey: string): Promise<TheatreResult[]> {
  if (isFixtureMode(apiKey)) {
    return FIXTURE_THEATRES.map((theatre) => ({ ...theatre, distanceMiles: null }));
  }

  const data = await callAmc<AmcTheatresResponse>(apiKey, '/v2/theatres', { 'page-size': '1000' });
  const result = (data?._embedded?.theatres ?? []).flatMap((theatre) => {
    const entry = toTheatreResult(theatre, null);
    return entry ? [entry] : [];
  });
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
    ['10:30', 'STANDARD', 1189],
    ['11:45', 'STANDARD', 1189],
    ['13:10', 'STANDARD', 1489],
    ['14:30', 'IMAX', 1949],
    ['16:00', 'IMAX', 2149],
    ['17:20', 'STANDARD', 1689],
    ['19:00', 'STANDARD', 1689],
    ['19:40', 'DOLBY_CINEMA', 2049],
    ['21:10', 'IMAX', 2149],
    ['22:15', 'STANDARD', 1689],
  ].map(([time, format, priceCents], index) => ({
    showtimeId: `${date.replaceAll('-', '')}${index}`,
    startsAt: at(time as string),
    format: format as AmcFormat,
    priceCents: priceCents as number,
    standardPriceCents: null,
    purchaseUrl: `https://www.amctheatres.com/order/fixture/${date}/${index + 1}`,
    isSoldOut: index === 9,
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
