import { store } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import {
  matchCheckIn,
  resolveCheckIn,
  type CheckInHabit,
} from '@apps/helm/engine/checkInMatch';
import { isHabitDue, readHabitClock } from '@apps/helm/engine/habitDay';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { writeDeviceCheckIn } from '@apps/helm/store/actions/habitCheckInActions';
import { readHabitsOn } from '@apps/helm/utils/habitToday';
import { fromAwayKey, toAwayKey } from '@apps/helm/utils/planDays';

export type DeviceCheckIn =
  | { kind: 'none' }
  | { kind: 'said'; line: string }
  | {
      kind: 'done';
      line: string;
      isPrivate: boolean;
      /** Settles when the server has it, never offline; the tick shows at once from the local copy. */
      committed: Promise<void>;
      undo: () => Promise<void>;
    };

/** Reads a typed or said line as a check-in on a habit due today and writes it, with no model: `none` unless the words are only a verb, a habit's name or time of day and fillers, so anything more, two habits that fit, or a habit that is paused, stopped or not due today goes on as a normal turn. Reads the store at call time; the write is not awaited, so the tick works offline. */
export async function takeDeviceCheckIn(
  uid: string,
  text: string,
  now = Date.now(),
): Promise<DeviceCheckIn> {
  const { helm } = store.getState();
  if (helm.uid !== uid || !helm.habits.isLoaded) return { kind: 'none' };
  const { dayKey, timeZone } = readHabitClock(
    now,
    {
      timeZone: helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
      zoneSpans: helm.profile?.zoneSpans ?? [],
    },
    fromAwayKey(toAwayKey(helm.who.items)),
  );
  const due: CheckInHabit[] = readHabitsOn(helm.habits.items, dayKey).filter(
    (habit) => !habit.isUnreadable && isHabitDue(habit, dayKey),
  );
  if (due.length === 0) return { kind: 'none' };
  const whoNames = Object.fromEntries(
    due.flatMap((habit) => {
      const who = helm.who.items.find((entry) => entry.id === habit.forWhoId);
      return who && !who.isUnreadable
        ? [[who.id, [who.name, ...who.aliases]] as const]
        : [];
    }),
  );
  const match = matchCheckIn(text, due, whoNames);
  if (match.kind !== 'match') return { kind: 'none' };
  const habit = due.find((entry) => entry.id === match.habitId);
  if (!habit) return { kind: 'none' };
  const entry = helm.habitDays.byId[dayKey]?.entries[habit.id];
  const resolution = resolveCheckIn(
    habit,
    match.windowId,
    now,
    timeZone,
    entry ? { checks: entry.checks, count: entry.count } : null,
  );
  if (resolution.kind === 'alreadyDone') {
    return { kind: 'said', line: resolution.line };
  }
  if (resolution.kind !== 'write') return { kind: 'none' };
  const isPrivate =
    helm.habits.items.find((item) => item.id === habit.id)?.privacy ===
    'private';
  const encryption = await getHelmEncryption(uid).catch(() => null);
  const written = await writeDeviceCheckIn(uid, resolution.effect, {
    summary: resolution.line,
    spoken: resolution.line,
    encryption,
    isPrivate,
    habitName: habit.name,
    isNewDay: !helm.habitDays.byId[dayKey],
  });
  return {
    kind: 'done',
    line: resolution.line,
    isPrivate,
    committed: written.committed,
    undo: written.undo,
  };
}
