import assert from 'node:assert/strict';

import {
  hasLaterHistory,
  isReachedAtOnce,
  toEnvelopePayload,
  toGoalPayload,
} from '../../src/apps/runway/engine/convertItem.ts';
import type {
  EnvelopeSealed,
  GoalSealed,
} from '../../src/apps/runway/types.ts';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

const envelope: EnvelopeSealed = {
  name: 'Pet fund',
  emoji: '🐱',
  priority: 'should',
  orderIndex: 4,
  funding: {
    amount: { kind: 'exact', cents: 5_000 },
    cadence: { kind: 'everyIncomeDay' },
  },
  maxCents: 50_000,
  groupId: 'g1',
  spillTo: ['e2'],
  startingCents: 1_000,
  extras: [{ tier: 'want', cents: 2_000, orderIndex: 1 }],
};

const goal = toGoalPayload(envelope, {
  targetCents: 80_000,
  targetDate: day('2027-03-01'),
});
assert.equal(goal.targetCents, 80_000, 'the goal takes the target asked');
assert.equal(
  goal.targetDate,
  day('2027-03-01'),
  'the goal takes the date asked',
);
assert.equal(goal.state, 'active', 'a new goal is saved for');
assert.equal(goal.startingCents, null, 'the money arrives by the move');
assert.deepEqual(goal.funding, envelope.funding, 'funding carries over');
assert.deepEqual(goal.extras, envelope.extras, 'extras carry over');
assert.equal(goal.groupId, 'g1', 'the group carries over');
assert.equal(goal.orderIndex, 4, 'the place in the tier carries over');
assert.ok(!('maxCents' in goal), 'the limit does not carry over');
assert.ok(!('spillTo' in goal), 'the overflow does not carry over');

const back = toEnvelopePayload(goal);
assert.equal(back.maxCents, null, 'an envelope made from a goal has no limit');
assert.deepEqual(
  back.spillTo,
  [],
  'an envelope made from a goal has no overflow',
);
assert.equal(back.startingCents, null, 'the money arrives by the move');
assert.deepEqual(back.funding, envelope.funding, 'funding carries back');
assert.deepEqual(back.extras, envelope.extras, 'extras carry back');
assert.ok(!('targetCents' in back), 'the target does not carry over');

const paused: GoalSealed = { ...goal, state: 'paused' };
const idle = toEnvelopePayload(paused);
assert.equal(
  idle.funding.cadence.kind,
  'none',
  'a paused goal becomes an envelope nothing goes in for',
);
assert.deepEqual(
  idle.funding.amount,
  { kind: 'exact', cents: 0 },
  'an idle envelope asks for nothing',
);
assert.equal(idle.extras, null, 'an idle envelope has no extras');

const noExtras = toGoalPayload(
  { ...envelope, extras: undefined },
  { targetCents: 100, targetDate: null },
);
assert.equal(noExtras.extras, null, 'a missing extras reads as none');

assert.ok(isReachedAtOnce(10_000, 10_000), 'a target held exactly is reached');
assert.ok(isReachedAtOnce(10_000, 12_000), 'a target held and more is reached');
assert.ok(
  !isReachedAtOnce(10_000, 9_999),
  'a target above what is held is not',
);
assert.ok(!isReachedAtOnce(0, 0), 'no target is never reached');

const own = {
  newItemId: 'new',
  ownMoveId: 'm1',
  ownChangeId: 'c1',
  versions: [{ itemId: 'new' }, { itemId: 'old' }, { itemId: 'old' }],
  moves: [],
  purchases: [],
  changes: [{ id: 'c1', itemIds: ['old', 'new'] }],
};
assert.ok(
  !hasLaterHistory(own),
  'a conversion with only its own entries has none',
);
assert.ok(
  hasLaterHistory({ ...own, versions: [...own.versions, { itemId: 'new' }] }),
  'a second version is its own history',
);
assert.ok(
  hasLaterHistory({
    ...own,
    changes: [...own.changes, { id: 'c2', itemIds: ['new'] }],
  }),
  'another change entry is its own history',
);
assert.ok(
  hasLaterHistory({
    ...own,
    purchases: [{ lines: [{ envelopeId: 'new', cents: 100, via: 'chosen' }] }],
  }),
  'a purchase against it is its own history',
);
assert.ok(
  hasLaterHistory({
    ...own,
    moves: [
      {
        id: 'm2',
        kind: 'transfer',
        date: day('2026-11-13'),
        refId: 'new',
        reversesMoveId: null,
        createdAt: 0,
        payload: {
          fromId: 'new',
          toId: null,
          cents: 100,
          note: null,
          isOutside: false,
        },
      },
    ],
  }),
  'a later move out of it is its own history',
);
assert.ok(
  !hasLaterHistory({
    ...own,
    moves: [
      {
        id: 'm1',
        kind: 'transfer',
        date: day('2026-11-13'),
        refId: 'old',
        reversesMoveId: null,
        createdAt: 0,
        payload: {
          fromId: 'old',
          toId: 'new',
          cents: 100,
          note: null,
          isOutside: false,
        },
      },
    ],
  }),
  "the conversion's own move is not later history",
);

console.log('runway convert item: ok');
