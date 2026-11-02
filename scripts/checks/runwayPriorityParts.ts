#!/usr/bin/env tsx
import assert from 'node:assert/strict';

import { buildDraft } from '../../src/apps/runway/engine/draft.ts';
import { getPace } from '../../src/apps/runway/engine/pace.ts';
import {
  fundingAtLevel,
  getExtras,
  getLineId,
} from '../../src/apps/runway/engine/parts.ts';
import {
  applyMove,
  buildMoves,
  canPlacePart,
  getPartRows,
  orderPriorities,
} from '../../src/apps/runway/engine/priorities.ts';
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

// Priorities lists each part as its own row, and a short extra puts the cut at that row.
const rows = getPartRows('groceries', groceries);
assert.deepEqual(
  rows.map((row) => [row.rowId, row.tier]),
  [['groceries:1', 'want']],
);
const order = orderPriorities(
  [
    {
      itemId: 'groceries',
      kind: 'envelope',
      tier: 'must',
      orderIndex: 1,
      createdAt: 1,
      isRest: false,
      isDueFirst: false,
    },
    {
      itemId: 'dining',
      kind: 'envelope',
      tier: 'should',
      orderIndex: 1,
      createdAt: 2,
      isRest: false,
      isDueFirst: false,
    },
    ...rows.map((row) => ({
      itemId: row.rowId,
      kind: 'envelope' as const,
      tier: row.tier,
      orderIndex: row.orderIndex,
      createdAt: 1,
      isRest: false,
      isDueFirst: false,
      lineKey: row.lineKey,
    })),
  ],
  draftOf(40_000, [groceries, dining]),
);
assert.equal(order.cutIndex, 2, 'the cut sits above the short Want extra');

// A part stays between its neighbours' levels.
const tiers: Record<string, 'must' | 'should' | 'want'> = {
  trip: 'must',
  'trip:1': 'should',
  'trip:2': 'want',
};
const tierOf = (rowId: string) => tiers[rowId];
assert.equal(canPlacePart('trip', 'should', tierOf), false);
assert.equal(canPlacePart('trip:1', 'must', tierOf), false);
assert.equal(canPlacePart('trip:1', 'should', tierOf), true);
assert.equal(canPlacePart('trip:2', 'should', tierOf), false);
assert.equal(
  canPlacePart('groceries', 'should', (id) =>
    id === 'groceries:1' ? 'want' : undefined,
  ),
  true,
  'its own amount can drop while it stays above its extra',
);
assert.equal(
  canPlacePart('dining', 'want', () => undefined),
  true,
);

// A reorder writes an extra's new rank into its own item's version, leaving the item's own level.
const D = 86_400_000;
const versions = [
  {
    id: 'v1',
    itemId: 'groceries',
    kind: 'envelope' as const,
    createdAt: 1,
    effectiveFrom: 0,
    effectiveUntil: null,
    payload: groceries,
  },
];
const moves = buildMoves(
  [{ itemId: 'groceries:1', tier: 'want', orderIndex: 7 }],
  versions,
  10 * D,
);
assert.equal(moves.length, 1);
assert.deepEqual(
  [moves[0].itemId, moves[0].priority, moves[0].orderIndex],
  ['groceries', null, null],
);
const moved = applyMove(moves[0].segments[0].payload, moves[0]);
assert.equal(moved.priority, 'must');
assert.deepEqual(moved.extras, [
  { tier: 'want', cents: 25_000, orderIndex: 7 },
]);
const both = buildMoves(
  [
    { itemId: 'groceries', tier: 'should', orderIndex: 2 },
    { itemId: 'groceries:1', tier: 'want', orderIndex: 3 },
  ],
  versions,
  10 * D,
);
assert.equal(both.length, 1, 'one move per item');
assert.deepEqual(
  [
    applyMove(both[0].segments[0].payload, both[0]).priority,
    applyMove(both[0].segments[0].payload, both[0]).extras,
  ],
  ['should', [{ tier: 'want', cents: 25_000, orderIndex: 3 }]],
);

console.log('runway priority parts: ok');
