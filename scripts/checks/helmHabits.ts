// A habit's day and windows: the 03:00 rollover, a window past midnight, both clock changes in two zones, an away zone, cadences, the week's counts and a tally from two devices.
// Run under two machine zones: the engine reads zones by name and date-only days in UTC, never the machine's zone.
import assert from 'node:assert/strict';

import { deleteField, increment } from 'firebase/firestore';

import {
  countDueDays,
  isDueOn,
  nextDueOn,
  type Cadence,
} from '../../src/utils/cadenceUtils.ts';
import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';
import {
  DAY_PART_WINDOWS,
  dayPartWindows,
  habitDayKey,
  isHabitDue,
  openWindowAt,
  readHabitClock,
  saidTimeWindow,
  selectHabitWeek,
  windowInstants,
  type HabitDayLike,
  type HabitScheduleLike,
} from '../../src/apps/helm/engine/habitDay.ts';
import {
  buildCheckPatch,
  buildTallyPatch,
  buildUncheckPatch,
} from '../../src/apps/helm/utils/habitDayPatch.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const LA = 'America/Los_Angeles';
const LISBON = 'Europe/Lisbon';
const HOUR = 3_600_000;
const at = (day: string, time: string, zone: string) =>
  zonedDateTimeToEpoch(day, time, zone);
const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);

const schedule = (
  extra: Partial<HabitScheduleLike> = {},
): HabitScheduleLike & { id: string } => ({
  id: 'h',
  status: 'active',
  cadence: { kind: 'everyDay' },
  windowState: {},
  timesPerDay: null,
  startsOn: utc(2026, 1, 1),
  endsOn: null,
  ...extra,
});

test('a window past midnight belongs to the day it started, and never runs past 03:00', () => {
  const night = schedule({
    windowState: { late: { start: '22:00', end: '01:00', order: 0 } },
  });
  const { startAt, endAt } = windowInstants(
    '2026-06-10',
    night.windowState.late,
    LA,
  );
  assert.equal(endAt - startAt, 3 * HOUR);
  assert.equal(openWindowAt(night, at('2026-06-10', '23:30', LA), LA), 'late');
  assert.equal(openWindowAt(night, at('2026-06-11', '00:30', LA), LA), 'late');
  assert.equal(openWindowAt(night, at('2026-06-11', '01:30', LA), LA), null);
  const long = windowInstants(
    '2026-06-10',
    { start: '22:00', end: '05:00' },
    LA,
  );
  assert.equal(long.endAt, at('2026-06-11', '03:00', LA));
});

test('the habit day rolls over at 03:00, so 01:30 counts for the day before', () => {
  assert.equal(habitDayKey(at('2026-06-11', '01:30', LA), LA), '2026-06-10');
  assert.equal(habitDayKey(at('2026-06-11', '02:59', LA), LA), '2026-06-10');
  assert.equal(habitDayKey(at('2026-06-11', '03:00', LA), LA), '2026-06-11');
  assert.equal(habitDayKey(at('2026-06-11', '23:59', LA), LA), '2026-06-11');
  assert.equal(
    habitDayKey(at('2026-01-01', '00:10', LISBON), LISBON),
    '2025-12-31',
  );
});

test('both clock changes in Los Angeles and Lisbon: windows keep their real length and the rollover holds', () => {
  const span = (day: string, zone: string) => {
    const { startAt, endAt } = windowInstants(
      day,
      { start: '00:30', end: '03:30' },
      zone,
    );
    return (endAt - startAt) / HOUR;
  };
  assert.equal(span('2026-03-08', LA), 2);
  assert.equal(span('2026-11-01', LA), 4);
  assert.equal(span('2026-03-29', LISBON), 2);
  assert.equal(span('2026-10-25', LISBON), 4);
  assert.equal(span('2026-06-10', LA), 3);

  assert.equal(
    habitDayKey(Date.parse('2026-03-08T09:59:00Z'), LA),
    '2026-03-07',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-03-08T10:00:00Z'), LA),
    '2026-03-08',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-11-01T08:30:00Z'), LA),
    '2026-10-31',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-11-01T09:30:00Z'), LA),
    '2026-10-31',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-11-01T10:59:00Z'), LA),
    '2026-10-31',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-11-01T11:00:00Z'), LA),
    '2026-11-01',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-03-29T00:59:00Z'), LISBON),
    '2026-03-28',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-03-29T02:00:00Z'), LISBON),
    '2026-03-29',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-10-25T01:30:00Z'), LISBON),
    '2026-10-24',
  );
  assert.equal(
    habitDayKey(Date.parse('2026-10-25T03:00:00Z'), LISBON),
    '2026-10-25',
  );

  const evening = schedule({
    windowState: { e: { start: '20:00', end: '22:00', order: 0 } },
  });
  assert.equal(openWindowAt(evening, at('2026-11-01', '21:00', LA), LA), 'e');
  assert.equal(openWindowAt(evening, at('2026-03-08', '21:00', LA), LA), 'e');
  assert.equal(openWindowAt(evening, at('2026-03-08', '19:59', LA), LA), null);
});

test('an away zone moves the day and the windows with it, until its span is no longer chosen', () => {
  const profile = {
    timeZone: LA,
    zoneSpans: [
      {
        zone: LISBON,
        from: utc(2026, 6, 9),
        to: utc(2026, 6, 12),
        awayId: 'trip',
      },
    ],
  };
  const instant = Date.parse('2026-06-10T02:30:00Z');
  assert.deepEqual(readHabitClock(instant, profile, ['trip']), {
    dayKey: '2026-06-10',
    timeZone: LISBON,
  });
  assert.deepEqual(readHabitClock(instant, profile, []), {
    dayKey: '2026-06-09',
    timeZone: LA,
  });
  const inside = Date.parse('2026-06-10T08:30:00Z');
  assert.deepEqual(readHabitClock(inside, profile, ['trip']), {
    dayKey: '2026-06-10',
    timeZone: LISBON,
  });
  assert.deepEqual(readHabitClock(inside, profile, []), {
    dayKey: '2026-06-09',
    timeZone: LA,
  });
  assert.deepEqual(readHabitClock(inside, profile, null).timeZone, LISBON);
  const morning = schedule({
    windowState: { m: { start: '08:00', end: '10:00', order: 0 } },
  });
  assert.equal(
    openWindowAt(morning, Date.parse('2026-06-10T08:30:00Z'), LISBON),
    'm',
  );
  assert.equal(
    openWindowAt(morning, Date.parse('2026-06-10T08:30:00Z'), LA),
    null,
  );
});

test('a tally from two devices adds up, two ticks in different windows both land, and an untick touches one window', () => {
  const devices = [
    buildTallyPatch('2026-06-10', 'h', 1),
    buildTallyPatch('2026-06-10', 'h', 2),
  ];
  assert.equal(
    devices.filter((patch) => patch.entries.h.count.isEqual(increment(1)))
      .length,
    2,
  );
  const check = {
    status: 'done' as const,
    at: 1,
    by: 'person' as const,
    executionId: null,
  };
  const merged = [
    buildCheckPatch('2026-06-10', 'h', 'm', check),
    buildCheckPatch('2026-06-10', 'h', 'e', check),
  ].reduce<Record<string, unknown>>(
    (all, patch) => ({
      ...all,
      ...patch.entries.h.checks,
    }),
    {},
  );
  assert.deepEqual(Object.keys(merged).sort(), ['e', 'm']);
  assert.equal(
    buildCheckPatch('2026-06-10', 'h', 'm', check).date,
    utc(2026, 6, 10),
  );
  const untick = buildUncheckPatch('h', 'm');
  assert.deepEqual(Object.keys(untick), ['entries.h.checks.m']);
  assert.ok(untick['entries.h.checks.m'].isEqual(deleteField()));
});

test('cadence kinds: every day, weekdays, times a week, every N days', () => {
  const wed = '2026-06-10';
  assert.ok(isDueOn({ kind: 'everyDay' }, wed));
  const days: Cadence = { kind: 'onWeekdays', weekdays: [1, 3, 5] };
  assert.ok(isDueOn(days, wed));
  assert.ok(!isDueOn(days, '2026-06-11'));
  assert.ok(isDueOn({ kind: 'timesPerWeek', count: 3 }, wed));
  const every3: Cadence = {
    kind: 'everyNDays',
    days: 3,
    anchor: utc(2026, 6, 1),
  };
  assert.deepEqual(
    ['2026-06-01', '2026-06-04', '2026-06-10', '2026-05-29'].map((day) =>
      isDueOn(every3, day),
    ),
    [true, true, true, true],
  );
  assert.ok(!isDueOn(every3, '2026-06-11'));
  assert.equal(countDueDays(days, '2026-06-08', '2026-06-14'), 3);
  assert.equal(countDueDays(every3, '2026-06-01', '2026-06-14'), 5);
  assert.equal(
    countDueDays({ kind: 'everyDay' }, '2026-06-10', '2026-06-09'),
    0,
  );
  assert.equal(
    countDueDays(
      { kind: 'timesPerWeek', count: 3 },
      '2026-06-08',
      '2026-06-10',
    ),
    3,
  );
  assert.equal(
    countDueDays(
      { kind: 'timesPerWeek', count: 3 },
      '2026-06-08',
      '2026-06-21',
    ),
    6,
  );
  assert.equal(nextDueOn(days, wed), '2026-06-12');
  assert.equal(nextDueOn(every3, wed), '2026-06-13');
  assert.equal(
    nextDueOn({ kind: 'timesPerWeek', count: 2 }, wed),
    '2026-06-11',
  );
});

test('a habit is due only while active, started, not ended and on a cadence day', () => {
  const habit = schedule({
    cadence: { kind: 'onWeekdays', weekdays: [3] },
    startsOn: utc(2026, 6, 3),
    endsOn: utc(2026, 6, 17),
  });
  assert.ok(isHabitDue(habit, '2026-06-10'));
  assert.ok(isHabitDue(habit, '2026-06-17'));
  assert.ok(!isHabitDue(habit, '2026-06-24'));
  assert.ok(!isHabitDue(habit, '2026-05-27'));
  assert.ok(!isHabitDue(habit, '2026-06-11'));
  ['paused', 'ended', 'retired'].forEach((status) =>
    assert.ok(!isHabitDue({ ...habit, status }, '2026-06-10'), status),
  );
});

const pillsDay = (done: string[]): HabitDayLike => ({
  entries: {
    h: {
      checks: Object.fromEntries(done.map((id) => [id, { status: 'done' }])),
      count: 0,
    },
  },
});

test('the week is Monday to today in the habit unit: 11 of 13 for pills, 2 of 3 for a times-a-week habit', () => {
  const pills = schedule({
    windowState: {
      m: { start: '08:00', end: '10:00', order: 0 },
      e: { start: '20:00', end: '22:00', order: 1 },
    },
  });
  const days: Record<string, HabitDayLike> = {
    '2026-11-02': pillsDay(['m', 'e']),
    '2026-11-03': pillsDay(['m']),
    '2026-11-04': pillsDay(['m', 'e']),
    '2026-11-05': pillsDay(['m']),
    '2026-11-06': pillsDay(['m', 'e']),
    '2026-11-07': pillsDay(['m', 'e']),
    '2026-11-08': pillsDay(['m']),
    '2026-11-01': pillsDay(['m', 'e']),
  };
  assert.deepEqual(selectHabitWeek(pills, days, '2026-11-08'), {
    done: 11,
    due: 13,
  });
  assert.deepEqual(
    selectHabitWeek(
      pills,
      { ...days, '2026-11-08': pillsDay([]) },
      '2026-11-08',
    ),
    {
      done: 10,
      due: 12,
    },
  );
  assert.deepEqual(selectHabitWeek(pills, days, '2026-11-02'), {
    done: 2,
    due: 2,
  });

  const guitar = schedule({ cadence: { kind: 'timesPerWeek', count: 3 } });
  const practised = (...keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, pillsDay(['day'])]));
  assert.deepEqual(
    selectHabitWeek(
      guitar,
      practised('2026-11-02', '2026-11-03'),
      '2026-11-04',
    ),
    { done: 2, due: 3 },
  );
  assert.deepEqual(
    selectHabitWeek(
      guitar,
      practised('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'),
      '2026-11-06',
    ),
    { done: 3, due: 3 },
  );
});

test('a counted habit counts days that reached its number; weekdays and a late start count only their due days', () => {
  const water = schedule({ timesPerDay: 6 });
  const counted = (count: number): HabitDayLike => ({
    entries: { h: { checks: {}, count } },
  });
  assert.deepEqual(
    selectHabitWeek(
      water,
      {
        '2026-11-02': counted(6),
        '2026-11-03': counted(7),
        '2026-11-04': counted(3),
      },
      '2026-11-05',
    ),
    { done: 2, due: 3 },
  );
  assert.deepEqual(
    selectHabitWeek(water, { '2026-11-05': counted(6) }, '2026-11-05'),
    { done: 1, due: 4 },
  );
  const lateStart = schedule({ startsOn: utc(2026, 11, 4) });
  assert.deepEqual(
    selectHabitWeek(
      lateStart,
      { '2026-11-04': pillsDay(['day']) },
      '2026-11-06',
    ),
    { done: 1, due: 2 },
  );
  const weekdays = schedule({
    cadence: { kind: 'onWeekdays', weekdays: [1, 3] },
  });
  assert.deepEqual(
    selectHabitWeek(
      weekdays,
      { '2026-11-02': pillsDay(['day']) },
      '2026-11-04',
    ),
    { done: 1, due: 1 },
  );
  const ended = schedule({ endsOn: utc(2026, 11, 3) });
  assert.deepEqual(selectHabitWeek(ended, {}, '2026-11-08'), {
    done: 0,
    due: 2,
  });
});

test('parts of the day follow Your day, a fixed table until it was set, and a said time is an hour', () => {
  assert.deepEqual(
    dayPartWindows({ dayStartTime: '08:00', dayEndTime: '22:00' }),
    DAY_PART_WINDOWS,
  );
  assert.deepEqual(
    dayPartWindows({ dayStartTime: '06:00', dayEndTime: '23:00' }),
    {
      morning: { start: '06:00', end: '08:00' },
      midday: { start: '08:00', end: '14:00' },
      afternoon: { start: '14:00', end: '21:00' },
      evening: { start: '21:00', end: '23:00' },
      bedtime: { start: '23:00', end: '00:00' },
    },
  );
  assert.deepEqual(saidTimeWindow('08:00'), { start: '07:30', end: '08:30' });
  assert.deepEqual(saidTimeWindow('23:45'), { start: '23:15', end: '00:15' });
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
