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
assert.equal(getSafeName('taylor@example.com'), 'Someone', 'a name that is an email is treated as unnamed');
assert.equal(getSafeName(null), 'Someone');
assert.equal(getIdeaPush({ title: 'Ferry to Bainbridge' }, 'Taylor', 'Pacific Northwest').body, 'Taylor suggested Ferry to Bainbridge');
assert.equal(getAnnouncementPush({ severity: 'URGENT', title: 'Ferry cancelled', body: 'Meet at 8' }, 't').title, 'Urgent: Ferry cancelled');
assert.equal(getAnnouncementPush({ severity: 'INFO', title: 'Hello', body: 'x' }, 't').title, 'Hello');
assert.match(getWrapUpPush(['Dinner'], 'Trip').body, /^Dinner is still marked as expected/);
assert.match(getWrapUpPush(['A', 'B'], 'Trip').body, /^A and B are still/);
assert.match(getWrapUpPush(['A', 'B', 'C', 'D'], 'Trip').body, /^A, B and 2 more are still/);
assert.ok(getAnnouncementPush({ severity: 'INFO', title: 'T', body: 'x'.repeat(500) }, 't').body.length <= 140, 'long bodies are clipped');

console.log('waypointPushes: ok');
