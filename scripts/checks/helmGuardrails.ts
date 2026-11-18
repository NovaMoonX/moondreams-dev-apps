import assert from 'node:assert/strict';

import { shiftDayKeyBy } from '@/utils/cadenceUtils';

import {
  checkDaily,
  checkOnStart,
  meetsGuardrailBar,
  pickStarted,
  readNameable,
  readStarved,
  type FreeDay,
  type GuardrailInput,
  type GuardrailThing,
} from '../../src/apps/helm/engine/guardrails.ts';
import {
  readTripFit,
  type FitTask,
} from '../../src/apps/helm/engine/freeTime.ts';
import {
  isSameEvidence,
  toPatternFields,
} from '../../src/apps/helm/engine/patternCheck.ts';
import { isEvidenceAsStrong } from '../../src/apps/helm/engine/patterns.ts';
import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import { selectGuardrailRows } from '../../src/apps/helm/store/selectors/patternSelectors.ts';

let failures = 0;
const test = (name: string, run: () => void | Promise<void>) =>
  Promise.resolve()
    .then(run)
    .catch((error) => {
      failures += 1;
      console.error(`FAIL ${name}`);
      console.error(error);
    });

const DAY = 86_400_000;
const TODAY = '2026-11-16';
const ms = (key: string) => Date.parse(`${key}T00:00:00Z`);
const NOW = ms(TODAY) + 12 * 3_600_000;
const ago = (days: number) => NOW - days * DAY;
const recent = [ago(1), ago(2), ago(3)];

const thing = (
  id: string,
  kind: GuardrailThing['kind'],
  rank: number | null,
  more: Partial<GuardrailThing> = {},
): GuardrailThing => ({
  id,
  kind,
  name: id,
  place:
    rank === null
      ? null
      : { rank, words: null, saidAt: 0, until: null, captureId: null },
  goalId: null,
  isCare: false,
  status: 'running',
  date: null,
  createdAt: ago(60),
  activity: recent,
  dates: [],
  isStepDue: null,
  ...more,
});

const QUIET: FreeDay = { minutes: 240, busyShare: 0.2, hasCalendar: true };
const FULL: FreeDay = { minutes: 30, busyShare: 0.9, hasCalendar: true };

const input = (
  things: GuardrailThing[],
  more: Partial<GuardrailInput> = {},
): GuardrailInput => ({
  now: NOW,
  todayKey: TODAY,
  isLearningOn: true,
  things,
  tasks: [],
  freeDay: () => QUIET,
  ...more,
});

const busyFrom = (first: number, count: number) => (key: string) =>
  key >= shiftDayKeyBy(TODAY, first) &&
  key < shiftDayKeyBy(TODAY, first + count)
    ? FULL
    : QUIET;

const goals = [
  thing('g1', 'goal', 4),
  thing('g2', 'goal', 3),
  thing('g3', 'goal', 2),
];
const idleGoals = goals.map((goal) => ({ ...goal, activity: [ago(30)] }));
const fourth = thing('g4', 'goal', null, { createdAt: NOW, activity: [] });
const busy = { freeDay: busyFrom(0, 3) };

const wontFit = () => {
  const deadline = thing('p', 'project', 1, {
    dates: [ms(TODAY) + 3 * DAY],
    activity: [ago(30)],
  });
  const longTasks = ['a', 'b', 'c'].map((id) => ({
    id,
    title: id,
    projectId: 'p',
    dueDay: ms(TODAY) + 2 * DAY,
    minutes: 600 as number | null,
    isLatent: false,
  }));
  return { deadline, longTasks };
};

const run = async () => {
  await test('a fourth goal in a busy stretch gives a hold with two reasons', () => {
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([...goals, fourth], busy),
    );
    assert.ok(found);
    assert.equal(found.moment, 'onStart');
    assert.equal(found.reasons.length, 2);
    assert.equal(found.lines.reasonLine?.split('\n').length, 2);
    assert.deepEqual(found.effect.kind, 'pause');
    assert.equal(found.subject.id, 'g4');
    assert.equal(found.subject.otherId, 'g4');
  });

  await test('one reason alone gives nothing', () => {
    assert.equal(
      checkOnStart({ id: 'g4', kind: 'goal' }, input([...goals, fourth])),
      null,
    );
    assert.equal(
      checkOnStart(
        { id: 'g3', kind: 'goal' },
        input(goals, { freeDay: busyFrom(0, 3) }),
      ),
      null,
    );
    assert.equal(meetsGuardrailBar([{ kind: 'busyStretch' }]), false);
    assert.equal(meetsGuardrailBar([{ kind: 'deadlineWontFit' }]), true);
    assert.equal(
      meetsGuardrailBar([{ kind: 'busyStretch' }, { kind: 'tooManyGoals' }]),
      true,
    );
  });

  await test('health and care are never the subject or named', () => {
    const care = thing('care', 'habit', null, { isCare: true });
    assert.equal(
      checkOnStart(
        { id: 'care', kind: 'habit' },
        input([...goals, fourth, care], busy),
      ),
      null,
    );
    const names = readNameable(input([...goals, fourth, care]), {
      starvedId: null,
      leaveOut: [],
      hasTimeReason: true,
    }).map((one) => one.id);
    assert.equal(names.includes('care'), false);
  });

  await test('the first place in what matters most is never named', () => {
    const names = readNameable(input([...goals, fourth]), {
      starvedId: null,
      leaveOut: [],
      hasTimeReason: true,
    }).map((one) => one.id);
    assert.equal(names.includes('g1'), false);
    assert.deepEqual(names, ['g4']);
    const idle = readNameable(input([...idleGoals, fourth]), {
      starvedId: null,
      leaveOut: [],
      hasTimeReason: true,
    }).map((one) => one.id);
    assert.deepEqual(idle, ['g4', 'g3', 'g2']);
  });

  await test('the named thing is the lowest eligible', () => {
    const found = checkOnStart(
      { id: 'g1', kind: 'goal' },
      input([...goals, fourth], busy),
    );
    assert.equal(found?.subject.id, 'g4');
    assert.equal(found?.subject.otherId, 'g1');
  });

  await test('nothing within 14 days of a date is named', () => {
    const dated = thing('g4', 'goal', null, {
      createdAt: NOW,
      activity: [],
      date: ms(TODAY) + 5 * DAY,
    });
    const names = readNameable(input([...goals, dated]), {
      starvedId: null,
      leaveOut: [],
      hasTimeReason: true,
    }).map((one) => one.id);
    assert.equal(names.includes('g4'), false);
  });

  await test('nothing is shown in the first 7 days or with learning off', () => {
    const young = [...goals, fourth].map((one) => ({
      ...one,
      createdAt: ago(3),
    }));
    assert.equal(
      checkOnStart({ id: 'g4', kind: 'goal' }, input(young, busy)),
      null,
    );
    assert.equal(
      checkOnStart(
        { id: 'g4', kind: 'goal' },
        input([...goals, fourth], { ...busy, isLearningOn: false }),
      ),
      null,
    );
    assert.equal(
      checkDaily(input(young, { ...busy, isLearningOn: false })),
      null,
    );
  });

  await test('a deadline that will not fit is shown alone', () => {
    const { deadline, longTasks } = wontFit();
    const found = checkDaily(
      input([...idleGoals, deadline], { tasks: longTasks }),
    );
    assert.ok(found);
    assert.equal(found.kind, 'deadlineWontFit');
    assert.equal(found.moment, 'daily');
    assert.equal(found.reasons.length, 1);
    assert.notEqual(found.subject.id, 'p');
    assert.notEqual(found.subject.id, 'g1');
  });

  await test('a deadline with under half its lengths known gives nothing', () => {
    const { deadline, longTasks } = wontFit();
    const unknown = longTasks.map((task, at) => ({
      ...task,
      minutes: at === 0 ? 600 : null,
    }));
    assert.equal(
      checkDaily(input([...goals, deadline], { tasks: unknown })),
      null,
    );
  });

  await test('a task is judged only on its own date', () => {
    const task = (due: number | null) => ({
      id: 't',
      title: 't',
      projectId: null,
      dueDay: due,
      minutes: 900 as number | null,
      isLatent: false,
    });
    const found = checkOnStart(
      { id: 't', kind: 'task' },
      input(goals, { tasks: [task(ms(TODAY) + DAY)] }),
    );
    assert.equal(found?.subject.collection, 'tasks');
    assert.equal(found?.effect.kind, 'none');
    assert.equal(
      checkOnStart(
        { id: 't', kind: 'task' },
        input(goals, { tasks: [task(null)] }),
      ),
      null,
    );
  });

  await test('a task date with under half its lengths known gives nothing', () => {
    const task = (id: string, minutes: number | null) => ({
      id,
      title: id,
      projectId: null,
      dueDay: ms(TODAY) + DAY,
      minutes,
      isLatent: false,
    });
    assert.equal(
      checkOnStart(
        { id: 't', kind: 'task' },
        input(goals, {
          tasks: [
            task('t', 900),
            task('u', null),
            task('v', null),
            task('w', null),
          ],
        }),
      ),
      null,
    );
  });

  await test('a project started with a deadline it breaks gives a hold', () => {
    const { deadline, longTasks } = wontFit();
    const found = checkOnStart(
      { id: 'p', kind: 'project' },
      input([...idleGoals, deadline], { tasks: longTasks }),
    );
    assert.ok(found);
    assert.equal(found.moment, 'onStart');
    assert.equal(found.reasons[0].kind, 'deadlineWontFit');
  });

  await test('a habit started in a busy stretch with something starved is held', () => {
    const habit = thing('h', 'habit', null, { createdAt: NOW, activity: [] });
    const starved = thing('s', 'project', 5, { activity: [] });
    const took = thing('b', 'project', 3);
    const found = checkOnStart(
      { id: 'h', kind: 'habit' },
      input([thing('g1', 'goal', 4), starved, took, habit], busy),
    );
    assert.ok(found);
    assert.equal(found.moment, 'onStart');
    assert.equal(found.subject.otherId, 'h');
    assert.equal(found.reasons.length, 2);
  });

  await test('goal load with no date to wait for lasts until picked back up', () => {
    const starved = thing('s', 'project', 5, { activity: [] });
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([starved, ...goals, fourth]),
    );
    assert.ok(found);
    assert.equal(found.effect.kind, 'pause');
    assert.equal(found.effect.kind === 'pause' ? found.effect.until : 0, null);
  });

  await test('on goal load the new goal is held, never a habit being kept up', () => {
    const starved = thing('s', 'project', 5, { activity: [] });
    const stretch = thing('stretch', 'habit', 1, {
      activity: [1, 2, 3, 4, 5].map(ago),
    });
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([starved, ...goals, fourth, stretch]),
    );
    assert.ok(found);
    assert.deepEqual(found.reasons.map((reason) => reason.kind).sort(), [
      'starved',
      'tooManyGoals',
    ]);
    assert.equal(found.subject.id, 'g4');
    assert.equal(found.subject.otherId, 'g4');
  });

  await test('on goal load a clearly idle goal is held instead of the new one', () => {
    const starved = thing('s', 'project', 5, { activity: [] });
    const idle = thing('g3', 'goal', 2, { activity: [ago(40)] });
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([starved, goals[0], goals[1], idle, fourth]),
    );
    assert.ok(found);
    assert.equal(found.subject.id, 'g3');
    assert.equal(found.subject.otherId, 'g4');
  });

  await test('a habit is offered only when a reason is about time', () => {
    const stretch = thing('stretch', 'habit', null, { activity: [] });
    const base = input([...idleGoals, fourth, stretch]);
    const ids = (hasTimeReason: boolean) =>
      readNameable(base, { starvedId: null, leaveOut: [], hasTimeReason }).map(
        (one) => one.id,
      );
    assert.equal(ids(false).includes('stretch'), false);
    assert.equal(ids(true).includes('stretch'), true);
  });

  await test('a thing being kept up is never named', () => {
    const names = readNameable(input([...goals, fourth]), {
      starvedId: null,
      leaveOut: [],
      hasTimeReason: true,
    }).map((one) => one.id);
    assert.equal(names.includes('g3'), false);
    assert.equal(names.includes('g2'), false);
  });

  await test('the comes-first reason never names what comes first', () => {
    const starved = thing('s', 'project', 5, { activity: [] });
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([starved, ...goals, fourth]),
    );
    const line = found?.lines.reasonLine ?? '';
    assert.equal(line.includes('s comes first'), false);
    assert.ok(line.includes('What matters most has had nothing done in'));
  });

  await test('a pattern written before reasons reads as none', () => {
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([...goals, fourth], busy),
    );
    assert.ok(found);
    assert.deepEqual(
      toPatternFields(found, { now: NOW, privacy: 'ordinary' }).reasons,
      [],
    );
  });

  await test('the start pick is goal, then project, then habit, then task', () => {
    const records = [
      { id: 't', kind: 'task' as const },
      { id: 'h', kind: 'habit' as const },
      { id: 'p', kind: 'project' as const },
      { id: 'g', kind: 'goal' as const },
    ];
    assert.equal(pickStarted(records)?.id, 'g');
    assert.equal(pickStarted(records.slice(0, 3))?.id, 'p');
    assert.equal(pickStarted(records.slice(0, 2))?.id, 'h');
    assert.equal(pickStarted([]), null);
  });

  await test('load evidence is the same when only the day it was read changes', () => {
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([...goals, fourth], busy),
    );
    assert.ok(found?.evidence.kind === 'load');
    assert.equal(
      isSameEvidence(found.evidence, { ...found.evidence, asOf: NOW + DAY }),
      true,
    );
    assert.equal(
      isSameEvidence(found.evidence, { ...found.evidence, measured: 99 }),
      false,
    );
  });

  await test('starved is read from the order', () => {
    const starved = thing('s', 'project', 5, { activity: [] });
    const took = thing('b', 'project', 3);
    const found = readStarved(input([starved, took]));
    assert.equal(found?.starvedId, 's');
    assert.equal(found?.tookId, 'b');
    assert.equal(
      readStarved(input([thing('s', 'project', null, { activity: [] }), took])),
      null,
    );
  });

  await test('the signature ignores the stretch dates', () => {
    const things = [...goals, fourth];
    const first = checkOnStart({ id: 'g4', kind: 'goal' }, input(things, busy));
    const later = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input(things, { freeDay: busyFrom(1, 4) }),
    );
    assert.ok(first && later);
    assert.notDeepEqual(first.bucket, later.bucket);
    assert.equal(first.signature, later.signature);
  });

  await test('after a no, load evidence returns only stronger and later', () => {
    const things = [...goals, fourth];
    const shown = checkOnStart({ id: 'g4', kind: 'goal' }, input(things, busy));
    assert.ok(shown);
    const since = NOW;
    const same = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input(things, { ...busy, now: NOW }),
    );
    assert.ok(same);
    assert.equal(
      isEvidenceAsStrong(shown.evidence, same.evidence, since),
      false,
    );
    const later = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input(things, { ...busy, now: NOW + 1000 }),
    );
    assert.ok(later);
    assert.equal(
      isEvidenceAsStrong(shown.evidence, later.evidence, since),
      true,
    );
    assert.equal(
      isEvidenceAsStrong(
        { ...later.evidence, measured: 6 } as typeof later.evidence,
        { ...later.evidence, measured: 3 } as typeof later.evidence,
        since,
      ),
      false,
    );
  });

  await test('a start-time check never names something finished', () => {
    const finished = { ...fourth, status: 'out' as const };
    assert.equal(
      checkOnStart(
        { id: 'g4', kind: 'goal' },
        input([...goals, finished], busy),
      ),
      null,
    );
  });

  await test('the goals reason names what it has and says "including" when short', () => {
    const copy = HELM_COPY.guardrailGoalsReason;
    assert.equal(copy(2, ['A', 'B']), '2 goals already going: A and B.');
    assert.equal(copy(3, ['A']), '3 goals already going, including A.');
    assert.equal(
      copy(5, ['A', 'B', 'C', 'D', 'E']),
      '5 goals already going, including A, B, and C.',
    );
    assert.equal(copy(3, []), '3 goals already going.');
    const found = checkOnStart(
      { id: 'g4', kind: 'goal' },
      input([...goals, fourth], busy),
    );
    assert.equal(
      found?.lines.reasonLine
        ?.split('\n')
        .find((line) => line.includes('goals')),
      '3 goals already going: g1, g2, and g3.',
    );
  });

  await test('a guardrail still asking about something finished, paused or gone is not shown as asking', () => {
    const pattern = (id: string, subjectId: string) =>
      ({
        id,
        kind: 'tooManyGoals',
        statement: 'Pause it?',
        state: 'suggested',
        offReason: null,
        confirmedAt: null,
        stateAt: 1,
        moment: 'daily',
        isUnreadable: false,
        createdAt: 1,
        subject: {
          collection: 'projects',
          id: subjectId,
          windowId: null,
          otherId: null,
        },
      }) as never;
    const item = (id: string, status: string) => ({
      id,
      status,
      isUnreadable: false,
    });
    const rows = selectGuardrailRows({
      helm: {
        profile: null,
        answeringPatternIds: ['saving'],
        patterns: {
          items: [
            pattern('live', 'a'),
            pattern('done', 'b'),
            pattern('paused', 'c'),
            pattern('gone', 'z'),
            pattern('saving', 'c'),
          ],
        },
        projects: {
          items: [
            item('a', 'active'),
            item('b', 'finished'),
            item('c', 'paused'),
          ],
        },
        habits: { items: [] },
        openTasks: { items: [] },
      },
    } as never);
    const by = Object.fromEntries(
      rows.map((row) => [row.pattern.id, row.pattern.state]),
    );
    assert.deepEqual(by, {
      live: 'suggested',
      paused: 'retired',
      saving: 'suggested',
    });
    assert.equal(
      rows.find((row) => row.pattern.id === 'paused')?.isUsed,
      false,
    );
  });

  const fitTask = (id: string, more: Partial<FitTask> = {}): FitTask => ({
    id,
    projectId: null,
    dueDay: null,
    minutes: 30,
    isLatent: false,
    ...more,
  });
  const dayMs = (offset: number) => ms(shiftDayKeyBy(TODAY, offset));
  const trip = (firstOffset: number, lastOffset: number) => ({
    firstDay: shiftDayKeyBy(TODAY, firstOffset),
    lastDay: shiftDayKeyBy(TODAY, lastOffset),
  });
  const base = { todayKey: TODAY, things: [], freeDay: () => QUIET };

  await test('a trip lists overdue and in-range tasks soonest first, not undated, latent or later ones', () => {
    const fit = readTripFit({
      ...base,
      tasks: [
        fitTask('soon', { dueDay: dayMs(3) }),
        fitTask('overdue', { dueDay: dayMs(-2), minutes: 60 }),
        fitTask('undated'),
        fitTask('latent', { dueDay: dayMs(1), isLatent: true }),
        fitTask('later', { dueDay: dayMs(10) }),
        fitTask('unsized', { dueDay: dayMs(5), minutes: null }),
      ],
      range: trip(4, 6),
      events: [],
    });
    assert.deepEqual(
      fit.mustDoFirst.map((task) => [task.id, task.minutes]),
      [
        ['overdue', 60],
        ['soon', 30],
        ['unsized', 30],
      ],
    );
    assert.equal(fit.workMinutes, 120);
    assert.equal(fit.freeMinutesBefore, 4 * 240);
    assert.equal(fit.isWontFit, false);
  });

  await test('leaving today leaves no free time before, and a long list does not fit', () => {
    const fit = readTripFit({
      ...base,
      tasks: [fitTask('a', { dueDay: dayMs(1), minutes: 90 })],
      range: trip(0, 2),
      events: [],
    });
    assert.equal(fit.freeMinutesBefore, 0);
    assert.equal(fit.hasCalendar, true);
    assert.equal(fit.isWontFit, true);
  });

  await test("tasks with no length do not make a trip a won't-fit", () => {
    const fit = readTripFit({
      ...base,
      tasks: [
        fitTask('a', { dueDay: dayMs(1), minutes: null }),
        fitTask('b', { dueDay: dayMs(1), minutes: null }),
      ],
      range: trip(1, 2),
      events: [],
    });
    assert.equal(fit.isWontFit, false);
    assert.equal(fit.mustDoCount, 2);
    assert.deepEqual(
      fit.mustDoFirst.map((task) => task.isOverdue),
      [false, false],
    );
  });

  await test('leaving today with no calendar says so, and overdue tasks are marked', () => {
    const fit = readTripFit({
      ...base,
      freeDay: () => ({ minutes: 0, busyShare: 0, hasCalendar: false }),
      tasks: [fitTask('a', { dueDay: dayMs(-1) })],
      range: trip(0, 2),
      events: [],
    });
    assert.equal(fit.hasCalendar, false);
    assert.equal(fit.mustDoFirst[0].isOverdue, true);
  });

  await test('a deadline after the trip fits at home and does not once the days away count as full', () => {
    const project = thing('p', 'project', null, { dates: [dayMs(8)] });
    const tasks = ['a', 'b', 'c'].map((id) =>
      fitTask(id, { projectId: 'p', minutes: 60 }),
    );
    const hourADay = () => ({ minutes: 60, busyShare: 0.5, hasCalendar: true });
    const home = readTripFit({
      todayKey: TODAY,
      things: [project],
      tasks,
      freeDay: hourADay,
      range: trip(20, 21),
      events: [],
    });
    assert.deepEqual(home.deadlines, []);
    const away = readTripFit({
      todayKey: TODAY,
      things: [project],
      tasks,
      freeDay: hourADay,
      range: trip(1, 7),
      events: [],
    });
    assert.equal(away.deadlines.length, 1);
    assert.equal(away.deadlines[0].isBecauseAway, true);
    assert.equal(away.deadlines[0].freeMinutes, 120);
  });

  await test('only events inside the days away would move', () => {
    const fit = readTripFit({
      ...base,
      tasks: [],
      range: trip(2, 3),
      events: [
        { id: 'before', dayKey: shiftDayKeyBy(TODAY, 1) },
        { id: 'first', dayKey: shiftDayKeyBy(TODAY, 2) },
        { id: 'last', dayKey: shiftDayKeyBy(TODAY, 3) },
        { id: 'after', dayKey: shiftDayKeyBy(TODAY, 4) },
      ],
    });
    assert.deepEqual(fit.wouldMove, ['first', 'last']);
  });
};

await run();
if (failures > 0) {
  console.error(`check:helm-guardrails: ${failures} failed`);
  process.exit(1);
}
console.log('check:helm-guardrails: ok');
