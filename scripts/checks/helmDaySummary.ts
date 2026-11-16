import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { zonedDateTimeToEpoch } from '../../functions/src/notifications/zonedTime.ts';
import {
  countHelmDay,
  getDayBounds,
  getSummaryDay,
  isStillSorting,
  isSummaryDue,
  isSummaryMissing,
  isWaitingOnBatch,
  SUMMARY_BATCH_WAIT_MS,
  readDaySummary,
  toDayLine,
  toEffectTitles,
  type DayCapture,
  type DayExecution,
  type HelmDayCounts,
} from '../../functions/src/apps/helm/daySummary/countDay.ts';
import {
  settleBatchResult,
  submitSummaryBatch,
  type QueuedSummary,
} from '../../functions/src/apps/helm/daySummary/daySummaryBatch.ts';
import type {
  BatchProvider,
  BatchResult,
} from '../../functions/src/ai/batch.ts';
import {
  BATCH_PRICE_RATIO,
  EMPTY_USAGE,
  getUsageCost,
} from '../../functions/src/ai/models.ts';

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
  habitsStarted: 0,
  habitChecksDone: 0,
  connectionsAdded: 0,
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
const execution = (
  patch: Partial<Omit<DayExecution, 'effectRefs'>> & {
    effectRefs?: { op: string; collection: string; docId?: string }[];
  },
): DayExecution => ({
  createdAt: 0,
  state: 'succeeded',
  category: 'organize',
  undoneByExecutionId: null,
  undoneDocIds: [],
  isOutside: false,
  ...patch,
  effectRefs: (patch.effectRefs ?? [{ op: 'create', collection: 'tasks' }]).map(
    (ref, index) => ({ docId: `d${index}`, ...ref }),
  ),
});

// Counting, on a plain day in UTC.
const utc = getDayBounds('2026-11-09', 'UTC');
const at = utc.dayStart + 60 * MINUTE;
const count = (input: {
  captures?: DayCapture[];
  executions?: DayExecution[];
  tasks?: { completedAt: number | null }[];
  habits?: { createdAt: number; isOutside: boolean }[];
  connections?: { createdAt: number; isOutside: boolean }[];
  habitChecks?: { at: number; status: string; isOutside: boolean }[];
}) =>
  countHelmDay({
    captures: [],
    executions: [],
    tasks: [],
    habits: [],
    connections: [],
    habitChecks: [],
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
assert.deepEqual(
  count({
    executions: [
      execution({
        createdAt: at,
        undoneDocIds: ['d0', 'd2'],
        effectRefs: [
          { op: 'create', collection: 'tasks' },
          { op: 'create', collection: 'tasks' },
          { op: 'create', collection: 'notes' },
        ],
      }),
    ],
  }),
  counts({ tasksAdded: 1 }),
  'a partly undone execution counts only what is left of it',
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
          { op: 'create', collection: 'keyDates', docId: 'd' },
          { op: 'create', collection: 'notes', docId: 'd' },
          { op: 'create', collection: 'topics', docId: 'd' },
          { op: 'create', collection: 'procedures', docId: 'd' },
          { op: 'create', collection: 'facts', docId: 'd' },
          { op: 'create', collection: 'who', docId: 'd' },
          { op: 'create', collection: 'places', docId: 'd' },
          { op: 'update', collection: 'tasks', docId: 'd' },
          { op: 'delete', collection: 'tasks', docId: 'd' },
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
      habits: [],
      connections: [],
      habitChecks: [],
      ...getDayBounds(day, NY),
    }).messages;
  assert.equal(of(middle), 1, `${middle} keeps its own message`);
  assert.equal(of(after), 1, `${after} gets the later one`);
  assert.equal(of(before), 0, `${before} gets none`);
});

// Habits: a check-in or a start counts on the day it happened, a skip or an outside assistant's never does.
assert.deepEqual(
  count({
    habits: [
      { createdAt: at, isOutside: false },
      { createdAt: at, isOutside: true },
      { createdAt: utc.dayEnd, isOutside: false },
      { createdAt: utc.dayStart - 1, isOutside: false },
    ],
    habitChecks: [
      { at, status: 'done', isOutside: false },
      { at, status: 'done', isOutside: false },
      { at, status: 'skipped', isOutside: false },
      { at, status: 'done', isOutside: true },
      { at: utc.dayEnd, status: 'done', isOutside: false },
      { at: utc.dayStart - 1, status: 'done', isOutside: false },
    ],
  }),
  counts({ habitsStarted: 1, habitChecksDone: 2 }),
  'habit check-ins done and habits started count on their own day',
);
assert.equal(
  count({
    executions: [
      execution({
        createdAt: at,
        effectRefs: [{ op: 'create', collection: 'habits', docId: 'd' }],
      }),
    ],
  }).tasksAdded,
  0,
  'a habit made in a turn is not a task added',
);
assert.deepEqual(
  toEffectTitles(
    [
      { written: { name: 'Take pills' } },
      { written: { name: 'Sam' } },
      { written: { name: 'Call Dana' } },
    ],
    [
      { op: 'create', collection: 'habits' },
      { op: 'create', collection: 'connections' },
      { op: 'create', collection: 'tasks' },
    ],
  ),
  ['Call Dana'],
  'a habit or connection name never reaches the summary prompt',
);
assert.equal(
  count({
    executions: [
      execution({
        createdAt: at,
        effectRefs: [{ op: 'create', collection: 'connections', docId: 'd' }],
      }),
    ],
  }).connectionsAdded,
  0,
  'a connection made in a turn is counted from its record, not as another kind added',
);
assert.equal(
  count({
    connections: [
      { createdAt: at, isOutside: false },
      { createdAt: at, isOutside: false },
      { createdAt: at, isOutside: true },
      { createdAt: utc.dayEnd, isOutside: false },
      { createdAt: utc.dayStart - 1, isOutside: false },
    ],
  }).connectionsAdded,
  2,
  'connections count on their own day and an outside turn never counts',
);

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
  'Sent 8 messages · added 2 tasks and a key date, finished 1 task, answered 1 question',
);
assert.equal(toDayLine(counts({ messages: 3 })), 'Sent 3 messages');
assert.equal(toDayLine(counts({ messages: 1 })), 'Sent 1 message');
assert.equal(
  toDayLine(counts({ messages: 1, tasksAdded: 1, answered: 1 })),
  'Sent 1 message · added a task, answered 1 question',
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
  'Sent 5 messages · answered 4 questions, planned 3 days, finished 2 tasks and more',
  'biggest first, three and then and more',
);
assert.equal(
  toDayLine(counts({ tasksDone: 1 })),
  'Finished 1 task',
  'no messages starts the line with a capital',
);
assert.equal(
  toDayLine(counts({ messages: 2, peopleAdded: 2, placesAdded: 1 })),
  'Sent 2 messages · added 2 people and a place',
);

assert.equal(
  toDayLine(counts({ messages: 2, habitChecksDone: 3, habitsStarted: 1 })),
  'Sent 2 messages · logged 3 habit check-ins and started a habit',
);
assert.equal(
  toDayLine(counts({ habitChecksDone: 1 })),
  'Logged 1 habit check-in',
);
assert.equal(toDayLine(counts({ habitsStarted: 2 })), 'Started 2 habits');

assert.equal(
  toDayLine(counts({ messages: 2, tasksAdded: 1, connectionsAdded: 2 })),
  'Sent 2 messages · added 2 connections and a task',
);
assert.equal(toDayLine(counts({ connectionsAdded: 1 })), 'Added a connection');

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
const NO_BATCH = { batchId: null, batchedAt: null };
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
const triedLongAgo = nightStart - 3 * 60 * MINUTE;
assert.equal(
  due({
    existing: {
      status: 'counted',
      attempts: 2,
      writtenAt: triedLongAgo,
      ...NO_BATCH,
    },
  }),
  true,
);
assert.equal(
  due({
    existing: {
      status: 'counted',
      attempts: 1,
      writtenAt: nightStart + 20 * MINUTE - 30 * MINUTE,
      ...NO_BATCH,
    },
  }),
  false,
  'a counted day tried within two hours waits',
);
assert.equal(
  due({
    existing: {
      status: 'counted',
      attempts: 3,
      writtenAt: triedLongAgo,
      ...NO_BATCH,
    },
  }),
  false,
  'attempts cap',
);
assert.equal(
  due({
    existing: {
      status: 'written',
      attempts: 1,
      writtenAt: triedLongAgo,
      ...NO_BATCH,
    },
  }),
  false,
);
assert.equal(
  due({
    existing: {
      status: 'empty',
      attempts: 0,
      writtenAt: triedLongAgo,
      ...NO_BATCH,
    },
  }),
  false,
);
assert.equal(
  due({ now: nightStart + 20 * MINUTE, timeZone: 'Asia/Tokyo' }),
  false,
  'Tokyo is past its night window, so the day waits to be opened',
);
assert.equal(due({ now: nightStart + 6 * 60 * MINUTE }), false, 'after 06:00');
assert.equal(due({ now: nightStart + 5 * 60 * MINUTE }), true, 'before 06:00');

// A turn stuck in sorting stops holding the night run back after an hour.
const sortedAt = nightStart + 20 * MINUTE;
assert.equal(
  isStillSorting(
    { status: 'received', createdAt: sortedAt - 30 * MINUTE },
    sortedAt,
  ),
  true,
);
assert.equal(
  isStillSorting(
    { status: 'interpreting', createdAt: sortedAt - 61 * MINUTE },
    sortedAt,
  ),
  false,
  'stalled',
);
assert.equal(
  isStillSorting({ status: 'sorted', createdAt: sortedAt - MINUTE }, sortedAt),
  false,
);

// Titles come from the shapes the executor really writes.
assert.deepEqual(
  toEffectTitles(
    [
      { written: { 'sealed.title': 'Call the florist', status: 'open' } },
      {
        written: {
          'sealed.title': 'Book the venue',
          status: 'done',
          completedAt: 1,
        },
      },
      { written: { 'sealed.name': 'Priya', kind: 'person', tier: 1 } },
      { written: { 'sealed.name': 'Pike Place Market' } },
      { written: { 'sealed.title': 'Renamed', status: 'open' } },
      { written: { 'sealed.title': 'Gone' } },
    ],
    [
      { op: 'create', collection: 'tasks' },
      { op: 'update', collection: 'tasks' },
      { op: 'create', collection: 'who' },
      { op: 'create', collection: 'places' },
      { op: 'update', collection: 'tasks' },
      { op: 'delete', collection: 'tasks' },
    ],
  ),
  ['Call the florist', 'Book the venue', 'Priya', 'Pike Place Market'],
);

// A summary waiting on its batch is not missing, and the wait is six hours on both sides.
const sentAt = nightStart;
const waiting = (batchedAt: number | null, batchId: string | null = 'b1') => ({
  status: 'counted',
  attempts: 1,
  writtenAt: sentAt,
  batchId,
  batchedAt,
});
assert.equal(
  isSummaryMissing(waiting(sentAt), sentAt + 3 * 60 * MINUTE),
  false,
  'counted with a batch is not missing, even past the retry gap',
);
assert.equal(
  isSummaryMissing(waiting(sentAt, null), sentAt + 3 * 60 * MINUTE),
  true,
);
assert.equal(
  isSummaryMissing(waiting(sentAt), sentAt + 7 * 60 * MINUTE),
  true,
  'a batch silent for six hours no longer holds a later night run back',
);
assert.equal(SUMMARY_BATCH_WAIT_MS, 6 * 60 * MINUTE);
assert.equal(
  isWaitingOnBatch(waiting(sentAt, 'pending'), sentAt + 14 * MINUTE),
  true,
  'a claim waiting to be sent holds the day',
);
assert.equal(
  isWaitingOnBatch(waiting(sentAt, 'pending'), sentAt + 16 * MINUTE),
  false,
  'a claim whose run died frees the day for the next run',
);
assert.match(
  readFileSync('src/apps/helm/hooks/useDaySummary.ts', 'utf8'),
  /SUMMARY_PENDING_WAIT_MS = 15 \* 60 \* 1000/,
  'the device waits the same 15 minutes on a pending claim',
);
assert.equal(
  isWaitingOnBatch(waiting(sentAt), sentAt + SUMMARY_BATCH_WAIT_MS - 1),
  true,
);
assert.equal(
  isWaitingOnBatch(waiting(sentAt), sentAt + SUMMARY_BATCH_WAIT_MS),
  false,
  'after six hours the open writes it live',
);
assert.equal(isWaitingOnBatch(waiting(null), sentAt), false);
const deviceWait = readFileSync(
  new URL('../../src/apps/helm/hooks/useDaySummary.ts', import.meta.url),
  'utf8',
).match(/SUMMARY_BATCH_WAIT_MS = ([\d* ]+);/);
assert.equal(
  deviceWait && new Function(`return ${deviceWait[1]}`)(),
  SUMMARY_BATCH_WAIT_MS,
  'the device waits as long as the server',
);

// A batch result changes only the summary still waiting on that batch.
const result = (patch: Partial<BatchResult>): BatchResult => ({
  customId: 'r0',
  outcome: 'succeeded',
  output: { summary: good },
  usage: EMPTY_USAGE,
  ...patch,
});
const waitingDoc = { status: 'counted', batchId: 'b1', staleAt: null };
const settle = (
  patch: Partial<BatchResult>,
  doc: Parameters<typeof settleBatchResult>[0]['doc'] = waitingDoc,
) =>
  settleBatchResult({ result: result(patch), batchId: 'b1', doc, counts: day });
assert.deepEqual(settle({}), { kind: 'written', text: good });
assert.deepEqual(settle({ output: { summary: 'I did it.' } }), {
  kind: 'retry',
});
assert.deepEqual(settle({ output: null }), { kind: 'retry' });
['errored', 'expired', 'canceled'].forEach((outcome) =>
  assert.deepEqual(
    settle({ outcome: outcome as BatchResult['outcome'], output: null }),
    { kind: 'retry' },
    outcome,
  ),
);
assert.deepEqual(
  settleBatchResult({
    result: result({}),
    batchId: 'b1',
    doc: waitingDoc,
    counts: null,
  }),
  { kind: 'retry' },
  'sealed words that will not open',
);
[
  ['another batch', { ...waitingDoc, batchId: 'b2' }],
  ['cleared by a live write', { ...waitingDoc, batchId: null }],
  ['still pending', { ...waitingDoc, batchId: 'pending' }],
  ['marked stale', { ...waitingDoc, staleAt: 5 }],
  ['already written', { ...waitingDoc, status: 'written' }],
  ['gone', null],
].forEach(([name, doc]) =>
  assert.deepEqual(
    settle({}, doc as Parameters<typeof settleBatchResult>[0]['doc']),
    { kind: 'dropped' },
    String(name),
  ),
);

// A failed submit gives every reservation back; a good one numbers the requests.
const queued: QueuedSummary[] = [0, 1, 2].map((index) => ({
  uid: `u${index}`,
  dayKey: '2026-11-09',
  reservedAt: index,
  request: { system: 's', message: `m${index}` },
}));
const sent: { customId: string; message: string; system: string }[] = [];
const provider = (fails: boolean): BatchProvider => ({
  submit: (requests) => {
    if (fails) return Promise.reject(new Error('down'));
    sent.push(...requests);
    return Promise.resolve('b1');
  },
  collect: () => Promise.resolve(null),
  remove: () => Promise.resolve(),
});
const released: string[] = [];
const release = (entry: QueuedSummary) => {
  released.push(entry.uid);
  return Promise.resolve();
};
assert.equal(await submitSummaryBatch(provider(true), queued, release), null);
assert.deepEqual(released, ['u0', 'u1', 'u2'], 'every reservation released');
released.length = 0;
const submitted = await submitSummaryBatch(provider(false), queued, release);
assert.equal(submitted?.batchId, 'b1');
assert.deepEqual(released, [], 'a good submit keeps its reservations');
assert.deepEqual(
  sent.map((request) => request.customId),
  ['r0', 'r1', 'r2'],
);
assert.equal(submitted?.ids.r1.uid, 'u1', 'matched by custom id, not order');
assert.equal(await submitSummaryBatch(provider(false), [], release), null);

// A batched call costs half.
const usage = { ...EMPTY_USAGE, inputTokens: 1_000_000, outputTokens: 100_000 };
assert.equal(BATCH_PRICE_RATIO, 0.5);
assert.equal(
  getUsageCost('daySummary', usage, { isBatch: true }),
  getUsageCost('daySummary', usage) / 2,
);

console.log('helm day summary: ok');
