import assert from 'node:assert/strict';

import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';
import {
  findFreeGaps,
  findOpenings,
  planDay,
  type BusyBlock,
  type PlannerInput,
  type PlannerTask,
} from '../../src/apps/helm/engine/planner.ts';
import type { PlanSlot } from '../../src/apps/helm/types.ts';

const ZONE = 'America/Los_Angeles';
const DAY = '2026-11-10';
const MIN = 60_000;
const at = (time: string, day = DAY) => zonedDateTimeToEpoch(day, time, ZONE);
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

const makeIds = () => {
  const state = { count: 0 };
  return () => `slot${++state.count}`;
};

const task = (id: string, extra: Partial<PlannerTask> = {}): PlannerTask => ({
  id,
  title: id,
  due: null,
  importance: null,
  isUrgent: false,
  durationMinutes: 30,
  energy: null,
  ...extra,
});

const busy = (from: string, to: string, title = 'Meeting'): BusyBlock => ({
  startAt: at(from),
  endAt: at(to),
  title,
});

const slot = (taskId: string, status: PlanSlot['status'], from: string) => ({
  taskId,
  startAt: at(from),
  endAt: at(from) + 30 * MIN,
  status,
  source: 'nomos' as const,
  decidedAt: null,
});

const base = (extra: Partial<PlannerInput> = {}): PlannerInput => ({
  dayKey: DAY,
  timeZone: ZONE,
  now: at('06:00'),
  dayStartTime: '08:00',
  dayEndTime: '21:00',
  fillPercent: 100,
  hasCalendar: true,
  busy: [],
  slots: {},
  tasks: [],
  ...extra,
});

const taskIdsOf = (result: ReturnType<typeof planDay>) =>
  Object.values(result.slots)
    .filter((entry) => entry.status === 'suggested')
    .sort((first, second) => (first.startAt ?? 0) - (second.startAt ?? 0))
    .map((entry) => entry.taskId);

const run = (input: PlannerInput) => planDay(input, makeIds());

{
  const result = run(base({ tasks: [task('a')] }));
  assert.equal(result.outcome, 'planned');
  const [entry] = Object.entries(result.slots);
  assert.equal(entry[1].startAt, at('08:00'));
  assert.equal(entry[1].endAt, at('08:30'));
  assert.equal(entry[1].source, 'nomos');
  assert.match(result.reasons[entry[0]], /^30 min · /);
}

{
  const tasks = ['a', 'b', 'c', 'd', 'e'].map((id) => task(id));
  assert.equal(taskIdsOf(run(base({ tasks }))).length, 3);
}

{
  const tasks = ['a', 'b', 'c'].map((id) => task(id, { durationMinutes: 60 }));
  const input = base({
    tasks,
    busy: [busy('08:00', '10:00'), busy('12:00', '21:00')],
  });
  // free 10:15..11:45 = 90 min; 50% budget = 45 min: a 60 min task never fits
  assert.equal(run({ ...input, fillPercent: 50 }).outcome, 'nothing');
  assert.equal(taskIdsOf(run({ ...input, fillPercent: 100 })).length, 1);
  const small = ['a', 'b', 'c'].map((id) => task(id, { durationMinutes: 20 }));
  const half = run(
    base({
      tasks: small,
      busy: [busy('08:00', '10:00'), busy('12:00', '21:00')],
      fillPercent: 50,
    }),
  );
  assert.equal(taskIdsOf(half).length, 2); // 45 min budget fits two 20 min tasks
  assert.equal(run(base({ tasks: small, fillPercent: 0 })).outcome, 'nothing');
}

{
  assert.deepEqual(run(base({ now: at('21:00'), tasks: [task('a')] })), {
    slots: {},
    reasons: {},
    outcome: 'late',
  });
  assert.equal(
    run(base({ now: at('22:30'), tasks: [task('a')] })).outcome,
    'late',
  );
  assert.equal(
    run(base({ dayKey: '2026-11-09', tasks: [task('a')] })).outcome,
    'past',
  );
}

{
  const result = run(base({ now: at('12:07'), tasks: [task('a')] }));
  assert.equal(Object.values(result.slots)[0].startAt, at('12:10'));
  const tomorrow = run(
    base({ dayKey: '2026-11-11', now: at('12:07'), tasks: [task('a')] }),
  );
  assert.equal(
    Object.values(tomorrow.slots)[0].startAt,
    at('08:00', '2026-11-11'),
  );
}

{
  const slots = {
    k: slot('keep', 'kept', '09:00'),
    n: slot('skip', 'notToday', '10:00'),
    s: slot('old', 'suggested', '13:00'),
  };
  const result = run(
    base({
      slots,
      tasks: [task('keep'), task('skip'), task('old'), task('new')],
    }),
  );
  assert.deepEqual(result.slots.k, slots.k);
  assert.deepEqual(result.slots.n, slots.n);
  assert.equal(result.slots.s, undefined);
  assert.deepEqual(taskIdsOf(result).sort(), ['new', 'old']);
  // kept slot 09:00-09:30 buffers to 08:45..09:45; first gap is 08:00..08:45
  const first = Object.values(result.slots).find(
    (entry) => entry.status === 'suggested' && entry.startAt === at('08:00'),
  );
  assert.ok(first);
}

{
  const result = run(
    base({
      busy: [busy('09:00', '10:00', 'Standup')],
      tasks: [
        task('a', { durationMinutes: 45 }),
        task('b', { durationMinutes: 45 }),
      ],
    }),
  );
  const starts = taskIdsOf(result).map(
    (id) =>
      Object.values(result.slots).find((entry) => entry.taskId === id)?.startAt,
  );
  assert.equal(starts[0], at('08:00'));
  assert.equal(starts[1], at('10:15'));
  const reasons = Object.values(result.reasons);
  assert.match(reasons[0], /^45 min · fits before Standup$/);
  assert.ok(
    reasons.some((reason) => reason === '45 min · fits before Standup'),
  );
}

{
  const input = base({
    busy: [busy('08:00', '09:00', 'Gym'), busy('10:00', '21:00')],
    tasks: [
      task('long', { durationMinutes: 60 }),
      task('short', { durationMinutes: 20 }),
    ],
  });
  // gap 09:15..09:45 = 30 min; 60 min skipped, 20 min fits
  const result = run(input);
  assert.deepEqual(taskIdsOf(result), ['short']);
  assert.equal(Object.values(result.reasons)[0], '20 min · fits after Gym');
}

{
  const result = run(base({ tasks: [task('a', { durationMinutes: null })] }));
  const [id] = Object.keys(result.slots);
  assert.equal(result.slots[id].endAt! - result.slots[id].startAt!, 30 * MIN);
  assert.equal(
    result.reasons[id],
    'about 30 min · estimate · Worth doing today',
  );
}

{
  const input = base({
    busy: [busy('08:00', '09:00'), busy('10:00', '21:00')],
    tasks: [
      task('plain'),
      task('low', { energy: 'low', importance: 'must' }),
      task('high', { energy: 'high' }),
    ],
  });
  const wide = {
    ...input,
    busy: [
      busy('08:00', '09:00'),
      busy('10:00', '13:00'),
      busy('15:00', '21:00'),
    ],
  };
  const result = run(wide);
  const startOf = (id: string) =>
    Object.values(result.slots).find((entry) => entry.taskId === id)?.startAt;
  assert.ok(startOf('high')! < startOf('plain')!);
  assert.ok(startOf('plain')! < startOf('low')!);
  assert.equal(startOf('high'), at('09:15'));
  assert.equal(startOf('plain'), at('13:15'));
  assert.equal(startOf('low'), at('13:45'));
}

{
  const day = dayMs('2026-11-10');
  const DAYS = 86_400_000;
  const tasks = [
    task('none'),
    task('could', { importance: 'could' }),
    task('urgent', { isUrgent: true }),
    task('must', { importance: 'must' }),
    task('soon', { due: { kind: 'day', date: day + 3 * DAYS } }),
    task('today', { due: { kind: 'day', date: day } }),
    task('overdue', { due: { kind: 'day', date: day - DAYS } }),
    task('sooner', { due: { kind: 'day', date: day + 2 * DAYS } }),
  ];
  const ranked = (list: PlannerTask[]) =>
    taskIdsOf(run(base({ tasks: list, hasCalendar: false })));
  assert.deepEqual(ranked(tasks), ['overdue', 'today', 'sooner']);
  const rest = tasks.filter((entry) => !entry.due);
  assert.deepEqual(ranked(rest), ['must', 'could', 'urgent']);
  assert.deepEqual(ranked(rest.slice(0, 3).reverse().concat(rest[3])), [
    'must',
    'could',
    'urgent',
  ]);
}

{
  const result = run(
    base({
      hasCalendar: false,
      tasks: [
        task('a', { due: { kind: 'day', date: dayMs('2026-11-09') } }),
        task('b', { importance: 'must' }),
      ],
    }),
  );
  assert.deepEqual(
    Object.values(result.slots).map((entry) => [entry.startAt, entry.endAt]),
    [
      [null, null],
      [null, null],
    ],
  );
  assert.deepEqual(Object.values(result.reasons), ['Overdue', 'Must do']);
  assert.equal(run(base({ hasCalendar: false })).outcome, 'nothing');
}

{
  const full = run(
    base({ busy: [busy('08:00', '21:00')], tasks: [task('a')] }),
  );
  assert.equal(full.outcome, 'full');
  assert.deepEqual(full.slots, {});
  assert.equal(
    run(base({ busy: [busy('08:10', '20:50')], tasks: [task('a')] })).outcome,
    'full',
  );
}

{
  const input = base({
    busy: [busy('09:00', '10:00', 'Standup')],
    slots: { k: slot('other', 'kept', '11:00') },
  });
  const openings = findOpenings(input, task('a', { durationMinutes: 30 }), 4);
  assert.equal(openings.length, 4);
  assert.deepEqual(openings[0], { startAt: at('08:00'), endAt: at('08:30') });
  assert.equal(openings[1].startAt, at('10:15'));
  assert.ok(
    openings.every(
      (entry, index) =>
        index === 0 || entry.startAt > openings[index - 1].startAt,
    ),
  );
  assert.ok(
    openings.every(
      (entry) => entry.endAt <= at('08:45') || entry.startAt >= at('10:15'),
    ),
  );
  assert.ok(
    openings.every(
      (entry) => entry.endAt <= at('10:45') || entry.startAt >= at('11:45'),
    ),
  );
  // the task's own kept slot isn't an obstacle for itself
  const own = findOpenings(
    { ...input, slots: { k: slot('a', 'kept', '08:00') } },
    task('a'),
    1,
  );
  assert.equal(own[0].startAt, at('08:00'));
  assert.deepEqual(
    findOpenings({ ...input, now: at('22:00') }, task('a'), 3),
    [],
  );
}

{
  const input = {
    dayKey: DAY,
    timeZone: ZONE,
    now: at('06:00'),
    dayStartTime: '08:00',
    dayEndTime: '21:00',
    busy: [
      busy('09:00', '10:00'),
      busy('10:30', '12:00'),
      busy('18:00', '19:00'),
    ],
  };
  assert.deepEqual(findFreeGaps(input, 45), [
    { startAt: at('08:00'), endAt: at('09:00') },
    { startAt: at('12:00'), endAt: at('18:00') },
    { startAt: at('19:00'), endAt: at('21:00') },
  ]);
  assert.equal(
    findFreeGaps({ ...input, now: at('17:00') }, 45)[0].startAt,
    at('17:00'),
  );
  assert.equal(findFreeGaps({ ...input, now: at('20:30') }, 45).length, 0);
}

{
  const dst = '2026-03-08';
  const input = {
    dayKey: dst,
    timeZone: ZONE,
    now: at('06:00', '2026-03-07'),
    dayStartTime: '01:00',
    dayEndTime: '04:00',
    busy: [],
  };
  const [gap] = findFreeGaps(input, 30);
  assert.equal((gap.endAt - gap.startAt) / MIN, 120);
}

console.log('check:helm-planner: planner rules hold.');
