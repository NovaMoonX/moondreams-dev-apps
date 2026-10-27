import assert from 'node:assert/strict';

import {
  canChangeStart,
  STARTING_CORRECTION_DAYS,
} from '../../src/apps/runway/utils/startingCorrection.ts';

const DAY = 86_400_000;
const start = Date.UTC(2026, 9, 1);
const made = Date.UTC(2026, 9, 2, 15);
const base = {
  startDate: start,
  startCreatedAt: made,
  confirmedDays: [],
  now: made,
};

assert.equal(canChangeStart(base), true, 'a new start can be changed');
assert.equal(
  canChangeStart({ ...base, startDate: null }),
  true,
  'no start yet',
);
assert.equal(
  canChangeStart({ ...base, startCreatedAt: null }),
  true,
  'no record in hand',
);
assert.equal(
  canChangeStart({ ...base, now: made + STARTING_CORRECTION_DAYS * DAY }),
  true,
  'exactly 14 days after is still open',
);
assert.equal(
  canChangeStart({ ...base, now: made + STARTING_CORRECTION_DAYS * DAY + 1 }),
  false,
  'one millisecond past 14 days closes it',
);
assert.equal(
  canChangeStart({ ...base, confirmedDays: [start + 14 * DAY] }),
  false,
  'a confirmed day from the start closes it',
);
assert.equal(
  canChangeStart({ ...base, confirmedDays: [start] }),
  false,
  'a confirmed day on the start day closes it',
);
assert.equal(
  canChangeStart({ ...base, confirmedDays: [start - DAY] }),
  true,
  'a day confirmed before the start does not count',
);
assert.equal(
  canChangeStart({
    ...base,
    confirmedDays: [start + 3 * DAY],
    now: made + 20 * DAY,
  }),
  false,
  'whichever comes first',
);
console.log('runwayStartCorrection: ok');
