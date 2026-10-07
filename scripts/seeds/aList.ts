import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;

/** UTC midnight of the calendar day `daysAgo` days before `now`: a date-only value. */
function getDayUtc(now: number, daysAgo: number) {
  const date = new Date(now - daysAgo * DAY_MS);
  const result = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  return result;
}

/** UTC midnight of the calendar day `daysAhead` days after `now`. */
function getDayUtcAhead(now: number, daysAhead: number) {
  return getDayUtc(now, -daysAhead);
}

function movie(
  title: string,
  releaseDate: number | null,
  runtimeMinutes: number | null,
  contentRating: string | null,
  posterUrl: string | null = null,
) {
  return { title, releaseDate, posterUrl, runtimeMinutes, contentRating };
}

// Keys and snapshots match the emulator's OMDb fixture catalog, so a seeded movie and a
// searched one are the same movie; one `tmdb-` key (already released, so never refreshed)
// covers the TMDB key shape. Posters are null so seeds work offline.
function getWatchlistFixtures(now: number) {
  return [
    {
      movieKey: 'imdb-tt99000001',
      movie: movie('Starlight Harbor', getDayUtcAhead(now, 3), 118, 'PG-13'),
      priority: 'MUST_SEE',
      preferredFormat: 'IMAX',
    },
    {
      movieKey: 'imdb-tt15239678',
      movie: movie('Dune: Part Two', Date.UTC(2024, 2, 1), 166, 'PG-13'),
      priority: 'MUST_SEE',
      preferredFormat: 'DOLBY_CINEMA',
    },
    {
      movieKey: 'imdb-tt99000003',
      movie: movie('Galaxy Drift', getDayUtcAhead(now, 24), 142, 'PG-13'),
      priority: 'WANT_TO_SEE',
      preferredFormat: null,
    },
    {
      movieKey: 'imdb-tt99000004',
      movie: movie('Midnight Matinee', null, null, null),
      priority: 'WANT_TO_SEE',
      preferredFormat: null,
    },
    {
      movieKey: 'manual-seed-0001-hometown',
      movie: movie(
        'Hometown Film Fest Shorts',
        getDayUtcAhead(now, 12),
        null,
        null,
      ),
      priority: 'IF_I_HAVE_TIME',
      preferredFormat: null,
    },
    {
      movieKey: 'imdb-tt0133093',
      movie: movie('The Matrix', Date.UTC(1999, 2, 31), 136, 'R'),
      priority: 'IF_I_HAVE_TIME',
      preferredFormat: 'LASER',
    },
    {
      movieKey: 'tmdb-438631',
      movie: movie('Dune', Date.UTC(2021, 9, 22), 155, 'PG-13'),
      priority: 'WANT_TO_SEE',
      preferredFormat: null,
    },
  ];
}

const PREVIEWS_MINUTES = 20;
const TRAILER_REMINDER_DELAY_MINUTES = 5;
const PREVIEWS_VIEWING_ID = 'seed-viewing-previews';
const PREVIEWS_REMINDER_ID = 'seed-a-list-trailer-reminder';
const DEFAULT_RUNTIME = 120;

const SEED_TIMEZONE = 'America/Los_Angeles';

/** Wall-clock fields of an instant in `timeZone`. */
function readWallClock(epoch: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(epoch));
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** A Los Angeles wall time on the LA calendar day `daysFromNow` days from LA's today, DST included. */
function getShowtime(now: number, daysFromNow: number, hour = 19, minute = 0) {
  const today = readWallClock(now, SEED_TIMEZONE);
  const target = new Date(
    Date.UTC(
      today.year,
      today.month - 1,
      today.day + daysFromNow,
      hour,
      minute,
    ),
  );
  const wallAsUtc = target.getTime();
  const offsetOf = (epoch: number) => {
    const wall = readWallClock(epoch, SEED_TIMEZONE);
    return (
      Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) -
      epoch
    );
  };
  const firstGuess = wallAsUtc - offsetOf(wallAsUtc);
  const result = wallAsUtc - offsetOf(firstGuess);
  return result;
}

// The spec's Standard example, a premium ticket with its standard price, and an all-in total.
const SEED_RATINGS: Record<string, number> = {
  'seed-viewing-matrix': 3.5,
  'seed-viewing-dune-1': 5,
  'seed-viewing-dune-2': 5,
};

const SEED_THEATRES = [
  {
    theatreId: 'manual-seed-theatre-mission-valley',
    name: 'AMC Mission Valley 20',
    addressLine: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
  },
  {
    theatreId: 'manual-seed-theatre-town-center',
    name: 'AMC Town Center 20',
    addressLine: null,
    city: null,
    state: null,
    postalCode: null,
    latitude: null,
    longitude: null,
  },
];

function toTheatreSnapshot({
  theatreId,
  name,
  city,
  state,
}: (typeof SEED_THEATRES)[number]) {
  return { theatreId, name, city, state };
}

// Viewings not listed here have no theater, like the ones written before theaters existed.
const SEED_VIEWING_THEATRES: Record<string, number> = {
  'seed-viewing-matrix': 0,
  'seed-viewing-dune-1': 0,
  'seed-viewing-dune-2': 1,
};

const SEED_TICKETS: Record<string, object> = {
  'seed-viewing-matrix': {
    entryMode: 'ITEMIZED',
    format: 'STANDARD',
    priceCents: 1556,
    standardPriceCents: null,
    feeAvoidedCents: 0,
    taxRate: 0.081,
    taxCents: 126,
    totalCents: 1682,
  },
  'seed-viewing-dune-1': {
    entryMode: 'ITEMIZED',
    format: 'DOLBY_CINEMA',
    priceCents: 1999,
    standardPriceCents: 1449,
    feeAvoidedCents: 150,
    taxRate: 0.075,
    taxCents: 150,
    totalCents: 2299,
  },
  'seed-viewing-day9-3': {
    entryMode: 'ALL_IN',
    format: 'IMAX',
    priceCents: 1850,
    standardPriceCents: 1400,
    feeAvoidedCents: 150,
    taxRate: 0.075,
    taxCents: 139,
    totalCents: 2139,
  },
};

function getViewingFixtures(now: number) {
  const items = getWatchlistFixtures(now);
  const find = (movieKey: string) =>
    items.find((item) => item.movieKey === movieKey)!;
  const plan = [
    {
      id: 'seed-viewing-dune-1',
      movieKey: 'imdb-tt15239678',
      daysFromNow: -20,
    },
    { id: 'seed-viewing-matrix', movieKey: 'imdb-tt0133093', daysFromNow: -12 },
    { id: 'seed-viewing-dune-2', movieKey: 'imdb-tt15239678', daysFromNow: -6 },
    // 11 pm in Los Angeles is already the next day in UTC; it must count on the LA day.
    // Two days back so it has always ended (and is seen) whenever the seed runs.
    {
      id: 'seed-viewing-late',
      movieKey: 'imdb-tt0133093',
      daysFromNow: -2,
      hour: 23,
    },
    // Ended but never answered: the Seen prompt asks about these, oldest first.
    {
      id: 'seed-viewing-awaiting-1',
      movieKey: 'imdb-tt99000004',
      daysFromNow: -4,
      hour: 20,
      awaiting: true,
    },
    {
      id: 'seed-viewing-awaiting-2',
      movieKey: 'manual-seed-0001-hometown',
      daysFromNow: -1,
      hour: 14,
      awaiting: true,
    },
    // Starts 5 minutes after the seed runs, so the "add from trailers" strip shows (it lasts about 35 minutes).
    {
      id: PREVIEWS_VIEWING_ID,
      movieKey: 'imdb-tt99000004',
      daysFromNow: 0,
      minutesFromNow: 5,
    },
    {
      id: 'seed-viewing-starlight',
      movieKey: 'imdb-tt99000001',
      daysFromNow: 4,
    },
    { id: 'seed-viewing-galaxy', movieKey: 'imdb-tt99000003', daysFromNow: 25 },
  ];

  // One day each with two, three, four and five movies, to show every poster split, past and ahead.
  const DUNE = 'imdb-tt15239678';
  const MATRIX = 'imdb-tt0133093';
  const MIDNIGHT = 'imdb-tt99000004';
  const HOMETOWN = 'manual-seed-0001-hometown';
  const multiDays: Array<[number, string[]]> = [
    [-3, [MATRIX, DUNE]],
    [-9, [MIDNIGHT, MATRIX, DUNE]],
    [-15, [HOMETOWN, MIDNIGHT, MATRIX, DUNE]],
    [-17, [DUNE, HOMETOWN, MIDNIGHT, MATRIX, DUNE]],
    // Yesterday: six seen movies, past the four a cell can split, so the "+N" shows in the current month.
    [-1, [MATRIX, DUNE, MIDNIGHT, HOMETOWN, MATRIX, DUNE]],
    // Planned days ahead, so the current month shows a split of three and of five too.
    [8, [MATRIX, DUNE, MIDNIGHT]],
    [11, [DUNE, HOMETOWN, MIDNIGHT, MATRIX, DUNE]],
  ];
  const multiPlan = multiDays.flatMap(([daysFromNow, movieKeys]) =>
    movieKeys.map((movieKey, index) => ({
      id: `seed-viewing-day${daysFromNow < 0 ? -daysFromNow : `ahead${daysFromNow}`}-${index + 1}`,
      movieKey,
      daysFromNow,
      hour: daysFromNow === -1 ? 7 + index : 11 + index * 3,
    })),
  );

  return [...plan, ...multiPlan].map(
    ({
      id,
      movieKey,
      daysFromNow,
      hour = 19,
      minute = 0,
      minutesFromNow,
      awaiting = false,
    }: {
      id: string;
      movieKey: string;
      daysFromNow: number;
      hour?: number;
      minute?: number;
      minutesFromNow?: number;
      awaiting?: boolean;
    }) => {
      const { movie: snapshot } = find(movieKey);
      const showtimeAt =
        minutesFromNow === undefined
          ? getShowtime(now, daysFromNow, hour, minute)
          : now + minutesFromNow * 60_000;
      const endsAt =
        showtimeAt +
        (PREVIEWS_MINUTES + (snapshot.runtimeMinutes ?? DEFAULT_RUNTIME)) *
          60_000;
      // An ended showing marked `awaiting` stays planned, so the Seen prompt has something to ask about.
      const status = endsAt <= now && !awaiting ? 'SEEN' : 'PLANNED';
      return {
        id,
        movieKey,
        movie: snapshot,
        showtimeAt,
        endsAt,
        status,
        ticket: SEED_TICKETS[id] ?? null,
        trailerReminderId:
          id === PREVIEWS_VIEWING_ID ? PREVIEWS_REMINDER_ID : null,
        rating: status === 'SEEN' ? (SEED_RATINGS[id] ?? null) : null,
        ...(SEED_VIEWING_THEATRES[id] === undefined
          ? {}
          : {
              theatre: toTheatreSnapshot(
                SEED_THEATRES[SEED_VIEWING_THEATRES[id]],
              ),
            }),
        createdAt: Math.min(now, showtimeAt),
        lastEditedAt: Math.min(now, showtimeAt),
      };
    },
  );
}

// Alex has a finished membership; every other fixture account lands on Setup.
export async function seedAList(context: SeedContext): Promise<SeedResult> {
  const alex = FIXTURE_USERS.partnerOne;
  const membershipRef = context.firestore
    .collection('apps')
    .doc('a-list')
    .collection('memberships')
    .doc(alex.uid);
  const setupAt = context.now - 60 * DAY_MS;

  await membershipRef.set({
    uid: alex.uid,
    monthlyCostCents: 2599,
    monthlyTotalCents: 2794,
    taxRate: 0.075,
    startDate: getDayUtc(context.now, 60),
    weeklyGoal: 2,
    monthlyGoal: 6,
    favoriteTheatreId: SEED_THEATRES[0].theatreId,
    setupCompletedAt: setupAt,
    createdAt: setupAt,
    lastEditedAt: setupAt,
  });

  await Promise.all(
    SEED_THEATRES.map((theatre) =>
      membershipRef
        .collection('theatres')
        .doc(theatre.theatreId)
        .set({ ...theatre, createdAt: setupAt, lastEditedAt: setupAt }),
    ),
  );

  const watchlist = getWatchlistFixtures(context.now);
  await Promise.all(
    watchlist.map((item, index) =>
      membershipRef
        .collection('watchlist')
        .doc(item.movieKey)
        .set({
          ...item,
          createdAt: setupAt + index * 60_000,
          lastEditedAt: setupAt + index * 60_000,
        }),
    ),
  );

  const viewings = getViewingFixtures(context.now);
  await Promise.all(
    viewings.map((viewing) =>
      membershipRef.collection('viewings').doc(viewing.id).set(viewing),
    ),
  );

  const previewsViewing = viewings.find(
    (viewing) => viewing.id === PREVIEWS_VIEWING_ID,
  );
  if (previewsViewing) {
    await context.firestore
      .collection('reminders')
      .doc(PREVIEWS_REMINDER_ID)
      .set({
        id: PREVIEWS_REMINDER_ID,
        appId: 'a-list',
        targetUids: [alex.uid],
        title: 'Previews time 📽️',
        body: `Spot a movie you like at ${previewsViewing.movie.title}? Add it to your watchlist while it’s fresh.`,
        scheduledFor:
          previewsViewing.showtimeAt + TRAILER_REMINDER_DELAY_MINUTES * 60_000,
        status: 'pending',
        channels: ['push'],
        relatedEntityPath: `apps/a-list/memberships/${alex.uid}/viewings/${PREVIEWS_VIEWING_ID}`,
        recurrence: 'none',
        createdBy: alex.uid,
        createdAt: context.now,
      });
  }

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments:
      2 + SEED_THEATRES.length + watchlist.length + viewings.length,
  };
}
