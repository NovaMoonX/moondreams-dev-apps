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

import { DAY_MS, HABIT_DAYS_BEHIND } from '@apps/helm/constants';
import type {
  HabitDay,
  HabitDayEntry,
  HabitDaySealed,
  OpenHabitDay,
  Sealed,
} from '@apps/helm/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('Your habit days did not open.');

const readEntries = (value: HabitDay['entries'] | undefined) =>
  Object.fromEntries(
    Object.entries(value ?? {}).map(
      ([habitId, entry]): [string, HabitDayEntry] => [
        habitId,
        {
          checks: entry.checks ?? {},
          count: entry.count ?? 0,
          lastCountAt: entry.lastCountAt ?? null,
          reminded: entry.reminded ?? {},
          followUpAt: entry.followUpAt ?? null,
          followUpState: entry.followUpState ?? null,
          noteKeys: entry.noteKeys ?? [],
        },
      ],
    ),
  );

/** A day whose notes won't open keeps its ticks and tallies, with no notes, so the day still counts. */
async function openHabitDay(
  entry: QueryDocumentSnapshot,
  read: SealedReader,
): Promise<OpenHabitDay> {
  const data = entry.data() as Partial<HabitDay> & { sealed?: Sealed | null };
  const entries = readEntries(data.entries);
  const base = {
    id: entry.id,
    date: data.date ?? Date.parse(`${entry.id}T00:00:00Z`),
    isInUse:
      data.isInUse ??
      Object.values(entries).some(
        (habit) => Object.keys(habit.checks).length > 0 || habit.count > 0,
      ),
    entries,
  };
  if (!data.sealed) return { ...base, notes: {}, isUnreadable: false };
  try {
    const payload = await read<Partial<HabitDaySealed>>(data.sealed);
    return { ...base, notes: payload.notes ?? {}, isUnreadable: false };
  } catch {
    return { ...base, notes: {}, isUnreadable: true };
  }
}

/** The habit days from two weeks back to tomorrow, enough for Today and this week. */
export const getHabitDaysWindow = (now: number) => {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return {
    fromDate: today - HABIT_DAYS_BEHIND * DAY_MS,
    toDate: today + 2 * DAY_MS,
  };
};

/** The habit days whose date falls from `fromDate` to `toDate` (date-only, UTC midnight). A slower open never overwrites a newer snapshot or lands after the listener stopped. */
export function startHabitDaysListener(
  uid: string,
  read: SealedReader,
  window: { fromDate: number; toDate: number },
  onChange: (days: OpenHabitDay[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    query(
      collection(db, 'apps', 'helm', 'users', uid, 'habitDays'),
      where('date', '>=', window.fromDate),
      where('date', '<=', window.toDate),
    ),
    async (snapshot) => {
      if (snapshot.empty && snapshot.metadata.fromCache) return;
      sequence.latest += 1;
      const current = sequence.latest;
      const opened = await Promise.all(
        snapshot.docs.map((entry) => openHabitDay(entry, read)),
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
