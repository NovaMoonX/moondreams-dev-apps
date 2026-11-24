import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  claimPath,
  countWaiting,
  DEFAULT_NOTIFY_HOUR,
  getDigestDay,
  readDigestSettings,
  readSorting,
  EMAIL_MATCH_DAYS_AFTER,
  EMAIL_MATCH_DAYS_BEFORE,
  MAX_SPLIT_CHARGES,
  MAX_SPLIT_POOL,
  withoutEmailTwins,
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
  isPending: false,
});
const rows = [row(100, 0, 500), row(300, 0, 700)];
const DAY = 24 * 60 * 60 * 1000;
assert.equal(readSorting(undefined), null);
assert.equal(readSorting({ isPaused: 'yes', from: 1 }), null);
assert.equal(countWaiting(rows, { isPaused: true, from: 200 }), 0);
assert.equal(countWaiting(rows, { isPaused: false, from: 200 }), 1);
assert.equal(countWaiting(rows, null), 2);
const paused = { isPaused: true, from: 200 };
// Money in with nothing to pair, a card refund included, is counted already and never waits.
assert.equal(countWaiting([row(100, 0, -900)], null), 0);
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
// Pending money in is on its way: it never counts, and a pending charge is never the other side of a move.
assert.equal(
  countWaiting([{ ...row(100, 0, -900), isPending: true }], null),
  0,
);
assert.equal(
  countWaiting(
    [row(100, 0, -900), { ...row(100, 2 * DAY, 900), isPending: true }],
    paused,
  ),
  1,
);
// Money in that only a pending charge of its amount may be the other side of waits with it and doesn't count.
assert.equal(
  countWaiting(
    [row(100, 0, -900), { ...row(100, DAY, 900), isPending: true }],
    null,
  ),
  1,
);
// An unreadable document reads as 0 cents and counts.
assert.equal(countWaiting([row(100, 0, 0)], paused), 1);

// An email and its bank charge count once; the window mirrors the app's constants.
const appConstants = readFileSync(
  new URL('../../src/apps/runway/constants.ts', import.meta.url),
  'utf8',
);
assert.equal(
  EMAIL_MATCH_DAYS_BEFORE,
  Number(/EMAIL_MATCH_DAYS_BEFORE = (\d+)/.exec(appConstants)?.[1]),
);
assert.equal(
  EMAIL_MATCH_DAYS_AFTER,
  Number(/EMAIL_MATCH_DAYS_AFTER = (\d+)/.exec(appConstants)?.[1]),
);
const appTwins = readFileSync(
  new URL('../../src/apps/runway/engine/emailTwins.ts', import.meta.url),
  'utf8',
);
assert.equal(
  MAX_SPLIT_CHARGES,
  Number(/MAX_SPLIT_CHARGES = (\d+)/.exec(appTwins)?.[1]),
);
assert.equal(
  MAX_SPLIT_POOL,
  Number(/MAX_SPLIT_POOL = (\d+)/.exec(appTwins)?.[1]),
);
const twin = (
  id: string,
  source: 'email' | 'link',
  day: number,
  extra: Partial<Parameters<typeof withoutEmailTwins>[0][number]> = {},
) => ({
  id,
  date: day * DAY,
  source,
  amountCents: 1250,
  accountId: 'acct',
  paidByCardId: null as string | null,
  emailWaiting: source === 'email',
  notSameAs: [] as string[],
  pairedWithId: null as string | null,
  name: 'Target' as string | null,
  isOrder: false,
  ...extra,
});
const ids = (list: { id: string }[]) => list.map((entry) => entry.id);
assert.deepEqual(
  ids(withoutEmailTwins([twin('e', 'email', 10), twin('b', 'link', 12)])),
  ['b'],
);
assert.deepEqual(
  ids(withoutEmailTwins([twin('e', 'email', 10), twin('b', 'link', 8)])),
  ['b'],
);
assert.deepEqual(
  ids(withoutEmailTwins([twin('e', 'email', 10), twin('b', 'link', 17)])),
  ['b'],
);
assert.deepEqual(
  ids(withoutEmailTwins([twin('e', 'email', 10), twin('b', 'link', 18)])),
  ['e', 'b'],
  'a bank charge more than seven days after is not the twin',
);
assert.deepEqual(
  ids(withoutEmailTwins([twin('e', 'email', 10), twin('b', 'link', 7)])),
  ['e', 'b'],
  'a bank charge more than two days before is not the twin',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      twin('e', 'email', 10, { paidByCardId: 'c1' }),
      twin('b', 'link', 11, { paidByCardId: 'c2' }),
    ]),
  ),
  ['e', 'b'],
  'a different card is no twin',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      twin('e', 'email', 10, { paidByCardId: 'c1' }),
      twin('b', 'link', 11, { paidByCardId: 'c1' }),
    ]),
  ),
  ['b'],
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      twin('e', 'email', 10),
      twin('b', 'link', 11, { paidByCardId: 'c1' }),
    ]),
  ),
  ['e', 'b'],
  'an account email never pairs a card charge',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      twin('e', 'email', 10),
      twin('b1', 'link', 11),
      twin('b2', 'link', 12),
    ]),
  ),
  ['e', 'b1', 'b2'],
  'two candidates are ambiguous and both stay counted',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      twin('e1', 'email', 10),
      twin('e2', 'email', 10),
      twin('b', 'link', 11),
    ]),
  ),
  ['e1', 'e2', 'b'],
  'a charge two emails fit is no clear twin',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      twin('e', 'email', 10, { notSameAs: ['b'] }),
      twin('b', 'link', 11),
    ]),
  ),
  ['e', 'b'],
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      twin('e', 'email', 10),
      twin('b', 'link', 11, { pairedWithId: 'm' }),
    ]),
  ),
  ['e', 'b'],
  'a charge paired as a move is never a candidate',
);

// A store order that posted as several charges stays counted once and its charges are dropped, as the screen hides them.
const order = (extra: Partial<ReturnType<typeof twin>> = {}) =>
  twin('o', 'email', 10, { amountCents: 10_000, isOrder: true, ...extra });
const charge = (id: string, cents: number, extra = {}) =>
  twin(id, 'link', 11, { amountCents: cents, ...extra });
assert.deepEqual(
  ids(withoutEmailTwins([order(), charge('b1', 6_000), charge('b2', 4_000)])),
  ['o'],
  'two charges that add up to an order are it',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      order(),
      charge('b1', 6_000),
      charge('b2', 4_000, { name: 'Walmart' }),
    ]),
  ),
  ['o', 'b1', 'b2'],
  'charges from another store are not it',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      order(),
      charge('b1', 6_000),
      charge('b2', 4_000),
      charge('b3', 5_000),
      charge('b4', 5_000),
    ]),
  ),
  ['o', 'b1', 'b2', 'b3', 'b4'],
  'two sets that fit are no clear split',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      order({ isOrder: false }),
      charge('b1', 6_000),
      charge('b2', 4_000),
    ]),
  ),
  ['o', 'b1', 'b2'],
  'only a store order is split',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      order(),
      { ...order(), id: 'o2' },
      charge('b1', 6_000),
      charge('b2', 4_000),
    ]),
  ),
  ['o', 'o2', 'b1', 'b2'],
  'two orders the same size could each be it',
);
const crumbs = [1, 2, 3, 4, 5, 6, 7].map((n) => charge(`c${n}`, 1));
assert.deepEqual(
  ids(
    withoutEmailTwins([
      order(),
      charge('b1', 6_000),
      charge('b2', 4_000),
      ...crumbs,
    ]),
  ),
  ['o', 'b1', 'b2', ...crumbs.map((entry) => entry.id)],
  'a pool over the cap stays separate',
);
assert.deepEqual(
  ids(
    withoutEmailTwins([
      order(),
      charge('b1', 6_000),
      charge('b2', 4_000),
      ...crumbs.slice(0, 6),
    ]),
  ),
  ['o', ...crumbs.slice(0, 6).map((entry) => entry.id)],
  'a pool at the cap is still read',
);

console.log('runwayNotifyText: ok');
