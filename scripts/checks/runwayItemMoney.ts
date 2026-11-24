import assert from 'node:assert/strict';

import { deriveBalances } from '../../src/apps/runway/engine/balances.ts';
import {
  collectItemMoney,
  withBroughtForward,
  withHeldAfter,
} from '../../src/apps/runway/engine/itemMoney.ts';
import type {
  OpenMove,
  OpenPurchase,
  OpenRecord,
} from '../../src/apps/runway/types.ts';

const DAY = 86_400_000;
const d = (n: number) => Date.UTC(2026, 9, 1) + n * DAY;

const move = (fields: Record<string, unknown>) =>
  ({
    reversesMoveId: null,
    createdAt: 1,
    ...fields,
  }) as unknown as OpenMove;
const startMove = (refId: string | null, amountCents: number) =>
  move({
    id: `start_${refId}`,
    kind: 'start',
    date: d(0),
    refId,
    payload: { amountCents, holding: refId === null ? 'money' : 'envelope' },
  });
const transfer = (
  id: string,
  on: number,
  fromId: string | null,
  toId: string | null,
  cents: number,
) =>
  move({
    id,
    kind: 'transfer',
    date: on,
    refId: null,
    payload: { fromId, toId, cents },
  });
const record = (
  id: string,
  dayId: string,
  lines: { itemId: string; cents: number }[],
  extra: Record<string, unknown> = {},
) =>
  ({
    id,
    dayId,
    kind: 'confirmed',
    createdAt: 1,
    ...extra,
    payload: {
      arrivedCents: 100_000,
      freeToSpendCents: 0,
      stance: 'planned',
      lines: lines.map((line, index) => ({
        lineId: `${id}_${index}`,
        repaysFree: false,
        ...line,
      })),
    },
  }) as unknown as OpenRecord;
const purchase = (
  id: string,
  on: number,
  lines: { envelopeId: string | null; cents: number }[],
) =>
  ({
    id,
    date: on,
    amountCents: lines.reduce((sum, line) => sum + line.cents, 0),
    lines,
    pairedWithId: null,
    paidByCardId: null,
  }) as unknown as OpenPurchase;

const input = {
  startDate: d(0),
  moves: [
    startMove(null, 200_000),
    startMove('groceries', 10_000),
    transfer('t1', d(6), null, 'groceries', 5_000),
    transfer('t2', d(9), 'groceries', 'dining', 2_000),
    transfer('undone', d(9), 'groceries', 'dining', 900),
    move({
      id: 'unundone',
      kind: 'transfer',
      date: d(9),
      refId: null,
      reversesMoveId: 'undone',
      payload: { fromId: 'groceries', toId: 'dining', cents: 900 },
    }),
  ],
  records: [
    record('r1', 'day1', [
      { itemId: 'groceries', cents: 30_000 },
      { itemId: 'dining', cents: 10_000 },
    ]),
    record('r2', 'day2', [{ itemId: 'groceries', cents: 30_000 }]),
    record('r2c', 'day2', [{ itemId: 'groceries', cents: 25_000 }], {
      kind: 'correction',
      supersedesId: 'r2',
      createdAt: 2,
    }),
  ],
  arrivedOn: new Map([
    ['day1', d(1)],
    ['day2', d(15)],
  ]),
  kinds: { groceries: 'envelope' as const, dining: 'envelope' as const },
  purchases: [
    purchase('p1', d(3), [{ envelopeId: 'groceries', cents: 4_218 }]),
    purchase('p2', d(10), [
      { envelopeId: 'groceries', cents: 3_000 },
      { envelopeId: 'dining', cents: 1_500 },
      { envelopeId: 'groceries', cents: 500 },
    ]),
    purchase('refund', d(12), [{ envelopeId: 'groceries', cents: -1_000 }]),
    purchase('old', d(-2), [{ envelopeId: 'groceries', cents: 999 }]),
    purchase('elsewhere', d(4), [{ envelopeId: 'dining', cents: 700 }]),
  ],
};

// Every row the balances count is listed, and what they add up to is the envelope's figure.
{
  const held = deriveBalances(input).assignedByItem.groceries;
  const entries = collectItemMoney('groceries', input);
  assert.deepEqual(
    entries.map((entry) => [entry.kind, entry.id, entry.cents]),
    [
      ['pay', 'pay_day2', 25_000],
      ['purchase', 'refund', 1_000],
      ['purchase', 'p2', -3_500],
      ['move', 't2', -2_000],
      ['move', 't1', 5_000],
      ['purchase', 'p1', -4_218],
      ['pay', 'pay_day1', 30_000],
      ['start', 'start_groceries', 10_000],
    ],
    'newest first; a correction replaces its day; an undone move and a purchase before the start are left out; one purchase on two lines is one row',
  );
  assert.equal(
    entries.reduce((sum, entry) => sum + entry.cents, 0),
    held,
    'the rows add up to the envelope',
  );
  const rows = withHeldAfter(entries, held);
  assert.equal(rows[0].heldAfterCents, held, 'the newest row ends on today');
  assert.equal(rows.at(-1)?.heldAfterCents, 10_000, 'the start reads its own');
  assert.equal(
    rows.find((row) => row.id === 'p1')?.heldAfterCents,
    10_000 + 30_000 - 4_218,
  );
}

// Worked back from today's figure, a list cut short (a closing holds the rest) still ends right.
{
  const rows = withHeldAfter(collectItemMoney('groceries', input), 50_000);
  assert.equal(rows[0].heldAfterCents, 50_000);
  assert.equal(rows[1].heldAfterCents, 50_000 - 25_000);
}

// A Horizon item's paid mark takes what the item held; a goal that helped pay gives its share.
{
  const paid = move({
    id: 'paid1',
    kind: 'costPaid',
    date: d(20),
    refId: 'trip',
    payload: {
      costId: 'flights',
      dueOn: d(20),
      amountCents: 50_000,
      paidOn: d(20),
      fromFreeCents: 5_000,
      mark: 'item',
      purchaseId: null,
      fromGoalCents: 15_000,
      goalId: 'savings',
    },
  });
  const horizonInput = {
    ...input,
    moves: [
      ...input.moves,
      startMove('trip', 40_000),
      startMove('savings', 20_000),
      paid,
    ],
    kinds: {
      ...input.kinds,
      trip: 'horizon' as const,
      savings: 'goal' as const,
    },
  };
  const balances = deriveBalances(horizonInput).assignedByItem;
  const trip = collectItemMoney('trip', horizonInput);
  const savings = collectItemMoney('savings', horizonInput);
  assert.deepEqual(
    trip.map((entry) => [entry.kind, entry.cents]),
    [
      ['paid', -30_000],
      ['start', 40_000],
    ],
  );
  assert.deepEqual(
    savings.map((entry) => [
      entry.kind,
      entry.cents,
      'ownerId' in entry ? entry.ownerId : null,
    ]),
    [
      ['paid', -15_000, 'trip'],
      ['start', 20_000, null],
    ],
  );
  assert.equal(
    trip.reduce((sum, e) => sum + e.cents, 0),
    balances.trip,
  );
  assert.equal(
    savings.reduce((sum, e) => sum + e.cents, 0),
    balances.savings,
  );
}

// Older days summed away by a closing end the list on what the item held before the window.
{
  const entries = collectItemMoney('groceries', input);
  const whole = entries.reduce((sum, entry) => sum + entry.cents, 0);
  const rows = withHeldAfter(entries, 50_000);
  const ended = withBroughtForward(
    withHeldAfter(entries, whole),
    whole,
    'groceries',
    d(5),
  );
  assert.equal(ended.length, rows.length, 'a start row already explains it');
  const noStart = rows.slice(0, 2);
  const carried = withBroughtForward(noStart, 50_000, 'groceries', d(5));
  const last = carried.at(-1);
  assert.equal(last?.kind, 'earlier');
  assert.equal(last?.heldAfterCents, 50_000 - 25_000 - 1_000);
  assert.equal(last?.cents, last?.heldAfterCents);
  assert.equal(
    withBroughtForward(noStart, 50_000, 'groceries', null).length,
    2,
    'nothing summed away, nothing brought forward',
  );
  assert.deepEqual(
    withBroughtForward([], 7_000, 'groceries', d(5)).map((row) => [
      row.kind,
      row.heldAfterCents,
    ]),
    [['earlier', 7_000]],
    'an item with no loaded rows still shows what it holds',
  );
  assert.equal(withBroughtForward([], 0, 'groceries', d(5)).length, 0);
  const summed = rows.filter((row) => row.on >= d(5) || row.kind === 'start');
  const gapped = withBroughtForward(
    withHeldAfter(summed, whole),
    whole,
    'groceries',
    d(5),
  );
  const start = gapped.at(-1);
  const earlier = gapped.at(-2);
  assert.equal(start?.kind, 'start', 'the start stays the oldest row');
  assert.equal(start?.heldAfterCents, start?.cents, 'the start holds itself');
  assert.equal(earlier?.kind, 'earlier', 'the summed days sit above it');
}

// No starting point, no history.
assert.deepEqual(
  collectItemMoney('groceries', { ...input, startDate: null }),
  [],
);

console.log('runway item money: ok');
