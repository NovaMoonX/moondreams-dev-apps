// Generated from src/apps/helm/engine/planner.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { PLANNER_COPY } from './plannerCopy.js';
import {
  getDayWindow,
  getGapMinutes,
  getGaps,
  type Span,
} from '../nomos/freeTime.js';
import { NOT_SAID_PLACE } from '../nomos/importanceOrder.js';
import type { RestDayKind } from './restDay.js';
import type {
  Energy,
  Importance,
  PatternBucket,
  PlanSlot,
  TaskContext,
  TaskDue,
  TaskEffort,
} from './plannerTypes.js';
import {
  DUE_SOON_DAYS,
  formatTaskDue,
  getDueDaysAway,
  getDueSortKey,
  isOverdue,
} from './taskDue.js';

export interface PlannerTask {
  id: string;
  title: string;
  due: TaskDue | null;
  importance: Importance | null;
  isUrgent: boolean;
  /** Its project's place number in what matters most (a finite number: not said yet and Can wait come after every placed one); null when it has no project. */
  projectPlace?: number | null;
  durationMinutes: number | null;
  energy: Energy | null;
  placeIds: string[];
  /** A care task: a pattern never keeps Helm from placing it. */
  isCare?: boolean;
  projectId?: string | null;
  context?: TaskContext | null;
  /** The break after it; unknown reads as moderate. */
  effort?: TaskEffort | null;
}

export interface FinishedTask {
  projectId: string | null;
  context: TaskContext | null;
  durationMinutes: number | null;
  completedAt: number | null;
}

/** What stands in the way of an aim that doesn't fit: a calendar event by name, or a slot the person kept. */
export type FitBlocker = { kind: 'event'; title: string } | { kind: 'kept' };

export interface BusyBlock {
  startAt: number;
  endAt: number;
  title: string;
}

export interface PlannerInput {
  dayKey: string;
  timeZone: string;
  now: number;
  dayStartTime: string;
  dayEndTime: string;
  fillPercent: number;
  hasCalendar: boolean;
  /** Set when the day follows a night out or a shift and the person hasn't asked for a plan anyway. */
  restDay: RestDayKind | null;
  /** The place the person said they are at right now; tasks linked to it come first among equals. */
  currentPlaceId: string | null;
  busy: BusyBlock[];
  slots: Record<string, PlanSlot>;
  tasks: PlannerTask[];
  /** Weekday day-parts the person accepted leaving empty; other tasks are never suggested into them. */
  avoidBuckets?: Extract<PatternBucket, { kind: 'weekdayPart' }>[];
  /** Tasks the person wants done today, in their order; they are placed before anything else. */
  aimTaskIds: string[];
  /** Finished tasks a length is guessed from. */
  finishedTasks: FinishedTask[];
}

export interface PlannerResult {
  slots: Record<string, PlanSlot>;
  reasons: Record<string, string>;
  outcome: 'planned' | 'full' | 'late' | 'past' | 'nothing' | 'rest';
  /** Aims that did not fit, in the person's order. */
  unplaced: string[];
  /** What would have to move for each unplaced aim to fit; null when nothing would help. */
  blockers: Record<string, FitBlocker | null>;
  /** Aims planned with a guessed length. */
  guessedTaskIds: string[];
}

interface Chosen {
  task: PlannerTask;
  minutes: number;
  breakMinutes: number;
}

const MINUTE_MS = 60_000;
const BUFFER_MS = 15 * MINUTE_MS;
const DEFAULT_MINUTES = 30;
const MAX_SUGGESTIONS = 3;
const MIN_USEFUL_MINUTES = 15;
const BREAK_MINUTES: Record<TaskEffort, number> = {
  light: 5,
  moderate: 15,
  heavy: 30,
};
const GUESS_SAMPLE = 5;

const getMedian = (values: number[]) => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

/** A length for a task with none: the middle of the last few finished tasks in its project, else its context, else 30 minutes. */
export function guessDuration(
  task: Pick<PlannerTask, 'projectId' | 'context'>,
  finishedTasks: FinishedTask[],
): number {
  const recent = finishedTasks
    .filter((done) => done.durationMinutes !== null)
    .sort(
      (first, second) => (second.completedAt ?? 0) - (first.completedAt ?? 0),
    );
  const middleOf = (matches: (done: FinishedTask) => boolean) => {
    const sample = recent.filter(matches).slice(0, GUESS_SAMPLE);
    return sample.length > 0
      ? getMedian(sample.map((done) => done.durationMinutes as number))
      : null;
  };
  return (
    (task.projectId
      ? middleOf((done) => done.projectId === task.projectId)
      : null) ??
    (task.context ? middleOf((done) => done.context === task.context) : null) ??
    DEFAULT_MINUTES
  );
}

/** The line over a day's aims, from the planner's result: which don't fit, and what would have to move. */
export function describeFit(
  aimTitles: Record<string, string>,
  unplacedIds: string[],
  blockers: Record<string, FitBlocker | null> = {},
): string {
  const [firstId] = unplacedIds;
  if (firstId === undefined) return 'These fit.';
  const name = aimTitles[firstId] ?? 'One';
  const subject =
    unplacedIds.length > 1
      ? `“${name}” and ${unplacedIds.length - 1} more`
      : `“${name}”`;
  const blocker = blockers[firstId] ?? null;
  const unless = !blocker
    ? ''
    : blocker.kind === 'event'
      ? ` unless you move “${blocker.title}”`
      : ' unless you move something you kept';
  const lead =
    unplacedIds.length < Object.keys(aimTitles).length ? 'These fit. ' : '';
  const verb = unless ? "doesn't today" : "doesn't fit today";
  return `${lead}${subject} ${unplacedIds.length > 1 ? verb.replace("doesn't", "don't") : verb}${unless}.`;
}

const getObstacles = (
  input: PlannerInput,
  ignoredTaskId: string | null,
  includeSuggested: boolean,
) =>
  [
    ...input.busy,
    ...Object.values(input.slots).filter(
      (slot) =>
        (slot.status === 'kept' ||
          (includeSuggested && slot.status === 'suggested')) &&
        slot.startAt !== null &&
        slot.endAt !== null &&
        slot.taskId !== ignoredTaskId,
    ),
  ].map((block) => ({
    startAt: (block.startAt as number) - BUFFER_MS,
    endAt: (block.endAt as number) + BUFFER_MS,
  }));

const formatLength = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;

const IMPORTANCE_RANK: Record<Importance, number> = {
  must: 0,
  should: 1,
  could: 2,
};

const getDueRank = (task: PlannerTask, timeZone: string, now: number) => {
  if (!task.due) return 3;
  if (isOverdue(task.due, timeZone, now)) return 0;
  const away = getDueDaysAway(task.due, timeZone, now);
  if (away <= 0) return 1;
  return away <= DUE_SOON_DAYS ? 2 : 3;
};

const isHereTask = (task: PlannerTask, currentPlaceId: string | null) =>
  currentPlaceId !== null && task.placeIds.includes(currentPlaceId);

const rankTasks = (
  tasks: PlannerTask[],
  timeZone: string,
  now: number,
  currentPlaceId: string | null,
): PlannerTask[] =>
  tasks
    .map((task, index) => ({
      task,
      index,
      dueRank: getDueRank(task, timeZone, now),
    }))
    .sort(
      (first, second) =>
        Math.min(first.dueRank, 2) - Math.min(second.dueRank, 2) ||
        Number(isHereTask(second.task, currentPlaceId)) -
          Number(isHereTask(first.task, currentPlaceId)) ||
        first.dueRank - second.dueRank ||
        (first.dueRank < 3 && first.task.due && second.task.due
          ? getDueSortKey(first.task.due) - getDueSortKey(second.task.due)
          : 0) ||
        (first.task.importance ? IMPORTANCE_RANK[first.task.importance] : 3) -
          (second.task.importance
            ? IMPORTANCE_RANK[second.task.importance]
            : 3) ||
        (first.task.projectPlace ?? NOT_SAID_PLACE) -
          (second.task.projectPlace ?? NOT_SAID_PLACE) ||
        Number(second.task.isUrgent) - Number(first.task.isUrgent) ||
        first.index - second.index,
    )
    .map(({ task }) => task);

const getDuePhrase = (task: PlannerTask, input: PlannerInput) => {
  if (
    isHereTask(task, input.currentPlaceId) &&
    getDueRank(task, input.timeZone, input.now) > 1
  ) {
    return PLANNER_COPY.home;
  }
  if (task.due) {
    if (isOverdue(task.due, input.timeZone, input.now)) {
      return PLANNER_COPY.overdue;
    }
    const away = getDueDaysAway(task.due, input.timeZone, input.now);
    if (away <= 0) return PLANNER_COPY.dueToday;
    if (away === 1) return PLANNER_COPY.dueTomorrow;
    return PLANNER_COPY.due(formatTaskDue(task.due, input.timeZone, input.now));
  }
  if (task.importance === 'must') return PLANNER_COPY.must;
  if (task.importance === 'should') return PLANNER_COPY.should;
  if (task.importance === 'could') return PLANNER_COPY.could;
  return PLANNER_COPY.worthDoing;
};

const getTimedReason = (pick: Chosen, span: Span, input: PlannerInput) => {
  const length =
    pick.task.durationMinutes === null
      ? PLANNER_COPY.estimateOf(formatLength(pick.minutes))
      : formatLength(pick.minutes);
  const next = input.busy
    .filter(
      (block) =>
        block.startAt >= span.endAt && block.startAt - span.endAt <= BUFFER_MS,
    )
    .sort((first, second) => first.startAt - second.startAt)[0];
  if (next) return PLANNER_COPY.fitsBefore(length, next.title);
  const previous = input.busy
    .filter(
      (block) =>
        block.endAt <= span.startAt && span.startAt - block.endAt <= BUFFER_MS,
    )
    .sort((first, second) => second.endAt - first.endAt)[0];
  if (previous) return PLANNER_COPY.fitsAfter(length, previous.title);
  return `${length} · ${getDuePhrase(pick.task, input)}`;
};

const ENERGY_ORDER: Record<Energy, number> = { high: 0, medium: 1, low: 2 };

/** Where each day-part begins and ends on the clock; the last runs to the habit day's turn at 03:00. */
export const PART_CLOCKS = {
  morning: ['03:00', '11:00'],
  midday: ['11:00', '14:00'],
  afternoon: ['14:00', '18:00'],
  evening: ['18:00', '21:00'],
  bedtime: ['21:00', '03:00'],
} as const;

const getAvoidSpans = (input: PlannerInput): Span[] => {
  const weekday = new Date(`${input.dayKey}T00:00:00Z`).getUTCDay();
  const nextKey = new Date(Date.parse(`${input.dayKey}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (input.avoidBuckets ?? [])
    .filter((bucket) => bucket.weekday === weekday)
    .map(({ part }) => {
      const [from, to] = PART_CLOCKS[part];
      return {
        startAt: zonedDateTimeToEpoch(input.dayKey, from, input.timeZone),
        endAt: zonedDateTimeToEpoch(
          to < from ? nextKey : input.dayKey,
          to,
          input.timeZone,
        ),
      };
    });
};

/** Places picks so a care task may take any gap and every other task stays out of the spans to avoid. */
const placeAvoiding = (gaps: Span[], avoid: Span[], picks: Chosen[]) => {
  if (avoid.length === 0) return placeAll(gaps, picks);
  const care = placeAll(
    gaps,
    picks.filter((pick) => pick.task.isCare),
  );
  const open = gaps.flatMap((gap) =>
    getGaps(gap, [...avoid, ...care.map(({ span }) => span)]),
  );
  return [
    ...care,
    ...placeAll(
      open,
      picks.filter((pick) => !pick.task.isCare),
    ),
  ];
};

const placeAll = (gaps: Span[], picks: Chosen[]) =>
  picks
    .map((pick, index) => ({ pick, index }))
    .sort(
      (first, second) =>
        ENERGY_ORDER[first.pick.task.energy ?? 'medium'] -
          ENERGY_ORDER[second.pick.task.energy ?? 'medium'] ||
        first.index - second.index,
    )
    .reduce(
      (state, { pick }) => {
        const fits = state.gaps
          .map((gap, at) => ({ gap, at }))
          .filter(
            ({ gap }) => gap.endAt - gap.startAt >= pick.minutes * MINUTE_MS,
          );
        const chosen =
          pick.task.energy === 'low' ? fits[fits.length - 1] : fits[0];
        if (!chosen) return state;
        const span = {
          startAt: chosen.gap.startAt,
          endAt: chosen.gap.startAt + pick.minutes * MINUTE_MS,
        };
        return {
          placed: [...state.placed, { pick, span }],
          gaps: state.gaps.map((gap, at) =>
            at === chosen.at
              ? { ...gap, startAt: span.endAt + pick.breakMinutes * MINUTE_MS }
              : gap,
          ),
        };
      },
      { placed: [] as { pick: Chosen; span: Span }[], gaps },
    ).placed;

const toPick = (task: PlannerTask, input: PlannerInput): Chosen => {
  const isAim = input.aimTaskIds.includes(task.id);
  return {
    task,
    minutes:
      task.durationMinutes ??
      (isAim ? guessDuration(task, input.finishedTasks) : DEFAULT_MINUTES),
    breakMinutes: BREAK_MINUTES[task.effort ?? 'moderate'],
  };
};

const getCandidates = (input: PlannerInput) => {
  const decided = new Set(
    Object.values(input.slots)
      .filter((slot) => slot.status !== 'suggested')
      .map((slot) => slot.taskId),
  );
  const open = input.tasks.filter((task) => !decided.has(task.id));
  const aims = input.aimTaskIds.flatMap((id) => {
    const task = open.find((entry) => entry.id === id);
    return task ? [task] : [];
  });
  const aimIds = new Set(aims.map((task) => task.id));
  return {
    aims,
    others: rankTasks(
      open.filter((task) => !aimIds.has(task.id)),
      input.timeZone,
      input.now,
      input.currentPlaceId,
    ),
  };
};

const findBlocker = (
  input: PlannerInput,
  window: Span,
  minutes: number,
): FitBlocker | null => {
  const wide = (block: { startAt: number; endAt: number }) => ({
    startAt: block.startAt - BUFFER_MS,
    endAt: block.endAt + BUFFER_MS,
  });
  const obstacles = [
    ...input.busy.map((block) => ({
      blocker: { kind: 'event', title: block.title } as FitBlocker,
      span: wide(block),
    })),
    ...Object.values(input.slots)
      .filter(
        (slot) =>
          slot.status === 'kept' &&
          slot.startAt !== null &&
          slot.endAt !== null,
      )
      .map((slot) => ({
        blocker: { kind: 'kept' } as FitBlocker,
        span: wide({
          startAt: slot.startAt as number,
          endAt: slot.endAt as number,
        }),
      })),
  ];
  const fitsWithout = (skip: number) =>
    getGaps(
      window,
      obstacles.filter((_, at) => at !== skip).map(({ span }) => span),
    ).some((gap) => gap.endAt - gap.startAt >= minutes * MINUTE_MS);
  if (fitsWithout(-1)) return null;
  return obstacles.find((_, at) => fitsWithout(at))?.blocker ?? null;
};

/** Suggests a few tasks for a day's gaps; kept and Not today slots come back untouched, and a rest day gets no suggestions. */
export function planDay(
  input: PlannerInput,
  makeId: (taskId: string) => string,
): PlannerResult {
  const decidedSlots = Object.fromEntries(
    Object.entries(input.slots).filter(
      ([, slot]) => slot.status !== 'suggested',
    ),
  );
  const { aims, others } = getCandidates(input);
  const guessedOf = (ids: string[]) =>
    aims
      .filter((task) => ids.includes(task.id) && task.durationMinutes === null)
      .map((task) => task.id);
  const unchanged = (outcome: PlannerResult['outcome']): PlannerResult => ({
    slots: decidedSlots,
    reasons: {},
    outcome,
    unplaced: aims.map((task) => task.id),
    blockers: {},
    guessedTaskIds: guessedOf(aims.map((task) => task.id)),
  });
  if (input.restDay !== null) return unchanged('rest');
  const window = getDayWindow(input);
  if (window.state !== 'open') return unchanged(window.state);
  const aimIds = new Set(aims.map((task) => task.id));
  const candidates = [...aims, ...others];

  if (!input.hasCalendar) {
    const picks = [...aims, ...others.slice(0, MAX_SUGGESTIONS)];
    const entries = picks.map((task) => [
      makeId(task.id),
      {
        slot: {
          taskId: task.id,
          startAt: null,
          endAt: null,
          status: 'suggested',
          source: 'nomos',
          decidedAt: null,
          overlapsEventRef: null,
        } satisfies PlanSlot,
        reason: getDuePhrase(task, input),
      },
    ]) as [string, { slot: PlanSlot; reason: string }][];
    return {
      slots: {
        ...decidedSlots,
        ...Object.fromEntries(entries.map(([id, { slot }]) => [id, slot])),
      },
      reasons: Object.fromEntries(
        entries.map(([id, { reason }]) => [id, reason]),
      ),
      outcome: entries.length > 0 ? 'planned' : 'nothing',
      unplaced: [],
      blockers: {},
      guessedTaskIds: guessedOf(aims.map((task) => task.id)),
    };
  }

  const gaps = getGaps(window, getObstacles(input, null, false));
  const avoid = getAvoidSpans(input);
  const freeMinutes = getGapMinutes(gaps);
  if (freeMinutes < MIN_USEFUL_MINUTES) return unchanged('full');
  const budget = (freeMinutes * input.fillPercent) / 100;
  const chosen = candidates.reduce(
    (state, task) => {
      const isAim = aimIds.has(task.id);
      if (!isAim && state.others >= MAX_SUGGESTIONS) return state;
      const pick = toPick(task, input);
      const planned = state.minutes + pick.minutes;
      const next = [...state.picks, pick];
      const fits =
        planned <= budget &&
        placeAvoiding(gaps, avoid, next).length === next.length;
      if (fits) {
        return {
          ...state,
          picks: next,
          minutes: planned,
          others: state.others + (isAim ? 0 : 1),
        };
      }
      return isAim
        ? { ...state, unplaced: [...state.unplaced, task.id] }
        : state;
    },
    {
      picks: [] as Chosen[],
      minutes: 0,
      others: 0,
      unplaced: [] as string[],
    },
  );
  const placed = placeAvoiding(gaps, avoid, chosen.picks).sort(
    (first, second) => first.span.startAt - second.span.startAt,
  );
  const entries = placed.map(({ pick, span }) => ({
    id: makeId(pick.task.id),
    slot: {
      taskId: pick.task.id,
      startAt: span.startAt,
      endAt: span.endAt,
      status: 'suggested',
      source: 'nomos',
      decidedAt: null,
      overlapsEventRef: null,
    } satisfies PlanSlot,
    reason: getTimedReason(pick, span, input),
  }));
  return {
    slots: {
      ...decidedSlots,
      ...Object.fromEntries(entries.map(({ id, slot }) => [id, slot])),
    },
    reasons: Object.fromEntries(entries.map(({ id, reason }) => [id, reason])),
    outcome: entries.length > 0 ? 'planned' : 'nothing',
    unplaced: chosen.unplaced,
    blockers: Object.fromEntries(
      chosen.unplaced.map((id) => [
        id,
        findBlocker(
          input,
          window,
          toPick(aims.find((task) => task.id === id) as PlannerTask, input)
            .minutes,
        ),
      ]),
    ),
    guessedTaskIds: guessedOf(aims.map((task) => task.id)),
  };
}

/** Openings for one task on a day (Another time pills, Plan it): earliest first, at most `limit`. */
export function findOpenings(
  input: PlannerInput,
  task: PlannerTask,
  limit: number,
): { startAt: number; endAt: number }[] {
  const window = getDayWindow(input);
  if (window.state !== 'open') return [];
  const length = (task.durationMinutes ?? DEFAULT_MINUTES) * MINUTE_MS;
  const step = Math.max(length, DEFAULT_MINUTES * MINUTE_MS);
  return getGaps(window, getObstacles(input, task.id, true))
    .flatMap((gap) =>
      Array.from(
        {
          length: Math.max(
            0,
            Math.floor((gap.endAt - gap.startAt - length) / step) + 1,
          ),
        },
        (_, index) => ({
          startAt: gap.startAt + index * step,
          endAt: gap.startAt + index * step + length,
        }),
      ),
    )
    .slice(0, limit);
}

/** Free gaps of at least `minMinutes` between the day's start (or now) and its end, after busy blocks, with no buffers. */
export function findFreeGaps(
  input: Pick<
    PlannerInput,
    'dayKey' | 'timeZone' | 'now' | 'dayStartTime' | 'dayEndTime' | 'busy'
  >,
  minMinutes: number,
): { startAt: number; endAt: number }[] {
  const window = getDayWindow(input);
  if (window.state !== 'open') return [];
  return getGaps(window, input.busy).filter(
    (gap) => gap.endAt - gap.startAt >= minMinutes * MINUTE_MS,
  );
}

export { readFreeMinutes } from '../nomos/freeTime.js';

/** How much of Your day the calendar's busy blocks take, 0 to 1 (a rest day is 1). */
export function readBusyShare(
  input: Pick<
    PlannerInput,
    'dayKey' | 'timeZone' | 'dayStartTime' | 'dayEndTime' | 'busy' | 'restDay'
  >,
): number {
  if (input.restDay !== null) return 1;
  const window = {
    startAt: zonedDateTimeToEpoch(
      input.dayKey,
      input.dayStartTime,
      input.timeZone,
    ),
    endAt: zonedDateTimeToEpoch(input.dayKey, input.dayEndTime, input.timeZone),
  };
  const total = window.endAt - window.startAt;
  return total <= 0
    ? 0
    : 1 - getGapMinutes(getGaps(window, input.busy)) * (MINUTE_MS / total);
}
