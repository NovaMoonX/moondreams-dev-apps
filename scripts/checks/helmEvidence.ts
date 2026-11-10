import assert from 'node:assert/strict';

import { HELM_COPY } from '@apps/helm/constants';
import { selectProjectEvidence } from '@apps/helm/engine/projectEvidence';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 10, 18);
const TIME_ZONE = 'UTC';
const day = (offset: number) => Date.UTC(2026, 10, 10 + offset);
const ago = (days: number) => NOW - days * DAY;

const project = {
  id: 'p1',
  whoRoles: { dana: 'key', maya: 'involved' } as const,
  roleNotes: { dana: 'florist' },
  createdAt: ago(40),
};
const whoNames = new Map([
  ['dana', 'Dana'],
  ['maya', 'Maya'],
]);
const open = (
  extra: Partial<
    Parameters<typeof selectProjectEvidence>[0]['tasks'][number]
  > = {},
) => ({
  projectId: 'p1',
  status: 'open' as const,
  due: null,
  whoIds: [],
  completedAt: null,
  ...extra,
});
const done = (daysAgo: number) =>
  open({ status: 'done', completedAt: ago(daysAgo) });
const read = (
  tasks: ReturnType<typeof open>[],
  overrides: Partial<typeof project> = {},
) =>
  selectProjectEvidence({
    project: { ...project, ...overrides },
    tasks,
    whoNames,
    now: NOW,
    timeZone: TIME_ZONE,
  });
const texts = (tasks: ReturnType<typeof open>[], overrides = {}) =>
  read(tasks, overrides).parts.map((part) => part.text);

test('every task done offers to finish', () => {
  const evidence = read([done(1), done(5)]);
  assert.deepEqual(
    evidence.parts.map((part) => part.text),
    [HELM_COPY.projectAllDone],
  );
  assert.equal(evidence.canFinish, true);
  assert.equal(
    HELM_COPY.projectAllDone,
    'Everything is done. Finish this project?',
  );
});

test('a project with no tasks is on track, not finished', () => {
  const evidence = read([]);
  assert.deepEqual(
    evidence.parts.map((part) => part.text),
    ['On track: nothing overdue'],
  );
  assert.equal(evidence.canFinish, false);
});

test('overdue tasks are counted and are the only warning-coloured part', () => {
  const evidence = read([
    open({ due: { kind: 'day', date: day(-2) } }),
    open({ due: { kind: 'moment', at: ago(1) } }),
    open({ due: { kind: 'day', date: day(0) } }),
    done(1),
  ]);
  assert.equal(evidence.parts[0].text, '2 overdue');
  assert.deepEqual(
    evidence.parts.map((part) => part.tone),
    evidence.parts.map((_, index) => (index === 0 ? 'warning' : 'muted')),
  );
});

test('a day due today is not overdue until the day ends', () => {
  assert.deepEqual(
    texts([open({ due: { kind: 'day', date: day(0) } }), done(1)]),
    ['On track: nothing overdue'],
  );
});

test('a key person with open tasks is named with their note', () => {
  assert.deepEqual(
    texts([open({ whoIds: ['dana'] }), open({ whoIds: ['dana'] }), done(2)]),
    ['Dana (florist) has 2 open'],
  );
});

test('an involved person is not named, and a key person with nothing open is not either', () => {
  assert.deepEqual(texts([open({ whoIds: ['maya'] }), done(2)]), [
    'On track: nothing overdue',
  ]);
  assert.deepEqual(texts([open(), done(2)], { roleNotes: {} }), [
    'On track: nothing overdue',
  ]);
});

test('a key person without a note reads without brackets', () => {
  assert.deepEqual(
    texts([open({ whoIds: ['dana'] }), done(2)], { roleNotes: {} }),
    ['Dana has 1 open'],
  );
});

test('twelve quiet days with open tasks says so', () => {
  assert.deepEqual(texts([open(), open(), open(), done(12)]), [
    'Nothing done in 12 days · 3 open',
  ]);
});

test('nine quiet days is not quiet yet, ten is', () => {
  assert.deepEqual(texts([open(), done(9)]), ['On track: nothing overdue']);
  assert.deepEqual(texts([open(), done(10)]), [
    'Nothing done in 10 days · 1 open',
  ]);
});

test('with nothing done yet, the quiet count starts from when it was made', () => {
  assert.deepEqual(texts([open()], { createdAt: ago(14) }), [
    'Nothing done in 14 days · 1 open',
  ]);
});

test('no more than two parts, overdue first', () => {
  const parts = texts([
    open({ due: { kind: 'day', date: day(-3) }, whoIds: ['dana'] }),
    done(20),
  ]);
  assert.deepEqual(parts, ['1 overdue', 'Dana (florist) has 1 open']);
});

test("another project's tasks are ignored", () => {
  assert.deepEqual(
    texts([
      open({ projectId: 'p2', due: { kind: 'day', date: day(-5) } }),
      done(1),
    ]),
    [HELM_COPY.projectAllDone],
  );
});

test('the line never carries a percentage or a bar', () => {
  const lines = [
    texts([done(1), done(2), open()]),
    texts([open({ due: { kind: 'day', date: day(-1) } }), done(30)]),
    texts([]),
  ].flat();
  lines.forEach((line) => assert.doesNotMatch(line, /%|█|▓|\/\d/));
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
