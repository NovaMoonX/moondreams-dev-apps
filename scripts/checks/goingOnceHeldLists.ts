import assert from 'node:assert/strict';

import {
  goingOnceReducer,
  setItems,
  setItemsError,
} from '../../src/apps/going-once/store/index.ts';
import { goingOnceHeldActions } from '../../src/apps/going-once/store/heldLists.ts';
import { readGoingOnceTarget } from '../../src/apps/going-once/utils/heldHolds.ts';
import type { Item } from '../../src/apps/going-once/types.ts';
import { buildHolds } from '../../src/lib/firebase/heldHolds.ts';

const itemPath = (saleId: string, id: string) => [
  'apps',
  'going-once',
  'sales',
  saleId,
  'items',
  id,
];

assert.deepEqual(readGoingOnceTarget(itemPath('s1', 'a'), 's1'), {
  kind: 'items',
  id: 'a',
});
assert.equal(
  readGoingOnceTarget(itemPath('s2', 'a'), 's1'),
  null,
  'another sale’s thing is never held',
);
assert.equal(
  readGoingOnceTarget(['apps', 'going-once', 'sales', 's1'], 's1'),
  null,
  'the sale itself is never held',
);
assert.equal(
  readGoingOnceTarget(
    ['apps', 'going-once', 'sales', 's1', 'inquiries', 'q'],
    's1',
  ),
  null,
  'inquiries are never held',
);
assert.equal(readGoingOnceTarget(itemPath('s1', 'a'), null), null);

const built = buildHolds(
  [
    {
      segments: itemPath('s1', 'a'),
      before: { id: 'a', status: 'AVAILABLE', lastEditedAt: 1 },
      after: { id: 'a', status: 'SOLD', lastEditedAt: 2 },
    },
    {
      segments: ['apps', 'going-once', 'sales', 's1'],
      before: null,
      after: { status: 'OPEN' },
    },
  ],
  (segments) => readGoingOnceTarget(segments, 's1'),
  't',
);
assert.deepEqual(
  built?.items?.map((hold) => hold.fields),
  [['status', 'lastEditedAt']],
  'only the thing’s changed fields are held, and the sale holds nothing',
);

const thing = { id: 'a', saleId: 's1', status: 'AVAILABLE' } as Item;
const sold = { ...thing, status: 'SOLD' } as Item;
const toHold = (token: string, status: string, fields: string[]) =>
  goingOnceHeldActions.hold({
    token,
    scope: 's1',
    writes: {
      items: [
        {
          id: 'a',
          item: { ...thing, status } as Item,
          fingerprint: JSON.stringify(
            Object.fromEntries(fields.map((field) => [field, status])),
          ),
          token,
          settledAt: null,
          fields,
        },
      ],
    },
  });
const holdSold = toHold('t', 'SOLD', ['status']);

const loading = goingOnceReducer(undefined, holdSold);
assert.deepEqual(loading.hold.held, [], 'a list still loading takes no hold');

const loaded = goingOnceReducer(
  undefined,
  setItems({ saleId: 's1', items: [thing] }),
);
const marked = goingOnceReducer(loaded, holdSold);
assert.equal(
  marked.items.items[0].status,
  'SOLD',
  'a status change shows at once',
);
assert.equal(
  goingOnceReducer(loaded, {
    ...holdSold,
    payload: { ...holdSold.payload, scope: 's2' },
  }).items.items[0].status,
  'AVAILABLE',
  'a hold for another sale is ignored',
);
const stale = goingOnceReducer(
  marked,
  setItems({ saleId: 's1', items: [thing] }),
);
assert.equal(
  stale.items.items[0].status,
  'SOLD',
  'a delivery that still has the old status never brings it back',
);
const landed = goingOnceReducer(
  goingOnceReducer(stale, goingOnceHeldActions.settle('t')),
  setItems({ saleId: 's1', items: [sold] }),
);
assert.deepEqual(
  landed.hold.held,
  [],
  'the hold lets go once the listener shows it',
);
assert.equal(
  goingOnceReducer(marked, goingOnceHeldActions.drop('t')).items.items[0]
    .status,
  'AVAILABLE',
  'a failed write puts the old status back',
);

const undone = goingOnceReducer(
  goingOnceReducer(marked, toHold('u', 'AVAILABLE', ['status'])),
  goingOnceHeldActions.settle('t'),
);
assert.equal(
  undone.items.items[0].status,
  'AVAILABLE',
  'an Undo that puts the status back shows over the older write',
);
assert.equal(
  goingOnceReducer(undone, goingOnceHeldActions.drop('u')).items.items[0]
    .status,
  'AVAILABLE',
  'and a failed Undo leaves the thing as the listener has it',
);

assert.deepEqual(
  goingOnceReducer(marked, setItems({ saleId: 's2', items: [] })).hold.held,
  [],
  'opening another sale resets the hold',
);
assert.deepEqual(
  goingOnceReducer(marked, setItemsError()).hold.held,
  [],
  'a failed list keeps no hold',
);

console.log('going once held lists: ok');
