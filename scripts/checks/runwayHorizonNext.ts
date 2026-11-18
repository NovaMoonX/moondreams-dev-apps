import assert from 'node:assert/strict';

import {
  findNextOf,
  getNextHorizon,
  listEarlierEvents,
} from '../../src/apps/runway/engine/horizon.ts';
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
  happensOn: day('2026-11-16'),
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

const plan = { happensOn: day('2027-11-12'), startsOn: day('2027-01-01') };
const next = getNextHorizon(
  horizon,
  [entry('hotel', 12_345), entry('club', 3_000), entry('goal-goal-1', 41_000)],
  'this-id',
  plan,
);

assert.deepEqual(
  [next.name, next.emoji, next.priority, next.orderIndex, next.note],
  ['Guys trip', '✈️', 'should', 3, 'Bring cash'],
  'what the event is carries over',
);
assert.equal(next.goalId, 'goal-1', 'the linked goal carries over');
assert.equal(next.fromId, 'this-id', 'it names the event it came from');
assert.equal(next.happensOn, day('2027-11-12'), 'it happens when asked');
assert.equal(
  next.happensUntil,
  day('2027-11-14'),
  'the end moves by the same days',
);
assert.deepEqual(
  next.rest,
  { kind: 'pays', startsOn: day('2027-01-01') },
  'saving starts when asked',
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
assert.equal(
  hotel.schedule.anchor,
  day('2027-11-06'),
  'the anchor moves by the same gap',
);
assert.equal(club.ending.onDate, day('2027-12-01'), 'the end date moves too');
assert.equal(hotel.pricedOn, null, 'pricing starts again');
assert.equal(
  next.costs.every(
    (kept) => kept.becameBillId === null && kept.endsAfter === null,
  ),
  true,
  'no cost carries the ending it had',
);

assert.deepEqual(
  getNextHorizon(
    { ...horizon, rest: { kind: 'onePay', dayKey: 'x' } },
    [],
    't',
    { happensOn: day('2027-11-12'), startsOn: null },
  ).rest,
  { kind: 'pays', startsOn: null },
  'a picked pay that will not exist becomes the pays',
);
assert.deepEqual(
  getNextHorizon({ ...horizon, rest: { kind: 'later' } }, [], 't', plan).rest,
  { kind: 'later' },
  'other answers carry over',
);
const edited = getNextHorizon(horizon, [entry('hotel', 12_345)], 't', {
  ...plan,
  amounts: { hotel: { lowCents: 700, highCents: 900 } },
});
assert.deepEqual(
  edited.costs[0].amount,
  { lowCents: 700, highCents: 900 },
  'an amount the person changed replaces the paid one',
);
assert.deepEqual(
  edited.costs[1].amount,
  { lowCents: 1, highCents: 99 },
  'the others keep theirs',
);
assert.equal(
  horizon.costs[0].id,
  'hotel',
  'the event it came from is untouched',
);

const clamped = getNextHorizon(horizon, [], 't', {
  happensOn: day('2026-11-20'),
  startsOn: null,
  today: day('2026-11-19'),
});
assert.equal(
  clamped.costs[0].schedule.anchor,
  day('2026-11-19'),
  'a copied date that would fall before today lands on today',
);
assert.equal(
  clamped.costs[3].schedule.anchor,
  day('2026-12-05'),
  'a monthly cost whose shifted start is past lands on its next repeat day on or after today',
);
assert.equal(
  clamped.happensUntil,
  day('2026-11-22'),
  'the end of the event still moves by the gap',
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

const version = (
  itemId: string,
  fromId: string | null,
  name: string,
  happensOn: string,
  createdAt = 1,
) => ({
  itemId,
  id: `${itemId}-v${createdAt}`,
  kind: 'horizon',
  createdAt,
  payload: { ...horizon, name, fromId, happensOn: day(happensOn) },
});
const versions = [
  version('a', null, 'Trip 2025', '2025-11-12'),
  version('b', 'a', 'Trip 2026', '2026-11-12'),
  version('c', 'b', 'Trip 2027', '2027-11-12'),
  version('c', 'b', 'Trip 2027 renamed', '2027-11-12', 2),
];
assert.deepEqual(
  listEarlierEvents('c', versions).map(({ itemId }) => itemId),
  ['b', 'a'],
  'the chain reads back nearest first',
);
assert.deepEqual(
  listEarlierEvents('a', versions),
  [],
  'a first event has none',
);
const live = [
  { id: 'a', archivedAt: null, endedAt: null },
  { id: 'b', archivedAt: null, endedAt: null },
  { id: 'c', archivedAt: null, endedAt: null },
];
assert.equal(
  findNextOf('b', null, live, versions, [])?.itemId,
  'c',
  'the next one is the event planned from it',
);
assert.equal(
  findNextOf('b', null, live, versions, [])?.isUntouched,
  false,
  'a renamed next one is touched',
);
assert.equal(
  findNextOf('c', null, live, versions, []),
  null,
  'the last one has no next',
);
assert.equal(
  findNextOf(
    'b',
    null,
    live.map((item) => ({ ...item, archivedAt: item.id === 'c' ? 1 : null })),
    versions,
    [],
  ),
  null,
  'an archived next one is not one',
);

console.log('runway horizon next: ok');
