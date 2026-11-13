import assert from 'node:assert/strict';

import { getNextYearHorizon } from '../../src/apps/runway/engine/horizon.ts';
import { describeChange } from '../../src/apps/runway/utils/changeText.ts';
import type {
  HorizonCost,
  HorizonSealed,
} from '../../src/apps/runway/types.ts';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

const cost = (id: string, over: Partial<HorizonCost> = {}): HorizonCost => ({
  id,
  name: id,
  amount: { lowCents: 10_000, highCents: 20_000 },
  schedule: { kind: 'once', anchor: day('2026-11-10'), monthDays: [] },
  ending: { onDate: null, afterCount: null },
  isOutside: false,
  pricedOn: day('2026-05-01'),
  endsAfter: null,
  becameBillId: null,
  becameBillOn: null,
  priority: null,
  note: null,
  ...over,
});

const horizon: HorizonSealed = {
  name: 'Guys trip',
  emoji: '✈️',
  happensOn: day('2024-02-29'),
  happensUntil: day('2026-11-18'),
  priority: 'should',
  orderIndex: 3,
  rest: { kind: 'pays', startsOn: day('2026-01-01') },
  note: 'Bring cash',
  costs: [
    cost('hotel'),
    cost('flight', { amount: { lowCents: 1, highCents: 99 } }),
    cost('bill', { becameBillId: 'b1', becameBillOn: day('2026-06-01') }),
    cost('gone', { endsAfter: day('2026-03-01') }),
    cost('goal-goal-1', { amount: { lowCents: 50_000, highCents: 50_000 } }),
    cost('club', {
      schedule: { kind: 'monthly', anchor: day('2026-01-05'), monthDays: [5] },
      ending: { onDate: day('2026-12-05'), afterCount: null },
    }),
  ],
  state: 'finished',
  stateOn: day('2026-11-13'),
  stateMoney: { kind: 'free', toId: null, cents: 5_000, moveId: 'm1' },
  links: [{ changeId: 'c', itemId: 'i' }],
  goalId: 'goal-1',
  isYearly: false,
  fromId: null,
};

const entry = (costId: string, amountCents: number) => ({
  moveId: `p-${costId}`,
  costId,
  dueOn: day('2026-11-10'),
  amountCents,
  paidOn: day('2026-11-10'),
  fromFreeCents: 0,
  mark: 'item' as const,
  purchaseId: null,
  fromGoalCents: 0,
  goalId: null,
});

const next = getNextYearHorizon(
  horizon,
  [entry('hotel', 12_345), entry('club', 3_000), entry('goal-goal-1', 41_000)],
  'this-id',
);

assert.deepEqual(
  [next.name, next.emoji, next.priority, next.orderIndex, next.note],
  ['Guys trip', '✈️', 'should', 3, 'Bring cash'],
  'what the event is carries over',
);
assert.equal(next.goalId, 'goal-1', 'the linked goal carries over');
assert.equal(next.isYearly, true, 'next year comes back too');
assert.equal(next.fromId, 'this-id', 'it names the year before');
assert.equal(next.happensOn, day('2025-02-28'), 'Feb 29 lands on Feb 28');
assert.equal(next.happensUntil, day('2027-11-18'), 'the end moves a year');
assert.deepEqual(
  next.rest,
  { kind: 'pays', startsOn: day('2027-01-01') },
  'saving from moves a year',
);
assert.deepEqual(
  [next.state, next.stateOn, next.stateMoney, next.links],
  ['open', null, null, []],
  'it starts open with no history',
);
assert.deepEqual(
  next.costs.map((kept) => kept.name),
  ['hotel', 'flight', 'goal-goal-1', 'club'],
  'a cost that became a bill or was removed is left out',
);
assert.equal(
  new Set([...next.costs.map((kept) => kept.id), 'hotel', 'flight', 'club'])
    .size,
  7,
  'every kept cost gets a new id',
);
const [hotel, flight, goalCost, club] = next.costs;
assert.equal(goalCost.id, 'goal-goal-1', 'the goal cost keeps its id');
assert.deepEqual(
  goalCost.amount,
  { lowCents: 50_000, highCents: 50_000 },
  'the goal cost keeps its planned amount, not what was paid',
);
assert.deepEqual(
  hotel.amount,
  { lowCents: 12_345, highCents: 12_345 },
  'a paid one-time cost plans what it came to',
);
assert.deepEqual(
  flight.amount,
  { lowCents: 1, highCents: 99 },
  'an unpaid cost keeps its range',
);
assert.deepEqual(
  club.amount,
  { lowCents: 10_000, highCents: 20_000 },
  'a repeating cost keeps its range even when payments were marked',
);
assert.equal(hotel.schedule.anchor, day('2027-11-10'), 'the anchor moves');
assert.equal(club.ending.onDate, day('2027-12-05'), 'the end date moves');
assert.equal(hotel.pricedOn, null, 'pricing starts again');
assert.equal(
  next.costs.every(
    (kept) => kept.becameBillId === null && kept.endsAfter === null,
  ),
  true,
  'no cost carries the ending it had',
);

assert.deepEqual(
  getNextYearHorizon(
    { ...horizon, rest: { kind: 'onePay', dayKey: 'x' } },
    [],
    't',
  ).rest,
  { kind: 'pays', startsOn: null },
  'a picked pay that will not exist becomes the pays',
);
assert.deepEqual(
  getNextYearHorizon({ ...horizon, rest: { kind: 'later' } }, [], 't').rest,
  { kind: 'later' },
  'other answers carry over',
);
assert.equal(
  horizon.costs[0].id,
  'hotel',
  'the event it came from is untouched',
);

assert.equal(
  describeChange(
    { ...horizon, rest: { kind: 'pays', startsOn: null } },
    { ...horizon, rest: { kind: 'pays', startsOn: day('2040-01-01') } },
    () => '',
  ),
  'The rest my pays before each cost to my pays from Jan\u00A01st,\u00A02040',
  'a change of only the saving start names the day it starts',
);

console.log('runway horizon next year: ok');
