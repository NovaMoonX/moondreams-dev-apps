import { randomUUID } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  fetchShowtimeDay,
  isFixtureMode,
  listAllTheatres,
  pickMovieShowtimes,
  readAmcKey,
} from '../amc.js';
import {
  reserveLookup,
  SHOWTIME_BUDGET,
  THEATRE_BUDGET,
} from '../lookupBudget.js';
import { isFresh, readCache, toCacheId, writeCache } from '../movieCache.js';
import { pickProvider, resolveMovieKey } from '../movieProvider.js';
import type {
  MovieSnapshot,
  TheatreResult,
  TicketPriceKind,
} from '../types.js';
import {
  buildTicket,
  computeEndsAt,
  findListedShowtime,
  findUsualTaxRate,
  localDayOf,
  localShowtimeToEpoch,
  normalizeTheatreName,
  normalizeTitle,
  reconcileAmounts,
} from './emailMatching.js';
import type { TheatreSnapshot, Ticket, Viewing } from './emailTypes.js';
import type {
  AmcCancellation,
  AmcReservation,
  LocalShowtime,
} from './parseAmcEmail.js';

const DAY_MS = 86_400_000;
const FALLBACK_ZONE = 'America/New_York';
const THEATRES_CACHE_ID = toCacheId('v1:email:all-theatres');

type PastViewing = Pick<
  Viewing,
  'movieKey' | 'movie' | 'showtimeAt' | 'ticket' | 'theatre'
>;

interface WatchlistEntry {
  movieKey: string;
  movie: MovieSnapshot;
  isArchived: boolean;
}

/** What the member already has, read once per email. */
export interface MemberContext {
  viewings: PastViewing[];
  watchlist: WatchlistEntry[];
  savedTheatres: TheatreSnapshot[];
}

export async function loadMemberContext(
  firestore: Firestore,
  uid: string,
): Promise<MemberContext> {
  const base = `apps/a-list/memberships/${uid}`;
  const [viewings, watchlist, theatres] = await Promise.all([
    firestore
      .collection(`${base}/viewings`)
      .select('movieKey', 'movie', 'showtimeAt', 'ticket', 'theatre')
      .get(),
    firestore.collection(`${base}/watchlist`).get(),
    firestore.collection(`${base}/theatres`).get(),
  ]);
  return {
    viewings: viewings.docs.map((entry) => entry.data() as PastViewing),
    watchlist: watchlist.docs.map((entry) => ({
      movieKey: entry.id,
      movie: entry.get('movie') as MovieSnapshot,
      isArchived: entry.get('archivedAt') != null,
    })),
    savedTheatres: theatres.docs.map((entry) => ({
      theatreId: entry.id,
      name: entry.get('name') as string,
      city: (entry.get('city') as string | null) ?? null,
      state: (entry.get('state') as string | null) ?? null,
      timeZone: (entry.get('timeZone') as string | null) ?? null,
    })),
  };
}

const toSnapshot = (theatre: TheatreResult): TheatreSnapshot => ({
  theatreId: theatre.theatreId,
  name: theatre.name,
  city: theatre.city,
  state: theatre.state,
  timeZone: theatre.timeZone,
});

async function loadAmcTheatres(uid: string): Promise<TheatreResult[]> {
  const cached = await readCache<TheatreResult[]>(
    'theatreCache',
    THEATRES_CACHE_ID,
  );
  if (cached && isFresh(cached, 7 * DAY_MS)) return cached.value;
  await reserveLookup(uid, THEATRE_BUDGET);
  const apiKey = readAmcKey();
  const all = await listAllTheatres(apiKey);
  if (all.length > 0 && !isFixtureMode(apiKey)) {
    await writeCache('theatreCache', THEATRES_CACHE_ID, all);
  }
  return all;
}

/** The member's saved theater by name, else AMC's by exact name, else one typed from the email (no zone, so the showtime is read in the zone of the theater they last went to). */
export async function resolveTheatre(
  uid: string,
  context: MemberContext,
  name: string,
): Promise<TheatreSnapshot> {
  const wanted = normalizeTheatreName(name);
  const saved = context.savedTheatres.find(
    (theatre) => normalizeTheatreName(theatre.name) === wanted,
  );
  if (saved !== undefined) return saved;
  try {
    const found = (await loadAmcTheatres(uid)).find(
      (theatre) => normalizeTheatreName(theatre.name) === wanted,
    );
    if (found !== undefined) return toSnapshot(found);
  } catch (error) {
    logger.warn('email.theatreLookupFailed', {
      name: (error as Error)?.name ?? 'Error',
    });
  }
  return {
    theatreId: `manual-${randomUUID()}`,
    name,
    city: null,
    state: null,
    timeZone: null,
  };
}

/** The zone a showtime is read in: the theater's, else the zone of the member's latest showing with one, else Eastern. */
export function zoneFor(theatre: TheatreSnapshot, context: MemberContext) {
  const latest = context.viewings
    .filter((viewing) => viewing.theatre?.timeZone != null)
    .sort((left, right) => right.showtimeAt - left.showtimeAt)[0];
  return theatre.timeZone ?? latest?.theatre?.timeZone ?? FALLBACK_ZONE;
}

export interface ResolvedPlace {
  theatre: TheatreSnapshot;
  showtimeAt: number;
}

export async function resolvePlace(
  uid: string,
  context: MemberContext,
  reading: AmcReservation | AmcCancellation,
): Promise<ResolvedPlace> {
  const theatre = await resolveTheatre(uid, context, reading.theatreName);
  return {
    theatre,
    showtimeAt: localShowtimeToEpoch(
      reading.showtimeLocal as LocalShowtime,
      zoneFor(theatre, context),
    ),
  };
}

export interface ResolvedMovie {
  movieKey: string;
  movie: MovieSnapshot;
}

async function findInCatalog(
  uid: string,
  title: string,
  showtimeAt: number,
): Promise<ResolvedMovie | null> {
  const provider = pickProvider();
  const results = await provider.search(
    provider.getKey(),
    title,
    provider.isBudgeted ? () => reserveLookup(uid) : async () => {},
  );
  const wanted = normalizeTitle(title);
  const exact = results.filter(
    (result) => normalizeTitle(result.title) === wanted,
  );
  const showYear = new Date(showtimeAt).getUTCFullYear();
  const inRange = exact.filter(
    (result) => result.year !== null && Math.abs(result.year - showYear) <= 1,
  );
  const pick = inRange[0] ?? (exact.length === 1 ? exact[0] : undefined);
  const resolved = pick ? resolveMovieKey(pick.movieKey) : null;
  if (!pick || !resolved) return null;
  const cached = await readCache<MovieSnapshot>('movieCache', pick.movieKey);
  if (cached && isFresh(cached, DAY_MS)) {
    return { movieKey: pick.movieKey, movie: cached.value };
  }
  if (resolved.provider.isBudgeted) await reserveLookup(uid);
  const movie = await resolved.provider.getTitle(
    resolved.provider.getKey(),
    resolved.providerId,
  );
  await writeCache('movieCache', pick.movieKey, movie);
  return { movieKey: pick.movieKey, movie };
}

/** The member's own viewing or watchlist entry by exact title, else the movie catalog's exact match, else a typed movie made of what the email says. */
export async function resolveMovie(
  uid: string,
  context: MemberContext,
  reading: AmcReservation,
  showtimeAt: number,
): Promise<ResolvedMovie & { isOnWatchlist: boolean }> {
  const wanted = normalizeTitle(reading.title);
  const onWatchlist = context.watchlist.find(
    (entry) => normalizeTitle(entry.movie.title) === wanted,
  );
  if (onWatchlist !== undefined) {
    return {
      movieKey: onWatchlist.movieKey,
      movie: onWatchlist.movie,
      isOnWatchlist: true,
    };
  }
  const watched = context.viewings.find(
    (viewing) => normalizeTitle(viewing.movie.title) === wanted,
  );
  if (watched !== undefined) {
    return {
      movieKey: watched.movieKey,
      movie: watched.movie,
      isOnWatchlist: false,
    };
  }
  const found = await findInCatalog(uid, reading.title, showtimeAt).catch(
    (error: unknown) => {
      logger.warn('email.movieLookupFailed', {
        name: (error as Error)?.name ?? 'Error',
      });
      return null;
    },
  );
  return found
    ? { ...found, isOnWatchlist: false }
    : {
        movieKey: `manual-${randomUUID()}`,
        movie: {
          title: reading.title,
          releaseDate: null,
          posterUrl: null,
          runtimeMinutes: null,
          contentRating: reading.contentRating,
        },
        isOnWatchlist: false,
      };
}

async function findListed(
  uid: string,
  theatre: TheatreSnapshot,
  reading: AmcReservation,
  showtimeAt: number,
) {
  if (!/^\d{1,8}$/.test(theatre.theatreId)) return null;
  try {
    await reserveLookup(uid, SHOWTIME_BUDGET);
    const day = await fetchShowtimeDay(
      readAmcKey(),
      theatre.theatreId,
      localDayOf(reading.showtimeLocal),
    );
    return findListedShowtime(
      pickMovieShowtimes(day, reading.title),
      showtimeAt,
    );
  } catch (error) {
    logger.warn('email.showtimeLookupFailed', {
      name: (error as Error)?.name ?? 'Error',
    });
    return null;
  }
}

/** The ticket the reservation implies: format, price and tax from AMC's listing of that showing where it can be found, else from the email and the member's usual rate. null when nothing prices it. */
export async function resolveTicket(
  uid: string,
  context: MemberContext,
  reading: AmcReservation,
  place: ResolvedPlace,
): Promise<Ticket | null> {
  const listed = await findListed(
    uid,
    place.theatre,
    reading,
    place.showtimeAt,
  );
  const kind: TicketPriceKind = reading.ticketKind ?? 'ADULT';
  const amounts = reconcileAmounts({
    emailPriceCents: reading.ticketPriceCents,
    amc:
      listed === null
        ? null
        : { priceCents: listed.prices[kind], taxCents: listed.taxes[kind] },
    usualTaxRate: findUsualTaxRate(context.viewings, place.theatre),
  });
  const format = reading.format ?? listed?.format ?? 'STANDARD';
  return buildTicket({
    amounts,
    format,
    standardPriceCents: listed?.standardPrices[kind] ?? null,
    feeAvoidedCents: reading.feeWaivedCents,
  });
}

export const endsAtFor = (showtimeAt: number, movie: MovieSnapshot) =>
  computeEndsAt(showtimeAt, movie.runtimeMinutes);
