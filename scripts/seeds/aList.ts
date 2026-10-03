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
  const result = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return result;
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

  return {
    ...EMPTY_SEED_RESULT,
    firestoreDocuments: 1,
  };
}
