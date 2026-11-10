import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  listenCostMicros,
  VOICE_DAILY_BUDGET_CENTS,
  VOICE_UTTERANCE_MS,
  type VoiceAppLimits,
} from './voiceConfig.js';

export interface ListenUsage {
  listenMs: number;
  mints: number;
  openMints: Record<string, number>;
}

export type ListenHeld = 'listenLimit' | 'mintLimit' | 'budgetReached';

export interface ClosedListen {
  mintId: string;
  ms: number;
}

const toDayKey = (now: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

export const getUtcDayKey = (now: number) => toDayKey(now, 'UTC');

export function getLocalDayKey(now: number, timeZone: string) {
  try {
    return toDayKey(now, timeZone || 'UTC');
  } catch {
    return getUtcDayKey(now);
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function planListen({
  usage,
  budgetMicros,
  limits,
  now,
  closed,
  mintId,
  worstCaseMicros,
}: {
  usage: ListenUsage;
  budgetMicros: number;
  limits: VoiceAppLimits;
  now: number;
  closed: ClosedListen[];
  mintId: string;
  worstCaseMicros: number;
}): { usage: ListenUsage; budgetDeltaMicros: number; held: ListenHeld | null } {
  const settled = closed.reduce<ListenUsage>(
    (acc, report) =>
      Object.hasOwn(acc.openMints, report.mintId)
        ? {
            ...acc,
            listenMs: acc.listenMs + clamp(report.ms, 0, VOICE_UTTERANCE_MS),
            openMints: Object.fromEntries(
              Object.entries(acc.openMints).filter(
                ([id]) => id !== report.mintId,
              ),
            ),
          }
        : acc,
    usage,
  );

  const getHeld = (): ListenHeld | null => {
    if (budgetMicros + worstCaseMicros > VOICE_DAILY_BUDGET_CENTS * 10_000) {
      return 'budgetReached';
    }
    if (settled.listenMs >= limits.listenMsPerDay) return 'listenLimit';
    if (settled.mints >= limits.mintsPerDay) return 'mintLimit';
    return null;
  };
  const held = getHeld();
  if (held !== null) return { usage: settled, budgetDeltaMicros: 0, held };

  return {
    usage: {
      ...settled,
      mints: settled.mints + 1,
      openMints: { ...settled.openMints, [mintId]: now },
    },
    budgetDeltaMicros: worstCaseMicros,
    held: null,
  };
}

const usagePath = (uid: string, dayKey: string) =>
  `voiceUsage/${uid}/days/${dayKey}`;
const budgetPath = (dayKey: string) => `voiceBudget/${dayKey}`;

const readUsage = (data: FirebaseFirestore.DocumentData | undefined) => ({
  listenMs: typeof data?.listenMs === 'number' ? data.listenMs : 0,
  mints: typeof data?.mints === 'number' ? data.mints : 0,
  openMints: (data?.openMints ?? {}) as Record<string, number>,
});

/** Counts one listening turn against the person's day and the site's day in one transaction; returns why it was held, or null. */
export async function reserveListen(
  firestore: Firestore,
  {
    uid,
    limits,
    now,
    timeZone,
    closed,
    mintId,
  }: {
    uid: string;
    limits: VoiceAppLimits;
    now: number;
    timeZone: string;
    closed: ClosedListen[];
    mintId: string;
  },
): Promise<ListenHeld | null> {
  const usageRef = firestore.doc(usagePath(uid, getLocalDayKey(now, timeZone)));
  const budgetRef = firestore.doc(budgetPath(getUtcDayKey(now)));

  const plan = await firestore.runTransaction(async (transaction) => {
    const [usageSnapshot, budgetSnapshot] = await Promise.all([
      transaction.get(usageRef),
      transaction.get(budgetRef),
    ]);
    const budgetCost = budgetSnapshot.data()?.costMicros;
    const result = planListen({
      usage: readUsage(usageSnapshot.data()),
      budgetMicros: typeof budgetCost === 'number' ? budgetCost : 0,
      limits,
      now,
      closed,
      mintId,
      worstCaseMicros: listenCostMicros(VOICE_UTTERANCE_MS),
    });
    transaction.set(usageRef, result.usage, { merge: true });
    if (result.held === null) {
      transaction.set(
        budgetRef,
        { costMicros: FieldValue.increment(result.budgetDeltaMicros) },
        { merge: true },
      );
    }
    return result;
  });

  if (plan.held === 'budgetReached')
    logger.warn('voice.budgetReached', { event: 'voice.budgetReached' });
  else if (plan.held !== null)
    logger.info(`voice.${plan.held}`, { event: `voice.${plan.held}` });
  return plan.held;
}

/** Best effort: undoes one reservation after a failed grant. */
export async function releaseListen(
  firestore: Firestore,
  {
    uid,
    now,
    timeZone,
    mintId,
  }: { uid: string; now: number; timeZone: string; mintId: string },
) {
  const usageRef = firestore.doc(usagePath(uid, getLocalDayKey(now, timeZone)));
  const budgetRef = firestore.doc(budgetPath(getUtcDayKey(now)));
  try {
    await firestore.runTransaction(async (transaction) => {
      const usage = readUsage((await transaction.get(usageRef)).data());
      if (!Object.hasOwn(usage.openMints, mintId)) return;
      transaction.set(
        usageRef,
        {
          mints: Math.max(0, usage.mints - 1),
          openMints: Object.fromEntries(
            Object.entries(usage.openMints).filter(([id]) => id !== mintId),
          ),
        },
        { merge: true },
      );
      transaction.set(
        budgetRef,
        {
          costMicros: FieldValue.increment(
            -listenCostMicros(VOICE_UTTERANCE_MS),
          ),
        },
        { merge: true },
      );
    });
  } catch {
    logger.error('voice.releaseFailed', { event: 'voice.releaseFailed' });
  }
}
