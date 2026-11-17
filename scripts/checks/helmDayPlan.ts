import assert from 'node:assert/strict';

import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import {
  foldedAimsLine,
  pickTopCards,
  readAimTaskIds,
  readCarryOver,
  readDayCardMode,
  readWindDownCounts,
  TOP_CARD_CAP,
} from '../../src/apps/helm/utils/dayCard.ts';
import type { OpenDayAims } from '../../src/apps/helm/types.ts';
import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';
import {
  describeFit,
  guessDuration,
  planDay,
  type BusyBlock,
  type FinishedTask,
  type PlannerInput,
  type PlannerTask,
} from '../../src/apps/helm/engine/planner.ts';
import {
  isRollable,
  isWindDownDue,
  planOverlapFlags,
  planReplan,
  planRollover,
  readAimsView,
  readDayClock,
  readPassLookAt,
  type AimsView,
} from '../../functions/src/apps/helm/dayPlan/dayJob.ts';
import {
  buildExecution,
  planWrites,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { planDayAims } from '../../functions/src/apps/helm/nomos/planDayAims.ts';
import { buildDesired } from '../../functions/src/apps/helm/calendarSync/plan.ts';

const ZONE = 'America/Los_Angeles';
const DAY = '2026-11-10';
const MIN = 60_000;
const at = (time: string) => zonedDateTimeToEpoch(DAY, time, ZONE);

const makeIds = () => {
  const state = { count: 0 };
  return () => `slot${++state.count}`;
};

export const task = (
  id: string,
  extra: Partial<PlannerTask> = {},
): PlannerTask => ({
  id,
  title: id,
  due: null,
  importance: null,
  isUrgent: false,
  durationMinutes: 30,
  energy: null,
  placeIds: [],
  ...extra,
});

export const busy = (
  from: string,
  to: string,
  title = 'Meeting',
): BusyBlock => ({
  startAt: at(from),
  endAt: at(to),
  title,
});

export const base = (extra: Partial<PlannerInput> = {}): PlannerInput => ({
  dayKey: DAY,
  timeZone: ZONE,
  now: at('06:00'),
  dayStartTime: '08:00',
  dayEndTime: '21:00',
  fillPercent: 100,
  hasCalendar: true,
  restDay: null,
  currentPlaceId: null,
  busy: [],
  slots: {},
  tasks: [],
  aimTaskIds: [],
  finishedTasks: [],
  ...extra,
});

export const run = (input: PlannerInput) => planDay(input, makeIds());

const placed = (result: ReturnType<typeof planDay>) =>
  Object.values(result.slots)
    .filter((slot) => slot.status === 'suggested')
    .sort((first, second) => (first.startAt ?? 0) - (second.startAt ?? 0));

const idsOf = (result: ReturnType<typeof planDay>) =>
  placed(result).map((slot) => slot.taskId);

const startOf = (result: ReturnType<typeof planDay>, taskId: string) =>
  placed(result).find((slot) => slot.taskId === taskId)?.startAt;

const finished = (
  extra: Partial<FinishedTask> & { completedAt: number },
): FinishedTask => ({
  projectId: null,
  context: null,
  durationMinutes: 30,
  ...extra,
});

const tests: [string, () => void][] = [];
const test = (name: string, body: () => void) => tests.push([name, body]);

test('aims are planned before an overdue task', () => {
  const overdue = task('overdue', {
    due: { kind: 'day', date: Date.parse('2026-11-01T00:00:00Z') },
    importance: 'must',
  });
  const result = run(
    base({
      tasks: [overdue, task('gym')],
      aimTaskIds: ['gym'],
    }),
  );
  assert.deepEqual(idsOf(result), ['gym', 'overdue']);
  assert.equal(startOf(result, 'gym'), at('08:00'));
});

test('five aims are all planned though three is the cap on the rest', () => {
  const aims = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const others = ['o1', 'o2', 'o3', 'o4'];
  const result = run(
    base({
      tasks: [...others, ...aims].map((id) => task(id)),
      aimTaskIds: aims,
    }),
  );
  assert.deepEqual(idsOf(result).slice(0, 5), aims);
  assert.equal(idsOf(result).length, 8);
  assert.deepEqual(result.unplaced, []);
});

test('a break follows each task by its effort: 5, 15 and 30 minutes', () => {
  const result = run(
    base({
      tasks: [
        task('light', { effort: 'light' }),
        task('moderate', { effort: 'moderate' }),
        task('heavy', { effort: 'heavy' }),
        task('last'),
      ],
      aimTaskIds: ['light', 'moderate', 'heavy', 'last'],
    }),
  );
  assert.deepEqual(idsOf(result), ['light', 'moderate', 'heavy', 'last']);
  assert.equal(startOf(result, 'light'), at('08:00'));
  assert.equal(startOf(result, 'moderate'), at('08:35'));
  assert.equal(startOf(result, 'heavy'), at('09:20'));
  assert.equal(startOf(result, 'last'), at('10:20'));
  assert.equal(
    placed(result).every((slot) => slot.endAt! - slot.startAt! === 30 * MIN),
    true,
  );
});

test('a task with no effort is planned with a moderate break', () => {
  const legacy = run(
    base({
      tasks: [task('a', { effort: null }), task('b', { effort: undefined })],
      aimTaskIds: ['a', 'b'],
    }),
  );
  assert.equal(startOf(legacy, 'b'), at('08:45'));
});

test('a day with no aims keeps a break after each task', () => {
  const result = run(base({ tasks: [task('a'), task('b')] }));
  assert.equal(startOf(result, 'b'), at('08:45'));
});

test('aims count against the fill cap', () => {
  const result = run(
    base({
      dayEndTime: '10:00',
      fillPercent: 50,
      tasks: [task('a'), task('b'), task('c')],
      aimTaskIds: ['a', 'b', 'c'],
    }),
  );
  assert.deepEqual(idsOf(result), ['a', 'b']);
  assert.deepEqual(result.unplaced, ['c']);
});

test('an aim that does not fit is returned and worded', () => {
  const result = run(
    base({
      dayEndTime: '12:00',
      busy: [busy('09:00', '12:00', 'Team call')],
      tasks: [task('call-mom'), task('gym', { durationMinutes: 120 })],
      aimTaskIds: ['call-mom', 'gym'],
    }),
  );
  assert.deepEqual(idsOf(result), ['call-mom']);
  assert.deepEqual(result.unplaced, ['gym']);
  assert.deepEqual(result.blockers.gym, { kind: 'event', title: 'Team call' });
  const titles = { 'call-mom': 'Call Mom', gym: 'Gym' };
  assert.equal(
    describeFit(titles, result.unplaced, result.blockers),
    "“Gym” doesn't today unless you move “Team call”. The rest fit.",
  );
  assert.equal(describeFit(titles, [], {}), null);
});

test('an aim nothing could make room for is not blamed on a move', () => {
  const result = run(
    base({
      tasks: [task('trip', { durationMinutes: 15 * 60 })],
      aimTaskIds: ['trip'],
    }),
  );
  assert.deepEqual(result.unplaced, ['trip']);
  assert.equal(result.blockers.trip, null);
  assert.equal(
    describeFit({ trip: 'Trip' }, result.unplaced, result.blockers),
    "“Trip” doesn't fit today.",
  );
});

test('a length is guessed from the project, then the context, then 30', () => {
  const history = [
    finished({ projectId: 'p', durationMinutes: 90, completedAt: 1 }),
    ...[60, 40, 50, 20, 30].map((minutes, index) =>
      finished({
        projectId: 'p',
        durationMinutes: minutes,
        completedAt: 10 + index,
      }),
    ),
    finished({ context: 'out', durationMinutes: 45, completedAt: 20 }),
    finished({ context: 'out', durationMinutes: 15, completedAt: 21 }),
  ];
  assert.equal(guessDuration({ projectId: 'p', context: 'out' }, history), 40);
  assert.equal(guessDuration({ projectId: 'q', context: 'out' }, history), 30);
  assert.equal(
    guessDuration(
      { projectId: null, context: 'out' },
      history.filter((entry) => entry.projectId === null),
    ),
    30,
  );
  assert.equal(guessDuration({ projectId: null, context: null }, history), 30);
  assert.equal(guessDuration({ projectId: 'z', context: null }, []), 30);
});

test('an aim with no length is planned with the guess and reported', () => {
  const result = run(
    base({
      tasks: [
        task('write', { durationMinutes: null, projectId: 'p' }),
        task('call', { durationMinutes: 20 }),
      ],
      aimTaskIds: ['write', 'call'],
      finishedTasks: [
        finished({ projectId: 'p', durationMinutes: 60, completedAt: 5 }),
      ],
    }),
  );
  const write = placed(result).find((slot) => slot.taskId === 'write');
  assert.equal(write!.endAt! - write!.startAt!, 60 * MIN);
  assert.deepEqual(result.guessedTaskIds, ['write']);
});

const view = (
  taskIds: string[],
  windDown: AimsView['windDown'] = {},
): AimsView => ({
  aims: taskIds.map((taskId, order) => ({
    aimId: `a-${taskId}`,
    taskId,
    order,
    lengthIsGuess: false,
    broughtFrom: null,
  })),
  windDown,
});
const profile = { timeZone: ZONE, dayStartTime: '08:00', dayEndTime: '22:00' };
const slot = (
  taskId: string,
  from: string,
  to: string,
  status: 'kept' | 'suggested',
) => ({
  taskId,
  startAt: at(from),
  endAt: at(to),
  status,
  source: 'nomos' as const,
  decidedAt: null,
  overlapsEventRef: null,
});

test('rollover brings an open aim once and never twice', () => {
  const ids = ['n1', 'n2', 'n3'];
  const next = () => ids.shift()!;
  const args = {
    fromDayKey: '2026-11-09',
    from: view(['t1', 't2', 't3', 't4'], {
      'a-t2': {
        result: 'wontHappen',
        choice: 'later',
        reason: null,
        saidSpanId: null,
      },
      'a-t3': { result: 'done', choice: null, reason: null, saidSpanId: null },
    }),
    taskStatus: new Map<string, 'open' | 'done'>([
      ['t1', 'open'],
      ['t2', 'open'],
      ['t3', 'open'],
      ['t4', 'done'],
    ]),
    newAimId: next,
  };
  const first = planRollover({ ...args, today: view([]) });
  assert.deepEqual(
    first.aims.map((aim) => aim.taskId),
    ['t1'],
  );
  assert.equal(first.aims[0].broughtFrom, '2026-11-09');
  const again = planRollover({
    ...args,
    today: { aims: first.aims, windDown: {} },
  });
  assert.equal(again.added, 0);
  assert.equal(isRollable({ dayKey: '2026-11-09', rolledAt: 5 }, DAY), false);
  assert.equal(isRollable({ dayKey: '2026-11-09', rolledAt: null }, DAY), true);
  assert.equal(
    isRollable({ dayKey: '2026-10-01', rolledAt: null }, DAY),
    false,
  );
});

test('a pass at 00:15 with today empty and yesterday unrolled asks again at the day start', () => {
  const clock = readDayClock(at('00:15'), profile);
  const input = {
    now: at('00:15'),
    clock,
    windDownState: 'waiting',
    aimCount: 0,
    isPlanned: false,
  };
  assert.equal(
    readPassLookAt({ ...input, isRolloverOwed: true }),
    clock.startAt,
  );
  assert.equal(readPassLookAt({ ...input, isRolloverOwed: false }), null);
  assert.equal(
    readPassLookAt({ ...input, aimCount: 2, isRolloverOwed: true }),
    clock.startAt,
  );
});

test('the wind-down is ready two hours before the day ends', () => {
  const clock = readDayClock(at('12:00'), profile);
  assert.equal(clock.windDownAt, at('20:00'));
  const due = (time: string, aimCount = 1) =>
    isWindDownDue({ now: at(time), clock, windDownState: 'waiting', aimCount });
  assert.equal(due('19:59'), false);
  assert.equal(due('20:00'), true);
  assert.equal(due('20:00', 0), false);
});

test('an overlap is flagged on a kept slot and never moved, then cleared', () => {
  const slots = { s1: slot('t1', '10:00', '11:00', 'kept') };
  const flags = planOverlapFlags({
    slots,
    busy: [{ ref: 'ev1', startAt: at('10:30'), endAt: at('11:30') }],
    aimTaskIds: new Set(['t1']),
  });
  assert.deepEqual(flags, { s1: 'ev1' });
  const flagged = { s1: { ...slots.s1, overlapsEventRef: 'ev1' } };
  assert.deepEqual(
    planOverlapFlags({ slots: flagged, busy: [], aimTaskIds: new Set(['t1']) }),
    { s1: null },
  );
});

test('only a suggested slot that no longer fits is re-planned', () => {
  const slots = {
    s1: slot('t1', '10:00', '10:30', 'suggested'),
    s2: slot('t2', '14:00', '14:30', 'suggested'),
    s3: slot('t3', '10:00', '10:30', 'kept'),
  };
  const patch = planReplan({
    dayKey: DAY,
    timeZone: ZONE,
    now: at('09:00'),
    dayStartTime: '08:00',
    dayEndTime: '22:00',
    fillPercent: 70,
    busy: [
      { startAt: at('10:00'), endAt: at('11:00'), isAllDay: false } as never,
    ],
    slots,
    tasks: [task('t1'), task('t2')],
    aimTaskIds: [],
    finishedTasks: [],
  });
  assert.deepEqual(Object.keys({ ...patch.moved, ...patch.removed }), ['s1']);
});

test('the job opens only each aim task id, order and result', () => {
  const read = readAimsView({
    aims: [
      { aimId: 'a', taskId: 't', order: 2, title: 'secret', note: 'secret' },
    ],
    windDown: { a: { result: 'done', reason: 'r', extra: 'secret' } },
  });
  assert.deepEqual(Object.keys(read.aims[0]).sort(), [
    'aimId',
    'broughtFrom',
    'lengthIsGuess',
    'order',
    'taskId',
  ]);
  assert.deepEqual(Object.keys(read.windDown.a).sort(), [
    'choice',
    'reason',
    'result',
    'saidSpanId',
  ]);
});

test('a turn on the morning card files its tasks as aims in one write', () => {
  const plan = planDayAims({
    dayKey: DAY,
    commands: [
      { kind: 'createTask', ref: '$new1', durationMinutes: 45 },
      { kind: 'createTask', ref: '$new2', durationMinutes: null },
    ] as never,
    taskIdByRef: { $new1: 'x1', $new2: 'x2' },
    existing: new Map(),
    current: null,
    newAimId: (() => {
      const state = { n: 0 };
      return () => `aim${++state.n}`;
    })(),
    seal: (fields) => fields as never,
  });
  assert.equal(plan.write?.op, 'create');
  assert.equal(plan.effects.length, 1);
  assert.equal(plan.effectRefs[0].collection, 'dayAims');
  const sealed = plan.write!.data.sealed as unknown as AimsView;
  assert.deepEqual(
    sealed.aims.map((aim) => [aim.taskId, aim.lengthIsGuess]),
    [
      ['x1', false],
      ['x2', true],
    ],
  );
});

const calendarSlot = (extra: Record<string, unknown> = {}) => ({
  dayKey: DAY,
  slotId: 's1',
  taskId: 't1',
  startAt: at('10:00'),
  endAt: at('10:30'),
  status: 'kept' as const,
  decidedAt: null,
  isAim: true,
  isLetGo: false,
  ...extra,
});
const desire = (extra: Record<string, unknown>, status: 'open' | 'done') =>
  buildDesired({
    now: at('09:00'),
    timeZone: ZONE,
    slots: [calendarSlot(extra)],
    tasks: [
      {
        id: 't1',
        title: 'Write',
        isPrivate: Boolean(extra.isPrivate),
        status,
        dueAt: null,
        durationMinutes: null,
        hasMeets: false,
        lastEditedAt: null,
      },
    ],
    habits: [],
  });

test('a done aim is ticked in the calendar and a let-go one is removed', () => {
  assert.equal(desire({}, 'done')[0].title, '\u2713 Write');
  assert.equal(desire({}, 'open')[0].title, 'Write');
  assert.equal(desire({ isLetGo: true }, 'open').length, 0);
});

const dayAims = (extra: Partial<OpenDayAims> = {}): OpenDayAims => ({
  id: DAY,
  date: Date.parse(DAY),
  state: 'open',
  windDownState: 'waiting',
  lookAt: null,
  rolledAt: null,
  aims: [],
  windDown: {},
  isUnreadable: false,
  ...extra,
});

const aim = (taskId: string, order: number) => ({
  aimId: `aim-${taskId}`,
  taskId,
  order,
  lengthIsGuess: false,
  broughtFrom: null,
});

test('home holds at most three top cards and the day card is one of them', () => {
  assert.equal(TOP_CARD_CAP, 3);
  assert.deepEqual(pickTopCards(['grouping', 'day', 'needsYou', 'day']), [
    'needsYou',
    'day',
    'grouping',
  ]);
});

test('the folded line and the wound-down line read as written', () => {
  assert.equal(foldedAimsLine(3, 2), 'Today: 3 aims · 2 planned');
  assert.equal(foldedAimsLine(1, 1), 'Today: 1 aim · 1 planned');
  assert.equal(
    HELM_COPY.windDownSummary({
      done: 2,
      tomorrow: 1,
      later: 0,
      dropped: 1,
      left: 2,
    }),
    'Wound down: 2 done, 1 to tomorrow, 1 dropped, 2 left as they were.',
  );
  assert.equal(
    HELM_COPY.windDownSummary({
      done: 0,
      tomorrow: 0,
      later: 0,
      dropped: 0,
      left: 0,
    }),
    'Wound down.',
  );
});

test('the wind-down counts what each aim became', () => {
  const day = dayAims({
    aims: [aim('a', 1), aim('b', 2), aim('c', 3), aim('d', 4)],
    windDown: {
      b: {
        result: 'wontHappen',
        choice: 'tomorrow',
        reason: null,
        saidSpanId: null,
      },
      c: {
        result: 'wontHappen',
        choice: 'dropped',
        reason: 'tired',
        saidSpanId: null,
      },
    },
  });
  assert.deepEqual(
    readWindDownCounts(day, (id) => id === 'a'),
    {
      done: 1,
      tomorrow: 1,
      later: 0,
      dropped: 1,
      left: 1,
    },
  );
  assert.deepEqual(readAimTaskIds(day), ['a', 'd']);
});

test('the card is the question, the folded line, then the wind-down, never both', () => {
  const start = at('08:00');
  const end = at('21:00');
  const mode = (day: OpenDayAims | null, now: string) =>
    readDayCardMode({ day, now: at(now), dayStart: start, dayEnd: end });
  assert.equal(mode(null, '07:00'), 'hidden');
  assert.equal(mode(null, '09:00'), 'ask');
  assert.equal(mode(dayAims({ state: 'dismissed' }), '09:00'), 'skipped');
  assert.equal(
    mode(dayAims({ state: 'answered', aims: [aim('a', 1)] }), '09:00'),
    'answered',
  );
  assert.equal(mode(dayAims({ state: 'answered' }), '09:00'), 'ask');
  const withAims = dayAims({ state: 'answered', aims: [aim('a', 1)] });
  assert.equal(mode(withAims, '18:59'), 'answered');
  assert.equal(mode(withAims, '19:00'), 'windDown');
  assert.equal(mode(null, '19:30'), 'hidden');
  assert.equal(mode({ ...withAims, windDownState: 'done' }, '20:00'), 'wound');
});

test("yesterday's undone aims are listed until something answers them", () => {
  const yesterday = dayAims({
    aims: [aim('a', 1), aim('b', 2), aim('c', 3)],
    windDown: {
      c: {
        result: 'wontHappen',
        choice: 'later',
        reason: null,
        saidSpanId: null,
      },
    },
  });
  const today = dayAims({ aims: [aim('b', 1)] });
  assert.deepEqual(
    readCarryOver(yesterday, today, () => true).map((entry) => entry.taskId),
    ['a'],
  );
  assert.deepEqual(
    readCarryOver(yesterday, null, (id) => id !== 'a').map(
      (entry) => entry.taskId,
    ),
    ['b'],
  );
});

const makeAims = (
  titles: string[],
  linked: string[] = [],
  extra: { isPrivate?: boolean } = {},
) => {
  const state = { n: 0 };
  const seal = (fields: Record<string, unknown>) => fields as never;
  const created = titles.map((title, at) => ({
    kind: 'createTask',
    ref: `$new${at + 1}`,
    title,
    due: null,
    isUrgent: false,
    whoRefs: [],
    placeRefs: [],
    projectRef: null,
    questions: [],
    meeting: null,
    isAim: true,
  }));
  const links = linked.map((title) => ({
    kind: 'updateTask',
    taskId: `old-${title}`,
    title: null,
    due: null,
    hasDue: false,
    isUrgent: null,
    whoRefs: [],
    placeRefs: [],
    isAim: true,
  }));
  const privates = extra.isPrivate
    ? [{ kind: 'setPrivate', taskId: '$new1', isPrivate: true }]
    : [];
  const commands = [...created, ...links, ...privates] as never[];
  const existing = new Map(
    linked.map((title) => [
      `old-${title}`,
      {
        status: 'open' as const,
        due: null,
        isUrgent: false,
        title,
        whoIds: [],
        placeIds: [],
        sealed: {},
      },
    ]),
  );
  const written = planWrites({
    commands,
    existing,
    captureId: 'c1',
    executionId: 'e1',
    now: 5000,
    seal,
    newId: () => `id${++state.n}`,
  });
  const aims = planDayAims({
    dayKey: DAY,
    commands,
    taskIdByRef: written.taskIdByRef,
    existing,
    current: null,
    newAimId: () => `aim${++state.n}`,
    seal,
  });
  return { written, aims, commands, seal };
};

test('the reply to filed aims names them, new and linked', () => {
  assert.equal(
    makeAims(['Finish the deck', 'Call Mom', 'Gym']).aims.line,
    'Added 3 for today: Finish the deck, Call Mom, Gym.',
  );
  assert.equal(makeAims(['Gym']).aims.line, 'Added 1 for today: Gym.');
  assert.equal(makeAims([], ['Call Mom']).aims.line, 'Linked to Call Mom.');
  assert.equal(
    makeAims([], ['Call Mom', 'Gym']).aims.line,
    'Linked to Call Mom and Gym.',
  );
  assert.equal(
    makeAims(['A', 'B'], ['C']).aims.line,
    'Added 2 for today: A, B. Linked to C.',
  );
  assert.equal(
    makeAims(['A', 'B', 'C', 'D', 'E']).aims.line,
    'Added 5 for today: A, B, C and 2 more.',
  );
  assert.equal(
    makeAims(['A', 'B'], [], { isPrivate: true }).aims.line,
    'Added 2 for today.',
  );
});

test('the summary and spoken reply of an aims turn say the aims, not task counts', () => {
  const { written, aims, commands, seal } = makeAims([
    'Finish the deck',
    'Call Mom',
    'Gym',
  ]);
  const execution = buildExecution(written, {
    commands,
    captureId: 'c1',
    now: 5000,
    seal,
    inputMode: 'voice',
    aims,
  }) as { sealed: { summary: string; spoken: string } };
  assert.equal(
    execution.sealed.summary,
    'Added 3 for today: Finish the deck, Call Mom, Gym.',
  );
  assert.equal(
    execution.sealed.spoken,
    'Added 3 for today: Finish the deck, Call Mom, Gym.',
  );
  assert.ok(!/made 3 tasks/i.test(execution.sealed.summary));
});

const failures = tests.flatMap(([name, body]) => {
  try {
    body();
    console.log(`ok   ${name}`);
    return [];
  } catch (error) {
    console.error(`FAIL ${name}\n${(error as Error).message}`);
    return [name];
  }
});

if (failures.length > 0) process.exit(1);
console.log(`check:helm-day-plan: ${tests.length} cases passed.`);
