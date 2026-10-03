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
// searched one are the same movie. Posters are null so seeds work offline.
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
  ];
}

const PREVIEWS_MINUTES = 20;
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
    {
      id: 'seed-viewing-starlight',
      movieKey: 'imdb-tt99000001',
      daysFromNow: 4,
    },
    { id: 'seed-viewing-galaxy', movieKey: 'imdb-tt99000003', daysFromNow: 25 },
  ];

  // One day each with two, three, four and five movies, to show every poster split.
  const DUNE = 'imdb-tt15239678';
  const MATRIX = 'imdb-tt0133093';
  const MIDNIGHT = 'imdb-tt99000004';
  const HOMETOWN = 'manual-seed-0001-hometown';
  const multiDays: Array<[number, string[]]> = [
    [-3, [MATRIX, DUNE]],
    [-9, [MIDNIGHT, MATRIX, DUNE]],
    [-15, [HOMETOWN, MIDNIGHT, MATRIX, DUNE]],
    [-17, [DUNE, HOMETOWN, MIDNIGHT, MATRIX, DUNE]],
  ];
  const multiPlan = multiDays.flatMap(([daysFromNow, movieKeys]) =>
    movieKeys.map((movieKey, index) => ({
      id: `seed-viewing-day${-daysFromNow}-${index + 1}`,
      movieKey,
      daysFromNow,
      hour: 11 + index * 3,
    })),
  );

  return [...plan, ...multiPlan].map(
    ({
      id,
      movieKey,
      daysFromNow,
      hour = 19,
      minute = 0,
    }: {
      id: string;
      movieKey: string;
      daysFromNow: number;
      hour?: number;
      minute?: number;
    }) => {
      const { movie: snapshot } = find(movieKey);
      const showtimeAt = getShowtime(now, daysFromNow, hour, minute);
      const endsAt =
        showtimeAt +
        (PREVIEWS_MINUTES + (snapshot.runtimeMinutes ?? DEFAULT_RUNTIME)) *
          60_000;
      return {
        id,
        movieKey,
        movie: snapshot,
        showtimeAt,
        endsAt,
        status: endsAt <= now ? 'SEEN' : 'PLANNED',
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
    setupCompletedAt: setupAt,
    createdAt: setupAt,
    lastEditedAt: setupAt,
  });

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

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1 + watchlist.length + viewings.length,
  };
}
