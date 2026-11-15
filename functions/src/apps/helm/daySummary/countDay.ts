import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { getDayIn, toKnownZone } from '../nomos/spoken.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Night runs start this long after local midnight. */
export const SUMMARY_START_MINUTES = 15;
/** A person's latest turn must be this old before their day is closed. */
export const SUMMARY_QUIET_MS = 10 * MINUTE_MS;
export const SUMMARY_MAX_ATTEMPTS = 3;
/** The night run looks at a closed day only until this local time; a day it missed is written when it is opened. */
export const SUMMARY_END_MINUTES = 6 * 60;
/** A counted day is tried again no sooner than this, so a held allowance or a missing key is not recounted every run. */
export const SUMMARY_RETRY_MS = 2 * 60 * MINUTE_MS;
/** A turn still marked as being sorted after this long has stalled, and no longer holds the night run back. */
export const SUMMARY_STALLED_MS = 60 * MINUTE_MS;
export const SUMMARY_MAX_CHARS = 220;
/** A summary waiting on its batch is left alone this long; after it, opening the day writes it live. Same value on the device. */
export const SUMMARY_BATCH_WAIT_MS = 6 * 60 * MINUTE_MS;

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

/** The code-written line: the messages sent, then at most three kinds of thing done, biggest first, "and more" for the rest. */
export const toDayLine = (counts: HelmDayCounts) => {
  const clauses = [
    toAddedClause(counts),
    {
      size: counts.tasksDone,
      text: `finished ${plural(counts.tasksDone, 'task', 'tasks')}`,
    },
    {
      size: counts.planned,
      text: `planned ${plural(counts.planned, 'day', 'days')}`,
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
  const messages = `Sent ${plural(counts.messages, 'message', 'messages')}`;
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

export interface SummaryExisting {
  status: string;
  attempts: number;
  writtenAt: number;
  batchId: string | null;
  batchedAt: number | null;
}

export interface SummaryDueInput {
  now: number;
  timeZone: string;
  existing: SummaryExisting | null;
  hasActiveCapture: boolean;
  latestCaptureAt: number | null;
}

/** Yesterday in the person's zone, and whether the night run looks at it now (local time from 00:15 to 06:00). */
export const getSummaryDay = (now: number, timeZone: string) => {
  const zone = toKnownZone(timeZone);
  const today = toDayKeyIn(now, zone);
  const sinceMidnight = now - zonedDateTimeToEpoch(today, '00:00', zone);
  return {
    dayKey: shiftDayKey(today, -1),
    isOpen:
      sinceMidnight >= SUMMARY_START_MINUTES * MINUTE_MS &&
      sinceMidnight < SUMMARY_END_MINUTES * MINUTE_MS,
  };
};

/** Counted and sent to a batch recently enough that its result is still expected. */
export const isWaitingOnBatch = (
  existing: Pick<SummaryExisting, 'batchId' | 'batchedAt'>,
  now: number,
) =>
  existing.batchId !== null &&
  existing.batchedAt !== null &&
  now - existing.batchedAt < SUMMARY_BATCH_WAIT_MS;

export const isSummaryMissing = (
  existing: SummaryExisting | null,
  now: number,
) =>
  existing === null ||
  (existing.status === 'counted' &&
    existing.batchId === null &&
    existing.attempts < SUMMARY_MAX_ATTEMPTS &&
    now - existing.writtenAt >= SUMMARY_RETRY_MS);

/** A turn is still being sorted only while it is fresh; one stuck longer has stalled. */
export const isStillSorting = (
  capture: { status: unknown; createdAt: number },
  now: number,
) =>
  (capture.status === 'received' || capture.status === 'interpreting') &&
  now - capture.createdAt < SUMMARY_STALLED_MS;

/** No turn of the day is still being sorted, and the person's latest turn has gone quiet, so a conversation crossing midnight is finished. */
export const isDayQuiet = (
  input: Pick<SummaryDueInput, 'now' | 'hasActiveCapture' | 'latestCaptureAt'>,
) =>
  !input.hasActiveCapture &&
  (input.latestCaptureAt === null ||
    input.now - input.latestCaptureAt >= SUMMARY_QUIET_MS);

export const isSummaryDue = (input: SummaryDueInput) =>
  getSummaryDay(input.now, input.timeZone).isOpen &&
  isSummaryMissing(input.existing, input.now) &&
  isDayQuiet(input);

const MAX_TITLE_CHARS = 80;

const toTitle = (value: unknown) =>
  typeof value === 'string' && value.trim() !== ''
    ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_CHARS)
    : null;

const readName = (written: Record<string, unknown>) =>
  toTitle(
    written['sealed.title'] ??
      written['sealed.name'] ??
      written.title ??
      written.name,
  );

/** Titles of what one execution made or finished, from its opened effects and their refs. */
export const toEffectTitles = (
  effects: { written?: Record<string, unknown> }[],
  refs: { op: string; collection: string }[],
): string[] =>
  effects.flatMap((effect, index) => {
    const ref = refs[index];
    const written = effect.written ?? {};
    const isMade = ref?.op === 'create';
    const isDone =
      ref?.collection === 'tasks' &&
      ref.op === 'update' &&
      written.status === 'done';
    const title = isMade || isDone ? readName(written) : null;
    return title ? [title] : [];
  });
