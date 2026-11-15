import type { SealedPayload } from '../../../appKeys/seal.js';
import { toComparable } from '../../../vendor/optionMatchUtils.js';
import {
  EMPTY_HABIT_DAY,
  isPrivateHabit,
  type HabitDayWrite,
  type HabitWindowDoc,
  type LiveHabit,
  type LiveHabitDay,
} from '../habitStore.js';
import {
  DOSE_PATTERN,
  readEffectivePrivacy,
  readPersonMark,
  readPrivateMark,
} from '../privacy.js';
import {
  ACTIVE_HABITS_MAX,
  HABIT_HISTORY_MAX,
  HABIT_NOTE_CAP,
  type CheckInCommand,
  type CreateHabitCommand,
  type HabitCommand,
  type HabitWindowRead,
  type SetCareCommand,
  type UpdateHabitCommand,
} from './commands.js';
import type {
  Effect,
  EffectRef,
  PlannedQuestion,
  QuestionStateEntry,
} from './executeCommands.js';
import { resolveCheckIn, type CheckInResolution } from './checkInMatch.js';
import {
  dayPartWindows,
  habitDayKey,
  isHabitDue,
  saidTimeWindow,
  toAllowedWindow,
  type ClockWindow,
  type DayPart,
} from './habitDay.js';
import { AUTOMATIC_LEVEL } from './policy.js';
import { buildSpokenQuestion } from './summaries.js';

const DAY_MS = 86_400_000;
const PRIVATE_HABIT = 'Private habit';
const ROOM_LINE = 'Not kept · too much to save in one go';

export interface HabitPlanInput {
  commands: HabitCommand[];
  habits: readonly LiveHabit[];
  days: ReadonlyMap<string, LiveHabitDay>;
  selfWhoId: string | null;
  knownWhoIds: ReadonlySet<string>;
  timeZone: string;
  profile: { dayStartTime: string; dayEndTime: string };
  isLearningOn: boolean;
  at: number;
  now: number;
  captureId: string;
  executionId: string;
  isUnattended: boolean;
  newId: () => string;
  seal: (fields: Record<string, unknown>) => SealedPayload;
  /** How many effects the turn can still record. */
  room: number;
}

/** The "How was it?" a tick may earn, held until the whole turn is known to ask nothing else. */
export interface HabitFollowUp {
  habitId: string;
  dayKey: string;
  habitName: string;
}

export interface HabitPlan {
  creates: { id: string; doc: Record<string, unknown> }[];
  updates: { id: string; data: Record<string, unknown> }[];
  dayWrites: HabitDayWrite[];
  effectRefs: EffectRef[];
  effects: Effect[];
  lines: string[];
  notKept: string[];
  questions: PlannedQuestion[];
  followUp: HabitFollowUp | null;
  isPrivate: boolean;
}

interface Acc extends HabitPlan {
  habits: Map<string, LiveHabit>;
  days: Map<string, LiveHabitDay>;
}

const lower = (name: string) => name.trim().toLowerCase();

const shownName = (
  habit: Pick<LiveHabit, 'name' | 'privacy' | 'isCare'>,
  isUnattended: boolean,
) => (isUnattended && isPrivateHabit(habit) ? PRIVATE_HABIT : habit.name);

const toClockLabel = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};

const toPartLabel = (part: string) =>
  `${part.charAt(0).toUpperCase()}${part.slice(1)}`;

const withEffect = (
  acc: Acc,
  ref: EffectRef,
  effect: Effect,
  line: string | null,
): Acc => ({
  ...acc,
  effectRefs: [...acc.effectRefs, ref],
  effects: [...acc.effects, effect],
  lines: line === null ? acc.lines : [...acc.lines, line],
});

const withNotKept = (acc: Acc, line: string): Acc => ({
  ...acc,
  notKept: [...acc.notKept, line],
});

const hasNoRoom = (acc: Acc, input: HabitPlanInput) =>
  input.room - acc.effects.length < 1;

const joinOr = (labels: string[]) =>
  labels.length < 2
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;

const toWindowTimes = (
  read: HabitWindowRead,
  parts: Record<DayPart, ClockWindow>,
): ClockWindow | null => {
  if (read.start !== null)
    return read.end === null
      ? saidTimeWindow(read.start)
      : toAllowedWindow({ start: read.start, end: read.end });
  return read.part !== null ? parts[read.part] : null;
};

/** The windows a habit is made or rescheduled with: their readable times by id, and the label that is sealed for each. */
const toWindows = (
  reads: HabitWindowRead[],
  input: Pick<HabitPlanInput, 'profile' | 'newId'>,
) => {
  const parts = dayPartWindows(input.profile);
  const made = reads.flatMap((read) => {
    const times = toWindowTimes(read, parts);
    return times
      ? [
          {
            id: input.newId(),
            times,
            part: read.start === null ? read.part : null,
            label:
              read.label ??
              (read.start === null && read.part
                ? toPartLabel(read.part)
                : toClockLabel(times.start)),
          },
        ]
      : [];
  });
  return {
    windowState: Object.fromEntries(
      made.map((window, order): [string, HabitWindowDoc] => [
        window.id,
        { ...window.times, part: window.part, order, editedAt: null },
      ]),
    ),
    labels: Object.fromEntries(
      made.map((window) => [window.id, { label: window.label }]),
    ),
  };
};

const toEvent = (kind: string, now: number) => ({
  kind,
  at: now,
  by: 'nomos',
  pace: null,
  stage: null,
});

const sealedWords = (
  habit: LiveHabit,
  seal: HabitPlanInput['seal'],
  over: Record<string, unknown> = {},
) =>
  seal({
    name: habit.name,
    emoji: habit.emoji,
    notes: habit.notes,
    medicine: habit.medicine,
    windows: habit.windows,
    importance: habit.importance,
    privateMark: habit.privateMark,
    isPrivacyCleared: habit.isPrivacyCleared,
    ...over,
  });

const baseQuestion = {
  builtBy: 'code' as const,
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  aboutRef: null,
  answer: null,
};

export const buildCareQuestion = (name: string, habitId: string) => ({
  ...baseQuestion,
  kind: 'isMedicine' as const,
  shape: 'yesNo' as const,
  prompt: `Is ${lower(name)} a medicine?`,
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
  heldCommands: [{ kind: 'askCare', habitId }],
});

export const buildWhichHabitQuestion = (
  candidates: { id: string; name: string; detail: string | null }[],
  held: Pick<CheckInCommand, 'windowKey' | 'day' | 'status' | 'note'>,
) => ({
  ...baseQuestion,
  kind: 'whichHabit' as const,
  shape: 'pickOne' as const,
  prompt: 'Which one?',
  options: [
    ...candidates.map(({ id, name, detail }) => ({
      id,
      label: detail ? `${name} (${detail})` : name,
    })),
    { id: 'both', label: 'Both' },
  ],
  heldCommands: [
    {
      kind: 'checkInChoice',
      habitIds: candidates.map(({ id }) => id),
      ...held,
    },
  ],
});

export const buildHowWasItQuestion = (habitName: string) => ({
  ...baseQuestion,
  kind: 'howWasIt' as const,
  shape: 'pickOne' as const,
  prompt: `How was ${lower(habitName)}?`,
  allowsSomethingElse: true,
  options: [
    { id: 'good', label: 'Good' },
    { id: 'hard', label: 'Hard' },
  ],
  heldCommands: [],
});

export const toPlannedQuestion = (
  sealed: {
    kind: string;
    shape: string;
    prompt: string;
    options: { id: string; label: string }[];
  },
  input: { id: string; now: number },
): PlannedQuestion => ({
  id: input.id,
  state: {
    kind: sealed.kind,
    shape: sealed.shape,
    askedAt: input.now,
    answeredAt: null,
    skippedAt: null,
    dismissedAt: null,
  },
  sealed,
  spoken: buildSpokenQuestion(sealed),
});

const planCreate = (
  acc: Acc,
  command: CreateHabitCommand,
  input: HabitPlanInput,
): Acc => {
  if (hasNoRoom(acc, input)) return withNotKept(acc, ROOM_LINE);
  const kept = [...acc.habits.values()].filter(
    (habit) => habit.status === 'active' || habit.status === 'paused',
  );
  if (kept.length >= ACTIVE_HABITS_MAX)
    return withNotKept(
      acc,
      `You already keep ${ACTIVE_HABITS_MAX} habits. Retire one to add another`,
    );
  if (
    kept.some(
      (habit) => toComparable(habit.name) === toComparable(command.name),
    )
  )
    return withNotKept(acc, `You already keep ${lower(command.name)}`);
  const forWhoId =
    command.forWhoId !== null &&
    command.forWhoId !== input.selfWhoId &&
    input.knownWhoIds.has(command.forWhoId)
      ? command.forWhoId
      : null;
  const isCare = command.isCare || forWhoId !== null;
  const words = `${command.name} ${command.words}`;
  const coded = readPrivateMark({
    current: { privateMark: null, isPrivacyCleared: false, isCare },
    isCare,
    isForOtherWho: forWhoId !== null,
    commandMark: null,
    isSensitiveHealth: false,
    words,
  });
  const own = command.isPrivate ? readPersonMark(coded, true) : coded;
  const privacy = readEffectivePrivacy(own);
  const { windowState, labels } = toWindows(command.windows, input);
  const isAsked =
    privacy === 'private' &&
    !isCare &&
    !input.isUnattended &&
    (DOSE_PATTERN.test(words) ||
      Object.keys(windowState).length >= 2 ||
      (command.timesPerDay ?? 0) >= 2);
  const id = input.newId();
  const doc = {
    status: 'active',
    cadence: command.cadence,
    windowState,
    timesPerDay: command.timesPerDay,
    projectId: null,
    forWhoId,
    isCare,
    startsOn: Date.parse(`${habitDayKey(input.at, input.timeZone)}T00:00:00Z`),
    endsOn: null,
    pausedUntil: null,
    reminder: null,
    lockScreenName: null,
    stage: forWhoId === null ? 'building' : null,
    stageAt: input.now,
    stageWeek: null,
    rejudgeFrom: null,
    careAskedAt: isAsked ? input.now : null,
    untoldSince: null,
    formedAt: null,
    formedSummary: null,
    history: [toEvent('started', input.now)],
    createdBy: 'nomos',
    sourceCaptureId: input.captureId,
    executionId: input.executionId,
    createdAt: input.now,
    lastEditedAt: null,
    pausedAt: null,
    endedAt: null,
    retiredAt: null,
    privacy,
    sealed: input.seal({
      name: command.name,
      emoji: command.emoji,
      notes: null,
      medicine: null,
      windows: labels,
      importance: null,
      privateMark: own.privateMark,
      isPrivacyCleared: own.isPrivacyCleared === true,
    }),
  };
  const startedHabit: LiveHabit = {
    id,
    name: command.name,
    emoji: command.emoji,
    notes: null,
    medicine: null,
    windows: labels,
    importance: null,
    privateMark: own.privateMark,
    isPrivacyCleared: own.isPrivacyCleared === true,
    status: 'active',
    storedStatus: 'active',
    lastEditedAt: null,
    cadence: command.cadence,
    windowState,
    timesPerDay: command.timesPerDay,
    forWhoId,
    isCare,
    startsOn: doc.startsOn,
    endsOn: null,
    pausedUntil: null,
    pausedAt: null,
    endedAt: null,
    retiredAt: null,
    careAskedAt: doc.careAskedAt,
    stage: doc.stage,
    reminder: null,
    history: doc.history,
    privacy,
  };
  const made = withEffect(
    acc,
    { op: 'create', collection: 'habits', docId: id },
    {
      written: {
        'sealed.title': command.name,
        cadence: command.cadence,
        isCare,
        privacy,
      },
      previous: null,
    },
    `Started ${lower(shownName(startedHabit, input.isUnattended))}`,
  );
  return {
    ...made,
    habits: new Map(made.habits).set(id, startedHabit),
    creates: [...made.creates, { id, doc }],
    questions: isAsked
      ? [
          ...made.questions,
          toPlannedQuestion(buildCareQuestion(command.name, id), {
            id: input.newId(),
            now: input.now,
          }),
        ]
      : made.questions,
    isPrivate: made.isPrivate || privacy === 'private',
  };
};

interface Transition {
  from: string[];
  to: string;
  event: string;
  verb: string;
}

const TRANSITIONS: Partial<Record<UpdateHabitCommand['change'], Transition>> = {
  pause: { from: ['active'], to: 'paused', event: 'paused', verb: 'Paused' },
  resume: {
    from: ['paused', 'ended'],
    to: 'active',
    event: 'resumed',
    verb: 'Resumed',
  },
  end: {
    from: ['active', 'paused'],
    to: 'ended',
    event: 'ended',
    verb: 'Ended',
  },
  retire: {
    from: ['active', 'paused'],
    to: 'retired',
    event: 'retired',
    verb: 'Retired',
  },
  bringBack: {
    from: ['retired'],
    to: 'active',
    event: 'broughtBack',
    verb: 'Brought back',
  },
};

const STATUS_WORDS: Record<string, string> = {
  active: 'already going',
  paused: 'already paused',
  ended: 'already ended',
  retired: 'already retired',
};

const planUpdate = (
  acc: Acc,
  command: UpdateHabitCommand,
  input: HabitPlanInput,
): Acc => {
  const habit = acc.habits.get(command.habitId);
  if (!habit) return acc;
  const name = lower(shownName(habit, input.isUnattended));
  if (hasNoRoom(acc, input)) return withNotKept(acc, ROOM_LINE);
  const ref: EffectRef = {
    op: 'update',
    collection: 'habits',
    docId: habit.id,
  };
  const finish = (
    data: Record<string, unknown>,
    effect: Effect,
    line: string,
    next: Partial<LiveHabit>,
  ): Acc => {
    const step = withEffect(acc, ref, effect, line);
    return {
      ...step,
      updates: [...step.updates, { id: habit.id, data }],
      habits: new Map(step.habits).set(habit.id, { ...habit, ...next }),
      isPrivate: step.isPrivate || isPrivateHabit(habit),
    };
  };
  if (command.change === 'reschedule') {
    const windows =
      command.windows && command.windows.length > 0
        ? toWindows(command.windows, input)
        : null;
    if (command.cadence === null && windows === null) return acc;
    const readable = {
      ...(command.cadence ? { cadence: command.cadence } : {}),
      ...(windows ? { windowState: windows.windowState } : {}),
    };
    const mergedLabels = windows
      ? { ...habit.windows, ...windows.labels }
      : null;
    return finish(
      {
        ...readable,
        ...(mergedLabels
          ? {
              sealed: sealedWords(habit, input.seal, { windows: mergedLabels }),
            }
          : {}),
        lastEditedAt: input.now,
      },
      {
        written: {
          ...readable,
          lastEditedAt: input.now,
          'sealed.title': habit.name,
        },
        previous: {
          'sealed.title': habit.name,
          ...(command.cadence ? { cadence: habit.cadence } : {}),
          ...(windows ? { windowState: habit.windowState } : {}),
          lastEditedAt: habit.lastEditedAt,
        },
      },
      `Changed ${name}`,
      {
        lastEditedAt: input.now,
        ...(command.cadence ? { cadence: command.cadence } : {}),
        ...(windows
          ? { windowState: windows.windowState, windows: mergedLabels ?? {} }
          : {}),
      },
    );
  }
  const next = TRANSITIONS[command.change];
  if (!next) return acc;
  if (command.change === 'retire' && habit.isCare)
    return withNotKept(
      acc,
      `Your ${name} stays. A medicine or care habit is never retired for you`,
    );
  if (!next.from.includes(habit.status))
    return withNotKept(
      acc,
      `Your ${name} is ${STATUS_WORDS[habit.status] ?? 'as it is'}`,
    );
  const history = [
    ...habit.history,
    toEvent(
      habit.status === 'ended' && command.change === 'resume'
        ? 'restarted'
        : next.event,
      input.now,
    ),
  ].slice(-HABIT_HISTORY_MAX);
  const fields = {
    status: next.to,
    pausedAt: next.to === 'paused' ? input.now : null,
    pausedUntil: next.to === 'paused' ? command.until : null,
    endedAt: next.to === 'ended' ? input.now : null,
    retiredAt: next.to === 'retired' ? input.now : null,
    history,
    lastEditedAt: input.now,
  };
  return finish(
    fields,
    {
      written: { ...fields, 'sealed.title': habit.name },
      previous: {
        'sealed.title': habit.name,
        status: habit.storedStatus,
        pausedAt: habit.pausedAt ?? null,
        pausedUntil: habit.pausedUntil,
        endedAt: habit.endedAt ?? null,
        retiredAt: habit.retiredAt ?? null,
        history: habit.history,
        lastEditedAt: habit.lastEditedAt,
      },
    },
    `${next.verb} ${name}`,
    {
      status: next.to,
      storedStatus: next.to,
      pausedUntil: fields.pausedUntil,
      history,
      lastEditedAt: input.now,
    },
  );
};

const planCare = (
  acc: Acc,
  command: SetCareCommand,
  input: HabitPlanInput,
): Acc => {
  const habit = acc.habits.get(command.habitId);
  if (!habit) return acc;
  const name = lower(shownName(habit, input.isUnattended));
  if (hasNoRoom(acc, input)) return withNotKept(acc, ROOM_LINE);
  if (!command.isCare && habit.forWhoId !== null)
    return withNotKept(
      acc,
      `Your ${name} is for someone else, so it stays care`,
    );
  if (!command.isCare && input.isUnattended)
    return withNotKept(
      acc,
      'Nothing is made not private while the screen is out of sight',
    );
  if (command.isCare === habit.isCare)
    return withNotKept(
      acc,
      command.isCare
        ? `Your ${name} is already marked as medicine or care`
        : `Your ${name} is not marked as medicine or care`,
    );
  return applyCare(acc, habit, command.isCare, input, name);
};

/** Care on adds a health mark and makes the habit private; care off clears both, and code never marks it again. */
const applyCare = (
  acc: Acc,
  habit: LiveHabit,
  isCare: boolean,
  input: Pick<HabitPlanInput, 'now' | 'seal'>,
  name: string,
): Acc => {
  const privateMark = isCare ? ('health' as const) : null;
  const isPrivacyCleared = !isCare;
  const privacy = readEffectivePrivacy({
    privateMark,
    isPrivacyCleared,
    isCare,
  });
  const careAskedAt = habit.careAskedAt ?? input.now;
  const readable = { isCare, privacy, careAskedAt, lastEditedAt: input.now };
  const step = withEffect(
    acc,
    { op: 'update', collection: 'habits', docId: habit.id },
    {
      written: { ...readable, 'sealed.title': habit.name },
      previous: {
        'sealed.title': habit.name,
        isCare: habit.isCare,
        privacy: habit.privacy,
        careAskedAt: habit.careAskedAt,
        lastEditedAt: habit.lastEditedAt,
      },
    },
    isCare
      ? `Marked ${name} as medicine or care`
      : `Unmarked ${name} as medicine or care`,
  );
  return {
    ...step,
    updates: [
      ...step.updates,
      {
        id: habit.id,
        data: {
          ...readable,
          sealed: sealedWords(habit, input.seal, {
            privateMark,
            isPrivacyCleared,
          }),
        },
      },
    ],
    habits: new Map(step.habits).set(habit.id, {
      ...habit,
      isCare,
      privacy,
      privateMark,
      isPrivacyCleared,
      careAskedAt,
      lastEditedAt: input.now,
    }),
    isPrivate: step.isPrivate || privacy === 'private' || isPrivateHabit(habit),
  };
};

const readWindowId = (habit: LiveHabit, key: string | null) => {
  if (key === null) return null;
  const wanted = toComparable(key);
  return (
    Object.entries(habit.windows).find(
      ([id, window]) =>
        habit.windowState[id] !== undefined &&
        toComparable(window.label) === wanted,
    )?.[0] ??
    Object.entries(habit.windowState).find(
      ([, window]) =>
        window.part !== null && toComparable(window.part) === wanted,
    )?.[0] ??
    null
  );
};

const toNoteText = (note: string | null) =>
  note === null ? null : note.trim().slice(0, HABIT_NOTE_CAP) || null;

const emptyWrite = (dayKey: string): HabitDayWrite => ({
  dayKey,
  checks: [],
  tallies: [],
  noteKeys: [],
  followUps: [],
  sealed: null,
});

type WriteResolution = Extract<CheckInResolution, { kind: 'write' }>;

const toDayWithTick = (
  day: LiveHabitDay,
  habitId: string,
  windowId: string | null,
  check: { status: string; at: number },
): LiveHabitDay => {
  const entry = day.entries[habitId] ?? {
    checks: {},
    count: 0,
    followUpAt: null,
    followUpState: null,
    noteKeys: [],
  };
  return {
    ...day,
    exists: true,
    entries: {
      ...day.entries,
      [habitId]: {
        ...entry,
        checks:
          windowId === null
            ? entry.checks
            : { ...entry.checks, [windowId]: check },
        count: windowId === null ? entry.count + 1 : entry.count,
      },
    },
  };
};

/** A second note on the same tick keeps the first: it lands under the key with a number after it. */
const toFreeNoteKey = (day: LiveHabitDay, key: string) =>
  Array.from({ length: 20 }, (_, at) =>
    at === 0 ? key : `${key}#${at + 1}`,
  ).find((candidate) => day.notes[candidate] === undefined) ?? key;

/** One resolved check-in: a tick, a "not today" or one more on a tally, with its note kept word for word. */
const writeCheckIn = (
  acc: Acc,
  habit: LiveHabit,
  resolution: WriteResolution,
  command: Pick<CheckInCommand, 'status' | 'note' | 'day'>,
  input: HabitPlanInput,
): Acc => {
  const { effect } = resolution;
  const isSkip = command.status === 'skipped';
  const isTally = effect.kind === 'tally' && !isSkip;
  const windowId = effect.kind === 'tick' ? effect.windowId : 'day';
  const day = acc.days.get(effect.dayKey) ?? EMPTY_HABIT_DAY;
  const base =
    acc.dayWrites.find((made) => made.dayKey === effect.dayKey) ??
    emptyWrite(effect.dayKey);
  const note = day.isNotesUnreadable ? null : toNoteText(command.note);
  const noteKey = toFreeNoteKey(day, `${habit.id}/${windowId}`);
  const notes = note
    ? {
        ...day.notes,
        [noteKey]: { text: note, at: effect.at, captureId: input.captureId },
      }
    : day.notes;
  const check = {
    status: isSkip ? ('skipped' as const) : ('done' as const),
    at: effect.at,
    by: 'nomos' as const,
    executionId: input.executionId,
  };
  const wantsFollowUp =
    !isSkip &&
    command.day !== 'yesterday' &&
    input.isLearningOn &&
    !input.isUnattended &&
    acc.followUp === null &&
    (day.entries[habit.id]?.followUpAt ?? null) === null &&
    (!habit.isCare || note !== null);
  const write: HabitDayWrite = {
    ...base,
    checks: isTally
      ? base.checks
      : [...base.checks, { habitId: habit.id, windowId, check }],
    tallies: isTally
      ? [...base.tallies, { habitId: habit.id, at: effect.at }]
      : base.tallies,
    noteKeys: note
      ? [...base.noteKeys, { habitId: habit.id, key: noteKey }]
      : base.noteKeys,
    sealed: note ? input.seal({ notes }) : base.sealed,
  };
  const entry = `entries.${habit.id}`;
  const count = effect.kind === 'tally' ? effect.count : 0;
  const name = lower(shownName(habit, input.isUnattended));
  const label = habit.windows[windowId]?.label;
  const step = withEffect(
    acc,
    {
      op: day.exists ? 'update' : 'create',
      collection: 'habitDays',
      docId: effect.dayKey,
    },
    isTally
      ? {
          written: { [`${entry}.count`]: count, 'sealed.title': habit.name },
          previous: {
            [`${entry}.count`]: count - 1,
            'sealed.title': habit.name,
          },
        }
      : {
          written: {
            [`${entry}.checks.${windowId}`]: check,
            'sealed.title': habit.name,
            noteKey: note ? noteKey : null,
          },
          previous: {
            [`${entry}.checks.${windowId}`]: null,
            'sealed.title': habit.name,
            noteKey: null,
          },
        },
    isSkip
      ? `Not today. ${label ? `${label} ${name}` : name} skipped`
      : resolution.line.replace(/\.$/, ''),
  );
  return {
    ...step,
    dayWrites: [
      ...step.dayWrites.filter((made) => made.dayKey !== effect.dayKey),
      write,
    ],
    days: new Map(step.days).set(effect.dayKey, {
      ...toDayWithTick(day, habit.id, isTally ? null : windowId, check),
      notes,
    }),
    followUp: wantsFollowUp
      ? { habitId: habit.id, dayKey: effect.dayKey, habitName: habit.name }
      : step.followUp,
    isPrivate: step.isPrivate || isPrivateHabit(habit),
  };
};

interface Candidate {
  habit: LiveHabit;
  resolution: CheckInResolution;
}

const resolveFor = (
  acc: Acc,
  habit: LiveHabit,
  command: Pick<CheckInCommand, 'windowKey' | 'day'>,
  input: HabitPlanInput,
): Candidate => {
  const at = command.day === 'yesterday' ? input.at - DAY_MS : input.at;
  const entry = acc.days.get(habitDayKey(at, input.timeZone))?.entries[
    habit.id
  ];
  return {
    habit,
    resolution: resolveCheckIn(
      { ...habit, name: shownName(habit, input.isUnattended) },
      readWindowId(habit, command.windowKey),
      at,
      input.timeZone,
      entry ? { checks: entry.checks, count: entry.count } : null,
    ),
  };
};

const toOpenLabel = (candidate: Candidate, windowKey: string | null) => {
  const { resolution, habit } = candidate;
  if (resolution.kind !== 'write' || resolution.effect.kind !== 'tick')
    return null;
  return (
    habit.windows[resolution.effect.windowId]?.label ??
    (windowKey ? toPartLabel(windowKey) : null)
  );
};

const planCheckIn = (
  acc: Acc,
  command: CheckInCommand,
  input: HabitPlanInput,
): Acc => {
  const named = command.habitIds.flatMap((id) => acc.habits.get(id) ?? []);
  if (named.length === 0) return acc;
  const dayKey = habitDayKey(input.at, input.timeZone);
  const isChoice = command.habitIds.length > 1;
  const resolved = (
    isChoice ? named.filter((habit) => isHabitDue(habit, dayKey)) : named
  ).map((habit) => resolveFor(acc, habit, command, input));
  const writable = resolved.flatMap((candidate) =>
    candidate.resolution.kind === 'write' ? [candidate] : [],
  );
  if (writable.length >= 2) {
    const sealed = buildWhichHabitQuestion(
      writable.map((candidate) => ({
        id: candidate.habit.id,
        name: shownName(candidate.habit, input.isUnattended),
        detail: toOpenLabel(candidate, command.windowKey),
      })),
      command,
    );
    return {
      ...acc,
      questions: [
        ...acc.questions,
        toPlannedQuestion(sealed, { id: input.newId(), now: input.now }),
      ],
    };
  }
  const [only] = writable;
  if (!only)
    return resolved.length === 0
      ? acc
      : withNotKept(
          acc,
          joinOr(
            resolved.map((candidate) =>
              candidate.resolution.line.replace(/\.$/, ''),
            ),
          ),
        );
  if (hasNoRoom(acc, input)) return withNotKept(acc, ROOM_LINE);
  return only.resolution.kind === 'write'
    ? writeCheckIn(acc, only.habit, only.resolution, command, input)
    : acc;
};

const planOne = (acc: Acc, command: HabitCommand, input: HabitPlanInput) => {
  if (command.kind === 'createHabit') return planCreate(acc, command, input);
  if (command.kind === 'updateHabit') return planUpdate(acc, command, input);
  if (command.kind === 'setCare') return planCare(acc, command, input);
  return planCheckIn(acc, command, input);
};

/** Plans the turn's habit commands as undoable effects: a new habit, a change to one, a tick or tally on a habit day, a care mark. A habit that is not active gets a code-built line and nothing is written. */
export function planHabitCommands(input: HabitPlanInput): HabitPlan {
  const done = input.commands.reduce<Acc>(
    (acc, command) => planOne(acc, command, input),
    {
      creates: [],
      updates: [],
      dayWrites: [],
      effectRefs: [],
      effects: [],
      lines: [],
      notKept: [],
      questions: [],
      followUp: null,
      isPrivate: false,
      habits: new Map(input.habits.map((habit) => [habit.id, habit])),
      days: new Map(input.days),
    },
  );
  return {
    creates: done.creates,
    updates: done.updates,
    dayWrites: done.dayWrites,
    effectRefs: done.effectRefs,
    effects: done.effects,
    lines: done.lines,
    notKept: done.notKept,
    questions: done.questions,
    followUp: done.followUp,
    isPrivate: done.isPrivate,
  };
}

export interface HabitAnswerInput {
  held: Record<string, unknown>;
  optionId: string;
  habits: readonly LiveHabit[];
  days: ReadonlyMap<string, LiveHabitDay>;
  timeZone: string;
  profile: HabitPlanInput['profile'];
  at: number;
  now: number;
  captureId: string;
  executionId: string;
  newId: () => string;
  seal: HabitPlanInput['seal'];
}

const toStrings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

/** What answering "Which one?" or "Is this a medicine?" writes; null when nothing is left to write. */
export function planHabitAnswer(input: HabitAnswerInput): HabitPlan | null {
  const planInput: HabitPlanInput = {
    commands: [],
    habits: input.habits,
    days: input.days,
    selfWhoId: null,
    knownWhoIds: new Set<string>(),
    timeZone: input.timeZone,
    profile: input.profile,
    isLearningOn: false,
    at: input.at,
    now: input.now,
    captureId: input.captureId,
    executionId: input.executionId,
    isUnattended: false,
    newId: input.newId,
    seal: input.seal,
    room: 40,
  };
  if (input.held.kind === 'askCare') {
    const habit = input.habits.find((entry) => entry.id === input.held.habitId);
    if (input.optionId !== 'yes' || !habit || habit.isCare) return null;
    return planHabitCommands({
      ...planInput,
      commands: [
        { kind: 'setCare', habitId: habit.id, isCare: true, requestQuote: '' },
      ],
    });
  }
  const ids = toStrings(input.held.habitIds).filter(
    (id) => input.optionId === 'both' || id === input.optionId,
  );
  const plan = planHabitCommands({
    ...planInput,
    commands: ids.map((id) => ({
      kind: 'checkIn' as const,
      habitIds: [id],
      windowKey:
        typeof input.held.windowKey === 'string' ? input.held.windowKey : null,
      day:
        input.held.day === 'yesterday'
          ? ('yesterday' as const)
          : ('today' as const),
      status:
        input.held.status === 'skipped'
          ? ('skipped' as const)
          : ('done' as const),
      note: typeof input.held.note === 'string' ? input.held.note : null,
    })),
  });
  return plan.effects.length === 0 && plan.notKept.length === 0 ? null : plan;
}

/** The Execution an answered habit question makes. */
export function buildHabitAnswerExecution(
  plan: HabitPlan,
  input: {
    captureId: string;
    questionId: string;
    now: number;
    seal: HabitPlanInput['seal'];
  },
): Record<string, unknown> {
  return {
    captureId: input.captureId,
    actor: 'nomos',
    privacy: plan.isPrivate ? 'private' : 'ordinary',
    category: 'organize',
    autonomyLevel: AUTOMATIC_LEVEL,
    state: 'succeeded',
    effectRefs: plan.effectRefs,
    linkedWhoIds: [],
    linkedPlaceIds: [],
    undoesExecutionId: null,
    undoneByExecutionId: null,
    questionRef: { captureId: input.captureId, questionId: input.questionId },
    errorCode: null,
    createdAt: input.now,
    decidedAt: input.now,
    finishedAt: input.now,
    sealed: input.seal({
      summary: plan.lines.join('. '),
      commands: [],
      effects: plan.effects,
      notDone: plan.notKept,
      abilityOffer: null,
      awayZoneOffer: null,
      undoReport: null,
      goneIds: null,
      said: null,
      lines: null,
      spoken: null,
    }),
  };
}

export interface HabitResolveInput extends Omit<
  HabitAnswerInput,
  'held' | 'at'
> {
  questionId: string;
  by: 'tap' | 'voice';
  capture: {
    status: string;
    createdAt: number;
    executionIds: string[];
    questionState: Record<string, QuestionStateEntry>;
  };
  opened: Record<string, unknown>;
}

export type HabitResolveRefusal = 'answered' | 'unknown' | 'gone';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Decides what answering "Which one?" or "Is this a medicine?" writes, without touching a database: the held check-in or care mark is planned against the habits as they are now, and the question is closed either way. */
export function planResolveHabit(input: HabitResolveInput):
  | { refused: HabitResolveRefusal }
  | {
      refused: null;
      habit: HabitPlan | null;
      execution: Record<string, unknown> | null;
      capture: Record<string, unknown>;
    } {
  const { questionId, optionId, now, capture } = input;
  const state = capture.questionState[questionId];
  const oldQuestions = isRecord(input.opened.questions)
    ? input.opened.questions
    : {};
  const question = oldQuestions[questionId];
  if (!state || !isRecord(question)) return { refused: 'unknown' };
  if (state.answeredAt !== null) return { refused: 'answered' };
  if ((state.dismissedAt ?? null) !== null) return { refused: 'gone' };
  const held = Array.isArray(question.heldCommands)
    ? question.heldCommands.find(isRecord)
    : null;
  const options = Array.isArray(question.options)
    ? question.options.filter(isRecord).map((option) => option.id)
    : [];
  if (!held || !options.includes(optionId)) return { refused: 'unknown' };
  const habit = planHabitAnswer({ ...input, held, at: capture.createdAt });
  const execution = habit
    ? buildHabitAnswerExecution(habit, {
        captureId: input.captureId,
        questionId,
        now,
        seal: input.seal,
      })
    : null;
  const questionState = {
    ...capture.questionState,
    [questionId]: {
      ...state,
      answeredAt: now,
    },
  };
  const isOpen = Object.values(questionState).some(
    (entry) =>
      entry.answeredAt === null && (entry.dismissedAt ?? null) === null,
  );
  return {
    refused: null,
    habit,
    execution,
    capture: {
      questionState,
      sealed: {
        ...input.opened,
        questions: {
          ...oldQuestions,
          [questionId]: {
            ...question,
            answer: {
              by: input.by,
              at: now,
              turnCaptureId: null,
              shape: question.shape === 'yesNo' ? 'yesNo' : 'pickOne',
              optionId,
              otherText: null,
            },
          },
        },
      },
      status:
        !isOpen && capture.status === 'needsYou' ? 'sorted' : capture.status,
      executionIds: execution
        ? [...capture.executionIds, input.executionId]
        : capture.executionIds,
    },
  };
}
