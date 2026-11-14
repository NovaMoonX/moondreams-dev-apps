import { createOptionMatcher, toComparable } from '@/utils/optionMatchUtils';
import {
  habitDayKey,
  readWindowSpans,
  type HabitScheduleLike,
} from '@apps/helm/engine/habitDay';

export const CHECKIN_VERBS = [
  'took',
  'take',
  'gave',
  'done',
  'did',
  'had',
  'finished',
  'drank',
] as const;

const FILLER_WORDS: ReadonlySet<string> = new Set([
  'my',
  'the',
  'her',
  'his',
  'their',
  'i',
  'ive',
  's',
  'a',
  'an',
  'of',
  'this',
  'just',
  'already',
  'glass',
  'glasses',
  'cup',
  'cups',
]);

const MAX_RESIDUAL_WORDS = 8;
const EARLY_MS = 2 * 60 * 60 * 1000;

export interface CheckInHabit extends HabitScheduleLike {
  id: string;
  name: string;
  windows: Record<string, { label: string }>;
  forWhoId: string | null;
}

export type CheckInMatch =
  | { kind: 'match'; habitId: string; windowId: string | null }
  | { kind: 'ambiguous'; habitIds: string[] }
  | { kind: 'none' };

interface Role {
  kind: 'name' | 'window' | 'who';
  windowId: string | null;
  text: string;
}

const matcher = createOptionMatcher<Role>({
  names: (role) => [role.text],
  foldPlurals: true,
});

const isVerb = (word: string) =>
  (CHECKIN_VERBS as readonly string[]).includes(word);

const splits = (words: string[]): string[][] =>
  words.length === 0
    ? [[]]
    : words.flatMap((_, at) =>
        splits(words.slice(at + 1)).map((rest) => [
          words.slice(0, at + 1).join(' '),
          ...rest,
        ]),
      );

const rolesOf = (
  habit: CheckInHabit,
  whoNames: Record<string, readonly string[]>,
): Role[] => [
  { kind: 'name', windowId: null, text: habit.name },
  ...Object.entries(habit.windows).map(([windowId, window]): Role => ({
    kind: 'window',
    windowId,
    text: window.label,
  })),
  ...(habit.forWhoId
    ? (whoNames[habit.forWhoId] ?? []).map((text): Role => ({
        kind: 'who',
        windowId: null,
        text,
      }))
    : []),
];

const readHabitMatch = (
  habit: CheckInHabit,
  segmentations: string[][],
  whoNames: Record<string, readonly string[]>,
) => {
  const roles = rolesOf(habit, whoNames);
  return segmentations.flatMap((segments) => {
    const found = segments.map((segment) =>
      roles.filter((role) => matcher.match(segment, [role]) !== null),
    );
    if (found.some((fits) => fits.length === 0)) return [];
    const kinds = found.map((fits) => fits[0].kind);
    const windows = found.flatMap((fits) =>
      fits[0].kind === 'window' ? [fits[0].windowId] : [],
    );
    const hasWho = kinds.includes('who');
    const isValid =
      kinds.filter((kind) => kind === 'name').length <= 1 &&
      windows.length <= 1 &&
      (kinds.includes('name') || windows.length === 1) &&
      hasWho === (habit.forWhoId !== null);
    return isValid ? [{ windowId: windows[0] ?? null }] : [];
  })[0];
};

/** Reads a typed or said line against today's habits; confident only when nothing but a verb, filler, a habit's name or a window label (and a carer's who) is said, so anything more goes to the model. */
export function matchCheckIn(
  text: string,
  todaysHabits: readonly CheckInHabit[],
  whoNames: Record<string, readonly string[]>,
): CheckInMatch {
  const words = toComparable(text).split(' ').filter(Boolean);
  if (!words.some(isVerb)) return { kind: 'none' };
  const residual = words.filter(
    (word) => !isVerb(word) && !FILLER_WORDS.has(word),
  );
  if (residual.length === 0 || residual.length > MAX_RESIDUAL_WORDS)
    return { kind: 'none' };
  const segmentations = splits(residual);
  const matches = todaysHabits.flatMap((habit) => {
    const found = readHabitMatch(habit, segmentations, whoNames);
    return found ? [{ habitId: habit.id, windowId: found.windowId }] : [];
  });
  if (matches.length === 0) return { kind: 'none' };
  if (matches.length > 1)
    return { kind: 'ambiguous', habitIds: matches.map((m) => m.habitId) };
  return { kind: 'match', ...matches[0] };
}

export interface CheckInDay {
  checks: Record<string, unknown>;
  count: number;
}

export type CheckInEffect =
  | {
      kind: 'tick';
      habitId: string;
      dayKey: string;
      windowId: string;
      at: number;
    }
  | {
      kind: 'tally';
      habitId: string;
      dayKey: string;
      count: number;
      at: number;
    };

export type CheckInResolution =
  | { kind: 'write'; effect: CheckInEffect; line: string }
  | { kind: 'alreadyDone'; line: string }
  | { kind: 'notActive'; status: string; line: string };

const lowerName = (name: string) => name.trim().toLowerCase();

const toSubject = (habit: CheckInHabit, windowId: string) => {
  const label = habit.windows[windowId]?.label;
  return label ? `${label} ${lowerName(habit.name)}` : habit.name;
};

const readNotActiveLine = (habit: CheckInHabit) => {
  if (habit.status === 'retired')
    return `Your ${lowerName(habit.name)} is retired. Bring it back?`;
  if (habit.status === 'ended')
    return `Your ${lowerName(habit.name)} has ended.`;
  return `Your ${lowerName(habit.name)} is paused.`;
};

const pickWindow = (
  habit: CheckInHabit,
  at: number,
  timeZone: string,
  dayKey: string,
  ticked: (id: string) => boolean,
) => {
  const spans = readWindowSpans(habit, dayKey, timeZone).filter(
    (span) => !ticked(span.id),
  );
  if (spans.length === 0) return null;
  const open = spans.find((span) => span.startAt <= at && at < span.endAt);
  if (open) return open.id;
  const earlier = spans
    .filter((span) => span.endAt <= at)
    .sort((first, second) => second.endAt - first.endAt)[0];
  if (earlier) return earlier.id;
  const soon = spans.find(
    (span) => span.startAt > at && span.startAt - at <= EARLY_MS,
  );
  return soon?.id ?? 'day';
};

/** Decides which window a check-in lands in (the open one, else the nearest unticked earlier one today, else a window about to open, else the day), the write it makes and the line that says so; nothing is written for a habit that is not active. */
export function resolveCheckIn(
  habit: CheckInHabit,
  windowId: string | null,
  at: number,
  timeZone: string,
  day: CheckInDay | null,
): CheckInResolution {
  if (habit.status !== 'active')
    return {
      kind: 'notActive',
      status: habit.status,
      line: readNotActiveLine(habit),
    };
  const dayKey = habitDayKey(at, timeZone);
  const checks = day?.checks ?? {};
  if (habit.timesPerDay !== null) {
    const count = (day?.count ?? 0) + 1;
    return {
      kind: 'write',
      effect: { kind: 'tally', habitId: habit.id, dayKey, count, at },
      line:
        count > habit.timesPerDay
          ? `${count} ${lowerName(habit.name)} today`
          : `${count} of ${habit.timesPerDay} ${lowerName(habit.name)}`,
    };
  }
  const isTicked = (id: string) => checks[id] !== undefined;
  const hasWindows = Object.keys(habit.windowState).length > 0;
  const target = !hasWindows
    ? 'day'
    : windowId !== null && habit.windowState[windowId]
      ? windowId
      : pickWindow(habit, at, timeZone, dayKey, isTicked);
  if (target === null || isTicked(target))
    return {
      kind: 'alreadyDone',
      line: `${hasWindows && target ? toSubject(habit, target) : habit.name} already ticked.`,
    };
  return {
    kind: 'write',
    effect: { kind: 'tick', habitId: habit.id, dayKey, windowId: target, at },
    line: `Done. ${toSubject(habit, target)} ticked.`,
  };
}
