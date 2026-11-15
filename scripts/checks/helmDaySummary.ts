import assert from 'node:assert/strict';

import { zonedDateTimeToEpoch } from '../../functions/src/notifications/zonedTime.ts';
import {
  countHelmDay,
  getDayBounds,
  getSummaryDay,
  isSummaryDue,
  readDaySummary,
  toDayLine,
  type DayCapture,
  type DayExecution,
  type HelmDayCounts,
} from '../../functions/src/apps/helm/daySummary/countDay.ts';

const NY = 'America/New_York';
const MINUTE = 60_000;
const ZERO: HelmDayCounts = {
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
const counts = (patch: Partial<HelmDayCounts>): HelmDayCounts => ({
  ...ZERO,
  ...patch,
});

const capture = (patch: Partial<DayCapture>): DayCapture => ({
  createdAt: 0,
  medium: 'web',
  turnLeadId: null,
  dismissedAt: null,
  questionState: {},
  ...patch,
});
const execution = (patch: Partial<DayExecution>): DayExecution => ({
  createdAt: 0,
  state: 'succeeded',
  category: 'organize',
  undoneByExecutionId: null,
  isOutside: false,
  effectRefs: [{ op: 'create', collection: 'tasks' }],
  ...patch,
});

// Counting, on a plain day in UTC.
const utc = getDayBounds('2026-11-09', 'UTC');
const at = utc.dayStart + 60 * MINUTE;
const count = (input: {
  captures?: DayCapture[];
  executions?: DayExecution[];
  tasks?: { completedAt: number | null }[];
}) =>
  countHelmDay({
    captures: [],
    executions: [],
    tasks: [],
    ...input,
    ...utc,
  });

assert.deepEqual(count({}), ZERO);
assert.equal(
  count({
    captures: [
      capture({ createdAt: at }),
      capture({ createdAt: at, turnLeadId: 'lead-1' }),
      capture({ createdAt: at, medium: 'mcp' }),
      capture({ createdAt: utc.dayEnd }),
      capture({ createdAt: utc.dayStart - 1 }),
    ],
  }).messages,
  1,
  'a message counts for a lead of the day on the web; joined, outside and neighbouring days do not',
);
assert.equal(
  count({ captures: [capture({ createdAt: at, medium: undefined as never })] })
    .messages,
  1,
  'a turn from before the medium field is the person own',
);
assert.deepEqual(
  count({
    executions: [
      execution({ createdAt: at }),
      execution({ createdAt: at, state: 'failed' }),
      execution({ createdAt: at, undoneByExecutionId: 'e2' }),
      execution({ createdAt: at, category: 'undo' }),
      execution({ createdAt: at, isOutside: true }),
      execution({ createdAt: utc.dayEnd }),
      execution({
        createdAt: at,
        effectRefs: [
          { op: 'create', collection: 'keyDates' },
          { op: 'create', collection: 'notes' },
          { op: 'create', collection: 'topics' },
          { op: 'create', collection: 'procedures' },
          { op: 'create', collection: 'facts' },
          { op: 'create', collection: 'who' },
          { op: 'create', collection: 'places' },
          { op: 'update', collection: 'tasks' },
          { op: 'delete', collection: 'tasks' },
        ],
      }),
      execution({ createdAt: at, category: 'plan', effectRefs: [] }),
    ],
  }),
  counts({
    tasksAdded: 1,
    keyDatesAdded: 1,
    notesAdded: 3,
    factsAdded: 1,
    peopleAdded: 1,
    placesAdded: 1,
    planned: 1,
  }),
  'only succeeded, not undone, not undo, not outside executions count, and only creates',
);
assert.deepEqual(
  count({
    captures: [
      capture({
        createdAt: utc.dayStart - 5,
        questionState: {
          a: { answeredAt: at, dismissedAt: null },
          b: { answeredAt: at, dismissedAt: at },
          c: { answeredAt: null, dismissedAt: null },
          d: { answeredAt: utc.dayEnd, dismissedAt: null },
        },
      }),
      capture({ createdAt: utc.dayStart - 5, dismissedAt: at }),
      capture({ createdAt: utc.dayStart - 5, dismissedAt: at, medium: 'mcp' }),
    ],
    tasks: [
      { completedAt: at },
      { completedAt: null },
      { completedAt: utc.dayEnd },
    ],
  }),
  counts({ answered: 1, dismissed: 2, tasksDone: 1 }),
  'answers, dismissals and finished tasks count on the day they happened',
);

// A conversation across midnight splits by createdAt, including on a daylight-saving day.
[
  ['2026-03-07', '2026-03-08', '2026-03-09'],
  ['2026-10-31', '2026-11-01', '2026-11-02'],
].forEach(([before, middle, after]) => {
  const bounds = getDayBounds(middle, NY);
  const hours = (bounds.dayEnd - bounds.dayStart) / (60 * MINUTE);
  assert.equal(hours, middle === '2026-03-08' ? 23 : 25, `${middle} length`);
  const late = zonedDateTimeToEpoch(middle, '23:50', NY);
  const early = zonedDateTimeToEpoch(after, '00:10', NY);
  const captures = [
    capture({ createdAt: late }),
    capture({ createdAt: early }),
  ];
  const of = (day: string) =>
    countHelmDay({
      captures,
      executions: [],
      tasks: [],
      ...getDayBounds(day, NY),
    }).messages;
  assert.equal(of(middle), 1, `${middle} keeps its own message`);
  assert.equal(of(after), 1, `${after} gets the later one`);
  assert.equal(of(before), 0, `${before} gets none`);
});

// The code line.
assert.equal(
  toDayLine(
    counts({
      messages: 8,
      tasksAdded: 2,
      keyDatesAdded: 1,
      tasksDone: 1,
      answered: 1,
    }),
  ),
  '8 messages · added 2 tasks and a key date, finished 1 task, answered 1 question',
);
assert.equal(toDayLine(counts({ messages: 3 })), '3 messages');
assert.equal(toDayLine(counts({ messages: 1 })), '1 message');
assert.equal(
  toDayLine(counts({ messages: 1, tasksAdded: 1, answered: 1 })),
  '1 message · added a task, answered 1 question',
);
assert.equal(
  toDayLine(
    counts({
      messages: 5,
      tasksAdded: 1,
      tasksDone: 2,
      planned: 3,
      answered: 4,
      dismissed: 1,
    }),
  ),
  '5 messages · answered 4 questions, planned 3 days, finished 2 tasks and more',
  'biggest first, three and then and more',
);
assert.equal(
  toDayLine(counts({ tasksDone: 1 })),
  'Finished 1 task',
  'no messages starts the line with a capital',
);
assert.equal(
  toDayLine(counts({ messages: 2, peopleAdded: 2, placesAdded: 1 })),
  '2 messages · added 2 people and a place',
);

// The model's sentence.
const day = counts({ messages: 8, tasksAdded: 2, tasksDone: 1 });
const good = 'You sorted out two tasks and finished 1 more on a busy day.';
assert.equal(readDaySummary(good, day), good);
assert.equal(
  readDaySummary('You sent 8 messages and added 2 tasks.', day),
  'You sent 8 messages and added 2 tasks.',
);
assert.equal(readDaySummary('  You   did a lot. ', day), 'You did a lot.');
[
  ['first person', 'I sorted your tasks.'],
  ['first person my', 'You finished my task.'],
  ['link', 'You read https://example.com today.'],
  ['www', 'You read www.example.com today.'],
  ['markdown', 'You did **a lot** today.'],
  ['bullet markup', 'You did [a lot] today.'],
  ['emoji', 'You did a lot 🎉'],
  ['long', `You ${'did a lot '.repeat(30)}`],
  ['unknown number', 'You added 9 tasks.'],
  ['empty', '   '],
].forEach(([label, text]) => {
  assert.equal(readDaySummary(text, day), null, label);
});
assert.equal(readDaySummary(42, day), null);
assert.equal(readDaySummary(undefined, day), null);

// When the night run may write a day.
const nightStart = zonedDateTimeToEpoch('2026-11-10', '00:00', NY);
const due = (patch: Partial<Parameters<typeof isSummaryDue>[0]>) =>
  isSummaryDue({
    now: nightStart + 20 * MINUTE,
    timeZone: NY,
    existing: null,
    hasActiveCapture: false,
    latestCaptureAt: nightStart - 60 * MINUTE,
    ...patch,
  });
assert.equal(getSummaryDay(nightStart + 20 * MINUTE, NY).dayKey, '2026-11-09');
assert.equal(due({}), true, 'quiet and after 00:15');
assert.equal(due({ now: nightStart + 14 * MINUTE }), false, 'before 00:15');
assert.equal(
  due({ now: nightStart + 15 * MINUTE, latestCaptureAt: null }),
  true,
);
assert.equal(
  due({ hasActiveCapture: true }),
  false,
  'a turn still being sorted',
);
assert.equal(
  due({ latestCaptureAt: nightStart + 20 * MINUTE - 9 * MINUTE }),
  false,
  'latest turn under 10 minutes old',
);
assert.equal(
  due({ latestCaptureAt: nightStart + 20 * MINUTE - 10 * MINUTE }),
  true,
  'latest turn 10 minutes old',
);
assert.equal(due({ existing: { status: 'counted', attempts: 2 } }), true);
assert.equal(
  due({ existing: { status: 'counted', attempts: 3 } }),
  false,
  'attempts cap',
);
assert.equal(due({ existing: { status: 'written', attempts: 1 } }), false);
assert.equal(due({ existing: { status: 'empty', attempts: 0 } }), false);
assert.equal(
  due({ now: nightStart + 20 * MINUTE, timeZone: 'Asia/Tokyo' }),
  true,
  'Tokyo is already well past its midnight',
);

console.log('helm day summary: ok');
