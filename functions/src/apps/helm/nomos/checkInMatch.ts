// Generated from src/apps/helm/engine/checkInMatch.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { createOptionMatcher, toComparable } from '../../../vendor/optionMatchUtils.js';
import {
  habitDayKey,
  readWindowSpans,
  type HabitScheduleLike,
} from './habitDay.js';

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
  'im',
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

/** A question opener, never a check-in; "did" also opens "did guitar", so it counts only before a subject. */
const QUESTION_OPENERS: ReadonlySet<string> = new Set([
  'did',
  'do',
  'does',
  'have',
  'has',
  'should',
  'can',
  'will',
  'are',
  'is',
  'was',
  'would',
  'could',
]);

const SUBJECT_WORDS: ReadonlySet<string> = new Set([
  'i',
  'we',
  'you',
  'he',
  'she',
  'they',
  'it',
]);

/** Words that stand for a medicine; they match a care habit by what it is. */
export const MEDICINE_WORDS = [
  'pills',
  'meds',
  'medicine',
  'medication',
  'tablets',
] as const;

const MAX_RESIDUAL_WORDS = 8;

export interface CheckInHabit extends HabitScheduleLike {
  id: string;
  name: string;
  windows: Record<string, { label: string }>;
  forWhoId: string | null;
  isCare: boolean;
}

export type CheckInMatch =
  | { kind: 'match'; habitId: string; windowId: string | null }
  | { kind: 'ambiguous'; habitIds: string[] }
  | { kind: 'none' };

interface Role {
  kind: 'name' | 'window' | 'who';
  windowId: string | null;
  text: string;
  /** The text is the past or -ing form of the name's leading verb, which says it was done. */
  isVerbForm: boolean;
}

const matcher = createOptionMatcher<Role>({
  names: (role) => [role.text],
  foldPlurals: true,
});

const wordMatcher = createOptionMatcher({ foldPlurals: true });

const IRREGULAR_VERBS: Record<string, string[]> = {
  take: ['took', 'taken', 'taking'],
  drink: ['drank', 'drunk', 'drinking'],
  eat: ['ate', 'eaten', 'eating'],
  run: ['ran', 'running'],
  swim: ['swam', 'swimming'],
  do: ['did', 'done', 'doing'],
  give: ['gave', 'given', 'giving'],
  write: ['wrote', 'written', 'writing'],
  read: ['read', 'reading'],
  go: ['went', 'gone', 'going'],
  sit: ['sat', 'sitting'],
  get: ['got', 'getting'],
};

const verbForms = (verb: string): string[] => {
  if (!/^[a-z]{3,}$/.test(verb)) return [];
  if (IRREGULAR_VERBS[verb]) return IRREGULAR_VERBS[verb];
  const last = verb.slice(-1);
  const stem = verb.endsWith('e') ? verb.slice(0, -1) : verb;
  const doubled = `${verb}${last}`;
  const past = verb.endsWith('e')
    ? [`${verb}d`]
    : /[^aeiou]y$/.test(verb)
      ? [`${verb.slice(0, -1)}ied`]
      : [`${verb}ed`, `${doubled}ed`];
  return [
    ...past,
    ...(verb.endsWith('ice') ? [`${verb.slice(0, -3)}ised`] : []),
    `${stem}ing`,
    `${doubled}ing`,
  ];
};

const isVerb = (words: string[], at: number) =>
  words[at] === 'take'
    ? words[at - 1] === 'i'
    : (CHECKIN_VERBS as readonly string[]).includes(words[at]);

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
): Role[] => {
  const [lead, ...rest] = toComparable(habit.name).split(' ').filter(Boolean);
  const forms = lead ? verbForms(lead) : [];
  const role = (kind: Role['kind'], text: string, windowId: string | null) => ({
    kind,
    windowId,
    text,
    isVerbForm: false,
  });
  return [
    role('name', habit.name, null),
    ...forms.flatMap((form): Role[] => [
      { ...role('name', form, null), isVerbForm: true },
      ...(rest.length > 0
        ? [
            {
              ...role('name', [form, ...rest].join(' '), null),
              isVerbForm: true,
            },
          ]
        : []),
    ]),
    ...(habit.isCare
      ? MEDICINE_WORDS.map((word) => role('name', word, null))
      : []),
    ...Object.entries(habit.windows).map(([windowId, window]) =>
      role('window', window.label, windowId),
    ),
    ...(habit.forWhoId
      ? (whoNames[habit.forWhoId] ?? []).map((text) => role('who', text, null))
      : []),
  ];
};

const isFit = (segment: string, role: Role) =>
  role.isVerbForm
    ? toComparable(segment, true) === toComparable(role.text, true)
    : matcher.match(segment, [role]) !== null;

const readHabitMatch = (
  habit: CheckInHabit,
  roles: Role[],
  segmentations: string[][],
  hasVerb: boolean,
) =>
  segmentations.flatMap((segments) => {
    const found = segments.map((segment) =>
      roles.filter((role) => isFit(segment, role)),
    );
    if (found.some((fits) => fits.length === 0)) return [];
    const kinds = found.map((fits) => fits[0].kind);
    const windows = found.flatMap((fits) =>
      fits[0].kind === 'window' ? [fits[0].windowId] : [],
    );
    const hasWho = kinds.includes('who');
    const isDoneWord = found.some((fits) =>
      fits.some((role) => role.isVerbForm),
    );
    const isValid =
      (hasVerb || isDoneWord) &&
      kinds.filter((kind) => kind === 'name').length <= 1 &&
      windows.length <= 1 &&
      (kinds.includes('name') || windows.length === 1) &&
      hasWho === (habit.forWhoId !== null);
    return isValid ? [{ windowId: windows[0] ?? null }] : [];
  })[0];

const isQuestion = (
  text: string,
  words: string[],
  whoNames: Record<string, readonly string[]>,
) => {
  if (text.includes('?')) return true;
  if (!QUESTION_OPENERS.has(words[0])) return false;
  if (words[0] !== 'did') return true;
  const names = new Set(
    Object.values(whoNames).flatMap((list) =>
      list.map((name) => toComparable(name).split(' ')[0]),
    ),
  );
  return SUBJECT_WORDS.has(words[1]) || names.has(words[1]);
};

/** Reads a typed or said line against today's habits; confident only when nothing but a verb (or the past form of a habit's own verb), filler, a habit's name, a medicine word, or a window label (and a carer's who) is said, so a question, an order, or anything more goes to the model. */
export function matchCheckIn(
  text: string,
  todaysHabits: readonly CheckInHabit[],
  whoNames: Record<string, readonly string[]>,
): CheckInMatch {
  const words = toComparable(text).split(' ').filter(Boolean);
  if (isQuestion(text, words, whoNames)) return { kind: 'none' };
  const hasVerb = words.some((_, at) => isVerb(words, at));
  const residual = words.filter(
    (word, at) => !isVerb(words, at) && !FILLER_WORDS.has(word),
  );
  if (residual.length === 0 || residual.length > MAX_RESIDUAL_WORDS)
    return { kind: 'none' };
  const segmentations = splits(residual);
  const matches = todaysHabits.flatMap((habit) => {
    const roles = rolesOf(habit, whoNames);
    const tokens = [
      ...new Set(roles.flatMap((role) => toComparable(role.text).split(' '))),
    ].filter(Boolean);
    if (!residual.some((word) => wordMatcher.match(word, tokens) !== null))
      return [];
    const found = readHabitMatch(habit, roles, segmentations, hasVerb);
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
    return `Your ${lowerName(habit.name)} is retired. Say "bring back ${lowerName(habit.name)}" to start it again.`;
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
  const next = spans
    .filter((span) => span.startAt > at)
    .sort((first, second) => first.startAt - second.startAt)[0];
  return (next ?? spans[spans.length - 1]).id;
};

/** Decides which window a check-in lands in (the open one, else the nearest unticked earlier one today, else the next one still to come; never the whole day for a habit with windows), the write it makes and the line that says so; nothing is written for a habit that is not active. */
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
  const isTicked = (id: string) =>
    (checks[id] as { status?: string } | undefined)?.status === 'done';
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
