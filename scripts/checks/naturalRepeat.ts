import assert from 'node:assert/strict';

import { readNaturalSchedule } from '../../src/utils/naturalRepeatUtils.ts';
import type { RepeatRule, Weekday } from '../../src/utils/repeatRule.ts';

const LA = 'America/Los_Angeles';
const AUCKLAND = 'Pacific/Auckland';

// Wednesday 2026-11-11 12:00 in Los Angeles, which is Thursday 09:00 in Auckland.
const WEDNESDAY_NOON = Date.parse('2026-11-11T20:00:00Z');

const read = (text: string, timeZone = LA, weekStart: Weekday = 'MO') =>
  readNaturalSchedule(text, { now: WEDNESDAY_NOON, timeZone, weekStart });

const weekly = (
  weekdays: Weekday[],
  interval = 1,
  extra: Partial<RepeatRule> = {},
): RepeatRule => ({
  freq: 'weekly',
  interval,
  weekStart: 'MO',
  weekdays,
  monthBy: null,
  monthDay: null,
  nth: null,
  nthWeekday: null,
  until: null,
  count: null,
  ...extra,
});
const plain = (
  freq: RepeatRule['freq'],
  interval = 1,
  extra: Partial<RepeatRule> = {},
): RepeatRule => weekly([], interval, { freq, ...extra });
const monthDay = (day: number, interval = 1) =>
  plain('monthly', interval, { monthBy: 'day', monthDay: day });

const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

const cases: [string, RepeatRule | null, string | null, string | null][] = [
  // Repeats with a time
  ['every other Tuesday at 9', weekly(['TU'], 2), '2026-11-17', '09:00'],
  ['weekdays at 7am', weekly(WEEKDAYS), '2026-11-12', '07:00'],
  ['every weekday at 8:30am', weekly(WEEKDAYS), '2026-11-12', '08:30'],
  ['weekends at 10am', weekly(['SA', 'SU']), '2026-11-14', '10:00'],
  ['every weekend', weekly(['SA', 'SU']), '2026-11-14', null],
  ['every day at 6pm', plain('daily'), '2026-11-11', '18:00'],
  ['daily at 9pm', plain('daily'), '2026-11-11', '21:00'],
  ['every morning', plain('daily'), '2026-11-11', null],
  ['every other day', plain('daily', 2), '2026-11-11', null],
  ['every 3 days at noon', plain('daily', 3), '2026-11-12', '12:00'],
  ['every two weeks', weekly(['WE'], 2), '2026-11-11', null],
  ['every other week on Friday', weekly(['FR'], 2), '2026-11-13', null],
  ['weekly', weekly(['WE']), '2026-11-11', null],
  // Days of the week
  ['every Monday', weekly(['MO']), '2026-11-16', null],
  [
    'every Monday and Wednesday at 6pm',
    weekly(['MO', 'WE']),
    '2026-11-11',
    '18:00',
  ],
  ['every Tue, Thu', weekly(['TU', 'TH']), '2026-11-12', null],
  [
    'Tuesdays and Thursdays at 5:30pm',
    weekly(['TU', 'TH']),
    '2026-11-12',
    '17:30',
  ],
  ['on Fridays', weekly(['FR']), '2026-11-13', null],
  ['Mon-Fri at 8am', weekly(WEEKDAYS), '2026-11-12', '08:00'],
  ['Monday through Friday', weekly(WEEKDAYS), '2026-11-11', null],
  ['every Wednesday', weekly(['WE']), '2026-11-11', null],
  // Months and years
  ['the first of every month', monthDay(1), '2026-12-01', null],
  ['the 15th of each month at 9am', monthDay(15), '2026-11-15', '09:00'],
  ['on the 31st of every month', monthDay(31), '2026-12-31', null],
  ['monthly on the 3rd', monthDay(3), '2026-12-03', null],
  ['every month on the 20th', monthDay(20), '2026-11-20', null],
  ['monthly', monthDay(11), '2026-11-11', null],
  ['every other month on the 1st', monthDay(1, 2), '2026-12-01', null],
  ['the last day of every month', monthDay(-1), '2026-11-30', null],
  [
    'the first Monday of every month',
    plain('monthly', 1, { monthBy: 'nthWeekday', nth: 1, nthWeekday: 'MO' }),
    '2026-12-07',
    null,
  ],
  [
    'every month on the last Friday',
    plain('monthly', 1, { monthBy: 'nthWeekday', nth: -1, nthWeekday: 'FR' }),
    '2026-11-27',
    null,
  ],
  ['every year on March 12', plain('yearly'), '2027-03-12', null],
  ['annually', plain('yearly'), '2026-11-11', null],
  // A start day and an end
  ['every Tuesday starting Dec 1', weekly(['TU']), '2026-12-01', null],
  ['every Tuesday starting Dec 2', weekly(['TU']), '2026-12-08', null],
  [
    'every Monday until Dec 21',
    weekly(['MO'], 1, { until: '2026-12-21' }),
    '2026-11-16',
    null,
  ],
  // One-offs
  ['tomorrow at 3', null, '2026-11-12', '15:00'],
  ['Friday at 3pm', null, '2026-11-13', '15:00'],
  ['Mar 12 at 8am', null, '2027-03-12', '08:00'],
  ['at 3pm', null, null, '15:00'],
  ['tonight at 9', null, '2026-11-11', '21:00'],
];

cases.forEach(([text, rule, startsOn, time]) => {
  const got = read(text);
  assert.ok(got, `reads "${text}"`);
  assert.deepEqual(got.rule, rule, `rule of "${text}"`);
  assert.equal(got.startsOn, startsOn, `first day of "${text}"`);
  assert.equal(got.time, time, `time of "${text}"`);
});

// A count a week names no days
assert.deepEqual(read('twice a week'), {
  rule: null,
  timesPerWeek: 2,
  startsOn: null,
  time: null,
});
assert.equal(read('3 times a week')?.timesPerWeek, 3);
assert.equal(read('once a week')?.timesPerWeek, 1);
assert.equal(read('three times per week')?.timesPerWeek, 3);

// The week's first day is kept on the rule
assert.equal(read('every other Tuesday', LA, 'SU')?.rule?.weekStart, 'SU');

// The zone decides what day it is: it is already Thursday 9am in Auckland
assert.equal(read('weekdays at 7am', AUCKLAND)?.startsOn, '2026-11-13');
assert.equal(read('weekdays at 11am', AUCKLAND)?.startsOn, '2026-11-12');
assert.equal(read('every day', AUCKLAND)?.startsOn, '2026-11-12');
assert.equal(read('every other Tuesday', AUCKLAND)?.startsOn, '2026-11-17');

// Text with nothing to read changes nothing
['', 'hello there', 'buy milk', 'every', 'sometimes', 'whenever'].forEach(
  (text) => assert.equal(read(text), null, `"${text}" is not a schedule`),
);

// Ambiguous phrasings settle one way
assert.equal(read('on Monday')?.rule ?? null, null);
assert.equal(read('on Monday')?.startsOn, '2026-11-16');
assert.equal(read('every Monday at 3')?.time, '15:00');
assert.equal(read('every Monday at 10')?.time, '10:00');
assert.equal(read('Sunday')?.rule ?? null, null);

console.log(`Natural repeats: ${cases.length} cases and the extras passed.`);
