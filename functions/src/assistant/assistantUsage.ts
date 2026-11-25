import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { getLocalDayKey, getUtcDayKey } from '../voice/usage.js';

/** What one person may spend on a spoken assistant in their own day, and what the site spends in a UTC day across every app. */
export interface AssistantLimits {
  turnsPerDay: number;
  searchesPerDay: number;
}

export const ASSISTANT_DAILY_BUDGET_CENTS = 500;
const HUNDREDTHS_PER_CENT = 100;

export type AssistantHeld = 'turnLimit' | 'budgetReached';

const usagePath = (appId: string, uid: string, dayKey: string) =>
  `apps/${appId}/server/${uid}/assistantUsage/${dayKey}`;
const budgetPath = (dayKey: string) => `assistantBudget/${dayKey}`;

/** Counts one turn against the person's day and says how many web lookups are left in it; the site's budget is read first, without a lock. */
export async function reserveAssistantTurn(
  firestore: Firestore,
  {
    appId,
    uid,
    now,
    timeZone,
    limits,
  }: {
    appId: string;
    uid: string;
    now: number;
    timeZone: string;
    limits: AssistantLimits;
  },
): Promise<{ held: AssistantHeld } | { held: null; searchesLeft: number }> {
  const spent =
    ((await firestore.doc(budgetPath(getUtcDayKey(now))).get()).data()
      ?.hundredthsOfCent as number | undefined) ?? 0;
  if (spent >= ASSISTANT_DAILY_BUDGET_CENTS * HUNDREDTHS_PER_CENT) {
    return { held: 'budgetReached' };
  }
  const ref = firestore.doc(
    usagePath(appId, uid, getLocalDayKey(now, timeZone)),
  );
  return firestore.runTransaction(async (transaction) => {
    const data = (await transaction.get(ref)).data() ?? {};
    const turns = typeof data.turns === 'number' ? data.turns : 0;
    const searches = typeof data.searches === 'number' ? data.searches : 0;
    if (turns >= limits.turnsPerDay) return { held: 'turnLimit' as const };
    transaction.set(ref, { turns: turns + 1 }, { merge: true });
    return {
      held: null,
      searchesLeft: Math.max(0, limits.searchesPerDay - searches),
    };
  });
}

/** Adds what a turn used: its web lookups to the person's day, its cost to the site's. */
export const recordAssistantTurn = (
  firestore: Firestore,
  {
    appId,
    uid,
    now,
    timeZone,
    searches,
    hundredthsOfCent,
  }: {
    appId: string;
    uid: string;
    now: number;
    timeZone: string;
    searches: number;
    hundredthsOfCent: number;
  },
) => {
  const batch = firestore.batch();
  if (searches > 0) {
    batch.set(
      firestore.doc(usagePath(appId, uid, getLocalDayKey(now, timeZone))),
      { searches: FieldValue.increment(searches) },
      { merge: true },
    );
  }
  batch.set(
    firestore.doc(budgetPath(getUtcDayKey(now))),
    { hundredthsOfCent: FieldValue.increment(hundredthsOfCent) },
    { merge: true },
  );
  return batch.commit();
};
