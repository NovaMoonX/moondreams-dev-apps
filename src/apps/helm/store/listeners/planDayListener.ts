import {
  collection,
  onSnapshot,
  query,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { SealedReader } from '@lib/security';

import type { PlanDay, PlanDaySealed, Sealed } from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your plan did not open.');

/** A day whose words won't open keeps its slots, with no reasons or events, so the day still shows what was kept. */
async function openPlanDay(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<PlanDay> {
  const data = entry.data() as Partial<PlanDay> & { sealed?: Sealed };
  const base = {
    id: entry.id,
    date: data.date ?? 0,
    slots: data.slots ?? {},
    isRestDay: data.isRestDay ?? false,
    restDayOverriddenAt: data.restDayOverriddenAt ?? null,
    generatedAt: data.generatedAt ?? null,
    calendarReadAt: data.calendarReadAt ?? null,
  };
  if (!data.sealed) {
    return { ...base, reasons: {}, calendarSnapshot: [], isUnreadable: false };
  }
  try {
    const payload = await read<Partial<PlanDaySealed>>(data.sealed);
    return {
      ...base,
      reasons: payload.reasons ?? {},
      calendarSnapshot: payload.calendarSnapshot ?? [],
      isUnreadable: false,
    };
  } catch {
    return { ...base, reasons: {}, calendarSnapshot: [], isUnreadable: true };
  }
}

/** The plan days whose date falls from `fromDate` to `toDate` (date-only, UTC midnight). A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startPlanDaysListener(
  uid: string,
  read: SealedReader,
  window: { fromDate: number; toDate: number },
  onChange: (days: PlanDay[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'planDays'),
      where('date', '>=', window.fromDate),
      where('date', '<=', window.toDate),
    ),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openPlanDay(entry, read)),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(opened);
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}
