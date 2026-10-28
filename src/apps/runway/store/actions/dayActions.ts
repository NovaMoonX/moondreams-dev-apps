import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { toDayKey } from '@apps/runway/engine/dates';
import { openJson, sealJson } from '@apps/runway/security';
import type {
  DayOverrideSealed,
  IncomeDayDoc,
  RunwayEncryption,
} from '@apps/runway/types';

export const EMPTY_OVERRIDE: DayOverrideSealed = {
  pairings: null,
  holdResolutions: {},
};

export interface DayRef {
  payLineId: string;
  sourceId: string | null;
  expectedOn: number;
}

/**
 * Changes what the person set for one income day. The day's document is created the first time it is
 * overridden (its id is the day key) and updated while it is a draft; the override is read inside
 * the transaction so two devices never write over each other's choice.
 */
export async function saveDayOverride(
  uid: string,
  encryption: RunwayEncryption,
  day: DayRef,
  change: (current: DayOverrideSealed) => DayOverrideSealed,
): Promise<void> {
  const dayKey = toDayKey(day.payLineId, day.expectedOn);
  const ref = doc(db, 'apps', 'runway', 'plans', uid, 'days', dayKey);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.exists()
      ? (snapshot.data() as Partial<IncomeDayDoc>)
      : null;
    if (existing && existing.status !== 'draft') {
      throw new Error(
        'This day is already settled, so its plan cannot change.',
      );
    }
    const opened = existing?.sealed
      ? await openJson<Partial<DayOverrideSealed>>(existing.sealed, encryption)
      : null;
    const current: DayOverrideSealed = {
      pairings: opened?.pairings ?? null,
      holdResolutions: opened?.holdResolutions ?? {},
    };
    const sealed = await sealJson(change(current), encryption);
    if (existing) {
      transaction.update(ref, { sealed });
      return;
    }
    const created: IncomeDayDoc = {
      id: dayKey,
      payLineId: day.payLineId,
      sourceId: day.sourceId,
      expectedOn: day.expectedOn,
      arrivedOn: null,
      status: 'draft',
      createdAt: Date.now(),
      confirmedAt: null,
      doneLineIds: [],
      sealed,
    };
    transaction.set(ref, created);
  });
}
