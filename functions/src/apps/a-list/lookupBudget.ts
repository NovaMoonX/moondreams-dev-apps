import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

interface LookupBudget {
  /** Keeps each upstream's counters apart inside `lookupUsage`. */
  idPrefix: string;
  appCapName: string;
  appCap: number;
  memberCapName: string;
  memberCap: number;
  exhaustedMessage: string;
}

// OMDb's free key allows about 1,000 lookups a day for the whole app; stop short of it.
export const MOVIE_BUDGET: LookupBudget = {
  idPrefix: '',
  appCapName: 'A_LIST_APP_DAILY_LOOKUP_CAP',
  appCap: 900,
  memberCapName: 'A_LIST_MEMBER_DAILY_LOOKUP_CAP',
  memberCap: 100,
  exhaustedMessage: 'Movie search is resting for today. You can still add a movie by its title.',
};

export const THEATRE_BUDGET: LookupBudget = {
  idPrefix: 'theatres_',
  appCapName: 'A_LIST_THEATRE_APP_DAILY_LOOKUP_CAP',
  appCap: 500,
  memberCapName: 'A_LIST_THEATRE_MEMBER_DAILY_LOOKUP_CAP',
  memberCap: 40,
  exhaustedMessage: 'Theater search is resting for today. Try again tomorrow.',
};

function readCap(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Counts one upstream lookup against today's app-wide and per-member budgets, or refuses
 * with `resource-exhausted`. Call it only on a cache miss, right before the upstream call.
 */
export async function reserveLookup(uid: string, budget: LookupBudget = MOVIE_BUDGET): Promise<void> {
  const firestore = getFirestore();
  const day = new Date().toISOString().slice(0, 10);
  const appRef = firestore.doc(`apps/a-list/lookupUsage/${budget.idPrefix}${day}`);
  const memberRef = firestore.doc(`apps/a-list/lookupUsage/${budget.idPrefix}${day}_${uid}`);
  const appCap = readCap(budget.appCapName, budget.appCap);
  const memberCap = readCap(budget.memberCapName, budget.memberCap);

  await firestore.runTransaction(async (transaction) => {
    const [appSnapshot, memberSnapshot] = await transaction.getAll(appRef, memberRef);
    const appCount = (appSnapshot.get('count') as number | undefined) ?? 0;
    const memberCount = (memberSnapshot.get('count') as number | undefined) ?? 0;

    if (appCount >= appCap || memberCount >= memberCap) {
      throw new HttpsError('resource-exhausted', budget.exhaustedMessage);
    }

    transaction.set(appRef, { count: appCount + 1, day });
    transaction.set(memberRef, { count: memberCount + 1, day, uid });
  });
}
