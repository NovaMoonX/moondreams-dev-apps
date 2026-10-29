import assert from 'node:assert/strict';

import {
  chooseVersion,
  getMissingStep,
  getMissingSteps,
  toBillValue,
  toIncomeValue,
  toMonthlyBillValue,
  toPerMonthCents,
} from '../../src/apps/runway/lib/budgetDraft.ts';
import {
  cutAtWord,
  normalizeBudgetReading,
} from '../../src/apps/runway/lib/normalizeBudgetReading.ts';
import { maskFigures } from '../../src/apps/runway/utils/maskText.ts';
import { nameDocuments } from '../../src/apps/runway/lib/nameDocuments.ts';

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
assert.equal(
  overlap.bills[0].versions.length,
  0,
  'the same values in two files are not a disagreement',
);
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
assert.equal(
  conflict.bills[0].amountCents,
  125_000,
  'the first file is what is shown until the person chooses',
);
assert.deepEqual(
  conflict.bills[0].versions.map((entry) => [
    entry.sourceFile,
    entry.values.amountCents,
  ]),
  [
    ['Budget.csv', 125_000],
    ['Summary.csv', 130_000],
  ],
  'a different amount keeps both files, each with its values',
);
assert.equal(
  chooseVersion.bill(conflict.bills[0], conflict.bills[0].versions[1])
    .amountCents,
  130_000,
  'choosing a version writes its values',
);

const dueDay = normalizeBudgetReading(
  {
    incomes: [],
    bills: [
      bill('Budget.csv', 'Rent', 125_000),
      { ...bill('Summary.csv', 'Rent', 125_000), dayOfMonth: 5 },
    ],
    envelopes: [],
    goals: [],
    notRead: [],
  },
  { fileNames },
);
assert.equal(
  dueDay.bills[0].versions.length,
  2,
  'the same amount on another day of the month is a disagreement',
);
const chosenDay = toBillValue(
  chooseVersion.bill(dueDay.bills[0], dueDay.bills[0].versions[1]),
  today,
);
assert.deepEqual(
  chosenDay.timing.schedule.monthDays,
  [5],
  'the chosen file sets the day',
);

const period = normalizeBudgetReading(
  {
    incomes: [],
    bills: [],
    envelopes: [
      {
        sourceFile: 'Budget.csv',
        name: 'Groceries',
        amountCents: 40_000,
        period: 'monthly',
      },
      {
        sourceFile: 'Summary.csv',
        name: 'Groceries',
        amountCents: 40_000,
        period: 'weekly',
      },
    ],
    goals: [],
    notRead: [],
  },
  { fileNames },
);
assert.equal(
  period.envelopes[0].versions.length,
  2,
  'the same amount for another period is a disagreement',
);

const twoFiles = normalizeBudgetReading(
  {
    incomes: [],
    bills: [
      bill('Budget.csv', 'Rent', 145_000),
      bill('Budget.csv', 'Water', 6_240),
      { ...bill('Summary.csv', 'Rent', 150_000), dayOfMonth: null },
    ],
    envelopes: [],
    goals: [],
    notRead: [],
  },
  { fileNames },
);
assert.equal(twoFiles.bills.length, 2, 'Rent from two files is one bill');
assert.equal(twoFiles.bills[0].amountCents, 145_000);
assert.deepEqual(
  twoFiles.bills[0].versions.map((entry) => entry.sourceFile),
  ['Budget.csv', 'Summary.csv'],
  'two files read together keep both versions',
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
assert.equal(
  missing.bills[0].versions.length,
  0,
  'a gap is not a disagreement',
);

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
assert.equal(
  added.bills[1].versions[1].values.amountCents,
  4_500,
  'a later file that differs keeps its version',
);

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
  { ...bill('Budget.csv', 'Rent', null), versions: [] } as never,
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
    versions: [],
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

const quiet = { incomes: [], envelopes: [], goals: [], notRead: [] };

const yearly = normalizeBudgetReading(
  {
    ...quiet,
    bills: [
      {
        ...bill('Budget.csv', 'Car insurance', 90_000),
        repeats: null,
        writtenCadence: 'Yearly',
      },
      {
        ...bill('Budget.csv', 'Rent', 100_000),
        repeats: null,
        writtenCadence: 'monthly',
      },
    ],
  },
  { fileNames },
);
assert.equal(yearly.bills[0].repeats, null, 'a yearly bill has no repeat');
assert.equal(
  yearly.bills[0].dayOfMonth,
  null,
  'a day of the month does not make a yearly bill monthly',
);
assert.deepEqual(yearly.notRead, [], 'a yearly bill is a row, not a line');
assert.equal(yearly.bills[0].writtenCadence, 'yearly', 'its words are kept');
assert.equal(
  yearly.bills[0].amountCents,
  null,
  'an amount that was for a yearly bill is not kept as a monthly one',
);
assert.equal(
  yearly.bills[0].writtenCents,
  90_000,
  'the document figure is kept beside its cadence',
);
assert.equal(toPerMonthCents(yearly.bills[0]), 7_500, 'a year is 12 months');
const monthlyForm = toMonthlyBillValue(yearly.bills[0], today);
assert.equal(monthlyForm.amount.lowCents, 7_500);
assert.equal(monthlyForm.timing.schedule.kind, 'monthly');
const quarterly = normalizeBudgetReading(
  {
    ...quiet,
    bills: [
      {
        ...bill('Budget.csv', 'Water', 6_000),
        repeats: null,
        writtenCadence: 'Quarterly',
      },
      {
        ...bill('Budget.csv', 'Dues', 1_000),
        repeats: null,
        writtenCadence: 'every 6 months',
      },
    ],
  },
  { fileNames },
);
assert.deepEqual(
  quarterly.bills.map((entry) => entry.writtenMonths),
  [3, 6],
  'quarterly is 3 months and every 6 months is 6',
);
const semi = normalizeBudgetReading(
  {
    ...quiet,
    bills: [
      'semiannual',
      'semi-yearly',
      'semi-monthly',
      'bi-monthly',
      'bi-annual',
      'half-yearly',
    ].map((writtenCadence, index) => ({
      ...bill('Budget.csv', `Bill ${index}`, 1_000),
      repeats: null,
      writtenCadence,
    })),
  },
  { fileNames },
);
assert.deepEqual(
  semi.bills.map((entry) => entry.writtenMonths),
  [6, 6, null, null, null, 6],
  'semi means six months only before annual or year; the other twice-or-every-other words are left unsure',
);
const twice = normalizeBudgetReading(
  {
    ...quiet,
    bills: [
      'twice a month',
      '2x a month',
      'two times a month',
      'twice monthly',
      'twice a year',
      'twice yearly',
    ].map((writtenCadence, index) => ({
      ...bill('Budget.csv', `Twice ${index}`, 4_000),
      repeats: 'monthly' as const,
      dayOfMonth: 1,
      writtenCadence,
    })),
  },
  { fileNames },
);
assert.deepEqual(
  twice.bills.map((entry) => [
    entry.repeats,
    entry.amountCents,
    entry.writtenCents,
  ]),
  twice.bills.map(() => [null, null, 4_000]),
  'a twice-a-month bill keeps the document figure and no repeat',
);
assert.deepEqual(
  twice.bills.map((entry) => entry.writtenCadence),
  [
    'twice a month',
    '2x a month',
    'two times a month',
    'twice monthly',
    'twice a year',
    'twice yearly',
  ],
  'its words are kept so the sheet says what the document wrote',
);
assert.deepEqual(
  twice.bills.map((entry) => entry.writtenMonths),
  [null, null, null, null, 6, 6],
  'twice a month has no whole-month spread; twice a year is six months',
);
const cadenceClash = normalizeBudgetReading(
  {
    ...quiet,
    bills: [
      {
        ...bill('Budget.csv', 'Water', 6_000),
        repeats: null,
        writtenCadence: 'quarterly',
      },
      {
        ...bill('Summary.csv', 'Water', 2_000),
        repeats: null,
        writtenCadence: 'yearly',
      },
    ],
  },
  { fileNames },
);
assert.equal(
  cadenceClash.bills[0].versions.length,
  2,
  'two files that give different cadences or figures for a bill disagree',
);
assert.deepEqual(
  getMissingSteps('bill', toBillValue(yearly.bills[0], today)),
  ['amount', 'repeats'],
  'its amount and repeat are left to the person',
);
assert.equal(
  toBillValue(yearly.bills[1], today).timing.schedule.kind,
  'monthly',
  'a monthly cadence with a day stays monthly',
);

const lateDayBill = { ...bill('Budget.csv', 'Loan', 1_000), dayOfMonth: 31 };
const onThe31st = toBillValue(
  { ...lateDayBill, versions: [] } as never,
  Date.UTC(2026, 10, 15),
);
assert.equal(
  onThe31st.timing.schedule.anchor,
  Date.UTC(2026, 11, 31),
  'the 31st skips a 30-day month',
);
assert.deepEqual(onThe31st.timing.schedule.monthDays, [31]);
const febFirst = toBillValue(
  { ...lateDayBill, versions: [] } as never,
  Date.UTC(2026, 1, 1),
);
assert.equal(
  febFirst.timing.schedule.anchor,
  Date.UTC(2026, 2, 31),
  'the 31st is not moved onto the end of February',
);
const rolled = toBillValue(
  {
    ...lateDayBill,
    dayOfMonth: null,
    dueOn: Date.UTC(2026, 0, 31),
    versions: [],
  } as never,
  Date.UTC(2026, 1, 10),
);
assert.equal(
  rolled.timing.schedule.anchor,
  Date.UTC(2026, 2, 31),
  'a monthly bill due on the 31st next falls on the next 31st',
);
assert.deepEqual(rolled.timing.schedule.monthDays, [31]);

const makeFile = (name: string) => new File(['x'], name);
const named = nameDocuments(
  [makeFile('Budget.csv'), makeFile('Budget.csv'), makeFile('b--c\n---.csv')],
  true,
  ['Budget.csv', 'Pasted text'],
);
assert.deepEqual(
  named.files.map((entry) => entry.shown),
  ['Budget (2).csv', 'Budget (3).csv', 'b--c\n---.csv'],
  'a repeated file name is told apart',
);
assert.equal(named.pasted?.shown, 'Pasted text 2');
assert.equal(
  named.files[2].sent,
  'b-c -.csv',
  'dash runs and line breaks never reach the markers',
);
const mapped = normalizeBudgetReading(
  {
    ...quiet,
    bills: [bill(named.files[2].sent, 'Rent', 100)],
  },
  {
    fileNames: named.files.map((entry) => entry.sent),
    shownAs: Object.fromEntries(
      named.files.map((entry) => [entry.sent, entry.shown]),
    ),
  },
);
assert.equal(
  mapped.bills[0].sourceFile,
  'b--c\n---.csv',
  'the source maps back to the name the person sees',
);

const many = normalizeBudgetReading(
  {
    ...quiet,
    incomes: Array.from({ length: 12 }, (_, index) => ({
      sourceFile: 'Budget.csv',
      name: `Job ${String.fromCharCode(65 + index)}`,
      amountCents: 100,
      scheduleKind: 'weekly',
      nextOn: null,
      monthDays: null,
    })),
    goals: [
      {
        sourceFile: 'Budget.csv',
        name: 'House',
        targetCents: 5_000_000,
        currentCents: null,
        targetDate: '2031-01-01',
      },
    ],
  },
  { fileNames, today },
);
assert.equal(many.incomes.length, 10, 'incomes stop at the cap, first kept');
assert.equal(many.incomes[0].name, 'Job A');
assert.deepEqual(
  many.notRead.map((entry) => entry.text),
  [
    'Only the first 10 incomes are kept; 2 more were left out.',
    'House aims for January 1, 2031, which is more than 12 months away. The date was left out.',
  ],
  'what was cut is said',
);

console.log('runwayBudgetReading: ok');

assert.equal(
  maskFigures('$300–360 a month'),
  '•••• a month',
  'a hidden range is one mask, never a mask beside a bare figure',
);

const three = normalizeBudgetReading(
  {
    ...quiet,
    bills: [
      { ...bill('Budget.csv', 'Gym', 3_000), dayOfMonth: null },
      { ...bill('Summary.csv', 'Gym', 3_000), dayOfMonth: 5 },
      { ...bill('Extra.csv', 'Gym', 4_000), dayOfMonth: null },
    ],
  },
  { fileNames: [...fileNames, 'Extra.csv'] },
);
assert.deepEqual(
  three.bills[0].versions.map((entry) => [
    entry.sourceFile,
    entry.values.dayOfMonth,
  ]),
  [
    ['Budget.csv', null],
    ['Summary.csv', 5],
    ['Extra.csv', null],
  ],
  'each file is listed with what it said itself, not with what another file filled in',
);
