import { store } from '@/store';
import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import {
  checkInSubject,
  matchCheckIn,
  resolveCheckIn,
  type CareNames,
  type CheckInHabit,
} from '@apps/helm/engine/checkInMatch';
import { isHabitDue, readHabitClock } from '@apps/helm/engine/habitDay';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { writeDeviceCheckIn } from '@apps/helm/store/actions/habitCheckInActions';
import type { Capture, HabitCheck } from '@apps/helm/types';
import { isUnattendedTurn } from '@apps/helm/utils/privacy';
import { readHabitsOn } from '@apps/helm/utils/habitToday';
import { fromAwayKey, toAwayKey } from '@apps/helm/utils/planDays';

export type DeviceCheckIn =
  | { kind: 'none' }
  | { kind: 'said'; line: string; quietLine: string | null }
  | {
      kind: 'done';
      /** What the thread and Activity keep: the name, said in full. */
      line: string;
      /** The line to say and write while nobody is looking (the habit's masked label); null when the turn is attended or the habit is not private. */
      quietLine: string | null;
      isPrivate: boolean;
      /** Settles when the server has it, never offline; the tick shows at once from the local copy. */
      committed: Promise<void>;
      undo: () => Promise<void>;
      /** The thread turn and its execution the check-in was recorded as; null when the key was not at hand, so only the tick was written. */
      recorded: { captureId: string; executionId: string } | null;
    };

/** The turn the words become in the thread, so the tick shows there as a card with Undo. */
export interface CheckInTurn {
  sessionId: string;
  turnIndex: number;
  inputMode: 'typed' | 'voice';
  sttProvider: string | null;
  interruptedCaptureId: string | null;
  presence: Capture['presence'];
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** When a habit that is already ticked was done, in the person's local time, naming each window that is; null when none was ticked as done. */
function readDoneLine(
  habit: CheckInHabit,
  windowId: string | null,
  checks: Record<string, HabitCheck>,
  care: CareNames | null,
) {
  const ids =
    windowId !== null && checks[windowId] ? [windowId] : Object.keys(checks);
  const parts = ids.flatMap((id) => {
    const check = checks[id];
    return check?.status === 'done'
      ? [
          {
            id,
            label: habit.windows[id]?.label ?? null,
            time: formatTime(check.at),
          },
        ]
      : [];
  });
  const [only] = parts;
  if (!only) return null;
  if (parts.length === 1) {
    return HELM_COPY.habitAlreadyDoneAt(
      capitalize(checkInSubject(habit, only.id, care)),
      only.time,
    );
  }
  return HELM_COPY.habitAlreadyDoneParts(
    checkInSubject(habit, null, care),
    parts.map((part) =>
      part.label
        ? HELM_COPY.habitAlreadyDonePart(part.label.toLowerCase(), part.time)
        : part.time,
    ),
  );
}

/** Reads a typed or said line as a check-in on a habit due today and writes it, with no model: `none` unless the words are only a verb, a habit's name or time of day and fillers, so anything more, two habits that fit, or a habit that is paused, stopped or not due today goes on as a normal turn. Reads the store at call time; the write is not awaited, so the tick works offline. */
export async function takeDeviceCheckIn(
  uid: string,
  text: string,
  turn: CheckInTurn,
  now = Date.now(),
): Promise<DeviceCheckIn> {
  const { helm } = store.getState();
  if (helm.uid !== uid || !helm.habits.isLoaded || !helm.habitDays.isLoaded) {
    return { kind: 'none' };
  }
  const { dayKey, timeZone } = readHabitClock(
    now,
    {
      timeZone: helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
      zoneSpans: helm.profile?.zoneSpans ?? [],
    },
    fromAwayKey(toAwayKey(helm.who.items)),
  );
  const due = readHabitsOn(helm.habits.items, dayKey).filter(
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
  const day = entry ? { checks: entry.checks, count: entry.count } : null;
  const record = helm.habits.items.find((item) => item.id === habit.id);
  const isPrivate = record?.privacy === 'private' || record?.isCare === true;
  const who = helm.who.items.find((item) => item.id === habit.forWhoId);
  const care: CareNames = {
    whoName: who && !who.isUnreadable ? who.name : null,
    medicine: habit.medicine?.name ?? null,
  };
  const isQuiet =
    isPrivate &&
    isUnattendedTurn(turn.presence?.startedByWake ?? false, turn.presence);
  const quietHabit = { ...habit, name: HELM_COPY.habitMaskedName };
  const resolution = resolveCheckIn(
    habit,
    match.windowId,
    now,
    timeZone,
    day,
    care,
  );
  if (resolution.kind === 'alreadyDone') {
    const checks = entry?.checks ?? {};
    return {
      kind: 'said',
      line:
        readDoneLine(habit, match.windowId, checks, care) ?? resolution.line,
      quietLine: isQuiet
        ? (readDoneLine(quietHabit, match.windowId, checks, null) ??
          resolveCheckIn(quietHabit, match.windowId, now, timeZone, day).line)
        : null,
    };
  }
  if (resolution.kind !== 'write') return { kind: 'none' };
  const quietLine = isQuiet
    ? resolveCheckIn(quietHabit, match.windowId, now, timeZone, day).line
    : null;
  const encryption = await getHelmEncryption(uid).catch(() => null);
  const written = await writeDeviceCheckIn(uid, resolution.effect, {
    summary: resolution.line,
    spoken: quietLine ?? resolution.line,
    said: quietLine,
    encryption,
    isPrivate,
    habitName: habit.name,
    isNewDay: !helm.habitDays.byId[dayKey],
    turn: { ...turn, text: text.trim(), createdAt: now },
  });
  return {
    kind: 'done',
    line: resolution.line,
    quietLine,
    isPrivate,
    committed: written.committed,
    undo: written.undo,
    recorded: written.recorded,
  };
}
