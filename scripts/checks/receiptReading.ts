import assert from 'node:assert/strict';

import { normalizeReceiptReading } from '../../src/lib/receipts/normalizeReceiptReading.ts';
import { MAX_RECEIPT_LINES, MAX_RECEIPT_NAME_LENGTH } from '../../src/lib/receipts/receiptTypes.ts';

const full = normalizeReceiptReading({
  merchant: 'Ichiran Seattle',
  kind: 'RESTAURANT',
  address: '1 Main St, Seattle, WA',
  date: '2026-10-24',
  time: '19:45',
  currency: 'usd',
  lines: [
    { name: 'Ramen', quantity: 2, unitPriceCents: 1450, priceCents: 2900 },
    { name: 'Gyoza', quantity: null, unitPriceCents: null, priceCents: 850.4 },
    { name: 'Mystery', quantity: 1, unitPriceCents: null, priceCents: null },
    { name: 'Refund', quantity: 1, unitPriceCents: null, priceCents: -300 },
    { name: '', quantity: 1, unitPriceCents: null, priceCents: 100 },
  ],
  subtotalCents: 3750,
  taxCents: 356,
  feesCents: null,
  discountCents: -5,
  tipCents: null,
  suggestedTips: [
    { percent: 18, tipCents: 675, totalCents: 4781 },
    { percent: 0, tipCents: 0, totalCents: 4106 },
    { percent: 250, tipCents: 1, totalCents: 1 },
    { percent: 20, tipCents: null, totalCents: null },
  ],
  totalCents: 4106,
});
assert.equal(full.merchant, 'Ichiran Seattle');
assert.equal(full.kind, 'RESTAURANT');
assert.equal(full.address, '1 Main St, Seattle, WA');
assert.equal(full.time, '19:45');
assert.equal(full.currency, 'USD');
assert.deepEqual(full.lines.map((line) => [line.name, line.quantity, line.priceCents]), [['Ramen', 2, 2900], ['Gyoza', 1, 850]]);
assert.equal(full.lines[0].unitPriceCents, 1450);
assert.equal(full.unpricedLineCount, 3);
assert.equal(full.discountCents, null);
assert.equal(full.tipCents, null);
assert.deepEqual(full.suggestedTips.map((tip) => tip.percent), [18, 20]);

// What isn't stated, or is malformed, reads as unstated
const empty = normalizeReceiptReading({ kind: 'SPACESHIP', date: '24/10/2026', time: '7pm', currency: 'dollars', lines: 'none' });
assert.deepEqual([empty.kind, empty.date, empty.time, empty.currency, empty.lines.length], [null, null, null, null, 0]);
assert.deepEqual(empty.suggestedTips, []);

// Caps hold, and a long name is cut at a word
const long = normalizeReceiptReading({
  merchant: 'The Extremely Long Restaurant Name That Keeps Going And Going Past Any Sensible Limit',
  lines: Array.from({ length: MAX_RECEIPT_LINES + 5 }, (_, i) => ({ name: `Item ${i}`, quantity: 1, unitPriceCents: null, priceCents: 100 })),
});
assert.equal(long.lines.length, MAX_RECEIPT_LINES);
assert.equal(long.unpricedLineCount, 5);
assert.ok((long.merchant ?? '').length <= MAX_RECEIPT_NAME_LENGTH);
assert.ok(!(long.merchant ?? '').endsWith('Limi'));

console.log('receiptReading checks passed');
