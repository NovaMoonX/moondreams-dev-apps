import assert from 'node:assert/strict';

import {
  WRAP_UP_HOUR,
  getAdminUids,
  getAnnouncementPush,
  getIdeaPush,
  getLocalClock,
  getSafeName,
  getWrapUpDay,
  getWrapUpPush,
} from '../../functions/src/apps/waypoint/tripPushes.ts';
import {
  getMorningDay,
  getMorningPush,
  getMorningRecipients,
  getWeatherNudge,
} from '../../functions/src/apps/waypoint/morningPushes.ts';
import {
  DAILY_UNREQUESTED_CAP,
  decidePush,
  isQuietHour,
  readPushCount,
} from '../../functions/src/notifications/pushBudget.ts';

const DAY = 86_400_000;
const START = Date.UTC(2026, 9, 17);
const trip = { startDate: START, endDate: START + 2 * DAY, timezone: 'America/Los_Angeles', title: 'Pacific Northwest' };

// Local clock follows the trip's zone, not UTC.
assert.deepEqual(getLocalClock(Date.UTC(2026, 9, 18, 4, 30), 'America/Los_Angeles'), { date: '2026-10-17', hour: 21 });
assert.deepEqual(getLocalClock(Date.UTC(2026, 9, 18, 4, 30), null), { date: '2026-10-18', hour: 4 });
assert.equal(getLocalClock(Date.UTC(2026, 9, 18, 4, 30), 'Not/AZone').hour, 4, 'an unknown zone reads as UTC');

// Wrap-up: 9 PM local on a trip day, both runs in the hour, nothing outside it.
assert.equal(WRAP_UP_HOUR, 21);
const at = (hour: number, minute: number, day = 17) => Date.UTC(2026, 9, day, hour + 7, minute);
assert.deepEqual(getWrapUpDay(trip, at(21, 0)), { date: '2026-10-17', dayIndex: 0 });
assert.deepEqual(getWrapUpDay(trip, at(21, 30)), { date: '2026-10-17', dayIndex: 0 });
assert.equal(getWrapUpDay(trip, at(20, 59)), null, 'before 9 PM');
assert.equal(getWrapUpDay(trip, at(22, 0)), null, 'after the hour a late run drops it');
assert.deepEqual(getWrapUpDay(trip, at(21, 0, 19)), { date: '2026-10-19', dayIndex: 2 }, 'the last day counts');
assert.equal(getWrapUpDay(trip, at(21, 0, 20)), null, 'the day after the trip');
assert.equal(getWrapUpDay(trip, at(21, 0, 16)), null, 'the day before the trip');
assert.equal(getWrapUpDay({ ...trip, startDate: 'x' }, at(21, 0)), null, 'a malformed trip is skipped');

// Admins only.
assert.deepEqual(
  getAdminUids({ members: { a: { role: 'ADMIN' }, b: { role: 'EDITOR' }, c: { role: 'ADMIN' } } }),
  ['a', 'c'],
);

// Copy never carries an email, and names at most two expenses.
assert.equal(getSafeName('Taylor'), 'Taylor');
assert.equal(getSafeName('Alex Rivera'), 'Alex R.', 'first name and last initial');
assert.equal(getSafeName('  mary ann  smith '), 'mary S.', 'the last word gives the initial');
assert.equal(getSafeName('Alex r@x.com Rivera'), 'Someone', 'an email anywhere in the name');
assert.equal(getSafeName('taylor@example.com'), 'Someone', 'a name that is an email is treated as unnamed');
assert.equal(getSafeName(null), 'Someone');
assert.equal(getIdeaPush({ title: 'Ferry to Bainbridge' }, 'Taylor', 'Pacific Northwest').body, 'Taylor suggested Ferry to Bainbridge');
assert.equal(getAnnouncementPush({ severity: 'URGENT', title: 'Ferry cancelled', body: 'Meet at 8' }, 't').title, 'Urgent: Ferry cancelled');
assert.equal(getAnnouncementPush({ severity: 'INFO', title: 'Hello', body: 'x' }, 't').title, 'Hello');
assert.match(getWrapUpPush(['Dinner'], 'Trip').body, /^Dinner is still marked Expected on Trip/);
assert.equal(getWrapUpPush(['Dinner'], 'Trip').title, 'Any expenses paid today?');
assert.match(getWrapUpPush(['A', 'B'], 'Trip').body, /^A and B are still/);
assert.match(getWrapUpPush(['A', 'B', 'C', 'D'], 'Trip').body, /^A, B and 2 more are still/);
assert.ok(getAnnouncementPush({ severity: 'INFO', title: 'T', body: 'x'.repeat(500) }, 't').body.length <= 140, 'long bodies are clipped');

// Quiet hours: nothing unrequested from 22:00 to 08:00 local; the 9 PM wrap-up is inside the window.
assert.deepEqual([21, 22, 23, 0, 7, 8, 12].map(isQuietHour), [false, true, true, true, true, false, false]);
assert.equal(decidePush(0, WRAP_UP_HOUR), 'send', 'the 9 PM wrap-up is an ordinary push');
assert.equal(decidePush(0, 23), 'quiet');
assert.equal(decidePush(0, 7), 'quiet');
assert.equal(decidePush(DAILY_UNREQUESTED_CAP - 1, 12), 'send');
assert.equal(decidePush(DAILY_UNREQUESTED_CAP, 12), 'capped', 'the fourth push of a day is dropped');
assert.equal(DAILY_UNREQUESTED_CAP, 3);
assert.equal(decidePush(DAILY_UNREQUESTED_CAP, 23), 'quiet');
assert.equal(readPushCount({ day: '2026-10-17', count: 2 }, '2026-10-17'), 2);
assert.equal(readPushCount({ day: '2026-10-16', count: 3 }, '2026-10-17'), 0, 'a new local day starts at zero');
assert.equal(readPushCount(undefined, '2026-10-17'), 0);

// Morning: 8 AM in the trip's zone only, with the day index relative to the trip (negative before it).
const eight = (day: number, minute = 0) => Date.UTC(2026, 9, day, 8 + 7, minute);
assert.deepEqual(getMorningDay(trip, eight(17)), { date: '2026-10-17', dayIndex: 0 });
assert.deepEqual(getMorningDay(trip, eight(17, 30)), { date: '2026-10-17', dayIndex: 0 });
assert.deepEqual(getMorningDay(trip, eight(15)), { date: '2026-10-15', dayIndex: -2 }, 'two days before');
assert.equal(getMorningDay(trip, Date.UTC(2026, 9, 17, 16, 0)), null, 'after the hour');
assert.equal(getMorningDay({ ...trip, timezone: null }, eight(17)), null, 'no zone, no 8 AM');
assert.equal(getMorningDay({ ...trip, timezone: 'Not/AZone' }, eight(17)), null);

const items = [
  { title: 'Passport copies', assignedToUids: ['a'], completeByDayIndex: 0 },
  { title: 'Book airport taxi', assignedToUids: [], completeByDayIndex: 0 },
  { title: 'Buy adapters', assignedToUids: ['a', 'b'], completeByDayIndex: 0 },
  { title: 'Print tickets', assignedToUids: ['b'], completeByDayIndex: 0 },
  { title: 'Pack', assignedToUids: ['a'], completeByDayIndex: null },
];
const due = getMorningRecipients(items, ['a', 'b', 'c'], 0, false);
assert.deepEqual(due.map((person) => [person.uid, person.dueTitles.length]), [['a', 3], ['b', 3], ['c', 1]], 'anyone-items reach every member');
assert.deepEqual(getMorningRecipients(items, ['a', 'c'], 1, false), [], 'nothing due sends nothing');
assert.equal(getMorningRecipients(items, ['a', 'c'], -2, true).length, 2, 'the getting-ready morning reaches everyone');
assert.equal(getMorningRecipients(items, ['a'], -2, true)[0].openCount, 4);
assert.equal(getMorningRecipients([{ title: 'Late', assignedToUids: ['a'], completeByDayIndex: -3 }], ['a'], -3, false)[0].dueTitles[0], 'Late', 'a negative day index is a day before the trip');

const three = { dueTitles: ['Passport copies', 'Book airport taxi', 'Buy adapters'], openCount: 4 };
assert.deepEqual(getMorningPush(three, 'Lisbon', null), {
  title: '3 things to do today for Lisbon',
  body: 'Passport copies, Book airport taxi, +1 more',
});
assert.equal(getMorningPush({ dueTitles: ['Pack'], openCount: 1 }, 'Lisbon', null).title, '1 thing to do today for Lisbon');
const forecast = { weatherCode: 61, tempMax: 68.4, tempMin: 54.2, precipChance: 60 };
assert.equal(getWeatherNudge(forecast), 'Day one: rain, 68°/54°F. Pack for it.');
assert.equal(getWeatherNudge(null), 'Check the forecast and pack for it.');
const ready = getMorningPush({ dueTitles: [], openCount: 3 }, 'Lisbon', { forecast, firstPlanTitle: 'Flight to LIS' });
assert.equal(ready.title, 'Lisbon starts in 2 days');
assert.equal(ready.body, '3 to-dos are still open for you. Day one: rain, 68°/54°F. Pack for it. First up: Flight to LIS.');
assert.match(getMorningPush({ dueTitles: ['A'], openCount: 0 }, 'L', { forecast: null, firstPlanTitle: null }).body, /^1 thing to do today: A\. Your to-do list is all clear\. Check the forecast/);

console.log('waypointPushes: ok');
