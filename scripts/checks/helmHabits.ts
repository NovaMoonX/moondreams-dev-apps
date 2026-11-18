// A habit's day and windows: the 03:00 rollover, a window past midnight, both clock changes in two zones, an away zone, cadences, the week's counts and a tally from two devices.
// Run under two machine zones: the engine reads zones by name and date-only days in UTC, never the machine's zone.
import assert from 'node:assert/strict';

import { deleteField, increment } from 'firebase/firestore';

import {
  countDueDays,
  isDueOn,
  nextDueOn,
  shiftDayKeyBy,
  type Cadence,
} from '../../src/utils/cadenceUtils.ts';
import { zonedDateTimeToEpoch } from '../../src/utils/timezoneUtils.ts';
import {
  DAY_PART_WINDOWS,
  dayPartWindows,
  habitDayKey,
  isHabitDue,
  isWindowStartAllowed,
  openWindowAt,
  readHabitClock,
  readHabitStatusOn,
  saidTimeWindow,
  selectHabitWeek,
  toAllowedWindow,
  windowInstants,
  type HabitDayLike,
  type HabitScheduleLike,
} from '../../src/apps/helm/engine/habitDay.ts';
import {
  HABIT_LIFE,
  judgeHabitWeek,
  readHabitStage,
  readKeptWeeks,
  readRejudgeFrom,
  rejudgeHabit,
  type LifeDay,
  type LifeHabit,
} from '../../src/apps/helm/engine/habitLife.ts';
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
  assert.deepEqual(selectHabitWeek(pills, days, '2026-11-08', 'UTC'), {
    done: 11,
    due: 13,
    skipped: 0,
  });
  assert.deepEqual(
    selectHabitWeek(
      pills,
      { ...days, '2026-11-08': pillsDay([]) },
      '2026-11-08',
      'UTC',
    ),
    {
      done: 10,
      due: 12,
      skipped: 0,
    },
  );
  assert.deepEqual(selectHabitWeek(pills, days, '2026-11-02', 'UTC'), {
    done: 2,
    due: 2,
    skipped: 0,
  });

  const guitar = schedule({ cadence: { kind: 'timesPerWeek', count: 3 } });
  const practised = (...keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, pillsDay(['day'])]));
  assert.deepEqual(
    selectHabitWeek(
      guitar,
      practised('2026-11-02', '2026-11-03', 'UTC'),
      '2026-11-04',
      'UTC',
    ),
    { done: 2, due: 3, skipped: 0 },
  );
  assert.deepEqual(
    selectHabitWeek(
      guitar,
      practised('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', 'UTC'),
      '2026-11-06',
      'UTC',
    ),
    { done: 3, due: 3, skipped: 0 },
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
      'UTC',
    ),
    { done: 2, due: 3, skipped: 0 },
  );
  assert.deepEqual(
    selectHabitWeek(water, { '2026-11-05': counted(6) }, '2026-11-05', 'UTC'),
    { done: 1, due: 4, skipped: 0 },
  );
  const lateStart = schedule({ startsOn: utc(2026, 11, 4) });
  assert.deepEqual(
    selectHabitWeek(
      lateStart,
      { '2026-11-04': pillsDay(['day']) },
      '2026-11-06',
      'UTC',
    ),
    { done: 1, due: 2, skipped: 0 },
  );
  const weekdays = schedule({
    cadence: { kind: 'onWeekdays', weekdays: [1, 3] },
  });
  assert.deepEqual(
    selectHabitWeek(
      weekdays,
      { '2026-11-02': pillsDay(['day']) },
      '2026-11-04',
      'UTC',
    ),
    { done: 1, due: 1, skipped: 0 },
  );
  const ended = schedule({ endsOn: utc(2026, 11, 3) });
  assert.deepEqual(selectHabitWeek(ended, {}, '2026-11-08', 'UTC'), {
    done: 0,
    due: 2,
    skipped: 0,
  });
});

test('days inside a pause are neither due nor counted, and a finished pause reads as active', () => {
  const done = (...keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, pillsDay(['day'])]));
  const week = done(
    '2026-11-02',
    '2026-11-03',
    '2026-11-05',
    '2026-11-07',
    'UTC',
  );
  const pausedMidWeek = schedule({
    status: 'paused',
    pausedAt: Date.UTC(2026, 10, 4, 12),
    pausedUntil: utc(2026, 11, 7),
  });
  assert.deepEqual(selectHabitWeek(pausedMidWeek, week, '2026-11-08', 'UTC'), {
    done: 3,
    due: 3,
    skipped: 0,
  });
  assert.deepEqual(
    selectHabitWeek(
      schedule({ pausedAt: Date.UTC(2026, 10, 5, 9), pausedUntil: null }),
      week,
      '2026-11-08',
      'UTC',
    ),
    { done: 2, due: 3, skipped: 0 },
  );
  assert.deepEqual(
    selectHabitWeek(
      { ...pausedMidWeek, cadence: { kind: 'timesPerWeek', count: 3 } },
      week,
      '2026-11-08',
      'UTC',
    ),
    { done: 3, due: 3, skipped: 0 },
  );
  assert.deepEqual(selectHabitWeek(schedule(), week, '2026-11-08', 'UTC'), {
    done: 4,
    due: 6,
    skipped: 0,
  });
  const until = { status: 'paused', pausedUntil: utc(2026, 11, 10) };
  assert.equal(readHabitStatusOn(until, '2026-11-09'), 'paused');
  assert.equal(readHabitStatusOn(until, '2026-11-10'), 'active');
  assert.equal(
    readHabitStatusOn({ status: 'paused', pausedUntil: null }, '2030-01-01'),
    'paused',
  );
  assert.equal(readHabitStatusOn({ status: 'ended' }, '2030-01-01'), 'ended');
  const back = {
    ...schedule({ status: 'paused', pausedUntil: until.pausedUntil }),
  };
  assert.equal(isHabitDue(back, '2026-11-10'), false);
  assert.equal(
    isHabitDue(
      { ...back, status: readHabitStatusOn(back, '2026-11-10') },
      '2026-11-10',
    ),
    true,
  );
});

test('a skipped unit is neither done nor missed, and a first day asks for nothing yet', () => {
  const pills = schedule({
    windowState: {
      m: { start: '08:00', end: '10:00', order: 0 },
      e: { start: '20:00', end: '22:00', order: 1 },
    },
  });
  const skipDay = (id: string): HabitDayLike => ({
    entries: {
      h: { checks: { [id]: { status: 'skipped' } }, count: 0 },
    },
  });
  assert.deepEqual(
    selectHabitWeek(pills, { '2026-11-03': skipDay('e') }, '2026-11-04', 'UTC'),
    { done: 0, due: 3, skipped: 1 },
  );
  const water = schedule({ timesPerDay: 6 });
  assert.deepEqual(
    selectHabitWeek(
      water,
      { '2026-11-03': skipDay('day') },
      '2026-11-04',
      'UTC',
    ),
    { done: 0, due: 1, skipped: 1 },
  );
  const fresh = schedule({ startsOn: utc(2026, 11, 4) });
  assert.deepEqual(selectHabitWeek(fresh, {}, '2026-11-04', 'UTC'), {
    done: 0,
    due: 0,
    skipped: 0,
  });
  const guitar = schedule({ cadence: { kind: 'timesPerWeek', count: 3 } });
  assert.deepEqual(
    selectHabitWeek(
      guitar,
      { '2026-11-02': skipDay('day') },
      '2026-11-04',
      'UTC',
    ),
    { done: 0, due: 2, skipped: 1 },
  );
});

test('a pause is read in the zone: 01:00 in Los Angeles is still the day before, and a resumed pause stays out of the week', () => {
  const done = (...keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, pillsDay(['day'])]));
  const week = done('2026-11-02', '2026-11-03');
  const pausedAt = Date.UTC(2026, 10, 5, 9);
  const history = [
    { kind: 'paused', at: pausedAt },
    { kind: 'resumed', at: Date.UTC(2026, 10, 7, 20) },
  ];
  assert.deepEqual(
    selectHabitWeek(
      schedule({ pausedAt, pausedUntil: null }),
      week,
      '2026-11-08',
      LA,
    ),
    { done: 2, due: 2, skipped: 0 },
  );
  assert.deepEqual(
    selectHabitWeek(
      schedule({ pausedAt, pausedUntil: null }),
      week,
      '2026-11-08',
      'UTC',
    ),
    { done: 2, due: 3, skipped: 0 },
  );
  assert.deepEqual(
    selectHabitWeek(schedule({ history }), week, '2026-11-08', LA),
    { done: 2, due: 3, skipped: 0 },
  );
  assert.deepEqual(selectHabitWeek(schedule(), week, '2026-11-08', LA), {
    done: 2,
    due: 6,
    skipped: 0,
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
  assert.deepEqual(saidTimeWindow('03:10'), { start: '03:00', end: '03:40' });
  assert.deepEqual(saidTimeWindow('01:00'), { start: '23:30', end: '01:30' });
  assert.deepEqual(saidTimeWindow('02:50'), { start: '23:30', end: '03:00' });
  assert.equal(isWindowStartAllowed('03:00'), true);
  assert.equal(isWindowStartAllowed('02:59'), false);
  assert.deepEqual(toAllowedWindow({ start: '02:00', end: '09:00' }), {
    start: '03:00',
    end: '09:00',
  });
  assert.deepEqual(toAllowedWindow({ start: '02:00', end: '02:30' }), {
    start: '03:00',
    end: '03:30',
  });
  assert.deepEqual(toAllowedWindow({ start: '08:00', end: '09:00' }), {
    start: '08:00',
    end: '09:00',
  });
});

const FIRST_MONDAY = '2026-01-05';
const weekStart = (week: number) => shiftDayKeyBy(FIRST_MONDAY, 7 * week);

const lifeHabit = (extra: Partial<LifeHabit> = {}): LifeHabit => ({
  id: 'h',
  status: 'active',
  cadence: { kind: 'everyDay' },
  windowState: {},
  timesPerDay: null,
  startsOn: utc(2026, 1, 5),
  endsOn: null,
  isCare: false,
  forWhoId: null,
  stage: 'building',
  stageAt: 0,
  stageWeek: null,
  rejudgeFrom: null,
  formedAt: null,
  ...extra,
});

/** A kept week has every day done; an unkept week has three done and four known misses. */
const lifeDays = (
  weeks: ('kept' | 'unkept')[],
  remindedWeeks: number[] = [],
): Record<string, LifeDay> =>
  Object.fromEntries(
    weeks.flatMap((state, week) =>
      Array.from({ length: 7 }, (_, day): [string, LifeDay] => {
        const key = shiftDayKeyBy(weekStart(week), day);
        const isDone = state === 'kept' || day < 3;
        const doneAt = at(key, '12:00', LA);
        return [
          key,
          {
            isInUse: true,
            entries: {
              h: {
                checks: isDone ? { day: { status: 'done', at: doneAt } } : {},
                count: 0,
                lastCountAt: null,
                reminded: remindedWeeks.includes(week)
                  ? { day: doneAt - 1000 }
                  : {},
              },
            },
          },
        ];
      }),
    ),
  );

const stageAfter = (
  weeks: ('kept' | 'unkept')[],
  extra: Partial<LifeHabit> = {},
  remindedWeeks: number[] = [],
) => {
  const habit = lifeHabit(extra);
  return readHabitStage(
    habit,
    readKeptWeeks(
      habit,
      lifeDays(weeks, remindedWeeks),
      weekStart(weeks.length),
      LA,
    ),
  );
};

const K = 'kept' as const;
const U = 'unkept' as const;

test('a habit builds for 3 kept weeks, then holds', () => {
  assert.equal(HABIT_LIFE.holdingKeptRun, 3);
  assert.equal(stageAfter([]), 'building');
  assert.equal(stageAfter([K, K]), 'building');
  assert.equal(stageAfter([K, K, K]), 'holding');
  assert.equal(stageAfter([K, K, U, K, K]), 'building');
  assert.equal(stageAfter([K, K, U, K, K, K]), 'holding');
});

test('two unkept weeks in a row send a holding habit back to building again, and 3 kept weeks hold it', () => {
  assert.equal(stageAfter([K, K, K, U]), 'holding');
  assert.equal(stageAfter([K, K, K, U, K, U]), 'holding');
  assert.equal(stageAfter([K, K, K, U, U]), 'buildingAgain');
  assert.equal(stageAfter([K, K, K, U, U, K, K]), 'buildingAgain');
  assert.equal(stageAfter([K, K, K, U, U, K, K, K]), 'holding');
});

test('formed needs 8 of 10 weeks kept, the last 4 unreminded, and 10 weeks since the start', () => {
  const tenKept = Array.from({ length: 10 }, () => K);
  assert.equal(stageAfter(tenKept.slice(0, 9)), 'holding');
  assert.equal(stageAfter(tenKept), 'formed');
  assert.equal(stageAfter(tenKept, {}, [7]), 'holding');
  assert.equal(stageAfter(tenKept, {}, [5]), 'formed');
  assert.equal(stageAfter([K, U, K, K, U, K, K, K, K, K]), 'formed');
  assert.equal(stageAfter([K, U, K, U, U, K, K, K, K, K]), 'holding');
  assert.equal(stageAfter([K, K, K, K, U, U, K, K, K, K]), 'formed');
  assert.equal(stageAfter([...tenKept, U]), 'formed');
  assert.equal(stageAfter([...tenKept, U, U]), 'buildingAgain');
});

test('a restart or a window change begins the stage again', () => {
  const kept = Array.from({ length: 12 }, () => K);
  const restarted = lifeHabit({
    history: [{ kind: 'restarted', at: at(weekStart(10), '09:00', LA) }],
  });
  assert.equal(
    readHabitStage(
      restarted,
      readKeptWeeks(restarted, lifeDays(kept), weekStart(12), LA),
    ),
    'building',
  );
  const edited = lifeHabit({
    windowState: {
      w: {
        start: '08:00',
        end: '09:00',
        order: 0,
        editedAt: at(weekStart(10), '09:00', LA),
      },
    },
  });
  assert.equal(
    readKeptWeeks(edited, lifeDays(kept), weekStart(12), LA).length,
    2,
  );
});

test("a health habit stops at holding and a carer's habit has no stage", () => {
  const kept = Array.from({ length: 12 }, () => K);
  assert.equal(stageAfter(kept, { isCare: true }), 'holding');
  assert.equal(stageAfter(kept, { isCare: true, forWhoId: 'w' }), null);
  assert.equal(
    judgeHabitWeek(
      lifeHabit({ forWhoId: 'w' }),
      lifeDays(kept),
      weekStart(2),
      LA,
    ),
    null,
  );
});

test('a sparse or paused week is skipped, and a times-a-week week is kept when its count is met', () => {
  const sparse = lifeHabit({
    cadence: { kind: 'onWeekdays', weekdays: [1, 3] },
  });
  assert.equal(
    readKeptWeeks(sparse, lifeDays([K]), weekStart(1), LA)[0].state,
    'skipped',
  );
  const paused = lifeHabit({
    pausedAt: at(weekStart(0), '10:00', LA),
    pausedUntil: Date.UTC(2026, 0, 8),
  });
  assert.equal(
    readKeptWeeks(paused, lifeDays([K]), weekStart(1), LA)[0].state,
    'skipped',
  );
  const weekly = lifeHabit({ cadence: { kind: 'timesPerWeek', count: 4 } });
  assert.deepEqual(
    readKeptWeeks(weekly, lifeDays([K, U]), weekStart(2), LA).map(
      (week) => week.state,
    ),
    ['kept', 'unkept'],
  );
});

test('a late tick into a judged week re-judges Building to Holding once', () => {
  const judged = judgeHabitWeek(
    lifeHabit({ stageWeek: null }),
    lifeDays([K, K, U]),
    weekStart(2),
    LA,
  );
  assert.ok(judged);
  assert.equal(judged.stage, 'building');
  assert.equal(judged.isStageChange, false);
  assert.equal(judged.stageWeek, weekStart(2));
  const stored = lifeHabit({ stageWeek: weekStart(2), stage: 'building' });
  assert.equal(
    judgeHabitWeek(stored, lifeDays([K, K, U]), weekStart(2), LA),
    null,
  );
  const rejudgeFrom = readRejudgeFrom(
    null,
    shiftDayKeyBy(weekStart(2), 5),
    stored.stageWeek,
  );
  assert.equal(rejudgeFrom, weekStart(2));
  const after = lifeDays([K, K, K]);
  const patch = rejudgeHabit({ ...stored, rejudgeFrom }, after, LA);
  assert.ok(patch);
  assert.equal(patch.stage, 'holding');
  assert.equal(patch.isStageChange, true);
  assert.equal(patch.rejudgeFrom, null);
  assert.equal(patch.stageWeek, weekStart(2));
  assert.equal(patch.event?.kind, 'stage');
  assert.equal(patch.event?.by, 'nomos');
  assert.equal(patch.event?.stage, 'holding');
  const settled = {
    ...stored,
    stage: patch.stage,
    stageAt: patch.stageAt,
    rejudgeFrom: null,
  };
  assert.equal(rejudgeHabit(settled, after, LA), null);
  const again = rejudgeHabit({ ...settled, rejudgeFrom }, after, LA);
  assert.ok(again);
  assert.equal(again.isStageChange, false);
  assert.equal(again.event, null);
});

test('an offline tick synced into a judged week sets the earlier week, and a week not yet judged sets nothing', () => {
  const inWeek = (week: number) => shiftDayKeyBy(weekStart(week), 2);
  assert.equal(readRejudgeFrom(null, inWeek(1), weekStart(2)), weekStart(1));
  assert.equal(
    readRejudgeFrom(weekStart(2), inWeek(1), weekStart(2)),
    weekStart(1),
  );
  assert.equal(
    readRejudgeFrom(weekStart(1), inWeek(2), weekStart(2)),
    weekStart(1),
  );
  assert.equal(readRejudgeFrom(null, inWeek(3), weekStart(2)), null);
  assert.equal(readRejudgeFrom(null, inWeek(3), null), null);
  const stored = lifeHabit({
    stage: 'building',
    stageWeek: weekStart(2),
    rejudgeFrom: weekStart(1),
  });
  assert.equal(rejudgeHabit(stored, lifeDays([K, K, K]), LA)?.stage, 'holding');
});

test('a tick older than 16 weeks re-judges nothing and still clears the mark', () => {
  const stored = lifeHabit({
    stage: 'holding',
    stageWeek: weekStart(30),
    rejudgeFrom: weekStart(5),
  });
  const patch = rejudgeHabit(stored, lifeDays([U, U, U]), LA);
  assert.ok(patch);
  assert.equal(patch.stage, 'holding');
  assert.equal(patch.isStageChange, false);
  assert.equal(patch.rejudgeFrom, null);
});

test('a stage change is dated the Monday after the judged week', () => {
  const patch = judgeHabitWeek(
    lifeHabit({ stageWeek: weekStart(1), stage: 'building' }),
    lifeDays([K, K, K]),
    weekStart(2),
    LA,
  );
  assert.equal(patch?.stage, 'holding');
  assert.equal(patch?.stageAt, at(weekStart(3), '03:00', LA));
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
