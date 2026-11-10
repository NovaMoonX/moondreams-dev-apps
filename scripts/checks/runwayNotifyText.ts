import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  claimPath,
  countWaiting,
  DEFAULT_NOTIFY_HOUR,
  getDigestDay,
  readDigestSettings,
  readSorting,
} from '../../functions/src/apps/runway/needsHomeDigestPlan.ts';
import { needsHomeBody } from '../../functions/src/apps/runway/notificationText.ts';

const source = readFileSync(
  new URL(
    '../../functions/src/apps/runway/notificationText.ts',
    import.meta.url,
  ),
  'utf8',
);

// Text: the only interpolation allowed is the count.
const holes = [...source.matchAll(/\$\{([^}]*)\}/g)].map((match) =>
  match[1].trim(),
);
assert.deepEqual(
  holes.filter((hole) => hole !== 'count'),
  [],
  'a push template interpolates something other than the count',
);
assert.ok(
  !/\b(amount|cents|merchant|name|note|memo|payee|sealed)\b/i.test(
    source.replace(/\/\*\*[\s\S]*?\*\//g, ''),
  ),
  'notificationText.ts reads a field named like a sealed field',
);
assert.equal(needsHomeBody(1), '1 purchase needs a home');
assert.equal(needsHomeBody(4), '4 purchases need a home');

// Decision: hour match, UTC fallback, default hour, date roll-over.
const at = (iso: string) => Date.parse(iso);
const utc19 = at('2026-03-10T19:10:00Z');
assert.equal(DEFAULT_NOTIFY_HOUR, 19);
assert.deepEqual(readDigestSettings({}), { hour: 19, zone: null });
assert.deepEqual(
  readDigestSettings({ notifyHour: 7, notifyTimeZone: 'Asia/Tokyo' }),
  { hour: 7, zone: 'Asia/Tokyo' },
);
assert.equal(readDigestSettings({ notifyHour: 24 }).hour, 19);
assert.equal(readDigestSettings({ notifyHour: 7.5 }).hour, 19);
assert.equal(getDigestDay(utc19, readDigestSettings({})), '2026-03-10');
assert.equal(
  getDigestDay(at('2026-03-10T18:59:00Z'), readDigestSettings({})),
  null,
);
assert.equal(
  getDigestDay(utc19, { hour: 19, zone: 'Not/AZone' }),
  '2026-03-10',
);
const tokyo = { hour: 8, zone: 'Asia/Tokyo' };
assert.equal(getDigestDay(at('2026-03-10T23:30:00Z'), tokyo), '2026-03-11');
assert.equal(getDigestDay(at('2026-03-10T22:30:00Z'), tokyo), null);
const la = { hour: 19, zone: 'America/Los_Angeles' };
assert.equal(getDigestDay(at('2026-03-11T02:10:00Z'), la), '2026-03-10');
assert.equal(
  claimPath('u1', '2026-03-10'),
  'apps/runway/server/u1/notified/needsHome_2026-03-10',
);

// Sorting switch: a charge counts only after the switch's moment and while it is off; no switch counts every charge.
const row = (createdAt: number, date: number, amountCents: number) => ({
  createdAt,
  date,
  amountCents,
  isOnCard: false,
});
const rows = [row(100, 0, 500), row(300, 0, 700)];
const DAY = 24 * 60 * 60 * 1000;
assert.equal(readSorting(undefined), null);
assert.equal(readSorting({ isPaused: 'yes', from: 1 }), null);
assert.equal(countWaiting(rows, { isPaused: true, from: 200 }), 0);
assert.equal(countWaiting(rows, { isPaused: false, from: 200 }), 1);
assert.equal(countWaiting(rows, null), 2);
const paused = { isPaused: true, from: 200 };
// Money in with nothing to pair and not on a card is counted already and never waits.
assert.equal(countWaiting([row(100, 0, -900)], null), 0);
// Money in on a card still asks (card payment, refund or unseen account).
assert.equal(
  countWaiting([{ ...row(100, 0, -900), isOnCard: true }], null),
  1,
);
// A quiet charge and money in of its amount within three days are a possible move: both count, as the screen keeps them.
assert.equal(
  countWaiting([row(100, 0, -900), row(100, 2 * DAY, 900)], paused),
  2,
);
// The same amount weeks apart is no move: the charge stays quiet and the money in doesn't wait.
assert.equal(
  countWaiting([row(100, 0, -900), row(100, 40 * DAY, 900)], paused),
  0,
);
// An unreadable document reads as 0 cents and counts.
assert.equal(countWaiting([row(100, 0, 0)], paused), 1);

console.log('runwayNotifyText: ok');
