import assert from 'node:assert/strict';

import { toHeldWrite } from '../../src/utils/heldWrites.ts';
import { layPurchaseLists } from '../../src/apps/runway/utils/purchaseHolds.ts';
import type { OpenPurchase } from '../../src/apps/runway/types.ts';

const DAY = 86_400_000;
const FROM = 100 * DAY;

const purchase = (
  id: string,
  date: number,
  needsHome: boolean,
  amountCents = 500,
): OpenPurchase => ({ id, date, needsHome, amountCents }) as OpenPurchase;

const lay = (
  held: ReturnType<typeof toHeldWrite<OpenPurchase>>[],
  lists: {
    window?: OpenPurchase[];
    needsHome?: OpenPurchase[];
    period?: OpenPurchase[];
  },
  periodFor: string | null = null,
) =>
  layPurchaseLists({
    window: lists.window ?? [],
    needsHome: lists.needsHome ?? [],
    period: lists.period ?? [],
    deliveredAt: { window: 1, needsHome: 1, period: 1 },
    purchasesFrom: FROM,
    periodFor,
    held,
    landed: {},
  });

const ids = (list: OpenPurchase[]) => list.map((item) => item.id);

const before = purchase('a', FROM + DAY, true);
const assigned = { ...before, needsHome: false, amountCents: 900 };
const assign = toHeldWrite('a', assigned, ['needsHome', 'amountCents'], 't');

const assignedResult = lay([assign], { window: [before], needsHome: [before] });
assert.deepEqual(ids(assignedResult.needsHome), []);
assert.equal(assignedResult.purchases[0].amountCents, 900);
assert.equal(assignedResult.held.length, 1);

const old = purchase('o', FROM - DAY, false);
const oldResult = lay([toHeldWrite('o', old, ['amountCents'], 't')], {});
assert.deepEqual(ids(oldResult.purchases), []);
assert.deepEqual(oldResult.held, []);

const inRange = purchase('p', FROM + DAY, false);
const closed = lay([toHeldWrite('p', inRange, ['amountCents'], 't')], {
  window: [],
  period: [],
});
assert.deepEqual(ids(closed.periodPurchases), []);
assert.deepEqual(ids(closed.purchases), ['p']);
const open = lay(
  [toHeldWrite('p', inRange, ['amountCents'], 't')],
  {},
  `${FROM}:${FROM + 10 * DAY}`,
);
assert.deepEqual(ids(open.periodPurchases), ['p']);

const landedItem = purchase('l', FROM + DAY, false, 700);
const landed = lay([toHeldWrite('l', landedItem, ['amountCents'], 't')], {
  window: [{ ...landedItem, date: FROM + 2 * DAY }],
});
assert.deepEqual(landed.held, []);

const removal = lay(
  [toHeldWrite<OpenPurchase>('a', null, [], 't')],
  {
    window: [before],
    needsHome: [before],
    period: [before],
  },
  `${FROM}:${FROM + 10 * DAY}`,
);
assert.deepEqual(ids(removal.purchases), []);
assert.deepEqual(ids(removal.needsHome), []);
assert.deepEqual(ids(removal.periodPurchases), []);
assert.equal(removal.held.length, 1);

const shown = purchase('s', FROM + DAY, false, 900);
const edit = toHeldWrite('s', shown, ['amountCents'], 't');
const range = `${FROM}:${FROM + 30 * DAY}`;
const first = layPurchaseLists({
  window: [shown],
  needsHome: [],
  period: [purchase('s', FROM + DAY, false, 500)],
  deliveredAt: { window: 1, needsHome: 1, period: null },
  purchasesFrom: FROM,
  periodFor: range,
  held: [edit],
  landed: {},
});
assert.equal(first.held.length, 1, 'a list still waiting keeps the hold');
assert.deepEqual(first.landed, { 's/t': ['window', 'needsHome'] });
const otherDevice = purchase('s', FROM + DAY, false, 1200);
const second = layPurchaseLists({
  window: [otherDevice],
  needsHome: [],
  period: [purchase('s', FROM + DAY, false, 500)],
  deliveredAt: { window: 2, needsHome: 1, period: null },
  purchasesFrom: FROM,
  periodFor: range,
  held: first.held,
  landed: first.landed,
});
assert.equal(
  second.purchases[0].amountCents,
  1200,
  "a hold never comes back over a list it landed in, so another device's later change shows",
);
assert.equal(second.periodPurchases[0].amountCents, 900);
const failed = layPurchaseLists({
  window: [otherDevice],
  needsHome: [],
  period: [],
  deliveredAt: { window: 2, needsHome: 1, period: null },
  purchasesFrom: FROM,
  periodFor: null,
  held: second.held,
  landed: second.landed,
});
assert.deepEqual(failed.held, [], 'a period list that is gone lets go of it');
assert.deepEqual(failed.landed, {});

console.log('runway purchase holds: ok');
