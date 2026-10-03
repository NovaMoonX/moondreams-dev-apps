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
      movie: movie('Hometown Film Fest Shorts', getDayUtcAhead(now, 12), null, null),
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

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1 + watchlist.length,
  };
}
