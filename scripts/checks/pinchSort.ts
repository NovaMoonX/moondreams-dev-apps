import assert from 'node:assert/strict';

import {
  CATEGORY_FILTER_ANY,
  CATEGORY_FILTER_NONE,
  DISH_CATEGORIES,
  LIST_SORT_OPTIONS,
  LIST_SORT_ORDER_LABELS,
} from '../../src/apps/pinch/constants.ts';
import {
  filterByCategory,
  getCategories,
  getCategoryCounts,
  getCategoryFilterOptions,
  getCategoryLabels,
} from '../../src/apps/pinch/utils/categories.ts';
import {
  DEFAULT_LIST_SORT,
  sortList,
  type ListSort,
} from '../../src/apps/pinch/utils/listSort.ts';

interface Row {
  id: string;
  title: string;
  createdAt: number;
  updatedAt?: number | null;
}

const row = (
  id: string,
  title: string,
  createdAt: number,
  updatedAt?: number | null,
): Row => ({
  id,
  title,
  createdAt,
  ...(updatedAt === undefined ? {} : { updatedAt }),
});
const ids = (rows: readonly Row[]) => rows.map((entry) => entry.id);
const by = (key: ListSort['key'], order: ListSort['order'] = 'natural') =>
  ({ key, order }) satisfies ListSort;
const name = (entry: Row) => entry.title;

const rows = [
  row('a', 'banana bread', 300, 900),
  row('b', 'Apple pie', 100, 200),
  row('c', 'Éclair', 200),
  row('d', 'eclair', 200, null),
  row('e', 'Recipe 10', 500, 500),
  row('f', 'Recipe 2', 400, 1000),
];
const original = ids(rows);

assert.deepEqual(
  ids(sortList(rows, DEFAULT_LIST_SORT, name)),
  original,
  'the default keeps the order it was given, which is where stars-first lives',
);
assert.deepEqual(
  ids(sortList(rows, by('default', 'reversed'), name)),
  original,
  'the default has no direction, so a stale reversed order changes nothing',
);
assert.deepEqual(ids(rows), original, 'sorting never reorders its input');

assert.deepEqual(
  ids(sortList(rows, by('alpha'), name)),
  ['b', 'a', 'c', 'd', 'f', 'e'],
  'A to Z ignores case and accents, keeps equal names in the order they came in, and reads numbers as numbers (2 before 10)',
);
assert.deepEqual(
  ids(sortList(rows, by('alpha', 'reversed'), name)),
  ['e', 'f', 'c', 'd', 'a', 'b'],
  'Z to A flips the comparison, not the list, so equal names still keep their original order',
);

assert.deepEqual(
  ids(sortList(rows, by('created'), name)),
  ['e', 'f', 'a', 'c', 'd', 'b'],
  'newest first, equal times in their original order',
);
assert.deepEqual(
  ids(sortList(rows, by('created', 'reversed'), name)),
  ['b', 'c', 'd', 'a', 'f', 'e'],
  'oldest first, equal times in their original order',
);

assert.deepEqual(
  ids(sortList(rows, by('edited'), name)),
  ['f', 'a', 'e', 'b', 'c', 'd'],
  'latest edit first; a missing or null updatedAt counts as the creation time (c and d: 200, tied with b)',
);
assert.deepEqual(
  ids(sortList(rows, by('edited', 'reversed'), name)),
  ['b', 'c', 'd', 'e', 'a', 'f'],
  'earliest edit first',
);

assert.deepEqual(
  ids(sortList([], by('alpha'), name)),
  [],
  'an empty list sorts to an empty list',
);
assert.deepEqual(
  LIST_SORT_OPTIONS.map((option) => option.value),
  ['default', 'created', 'edited', 'alpha'],
  'the four sorts the owner asked for',
);
assert.deepEqual(
  Object.keys(LIST_SORT_ORDER_LABELS),
  ['created', 'edited', 'alpha'],
  'every sort but the default has two directions',
);

assert.ok(
  DISH_CATEGORIES.length <= 10 &&
    new Set(DISH_CATEGORIES.map((category) => category.value)).size ===
      DISH_CATEGORIES.length,
  'a short list with each value once',
);
assert.ok(
  DISH_CATEGORIES.every(
    (category) => category.emoji !== '✨' && category.label.trim() !== '',
  ),
  'every category has a label and none borrows the sparkle',
);
assert.ok(
  !DISH_CATEGORIES.some((category) =>
    ['LUNCH', 'DINNER'].includes(category.value),
  ),
  'no Lunch or Dinner: a dish can be either, and the plan already has those slots',
);

assert.deepEqual(
  getCategories({}),
  [],
  'a document written before categories reads as none',
);
assert.deepEqual(getCategories({ categories: null }), []);
assert.deepEqual(
  getCategories({ categories: ['DRINK', 'NOPE', 'BREAKFAST', 'DRINK'] }),
  ['BREAKFAST', 'DRINK'],
  'unknown values drop, repeats collapse, and the list keeps its own order whatever order they were picked in',
);
assert.deepEqual(
  getCategoryLabels(['BREAKFAST', 'DRINK']),
  ['Breakfast', 'Drinks'],
  'labels for the summary row',
);

const items = [
  { id: 'smoothie', categories: ['DRINK', 'BREAKFAST'] },
  { id: 'adobo', categories: ['MAIN'] },
  { id: 'legacy' },
  { id: 'empty', categories: [] },
  { id: 'pancakes', categories: ['BREAKFAST', 'BAKING'] },
];
const counts = getCategoryCounts(items);
assert.deepEqual(
  [...counts.byCategory.entries()].sort(),
  [
    ['BAKING', 1],
    ['BREAKFAST', 2],
    ['DRINK', 1],
    ['MAIN', 1],
  ],
  'a dish counts once under each category it holds',
);
assert.equal(
  counts.withoutCategory,
  2,
  'a missing key and an empty list both count as no category',
);
assert.deepEqual(
  filterByCategory(items, 'BREAKFAST').map((item) => item.id),
  ['smoothie', 'pancakes'],
  'a dish in two categories shows under either',
);
assert.deepEqual(
  filterByCategory(items, CATEGORY_FILTER_NONE).map((item) => item.id),
  ['legacy', 'empty'],
);
assert.equal(filterByCategory(items, CATEGORY_FILTER_ANY).length, items.length);
assert.deepEqual(
  getCategoryFilterOptions(counts).map((option) => option.label),
  [
    'Any',
    'Breakfast · 2',
    'Main dishes · 1',
    'Baking · 1',
    'Drinks · 1',
    'No category · 2',
  ],
  'the filter lists only the categories that are present, in the list order, with counts, and "No category" while some dish has none',
);
assert.deepEqual(
  getCategoryFilterOptions(getCategoryCounts([{ categories: ['SIDE'] }])).map(
    (option) => option.label,
  ),
  ['Any', 'Sides · 1'],
  'no "No category" pill when every dish has one',
);

console.log('pinch sort and category checks passed');
