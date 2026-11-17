import assert from 'node:assert/strict';

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

test('a day with no aims plans back to back as before', () => {
  const result = run(base({ tasks: [task('a'), task('b')] }));
  assert.equal(startOf(result, 'b'), at('08:30'));
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
    "These fit. “Gym” doesn't today unless you move “Team call”.",
  );
  assert.equal(describeFit(titles, [], {}), 'These fit.');
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
