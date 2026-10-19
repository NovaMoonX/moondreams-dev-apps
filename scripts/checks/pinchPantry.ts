import assert from 'node:assert/strict';

import type { Package, Recipe } from '../../src/apps/pinch/types.ts';
import {
  getEatByLabel,
  getEatByPhrase,
  getEatByState,
} from '../../src/apps/pinch/utils/containers.ts';
import {
  NO_PACKAGE_SKIPS,
  appendPackageEvent,
  buildPackage,
  byUseBy,
  getDateInDays,
  getLineMarkers,
  getLineStock,
  formatKitchenTotal,
  getLineStockText,
  getTakeAmountText,
  type LineStock,
  getNewPackagesProblem,
  getPackageBulkNames,
  getPackageBulkToast,
  getPackageLabel,
  getPackageSeed,
  getPackageSelectionNote,
  getPackageSelectionTitle,
  getPackageSkippedText,
  getPackageState,
  getPackageTossAction,
  getPackagesPastDueText,
  getPantryDueText,
  getPantrySummary,
  getPastDuePackages,
  getStockFlag,
  getStockSummaryParts,
  getStockView,
  groupPackagesByIngredient,
  makePackageEvent,
  planPackageBulk,
  planPackageEdit,
  planPackageMove,
  planPackageToss,
  planTakeOut,
  planUndoEnd,
  planUndoPackageMove,
  planUse,
  sumAmounts,
  type PackagePlan,
} from '../../src/apps/pinch/utils/packages.ts';

const DAY = 86_400_000;
const dayOf = (day: number) => Date.UTC(2026, 9, day);
const NOW = new Date(2026, 9, 18, 12).getTime();

const pkg = (over: Partial<Package> = {}): Package => ({
  id: 'p1',
  ingredientId: 'cat-milk',
  ingredientName: 'Milk',
  productId: null,
  amount: 1,
  unit: 'L',
  place: 'FRIDGE',
  expiresAt: dayOf(25),
  openedAt: null,
  status: 'IN_STOCK',
  history: [makePackageEvent('ADDED', 1000, { amount: 1, place: 'FRIDGE' })],
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});
const fieldsOf = (plan: PackagePlan) => {
  assert.ok('fields' in plan, 'expected a change, got an error');
  return plan.fields;
};
const errorOf = (plan: PackagePlan) => {
  assert.ok('error' in plan, 'expected an error, got a change');
  return plan.error;
};

// The date states are the box's rule, with the person's own window for "soon"
assert.deepEqual(
  [16, 17, 18, 19, 20, 21].map((day) => getPackageState(dayOf(day), NOW)),
  ['PAST', 'PAST', 'SOON', 'SOON', 'LATER', 'LATER'],
  'one day ahead is the default window, like a box',
);
assert.deepEqual(
  [16, 17, 18, 19, 20, 21].map((day) => getPackageState(dayOf(day), NOW, 3)),
  ['PAST', 'PAST', 'SOON', 'SOON', 'SOON', 'SOON'],
  'three lead days tint three days ahead',
);
assert.equal(getPackageState(null, NOW), 'NONE', 'no date is its own state');
assert.equal(getPackageState(null, NOW, 3), 'NONE');
assert.deepEqual(
  [14, 15, 16, 17, 18, 19].map((day) => [
    getPackageState(dayOf(day), NOW),
    getEatByState(dayOf(day), NOW),
  ]),
  [14, 15, 16, 17, 18, 19].map((day) => {
    const state = getEatByState(dayOf(day), NOW);
    return [state, state];
  }),
  'a package and a box never disagree about the same day',
);
assert.deepEqual(
  [16, 17, 18, 19, 20, 23, 24, 25, 30].map((day) =>
    getEatByLabel(dayOf(day), NOW, 'Use'),
  ),
  [
    'Past its date',
    'Past its date',
    'Use today',
    'Use by tomorrow',
    'Use by Tue',
    'Use by Fri',
    'Use by Sat',
    'Use by Oct 25',
    'Use by Oct 30',
  ],
  'a package says Use, a weekday within six days, a date after it',
);
assert.deepEqual(
  [16, 18, 19, 20, 23, 24].map((day) => getEatByPhrase(dayOf(day), NOW)),
  ['Oct 16', 'today', 'tomorrow', 'Oct 20', 'Oct 23', 'Oct 24'],
  'a box keeps its own phrase, never a weekday',
);
assert.equal(getPackageLabel(null, NOW), null);
assert.equal(getPackageLabel(dayOf(17), NOW), 'Past its date');
assert.equal(
  getEatByLabel(dayOf(19), NOW),
  'Eat by tomorrow',
  'a box still says Eat',
);

// Soonest date first, no date last, ties by age then id
const mixed = [
  pkg({ id: 'none-old', expiresAt: null, createdAt: 10 }),
  pkg({ id: 'late', expiresAt: dayOf(30) }),
  pkg({ id: 'none-new', expiresAt: null, createdAt: 20 }),
  pkg({ id: 'soon', expiresAt: dayOf(19), createdAt: 5 }),
  pkg({ id: 'past', expiresAt: dayOf(15) }),
  pkg({ id: 'soon-b', expiresAt: dayOf(19), createdAt: 5 }),
  pkg({ id: 'soon-older', expiresAt: dayOf(19), createdAt: 1 }),
];
assert.deepEqual(
  [...mixed].sort(byUseBy).map((p) => p.id),
  ['past', 'soon-older', 'soon', 'soon-b', 'late', 'none-old', 'none-new'],
  'soonest first with no date last',
);
assert.deepEqual(
  [...mixed]
    .reverse()
    .sort(byUseBy)
    .map((p) => p.id),
  ['past', 'soon-older', 'soon', 'soon-b', 'late', 'none-old', 'none-new'],
  'the order never depends on how they came in',
);

// Amounts add up per kind and never across kinds
assert.deepEqual(sumAmounts([]), []);
assert.deepEqual(
  sumAmounts([
    { amount: 1, unit: 'LB' },
    { amount: 8, unit: 'OZ' },
  ]),
  [{ dimension: 'MASS', unit: 'LB', amount: 1.5 }],
  'a pound and eight ounces in the larger unit',
);
assert.deepEqual(
  sumAmounts([
    { amount: 500, unit: 'G' },
    { amount: 1, unit: 'L' },
    { amount: 3, unit: 'EACH' },
    { amount: 2, unit: 'KG' },
  ]),
  [
    { dimension: 'MASS', unit: 'KG', amount: 2.5 },
    { dimension: 'VOLUME', unit: 'L', amount: 1 },
    { dimension: 'COUNT', unit: 'EACH', amount: 3 },
  ],
  'weights, volumes and counts stay their own lines, in a fixed order',
);
assert.deepEqual(
  sumAmounts([
    { amount: 2.5, unit: 'EACH' },
    { amount: 1, unit: 'EACH' },
  ]),
  [{ dimension: 'COUNT', unit: 'EACH', amount: 3.5 }],
  'a count is not rounded up: it is what is there',
);

// An ingredient with several packages
const chicken = [
  pkg({
    id: 'c1',
    ingredientId: 'cat-chicken',
    unit: 'LB',
    amount: 1,
    expiresAt: dayOf(16),
    place: 'FRIDGE',
  }),
  pkg({
    id: 'c2',
    ingredientId: 'cat-chicken',
    unit: 'LB',
    amount: 0.9,
    expiresAt: dayOf(21),
    place: 'FRIDGE',
  }),
  pkg({
    id: 'c3',
    ingredientId: 'cat-chicken',
    unit: 'OZ',
    amount: 8,
    expiresAt: dayOf(19),
    place: 'FREEZER',
  }),
];
const chickenView = getStockView('cat-chicken', chicken, NOW);
assert.deepEqual(
  chickenView.packages.map((p) => p.id),
  ['c1', 'c3', 'c2'],
);
assert.deepEqual(
  [chickenView.pastCount, chickenView.soonCount, chickenView.nearest?.id],
  [1, 1, 'c1'],
);
assert.deepEqual(
  getStockSummaryParts(chickenView),
  ['3 packages', '1.4 lb in date'],
  'the pound past its date is left out of the total, and the row flags it',
);
assert.deepEqual(getStockFlag(chickenView, NOW), {
  state: 'PAST',
  label: '1 past its date',
});
assert.deepEqual(
  getStockFlag(getStockView('x', [chicken[0]], NOW), NOW),
  { state: 'PAST', label: 'Past its date' },
  'one package past its date says so plainly',
);
assert.deepEqual(
  getStockFlag(
    getStockView(
      'x',
      [chicken[0], chicken[1], pkg({ id: 'c4', expiresAt: dayOf(10) })],
      NOW,
    ),
    NOW,
  ),
  { state: 'PAST', label: '2 past their date' },
);
assert.deepEqual(
  getStockFlag(getStockView('x', [chicken[2], chicken[1]], NOW), NOW),
  {
    state: 'SOON',
    label: 'Use by tomorrow',
  },
);
assert.deepEqual(getStockFlag(getStockView('x', [chicken[1]], NOW), NOW), {
  state: 'LATER',
  label: 'Use by Wed',
});
assert.equal(
  getStockFlag(getStockView('x', [pkg({ expiresAt: null })], NOW), NOW),
  null,
  'no date draws no flag',
);
assert.deepEqual(
  getStockSummaryParts(
    getStockView('x', [pkg({ amount: 2, unit: 'CUP' })], NOW),
  ),
  ['2 cup'],
  'one package says its amount, never "1 package"',
);
assert.deepEqual(
  getStockSummaryParts(
    getStockView(
      'x',
      [pkg({ unit: 'L' }), pkg({ id: 'q', amount: 3, unit: 'EACH' })],
      NOW,
    ),
  ),
  ['2 packages', '1 l and 3 each in all'],
  'a different kind is shown as its own amount',
);

const carton = (id: string, amount: number, expiresAt: number | null) =>
  pkg({ id, amount, unit: 'FL_OZ', expiresAt });
assert.deepEqual(
  getStockSummaryParts(
    getStockView(
      'x',
      [carton('a', 192, dayOf(25)), carton('b', 32, dayOf(10))],
      NOW,
    ),
  ),
  ['2 packages', '192 fl oz in date'],
  'a carton past its date is not in the total, which says so instead of "in all"',
);
assert.deepEqual(
  getStockSummaryParts(
    getStockView('x', [carton('a', 96, dayOf(25)), carton('b', 96, null)], NOW),
  ),
  ['2 packages', '192 fl oz in all'],
  'one with no date counts, and with nothing past the total is "in all"',
);
assert.deepEqual(
  getStockSummaryParts(
    getStockView(
      'x',
      [carton('a', 192, dayOf(9)), carton('b', 32, dayOf(10))],
      NOW,
    ),
  ),
  ['2 packages'],
  'with every package past its date there is no amount in date to add up',
);
assert.deepEqual(
  getStockSummaryParts(getStockView('x', [carton('a', 32, dayOf(10))], NOW)),
  ['32 fl oz'],
  'one package past its date still says its own amount',
);

// Grouping keeps only what is in stock
const grouped = groupPackagesByIngredient([
  ...chicken,
  pkg({ id: 'done', ingredientId: 'cat-chicken', status: 'DONE' }),
  pkg({ id: 'm1' }),
]);
assert.deepEqual(
  [...grouped].map(([id, list]) => [id, list.length]),
  [
    ['cat-chicken', 3],
    ['cat-milk', 1],
  ],
);

// The tile's words
assert.deepEqual(
  getPantrySummary(
    [
      ...chicken,
      pkg({ id: 'later', expiresAt: dayOf(30) }),
      pkg({ id: 'none', expiresAt: null }),
      pkg({ id: 'done', status: 'DONE', expiresAt: dayOf(10) }),
    ],
    NOW,
  ),
  { packageCount: 5, ingredientCount: 2, soonCount: 1, pastCount: 1 },
);
assert.equal(getPantryDueText(2, 1), '2 to use soon, 1 past its date');
assert.equal(getPantryDueText(0, 3), '3 past their date');
assert.equal(getPantryDueText(1, 0), '1 to use soon');
assert.equal(getPantryDueText(0, 0), '');
assert.deepEqual(
  getPastDuePackages(
    [
      ...chicken,
      pkg({ id: 'done', status: 'DONE', expiresAt: dayOf(10) }),
      pkg({ id: 'none', expiresAt: null }),
    ],
    NOW,
  ).map((p) => p.id),
  ['c1'],
  'a finished package or one with no date is never past due',
);
assert.equal(getPackagesPastDueText(1), '1 package is past its date');
assert.equal(getPackagesPastDueText(3), '3 packages are past their date');
assert.equal(getPackageTossAction(1), 'Toss it');
assert.equal(getPackageTossAction(2), 'Toss them');
assert.equal(getPackageSelectionTitle(0), 'Select packages');
assert.equal(getPackageSelectionTitle(3), '3 selected');
assert.equal(
  getPackageSelectionNote(0),
  'Tap the packages you want to act on.',
);
assert.equal(getPackageSelectionNote(1), null);

// The quick answers are days from the viewer's today
assert.equal(getDateInDays(3, NOW), dayOf(21));
assert.equal(getDateInDays(7, NOW), dayOf(25));
assert.equal(getDateInDays(30, NOW), dayOf(18) + 30 * DAY);

// A new package
const built = buildPackage(
  {
    id: 'n1',
    ingredientId: 'cat-milk',
    ingredientName: '  Milk ',
    productId: null,
    amount: 0.1 + 0.2,
    unit: 'L',
    place: 'FRIDGE',
    expiresAt: dayOf(25),
  },
  5000,
);
assert.deepEqual(
  [
    built.status,
    built.amount,
    built.ingredientName,
    built.openedAt,
    built.createdAt,
    built.updatedAt,
  ],
  ['IN_STOCK', 0.3, 'Milk', null, 5000, 5000],
);
assert.deepEqual(built.history, [
  { kind: 'ADDED', at: 5000, amount: 0.3, place: 'FRIDGE', note: null },
]);
const input = {
  ingredientId: 'cat-milk',
  ingredientName: 'Milk',
  productId: null,
  amount: 1,
  unit: 'L' as const,
  place: 'FRIDGE' as const,
  expiresAt: dayOf(25),
};
assert.equal(getNewPackagesProblem([input], 0), null);
assert.equal(
  getNewPackagesProblem([{ ...input, expiresAt: null }], 0),
  null,
  'no date is an honest answer',
);
assert.equal(
  getNewPackagesProblem([{ ...input, ingredientId: '' }], 0),
  'Pick what it is.',
);
assert.equal(
  getNewPackagesProblem([{ ...input, amount: 0 }], 0),
  'Check the amount and the date.',
);
assert.equal(
  getNewPackagesProblem([{ ...input, amount: 1_000_001 }], 0),
  'Check the amount and the date.',
);
assert.equal(
  getNewPackagesProblem([{ ...input, expiresAt: dayOf(25) + 5 }], 0),
  'Check the amount and the date.',
  'a date is a whole day',
);
assert.equal(
  getNewPackagesProblem([{ ...input, expiresAt: Date.UTC(1999, 0, 1) }], 0),
  'Check the amount and the date.',
);
assert.equal(
  getNewPackagesProblem([{ ...input, expiresAt: Date.UTC(2101, 0, 1) }], 0),
  'Check the amount and the date.',
);
assert.match(getNewPackagesProblem([input], 500) ?? '', /500 packages/);
assert.equal(getNewPackagesProblem([input, input], 498), null);
assert.match(
  getNewPackagesProblem([input, input, input], 498) ?? '',
  /pass the 500/,
);

// Using some, all, and tossing
const used = fieldsOf(planUse(pkg({ amount: 2, unit: 'CUP' }), 0.5, NOW));
assert.deepEqual(
  [used.amount, used.status, used.openedAt],
  [1.5, undefined, NOW],
  'a first use stamps when it was opened',
);
assert.deepEqual(used.history?.at(-1), {
  kind: 'USED',
  at: NOW,
  amount: 0.5,
  place: null,
  note: null,
});
const usedAgain = fieldsOf(
  planUse(pkg({ amount: 1.5, openedAt: 77 }), 0.25, NOW),
);
assert.equal(usedAgain.openedAt, 77, 'a later use keeps the first opened day');
const usedUp = fieldsOf(planUse(pkg({ amount: 1.5 }), 'ALL', NOW));
assert.deepEqual(
  [usedUp.status, usedUp.amount, usedUp.history?.at(-1)?.amount],
  ['DONE', undefined, 1.5],
  'using it all finishes it and keeps the amount it ended with',
);
const usedExact = fieldsOf(planUse(pkg({ amount: 1.5 }), 1.5, NOW));
assert.equal(
  usedExact.status,
  'DONE',
  'using exactly what is left finishes it',
);
const usedCrumb = fieldsOf(planUse(pkg({ amount: 1.5 }), 1.498, NOW));
assert.equal(
  usedCrumb.status,
  'DONE',
  'a crumb of 0.002 is not kept as a package',
);
assert.match(errorOf(planUse(pkg({ amount: 1 }), 2, NOW)), /Only 1 l is left/);
assert.equal(errorOf(planUse(pkg(), 0, NOW)), 'Say how much you used.');
assert.equal(errorOf(planUse(pkg(), -1, NOW)), 'Say how much you used.');
assert.equal(
  errorOf(planUse(pkg({ status: 'DONE' }), 1, NOW)),
  'This one is already finished.',
);
const tossed = fieldsOf(planPackageToss(pkg({ amount: 1.5 }), NOW));
assert.deepEqual(
  [tossed.status, tossed.history?.at(-1)?.kind, tossed.history?.at(-1)?.amount],
  ['DONE', 'TOSSED', 1.5],
);
assert.equal(
  errorOf(planPackageToss(pkg({ status: 'DONE' }), NOW)),
  'This one is already finished.',
);

// Undo reverses only what is still as the act left it
const start = pkg({ amount: 2, unit: 'CUP' });
const afterUse = { ...start, ...fieldsOf(planUse(start, 0.5, NOW)) } as Package;
const backFromUse = fieldsOf(planUndoEnd(afterUse, NOW, NOW + 1000));
assert.deepEqual(
  [
    backFromUse.amount,
    backFromUse.status,
    backFromUse.openedAt,
    backFromUse.history?.length,
  ],
  [2, 'IN_STOCK', null, start.history.length],
  'undoing the first use puts the amount back and un-opens it',
);
const afterUsedUp = {
  ...start,
  ...fieldsOf(planUse(start, 'ALL', NOW)),
} as Package;
const backFromUsedUp = fieldsOf(planUndoEnd(afterUsedUp, NOW, NOW + 1000));
assert.deepEqual(
  [backFromUsedUp.amount, backFromUsedUp.status],
  [2, 'IN_STOCK'],
);
const changedSince = {
  ...afterUse,
  history: [
    ...afterUse.history,
    makePackageEvent('EDITED', NOW + 9, { note: 'Amount' }),
  ],
} as Package;
assert.equal(
  errorOf(planUndoEnd(changedSince, NOW, NOW + 1000)),
  'That has changed since, so it could not be undone.',
  'a change after the use is never rewound',
);
assert.equal(
  errorOf(planUndoEnd(afterUse, NOW + 3, NOW + 1000)),
  'That has changed since, so it could not be undone.',
  'another act with the same event kind is not this one',
);
assert.equal(
  errorOf(planUndoEnd(start, NOW, NOW + 1000)),
  'That has changed since, so it could not be undone.',
  'an untouched package has nothing to undo',
);
const usedTwice = {
  ...afterUse,
  ...fieldsOf(planUse(afterUse, 0.25, NOW + 50)),
} as Package;
const undoFirstOfTwo = planUndoEnd(usedTwice, NOW, NOW + 100);
assert.equal(
  errorOf(undoFirstOfTwo),
  'That has changed since, so it could not be undone.',
  'the earlier use is not the last event once a later one landed',
);
assert.deepEqual(
  [
    fieldsOf(planUndoEnd(usedTwice, NOW + 50, NOW + 100)).amount,
    fieldsOf(planUndoEnd(usedTwice, NOW + 50, NOW + 100)).openedAt,
  ],
  [1.5, NOW],
  'undoing the latest use keeps the day it was first opened',
);

// Moving keeps the date unless a new one is given
const moved = fieldsOf(planPackageMove(pkg(), 'FREEZER', undefined, NOW));
assert.deepEqual(
  [moved.place, 'expiresAt' in moved, moved.history?.at(-1)],
  [
    'FREEZER',
    false,
    {
      kind: 'MOVED',
      at: NOW,
      amount: null,
      place: 'FREEZER',
      note: 'From the fridge',
    },
  ],
);
const movedRedated = fieldsOf(
  planPackageMove(pkg({ expiresAt: dayOf(20) }), 'FREEZER', dayOf(30), NOW),
);
assert.deepEqual(
  [movedRedated.expiresAt, movedRedated.history?.at(-1)?.note],
  [dayOf(30), 'From the fridge · Use by Oct 20 → Oct 30'],
);
const movedClear = fieldsOf(
  planPackageMove(pkg({ expiresAt: dayOf(20) }), 'PANTRY', null, NOW),
);
assert.deepEqual(
  [movedClear.expiresAt, movedClear.history?.at(-1)?.note],
  [null, 'From the fridge · Use by Oct 20 → no date'],
);
assert.equal(
  errorOf(planPackageMove(pkg(), 'FRIDGE', undefined, NOW)),
  'It is already in the fridge, so nothing was changed.',
);
assert.equal(
  errorOf(planPackageMove(pkg({ status: 'DONE' }), 'PANTRY', undefined, NOW)),
  'This one is already finished.',
);
assert.equal(
  errorOf(planPackageMove(pkg(), 'PANTRY', 5, NOW)),
  'Pick a day for the date.',
);
const afterMove = { ...pkg(), ...moved } as Package;
assert.deepEqual(
  fieldsOf(
    planUndoPackageMove(
      afterMove,
      NOW,
      { place: 'FRIDGE', expiresAt: dayOf(25) },
      NOW + 9,
    ),
  ),
  {
    place: 'FRIDGE',
    expiresAt: dayOf(25),
    history: pkg().history,
    updatedAt: NOW + 9,
  },
);
assert.equal(
  errorOf(
    planUndoPackageMove(
      { ...afterMove, place: 'PANTRY' },
      NOW,
      { place: 'PANTRY', expiresAt: dayOf(25) },
      NOW,
    ),
  ),
  'That has changed since, so it could not be undone.',
  'a package already back where it was is left alone',
);
assert.equal(
  errorOf(
    planUndoPackageMove(
      {
        ...afterMove,
        history: [
          ...afterMove.history,
          makePackageEvent('USED', NOW + 3, { amount: 0.1 }),
        ],
      },
      NOW,
      { place: 'FRIDGE', expiresAt: dayOf(25) },
      NOW,
    ),
  ),
  'That has changed since, so it could not be undone.',
  'a use after the move is never rewound',
);

// Editing writes only what changed, with one entry for it
const edited = fieldsOf(
  planPackageEdit(
    pkg({ amount: 2, unit: 'LB', expiresAt: dayOf(20) }),
    { amount: 1.5, expiresAt: dayOf(22) },
    NOW,
  ),
);
assert.deepEqual(
  [
    edited.amount,
    edited.expiresAt,
    'unit' in edited,
    'place' in edited,
    edited.history?.length,
    edited.history?.at(-1),
  ],
  [
    1.5,
    dayOf(22),
    false,
    false,
    2,
    {
      kind: 'EDITED',
      at: NOW,
      amount: null,
      place: null,
      note: 'Amount 2 lb → 1.5 lb · Use by Oct 20 → Oct 22',
    },
  ],
);
const editedClear = fieldsOf(
  planPackageEdit(pkg({ expiresAt: dayOf(20) }), { expiresAt: null }, NOW),
);
assert.equal(editedClear.expiresAt, null, 'clearing the date is a change');
const editedPlace = fieldsOf(
  planPackageEdit(pkg(), { place: 'PANTRY', amount: 2 }, NOW),
);
assert.deepEqual(
  editedPlace.history?.slice(-2).map((event) => event.kind),
  ['EDITED', 'MOVED'],
  'a place change is a move of its own',
);
const editedQuiet = fieldsOf(
  planPackageEdit(pkg(), { ingredientName: 'Whole milk' }, NOW),
);
assert.deepEqual(
  [editedQuiet.ingredientName, editedQuiet.history?.length],
  ['Whole milk', 1],
  'a refreshed name writes no entry',
);
assert.equal(
  errorOf(planPackageEdit(pkg(), { amount: 1, expiresAt: dayOf(25) }, NOW)),
  'Nothing was changed.',
);
assert.equal(
  errorOf(planPackageEdit(pkg(), { amount: 0 }, NOW)),
  'Say how much there is.',
);
assert.equal(
  errorOf(planPackageEdit(pkg(), { expiresAt: 3 }, NOW)),
  'Pick a day for the date.',
);
assert.equal(
  errorOf(planPackageEdit(pkg({ status: 'DONE' }), { amount: 2 }, NOW)),
  'This one is already finished.',
);

// The history stays within its cap and keeps how it came in and where it ended
const full = Array.from({ length: 10 }, (_, index) =>
  makePackageEvent(
    index === 0 ? 'ADDED' : index % 2 === 0 ? 'EDITED' : 'USED',
    1000 + index,
    { amount: index === 0 || index % 2 === 1 ? 1 : null },
  ),
);
const capped = appendPackageEvent(
  full,
  makePackageEvent('USED', 2000, { amount: 1 }),
);
assert.equal(capped.length, 10);
assert.deepEqual(
  [capped[0].kind, capped.at(-1)?.at],
  ['ADDED', 2000],
  'the first and the last always stay',
);
assert.equal(
  capped.some((event) => event.at === 1001),
  false,
  'the oldest use goes first',
);
const noUses = Array.from({ length: 10 }, (_, index) =>
  makePackageEvent(index === 0 ? 'ADDED' : 'EDITED', 1000 + index, {
    note: 'x',
  }),
);
const cappedEdits = appendPackageEvent(
  noUses,
  makePackageEvent('TOSSED', 2000, { amount: 1 }),
);
assert.equal(
  cappedEdits.some((event) => event.at === 1001),
  false,
  'with no use left the oldest edit goes',
);
const noneDroppable = [
  makePackageEvent('ADDED', 1, { amount: 1, place: 'FRIDGE' }),
  ...Array.from({ length: 9 }, (_, index) =>
    makePackageEvent('MOVED', 2 + index, { place: 'PANTRY' }),
  ),
];
const cappedMoves = appendPackageEvent(
  noneDroppable,
  makePackageEvent('MOVED', 99, { place: 'FRIDGE' }),
);
assert.deepEqual(
  [cappedMoves.length, cappedMoves[0].kind, cappedMoves[1].at],
  [10, 'ADDED', 3],
  'the second event goes when only moves are left',
);

// A bulk act re-reads and leaves alone what changed
const toss = { kind: 'TOSS' as const };
const bulk = planPackageBulk(
  [
    pkg({ id: 'a' }),
    null,
    pkg({ id: 'b', status: 'DONE' }),
    pkg({ id: 'c', place: 'PANTRY', amount: 2 }),
  ],
  toss,
  NOW,
);
assert.deepEqual(
  bulk.writes.map(({ id, fields }) => [
    id,
    fields.status,
    fields.history?.at(-1)?.kind,
    fields.history?.at(-1)?.amount,
  ]),
  [
    ['a', 'DONE', 'TOSSED', 1],
    ['c', 'DONE', 'TOSSED', 2],
  ],
);
assert.deepEqual(bulk.skipped, { ...NO_PACKAGE_SKIPS, GONE: 1, FINISHED: 1 });
const pastOnly = planPackageBulk(
  [
    pkg({ id: 'p', expiresAt: dayOf(15) }),
    pkg({ id: 'redated', expiresAt: dayOf(30) }),
    pkg({ id: 'nodate', expiresAt: null }),
    pkg({ id: 'today', expiresAt: dayOf(18) }),
  ],
  { kind: 'TOSS', isPastOnly: true },
  NOW,
);
assert.deepEqual(
  pastOnly.writes.map((write) => write.id),
  ['p'],
);
assert.deepEqual(
  pastOnly.skipped,
  { ...NO_PACKAGE_SKIPS, REDATED: 3 },
  'one re-dated since the tap, one with no date, one due today are left alone',
);
const useUp = planPackageBulk(
  [pkg({ id: 'u', amount: 0.4 })],
  { kind: 'USE_UP' },
  NOW,
);
assert.deepEqual(
  [
    useUp.writes[0].fields.status,
    useUp.writes[0].fields.history?.at(-1)?.kind,
    useUp.writes[0].fields.history?.at(-1)?.amount,
  ],
  ['DONE', 'USED', 0.4],
);
const bulkMove = planPackageBulk(
  [
    pkg({ id: 'f', place: 'FRIDGE', expiresAt: dayOf(20) }),
    pkg({ id: 'same', place: 'FREEZER' }),
    pkg({ id: 'g', place: 'PANTRY', expiresAt: null }),
  ],
  { kind: 'MOVE', to: 'FREEZER' },
  NOW,
);
assert.deepEqual(
  bulkMove.writes.map(({ id, fields, before }) => [
    id,
    fields.place,
    'expiresAt' in fields,
    before,
  ]),
  [
    ['f', 'FREEZER', false, { place: 'FRIDGE', expiresAt: dayOf(20) }],
    ['g', 'FREEZER', false, { place: 'PANTRY', expiresAt: null }],
  ],
  'a bulk move keeps every date and remembers where each came from',
);
assert.deepEqual(bulkMove.skipped, { ...NO_PACKAGE_SKIPS, SAME_PLACE: 1 });
assert.equal(getPackageSkippedText(NO_PACKAGE_SKIPS), null);
assert.equal(
  getPackageSkippedText({ GONE: 2, FINISHED: 1, REDATED: 3, SAME_PLACE: 1 }),
  'One was already finished, one was already there, 3 got a new date, and 2 were deleted.',
);
assert.equal(
  getPackageBulkToast({
    action: toss,
    requested: 4,
    changed: 4,
    skipped: NO_PACKAGE_SKIPS,
    names: 'Milk and Rice',
  }).title,
  'Tossed 4 packages',
);
assert.deepEqual(
  getPackageBulkToast({
    action: toss,
    requested: 4,
    changed: 3,
    skipped: { ...NO_PACKAGE_SKIPS, FINISHED: 1 },
    names: 'Milk',
  }),
  { title: 'Tossed 3 of 4 packages', description: 'One was already finished.' },
);
assert.deepEqual(
  getPackageBulkToast({
    action: { kind: 'MOVE', to: 'FREEZER' },
    requested: 1,
    changed: 1,
    skipped: NO_PACKAGE_SKIPS,
    names: 'Milk',
  }),
  { title: 'Moved 1 package to the freezer', description: 'Milk' },
);
assert.equal(
  getPackageBulkToast({
    action: { kind: 'USE_UP' },
    requested: 2,
    changed: 2,
    skipped: NO_PACKAGE_SKIPS,
    names: null,
  }).title,
  'Used up 2 packages',
);
const names = getPackageBulkNames(
  [
    pkg({ id: 'z', expiresAt: null }),
    pkg({ id: 'a', expiresAt: dayOf(15), unit: 'LB', amount: 2 }),
    pkg({ id: 'b', expiresAt: dayOf(16) }),
    pkg({ id: 'c', expiresAt: dayOf(17) }),
    pkg({ id: 'd', expiresAt: dayOf(18) }),
  ],
  (p) => `name-${p.id}`,
  NOW,
);
assert.deepEqual(
  names.lines.map((line) => line.title),
  ['name-a', 'name-b', 'name-c'],
  'a confirm names the soonest three',
);
assert.deepEqual(names.lines[0].details, ['2 lb', 'Use by Oct 15']);
assert.equal(names.more, 2);

// What cooking takes out of the pantry
const rice = (over: Partial<Package>) =>
  pkg({
    ingredientId: 'cat-rice',
    ingredientName: 'Rice',
    place: 'PANTRY',
    unit: 'CUP',
    ...over,
  });
const takeFrom = (
  packages: Package[],
  lines: { ingredientId: string; amount: number; unit: Package['unit'] }[],
) => planTakeOut(lines, packages, NOW);
const twoBags = [
  rice({ id: 'late-bag', amount: 4, expiresAt: dayOf(30) }),
  rice({ id: 'soon-bag', amount: 1.5, expiresAt: dayOf(20) }),
  rice({ id: 'nodate-bag', amount: 3, expiresAt: null }),
];
const oneCup = takeFrom(twoBags, [
  { ingredientId: 'cat-rice', amount: 1, unit: 'CUP' },
]);
assert.deepEqual(
  oneCup.takes.map((take) => [take.packageId, take.amount, take.isAll]),
  [['soon-bag', 1, false]],
  'it comes out of the package that expires first',
);
assert.deepEqual(oneCup.short, []);
const twoCups = takeFrom(twoBags, [
  { ingredientId: 'cat-rice', amount: 2, unit: 'CUP' },
]);
assert.deepEqual(
  twoCups.takes.map((take) => [take.packageId, take.amount, take.isAll]),
  [
    ['soon-bag', 1.5, true],
    ['late-bag', 0.5, false],
  ],
  'the first package is emptied and the next gives the rest, the one with no date last',
);
const sevenCups = takeFrom(twoBags, [
  { ingredientId: 'cat-rice', amount: 7, unit: 'CUP' },
]);
assert.deepEqual(
  sevenCups.takes.map((take) => [take.packageId, take.amount, take.isAll]),
  [
    ['soon-bag', 1.5, true],
    ['late-bag', 4, true],
    ['nodate-bag', 1.5, false],
  ],
  'a package with no date is still there to use once the dated ones are gone',
);
const tooMuch = takeFrom(twoBags, [
  { ingredientId: 'cat-rice', amount: 10, unit: 'CUP' },
]);
assert.deepEqual(
  [tooMuch.takes.map((take) => take.packageId), tooMuch.short],
  [
    ['soon-bag', 'late-bag', 'nodate-bag'],
    [{ ingredientId: 'cat-rice', amount: 1.5, unit: 'CUP' }],
  ],
  'what the packages cannot cover is said, and everything they have is taken',
);
const inGrams = takeFrom(
  [rice({ id: 'kg-bag', unit: 'KG', amount: 1 })],
  [{ ingredientId: 'cat-rice', amount: 250, unit: 'G' }],
);
assert.deepEqual(
  inGrams.takes.map((take) => [
    take.packageId,
    take.amount,
    take.unit,
    take.isAll,
  ]),
  [['kg-bag', 0.25, 'KG', false]],
  "a recipe in grams draws from a bag in kilos, in the bag's own unit",
);
const wholeBag = takeFrom(
  [rice({ id: 'kg-bag', unit: 'KG', amount: 1 })],
  [{ ingredientId: 'cat-rice', amount: 1000, unit: 'G' }],
);
assert.deepEqual(
  wholeBag.takes.map((take) => [take.amount, take.isAll]),
  [[1, true]],
);
const twoLines = takeFrom(
  [rice({ id: 'bag', amount: 5 })],
  [
    { ingredientId: 'cat-rice', amount: 1, unit: 'CUP' },
    { ingredientId: 'cat-rice', amount: 8, unit: 'TBSP' },
  ],
);
assert.deepEqual(
  twoLines.takes.map((take) => [take.amount, take.unit]),
  [[1.5, 'CUP']],
  'two lines of one kind are taken together',
);
assert.deepEqual(
  takeFrom(
    [rice({ id: 'bag', amount: 5 })],
    [{ ingredientId: 'cat-flour', amount: 1, unit: 'CUP' }],
  ),
  { takes: [], short: [] },
  'an ingredient with nothing in the pantry takes nothing and says nothing',
);
assert.deepEqual(
  takeFrom(
    [rice({ id: 'bag', unit: 'KG', amount: 1 })],
    [{ ingredientId: 'cat-rice', amount: 2, unit: 'CUP' }],
  ),
  { takes: [], short: [] },
  'a different kind is never converted, so nothing is taken',
);
assert.deepEqual(
  takeFrom(
    [rice({ id: 'old', amount: 5, expiresAt: dayOf(15) })],
    [{ ingredientId: 'cat-rice', amount: 1, unit: 'CUP' }],
  ),
  { takes: [], short: [] },
  'a package past its date is not cooked from',
);
assert.deepEqual(
  takeFrom(
    [rice({ id: 'done', amount: 5, status: 'DONE' })],
    [{ ingredientId: 'cat-rice', amount: 1, unit: 'CUP' }],
  ),
  { takes: [], short: [] },
  'a finished package gives nothing',
);
assert.deepEqual(
  takeFrom(
    [rice({ id: 'bag', amount: 5 }), pkg({ id: 'milk', amount: 1, unit: 'L' })],
    [
      { ingredientId: 'cat-rice', amount: 1, unit: 'CUP' },
      { ingredientId: 'cat-milk', amount: 250, unit: 'ML' },
    ],
  ).takes.map((take) => [take.packageId, take.amount, take.unit]),
  [
    ['bag', 1, 'CUP'],
    ['milk', 0.25, 'L'],
  ],
  'each ingredient draws from its own packages',
);
// A take planned here is exactly what use writes, and its Undo is the use's
const planned = oneCup.takes[0];
const soonBag = twoBags[1];
const afterTake = {
  ...soonBag,
  ...fieldsOf(planUse(soonBag, planned.amount, NOW)),
} as Package;
assert.equal(afterTake.amount, 0.5);
assert.equal(fieldsOf(planUndoEnd(afterTake, NOW, NOW + 1)).amount, 1.5);
assert.equal(
  errorOf(
    planUndoEnd(
      {
        ...afterTake,
        history: [
          ...afterTake.history,
          makePackageEvent('USED', NOW + 7, { amount: 0.1 }),
        ],
      },
      NOW,
      NOW + 9,
    ),
  ),
  'That has changed since, so it could not be undone.',
  'a take whose package was used again since is left as it is',
);

// How a recipe line stands against the pantry
const stock = [
  rice({ id: 'r1', amount: 1, expiresAt: dayOf(25) }),
  rice({ id: 'r2', amount: 1.5, expiresAt: null }),
  rice({ id: 'r-old', amount: 9, expiresAt: dayOf(10) }),
];
const cups = (amount: number, isConverted = false) => ({
  have: { unit: 'CUP', amount },
  isConverted,
});
assert.deepEqual(
  getLineStock({ amount: 2, unit: 'CUP' }, stock, NOW),
  { kind: 'HAVE', ...cups(2.5) },
  'a package past its date does not count toward having enough',
);
assert.deepEqual(getLineStock({ amount: 3, unit: 'CUP' }, stock, NOW), {
  kind: 'SOME',
  ...cups(2.5),
});
assert.deepEqual(
  getLineStock({ amount: 2.5, unit: 'CUP' }, stock, NOW).kind,
  'HAVE',
  'exactly enough is enough',
);
assert.deepEqual(
  getLineStock({ amount: 16, unit: 'TBSP' }, stock, NOW).kind,
  'HAVE',
  'tablespoons are measured against cups',
);
assert.deepEqual(
  getLineStock({ amount: 500, unit: 'G' }, stock, NOW),
  { kind: 'OTHER' },
  "a weight is never proven by cups without the ingredient's own numbers",
);
assert.deepEqual(
  getLineStock({ amount: null, unit: 'EACH' }, stock, NOW),
  { kind: 'HAVE', have: null, isConverted: false },
  'a line with no amount is met by having any',
);
assert.deepEqual(getLineStock({ amount: 1, unit: 'CUP' }, [stock[2]], NOW), {
  kind: 'PAST',
});
assert.deepEqual(
  getLineStock({ amount: null, unit: 'EACH' }, [stock[2]], NOW),
  { kind: 'PAST' },
  'only a past-date package is not having it, even for a pinch',
);
assert.deepEqual(getLineStock({ amount: 1, unit: 'CUP' }, undefined, NOW), {
  kind: 'NONE',
});
assert.deepEqual(getLineStock({ amount: 1, unit: 'CUP' }, [], NOW), {
  kind: 'NONE',
});
assert.deepEqual(
  getLineStock({ amount: 1, unit: 'CUP' }, [rice({ status: 'DONE' })], NOW),
  { kind: 'NONE' },
  'a finished package is not in the pantry',
);
assert.deepEqual(
  [
    { kind: 'HAVE', have: null, isConverted: false },
    { kind: 'SOME', ...cups(1.5) },
    { kind: 'SOME', ...cups(1.5, true) },
    { kind: 'OTHER' },
    { kind: 'PAST' },
    { kind: 'NONE' },
  ].map((stockState) => getLineStockText(stockState as never)),
  [
    'You have it',
    'You have 1½ cups',
    'You have about 1½ cups',
    'In your pantry',
    'Past its date',
    'Not in your pantry',
  ],
  'a pantry hint says an amount the way a cook does, not as a decimal',
);
assert.deepEqual(
  [
    formatKitchenTotal({ amount: 0.63, unit: 'CUP' }),
    formatKitchenTotal({ amount: 0.63, unit: 'CUP' }, true),
    formatKitchenTotal({ amount: 9, unit: 'EACH' }),
    formatKitchenTotal({ amount: 3, unit: 'LB' }, true),
  ],
  ['about ⅔ cup', 'about ⅔ cup', '9 each', 'about 3 lb'],
  '"about" is said once, and a bare count keeps its "each"',
);
assert.equal(
  getTakeAmountText({
    totals: [
      { amount: 2.5, unit: 'CUP' },
      { amount: 0.42, unit: 'LB' },
    ],
    isConverted: true,
  } as never),
  'about 2½ cups and about ½ lb',
  'what a cook takes out of the pantry reads in kitchen amounts too',
);

// The marks on a recipe's lines say only the exception, and the share once
const have: LineStock = { kind: 'HAVE', have: null, isConverted: false };
const none: LineStock = { kind: 'NONE' };
const past: LineStock = { kind: 'PAST' };
const some: LineStock = {
  kind: 'SOME',
  have: { unit: 'CUP', amount: 1 },
  isConverted: false,
};
const marks = (stocks: LineStock[]) =>
  getLineMarkers(stocks.map((stock, index) => ({ id: String(index), stock })));
const markedTexts = (stocks: LineStock[]) =>
  stocks.map((_, index) => marks(stocks).byId.get(String(index)));
assert.deepEqual(
  markedTexts([have, have, have, none]),
  [null, null, null, 'Not in your pantry'],
  'a list the pantry mostly covers flags the one it lacks',
);
assert.equal(marks([have, have, have, none]).summary, '3 of 4 in your pantry');
assert.deepEqual(
  markedTexts([have, none, none, none, none]),
  ['You have it', null, null, null, null],
  'a list it hardly touches flags the one it has, never "not in your pantry" down every row',
);
assert.deepEqual(
  markedTexts([have, none]),
  [null, 'Not in your pantry'],
  'half and half flags what is missing, the part that sends someone shopping',
);
assert.deepEqual(
  markedTexts([none, none, none]),
  [null, null, null],
  'a pantry with none of it says nothing',
);
assert.equal(marks([none, none, none]).summary, null);
assert.deepEqual(
  markedTexts([some, none, none, past]),
  ['You have 1 cup', null, null, 'Past its date'],
  'a package past its date is always said',
);
assert.deepEqual(
  markedTexts([have, have, past]),
  [null, null, 'Past its date'],
  'and it is not counted as in the pantry',
);

// Salt, oil and water are at home in most kitchens, so a pantry without them says nothing about them
const staple: LineStock = { kind: 'STAPLE' };
assert.deepEqual(
  markedTexts([have, have, none, staple, staple]),
  [null, null, 'Not in your pantry', null, null],
  'a staple is never flagged as missing, and the other lines still are',
);
assert.equal(
  marks([have, have, none, staple, staple]).summary,
  '2 of 3 in your pantry',
  'the share leaves the staples out: two of the three things worth looking for, not two of five',
);
assert.equal(
  marks([staple, staple]).summary,
  null,
  'a recipe of staples alone says nothing about the pantry',
);
assert.deepEqual(
  markedTexts([have, none, none, none, staple]),
  ['You have it', null, null, null, null],
  'a list the pantry hardly touches still flags the one it has, and the staple stays quiet',
);
const lineOf = (ingredientId: string) => ({
  ingredientId,
  amount: 1,
  unit: 'TBSP' as const,
});
const spice = { id: 'cat-salt', familyId: 'cat-fam-spices' };
assert.deepEqual(
  getLineStock(lineOf('cat-salt'), undefined, NOW, undefined, spice),
  { kind: 'STAPLE' },
  'an empty pantry lacks nothing of a spice',
);
assert.deepEqual(
  getLineStock(lineOf('cat-water'), [], NOW, undefined, {
    id: 'cat-water',
    familyId: 'cat-fam-drinks',
  }),
  { kind: 'STAPLE' },
  'water is a staple by name even though its family is not spices',
);
assert.deepEqual(
  getLineStock(lineOf('cat-rice'), undefined, NOW, undefined, {
    id: 'cat-rice',
    familyId: 'cat-fam-grains',
  }),
  { kind: 'NONE' },
  'rice is not a staple, so having none of it is said',
);
assert.deepEqual(
  getLineStock(lineOf('cat-salt'), undefined, NOW),
  { kind: 'NONE' },
  'without the ingredient there is no family to read, so nothing is assumed',
);
assert.equal(
  getLineStock(
    lineOf('cat-salt'),
    [rice({ amount: 1, unit: 'TBSP' })],
    NOW,
    undefined,
    spice,
  ).kind,
  'HAVE',
  'a staple that is in the pantry is counted like anything else',
);
assert.equal(marks([have, have, past]).summary, '2 of 3 in your pantry');
assert.deepEqual(markedTexts([]), []);
assert.equal(marks([]).summary, null);
assert.deepEqual(
  markedTexts([{ kind: 'OTHER' }, none, none]),
  ['In your pantry', null, null],
  'a line it can only compare by kind is in the pantry without a promise of enough',
);

// With the ingredient's own weight per cup a bag in pounds and a recipe in cups meet in grams
const GRAM_PER_ML = 0.8;
const conversions = () => ({ gramsPerMl: GRAM_PER_ML, gramsEach: null });
const bag = rice({ id: 'lb-bag', unit: 'LB', amount: 8, expiresAt: null });
const bridged = getLineStock(
  { amount: 2, unit: 'CUP' },
  [bag],
  NOW,
  conversions(),
);
assert.deepEqual(
  bridged.kind,
  'HAVE',
  'eight pounds of rice is more than two cups',
);
assert.equal(
  bridged.kind === 'HAVE' && bridged.isConverted,
  true,
  'and it says it measured them against each other',
);
assert.deepEqual(
  getLineStock({ amount: 2, unit: 'CUP' }, [bag]).kind,
  'OTHER',
  'without the numbers it does not guess',
);
const smallBag = rice({ id: 'small', unit: 'OZ', amount: 4, expiresAt: null });
const someBridged = getLineStock(
  { amount: 2, unit: 'CUP' },
  [smallBag],
  NOW,
  conversions(),
);
assert.deepEqual(
  someBridged.kind === 'SOME'
    ? [someBridged.have.unit, someBridged.have.amount, someBridged.isConverted]
    : null,
  ['CUP', 0.6, true],
  "four ounces is about 0.6 of a cup at 0.8 g per ml, said in the recipe's unit",
);
const eachBridged = getLineStock(
  { amount: 3, unit: 'EACH' },
  [
    pkg({
      id: 'g',
      ingredientId: 'cat-garlic',
      unit: 'OZ',
      amount: 4,
      place: 'PANTRY',
    }),
  ],
  NOW,
  { gramsPerMl: null, gramsEach: 5 },
);
assert.equal(
  eachBridged.kind,
  'HAVE',
  'four ounces of garlic is more than three cloves of 5 g',
);
const takeBridged = planTakeOut(
  [{ ingredientId: 'cat-rice', amount: 1, unit: 'CUP' }],
  [bag],
  NOW,
  conversions,
);
assert.deepEqual(
  takeBridged.takes.map((take) => [
    take.packageId,
    take.amount,
    take.unit,
    take.isAll,
    take.isConverted,
  ]),
  [['lb-bag', 0.42, 'LB', false, true]],
  'a cup of rice comes out of a pound bag as about 0.42 lb, and says it was converted',
);
assert.deepEqual(
  planTakeOut(
    [{ ingredientId: 'cat-rice', amount: 1, unit: 'CUP' }],
    [bag],
    NOW,
  ).takes,
  [],
  'with no numbers for the ingredient nothing is taken',
);
const bothKinds = planTakeOut(
  [{ ingredientId: 'cat-rice', amount: 4, unit: 'CUP' }],
  [
    rice({ id: 'jar', unit: 'CUP', amount: 1, expiresAt: dayOf(20) }),
    rice({ id: 'lb-bag', unit: 'LB', amount: 8, expiresAt: dayOf(30) }),
  ],
  NOW,
  conversions,
);
assert.deepEqual(
  bothKinds.takes.map((take) => [
    take.packageId,
    take.amount,
    take.unit,
    take.isAll,
    take.isConverted,
  ]),
  [
    ['jar', 1, 'CUP', true, false],
    ['lb-bag', 1.25, 'LB', false, true],
  ],
  'a jar in cups and a bag in pounds are drawn from together, starting with the one that expires first',
);
const shortBridged = planTakeOut(
  [{ ingredientId: 'cat-rice', amount: 4, unit: 'CUP' }],
  [smallBag],
  NOW,
  conversions,
);
assert.deepEqual(
  [
    shortBridged.takes.map((take) => [take.amount, take.isAll]),
    shortBridged.short,
  ],
  [[[4, true]], [{ ingredientId: 'cat-rice', amount: 3.4, unit: 'CUP' }]],
  "what four ounces cannot cover is said in the recipe's own unit",
);

const milkCarton = (amount: number, over: Partial<Package> = {}) =>
  pkg({ id: 'carton', unit: 'L', amount, place: 'FRIDGE', ...over });
const cupsOfMilk = (cups: number, packages: Package[]) =>
  planTakeOut(
    [{ ingredientId: 'cat-milk', amount: cups, unit: 'CUP' }],
    packages,
    NOW,
  );
const twoCupsFromCarton = cupsOfMilk(2, [milkCarton(1)]);
assert.deepEqual(
  [
    twoCupsFromCarton.takes.map((take) => [take.amount, take.unit, take.isAll]),
    twoCupsFromCarton.short,
  ],
  [[[0.47, 'L', false]], []],
  "two cups from a one-litre carton takes 0.47 l and reports no shortfall: what the carton's own two figures round away is not a shortage",
);
assert.deepEqual(
  cupsOfMilk(2, [milkCarton(4)]).short,
  [],
  'a bigger carton says the same',
);
assert.deepEqual(
  cupsOfMilk(2, [
    milkCarton(0.3, { id: 'soon', expiresAt: dayOf(20) }),
    milkCarton(1, { id: 'later', expiresAt: dayOf(30) }),
  ]).short,
  [],
  'a second package that rounds the rest down is not a shortage either',
);
assert.deepEqual(
  planTakeOut(
    [{ ingredientId: 'cat-milk', amount: 2, unit: 'CUP' }],
    [milkCarton(1)],
    NOW,
    () => ({ gramsPerMl: 1.03, gramsEach: null }),
  ).short,
  [],
  'it holds when the cup and the litre meet in grams',
);
const eightCups = cupsOfMilk(8, [milkCarton(1.53)]);
assert.deepEqual(
  [eightCups.takes.map((take) => [take.amount, take.isAll]), eightCups.short],
  [[[1.53, true]], [{ ingredientId: 'cat-milk', amount: 1.53, unit: 'CUP' }]],
  'a real shortfall (eight cups against 1.53 l) is still said, in the recipe unit',
);

// What a new package of an ingredient starts from
const seedMilk = (over: Partial<Package>) =>
  pkg({ ingredientId: 'cat-milk', place: 'FRIDGE', unit: 'L', ...over });
assert.equal(
  getPackageSeed([], 'cat-milk'),
  null,
  'with none in stock there is no seed',
);
assert.equal(
  getPackageSeed([seedMilk({ ingredientId: 'cat-rice' })], 'cat-milk'),
  null,
  'another ingredient is not a seed',
);
assert.deepEqual(
  getPackageSeed(
    [
      seedMilk({ id: 'old', amount: 2, unit: 'L', createdAt: 100 }),
      seedMilk({
        id: 'new',
        amount: 500,
        unit: 'ML',
        place: 'FREEZER',
        productId: 'p-small',
        createdAt: 900,
        history: [
          makePackageEvent('ADDED', 900, { amount: 500, place: 'FREEZER' }),
        ],
      }),
    ],
    'cat-milk',
  ),
  { amount: 500, unit: 'ML', place: 'FREEZER', productId: 'p-small' },
  'the newest package by when it was added, not by its date',
);
const opened = seedMilk({
  amount: 0.4,
  history: [
    makePackageEvent('ADDED', 1, { amount: 1, place: 'FRIDGE' }),
    makePackageEvent('USED', 2, { amount: 0.6 }),
  ],
});
assert.equal(
  getPackageSeed([opened], 'cat-milk')?.amount,
  1,
  'an opened carton seeds what it was bought as, not what is left',
);
assert.equal(
  getPackageSeed(
    [
      {
        ...opened,
        history: [
          ...opened.history,
          makePackageEvent('EDITED', 3, { note: 'Unit ml → l' }),
        ],
      },
    ],
    'cat-milk',
  )?.amount,
  0.4,
  'one edited since falls back to what is left, since its first amount may be in another unit',
);

// The recipes type is only here so a drift in the shape is a compile error
const recipe: Pick<Recipe, 'id'> = { id: 'r' };
assert.equal(recipe.id, 'r');

console.log('pinch pantry checks passed');
