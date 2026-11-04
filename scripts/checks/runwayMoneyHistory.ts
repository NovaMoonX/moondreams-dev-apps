import assert from 'node:assert/strict';

import {
  getMoneyHistory,
  getMoneyProjection,
} from '../../src/apps/runway/engine/moneyHistory.ts';
import { emptyClosing } from '../../src/apps/runway/engine/closings.ts';
import type { BillPayment } from '../../src/apps/runway/engine/demands.ts';
import type { OpenMove, OpenRecord } from '../../src/apps/runway/types.ts';

const DAY = 86_400_000;
const d = (n: number) => Date.UTC(2026, 9, 1) + n * DAY;

const startMove = (refId: string | null, amountCents: number) =>
  ({
    id: `start_${refId}`,
    kind: 'start',
    date: d(0),
    refId,
    reversesMoveId: null,
    createdAt: 1,
    payload: { amountCents, holding: refId === null ? 'money' : 'envelope' },
  }) as unknown as OpenMove;
const record = (dayId: string, arrivedCents: number, goalCents: number) =>
  ({
    id: `r_${dayId}`,
    dayId,
    kind: 'confirmed',
    createdAt: 1,
    payload: { arrivedCents, lines: [{ itemId: 'g', cents: goalCents }] },
  }) as unknown as OpenRecord;
const balances = {
  startDate: d(0),
  moves: [startMove(null, 100_000), startMove('g', 0)],
  records: [record('day1', 50_000, 20_000), record('day2', 50_000, 20_000)],
  arrivedOn: new Map([
    ['day1', d(5)],
    ['day2', d(19)],
  ]),
  kinds: { g: 'goal' as const },
};

// History: each point is the day's end, and the last is today.
{
  const points = getMoneyHistory({
    balances,
    today: d(20),
    from: d(0),
    recentFrom: d(0),
    closings: [],
  });
  assert.equal(points[0].on, d(0), 'starts on the starting day');
  assert.equal(points.at(-1)?.on, d(20), 'ends today');
  const at = (n: number) => points.find((point) => point.on === d(n));
  assert.deepEqual(
    [at(4)?.allCents, at(5)?.allCents, at(19)?.allCents],
    [100_000, 150_000, 200_000],
    'money that arrived counts from its day',
  );
  assert.equal(at(5)?.freeCents, 130_000, 'what a goal took is not free');
  assert.equal(at(20)?.freeCents, 160_000);
  assert.ok(points.every((p, i) => i === 0 || p.on > points[i - 1].on));
}

// A range that starts before the starting day is clipped to it.
{
  const points = getMoneyHistory({
    balances,
    today: d(20),
    from: d(-30),
    recentFrom: d(0),
    closings: [],
  });
  assert.equal(points[0].on, d(0));
}

// Before the ledger read, a closing gives its month's end.
{
  const closing = {
    ...emptyClosing('2026-10', d(0)),
    arrivedCents: 50_000,
    given: { g: 20_000 },
  };
  const points = getMoneyHistory({
    balances: {
      ...balances,
      records: [record('day3', 10_000, 0)],
      arrivedOn: new Map([['day3', d(40)]]),
      closing,
    },
    today: d(45),
    from: d(0),
    recentFrom: d(31),
    closings: [closing],
  });
  const monthEnd = points.find((point) => point.on === d(30));
  assert.equal(monthEnd?.allCents, 150_000, 'the closing adds to the start');
  assert.equal(monthEnd?.freeCents, 130_000);
  assert.equal(points[0].on, d(0), 'the starting day leads');
  assert.equal(points[0].allCents, 100_000);
  assert.equal(points.at(-1)?.allCents, 160_000, 'today adds the window');
}

// Projection: pay adds, bills leave on their day, two paydays and up to the third.
{
  const payment = (dueOn: number, totalCents: number, isPaid = false) =>
    ({ dueOn, totalCents, paid: isPaid ? {} : null }) as unknown as BillPayment;
  const points = getMoneyProjection({
    today: d(10),
    now: { on: d(10), freeCents: 5_000, allCents: 50_000 },
    steps: [
      { on: d(14), moneyCents: 100_000, freeCents: 10_000 },
      { on: d(28), moneyCents: 100_000, freeCents: 0 },
      { on: d(42), moneyCents: 100_000, freeCents: 10_000 },
    ],
    payments: {
      rent: [payment(d(15), 80_000), payment(d(45), 80_000)],
      gym: [payment(d(8), 3_000), payment(d(2), 9_000, true)],
      old: [payment(d(-40), 1_000)],
    },
    billsSince: d(0),
  });
  assert.deepEqual(points[0], {
    on: d(10),
    freeCents: 5_000,
    allCents: 50_000,
  });
  const at = (n: number) => points.find((point) => point.on === d(n));
  assert.equal(at(11)?.allCents, 47_000, 'a bill already due leaves tomorrow');
  assert.equal(at(13)?.allCents, 47_000, 'flat until the next change');
  assert.equal(at(14)?.allCents, 147_000);
  assert.equal(
    at(14)?.freeCents,
    15_000,
    'Free to Spend gets what the day leaves',
  );
  assert.equal(at(15)?.allCents, 67_000, 'rent leaves on its due day');
  assert.equal(
    at(15)?.freeCents,
    15_000,
    'a bill does not touch Free to Spend',
  );
  assert.equal(
    points.at(-1)?.on,
    d(41),
    'runs to the day before the third payday',
  );
  assert.equal(points.at(-1)?.allCents, 167_000);
  assert.ok(
    !points.some((point) => point.on === d(42)),
    'the third payday is out',
  );
}
{
  assert.deepEqual(
    getMoneyProjection({
      today: d(10),
      now: { on: d(10), freeCents: 0, allCents: 0 },
      steps: [],
      payments: {},
      billsSince: d(0),
    }),
    [],
    'no income ahead, no projection',
  );
  const one = getMoneyProjection({
    today: d(10),
    now: { on: d(10), freeCents: 0, allCents: 0 },
    steps: [{ on: d(12), moneyCents: 1_000, freeCents: 1_000 }],
    payments: {},
    billsSince: d(0),
  });
  assert.equal(one.at(-1)?.on, d(26), 'one payday runs two weeks past it');
}

console.log('runway money history: ok');
