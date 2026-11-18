import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { PLANNER_COPY } from '@apps/helm/constants';
import type { RestDayKind } from '@apps/helm/engine/restDay';
import type { Energy, Importance, PlanSlot, TaskDue } from '@apps/helm/types';
import {
  DUE_SOON_DAYS,
  formatTaskDue,
  getDueDaysAway,
  getDueSortKey,
  isOverdue,
} from '@apps/helm/utils/taskDue';

export interface PlannerTask {
  id: string;
  title: string;
  due: TaskDue | null;
  importance: Importance | null;
  isUrgent: boolean;
  durationMinutes: number | null;
  energy: Energy | null;
  placeIds: string[];
}

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
}

export interface PlannerResult {
  slots: Record<string, PlanSlot>;
  reasons: Record<string, string>;
  outcome: 'planned' | 'full' | 'late' | 'past' | 'nothing' | 'rest';
}

interface Span {
  startAt: number;
  endAt: number;
}

interface Chosen {
  task: PlannerTask;
  minutes: number;
}

const MINUTE_MS = 60_000;
const BUFFER_MS = 15 * MINUTE_MS;
const ROUND_MS = 5 * MINUTE_MS;
const DEFAULT_MINUTES = 30;
const MAX_SUGGESTIONS = 3;
const MIN_USEFUL_MINUTES = 15;

const getDayKeyAt = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));

const getWindow = (
  input: Pick<
    PlannerInput,
    'dayKey' | 'timeZone' | 'now' | 'dayStartTime' | 'dayEndTime'
  >,
): { state: 'open' | 'past' | 'late'; startAt: number; endAt: number } => {
  const dayStart = zonedDateTimeToEpoch(
    input.dayKey,
    input.dayStartTime,
    input.timeZone,
  );
  const endAt = zonedDateTimeToEpoch(
    input.dayKey,
    input.dayEndTime,
    input.timeZone,
  );
  const todayKey = getDayKeyAt(input.now, input.timeZone);
  if (input.dayKey < todayKey) return { state: 'past', startAt: endAt, endAt };
  const startAt =
    input.dayKey === todayKey
      ? Math.max(dayStart, Math.ceil(input.now / ROUND_MS) * ROUND_MS)
      : dayStart;
  return { state: startAt >= endAt ? 'late' : 'open', startAt, endAt };
};

const getGaps = (window: Span, blocks: Span[]): Span[] => {
  const merged = blocks
    .map((block) => ({
      startAt: Math.max(block.startAt, window.startAt),
      endAt: Math.min(block.endAt, window.endAt),
    }))
    .filter((block) => block.endAt > block.startAt)
    .sort((first, second) => first.startAt - second.startAt);
  const { gaps, cursor } = merged.reduce(
    (state, block) => ({
      gaps:
        block.startAt > state.cursor
          ? [...state.gaps, { startAt: state.cursor, endAt: block.startAt }]
          : state.gaps,
      cursor: Math.max(state.cursor, block.endAt),
    }),
    { gaps: [] as Span[], cursor: window.startAt },
  );
  return cursor < window.endAt
    ? [...gaps, { startAt: cursor, endAt: window.endAt }]
    : gaps;
};

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

const getMinutes = (gaps: Span[]) =>
  gaps.reduce((sum, gap) => sum + (gap.endAt - gap.startAt) / MINUTE_MS, 0);

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
      ? PLANNER_COPY.estimate
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
            at === chosen.at ? { ...gap, startAt: span.endAt } : gap,
          ),
        };
      },
      { placed: [] as { pick: Chosen; span: Span }[], gaps },
    ).placed;

const toPick = (task: PlannerTask): Chosen => ({
  task,
  minutes: task.durationMinutes ?? DEFAULT_MINUTES,
});

const getCandidates = (input: PlannerInput) => {
  const decided = new Set(
    Object.values(input.slots)
      .filter((slot) => slot.status !== 'suggested')
      .map((slot) => slot.taskId),
  );
  return rankTasks(
    input.tasks.filter((task) => !decided.has(task.id)),
    input.timeZone,
    input.now,
    input.currentPlaceId,
  );
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
  const unchanged = (outcome: PlannerResult['outcome']): PlannerResult => ({
    slots: decidedSlots,
    reasons: {},
    outcome,
  });
  if (input.restDay !== null) return unchanged('rest');
  const window = getWindow(input);
  if (window.state !== 'open') return unchanged(window.state);
  const candidates = getCandidates(input);

  if (!input.hasCalendar) {
    const picks = candidates.slice(0, MAX_SUGGESTIONS);
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
    };
  }

  const gaps = getGaps(window, getObstacles(input, null, false));
  const freeMinutes = getMinutes(gaps);
  if (freeMinutes < MIN_USEFUL_MINUTES) return unchanged('full');
  const budget = (freeMinutes * input.fillPercent) / 100;
  const picks = candidates.reduce(
    (state, task) => {
      if (state.picks.length >= MAX_SUGGESTIONS) {
        return state;
      }
      const pick = toPick(task);
      const planned = state.minutes + pick.minutes;
      if (planned > budget) return state;
      const next = [...state.picks, pick];
      return placeAll(gaps, next).length === next.length
        ? { ...state, picks: next, minutes: planned }
        : state;
    },
    { picks: [] as Chosen[], minutes: 0 },
  ).picks;
  const placed = placeAll(gaps, picks).sort(
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
  };
}

/** Openings for one task on a day (Another time pills, Plan it): earliest first, at most `limit`. */
export function findOpenings(
  input: PlannerInput,
  task: PlannerTask,
  limit: number,
): { startAt: number; endAt: number }[] {
  const window = getWindow(input);
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
  const window = getWindow(input);
  if (window.state !== 'open') return [];
  return getGaps(window, input.busy).filter(
    (gap) => gap.endAt - gap.startAt >= minMinutes * MINUTE_MS,
  );
}
