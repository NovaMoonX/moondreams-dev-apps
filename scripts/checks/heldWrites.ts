import assert from 'node:assert/strict';

import {
  HELD_WRITE_SETTLED_MS,
  addHeldWrites,
  applyHeldWrites,
  dropHeldWrites,
  settleHeldWrites,
  toFingerprint,
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
): HeldWrite<Row> => ({
  id,
  item,
  fingerprint: item === null ? '' : toFingerprint(item),
  token,
  settledAt,
});
const apply = (incoming: Row[], held: HeldWrite<Row>[], now = 1_000) =>
  applyHeldWrites(incoming, held, idOf, toFingerprint, now);

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
assert.deepEqual(added.list.map(idOf), ['a', 'b'], 'a new record shows at once');
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

const stale = apply(base, [hold({ id: 'a', cents: 9 }, 'a', 't1', 900)]);
assert.equal(
  stale.held.length,
  0,
  'once the server accepted it, any copy of the record in the list lets go',
);

const inFlight = apply(base, [hold({ id: 'a', cents: 9 }, 'a')]);
assert.equal(
  inFlight.list[0].cents,
  9,
  'while in flight, an older copy in the list never flashes back',
);

const landed = apply([{ id: 'a', cents: 9 }], [hold({ id: 'a', cents: 9 }, 'a')]);
assert.equal(landed.held.length, 0, 'a list that shows the write lets go at once');

const missing = apply(base, [hold({ id: 'b', cents: 5 }, 'b', 't1', 0)], HELD_WRITE_SETTLED_MS + 1);
assert.equal(
  missing.held.length,
  0,
  'a settled hold the list never shows lets go after its time',
);
assert.deepEqual(missing.list.map(idOf), ['a']);

const twice = addHeldWrites(
  [hold({ id: 'a', cents: 2 }, 'a', 't1')],
  [hold({ id: 'a', cents: 3 }, 'a', 't2')],
);
assert.equal(twice.length, 1, 'the newest write of a record replaces the older hold');
assert.equal(twice[0].token, 't2');
assert.equal(
  settleHeldWrites(twice, 't1', 50)[0].settledAt,
  null,
  'an older write settling never settles the newer one',
);
assert.equal(settleHeldWrites(twice, 't2', 50)[0].settledAt, 50);
assert.deepEqual(dropHeldWrites(twice, 't1').length, 1, 'only the failed write drops');
assert.deepEqual(dropHeldWrites(twice, 't2'), []);

console.log('held writes: all checks passed');
