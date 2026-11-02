#!/usr/bin/env tsx
import assert from 'node:assert/strict';

import { buildDraft } from '../../src/apps/runway/engine/draft.ts';
import { getPace } from '../../src/apps/runway/engine/pace.ts';
import {
  fundingAtLevel,
  getExtras,
  getLineId,
} from '../../src/apps/runway/engine/parts.ts';
import type { DraftEnvelopeInput } from '../../src/apps/runway/engine/demands.ts';
import type { FundingRule } from '../../src/apps/runway/types.ts';

const utc = (year: number, month: number, day: number) =>
  Date.UTC(year, month - 1, day);
const everyDay = (cents: number): FundingRule => ({
  amount: { kind: 'exact', cents },
  cadence: { kind: 'everyIncomeDay' },
});
const incomeDays = [1, 15].map((day) => ({
  dayKey: `pay_${day}`,
  on: utc(2027, 1, day),
  moneyCents: 100_000,
}));
const day = (cents: number) => ({
  dayKey: 'pay_1',
  sourceId: null,
  on: utc(2027, 1, 1),
  amount: { lowCents: cents, highCents: cents },
});
const groceries: DraftEnvelopeInput = {
  itemId: 'groceries',
  createdAt: 1,
  priority: 'must',
  orderIndex: 1,
  funding: everyDay(25_000),
  extras: [{ tier: 'want', cents: 25_000, orderIndex: 1 }],
};
const dining: DraftEnvelopeInput = {
  itemId: 'dining',
  createdAt: 2,
  priority: 'should',
  orderIndex: 1,
  funding: everyDay(10_000),
};
const draftOf = (
  money: number,
  envelopes: DraftEnvelopeInput[],
  goals: Parameters<typeof buildDraft>[0]['plan']['goals'] = [],
) =>
  buildDraft({
    days: [day(money)],
    plan: { envelopes, bills: [], goals, horizon: utc(2027, 6, 1), incomeDays },
    stance: 'conservative',
    overrides: { dayCents: {} },
  });
const linesOf = (draft: ReturnType<typeof buildDraft>) =>
  draft.lines.map((line) => [line.lineId, line.tier, line.cents, line.shortBy]);

// Only extras below the item's own priority count, one per level, and never on a share of pay.
assert.deepEqual(
  getExtras({
    priority: 'should',
    orderIndex: 1,
    funding: everyDay(100),
    extras: [
      { tier: 'must', cents: 50, orderIndex: 1 },
      { tier: 'want', cents: 50, orderIndex: 2 },
      { tier: 'want', cents: 70, orderIndex: 3 },
      { tier: 'should', cents: 50, orderIndex: 4 },
    ],
  }),
  [{ tier: 'want', cents: 50, orderIndex: 2 }],
  'an extra sits below its item, once per level',
);
assert.deepEqual(
  getExtras({
    ...groceries,
    funding: {
      amount: { kind: 'percent', bps: 1000, of: 'dayMoney' },
      cadence: { kind: 'everyIncomeDay' },
    },
  }),
  [],
  'a share of pay carries no extras',
);

// Each part is its own line at its own priority; the Must part keeps the item's line id.
assert.deepEqual(
  linesOf(draftOf(100_000, [groceries, dining])),
  [
    ['pay_1:groceries', 'must', 25_000, 0],
    ['pay_1:dining', 'should', 10_000, 0],
    ['pay_1:groceries:want', 'want', 25_000, 0],
  ],
  'a split envelope is funded at each of its levels',
);
assert.equal(getLineId('pay_1', 'groceries', 'want'), 'pay_1:groceries:want');

// A short paycheck reaches the Want extra first, then Shoulds, never the Must part while others remain.
assert.deepEqual(
  linesOf(draftOf(40_000, [groceries, dining])),
  [
    ['pay_1:groceries', 'must', 25_000, 0],
    ['pay_1:dining', 'should', 10_000, 0],
    ['pay_1:groceries:want', 'want', 5_000, 20_000],
  ],
  'a short day gives way at the extra first',
);
assert.deepEqual(
  linesOf(draftOf(30_000, [groceries, dining])),
  [
    ['pay_1:groceries', 'must', 25_000, 0],
    ['pay_1:dining', 'should', 5_000, 5_000],
    ['pay_1:groceries:want', 'want', 0, 25_000],
  ],
  'Shoulds give way after Wants',
);

// A max trims the lowest part first.
assert.deepEqual(
  linesOf(draftOf(100_000, [{ ...groceries, maxCents: 30_000 }])),
  [
    ['pay_1:groceries', 'must', 25_000, 0],
    ['pay_1:groceries:want', 'want', 5_000, 0],
  ],
  'a max reaches the extra before the Must part',
);

// An envelope with no extras works as before.
assert.deepEqual(
  linesOf(draftOf(100_000, [{ ...groceries, extras: null }])),
  [['pay_1:groceries', 'must', 25_000, 0]],
  'no extras, one line',
);

// A goal's contribution splits the same way and stops at its target.
const trip = {
  itemId: 'trip',
  createdAt: 3,
  priority: 'must' as const,
  orderIndex: 2,
  funding: everyDay(10_000),
  extras: [{ tier: 'should' as const, cents: 5_000, orderIndex: 2 }],
  targetCents: 12_000,
  heldCents: 0,
};
assert.deepEqual(
  linesOf(draftOf(100_000, [], [trip])),
  [
    ['pay_1:trip', 'must', 10_000, 0],
    ['pay_1:trip:should', 'should', 2_000, 0],
  ],
  'a goal near its target trims the extra',
);

// The finish date follows the level counted.
const longTrip = { ...trip, targetCents: 60_000, targetDate: null };
const days = Array.from({ length: 12 }, (_, index) => ({
  dayKey: `d${index}`,
  on: utc(2027, 1, 1) + index * 14 * 86_400_000,
  moneyCents: 100_000,
}));
const reachedOn = (level: 'must' | 'want') =>
  getPace(
    {
      ...longTrip,
      funding: fundingAtLevel(longTrip, level) as FundingRule,
      extras: null,
    },
    days,
  ).reachedOn?.dayKey;
assert.equal(reachedOn('want'), 'd3', 'with every part: 4 days of $150');
assert.equal(reachedOn('must'), 'd5', 'on Musts only: 6 days of $100');
assert.equal(
  fundingAtLevel({ ...longTrip, priority: 'should' }, 'must'),
  null,
  'a Should goal adds nothing on Musts only',
);

console.log('runway priority parts: ok');
