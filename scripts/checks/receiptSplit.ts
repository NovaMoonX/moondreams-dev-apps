import assert from 'node:assert/strict';

import {
  allocateByWeight,
  itemizeLine,
  getReceiptTotalCents,
  getTipFromPercent,
  splitReceipt,
  type ReceiptLine,
} from '../../src/apps/waypoint/utils/receiptSplit.ts';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

// Whole cents add back up, whatever the weights
assert.deepEqual(allocateByWeight(100, [['a', 1], ['b', 1], ['c', 1]]), { a: 34, b: 33, c: 33 });
assert.deepEqual(allocateByWeight(-100, [['a', 1], ['b', 1], ['c', 1]]), { a: -34, b: -33, c: -33 });
assert.deepEqual(allocateByWeight(10, [['a', 0], ['b', 0]]), { a: 5, b: 5 });
assert.deepEqual(allocateByWeight(0, [['a', 3]]), { a: 0 });
assert.deepEqual(allocateByWeight(5, []), {});

// A dinner for three: one shared starter, tax in proportion, tip evenly
const lines: ReceiptLine[] = [
  { id: 'nachos', name: 'Nachos', priceCents: 1200 },
  { id: 'burger', name: 'Burger', priceCents: 1800 },
  { id: 'salad', name: 'Salad', priceCents: 1100 },
  { id: 'steak', name: 'Steak', priceCents: 3400 },
];
const people = ['ana', 'ben', 'cy'];
const claims = { nachos: ['ana', 'ben', 'cy'], burger: ['ana'], salad: ['ben'], steak: ['cy'] };
const base = { lines, claims, people, taxCents: 631, feesCents: 0, discountCents: 0, tipCents: 1500 };

const even = splitReceipt({ ...base, tipSplit: 'EVEN' });
assert.equal(even.unclaimedLineIds.length, 0);
assert.equal(even.totalCents, 7500 + 631 + 1500);
assert.equal(sum(Object.values(even.totals).map((t) => t.totalCents)), even.totalCents);
assert.equal(even.totals.ana.itemsCents, 400 + 1800);
assert.equal(even.totals.ana.tipCents, 500);

const proportional = splitReceipt({ ...base, tipSplit: 'PROPORTIONAL' });
assert.equal(sum(Object.values(proportional.totals).map((t) => t.totalCents)), proportional.totalCents);
assert.ok(proportional.totals.cy.tipCents > proportional.totals.ben.tipCents);

// A discount and fees ride along in proportion
const charged = splitReceipt({ ...base, feesCents: 250, discountCents: 700, tipSplit: 'PROPORTIONAL' });
assert.equal(charged.totalCents, getReceiptTotalCents(lines, { taxCents: 631, feesCents: 250, discountCents: 700, tipCents: 1500 }));
assert.equal(sum(Object.values(charged.totals).map((t) => t.totalCents)), charged.totalCents);
assert.ok(Object.values(charged.totals).every((t) => t.discountCents < 0));

// A line nobody has is reported, and a person with nothing isn't charged tax
const partial = splitReceipt({ ...base, claims: { burger: ['ana'] }, tipSplit: 'EVEN' });
assert.deepEqual(partial.unclaimedLineIds, ['nachos', 'salad', 'steak']);
assert.deepEqual(partial.participants, ['ana']);
assert.equal(partial.totals.ana.taxCents, 631);

// A claim by someone who isn't in the split is ignored
const stranger = splitReceipt({ ...base, claims: { ...claims, burger: ['zed'] }, tipSplit: 'EVEN' });
assert.deepEqual(stranger.unclaimedLineIds, ['burger']);

// Tips come from what was ordered, after the discount, before tax
assert.equal(getTipFromPercent(lines, 0, 20), 1500);
assert.equal(getTipFromPercent(lines, 500, 20), 1400);
assert.equal(getTipFromPercent(lines, 99999, 20), 0);

// A quantity is one entry per unit, the price shared to the cent
assert.deepEqual(itemizeLine('Ramen', 2, 1890), [{ name: 'Ramen (1 of 2)', priceCents: 945 }, { name: 'Ramen (2 of 2)', priceCents: 945 }]);
assert.deepEqual(itemizeLine('Beer', 3, 1000).map((unit) => unit.priceCents), [334, 333, 333]);
assert.deepEqual(itemizeLine('Gyoza', 1, 850), [{ name: 'Gyoza', priceCents: 850 }]);
assert.deepEqual(itemizeLine('Ramen', 0.5, 400), [{ name: '0.5× Ramen', priceCents: 400 }]);
assert.deepEqual(itemizeLine('Shots', 13, 1300), [{ name: '13× Shots', priceCents: 1300 }]);
assert.equal(sum(itemizeLine('Wings', 7, 4999).map((unit) => unit.priceCents)), 4999);

// Random bills always add up to the cent
const random = (n: number) => Math.floor(Math.random() * n);
Array.from({ length: 500 }).forEach(() => {
  const crowd = Array.from({ length: 1 + random(8) }, (_, i) => `p${i}`);
  const randomLines: ReceiptLine[] = Array.from({ length: 1 + random(12) }, (_, i) => ({
    id: `l${i}`,
    name: `Item ${i}`,
    priceCents: random(9000),
  }));
  const randomClaims = Object.fromEntries(
    randomLines.map((line) => [line.id, crowd.filter(() => random(3) === 0)]),
  );
  const result = splitReceipt({
    lines: randomLines,
    claims: randomClaims,
    people: crowd,
    taxCents: random(2000),
    feesCents: random(500),
    discountCents: random(300),
    tipCents: random(3000),
    tipSplit: random(2) ? 'EVEN' : 'PROPORTIONAL',
  });
  const allClaimed = result.unclaimedLineIds.length === 0;
  const owed = sum(Object.values(result.totals).map((t) => t.totalCents));
  const unclaimedCents = sum(randomLines.filter((l) => result.unclaimedLineIds.includes(l.id)).map((l) => l.priceCents));
  assert.equal(owed, result.totalCents - unclaimedCents, allClaimed ? 'claimed bill adds up' : 'unclaimed lines are left out');
});

console.log('receiptSplit checks passed');
