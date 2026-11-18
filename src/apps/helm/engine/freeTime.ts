import { dayKeyToMs, shiftDayKeyBy } from '@/utils/cadenceUtils';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';

export interface FitTask {
  id: string;
  projectId: string | null;
  dueDay: number | null;
  minutes: number | null;
  isLatent: boolean;
}

export interface FreeDay {
  minutes: number;
  busyShare: number;
  hasCalendar: boolean;
}

export interface FitThing {
  id: string;
  name: string;
  kind: string;
  status: string;
  isCare: boolean;
  dates: number[];
}

export interface FitInput {
  todayKey: string;
  things: FitThing[];
  tasks: FitTask[];
  freeDay: (dayKey: string) => FreeDay;
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
  isWontFit: boolean;
}

export interface FreeTimeInput {
  dayKey: string;
  timeZone: string;
  now: number;
  dayStartTime: string;
  dayEndTime: string;
  fillPercent: number;
  restDay: string | null;
  busy: { startAt: number; endAt: number }[];
}

export interface Span {
  startAt: number;
  endAt: number;
}

export const DEADLINE_FIT_LIMITS = {
  deadlineWindowDays: 60,
  deadlineSlackMinutes: 60,
  deadlineMinTasks: 3,
  lengthsKnownShare: 0.5,
  defaultTaskMinutes: 30,
} as const;

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const BUFFER_MS = 15 * MINUTE_MS;
const ROUND_MS = 5 * MINUTE_MS;
const MUST_DO_SHOWN = 10;

export const getDayKeyAt = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(at));

export const getDayWindow = (
  input: Pick<
    FreeTimeInput,
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

export const getGaps = (window: Span, blocks: Span[]): Span[] => {
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

export const getGapMinutes = (gaps: Span[]) =>
  gaps.reduce((sum, gap) => sum + (gap.endAt - gap.startAt) / MINUTE_MS, 0);

/** The minutes the planner could fill on a day; 0 on a rest day, a past day or a day with no room. */
export function readFreeMinutes(input: FreeTimeInput): number {
  if (input.restDay !== null) return 0;
  const window = getDayWindow(input);
  if (window.state !== 'open') return 0;
  const gaps = getGaps(
    window,
    input.busy.map((block) => ({
      startAt: block.startAt - BUFFER_MS,
      endAt: block.endAt + BUFFER_MS,
    })),
  );
  return (getGapMinutes(gaps) * input.fillPercent) / 100;
}

export const todayOf = (input: Pick<FitInput, 'todayKey'>) =>
  dayKeyToMs(input.todayKey);

export const minutesOf = (task: FitTask) =>
  task.minutes ?? DEADLINE_FIT_LIMITS.defaultTaskMinutes;

export const readFreeThrough = (input: FitInput, day: number) => {
  const count = Math.max(0, Math.round((day - todayOf(input)) / DAY_MS) + 1);
  const days = Array.from({ length: count }, (_, at) =>
    shiftDayKeyBy(input.todayKey, at),
  ).map(input.freeDay);
  return {
    minutes: days.reduce((sum, one) => sum + one.minutes, 0),
    hasCalendar: days.length > 0 && days.every((one) => one.hasCalendar),
  };
};

/** The work due by each deadline in the next 60 days against the free time to it, earliest date first. */
export function readDeadlineFit(input: FitInput): DeadlineFit[] {
  const LIMITS = DEADLINE_FIT_LIMITS;
  const today = todayOf(input);
  const horizon = today + LIMITS.deadlineWindowDays * DAY_MS;
  const ownDates = (thing: FitThing) =>
    [...new Set(thing.dates)]
      .filter((date) => date >= today && date <= horizon)
      .sort((a, b) => a - b);
  const deadlines = input.things
    .filter((thing) => thing.kind !== 'habit' && thing.status === 'running')
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
      const free = readFreeThrough(input, date);
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

export interface TripFit {
  mustDoFirst: {
    id: string;
    dueDay: number;
    minutes: number;
    isOverdue: boolean;
  }[];
  mustDoCount: number;
  workMinutes: number;
  freeMinutesBefore: number;
  hasCalendar: boolean;
  isWontFit: boolean;
  wouldMove: string[];
  deadlines: (DeadlineFit & { isBecauseAway: boolean })[];
}

/** What a stretch away asks of the days before it: the work due by its last day, the free time until it starts and what falls inside it. The days away count as full. */
export function readTripFit(
  input: FitInput & {
    range: { firstDay: string; lastDay: string };
    events: { id: string; dayKey: string }[];
  },
): TripFit {
  const { firstDay, lastDay } = input.range;
  const last = dayKeyToMs(lastDay);
  const today = todayOf(input);
  const dueTasks = input.tasks.filter(
    (task) => !task.isLatent && task.dueDay !== null && task.dueDay <= last,
  );
  const must = dueTasks
    .flatMap((task) =>
      task.dueDay === null
        ? []
        : [
            {
              id: task.id,
              dueDay: task.dueDay,
              minutes: minutesOf(task),
              isOverdue: task.dueDay < today,
            },
          ],
    )
    .sort((a, b) => a.dueDay - b.dueDay || a.id.localeCompare(b.id));
  const knownCount = dueTasks.filter((task) => task.minutes !== null).length;
  const workMinutes = must.reduce((sum, task) => sum + task.minutes, 0);
  const before = readFreeThrough(
    input,
    dayKeyToMs(shiftDayKeyBy(firstDay, -1)),
  );
  const isAway = (dayKey: string) => dayKey >= firstDay && dayKey <= lastDay;
  const away = readDeadlineFit({
    ...input,
    freeDay: (dayKey) =>
      isAway(dayKey)
        ? { minutes: 0, busyShare: 1, hasCalendar: true }
        : input.freeDay(dayKey),
  });
  const home = readDeadlineFit(input);
  return {
    mustDoFirst: must.slice(0, MUST_DO_SHOWN),
    mustDoCount: must.length,
    workMinutes,
    freeMinutesBefore: before.minutes,
    hasCalendar:
      before.hasCalendar ||
      (firstDay <= input.todayKey && input.freeDay(input.todayKey).hasCalendar),
    isWontFit:
      workMinutes - before.minutes >=
        DEADLINE_FIT_LIMITS.deadlineSlackMinutes &&
      knownCount >= must.length * DEADLINE_FIT_LIMITS.lengthsKnownShare,
    wouldMove: input.events
      .filter((event) => isAway(event.dayKey))
      .map((event) => event.id),
    deadlines: away
      .filter((fit) => fit.isWontFit && !fit.isCare)
      .map((fit) => ({
        ...fit,
        isBecauseAway: !home.some(
          (one) =>
            one.thingId === fit.thingId &&
            one.date === fit.date &&
            one.isWontFit,
        ),
      })),
  };
}
