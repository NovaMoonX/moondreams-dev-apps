import assert from 'node:assert/strict';

import {
  HELD_WRITE_SETTLED_MS,
  addHeldWrites,
  applyHeldWrites,
  dropHeldWrites,
  patchHeldWrite,
  settleHeldWrites,
  toFingerprint,
  toHeldWrite,
  type HeldWrite,
} from '../../src/utils/heldWrites.ts';

interface Row {
  id: string;
  cents: number;
  meta?: { a: number; b: number };
}

const idOf = (row: Row) => row.id;
const hold = (
  item: Row | null,
  id: string,
  token = 't1',
  settledAt: number | null = null,
  fields: string[] = item === null ? [] : Object.keys(item),
): HeldWrite<Row> => ({ ...toHeldWrite(id, item, fields, token), settledAt });
const apply = (
  incoming: Row[],
  held: HeldWrite<Row>[],
  now = 1_000,
  deliveredAt: number | null = null,
) => applyHeldWrites(incoming, held, idOf, { now, deliveredAt });

assert.equal(
  toFingerprint({ b: 1, a: { d: 2, c: 3 } }),
  toFingerprint({ a: { c: 3, d: 2 }, b: 1 }),
  'key order never changes a fingerprint',
);
assert.equal(
  toFingerprint({ a: 1, b: undefined }),
  toFingerprint({ a: 1 }),
  'an undefined field is the same as a missing one',
);

const base: Row[] = [{ id: 'a', cents: 1 }];

const added = apply(base, [hold({ id: 'b', cents: 5 }, 'b')]);
assert.deepEqual(
  added.list.map(idOf),
  ['a', 'b'],
  'a new record shows at once',
);
assert.equal(added.held.length, 1, 'and stays held until the list shows it');

const replaced = apply(base, [hold({ id: 'a', cents: 9 }, 'a')]);
assert.equal(replaced.list[0].cents, 9, 'a changed record shows its new value');

const removed = apply(base, [hold(null, 'a')]);
assert.deepEqual(removed.list, [], 'a removal hides the record at once');
assert.deepEqual(
  apply([], [hold(null, 'a')]).held,
  [],
  'and lets go once the list no longer has it',
);

const stalled = apply(base, [hold({ id: 'a', cents: 9 }, 'a', 't1', 900)]);
assert.equal(
  stalled.list[0].cents,
  9,
  'a settled write over a listener that has sent nothing new never flashes the old value back',
);

const rewritten = apply(
  [{ id: 'a', cents: 9, meta: { a: 1, b: 2 } }],
  [hold({ id: 'a', cents: 9 }, 'a', 't1', 900)],
);
assert.equal(
  rewritten.held.length,
  0,
  'once the server accepted it, a new copy of the record lets go even when the server added to it',
);

const created = apply(
  [...base, { id: 'b', cents: 5, meta: { a: 1, b: 2 } }],
  [hold({ id: 'b', cents: 5 }, 'b', 't1', 900)],
);
assert.equal(
  created.held.length,
  0,
  'a settled new record lets go once the list has any copy',
);

const inFlight = apply(base, [hold({ id: 'a', cents: 9 }, 'a')]);
assert.equal(
  inFlight.list[0].cents,
  9,
  'while in flight, an older copy in the list never flashes back',
);

const landed = apply(
  [{ id: 'a', cents: 9 }],
  [hold({ id: 'a', cents: 9 }, 'a')],
);
assert.equal(
  landed.held.length,
  0,
  'a list that shows the write lets go at once',
);

const quiet = apply(
  base,
  [hold({ id: 'b', cents: 5 }, 'b', 't1', 0)],
  HELD_WRITE_SETTLED_MS + 1,
  null,
);
assert.equal(
  quiet.held.length,
  1,
  'a stalled listener never lets a hold expire',
);

const missing = apply(
  base,
  [hold({ id: 'b', cents: 5 }, 'b', 't1', 0)],
  HELD_WRITE_SETTLED_MS + 1,
  10,
);
assert.equal(
  missing.held.length,
  0,
  'a settled hold the list never shows, though it was delivered since, lets go after its time',
);
assert.deepEqual(missing.list.map(idOf), ['a']);

const twice = addHeldWrites(
  [hold({ id: 'a', cents: 2 }, 'a', 't1')],
  [hold({ id: 'a', cents: 3 }, 'a', 't2')],
);
assert.deepEqual(
  twice.map((entry) => entry.token),
  ['t2'],
  'a newer write of the same fields takes them over from the older hold',
);
assert.equal(
  settleHeldWrites(twice, 't1', 50)[0].settledAt,
  null,
  'an older write settling never settles the newer one',
);
assert.equal(settleHeldWrites(twice, 't2', 50)[0].settledAt, 50);
assert.deepEqual(dropHeldWrites(twice, 't2'), [], 'a failed write drops');
assert.deepEqual(
  addHeldWrites(twice, [hold({ id: 'a', cents: 4 }, 'a', 't2')]).map(
    (entry) => entry.token,
  ),
  ['t2'],
  "a write's retry replaces its own hold",
);

const undone = addHeldWrites(
  [hold({ id: 'a', cents: 9 }, 'a', 't1', null, ['cents'])],
  [hold({ id: 'a', cents: 1 }, 'a', 't2', null, ['cents'])],
);
assert.deepEqual(
  apply([{ id: 'a', cents: 1 }], undone).list[0].cents,
  1,
  'an Undo that puts a field back never leaves the older value showing',
);
assert.deepEqual(
  apply(
    [],
    addHeldWrites(
      [hold({ id: 'a', cents: 9 }, 'a', 't1')],
      [hold(null, 'a', 't2')],
    ),
  ).list,
  [],
  'a create taken back before the list shows it stays gone',
);

const trimmed = addHeldWrites(
  [
    hold({ id: 'a', cents: 9, meta: { a: 2, b: 2 } }, 'a', 't1', null, [
      'cents',
      'meta',
    ]),
  ],
  [
    hold({ id: 'a', cents: 1, meta: { a: 2, b: 2 } }, 'a', 't2', null, [
      'cents',
    ]),
  ],
);
assert.deepEqual(
  trimmed[0].fields,
  ['meta'],
  'an older hold keeps only the fields it alone wrote',
);
assert.equal(
  trimmed[0].item?.cents,
  1,
  'and its item carries the newer value of a field taken over, so a list filtering on it reads it right',
);

const overlapping = [
  hold({ id: 'a', cents: 9, meta: { a: 1, b: 1 } }, 'a', 't1', null, ['cents']),
  hold({ id: 'a', cents: 1, meta: { a: 5, b: 5 } }, 'a', 't2', null, ['meta']),
];
const bothShow = apply(
  [{ id: 'a', cents: 1, meta: { a: 1, b: 1 } }],
  addHeldWrites([overlapping[0]], [overlapping[1]]),
);
assert.deepEqual(
  bothShow.list[0],
  { id: 'a', cents: 9, meta: { a: 5, b: 5 } },
  'two writes in flight on one record both show',
);
const firstLanded = apply(
  [{ id: 'a', cents: 9, meta: { a: 1, b: 1 } }],
  overlapping,
);
assert.deepEqual(
  firstLanded.held.map((entry) => entry.token),
  ['t2'],
  'the first lets go once its field shows, the second still waits',
);
assert.deepEqual(firstLanded.list[0].meta, { a: 5, b: 5 });
assert.deepEqual(
  apply([{ id: 'a', cents: 1, meta: { a: 1, b: 1 } }], [overlapping[0]]).list[0]
    .meta,
  { a: 1, b: 1 },
  'and when the second fails, the first still shows',
);
assert.deepEqual(
  apply([{ id: 'a', cents: 1 }], [overlapping[0], hold(null, 'a', 't2')]).list,
  [],
  'a newer removal hides the record',
);

const partial = () =>
  hold({ id: 'a', cents: 9, meta: { a: 1, b: 2 } }, 'a', 't1', 900, ['cents']);
const otherField = apply(
  [{ id: 'a', cents: 9, meta: { a: 3, b: 4 } }],
  [partial()],
);
assert.equal(
  otherField.held.length,
  0,
  "a copy with the write and another device's change to another field lets go",
);
assert.deepEqual(otherField.list[0].meta, { a: 3, b: 4 });
const otherOnly = apply(
  [{ id: 'a', cents: 1, meta: { a: 3, b: 4 } }],
  [partial()],
);
assert.equal(
  otherOnly.list[0].cents,
  9,
  "another device's change that lacks the write never releases it",
);

const patched = patchHeldWrite(
  [hold({ id: 'a', cents: 9 }, 'a'), hold(null, 'b')],
  'a',
  { cents: 12 },
);
assert.equal(
  patched[0].item?.cents,
  12,
  'a plain write shows through the hold',
);
assert.deepEqual(
  apply([{ id: 'a', cents: 9 }], patched).held.map((entry) => entry.id),
  ['a'],
  'and the hold waits for the patched copy',
);
assert.equal(
  apply([{ id: 'a', cents: 12 }], patched.slice(0, 1)).held.length,
  0,
);
assert.equal(patched[1].item, null, 'a removal is never patched');

const patchedOutside = patchHeldWrite([partial()], 'a', {
  meta: { a: 5, b: 5 },
});
assert.deepEqual(
  patchedOutside[0].fields,
  ['cents'],
  'a plain write never adds to the fields a hold waits for',
);
assert.equal(
  apply([{ id: 'a', cents: 9, meta: { a: 7, b: 7 } }], patchedOutside).held
    .length,
  0,
  "so another device's change to that field never keeps it held",
);

const showsThrough = apply(
  [{ id: 'a', cents: 1, meta: { a: 8, b: 8 } }],
  [partial()],
);
assert.deepEqual(
  showsThrough.list[0],
  { id: 'a', cents: 9, meta: { a: 8, b: 8 } },
  'a hold shows only the fields it wrote, so a later write to another field shows through',
);

console.log('held writes: all checks passed');
