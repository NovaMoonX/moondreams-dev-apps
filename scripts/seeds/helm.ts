import {
  DEFAULT_DAY_END_TIME,
  DEFAULT_DAY_START_TIME,
  DEFAULT_PLAN_FILL_PERCENT,
} from '../../src/apps/helm/constants.ts';
import {
  EMPTY_SEED_RESULT,
  FIXTURE_USERS,
  type SeedContext,
  type SeedResult,
} from './types.ts';

const DAY_MS = 86_400_000;

// Alex keeps Pacific Time, so the first open shows a profile that was made earlier; Jamie's zone differs from the emulator's.
const SEED_PROFILES = [
  { user: FIXTURE_USERS.partnerOne, timeZone: 'America/Los_Angeles' },
  { user: FIXTURE_USERS.partnerTwo, timeZone: 'America/New_York' },
];

export async function seedHelm(context: SeedContext): Promise<SeedResult> {
  const createdAt = context.now - 14 * DAY_MS;

  await Promise.all(
    SEED_PROFILES.map(({ user, timeZone }) =>
      context.firestore
        .collection('apps')
        .doc('helm')
        .collection('users')
        .doc(user.uid)
        .set({
          timeZone,
          dayStartTime: DEFAULT_DAY_START_TIME,
          dayEndTime: DEFAULT_DAY_END_TIME,
          planFillPercent: DEFAULT_PLAN_FILL_PERCENT,
          createdAt,
          lastEditedAt: null,
        }),
    ),
  );

  return { ...EMPTY_SEED_RESULT, firestoreDocuments: SEED_PROFILES.length };
}
