import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

// OMDb's free key allows about 1,000 lookups a day for the whole app; stop short of it.
const DEFAULT_APP_DAILY_CAP = 900;
const DEFAULT_MEMBER_DAILY_CAP = 100;

function readCap(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Counts one upstream lookup against today's app-wide and per-member budgets, or refuses
 * with `resource-exhausted`. Call it only on a cache miss, right before the upstream call.
 */
export async function reserveLookup(uid: string): Promise<void> {
  const firestore = getFirestore();
  const day = new Date().toISOString().slice(0, 10);
  const appRef = firestore.doc(`apps/a-list/lookupUsage/${day}`);
  const memberRef = firestore.doc(`apps/a-list/lookupUsage/${day}_${uid}`);
  const appCap = readCap('A_LIST_APP_DAILY_LOOKUP_CAP', DEFAULT_APP_DAILY_CAP);
  const memberCap = readCap('A_LIST_MEMBER_DAILY_LOOKUP_CAP', DEFAULT_MEMBER_DAILY_CAP);

  await firestore.runTransaction(async (transaction) => {
    const [appSnapshot, memberSnapshot] = await transaction.getAll(appRef, memberRef);
    const appCount = (appSnapshot.get('count') as number | undefined) ?? 0;
    const memberCount = (memberSnapshot.get('count') as number | undefined) ?? 0;

    if (appCount >= appCap || memberCount >= memberCap) {
      throw new HttpsError(
        'resource-exhausted',
        'Movie search is resting for today. You can still add a movie by its title.',
      );
    }

    transaction.set(appRef, { count: appCount + 1, day });
    transaction.set(memberRef, { count: memberCount + 1, day, uid });
  });
}
