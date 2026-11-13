import assert from 'node:assert/strict';

import {
  buildFeeBill,
  getFeeStep,
  getNextFeeOn,
  isCardFeeBill,
} from '../../src/apps/runway/engine/cardFees.ts';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

assert.equal(
  getNextFeeOn(day('2026-03-01'), day('2026-11-11')),
  day('2027-03-01'),
  'a fee whose first date has passed comes next on the same day a year on',
);
assert.equal(
  getNextFeeOn(day('2026-11-11'), day('2026-11-11')),
  day('2026-11-11'),
  'a fee due today is next today',
);

const fee = { cents: 55_000, firstDueOn: day('2027-03-01'), billId: 'b1' };
const after = { cents: 55_000, firstDueOn: day('2027-03-01') };
const cases: [Parameters<typeof getFeeStep>[0], string, string][] = [
  [
    { before: null, after, isBillLive: false, isBillCurrent: false },
    'create',
    'a new fee adds its bill',
  ],
  [
    { before: fee, after, isBillLive: false, isBillCurrent: false },
    'create',
    'a fee whose bill has ended adds a new bill',
  ],
  [
    { before: fee, after, isBillLive: true, isBillCurrent: true },
    'none',
    'an unchanged fee writes nothing to its bill',
  ],
  [
    { before: fee, after, isBillLive: true, isBillCurrent: false },
    'change',
    'a changed fee, date or card name changes its bill',
  ],
  [
    { before: fee, after: null, isBillLive: true, isBillCurrent: false },
    'end',
    'a cleared fee or an archived card ends its bill',
  ],
  [
    { before: fee, after: null, isBillLive: false, isBillCurrent: false },
    'none',
    'clearing a fee whose bill already ended writes nothing',
  ],
];
cases.forEach(([input, expected, message]) =>
  assert.equal(getFeeStep(input), expected, message),
);

const bill = buildFeeBill({
  cardId: 'c1',
  name: 'Venture X annual fee',
  cents: 55_000,
  firstDueOn: day('2027-03-01'),
  priority: 'should',
  orderIndex: 3,
});
assert.ok(isCardFeeBill(bill), "a fee bill is marked as its card's");
assert.equal(bill.paidByCardId, 'c1', 'a fee bill is charged to its card');
assert.equal(bill.paysItself, true, 'a fee bill pays itself');
assert.equal(
  bill.timing.schedule.kind === 'everyMonths'
    ? bill.timing.schedule.intervalMonths
    : null,
  12,
  'a fee bill repeats yearly',
);

console.log('runway card fees: ok');
