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
  /** Recordings written out, in milliseconds; they share the day's listening allowance. */
  transcribeMs: number | null;
  mints: number;
  openMints: Record<string, number>;
}

export type SpeechHeld = 'speechLimit' | 'budgetReached';

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

const REPORT_GRACE_MS = 60_000;

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
  const reported = closed.reduce<ListenUsage>(
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
  // A stream that never reported (a closed tab, a lost request) counts as a full one once its report is overdue.
  const overdue = Object.entries(reported.openMints).filter(
    ([, openedAt]) => now - openedAt > VOICE_UTTERANCE_MS + REPORT_GRACE_MS,
  );
  const settled: ListenUsage = {
    ...reported,
    listenMs: reported.listenMs + overdue.length * VOICE_UTTERANCE_MS,
    openMints: Object.fromEntries(
      Object.entries(reported.openMints).filter(
        ([id]) => !overdue.some(([overdueId]) => overdueId === id),
      ),
    ),
  };

  const getHeld = (): ListenHeld | null => {
    if (budgetMicros + worstCaseMicros > VOICE_DAILY_BUDGET_CENTS * 10_000) {
      return 'budgetReached';
    }
    if (
      settled.listenMs + (settled.transcribeMs ?? 0) >=
      limits.listenMsPerDay
    ) {
      return 'listenLimit';
    }
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
  transcribeMs: typeof data?.transcribeMs === 'number' ? data.transcribeMs : 0,
  mints: typeof data?.mints === 'number' ? data.mints : 0,
  openMints: (data?.openMints ?? {}) as Record<string, number>,
});

/** Counts one listening turn against the person's day and the site's day in one transaction; returns why it was held, or the amount counted. */
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
    transaction.set(usageRef, { ...usageSnapshot.data(), ...result.usage });
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
      const stored = (await transaction.get(usageRef)).data();
      const usage = readUsage(stored);
      if (!Object.hasOwn(usage.openMints, mintId)) return;
      transaction.set(usageRef, {
        ...stored,
        ...usage,
        mints: Math.max(0, usage.mints - 1),
        openMints: Object.fromEntries(
          Object.entries(usage.openMints).filter(([id]) => id !== mintId),
        ),
      });
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

export function planSpeech({
  usage,
  budgetMicros,
  limits,
  characters,
  costMicros,
}: {
  usage: { spokenChars?: number };
  budgetMicros: number;
  limits: VoiceAppLimits;
  characters: number;
  costMicros: number;
}): {
  spokenChars: number;
  budgetDeltaMicros: number;
  held: SpeechHeld | null;
} {
  const spoken = usage.spokenChars ?? 0;
  const getHeld = (): SpeechHeld | null => {
    if (budgetMicros + costMicros > VOICE_DAILY_BUDGET_CENTS * 10_000) {
      return 'budgetReached';
    }
    if (spoken + characters > limits.spokenCharsPerDay) return 'speechLimit';
    return null;
  };
  const held = getHeld();
  return held === null
    ? {
        spokenChars: spoken + characters,
        budgetDeltaMicros: costMicros,
        held,
      }
    : { spokenChars: spoken, budgetDeltaMicros: 0, held };
}

/** Counts one spoken line against the person's day and the site's day in one transaction; returns why it was held, or the amount counted. */
export async function reserveSpeech(
  firestore: Firestore,
  {
    uid,
    limits,
    now,
    timeZone,
    characters,
    costMicros,
  }: {
    uid: string;
    limits: VoiceAppLimits;
    now: number;
    timeZone: string;
    characters: number;
    costMicros: number;
  },
): Promise<SpeechHeld | null> {
  const usageRef = firestore.doc(usagePath(uid, getLocalDayKey(now, timeZone)));
  const budgetRef = firestore.doc(budgetPath(getUtcDayKey(now)));

  const plan = await firestore.runTransaction(async (transaction) => {
    const [usageSnapshot, budgetSnapshot] = await Promise.all([
      transaction.get(usageRef),
      transaction.get(budgetRef),
    ]);
    const spokenChars = usageSnapshot.data()?.spokenChars;
    const budgetCost = budgetSnapshot.data()?.costMicros;
    const result = planSpeech({
      usage: { spokenChars: typeof spokenChars === 'number' ? spokenChars : 0 },
      budgetMicros: typeof budgetCost === 'number' ? budgetCost : 0,
      limits,
      characters,
      costMicros,
    });
    transaction.set(
      usageRef,
      { spokenChars: result.spokenChars },
      { merge: true },
    );
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

/** Best effort: undoes one spoken-line reservation after the provider failed before any byte was sent. */
export async function releaseSpeech(
  firestore: Firestore,
  {
    uid,
    now,
    timeZone,
    characters,
    costMicros,
  }: {
    uid: string;
    now: number;
    timeZone: string;
    characters: number;
    costMicros: number;
  },
) {
  const usageRef = firestore.doc(usagePath(uid, getLocalDayKey(now, timeZone)));
  const budgetRef = firestore.doc(budgetPath(getUtcDayKey(now)));
  try {
    await firestore.runTransaction(async (transaction) => {
      const spokenChars = (await transaction.get(usageRef)).data()?.spokenChars;
      transaction.set(
        usageRef,
        {
          spokenChars: Math.max(
            0,
            (typeof spokenChars === 'number' ? spokenChars : 0) - characters,
          ),
        },
        { merge: true },
      );
      transaction.set(
        budgetRef,
        { costMicros: FieldValue.increment(-costMicros) },
        { merge: true },
      );
    });
  } catch {
    logger.error('voice.speechReleaseFailed', {
      event: 'voice.speechReleaseFailed',
    });
  }
}

export type TranscribeHeld = 'listenLimit' | 'budgetReached';

export type TranscribeReserve = { ms: number; micros: number };

/** Whether a recording fits the person's day (listening and recordings share it) and the site's day; when it does, the worst case is counted at once, or the claimed length when only that fits. */
export function planTranscribe({
  usage,
  budgetMicros,
  limits,
  worst,
  claimed,
}: {
  usage: { listenMs: number; transcribeMs: number };
  budgetMicros: number;
  limits: VoiceAppLimits;
  worst: TranscribeReserve;
  claimed: TranscribeReserve;
}): {
  transcribeMs: number;
  budgetDeltaMicros: number;
  reserved: TranscribeReserve;
  held: TranscribeHeld | null;
} {
  const getHeld = (reserve: TranscribeReserve): TranscribeHeld | null => {
    if (budgetMicros + reserve.micros > VOICE_DAILY_BUDGET_CENTS * 10_000) {
      return 'budgetReached';
    }
    return usage.listenMs + usage.transcribeMs + reserve.ms >
      limits.listenMsPerDay
      ? 'listenLimit'
      : null;
  };
  const worstHeld = getHeld(worst);
  const reserved = worstHeld === null ? worst : claimed;
  const held = worstHeld === null ? null : getHeld(claimed);
  return held === null
    ? {
        transcribeMs: usage.transcribeMs + reserved.ms,
        budgetDeltaMicros: reserved.micros,
        reserved,
        held,
      }
    : {
        transcribeMs: usage.transcribeMs,
        budgetDeltaMicros: 0,
        reserved,
        held,
      };
}

/** Replaces a recording's reserved worst case with what the provider measured, so a longer one than claimed is charged in full. */
export const planTranscribeSettle = ({
  usage,
  reservedMs,
  reservedMicros,
  actualMs,
  actualMicros,
}: {
  usage: { transcribeMs: number };
  reservedMs: number;
  reservedMicros: number;
  actualMs: number;
  actualMicros: number;
}) => ({
  transcribeMs: Math.max(0, usage.transcribeMs - reservedMs + actualMs),
  budgetDeltaMicros: actualMicros - reservedMicros,
});

/** Counts one recording's reserve against the person's day and the site's day in one transaction; returns why it was held, or the amount counted. */
export async function reserveTranscribe(
  firestore: Firestore,
  {
    uid,
    limits,
    now,
    timeZone,
    worst,
    claimed,
  }: {
    uid: string;
    limits: VoiceAppLimits;
    now: number;
    timeZone: string;
    worst: TranscribeReserve;
    claimed: TranscribeReserve;
  },
): Promise<
  { held: TranscribeHeld } | { held: null; reserved: TranscribeReserve }
> {
  const usageRef = firestore.doc(usagePath(uid, getLocalDayKey(now, timeZone)));
  const budgetRef = firestore.doc(budgetPath(getUtcDayKey(now)));
  const plan = await firestore.runTransaction(async (transaction) => {
    const [usageSnapshot, budgetSnapshot] = await Promise.all([
      transaction.get(usageRef),
      transaction.get(budgetRef),
    ]);
    const budgetCost = budgetSnapshot.data()?.costMicros;
    const result = planTranscribe({
      usage: readUsage(usageSnapshot.data()),
      budgetMicros: typeof budgetCost === 'number' ? budgetCost : 0,
      limits,
      worst,
      claimed,
    });
    if (result.held === null) {
      transaction.set(
        usageRef,
        { transcribeMs: result.transcribeMs },
        { merge: true },
      );
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
  return plan.held === null
    ? { held: null, reserved: plan.reserved }
    : { held: plan.held };
}

/** Best effort: swaps a recording's reservation for its measured length and cost; a failure leaves the worst case counted. */
export async function settleTranscribe(
  firestore: Firestore,
  {
    uid,
    now,
    timeZone,
    reservedMs,
    reservedMicros,
    actualMs,
    actualMicros,
  }: {
    uid: string;
    now: number;
    timeZone: string;
    reservedMs: number;
    reservedMicros: number;
    actualMs: number;
    actualMicros: number;
  },
) {
  const usageRef = firestore.doc(usagePath(uid, getLocalDayKey(now, timeZone)));
  const budgetRef = firestore.doc(budgetPath(getUtcDayKey(now)));
  try {
    await firestore.runTransaction(async (transaction) => {
      const usage = readUsage((await transaction.get(usageRef)).data());
      const settled = planTranscribeSettle({
        usage,
        reservedMs,
        reservedMicros,
        actualMs,
        actualMicros,
      });
      transaction.set(
        usageRef,
        { transcribeMs: settled.transcribeMs },
        { merge: true },
      );
      transaction.set(
        budgetRef,
        { costMicros: FieldValue.increment(settled.budgetDeltaMicros) },
        { merge: true },
      );
    });
  } catch {
    logger.error('voice.transcribeSettleFailed', {
      event: 'voice.transcribeSettleFailed',
    });
  }
}
