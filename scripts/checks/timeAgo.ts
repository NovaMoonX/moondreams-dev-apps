import assert from 'node:assert/strict';

import {
  formatDateOrdinal,
  formatTimeAgo,
} from '../../src/utils/formatUtils.ts';

const NOW = new Date(2026, 10, 23, 15, 30, 0).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();

assert.equal(formatTimeAgo(NOW - 20_000, NOW), 'Just now');
assert.equal(formatTimeAgo(NOW + 5 * MIN, NOW), 'Just now');
assert.equal(formatTimeAgo(NOW - 5 * MIN, NOW), '5 min ago');
assert.equal(formatTimeAgo(NOW - 59 * MIN, NOW), '59 min ago');
assert.equal(formatTimeAgo(NOW - 2 * HOUR, NOW), '2 hr ago');
assert.equal(formatTimeAgo(at(23, 0, 5), NOW), '15 hr ago');
assert.match(formatTimeAgo(at(22, 15, 15), NOW), /^Yesterday at .*3:15/);
assert.match(formatTimeAgo(at(22, 23, 0), NOW), /^Yesterday at /);
assert.equal(formatTimeAgo(at(21, 9), NOW), '2 days ago');
assert.equal(formatTimeAgo(at(17, 9), NOW), '6 days ago');
assert.equal(formatTimeAgo(at(16, 9), NOW), formatDateOrdinal(at(16, 9)));
assert.equal(formatTimeAgo(NOW - 20_000, NOW, true), 'just now');
assert.match(formatTimeAgo(at(22, 15, 15), NOW, true), /^yesterday at /);
assert.equal(formatTimeAgo(NOW - 5 * MIN, NOW, true), '5 min ago');

console.log('check:time-ago passed');
