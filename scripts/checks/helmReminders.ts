// A habit day's reminders: each pace and stage's fire time, quiet hours, bundling, the cap, both clock changes, a window that keeps itself, tallies, the idle rule, the diff and the words.
// Run under two machine zones: the planner reads zones by name, never the machine's.
import assert from 'node:assert/strict';

import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';
import { shiftDayKeyBy } from '../../src/utils/cadenceUtils.ts';
import type { LifeDay } from '../../src/apps/helm/engine/habitLife.ts';
import {
  HABIT_REMINDERS_IDLE_DAYS,
  HABIT_REMINDERS_PER_DAY,
  HABIT_REMINDER_WORDS,
  diffSlots,
  isRemindersIdle,
  lockScreenBody,
  planHabitDay,
  reminderBody,
  type ReminderHabit,
  type ReminderProfile,
  type WantedSlot,
} from '../../src/apps/helm/engine/habitReminders.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const LA = 'America/Los_Angeles';
const DAY = '2026-06-10';
const at = (day: string, time: string, zone = LA) =>
  zonedDateTimeToEpoch(day, time, zone);

const profile = (extra: Partial<ReminderProfile> = {}): ReminderProfile => ({
  timeZone: LA,
  dayStartTime: '07:00',
  dayEndTime: '22:00',
  quietHours: null,
  remindersPausedAt: null,
  habitRemindersIdleAt: null,
  ...extra,
});

const habit = (
  id: string,
  extra: Partial<ReminderHabit> = {},
  reminder: Partial<NonNullable<ReminderHabit['reminder']>> = {},
): ReminderHabit => ({
  id,
  status: 'active',
  cadence: { kind: 'everyDay' },
  windowState: {
    m: {
      start: '07:00',
      end: '10:00',
      order: 0,
      part: 'morning',
      editedAt: null,
    },
  },
  timesPerDay: null,
  startsOn: Date.UTC(2026, 0, 1),
  endsOn: null,
  isCare: false,
  forWhoId: null,
  stage: 'building',
  stageAt: 0,
  stageWeek: null,
  rejudgeFrom: null,
  formedAt: null,
  reminder: {
    isOn: true,
    pace: 'adaptive',
    anyTimeAt: null,
    allowQuietHours: false,
    ...reminder,
  },
  ...extra,
});

const noWindow = { windowState: {} };

const busy = (day: string): Record<string, LifeDay> =>
  Object.fromEntries(
    Array.from({ length: 22 }, (_, back): [string, LifeDay] => [
      shiftDayKeyBy(day, -back),
      { isInUse: true, entries: {} },
    ]),
  );

const plan = (
  habits: ReminderHabit[],
  options: {
    day?: string;
    now?: number;
    profile?: ReminderProfile;
    days?: Record<string, LifeDay>;
  } = {},
) => {
  const day = options.day ?? DAY;
  return planHabitDay({
    now: options.now ?? at(day, '03:00'),
    dayKey: day,
    profile: options.profile ?? profile(),
    habits,
    days: options.days ?? busy(day),
  });
};

const fireOf = (habits: ReminderHabit[], day = DAY) =>
  plan(habits, { day }).map((slot) => slot.fireAt);

test('each pace and stage fires at its table time for a window', () => {
  const morning = (
    stage: ReminderHabit['stage'],
    pace: 'adaptive' | 'start' | 'late' = 'adaptive',
    extra: Partial<ReminderHabit> = {},
  ) => fireOf([habit('h', { stage, ...extra }, { pace })]);
  const start = [at(DAY, '07:00')];
  const late = [at(DAY, '09:30')];
  assert.deepEqual(morning('building'), start);
  assert.deepEqual(morning('buildingAgain'), start);
  assert.deepEqual(morning(null), start);
  assert.deepEqual(morning('holding'), late);
  assert.deepEqual(morning('formed'), []);
  assert.deepEqual(morning('holding', 'start'), start);
  assert.deepEqual(morning('formed', 'start'), start);
  assert.deepEqual(morning('building', 'late'), late);
  assert.deepEqual(morning('formed', 'late'), late);
  assert.deepEqual(morning('holding', 'adaptive', { isCare: true }), start);
  assert.deepEqual(morning('holding', 'late', { isCare: true }), late);
  assert.deepEqual(
    morning(null, 'adaptive', { isCare: true, forWhoId: 'w' }),
    start,
  );
});

test('a window under an hour is reminded halfway when late, and times round down to 5 minutes', () => {
  const short = {
    m: {
      start: '07:00',
      end: '07:50',
      order: 0,
      part: 'morning' as const,
      editedAt: null,
    },
  };
  assert.deepEqual(
    fireOf([habit('h', { stage: 'holding', windowState: short })]),
    [at(DAY, '07:25')],
  );
  const odd = {
    m: { start: '07:03', end: '10:00', order: 0, part: null, editedAt: null },
  };
  assert.deepEqual(fireOf([habit('h', { windowState: odd })]), [
    at(DAY, '07:00'),
  ]);
});

test('a habit with no window fires at its time, the middle of Your day, or 2 hours before it ends', () => {
  const free = (extra: Partial<ReminderHabit>, reminder = {}) =>
    fireOf([habit('h', { ...noWindow, ...extra }, reminder)]);
  assert.deepEqual(free({}), [at(DAY, '14:30')]);
  assert.deepEqual(free({}, { anyTimeAt: '19:12' }), [at(DAY, '19:10')]);
  assert.deepEqual(free({ stage: 'holding' }), [at(DAY, '20:00')]);
  assert.deepEqual(free({ stage: 'formed' }), []);
  assert.deepEqual(free({ stage: 'formed' }, { pace: 'start' }), [
    at(DAY, '14:30'),
  ]);
  assert.deepEqual(free({ stage: 'formed' }, { pace: 'late' }), [
    at(DAY, '20:00'),
  ]);
});

test('quiet hours move a fire time to the nearest minute of the window outside them, or drop a window wholly inside', () => {
  const quiet = profile({ quietHours: { start: '22:00', end: '07:30' } });
  const run = (
    window: { start: string; end: string },
    extra: Partial<ReminderHabit> = {},
    reminder = {},
  ) =>
    plan(
      [
        habit(
          'h',
          {
            windowState: {
              w: { ...window, order: 0, part: null, editedAt: null },
            },
            ...extra,
          },
          reminder,
        ),
      ],
      { profile: quiet },
    ).map((slot) => slot.fireAt);
  assert.deepEqual(run({ start: '07:00', end: '10:00' }), [at(DAY, '07:30')]);
  assert.deepEqual(
    run({ start: '21:00', end: '23:30' }, { stage: 'holding' }),
    [at(DAY, '21:59')],
  );
  assert.deepEqual(run({ start: '05:00', end: '09:00' }), [at(DAY, '07:30')]);
  assert.deepEqual(run({ start: '23:00', end: '23:50' }), []);
  assert.deepEqual(
    run({ start: '23:00', end: '23:50' }, {}, { allowQuietHours: true }),
    [at(DAY, '23:00')],
  );
  assert.deepEqual(run({ start: '12:00', end: '13:00' }), [at(DAY, '12:00')]);
  assert.deepEqual(
    run({ start: '21:30', end: '23:59' }, { stage: 'holding' }),
    [at(DAY, '21:59')],
  );
  assert.deepEqual(
    run({ start: '22:00', end: '23:59' }, { stage: 'building' }),
    [],
  );
  const justAfter = profile({ quietHours: { start: '22:40', end: '23:05' } });
  assert.deepEqual(
    plan(
      [
        habit('h', {
          windowState: {
            w: {
              start: '21:30',
              end: '23:30',
              order: 0,
              part: null,
              editedAt: null,
            },
          },
          stage: 'holding',
        }),
      ],
      { profile: { ...justAfter, dayEndTime: '23:59' } },
    ).map((slot) => slot.fireAt),
    [at(DAY, '23:05')],
  );
});

test('with no quiet hours set, what lies outside Your day is quiet', () => {
  const run = (
    window: { start: string; end: string },
    extra: Partial<ReminderHabit> = {},
  ) =>
    fireOf([
      habit('h', {
        windowState: { w: { ...window, order: 0, part: null, editedAt: null } },
        ...extra,
      }),
    ]);
  assert.deepEqual(
    run({ start: '21:00', end: '23:00' }, { stage: 'holding' }),
    [at(DAY, '21:59')],
  );
  assert.deepEqual(run({ start: '05:00', end: '06:30' }), []);
  assert.deepEqual(run({ start: '06:00', end: '08:00' }), [at(DAY, '07:00')]);
});

test('fire times within 15 minutes of an earlier one join it', () => {
  const at15 = (id: string, start: string) =>
    habit(id, {
      windowState: {
        w: { start, end: '12:00', order: 0, part: 'morning', editedAt: null },
      },
    });
  const slots = plan([
    at15('a', '07:00'),
    at15('b', '07:10'),
    at15('c', '07:15'),
    at15('d', '07:20'),
  ]);
  assert.deepEqual(
    slots.map((slot) => [slot.fireAt, slot.refs]),
    [
      [at(DAY, '07:00'), ['a/w', 'b/w', 'c/w']],
      [at(DAY, '07:20'), ['d/w']],
    ],
  );
  assert.equal(slots[0].part, 'morning');
});

test('a day has at most 6 reminders; the rest join the nearest earlier one', () => {
  const habits = Array.from({ length: 9 }, (_, at30) => {
    const start = `${String(7 + Math.floor(at30 / 2)).padStart(2, '0')}:${at30 % 2 ? '30' : '00'}`;
    return habit(`h${at30}`, {
      windowState: {
        w: { start, end: '18:00', order: 0, part: null, editedAt: null },
      },
    });
  });
  const slots = plan(habits);
  assert.equal(HABIT_REMINDERS_PER_DAY, 6);
  assert.equal(slots.length, 6);
  assert.deepEqual(
    slots.map((slot) => slot.refs.length),
    [1, 1, 1, 1, 1, 4],
  );
  assert.equal(slots.flatMap((slot) => slot.refs).length, 9);
  assert.equal(slots[5].fireAt, at(DAY, '09:30'));
});

test('both clock changes keep the wall-clock time', () => {
  const run = (day: string, extra: Partial<ReminderHabit> = {}) =>
    plan([habit('h', extra)], { day, now: at(day, '03:30') }).map(
      (slot) => slot.fireAt,
    );
  assert.deepEqual(run('2026-03-08'), [Date.UTC(2026, 2, 8, 14, 0)]);
  assert.deepEqual(run('2026-03-08', { stage: 'holding' }), [
    Date.UTC(2026, 2, 8, 16, 30),
  ]);
  assert.deepEqual(run('2026-11-01'), [Date.UTC(2026, 10, 1, 15, 0)]);
  assert.deepEqual(run('2026-11-01', { stage: 'holding' }), [
    Date.UTC(2026, 10, 1, 17, 30),
  ]);
  assert.deepEqual(run('2026-03-08', noWindow), [Date.UTC(2026, 2, 8, 21, 30)]);
  assert.deepEqual(run('2026-11-01', noWindow), [
    Date.UTC(2026, 10, 1, 22, 30),
  ]);
  assert.equal(
    new Set(
      plan([habit('h', noWindow)], {
        day: '2026-11-01',
        now: at('2026-11-01', '03:00'),
      }).map((slot) => slot.part),
    ).size,
    1,
  );
});

const ticked = (tickTime: (back: number) => string | null, habitId = 'h') =>
  Object.fromEntries(
    Array.from({ length: 22 }, (_, back): [string, LifeDay] => {
      const key = shiftDayKeyBy(DAY, -back);
      const time = back === 0 ? null : tickTime(back);
      return [
        key,
        {
          isInUse: true,
          entries: time
            ? {
                [habitId]: {
                  checks: { m: { status: 'done', at: at(key, time) } },
                  count: 0,
                  lastCountAt: null,
                  reminded: null,
                },
              }
            : {},
        },
      ];
    }),
  );

test('a window that keeps itself goes quiet until it misses one', () => {
  const adaptive = habit('h', { stage: 'holding' });
  assert.deepEqual(plan([adaptive], { days: ticked(() => '09:00') }), []);
  assert.equal(
    plan([adaptive], { days: ticked((back) => (back === 5 ? null : '09:00')) })
      .length,
    1,
  );
  assert.equal(
    plan([adaptive], {
      days: ticked((back) => (back === 5 ? '09:45' : '09:00')),
    }).length,
    1,
  );
  assert.equal(
    plan([habit('h', { stage: 'holding' }, { pace: 'late' })], {
      days: ticked(() => '09:00'),
    }).length,
    1,
  );
  assert.equal(
    plan([habit('h', { stage: 'holding', isCare: true }, { pace: 'start' })], {
      days: ticked(() => '06:00'),
    }).length,
    1,
  );
  assert.deepEqual(
    plan([habit('h', { stage: 'building' })], { days: ticked(() => '06:30') }),
    [],
  );
});

test('days before a window was moved do not count toward keeping itself', () => {
  const moved = habit('h', {
    stage: 'holding',
    windowState: {
      m: {
        start: '07:00',
        end: '10:00',
        order: 0,
        part: 'morning',
        editedAt: at(shiftDayKeyBy(DAY, -3), '12:00'),
      },
    },
  });
  assert.equal(
    plan([moved], { days: ticked((back) => (back > 3 ? '09:50' : '09:00')) })
      .length,
    0,
  );
  assert.equal(
    plan(
      [
        {
          ...moved,
          windowState: {
            m: { ...moved.windowState.m, editedAt: at(DAY, '03:00') },
          },
        },
      ],
      {
        days: ticked(() => '09:00'),
      },
    ).length,
    1,
  );
});

test('a tally gets one reminder across the day and only the late one while holding', () => {
  const tally = (extra: Partial<ReminderHabit>) =>
    habit('h', { ...noWindow, timesPerDay: 8, ...extra });
  assert.deepEqual(fireOf([tally({})]), [at(DAY, '14:30')]);
  assert.deepEqual(fireOf([tally({ stage: 'holding' })]), [at(DAY, '20:00')]);
  const full: Record<string, LifeDay> = {
    ...busy(DAY),
    [DAY]: {
      isInUse: true,
      entries: {
        h: {
          checks: {},
          count: 8,
          lastCountAt: at(DAY, '12:00'),
          reminded: null,
        },
      },
    },
  };
  assert.deepEqual(plan([tally({})], { days: full }), []);
});

test('a habit that is off, paused, not due, done or past its time is left out', () => {
  assert.deepEqual(fireOf([habit('h', {}, { isOn: false })]), []);
  assert.deepEqual(fireOf([habit('h', { reminder: null })]), []);
  assert.deepEqual(
    fireOf([habit('h', { status: 'paused', pausedUntil: null })]),
    [],
  );
  assert.deepEqual(fireOf([habit('h', { status: 'ended' })]), []);
  assert.deepEqual(
    fireOf([habit('h', { cadence: { kind: 'onWeekdays', weekdays: [1] } })]),
    [],
  );
  assert.deepEqual(
    fireOf([habit('h', { startsOn: Date.UTC(2026, 5, 11) })]),
    [],
  );
  assert.deepEqual(
    plan([habit('h')], { profile: profile({ remindersPausedAt: 1 }) }),
    [],
  );
  const done: Record<string, LifeDay> = {
    ...busy(DAY),
    [DAY]: {
      isInUse: true,
      entries: {
        h: {
          checks: { m: { status: 'skipped', at: 1 } },
          count: 0,
          lastCountAt: null,
          reminded: null,
        },
      },
    },
  };
  assert.deepEqual(plan([habit('h')], { days: done }), []);
  const fire = at(DAY, '07:00');
  assert.deepEqual(plan([habit('h')], { now: fire - 61_000 }).length, 1);
  assert.deepEqual(plan([habit('h')], { now: fire - 60_000 }), []);
  assert.deepEqual(plan([habit('h')], { now: fire + 1 }), []);
  const weekly = habit('h', { cadence: { kind: 'timesPerWeek', count: 2 } });
  const met: Record<string, LifeDay> = {
    ...busy(DAY),
    '2026-06-08': {
      isInUse: true,
      entries: {
        h: {
          checks: { m: { status: 'done', at: 1 } },
          count: 0,
          lastCountAt: null,
          reminded: null,
        },
      },
    },
    '2026-06-09': {
      isInUse: true,
      entries: {
        h: {
          checks: { m: { status: 'done', at: 1 } },
          count: 0,
          lastCountAt: null,
          reminded: null,
        },
      },
    },
  };
  assert.deepEqual(plan([weekly], { days: met }), []);
  assert.equal(plan([weekly]).length, 1);
});

test('after 21 idle days the day gets one closing reminder, then nothing until the person is back', () => {
  assert.equal(HABIT_REMINDERS_IDLE_DAYS, 21);
  const idle: Record<string, LifeDay> = {
    [shiftDayKeyBy(DAY, -21)]: { isInUse: true, entries: {} },
  };
  const withUse = (back: number): Record<string, LifeDay> => ({
    [shiftDayKeyBy(DAY, -back)]: { isInUse: true, entries: {} },
  });
  assert.equal(isRemindersIdle(idle, DAY), true);
  assert.equal(isRemindersIdle(withUse(20), DAY), false);
  assert.equal(isRemindersIdle({}, DAY), true);
  const first = plan(
    [
      habit('a'),
      habit('b', {
        windowState: {
          w: {
            start: '12:00',
            end: '14:00',
            order: 0,
            part: null,
            editedAt: null,
          },
        },
      }),
    ],
    { days: idle },
  );
  assert.equal(first.length, 1);
  assert.equal(first[0].kind, 'idle');
  assert.equal(first[0].fireAt, at(DAY, '07:00'));
  assert.deepEqual(first[0].refs, []);
  assert.deepEqual(
    plan([habit('a')], {
      days: idle,
      profile: profile({ habitRemindersIdleAt: 5 }),
    }),
    [],
  );
  assert.equal(plan([habit('a')], { days: withUse(20) })[0].kind, 'habits');
});

test('diffSlots creates what is new, cancels what is gone, and leaves a firing one alone', () => {
  const now = 1_000_000;
  const slot = (fireAt: number, refs: string[]): WantedSlot => ({
    fireAt,
    refs,
    part: null,
    kind: 'habits',
  });
  const planned = [
    { id: 'same', fireAt: now + 600_000, refs: ['a/m', 'b/m'] },
    { id: 'moved', fireAt: now + 900_000, refs: ['c/m'] },
    { id: 'gone', fireAt: now + 1_200_000, refs: ['d/m'] },
    { id: 'firing', fireAt: now + 30_000, refs: ['e/m'] },
    { id: 'edge', fireAt: now + 60_000, refs: ['f/m'] },
  ];
  const wanted = [
    slot(now + 600_000, ['b/m', 'a/m']),
    slot(now + 950_000, ['c/m']),
    slot(now + 2_000_000, ['g/m']),
  ];
  const result = diffSlots(planned, wanted, now);
  assert.deepEqual(
    result.cancel.map((one) => one.id),
    ['moved', 'gone'],
  );
  assert.deepEqual(
    result.create.map((one) => one.refs),
    [['c/m'], ['g/m']],
  );
  assert.deepEqual(diffSlots([], [], now), { create: [], cancel: [] });
  const regrouped = diffSlots(
    [{ id: 'x', fireAt: now + 600_000, refs: ['a/m'] }],
    [slot(now + 600_000, ['a/m', 'b/m'])],
    now,
  );
  assert.equal(regrouped.cancel.length, 1);
  assert.equal(regrouped.create.length, 1);
});

test('the words are fixed, never a habit name, and the lock screen names only what is shown', () => {
  assert.equal(
    reminderBody({ part: 'morning', count: 3 }),
    'Your morning habits are up',
  );
  assert.equal(
    reminderBody({ part: 'evening', count: 1 }),
    'Time for your evening habit',
  );
  assert.equal(
    reminderBody({ part: null, count: 1 }),
    'A habit is waiting for you',
  );
  assert.equal(
    reminderBody({ part: null, count: 2 }),
    'Habits are waiting for you',
  );
  assert.equal(lockScreenBody(['Pills'], 1, 'morning'), 'Pills');
  assert.equal(
    lockScreenBody(['Pills', 'Floss'], 2, 'morning'),
    'Pills and Floss',
  );
  assert.equal(
    lockScreenBody(['Pills'], 2, 'evening'),
    'Pills and 1 more evening habit',
  );
  assert.equal(
    lockScreenBody(['Pills'], 3, 'evening'),
    'Pills and 2 more evening habits',
  );
  assert.equal(lockScreenBody(['Pills'], 2, null), 'Pills and 1 more habit');
  assert.equal(lockScreenBody(['A', 'B', 'C'], 3, null), 'A, B and C');
  assert.equal(lockScreenBody([], 2, 'morning'), 'Your morning habits are up');
  const words = [
    ...(
      ['morning', 'midday', 'afternoon', 'evening', 'bedtime'] as const
    ).flatMap((part) => [
      HABIT_REMINDER_WORDS.one(part),
      HABIT_REMINDER_WORDS.many(part),
    ]),
    HABIT_REMINDER_WORDS.noPartOne,
    HABIT_REMINDER_WORDS.noPartMany,
    HABIT_REMINDER_WORDS.idle,
  ];
  words.forEach((text) => assert.doesNotMatch(text, /helm|nomos/i));
});

test('planning reads only readable fields, never the sealed ones', () => {
  const sealed = () => {
    throw new Error('A sealed field was read.');
  };
  const guarded = (id: string) => {
    const one = habit(id, {
      stage: 'holding',
      windowState: {
        m: {
          start: '07:00',
          end: '10:00',
          order: 0,
          part: 'morning',
          editedAt: null,
        },
      },
    });
    Object.defineProperty(one, 'sealed', { get: sealed, enumerable: true });
    Object.defineProperty(one, 'name', { get: sealed, enumerable: true });
    return one;
  };
  const slots = plan([guarded('a'), guarded('b')]);
  assert.equal(slots.length, 1);
  assert.deepEqual(slots[0].refs, ['a/m', 'b/m']);
  assert.ok(!JSON.stringify(slots).includes('Pills'));
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
