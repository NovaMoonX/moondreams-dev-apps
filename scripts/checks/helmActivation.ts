import assert from 'node:assert/strict';

import {
  getTaskActivity,
  splitByActivity,
} from '../../src/apps/helm/engine/activation.ts';
import { selectTaskActivity } from '../../src/apps/helm/store/selectors/taskSelectors.ts';
import type { OpenTask } from '../../src/apps/helm/types.ts';

const NOW = Date.UTC(2026, 10, 9, 17, 0);
const TODAY = Date.UTC(2026, 10, 9);
const TOMORROW = Date.UTC(2026, 10, 10);
const YESTERDAY = Date.UTC(2026, 10, 8);
const LA = { now: NOW, timeZone: 'America/Los_Angeles' };

const task = (id: string, fields: Partial<OpenTask> = {}) =>
  ({
    id,
    notUntil: null,
    waitsOnTaskIds: [],
    waitsOnWhoId: null,
    ...fields,
  }) as OpenTask;

const activity = (
  input: OpenTask,
  open: string[] = [],
  at: { now: number; timeZone: string } = LA,
) => getTaskActivity(input, new Set(open), at);

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

test('a task with no condition is active', () => {
  assert.deepEqual(activity(task('a')), { kind: 'active' });
});

test('a not-until tomorrow is not yet, with its day', () => {
  assert.deepEqual(activity(task('a', { notUntil: TOMORROW })), {
    kind: 'notYet',
    until: TOMORROW,
  });
});

test('a not-until today wakes at the start of that day in the zone', () => {
  const input = task('a', { notUntil: TODAY });
  assert.equal(activity(input).kind, 'active');
  const before = Date.UTC(2026, 10, 9, 7, 0);
  assert.equal(
    activity(input, [], { now: before, timeZone: 'America/Los_Angeles' }).kind,
    'notYet',
  );
  assert.equal(
    activity(input, [], { now: before, timeZone: 'Asia/Tokyo' }).kind,
    'active',
  );
});

test('a past not-until is active', () => {
  assert.equal(activity(task('a', { notUntil: YESTERDAY })).kind, 'active');
});

test('waiting on an open task is waiting', () => {
  assert.deepEqual(activity(task('a', { waitsOnTaskIds: ['b'] }), ['a', 'b']), {
    kind: 'waiting',
    onTaskIds: ['b'],
    onWhoId: null,
  });
});

test('a waited task that is not open has ended', () => {
  assert.equal(
    activity(task('a', { waitsOnTaskIds: ['b'] }), ['a']).kind,
    'active',
  );
});

test('past the cap an unknown waited task still reads as open', () => {
  const full = Array.from({ length: 150 }, (_, index) => task(`t${index}`));
  const waiter = task('w', { waitsOnTaskIds: ['unseen'] });
  const result = splitByActivity([...full.slice(1), waiter], LA);
  assert.equal(result.byId.get('w')?.kind, 'waiting');
  const short = splitByActivity([task('a'), waiter], LA);
  assert.equal(short.byId.get('w')?.kind, 'active');
});

test('only the still-open waited tasks are named', () => {
  const result = activity(task('a', { waitsOnTaskIds: ['b', 'c'] }), [
    'a',
    'c',
  ]);
  assert.deepEqual(result, {
    kind: 'waiting',
    onTaskIds: ['c'],
    onWhoId: null,
  });
});

test('waiting on itself is ignored', () => {
  assert.equal(
    activity(task('a', { waitsOnTaskIds: ['a'] }), ['a']).kind,
    'active',
  );
});

test('waiting on a person holds until it is cleared', () => {
  assert.deepEqual(activity(task('a', { waitsOnWhoId: 'who-1' })), {
    kind: 'waiting',
    onTaskIds: [],
    onWhoId: 'who-1',
  });
  assert.equal(activity(task('a', { waitsOnWhoId: null })).kind, 'active');
});

test('not yet wins over waiting, and waiting shows once the day comes', () => {
  const input = task('a', { notUntil: TOMORROW, waitsOnWhoId: 'who-1' });
  assert.equal(activity(input).kind, 'notYet');
  const after = { now: NOW + 24 * 3_600_000, timeZone: 'America/Los_Angeles' };
  assert.equal(activity(input, [], after).kind, 'waiting');
});

test('splitting keeps the order and takes latent tasks out of active', () => {
  const tasks = [
    task('a'),
    task('b', { notUntil: TOMORROW }),
    task('c'),
    task('d', { waitsOnTaskIds: ['a'] }),
  ];
  const result = splitByActivity(tasks, LA);
  assert.deepEqual(
    result.active.map((entry) => entry.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    result.latent.map((entry) => entry.task.id),
    ['b', 'd'],
  );
  assert.equal(result.byId.get('d')?.kind, 'waiting');
});

test('the selector holds within a minute and wakes across midnight in its zone', () => {
  const tasks = [task('a', { notUntil: TOMORROW })];
  const state = (zone: string) =>
    ({
      helm: { openTasks: { items: tasks }, profile: { timeZone: zone } },
    }) as unknown as Parameters<typeof selectTaskActivity>[0];
  const first = selectTaskActivity(state('America/Los_Angeles'), NOW);
  assert.equal(selectTaskActivity(state('America/Los_Angeles'), NOW), first);
  assert.equal(first.active.length, 0);
  const midnight = Date.UTC(2026, 10, 10, 8, 0);
  const woke = selectTaskActivity(state('America/Los_Angeles'), midnight);
  assert.equal(woke.active.length, 1);
  assert.equal(tasks[0].notUntil, TOMORROW);
});

const failures = tests.flatMap(([name, run]) => {
  try {
    run();
    console.log(`ok   ${name}`);
    return [];
  } catch (error) {
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
    return [name];
  }
});
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
