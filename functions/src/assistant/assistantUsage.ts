import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { getUtcDayKey } from '../voice/usage.js';

/** What one person may spend on a spoken assistant in a UTC day (one fixed reset, so a chosen time zone can't open a second day), and what the site spends in that day across every app. */
export interface AssistantLimits {
  turnsPerDay: number;
  searchesPerDay: number;
  /** Web lookups one turn may make, across all of its rounds. */
  searchesPerTurn: number;
}

export const ASSISTANT_DAILY_BUDGET_CENTS = 500;
const HUNDREDTHS_PER_CENT = 100;

export type AssistantHeld = 'turnLimit' | 'budgetReached';

const usagePath = (appId: string, uid: string, dayKey: string) =>
  `apps/${appId}/server/${uid}/assistantUsage/${dayKey}`;
const budgetPath = (dayKey: string) => `assistantBudget/${dayKey}`;

/**
 * Counts one turn against the person's day and sets aside the web lookups it may make, in one transaction, so turns sent
 * at once can't each spend the same allowance; `recordAssistantTurn` gives back what went unused. The site's budget is
 * read first, without a lock.
 */
export async function reserveAssistantTurn(
  firestore: Firestore,
  {
    appId,
    uid,
    now,
    limits,
  }: { appId: string; uid: string; now: number; limits: AssistantLimits },
): Promise<{ held: AssistantHeld } | { held: null; searchesReserved: number }> {
  const dayKey = getUtcDayKey(now);
  const spent =
    ((await firestore.doc(budgetPath(dayKey)).get()).data()
      ?.hundredthsOfCent as number | undefined) ?? 0;
  if (spent >= ASSISTANT_DAILY_BUDGET_CENTS * HUNDREDTHS_PER_CENT) {
    return { held: 'budgetReached' };
  }
  const ref = firestore.doc(usagePath(appId, uid, dayKey));
  return firestore.runTransaction(async (transaction) => {
    const data = (await transaction.get(ref)).data() ?? {};
    const turns = typeof data.turns === 'number' ? data.turns : 0;
    const searches = typeof data.searches === 'number' ? data.searches : 0;
    if (turns >= limits.turnsPerDay) return { held: 'turnLimit' as const };
    const searchesReserved = Math.max(
      0,
      Math.min(limits.searchesPerTurn, limits.searchesPerDay - searches),
    );
    transaction.set(
      ref,
      { turns: turns + 1, searches: searches + searchesReserved },
      { merge: true },
    );
    return { held: null, searchesReserved };
  });
}

/** Settles what a turn used: the lookups it set aside but didn't make go back to the person's day, and its cost goes to the site's. */
export const recordAssistantTurn = (
  firestore: Firestore,
  {
    appId,
    uid,
    now,
    searchesReserved,
    searches,
    hundredthsOfCent,
  }: {
    appId: string;
    uid: string;
    now: number;
    searchesReserved: number;
    searches: number;
    hundredthsOfCent: number;
  },
) => {
  const dayKey = getUtcDayKey(now);
  const batch = firestore.batch();
  if (searches !== searchesReserved) {
    batch.set(
      firestore.doc(usagePath(appId, uid, dayKey)),
      { searches: FieldValue.increment(searches - searchesReserved) },
      { merge: true },
    );
  }
  if (hundredthsOfCent > 0) {
    batch.set(
      firestore.doc(budgetPath(dayKey)),
      { hundredthsOfCent: FieldValue.increment(hundredthsOfCent) },
      { merge: true },
    );
  }
  return batch.commit();
};
