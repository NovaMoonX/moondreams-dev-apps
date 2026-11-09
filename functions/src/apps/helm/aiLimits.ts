import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export const AI_LIMITS = {
  quick: { perWindow: 60, perDay: 400 },
  full: { perWindow: 20, perDay: 150 },
};
export const AI_WINDOW_MS = 10 * 60 * 1000;
/** Project-wide daily stop, in cents. */
export const AI_DAILY_BUDGET_CENTS = 1000;
const HUNDREDTHS_PER_CENT = 100;

export type AiRoute = keyof typeof AI_LIMITS;

export type HeldReason = 'dailyLimit' | 'recentLimit' | 'budgetReached';

/** Which allowance a call has spent: the day's first, since waiting out the window would not help. */
export const readLimitHit = (
  route: AiRoute,
  day: number,
  recentCount: number,
): 'dailyLimit' | 'recentLimit' | null => {
  if (day >= AI_LIMITS[route].perDay) return 'dailyLimit';
  return recentCount >= AI_LIMITS[route].perWindow ? 'recentLimit' : null;
};

export const getDayKey = (now: number) =>
  new Date(now).toISOString().slice(0, 10);

const usagePath = (uid: string, dayKey: string) =>
  `apps/helm/server/${uid}/aiUsage/${dayKey}`;
const budgetPath = (dayKey: string) => `apps/helm/aiBudget/${dayKey}`;

interface UsageDoc {
  quick?: { day: number; recent: number[] };
  full?: { day: number; recent: number[] };
}

/** Counts one call against the person's allowance on a route, after an advisory read of the project's day so concurrent calls never lock on the shared budget; says why when either is spent. */
export async function reserveAiCall(
  firestore: Firestore,
  uid: string,
  now: number,
  route: AiRoute,
): Promise<HeldReason | null> {
  const dayKey = getDayKey(now);
  const usageRef = firestore.doc(usagePath(uid, dayKey));
  const budgetSnap = await firestore.doc(budgetPath(dayKey)).get();
  const spent =
    (budgetSnap.data()?.hundredthsOfCent as number | undefined) ?? 0;
  if (spent >= AI_DAILY_BUDGET_CENTS * HUNDREDTHS_PER_CENT) {
    logger.warn('helm.ai.budgetReached');
    return 'budgetReached';
  }
  const held = await firestore.runTransaction(async (transaction) => {
    const usageSnap = await transaction.get(usageRef);
    const usage = (usageSnap.data() as UsageDoc | undefined)?.[route] ?? {
      day: 0,
      recent: [],
    };
    const recent = usage.recent.filter((at) => now - at < AI_WINDOW_MS);
    const hit = readLimitHit(route, usage.day, recent.length);
    if (hit) return hit;
    transaction.set(
      usageRef,
      { [route]: { day: usage.day + 1, recent: [...recent, now] } },
      { merge: true },
    );
    return null;
  });
  if (held) logger.info(`helm.ai.${held}`);
  return held;
}

export async function recordAiSpend(
  firestore: Firestore,
  now: number,
  hundredthsOfCent: number,
) {
  await firestore
    .doc(budgetPath(getDayKey(now)))
    .set(
      { hundredthsOfCent: FieldValue.increment(hundredthsOfCent) },
      { merge: true },
    );
}
