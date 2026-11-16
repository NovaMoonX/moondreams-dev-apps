import { dayKeyToMs, shiftDayKeyBy, type Weekday } from '@/utils/cadenceUtils';
import { formatDateShortUTC, formatList } from '@/utils/formatUtils';
import {
  DAY_MS,
  GUARDRAIL_LIMITS as LIMITS,
  HELM_COPY,
} from '@apps/helm/constants';
import {
  readImportanceOrder,
  type ImportanceItem,
  type ImportanceOrder,
  type OrderRow,
} from '@apps/helm/engine/importance';
import {
  patternSignature,
  type PatternFinding,
} from '@apps/helm/engine/patterns';
import type {
  Pattern,
  PatternEvidence,
  PatternKind,
  PatternMoment,
  PatternSealed,
} from '@apps/helm/types';

export interface GuardrailThing extends ImportanceItem {
  createdAt: number;
  /** Instants something was done on it: a task finished, a milestone reached, a check ticked (a goal also holds its habits'). */
  activity: number[];
  /** Its target date and its open dated milestones, date-only. */
  dates: number[];
  /** Whether its regular step falls on a day; null for anything but a goal. */
  isStepDue: ((dayKey: string) => boolean) | null;
}

export interface GuardrailTask {
  id: string;
  title: string;
  projectId: string | null;
  /** Date-only day it is due; null when it has no date. */
  dueDay: number | null;
  /** The length the person gave; null when none. */
  minutes: number | null;
  /** Asleep until later: not work yet. */
  isLatent: boolean;
}

export interface FreeDay {
  /** What the planner could fill: Your day less busy time and buffers, at the fill share; 0 on a rest day. */
  minutes: number;
  /** How much of Your day the calendar keeps busy, 0 to 1; a rest day is 1. */
  busyShare: number;
  hasCalendar: boolean;
}

export interface GuardrailInput {
  now: number;
  todayKey: string;
  isLearningOn: boolean;
  /** Every project, goal and habit that is not unreadable, finished and ended ones too. */
  things: GuardrailThing[];
  /** Open tasks. */
  tasks: GuardrailTask[];
  freeDay: (dayKey: string) => FreeDay;
}

export interface GuardrailReason {
  kind: PatternKind;
  evidence: Extract<PatternEvidence, { kind: 'load' }>;
  line: string;
}

export interface GuardrailFinding extends PatternFinding {
  moment: PatternMoment;
  reasons: Pattern['reasons'];
  lines: PatternSealed;
}

export interface GuardrailRecord {
  id: string;
  kind: 'project' | 'goal' | 'habit' | 'task';
}

const REASON_ORDER: PatternKind[] = [
  'deadlineWontFit',
  'starved',
  'tooManyGoals',
  'busyStretch',
];
const REASONS_SHOWN = 3;
const NO_CALENDAR = 'noCalendar';

const todayOf = (input: GuardrailInput) => dayKeyToMs(input.todayKey);

const dayKeys = (input: GuardrailInput, count: number) =>
  Array.from({ length: count }, (_, at) => shiftDayKeyBy(input.todayKey, at));

const spanWords = (minutes: number) => {
  const rounded = Math.round(minutes / 5) * 5;
  return rounded < 60
    ? `${rounded} min`
    : `${Math.floor(rounded / 60)}h${rounded % 60 ? ` ${rounded % 60}m` : ''}`;
};

const isRunning = (thing: GuardrailThing) => thing.status === 'running';

const toOrder = (input: GuardrailInput): ImportanceOrder =>
  readImportanceOrder(input.things, todayOf(input));

const freeThrough = (input: GuardrailInput, day: number) => {
  const count = Math.max(0, Math.round((day - todayOf(input)) / DAY_MS) + 1);
  const days = dayKeys(input, count).map(input.freeDay);
  return {
    minutes: days.reduce((sum, one) => sum + one.minutes, 0),
    hasCalendar: days.length > 0 && days.every((one) => one.hasCalendar),
  };
};

const lastActive = (thing: GuardrailThing) =>
  Math.max(thing.createdAt, ...thing.activity);

const doneSince = (thing: GuardrailThing, since: number) =>
  thing.activity.filter((at) => at >= since).length;

const load = (
  input: GuardrailInput,
  measured: number,
  limit: number,
  unit: 'goals' | 'minutes' | 'days',
  refs: string[],
): GuardrailReason['evidence'] => ({
  kind: 'load',
  measured,
  limit,
  unit,
  asOf: input.now,
  refs,
});

export interface GoalLoad {
  count: number;
  names: string[];
  quiet: { id: string; name: string; days: number } | null;
  reason: GuardrailReason;
}

/** On start, a new goal while 3 or more others are going; daily, 4 or more going and one with nothing done for 21 days. `newId` is the goal being started, or null for the daily read. */
export function readGoalLoad(
  input: GuardrailInput,
  newId: string | null,
): GoalLoad | null {
  const goals = input.things.filter(
    (thing) => thing.kind === 'goal' && isRunning(thing),
  );
  if (newId !== null) {
    const others = goals.filter((goal) => goal.id !== newId);
    const names = others.map((goal) => goal.name);
    return others.length < LIMITS.goalsOnStart
      ? null
      : {
          count: others.length,
          names,
          quiet: null,
          reason: {
            kind: 'tooManyGoals',
            evidence: load(
              input,
              others.length,
              LIMITS.goalsOnStart,
              'goals',
              others.map((goal) => goal.id),
            ),
            line: HELM_COPY.guardrailGoalsReason(
              others.length,
              formatList(names),
            ),
          },
        };
  }
  const quiet = goals
    .map((goal) => ({
      id: goal.id,
      name: goal.name,
      days: Math.floor((input.now - lastActive(goal)) / DAY_MS),
    }))
    .filter((goal) => goal.days >= LIMITS.quietGoalDays)
    .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id))[0];
  return goals.length < LIMITS.goalsDaily || !quiet
    ? null
    : {
        count: goals.length,
        names: goals.map((goal) => goal.name),
        quiet,
        reason: {
          kind: 'tooManyGoals',
          evidence: load(
            input,
            goals.length,
            LIMITS.goalsDaily,
            'goals',
            goals.map((goal) => goal.id),
          ),
          line: HELM_COPY.guardrailQuietGoalReason(
            goals.length,
            quiet.name,
            quiet.days,
          ),
        },
      };
}

export interface DeadlineFit {
  thingId: string;
  name: string;
  date: number;
  taskCount: number;
  workMinutes: number;
  freeMinutes: number;
  hasCalendar: boolean;
  isCare: boolean;
  /** Enough tasks with a length, and short by enough, to say so. */
  isWontFit: boolean;
}

const minutesOf = (task: GuardrailTask) =>
  task.minutes ?? LIMITS.defaultTaskMinutes;

/** For each project or goal with a date in the next 60 days, the work due by it against the free time to it; dates are served earliest first so an earlier deadline takes its share before a later one. */
export function readDeadlineFit(input: GuardrailInput): DeadlineFit[] {
  const today = todayOf(input);
  const horizon = today + LIMITS.deadlineWindowDays * DAY_MS;
  const ownDates = (thing: GuardrailThing) =>
    [...new Set(thing.dates)]
      .filter((date) => date >= today && date <= horizon)
      .sort((a, b) => a - b);
  const deadlines = input.things
    .filter((thing) => thing.kind !== 'habit' && isRunning(thing))
    .flatMap((thing) =>
      ownDates(thing).map((date) => ({ thing, date, own: ownDates(thing) })),
    )
    .sort((a, b) => a.date - b.date || a.thing.id.localeCompare(b.thing.id));
  return deadlines.reduce<{ used: number; fits: DeadlineFit[] }>(
    (state, { thing, date, own }) => {
      const work = input.tasks.filter(
        (task) =>
          task.projectId === thing.id &&
          !task.isLatent &&
          own.find((one) => task.dueDay === null || one >= task.dueDay) ===
            date,
      );
      const minutes = work.reduce((sum, task) => sum + minutesOf(task), 0);
      const free = freeThrough(input, date);
      const known = work.filter((task) => task.minutes !== null).length;
      const shortfall = minutes - Math.max(0, free.minutes - state.used);
      return {
        used: state.used + minutes,
        fits: [
          ...state.fits,
          {
            thingId: thing.id,
            name: thing.name,
            date,
            taskCount: work.length,
            workMinutes: minutes,
            freeMinutes: Math.max(0, free.minutes - state.used),
            hasCalendar: free.hasCalendar,
            isCare: thing.isCare,
            isWontFit:
              shortfall >= LIMITS.deadlineSlackMinutes &&
              work.length >= LIMITS.deadlineMinTasks &&
              known >= work.length * LIMITS.lengthsKnownShare,
          },
        ],
      };
    },
    { used: 0, fits: [] },
  ).fits;
}

const toDeadlineReason = (
  input: GuardrailInput,
  fit: DeadlineFit,
): GuardrailReason => ({
  kind: 'deadlineWontFit',
  evidence: load(input, fit.workMinutes, fit.freeMinutes, 'minutes', [
    fit.thingId,
    String(fit.date),
    ...(fit.hasCalendar ? [] : [NO_CALENDAR]),
  ]),
  line: HELM_COPY.guardrailDeadlineReason(
    fit.name,
    fit.taskCount,
    formatDateShortUTC(fit.date),
    spanWords(fit.workMinutes),
    spanWords(fit.freeMinutes),
    fit.hasCalendar,
  ),
});

/** The deadline that won't fit and is not a care item's, the one most over first. */
const readWontFit = (input: GuardrailInput, fits: DeadlineFit[]) =>
  fits
    .filter((fit) => fit.isWontFit && !fit.isCare)
    .sort(
      (a, b) =>
        b.workMinutes - b.freeMinutes - (a.workMinutes - a.freeMinutes) ||
        a.date - b.date,
    )
    .map((fit) => ({ fit, reason: toDeadlineReason(input, fit) }))[0] ?? null;

const rowOf = (order: ImportanceOrder, id: string) =>
  [...order.inOrder, ...order.notSaid, ...order.canWait].find(
    (row) => row.id === id,
  ) ?? null;

/** Whether `a` sits above `b` in what matters most: placed above unplaced above Can wait, and among the unplaced the nearer date. Equal places are side by side, so neither is above. */
export function isAbove(a: OrderRow, b: OrderRow): boolean {
  if (a.group === 'inOrder')
    return b.group !== 'inOrder' || (a.rank ?? 0) > (b.rank ?? 0);
  if (a.group === 'notSaid')
    return (
      b.group === 'canWait' ||
      (b.group === 'notSaid' &&
        a.date !== null &&
        (b.date === null || a.date < b.date))
    );
  return b.group === 'canWait' && (a.rank ?? 0) > (b.rank ?? 0);
}

export interface Starved {
  starvedId: string;
  starvedName: string;
  tookId: string;
  days: number;
}

/** Something placed above had nothing done for 14 days while something below it had 3 or more; nothing is starved when nothing is placed and no dates separate them. */
export function readStarved(input: GuardrailInput): Starved | null {
  const order = toOrder(input);
  const since = input.now - LIMITS.starvedDays * DAY_MS;
  const listed = [...order.inOrder, ...order.notSaid, ...order.canWait].flatMap(
    (row) => {
      const thing = input.things.find((one) => one.id === row.id);
      return thing && isRunning(thing) && !thing.isCare ? [{ row, thing }] : [];
    },
  );
  return (
    listed
      .filter(
        ({ thing }) =>
          thing.createdAt <= since && doneSince(thing, since) === 0,
      )
      .flatMap(({ row, thing }) => {
        const took = listed
          .filter(
            (other) =>
              isAbove(row, other.row) &&
              doneSince(other.thing, since) >= LIMITS.starvedOtherMin,
          )
          .sort(
            (a, b) =>
              doneSince(b.thing, since) - doneSince(a.thing, since) ||
              a.thing.id.localeCompare(b.thing.id),
          )[0];
        return took
          ? [
              {
                starvedId: thing.id,
                starvedName: thing.name,
                tookId: took.thing.id,
                days: Math.floor((input.now - lastActive(thing)) / DAY_MS),
              },
            ]
          : [];
      })[0] ?? null
  );
}

const toStarvedReason = (
  input: GuardrailInput,
  starved: Starved,
): GuardrailReason => ({
  kind: 'starved',
  evidence: load(input, starved.days, LIMITS.starvedDays, 'days', [
    starved.starvedId,
    starved.tookId,
  ]),
  line: HELM_COPY.guardrailStarvedReason(starved.starvedName, starved.days),
});

export interface BusyStretch {
  from: number;
  to: number;
  fullDays: number;
  fullKeys: string[];
}

/** Over the next 14 days, 3 full days in a row or 5 in all, a full day being one the calendar keeps at least three-quarters busy (a rest day is full). */
export function readBusyStretch(input: GuardrailInput): BusyStretch | null {
  const keys = dayKeys(input, LIMITS.busyWindowDays);
  const full = keys.map(
    (key) => input.freeDay(key).busyShare >= LIMITS.busyDayShare,
  );
  const runs = full.reduce<{ at: number; length: number }[]>(
    (found, isFull, at) =>
      !isFull
        ? found
        : full[at - 1]
          ? [
              ...found.slice(0, -1),
              {
                ...found[found.length - 1],
                length: found[found.length - 1].length + 1,
              },
            ]
          : [...found, { at, length: 1 }],
    [],
  );
  const run = runs.find((one) => one.length >= LIMITS.busyRun);
  const fullKeys = keys.filter((_, at) => full[at]);
  if (run) {
    const runKeys = keys.slice(run.at, run.at + run.length);
    return {
      from: dayKeyToMs(runKeys[0]),
      to: dayKeyToMs(runKeys[runKeys.length - 1]),
      fullDays: run.length,
      fullKeys: runKeys,
    };
  }
  return fullKeys.length >= LIMITS.busyTotal
    ? {
        from: dayKeyToMs(fullKeys[0]),
        to: dayKeyToMs(fullKeys[fullKeys.length - 1]),
        fullDays: fullKeys.length,
        fullKeys,
      }
    : null;
}

const toBusyReason = (
  input: GuardrailInput,
  stretch: BusyStretch,
  step: { name: string; days: number } | null,
): GuardrailReason => ({
  kind: 'busyStretch',
  evidence: load(input, stretch.fullDays, LIMITS.busyTotal, 'days', [
    String(stretch.from),
    String(stretch.to),
  ]),
  line: step
    ? HELM_COPY.guardrailBusyStepReason(
        step.name,
        step.days,
        formatDateShortUTC(stretch.to),
      )
    : HELM_COPY.guardrailBusyReason(
        stretch.fullDays,
        formatDateShortUTC(stretch.to),
      ),
});

/** Two reasons of different kinds at once, or one deadline that won't fit. */
export const meetsGuardrailBar = (reasons: { kind: PatternKind }[]) =>
  new Set(reasons.map((reason) => reason.kind)).size >= 2 ||
  reasons.some((reason) => reason.kind === 'deadlineWontFit');

const sortReasons = (reasons: GuardrailReason[]) =>
  [...reasons]
    .sort((a, b) => REASON_ORDER.indexOf(a.kind) - REASON_ORDER.indexOf(b.kind))
    .slice(0, REASONS_SHOWN);

/** What a guardrail may offer to pause, lowest-placed first: running, never health or care, never the first place in what matters most, never anything above what is starved, never anything with a date or dated milestone within 14 days. */
export function readNameable(
  input: GuardrailInput,
  options: { starvedId: string | null; leaveOut: string[] },
): GuardrailThing[] {
  const today = todayOf(input);
  const order = toOrder(input);
  const listed = [...order.inOrder, ...order.notSaid, ...order.canWait];
  const starvedRow =
    options.starvedId === null ? null : rowOf(order, options.starvedId);
  return [...listed].reverse().flatMap((row) => {
    const thing = input.things.find((one) => one.id === row.id);
    const isFirst = row.group === 'inOrder' && row.position === 1;
    return thing &&
      isRunning(thing) &&
      !thing.isCare &&
      !isFirst &&
      !options.leaveOut.includes(thing.id) &&
      !(
        row.date !== null &&
        row.date <= today + LIMITS.nearDeadlineDays * DAY_MS
      ) &&
      !(starvedRow !== null && !isAbove(starvedRow, row))
      ? [thing]
      : [];
  });
}

/** The lowest-placed thing a guardrail may name, or null when none is eligible. */
export const pickNamed = (
  input: GuardrailInput,
  options: { starvedId: string | null; leaveOut: string[] },
) => readNameable(input, options)[0] ?? null;

const isGateOpen = (input: GuardrailInput) => {
  const firstAt = input.things
    .filter((thing) => thing.kind !== 'project')
    .reduce<number | null>(
      (first, thing) =>
        first === null || thing.createdAt < first ? thing.createdAt : first,
      null,
    );
  return (
    input.isLearningOn &&
    firstAt !== null &&
    input.now - firstAt >= LIMITS.firstDaysQuiet * DAY_MS
  );
};

const dayAfter = (day: number) => day + DAY_MS;

/** The day a hold or pause ends: the day after the busy stretch or the deadline the reasons name, the later one; null (until picked back up) when none names a date. */
const readUntil = (reasons: GuardrailReason[]) => {
  const dates = reasons.flatMap((reason) =>
    reason.kind === 'busyStretch'
      ? [Number(reason.evidence.refs[1])]
      : reason.kind === 'deadlineWontFit'
        ? [Number(reason.evidence.refs[1])]
        : [],
  );
  return dates.length === 0 ? null : dayAfter(Math.max(...dates));
};

const toGuardrail = (
  input: GuardrailInput,
  subject: GuardrailThing,
  reasons: GuardrailReason[],
  options: { moment: PatternMoment; started: GuardrailThing | null },
): GuardrailFinding => {
  const shown = sortReasons(reasons);
  const [first] = shown;
  const until = readUntil(shown);
  const busy = shown.find((reason) => reason.kind === 'busyStretch');
  const isHold = options.started?.id === subject.id;
  const date = until === null ? null : formatDateShortUTC(until);
  const subjectRef = {
    collection:
      subject.kind === 'habit' ? ('habits' as const) : ('projects' as const),
    id: subject.id,
    windowId: null,
    otherId: options.started?.id ?? null,
  };
  const bucket = busy
    ? {
        kind: 'stretch' as const,
        from: Number(busy.evidence.refs[0]),
        to: Number(busy.evidence.refs[1]),
      }
    : { kind: 'none' as const };
  const lines = shown.map((reason) => reason.line);
  return {
    kind: first.kind,
    subject: subjectRef,
    bucket,
    signature: patternSignature({
      kind: first.kind,
      subject: subjectRef,
      bucket: { kind: 'none' },
    }),
    parts: [],
    evidence: first.evidence,
    effect: {
      kind: 'pause',
      collection: subjectRef.collection,
      id: subject.id,
      until,
    },
    handling: 'suggest',
    isCare: false,
    tags: [],
    linkedTo: null,
    lastEvidenceAt: input.now,
    moment: options.moment,
    reasons: shown.map(({ kind, evidence }) => ({ kind, evidence })),
    lines: {
      statement: !options.started
        ? HELM_COPY.guardrailPauseStatement(subject.name)
        : isHold
          ? HELM_COPY.guardrailHoldStatement(subject.name, date)
          : HELM_COPY.guardrailHoldOtherStatement(
              subject.name,
              options.started.name,
            ),
      evidenceLine: lines[0],
      reasonLine: lines.join('\n'),
    },
  };
};

const withoutThing = (input: GuardrailInput, id: string): GuardrailInput => ({
  ...input,
  things: input.things.filter((thing) => thing.id !== id),
  tasks: input.tasks.filter((task) => task.projectId !== id),
});

/** A task with a length whose own date can't be met: the work due by then, with its own, is more than the free time to it by 60 minutes. */
function checkTask(
  taskId: string,
  input: GuardrailInput,
): GuardrailFinding | null {
  const today = todayOf(input);
  const task = input.tasks.find((one) => one.id === taskId);
  if (
    !task ||
    task.isLatent ||
    task.minutes === null ||
    task.dueDay === null ||
    task.dueDay < today ||
    task.dueDay > today + LIMITS.deadlineWindowDays * DAY_MS
  )
    return null;
  const dueDay = task.dueDay;
  const work = input.tasks
    .filter(
      (one) => !one.isLatent && one.dueDay !== null && one.dueDay <= dueDay,
    )
    .reduce((sum, one) => sum + minutesOf(one), 0);
  const free = freeThrough(input, dueDay);
  if (work - free.minutes < LIMITS.deadlineSlackMinutes) return null;
  const line = HELM_COPY.guardrailTaskReason(
    formatDateShortUTC(dueDay),
    spanWords(work),
    spanWords(free.minutes),
  );
  const evidence = load(input, work, free.minutes, 'minutes', [
    task.id,
    String(dueDay),
    ...(free.hasCalendar ? [] : [NO_CALENDAR]),
  ]);
  const subject = {
    collection: 'tasks' as const,
    id: task.id,
    windowId: null,
    otherId: task.id,
  };
  return {
    kind: 'deadlineWontFit',
    subject,
    bucket: { kind: 'none' },
    signature: patternSignature({
      kind: 'deadlineWontFit',
      subject,
      bucket: { kind: 'none' },
    }),
    parts: [],
    evidence,
    effect: { kind: 'none' },
    handling: 'suggest',
    isCare: false,
    tags: [],
    linkedTo: null,
    lastEvidenceAt: input.now,
    moment: 'onStart',
    reasons: [{ kind: 'deadlineWontFit', evidence }],
    lines: {
      statement: HELM_COPY.guardrailTaskStatement(
        HELM_COPY.habitWeekdaysLong[new Date(dueDay).getUTCDay() as Weekday],
      ),
      evidenceLine: line,
      reasonLine: line,
    },
  };
}

/** What starting something says, at the moment it is made: at most one guardrail, never for health or care, and nothing before the gate (7 days of use, learning on). */
export function checkOnStart(
  record: GuardrailRecord,
  input: GuardrailInput,
): GuardrailFinding | null {
  if (!isGateOpen(input)) return null;
  if (record.kind === 'task') return checkTask(record.id, input);
  const started = input.things.find((thing) => thing.id === record.id);
  if (!started || started.isCare || !isRunning(started)) return null;
  const order = toOrder(input);
  const startedRow = rowOf(order, started.id);
  const goals =
    started.kind === 'goal' ? readGoalLoad(input, started.id) : null;
  const stretch = readBusyStretch(input);
  const starved = readStarved(input);
  const starvedRow = starved === null ? null : rowOf(order, starved.starvedId);
  const isBelowStarved =
    starved !== null &&
    starvedRow !== null &&
    startedRow !== null &&
    isAbove(starvedRow, startedRow);
  const before = readDeadlineFit(withoutThing(input, started.id));
  const pushed = readWontFit(
    input,
    readDeadlineFit(input).filter(
      (fit) =>
        !before.some(
          (old) =>
            old.thingId === fit.thingId &&
            old.date === fit.date &&
            old.isWontFit,
        ),
    ),
  );
  const reasons: GuardrailReason[] = [
    ...(pushed ? [pushed.reason] : []),
    ...(isBelowStarved && starved ? [toStarvedReason(input, starved)] : []),
    ...(goals ? [goals.reason] : []),
    ...(stretch && todayOf(input) <= stretch.to
      ? [toBusyReason(input, stretch, null)]
      : []),
  ];
  if (!meetsGuardrailBar(reasons)) return null;
  const subject = pickNamed(input, {
    starvedId: isBelowStarved && starved ? starved.starvedId : null,
    leaveOut: pushed ? [pushed.fit.thingId] : [],
  });
  return subject
    ? toGuardrail(input, subject, reasons, { moment: 'onStart', started })
    : null;
}

/** The daily read: at most one guardrail, the strongest reasons for the lowest-placed thing that may be named. */
export function checkDaily(input: GuardrailInput): GuardrailFinding | null {
  if (!isGateOpen(input)) return null;
  const goals = readGoalLoad(input, null);
  const wontFit = readWontFit(input, readDeadlineFit(input));
  const starved = readStarved(input);
  const stretch = readBusyStretch(input);
  const step =
    stretch === null
      ? null
      : (input.things
          .filter(
            (thing) =>
              thing.kind === 'goal' &&
              isRunning(thing) &&
              !thing.isCare &&
              thing.isStepDue !== null,
          )
          .map((thing) => ({
            name: thing.name,
            days: stretch.fullKeys.filter((key) => thing.isStepDue?.(key))
              .length,
          }))
          .find((one) => one.days > 0) ?? null);
  const reasons: GuardrailReason[] = [
    ...(wontFit ? [wontFit.reason] : []),
    ...(starved ? [toStarvedReason(input, starved)] : []),
    ...(goals ? [goals.reason] : []),
    ...(stretch && step ? [toBusyReason(input, stretch, step)] : []),
  ];
  if (!meetsGuardrailBar(reasons)) return null;
  const named = readNameable(input, {
    starvedId: starved?.starvedId ?? null,
    leaveOut: wontFit ? [wontFit.fit.thingId] : [],
  });
  const subject =
    named.find((thing) => thing.id === goals?.quiet?.id) ?? named[0] ?? null;
  return subject
    ? toGuardrail(input, subject, reasons, { moment: 'daily', started: null })
    : null;
}
