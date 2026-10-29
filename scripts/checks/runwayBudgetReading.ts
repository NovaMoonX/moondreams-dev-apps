import assert from 'node:assert/strict';

import {
  getMissingStep,
  toBillValue,
  toIncomeValue,
} from '../../src/apps/runway/lib/budgetDraft.ts';
import {
  cutAtWord,
  normalizeBudgetReading,
} from '../../src/apps/runway/lib/normalizeBudgetReading.ts';

const fileNames = ['Budget.csv', 'Summary.csv'];
const today = Date.UTC(2026, 9, 29);

const bill = (
  sourceFile: string,
  name: string,
  amountCents: number | null,
) => ({
  sourceFile,
  name,
  amountCents,
  lowCents: null,
  highCents: null,
  dueOn: null,
  dayOfMonth: 1,
  repeats: 'monthly',
});

const overlap = normalizeBudgetReading(
  {
    incomes: [],
    bills: [
      bill('Budget.csv', 'Rent', 125_000),
      bill('Budget.csv', 'Phone', 4_000),
      bill('Summary.csv', 'rent', 125_000),
      bill('Summary.csv', 'Internet', 6_000),
    ],
    envelopes: [],
    goals: [],
    notRead: [],
  },
  { fileNames },
);
assert.deepEqual(
  overlap.bills.map((entry) => entry.name),
  ['Rent', 'Phone', 'Internet'],
  'the same bill in two files is one bill, the first file first',
);
assert.equal(overlap.bills[0].notes.length, 0, 'the same amount adds no note');
assert.equal(overlap.bills[0].sourceFile, 'Budget.csv');

const conflict = normalizeBudgetReading(
  {
    incomes: [],
    bills: [
      bill('Budget.csv', 'Rent', 125_000),
      bill('Summary.csv', 'Rent', 130_000),
    ],
    envelopes: [],
    goals: [],
    notRead: [],
  },
  { fileNames },
);
assert.equal(conflict.bills.length, 1);
assert.equal(conflict.bills[0].amountCents, 125_000, 'the first file wins');
assert.deepEqual(
  conflict.bills[0].notes,
  ['Also in Summary.csv as $1,300.00'],
  'a different amount becomes a note',
);

const missing = normalizeBudgetReading(
  {
    incomes: [],
    bills: [bill('Budget.csv', 'Gym', null), bill('Summary.csv', 'Gym', 3_000)],
    envelopes: [
      {
        sourceFile: 'Budget.csv',
        name: 'Groceries',
        amountCents: null,
        period: 'monthly',
      },
    ],
    goals: [],
    notRead: [],
  },
  { fileNames },
);
assert.equal(
  missing.envelopes[0].amountCents,
  null,
  'an amount nobody gave stays null',
);
assert.equal(
  missing.bills[0].amountCents,
  3_000,
  'a value only the other file has fills the gap',
);
assert.equal(missing.bills[0].notes.length, 0);

const added = normalizeBudgetReading(
  {
    incomes: [],
    bills: [bill('Summary.csv', 'Phone', 4_500)],
    envelopes: [],
    goals: [],
    notRead: [],
  },
  { fileNames, existing: overlap },
);
assert.equal(added.bills.length, 3, 'a later file merges into what was read');
assert.equal(added.bills[1].amountCents, 4_000);
assert.equal(added.bills[1].notes[0], 'Also in Summary.csv as $45.00');

const messy = normalizeBudgetReading(
  {
    incomes: [
      {
        sourceFile: 'Elsewhere.csv',
        name: 'NORTHWIND PAY',
        amountCents: 2.5,
        scheduleKind: 'irregular',
        nextOn: '2026-02-31',
        monthDays: null,
      },
    ],
    bills: [
      bill('Budget.csv', '   ', 100),
      { ...bill('Budget.csv', 'Water', -5), lowCents: 3_000, highCents: 4_000 },
    ],
    envelopes: [],
    goals: [],
    notRead: [{ file: 'Budget.csv', text: 'x'.repeat(500) }],
  },
  { fileNames: ['Budget.csv'] },
);
assert.equal(messy.bills.length, 1, 'an empty name is dropped');
assert.equal(messy.bills[0].amountCents, 3_000);
assert.equal(messy.bills[0].highCents, 4_000, 'a written range is kept');
assert.equal(
  messy.incomes[0].name,
  'Northwind pay',
  'a name in capitals is recased',
);
assert.equal(messy.incomes[0].sourceFile, 'Budget.csv');
assert.equal(messy.incomes[0].scheduleKind, null, 'irregular is not offered');
assert.equal(messy.incomes[0].nextOn, null, 'an impossible date is dropped');
assert.ok(messy.notRead[0].text.length <= 140);
assert.equal(cutAtWord('Annual car insurance premium', 20), 'Annual car');

const value = toBillValue(
  { ...bill('Budget.csv', 'Rent', null), notes: [] } as never,
  today,
);
assert.equal(
  getMissingStep('bill', value),
  'amount',
  'no amount opens at the amount',
);
assert.equal(
  value.timing.schedule.anchor,
  Date.UTC(2026, 10, 1),
  'a day of the month lands on the next one',
);
const income = toIncomeValue(
  {
    name: 'Pay',
    sourceFile: 'a',
    notes: [],
    amountCents: 100_000,
    scheduleKind: 'weekly',
    nextOn: Date.UTC(2026, 9, 1),
    monthDays: [],
  },
  today,
);
assert.equal(
  income.schedule.anchor,
  Date.UTC(2026, 9, 29),
  'a past payday rolls to the next one',
);
assert.equal(getMissingStep('income', income), null);

console.log('runwayBudgetReading: ok');
