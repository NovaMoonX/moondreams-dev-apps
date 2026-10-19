import assert from 'node:assert/strict';

import { toggleIds } from '../../src/hooks/useSelection.ts';
import type { Container, RecipeCare } from '../../src/apps/pinch/types.ts';
import {
  NO_SKIPS,
  getBulkNames,
  getBulkToast,
  getLandingPlace,
  getNamesLine,
  getPastDueBoxes,
  getPastDueSplitText,
  getPastDueText,
  getPlacedTitle,
  getSelectionNote,
  getSelectionPrimary,
  getSelectionTitle,
  getSharedPlace,
  getSkippedText,
  getTossAction,
  getTossConfirmNote,
  getTossConfirmTitle,
  groupBatches,
  makeEvent,
  planBulk,
  planClearOut,
  planUndoEnd,
  planUndoMove,
  type BulkAction,
  type ContainerPlan,
} from '../../src/apps/pinch/utils/containers.ts';

const DAY = 86_400_000;
const dayOf = (day: number) => Date.UTC(2026, 9, day);
const NOON_ON_THE_18TH = new Date(2026, 9, 18, 12).getTime();

const container = (over: Partial<Container> = {}): Container => ({
  id: 'c1',
  title: 'Adobo chicken',
  recipeId: 'adobo',
  mealId: null,
  cookId: null,
  servings: 4,
  status: 'IN_STOCK',
  place: 'FRIDGE',
  eatBy: dayOf(25),
  history: [makeEvent('FRIDGE', 1000, { servings: 4, place: 'FRIDGE' })],
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});
const fieldsOf = (plan: ContainerPlan) => {
  assert.ok('fields' in plan, 'expected a change, got an error');
  return plan.fields;
};
const careOf = (
  fridgeDays: number | null,
  freezerDays: number | null,
): RecipeCare => ({ fridgeDays, freezerDays, reheat: null, tip: null });

const NOW = NOON_ON_THE_18TH;
const toss: BulkAction = { kind: 'TOSS', from: 'FRIDGE' };

// What a bulk act writes, and why it leaves a box alone
const mixed = planBulk(
  [
    container({ id: 'a' }),
    null,
    container({ id: 'b', status: 'DONE' }),
    container({ id: 'c', place: 'FREEZER' }),
    container({ id: 'd', servings: 2 }),
  ],
  toss,
  NOW,
);
assert.deepEqual(
  mixed.writes.map(({ id, fields }) => [
    id,
    fields.status,
    fields.history?.at(-1)?.kind,
    fields.history?.at(-1)?.servings,
  ]),
  [
    ['a', 'DONE', 'TOSS', 4],
    ['d', 'DONE', 'TOSS', 2],
  ],
  'a toss ends only the boxes still in stock in the place the screen showed, each with its own servings',
);
assert.deepEqual(
  mixed.skipped,
  { GONE: 1, FINISHED: 1, MOVED: 1, REDATED: 0 },
  'what a toss left alone is counted by why: gone, finished, in the other place',
);
assert.deepEqual(
  planBulk([container({ status: 'DONE', place: 'FREEZER' })], toss, NOW)
    .skipped,
  { GONE: 0, FINISHED: 1, MOVED: 0, REDATED: 0 },
  'a finished box is counted as finished even when it is also in the other place',
);
assert.deepEqual(
  planBulk([container()], { kind: 'EAT', from: 'FRIDGE' }, NOW).writes.map(
    ({ fields }) => [
      fields.status,
      fields.history?.at(-1)?.kind,
      fields.history?.at(-1)?.servings,
    ],
  ),
  [['DONE', 'EAT', 4]],
  'ate it all eats every serving left, so the box is finished with an EAT of all of them',
);
assert.deepEqual(
  planBulk(
    [container({ servings: 2 })],
    { kind: 'CLEAR', from: 'FRIDGE' },
    NOW,
  ).writes.map(({ fields }) => fields.history?.at(-1)?.kind),
  ['CLEAR'],
  'a clear-out is the same plan with a CLEAR event',
);
assert.deepEqual(
  planClearOut(
    [container({ id: 'a' }), container({ id: 'c', place: 'FREEZER' })],
    'FRIDGE',
    NOW,
  ).map(({ id }) => id),
  ['a'],
  'planClearOut still returns only the ids and fields the clear-out writes',
);
assert.deepEqual(
  planBulk([], toss, NOW),
  { writes: [], skipped: NO_SKIPS },
  'nothing selected writes nothing and skips nothing',
);

// Past its date: a box re-dated since the tap is no longer past due and stays
const pastOnly: BulkAction = { ...toss, isPastOnly: true };
const pastResult = planBulk(
  [
    container({ id: 'old', eatBy: dayOf(15) }),
    container({ id: 'today', eatBy: dayOf(18) }),
    container({ id: 'redated', eatBy: dayOf(25) }),
  ],
  pastOnly,
  NOW,
);
assert.deepEqual(
  [pastResult.writes.map(({ id }) => id), pastResult.skipped],
  [['old'], { GONE: 0, FINISHED: 0, MOVED: 0, REDATED: 2 }],
  'a toss of what was past its date leaves a box alone once its date is today or later',
);
assert.equal(
  planBulk([container({ id: 'x', eatBy: dayOf(25) })], toss, NOW).writes.length,
  1,
  'without the past-its-date guard a future box is tossed (the selection toss)',
);

// A bulk move
const care = { adobo: careOf(3, 60) };
const toFreezer = planBulk(
  [
    container({ id: 'a' }),
    container({ id: 'b', recipeId: null, title: 'Soup', eatBy: dayOf(19) }),
    container({ id: 'late', eatBy: dayOf(12) }),
  ],
  { kind: 'MOVE', from: 'FRIDGE', cares: care },
  NOW,
);
assert.deepEqual(
  toFreezer.writes.map(({ id, fields }) => [id, fields.place, fields.eatBy]),
  [
    ['a', 'FREEZER', dayOf(18) + 60 * DAY],
    ['b', 'FREEZER', dayOf(18) + 90 * DAY],
    ['late', 'FREEZER', dayOf(12)],
  ],
  'each box is frozen for its recipe care, a named default without a recipe, and a past date stays past',
);
assert.deepEqual(
  toFreezer.writes.map(({ fields }) => fields.history?.at(-1)?.kind),
  ['FREEZE', 'FREEZE', 'FREEZE'],
  'a move writes one FREEZE event per box, so each box keeps its own history',
);
assert.deepEqual(
  toFreezer.writes.map(({ before }) => before),
  [
    { place: 'FRIDGE', eatBy: dayOf(25) },
    { place: 'FRIDGE', eatBy: dayOf(19) },
    { place: 'FRIDGE', eatBy: dayOf(12) },
  ],
  'a move remembers where each box was and its date, for the Undo',
);
const thawed = planBulk(
  [
    container({ id: 'a', place: 'FREEZER', eatBy: dayOf(30) }),
    container({ id: 'b', place: 'FREEZER', eatBy: dayOf(19) }),
  ],
  { kind: 'MOVE', from: 'FREEZER', cares: { adobo: careOf(1, null) } },
  NOW,
);
assert.deepEqual(
  thawed.writes.map(({ id, fields }) => [
    id,
    fields.place,
    fields.eatBy,
    fields.history?.at(-1)?.kind,
  ]),
  [
    ['a', 'FRIDGE', dayOf(19), 'THAW'],
    ['b', 'FRIDGE', dayOf(19), 'THAW'],
  ],
  'a thaw takes the shorter of the recipe time and the date the box already had, never later',
);
assert.equal(
  planBulk(
    [container({ id: 'a', place: 'FREEZER' })],
    { kind: 'MOVE', from: 'FRIDGE' },
    NOW,
  ).skipped.MOVED,
  1,
  'a move of boxes already in the place they would go is left alone',
);

// Undo: only what is still as the act left it
const tossedA = planBulk([container({ id: 'a' })], toss, 5000).writes[0];
const afterToss = container({
  id: 'a',
  status: 'DONE',
  history: tossedA.fields.history ?? [],
  updatedAt: 5000,
});
assert.deepEqual(
  [
    fieldsOf(planUndoEnd(afterToss, 5000, 9000)).status,
    fieldsOf(planUndoEnd(afterToss, 5000, 9000)).servings,
  ],
  ['IN_STOCK', 4],
  'undoing a toss puts the box back with its servings',
);
const movedA = planBulk(
  [container({ id: 'a' })],
  { kind: 'MOVE', from: 'FRIDGE', cares: care },
  NOW,
).writes[0];
const afterMove = container({
  id: 'a',
  place: 'FREEZER',
  eatBy: movedA.fields.eatBy,
  history: movedA.fields.history ?? [],
  updatedAt: NOW,
});
const undone = fieldsOf(
  planUndoMove(afterMove, NOW, movedA.before ?? assert.fail(), 9000),
);
assert.deepEqual(
  [undone.place, undone.eatBy, undone.history?.length],
  ['FRIDGE', dayOf(25), 1],
  'undoing a move puts the box back in its place with its old date and drops the move',
);
const changedSince = (kind: 'EAT' | 'EDIT') =>
  container({
    id: 'a',
    place: 'FREEZER',
    eatBy: movedA.fields.eatBy,
    history: [
      ...(movedA.fields.history ?? []),
      makeEvent(kind, NOW + 1000, { servings: 1 }),
    ],
  });
assert.deepEqual(
  (['EAT', 'EDIT'] as const).map(
    (kind) =>
      'error' in
      planUndoMove(
        changedSince(kind),
        5000,
        movedA.before ?? assert.fail(),
        9000,
      ),
  ),
  [true, true],
  'a move that an eat or a new date followed is not undone',
);
assert.ok(
  'error' in
    planUndoMove(
      { ...afterMove, status: 'DONE' },
      NOW,
      movedA.before ?? assert.fail(),
      9000,
    ),
  'a box finished since the move is not moved back',
);
assert.ok(
  'error' in
    planUndoMove(afterMove, NOW - 1, movedA.before ?? assert.fail(), 9000),
  'an undo for another move does nothing',
);
assert.ok(
  'error' in
    planUndoMove(
      { ...afterMove, place: 'FRIDGE' },
      NOW,
      movedA.before ?? assert.fail(),
      9000,
    ),
  'a box already back where it was is left as it is',
);
const entries = [
  { id: 'a', at: 5000 },
  { id: 'b', at: 5000 },
];
const boxes = new Map([
  ['a', afterToss],
  [
    'b',
    container({
      id: 'b',
      status: 'DONE',
      history: [
        ...(tossedA.fields.history ?? []),
        makeEvent('FRIDGE', 7000, { servings: 4, place: 'FRIDGE' }),
      ],
      updatedAt: 7000,
    }),
  ],
]);
assert.deepEqual(
  entries.map(
    ({ id, at }) =>
      'fields' in planUndoEnd(boxes.get(id) ?? assert.fail(), at, 9000),
  ),
  [true, false],
  'an Undo of a batch puts back the box still as the toss left it and skips the one that changed after',
);

// What the screen says
const past = container({ id: 'p', eatBy: dayOf(17) });
const dueTomorrow = container({ id: 'q', eatBy: dayOf(19) });
const dueToday = container({ id: 'r', eatBy: dayOf(18) });
const finishedPast = container({ id: 's', eatBy: dayOf(10), status: 'DONE' });
assert.deepEqual(
  getPastDueBoxes([past, dueTomorrow, dueToday, finishedPast], NOW).map(
    ({ id }) => id,
  ),
  ['p'],
  'past its date means before today: due today or tomorrow and finished boxes are not counted',
);
assert.deepEqual(
  [getPastDueText(1), getPastDueText(3), getTossAction(1), getTossAction(3)],
  ['1 is past its date', '3 are past their date', 'Toss it', 'Toss them'],
);
const inFridge = (id: string) => container({ id, place: 'FRIDGE' });
const inFreezer = (id: string) => container({ id, place: 'FREEZER' });
assert.deepEqual(
  [
    getPastDueSplitText([inFridge('a'), inFridge('b')], 'FRIDGE'),
    getPastDueSplitText(
      [inFridge('a'), inFridge('b'), inFreezer('c')],
      'FRIDGE',
    ),
    getPastDueSplitText(
      [inFridge('a'), inFreezer('b'), inFreezer('c')],
      'FREEZER',
    ),
    getPastDueSplitText([inFreezer('a')], 'FRIDGE'),
    getPastDueSplitText([inFridge('a'), inFridge('b')], 'FREEZER'),
  ],
  [
    null,
    '2 here, 1 in the freezer',
    '2 here, 1 in the fridge',
    'In the freezer',
    'All in the fridge',
  ],
  'the past-date row names where they are when the list shows one place, and says nothing when they are all here',
);
assert.deepEqual(
  [
    getSelectionPrimary([], NOON_ON_THE_18TH),
    getSelectionPrimary([container({ eatBy: dayOf(15) })], NOON_ON_THE_18TH),
    getSelectionPrimary(
      [container({ eatBy: dayOf(15) }), container({ eatBy: dayOf(14) })],
      NOON_ON_THE_18TH,
    ),
    getSelectionPrimary(
      [container({ eatBy: dayOf(15) }), container({ eatBy: dayOf(22) })],
      NOON_ON_THE_18TH,
    ),
    getSelectionPrimary([container({ eatBy: dayOf(18) })], NOON_ON_THE_18TH),
  ],
  ['EAT', 'TOSS', 'TOSS', 'EAT', 'EAT'],
  'Toss is the filled act only when every ticked box is past its date: nothing ticked, a mix, or one due today keeps Ate it all',
);
assert.deepEqual(
  [getSelectionTitle(0), getSelectionTitle(1), getSelectionTitle(12)],
  ['Select boxes', '1 selected', '12 selected'],
);
assert.deepEqual(
  [getSelectionNote(0), getSelectionNote(2)],
  ['Tap the boxes you want to act on.', null],
  'the footer says why its actions are off only while nothing is ticked',
);
assert.deepEqual(
  [getTossConfirmTitle(1), getTossConfirmTitle(5)],
  ['Toss 1 box?', 'Toss 5 boxes?'],
);
assert.match(
  getTossConfirmNote(3),
  /^They stay in What you finished as tossed\./,
);

const titleOf = (box: Container) => box.title;
const sixRows = ['A', 'B', 'C', 'D', 'E', 'F'].map((title, index) =>
  container({
    id: `row${index}`,
    title,
    eatBy: dayOf(10 + index),
    servings: 2,
    createdAt: 2000 + index,
  }),
);
const names = getBulkNames(groupBatches([...sixRows].reverse()), titleOf, NOW);
assert.deepEqual(
  names.lines,
  [
    { title: 'A', details: ['2 servings', 'Eat by Oct 10'] },
    { title: 'B', details: ['2 servings', 'Eat by Oct 11'] },
    { title: 'C', details: ['2 servings', 'Eat by Oct 12'] },
  ],
  'a confirm names three rows, soonest date first, each with its servings and the day it was due',
);
assert.equal(names.more, 3, 'the rest are counted in boxes');
const batch = ['x', 'y', 'z'].map((id) =>
  container({
    id,
    title: 'Rice',
    servings: 2,
    eatBy: dayOf(12),
    createdAt: 3000,
  }),
);
const batchNames = getBulkNames(groupBatches(batch), titleOf, NOW);
assert.deepEqual(
  [batchNames.lines, batchNames.more],
  [[{ title: 'Rice', details: ['3 boxes of 2 servings', 'Eat by Oct 12'] }], 0],
  'boxes put away together are one line that says how many boxes it is',
);
assert.deepEqual(
  [
    getNamesLine(['A']),
    getNamesLine(['A', 'B', 'A']),
    getNamesLine(['A', 'B', 'C', 'D', 'E']),
    getNamesLine([]),
  ],
  ['A', 'A and B', 'A, B, C and 2 more', null],
  'names are distinct and capped at three',
);
assert.equal(getSkippedText(NO_SKIPS), null);
assert.equal(
  getSkippedText({ ...NO_SKIPS, FINISHED: 1 }),
  'One was already finished.',
);
assert.equal(
  getSkippedText({ GONE: 1, FINISHED: 2, MOVED: 0, REDATED: 1 }),
  '2 were already finished, one got a new date, and one was deleted.',
);

const bulkToast = (
  action: BulkAction,
  requested: number,
  changed: number,
  extra: Partial<Parameters<typeof getBulkToast>[0]> = {},
) =>
  getBulkToast({
    action,
    requested,
    changed,
    skipped: NO_SKIPS,
    eatBys: [],
    names: null,
    now: NOW,
    ...extra,
  });
assert.deepEqual(bulkToast(toss, 5, 5, { names: 'A, B and 3 more' }), {
  title: 'Tossed 5 boxes',
  description: 'A, B and 3 more',
});
assert.deepEqual(
  bulkToast(toss, 5, 4, { skipped: { ...NO_SKIPS, FINISHED: 1 } }),
  { title: 'Tossed 4 of 5 boxes', description: 'One was already finished.' },
  'a partial result says how many it really did and why it left one',
);
assert.deepEqual(bulkToast({ kind: 'EAT', from: 'FRIDGE' }, 1, 1), {
  title: 'Ate 1 box',
  description: undefined,
});
assert.deepEqual(
  bulkToast({ kind: 'MOVE', from: 'FRIDGE' }, 3, 3, {
    eatBys: [dayOf(19), dayOf(19)],
  }),
  { title: 'Put 3 boxes in the freezer', description: 'Eat by tomorrow' },
);
assert.deepEqual(
  bulkToast({ kind: 'MOVE', from: 'FREEZER' }, 2, 2, {
    eatBys: [dayOf(19), dayOf(28)],
  }),
  {
    title: 'Thawed 2 boxes in the fridge',
    description: 'Eat by dates run from tomorrow to Oct 28',
  },
);
assert.deepEqual(
  bulkToast({ kind: 'CLEAR', from: 'FRIDGE' }, 9, 7),
  { title: 'Cleared out the fridge', description: '7 boxes' },
  'the clear-out toast keeps its own words and the count it really cleared',
);

// The pick-several mode
const given = (ids: string[], current: string[]) =>
  [...toggleIds(new Set(current), ids)].sort();
assert.deepEqual(
  given(['a', 'b'], ['c']),
  ['a', 'b', 'c'],
  'a row ticks all its boxes',
);
assert.deepEqual(
  given(['a', 'b'], ['a', 'b', 'c']),
  ['c'],
  'a row with every box ticked unticks them all and leaves the rest',
);
assert.deepEqual(
  given(['a', 'b'], ['a']),
  ['a', 'b'],
  'a row with only some boxes ticked ticks the rest',
);
assert.deepEqual(given([], ['a']), ['a'], 'ticking nothing changes nothing');

// One list, two places: the past-its-date row, the landing place and the acts over both
const alexBoxes = [
  container({ id: 'soup1', title: 'Pumpkin soup', eatBy: dayOf(15) }),
  container({ id: 'soup2', title: 'Pumpkin soup', eatBy: dayOf(15) }),
  container({ id: 'chili', title: 'Turkey chili', eatBy: dayOf(18) }),
  container({ id: 'rice', title: 'Rice', eatBy: dayOf(22) }),
  container({
    id: 'stock',
    title: 'Chicken stock',
    place: 'FREEZER',
    eatBy: dayOf(10),
  }),
  container({
    id: 'curry',
    title: 'Curry',
    place: 'FREEZER',
    eatBy: dayOf(19),
  }),
  container({
    id: 'later',
    title: 'Beans',
    place: 'FREEZER',
    eatBy: dayOf(60),
  }),
];
assert.deepEqual(
  getPastDueBoxes(alexBoxes, NOW).map(({ id }) => id),
  ['soup1', 'soup2', 'stock'],
  'the past-its-date row counts both places, so it says what the Kitchen tile says',
);
assert.equal(
  getLandingPlace(alexBoxes, NOW),
  'FRIDGE',
  'the screen opens on the fridge: it holds three boxes that want a look (two past, one due today) against two in the freezer, even though the freezer holds the oldest date',
);
assert.equal(
  getLandingPlace(
    [
      container({ id: 'a', eatBy: dayOf(10) }),
      container({ id: 'b', place: 'FREEZER', eatBy: dayOf(18) }),
      container({ id: 'c', place: 'FREEZER', eatBy: dayOf(19) }),
    ],
    NOW,
  ),
  'FREEZER',
  'the place with more boxes that want a look wins over one old box',
);
assert.equal(
  getLandingPlace(
    [
      container({ id: 'a', eatBy: dayOf(19) }),
      container({ id: 'b', place: 'FREEZER', eatBy: dayOf(10) }),
    ],
    NOW,
  ),
  'FREEZER',
  'a tie in boxes that want a look goes to the place with more past their date',
);
assert.equal(
  getLandingPlace(
    [
      container({ id: 'a', eatBy: dayOf(40) }),
      container({ id: 'b', place: 'FREEZER', eatBy: dayOf(90) }),
      container({
        id: 'c',
        place: 'FREEZER',
        eatBy: dayOf(5),
        status: 'DONE',
      }),
    ],
    NOW,
  ),
  'FRIDGE',
  'with nothing wanting a look (a finished box is not counted) it opens on the fridge',
);
assert.equal(getLandingPlace([], NOW), 'FRIDGE');

const jamieBoxes = [
  ...['a', 'b', 'c'].map((id) =>
    container({ id, title: `Soup ${id}`, eatBy: dayOf(12) }),
  ),
  container({ id: 'd', title: 'Stock', place: 'FREEZER', eatBy: dayOf(11) }),
  container({ id: 'e', title: 'Curry', place: 'FREEZER', eatBy: dayOf(80) }),
];
assert.deepEqual(
  [
    getPastDueBoxes(jamieBoxes, NOW).length,
    getPastDueBoxes(
      jamieBoxes.filter(({ place }) => place === 'FREEZER'),
      NOW,
    ).length,
    getPastDueBoxes(
      jamieBoxes.filter(({ place }) => place === 'FRIDGE'),
      NOW,
    ).length,
    getLandingPlace(jamieBoxes, NOW),
  ],
  [4, 1, 3, 'FRIDGE'],
  'four past their date, one in the freezer and three in the fridge: the row says four and the screen opens on the fridge',
);

const bothPlaces = planBulk(
  jamieBoxes.slice(0, 4),
  { kind: 'TOSS', from: 'FRIDGE', isPastOnly: true, isEitherPlace: true },
  NOW,
);
assert.deepEqual(
  [bothPlaces.writes.map(({ id }) => id), bothPlaces.skipped.MOVED],
  [['a', 'b', 'c', 'd'], 0],
  'a toss of the past-its-date boxes reaches the freezer one as well',
);
assert.deepEqual(
  planBulk(jamieBoxes.slice(0, 4), { ...toss, isPastOnly: true }, NOW).skipped,
  { GONE: 0, FINISHED: 0, MOVED: 1, REDATED: 0 },
  'without the either-place flag a box in the other place is still left alone',
);
assert.equal(
  planBulk(
    [container({ id: 'f', place: 'FREEZER' })],
    { kind: 'MOVE', from: 'FRIDGE', isEitherPlace: true },
    NOW,
  ).writes.length,
  0,
  'a move never takes the flag: a box already in the place it would go to is left alone',
);

assert.equal(getSharedPlace([]), null);
assert.equal(
  getSharedPlace([{ place: 'FRIDGE' }, { place: 'FRIDGE' }]),
  'FRIDGE',
);
assert.equal(
  getSharedPlace([{ place: 'FRIDGE' }, { place: 'FREEZER' }]),
  null,
  'boxes in both places share none, so a move is not offered',
);
assert.equal(
  getPlacedTitle('Chicken stock', 'FREEZER'),
  'Chicken stock · freezer',
);
assert.deepEqual(
  [
    getSelectionNote(3, { fridge: 2, freezer: 1 }),
    getSelectionNote(3, { fridge: 3, freezer: 0 }),
    getSelectionNote(0, { fridge: 0, freezer: 0 }),
  ],
  [
    '2 in the fridge, 1 in the freezer. Moving needs one place.',
    null,
    'Tap the boxes you want to act on.',
  ],
  'the footer says where the ticks are only when they are in both places',
);

assert.deepEqual(
  [
    getSelectionPrimary(0, 0),
    getSelectionPrimary(3, 3),
    getSelectionPrimary(3, 2),
    getSelectionPrimary(3, 0),
    getSelectionPrimary(1, 1),
  ],
  ['USE', 'TOSS', 'USE', 'USE', 'TOSS'],
  'tossing leads only while something is ticked and every ticked row is past its date',
);

console.log('pinchFridge: all checks passed');
