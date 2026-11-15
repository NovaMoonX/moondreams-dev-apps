import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { getDayIn, toKnownZone } from '../nomos/spoken.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Night runs start this long after local midnight. */
export const SUMMARY_START_MINUTES = 15;
/** A person's latest turn must be this old before their day is closed. */
export const SUMMARY_QUIET_MS = 10 * MINUTE_MS;
export const SUMMARY_MAX_ATTEMPTS = 3;
export const SUMMARY_MAX_CHARS = 220;

export interface HelmDayCounts {
  messages: number;
  tasksAdded: number;
  keyDatesAdded: number;
  notesAdded: number;
  factsAdded: number;
  peopleAdded: number;
  placesAdded: number;
  tasksDone: number;
  planned: number;
  answered: number;
  dismissed: number;
}

export interface DayCapture {
  createdAt: number;
  medium: string | null;
  turnLeadId: string | null;
  dismissedAt: number | null;
  questionState: Record<
    string,
    { answeredAt: number | null; dismissedAt: number | null }
  >;
}

export interface DayExecution {
  createdAt: number;
  state: string;
  category: string;
  undoneByExecutionId: string | null;
  /** Made for an outside assistant's turn. */
  isOutside: boolean;
  effectRefs: { op: string; collection: string }[];
}

interface DayBounds {
  dayStart: number;
  dayEnd: number;
}

const NO_COUNTS: HelmDayCounts = {
  messages: 0,
  tasksAdded: 0,
  keyDatesAdded: 0,
  notesAdded: 0,
  factsAdded: 0,
  peopleAdded: 0,
  placesAdded: 0,
  tasksDone: 0,
  planned: 0,
  answered: 0,
  dismissed: 0,
};

const ADDED_KEY: Record<string, keyof HelmDayCounts> = {
  tasks: 'tasksAdded',
  keyDates: 'keyDatesAdded',
  notes: 'notesAdded',
  topics: 'notesAdded',
  procedures: 'notesAdded',
  facts: 'factsAdded',
  who: 'peopleAdded',
  places: 'placesAdded',
};

const toDayKey = (utcMidnight: number) =>
  new Date(utcMidnight).toISOString().slice(0, 10);

/** The calendar day an instant falls on in a zone, "YYYY-MM-DD". */
export const toDayKeyIn = (at: number, timeZone: string) =>
  toDayKey(getDayIn(at, toKnownZone(timeZone)));

export const shiftDayKey = (dayKey: string, days: number) =>
  toDayKey(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS);

export const isDayKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  toDayKey(Date.parse(`${value}T00:00:00Z`)) === value;

/** Local midnight to the next local midnight in the person's zone, so a daylight-saving day is 23 or 25 hours. */
export const getDayBounds = (dayKey: string, timeZone: string): DayBounds => {
  const zone = toKnownZone(timeZone);
  return {
    dayStart: zonedDateTimeToEpoch(dayKey, '00:00', zone),
    dayEnd: zonedDateTimeToEpoch(shiftDayKey(dayKey, 1), '00:00', zone),
  };
};

const isIn = (at: number | null, { dayStart, dayEnd }: DayBounds) =>
  at !== null && at >= dayStart && at < dayEnd;

/** What happened on one day, each item counted on the day it happened; an outside assistant's turns, an undone or failed execution and an undo itself count for nothing. */
export const countHelmDay = (input: {
  captures: DayCapture[];
  executions: DayExecution[];
  tasks: { completedAt: number | null }[];
  dayStart: number;
  dayEnd: number;
}): HelmDayCounts => {
  const bounds = { dayStart: input.dayStart, dayEnd: input.dayEnd };
  const own = input.captures.filter((capture) => capture.medium !== 'mcp');
  const questions = own.flatMap((capture) =>
    Object.values(capture.questionState ?? {}),
  );
  const done = input.executions
    .filter(
      (execution) =>
        isIn(execution.createdAt, bounds) &&
        !execution.isOutside &&
        execution.state === 'succeeded' &&
        execution.category !== 'undo' &&
        execution.undoneByExecutionId === null,
    )
    .reduce<HelmDayCounts>(
      (counts, execution) => ({
        ...execution.effectRefs.reduce((acc, ref) => {
          const key = ref.op === 'create' ? ADDED_KEY[ref.collection] : null;
          return key ? { ...acc, [key]: acc[key] + 1 } : acc;
        }, counts),
        planned: counts.planned + (execution.category === 'plan' ? 1 : 0),
      }),
      NO_COUNTS,
    );
  return {
    ...done,
    messages: own.filter(
      (capture) =>
        capture.turnLeadId === null && isIn(capture.createdAt, bounds),
    ).length,
    tasksDone: input.tasks.filter((task) => isIn(task.completedAt, bounds))
      .length,
    answered: questions.filter(
      (question) => isIn(question.answeredAt, bounds) && !question.dismissedAt,
    ).length,
    dismissed:
      questions.filter((question) => isIn(question.dismissedAt, bounds))
        .length +
      own.filter((capture) => isIn(capture.dismissedAt, bounds)).length,
  };
};

export const isEmptyDay = (counts: HelmDayCounts) =>
  Object.values(counts).every((count) => count === 0);

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const joinAnd = (parts: string[]) =>
  parts.length <= 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

const MAX_CLAUSES = 3;

const toAddedClause = (counts: HelmDayCounts) => {
  const kinds = (
    [
      [counts.tasksAdded, 'task', 'tasks'],
      [counts.keyDatesAdded, 'key date', 'key dates'],
      [counts.notesAdded, 'note', 'notes'],
      [counts.factsAdded, 'fact', 'facts'],
      [counts.peopleAdded, 'person', 'people'],
      [counts.placesAdded, 'place', 'places'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .sort((a, b) => b[0] - a[0]);
  return {
    size: kinds.reduce((sum, [count]) => sum + count, 0),
    text: `added ${joinAnd(
      kinds.map(([count, one, many]) =>
        count === 1 ? `a ${one}` : `${count} ${many}`,
      ),
    )}`,
  };
};

/** The code-written line: the messages, then at most three kinds of thing done, biggest first, "and more" for the rest. */
export const toDayLine = (counts: HelmDayCounts) => {
  const clauses = [
    toAddedClause(counts),
    {
      size: counts.tasksDone,
      text: `finished ${plural(counts.tasksDone, 'task', 'tasks')}`,
    },
    {
      size: counts.planned,
      text: `made ${plural(counts.planned, 'plan', 'plans')}`,
    },
    {
      size: counts.answered,
      text: `answered ${plural(counts.answered, 'question', 'questions')}`,
    },
    {
      size: counts.dismissed,
      text: `dismissed ${plural(counts.dismissed, 'item', 'items')}`,
    },
  ]
    .filter((clause) => clause.size > 0)
    .sort((a, b) => b.size - a.size);
  const shown = clauses.slice(0, MAX_CLAUSES).map((clause) => clause.text);
  const things = `${shown.join(', ')}${clauses.length > MAX_CLAUSES ? ' and more' : ''}`;
  if (counts.messages === 0) {
    return `${things.charAt(0).toUpperCase()}${things.slice(1)}`;
  }
  const messages = plural(counts.messages, 'message', 'messages');
  return things === '' ? messages : `${messages} · ${things}`;
};

/** The model's sentence, refused (so the code line stands) when it speaks as "I", carries a link, markup or an emoji, runs long, or names a number that is not one of the counts. */
export const readDaySummary = (value: unknown, counts: HelmDayCounts) => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text === '' || text.length > SUMMARY_MAX_CHARS) return null;
  if (/\b(i|i'm|i've|i'll|i'd|me|my|we|our)\b/i.test(text)) return null;
  if (/:\/\/|www\.|[*_#`[\]<>]|\p{Extended_Pictographic}/u.test(text)) {
    return null;
  }
  const known = new Set(Object.values(counts).map(String));
  return (text.match(/\d+/g) ?? []).every((number) => known.has(number))
    ? text
    : null;
};

export interface SummaryDueInput {
  now: number;
  timeZone: string;
  existing: { status: string; attempts: number } | null;
  hasActiveCapture: boolean;
  latestCaptureAt: number | null;
}

/** Yesterday in the person's zone, and whether the night run may start on it (local time 00:15 or later). */
export const getSummaryDay = (now: number, timeZone: string) => {
  const zone = toKnownZone(timeZone);
  const today = toDayKeyIn(now, zone);
  return {
    dayKey: shiftDayKey(today, -1),
    isStarted:
      now - zonedDateTimeToEpoch(today, '00:00', zone) >=
      SUMMARY_START_MINUTES * MINUTE_MS,
  };
};

export const isSummaryMissing = (existing: SummaryDueInput['existing']) =>
  existing === null ||
  (existing.status === 'counted' && existing.attempts < SUMMARY_MAX_ATTEMPTS);

/** No turn of the day is still being sorted, and the person's latest turn has gone quiet, so a conversation crossing midnight is finished. */
export const isDayQuiet = (
  input: Pick<SummaryDueInput, 'now' | 'hasActiveCapture' | 'latestCaptureAt'>,
) =>
  !input.hasActiveCapture &&
  (input.latestCaptureAt === null ||
    input.now - input.latestCaptureAt >= SUMMARY_QUIET_MS);

export const isSummaryDue = (input: SummaryDueInput) =>
  getSummaryDay(input.now, input.timeZone).isStarted &&
  isSummaryMissing(input.existing) &&
  isDayQuiet(input);
