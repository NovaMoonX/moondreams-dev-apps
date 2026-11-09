import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

export const AI_LIMITS = { full: { perWindow: 20, perDay: 150 } };
export const AI_WINDOW_MS = 10 * 60 * 1000;
/** Project-wide daily stop, in cents. */
export const AI_DAILY_BUDGET_CENTS = 1000;
const HUNDREDTHS_PER_CENT = 100;

export type HeldReason = 'dailyLimit' | 'budgetReached';

export const getDayKey = (now: number) =>
  new Date(now).toISOString().slice(0, 10);

const usagePath = (uid: string, dayKey: string) =>
  `apps/helm/server/${uid}/aiUsage/${dayKey}`;
const budgetPath = (dayKey: string) => `apps/helm/aiBudget/${dayKey}`;

interface UsageDoc {
  full?: { day: number; recent: number[] };
}

/** Counts one call against the person's allowance and the project's day in one transaction; says why when either is spent. */
export async function reserveAiCall(
  firestore: Firestore,
  uid: string,
  now: number,
): Promise<HeldReason | null> {
  const dayKey = getDayKey(now);
  const usageRef = firestore.doc(usagePath(uid, dayKey));
  const budgetRef = firestore.doc(budgetPath(dayKey));
  const held = await firestore.runTransaction(async (transaction) => {
    const [usageSnap, budgetSnap] = await Promise.all([
      transaction.get(usageRef),
      transaction.get(budgetRef),
    ]);
    const spent =
      (budgetSnap.data()?.hundredthsOfCent as number | undefined) ?? 0;
    if (spent >= AI_DAILY_BUDGET_CENTS * HUNDREDTHS_PER_CENT) {
      return 'budgetReached' as const;
    }
    const usage = (usageSnap.data() as UsageDoc | undefined)?.full ?? {
      day: 0,
      recent: [],
    };
    const recent = usage.recent.filter((at) => now - at < AI_WINDOW_MS);
    if (
      usage.day >= AI_LIMITS.full.perDay ||
      recent.length >= AI_LIMITS.full.perWindow
    ) {
      return 'dailyLimit' as const;
    }
    transaction.set(usageRef, {
      full: { day: usage.day + 1, recent: [...recent, now] },
    });
    return null;
  });
  if (held === 'budgetReached') logger.warn('helm.ai.budgetReached');
  if (held === 'dailyLimit') logger.info('helm.ai.dailyLimit');
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
