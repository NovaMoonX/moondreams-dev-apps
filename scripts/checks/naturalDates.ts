import assert from 'node:assert/strict';

import { parseNaturalDate } from '../../src/utils/naturalDateUtils.ts';

const LA = 'America/Los_Angeles';
const AUCKLAND = 'Pacific/Auckland';

// Wednesday 2026-11-11 12:00 in Los Angeles, which is Thursday 09:00 in Auckland.
const WEDNESDAY_NOON = Date.parse('2026-11-11T20:00:00Z');
const SATURDAY_EVENING = Date.parse('2026-10-31T23:00:00Z');

const day = (year: number, month: number, date: number) => ({
  kind: 'day',
  date: Date.UTC(year, month - 1, date),
});
const moment = (iso: string) => ({ kind: 'moment', at: Date.parse(iso) });

const firstDue = (text: string, now: number, timeZone: string) =>
  parseNaturalDate(text, { now, timeZone })[0]?.due;

const cases = [
  ['Friday', WEDNESDAY_NOON, LA, day(2026, 11, 13)],
  ['Wednesday', WEDNESDAY_NOON, LA, day(2026, 11, 18)],
  ['Fri', WEDNESDAY_NOON, LA, day(2026, 11, 13)],
  ['next Tue', WEDNESDAY_NOON, LA, day(2026, 11, 17)],
  ['next Friday', WEDNESDAY_NOON, LA, day(2026, 11, 20)],
  ['this Friday', WEDNESDAY_NOON, LA, day(2026, 11, 13)],
  ['this Monday', WEDNESDAY_NOON, LA, day(2026, 11, 16)],
  ['this Wednesday', WEDNESDAY_NOON, LA, day(2026, 11, 11)],
  ['Mar 12', WEDNESDAY_NOON, LA, day(2027, 3, 12)],
  ['March 12', WEDNESDAY_NOON, LA, day(2027, 3, 12)],
  ['12 Mar', WEDNESDAY_NOON, LA, day(2027, 3, 12)],
  ['Dec 3rd', WEDNESDAY_NOON, LA, day(2026, 12, 3)],
  ['Nov 11', WEDNESDAY_NOON, LA, day(2026, 11, 11)],
  ['Nov 10', WEDNESDAY_NOON, LA, day(2027, 11, 10)],
  ['today', WEDNESDAY_NOON, LA, day(2026, 11, 11)],
  ['tomorrow', WEDNESDAY_NOON, LA, day(2026, 11, 12)],
  ['tonight', WEDNESDAY_NOON, LA, moment('2026-11-12T04:00:00Z')],
  ['tomorrow at 3', WEDNESDAY_NOON, LA, moment('2026-11-12T23:00:00Z')],
  ['Friday at 3pm', WEDNESDAY_NOON, LA, moment('2026-11-13T23:00:00Z')],
  ['Friday at 9', WEDNESDAY_NOON, LA, moment('2026-11-13T17:00:00Z')],
  ['Fri 3:30pm', WEDNESDAY_NOON, LA, moment('2026-11-13T23:30:00Z')],
  ['Mar 12 at 8am', WEDNESDAY_NOON, LA, moment('2027-03-12T16:00:00Z')],
  ['tomorrow at 12am', WEDNESDAY_NOON, LA, moment('2026-11-12T08:00:00Z')],
  ['tomorrow at 12', WEDNESDAY_NOON, LA, moment('2026-11-12T20:00:00Z')],
  ['tonight at 9', WEDNESDAY_NOON, LA, moment('2026-11-12T05:00:00Z')],
  ['at 3pm', WEDNESDAY_NOON, LA, moment('2026-11-11T23:00:00Z')],
  ['at 11am', WEDNESDAY_NOON, LA, moment('2026-11-12T19:00:00Z')],
  ['3:30pm', WEDNESDAY_NOON, LA, moment('2026-11-11T23:30:00Z')],
  ['Friday', WEDNESDAY_NOON, AUCKLAND, day(2026, 11, 13)],
  ['Thursday', WEDNESDAY_NOON, AUCKLAND, day(2026, 11, 19)],
  ['tomorrow', WEDNESDAY_NOON, AUCKLAND, day(2026, 11, 13)],
  ['next Friday', WEDNESDAY_NOON, AUCKLAND, day(2026, 11, 20)],
  ['tomorrow at 3', WEDNESDAY_NOON, AUCKLAND, moment('2026-11-13T02:00:00Z')],
  ['tomorrow at 3', SATURDAY_EVENING, LA, moment('2026-11-01T23:00:00Z')],
  ['today at 3', SATURDAY_EVENING, LA, moment('2026-10-31T22:00:00Z')],
  ['Sunday at 1am', SATURDAY_EVENING, LA, moment('2026-11-01T08:00:00Z')],
] as const;

cases.forEach(([text, now, zone, expected]) => {
  assert.deepEqual(
    firstDue(text, now, zone),
    expected,
    `${text} (${zone}, ${new Date(now).toISOString()})`,
  );
});

const found = (text: string) =>
  parseNaturalDate(text, { now: WEDNESDAY_NOON, timeZone: LA }).map(
    (entry) => entry.text,
  );

assert.deepEqual(found('Call Dana Friday about the cake'), ['Friday']);
assert.deepEqual(found('Call Dana Friday at 3 and tomorrow at 5pm'), [
  'Friday at 3',
  'tomorrow at 5pm',
]);
assert.deepEqual(found('Mondays are slow'), []);
assert.deepEqual(found('I may go'), []);
assert.deepEqual(found('May the best win'), []);
assert.deepEqual(found('May 5'), ['May 5']);
assert.deepEqual(found('I sat down in the sun'), []);
assert.deepEqual(found('next sat'), ['next sat']);
assert.deepEqual(found('Fridays and Thursday'), ['Thursday']);
assert.deepEqual(found('Feb 30'), []);
assert.deepEqual(found('tomorrow 5 people'), ['tomorrow']);
assert.deepEqual(found('Buy 3 of them'), []);
assert.deepEqual(found('Ask @Friday'), []);
assert.deepEqual(found('Tomorrow, 3pm'), ['Tomorrow, 3pm']);

const [first] = parseNaturalDate('Call Dana on Fri', {
  now: WEDNESDAY_NOON,
  timeZone: LA,
});
assert.deepEqual([first.start, first.end], [13, 16]);

console.log(
  `Natural dates: ${cases.length} cases and the phrase checks passed.`,
);
