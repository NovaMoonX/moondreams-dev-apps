import assert from 'node:assert/strict';

import type {
  Package,
  Recipe,
  ShoppingItem,
} from '../../src/apps/pinch/types.ts';
import {
  MAX_PICK_SUGGESTIONS,
  getPantryPickIds,
  getShoppingPickIds,
  rankOftenUsedIngredients,
  takeSuggestionIds,
} from '../../src/apps/pinch/utils/pickerSuggestions.ts';

const line = (ingredientId: string) => ({
  id: `line-${ingredientId}`,
  ingredientId,
  amount: 1,
  unit: 'EACH' as const,
  note: null,
  group: null,
});
const recipe = (
  id: string,
  ingredientIds: string[],
  updatedAt = 1000,
): Pick<Recipe, 'id' | 'ingredients' | 'updatedAt'> => ({
  id,
  ingredients: ingredientIds.map(line),
  updatedAt,
});
const item = (
  ingredientId: string,
  over: Partial<ShoppingItem> = {},
): ShoppingItem => ({
  id: `${ingredientId}__EACH`,
  ingredientId,
  amount: 1,
  unit: 'EACH',
  isChecked: false,
  sources: [],
  pantryAddedAt: null,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});
const pkg = (ingredientId: string, over: Partial<Package> = {}): Package => ({
  id: `pkg-${ingredientId}`,
  ingredientId,
  ingredientName: ingredientId,
  productId: null,
  amount: 1,
  unit: 'L',
  place: 'FRIDGE',
  expiresAt: null,
  openedAt: null,
  status: 'IN_STOCK',
  history: [],
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});
const cooked = (entries: Record<string, number>) =>
  new Map(
    Object.entries(entries).map(([id, lastCookedAt]) => [id, { lastCookedAt }]),
  );

// the cap is four rows, and a first run has nothing to offer
assert.equal(MAX_PICK_SUGGESTIONS, 4, 'four rows at most');
assert.deepEqual(takeSuggestionIds([]), [], 'nothing to offer is nothing');
assert.deepEqual(takeSuggestionIds([[], []]), []);
assert.deepEqual(
  takeSuggestionIds([['a', 'b', 'c', 'd', 'e', 'f']]),
  ['a', 'b', 'c', 'd'],
  'a long list is cut to four',
);
assert.deepEqual(
  takeSuggestionIds([['a', 'b', 'c', 'd', 'e']], new Set(), 2),
  ['a', 'b'],
  'a caller can ask for fewer',
);

// each ingredient once, in the order first seen across the lists
assert.deepEqual(
  takeSuggestionIds([
    ['a', 'b', 'a'],
    ['c', 'b', 'd'],
  ]),
  ['a', 'b', 'c', 'd'],
  'a repeat keeps its first place and never takes a second row',
);

// what is left out never shortens the list while more are waiting
assert.deepEqual(
  takeSuggestionIds([['a', 'b', 'c', 'd', 'e', 'f']], new Set(['a', 'c'])),
  ['b', 'd', 'e', 'f'],
  'an excluded id is skipped and the next one takes its row',
);
assert.deepEqual(
  takeSuggestionIds([['a', 'b']], new Set(['a', 'b'])),
  [],
  'everything excluded is nothing, not a placeholder',
);
assert.deepEqual(
  takeSuggestionIds([['', 'a', '']]),
  ['a'],
  'a recipe line nobody has resolved yet is never offered',
);

// recipes: the ingredient in the most recipes first
assert.deepEqual(rankOftenUsedIngredients([]), [], 'no recipes, no ranking');
assert.deepEqual(
  rankOftenUsedIngredients([
    recipe('r1', ['salt', 'garlic', 'thyme']),
    recipe('r2', ['salt', 'garlic']),
    recipe('r3', ['salt']),
  ]),
  ['salt', 'garlic', 'thyme'],
  'three recipes beat two beat one',
);
assert.deepEqual(
  rankOftenUsedIngredients([
    recipe('r1', ['apple', 'zebra'], 1000),
    recipe('r2', ['zebra'], 5000),
    recipe('r3', ['apple'], 3000),
    recipe('r4', ['only-old'], 100),
    recipe('r5', ['only-recent'], 9000),
  ]),
  ['zebra', 'apple', 'only-recent', 'only-old'],
  'equal counts: the ingredient of the more recently changed recipe goes first, whatever its name',
);
assert.deepEqual(
  rankOftenUsedIngredients([
    recipe('r1', ['b', 'a'], 1000),
    recipe('r2', ['c'], 1000),
  ]),
  ['a', 'b', 'c'],
  'a full tie falls back to the id, so the order never changes between renders',
);
assert.deepEqual(
  rankOftenUsedIngredients([
    recipe('r1', ['salt', 'salt', 'salt']),
    recipe('r2', ['pepper', 'garlic']),
    recipe('r3', ['pepper']),
  ]),
  ['pepper', 'garlic', 'salt'],
  'one recipe that lists an ingredient under several headings counts once',
);

// pantry: what was ticked "Got it", newest first, then the newest packages
assert.deepEqual(getPantryPickIds([], []), [], 'a first run offers nothing');
assert.deepEqual(
  getPantryPickIds(
    [
      item('limes', { isChecked: true, updatedAt: 3000 }),
      item('basil', { isChecked: true, updatedAt: 5000 }),
      item('milk', { isChecked: false, updatedAt: 9000 }),
    ],
    [],
  ),
  ['basil', 'limes'],
  'ticked lines newest tick first; a line still to buy is not something brought home',
);
assert.deepEqual(
  getPantryPickIds(
    [
      item('limes', { isChecked: true, updatedAt: 3000, pantryAddedAt: 3000 }),
      item('basil', { isChecked: true, updatedAt: 5000, pantryAddedAt: 4000 }),
    ],
    [],
  ),
  ['basil'],
  'a line already put away is left out, and one ticked again since is offered once more',
);
const legacyLine = item('chives', { isChecked: true, updatedAt: 2000 });
Reflect.deleteProperty(legacyLine, 'pantryAddedAt');
assert.deepEqual(
  getPantryPickIds([legacyLine], []),
  ['chives'],
  'a line written before the put-away mark has no key and counts as not put away',
);
assert.deepEqual(
  getPantryPickIds(
    [],
    [
      pkg('rice', { createdAt: 1000 }),
      pkg('milk', { createdAt: 9000 }),
      pkg('eggs', { createdAt: 5000 }),
      pkg('old-butter', { createdAt: 99_000, status: 'DONE' }),
    ],
  ),
  ['milk', 'eggs', 'rice'],
  'packages newest first, and a finished one is not something to restock from here',
);
assert.deepEqual(
  getPantryPickIds(
    [
      item('milk', { isChecked: true, updatedAt: 3000 }),
      item('basil', { isChecked: true, updatedAt: 2000 }),
    ],
    [pkg('milk', { createdAt: 9000 }), pkg('rice', { createdAt: 1000 })],
  ),
  ['milk', 'basil', 'rice'],
  'got-it lines come first, and an ingredient in both is one row',
);
assert.equal(
  getPantryPickIds(
    Array.from({ length: 6 }, (_, index) =>
      item(`i${index}`, { isChecked: true, updatedAt: 1000 + index }),
    ),
    [pkg('milk')],
  ).length,
  4,
  'six ticked lines still offer four rows',
);

// shopping: what was on the list or in a recipe cooked lately, never what is still to buy
assert.deepEqual(
  getShoppingPickIds([], [], new Map()),
  [],
  'a first run offers nothing',
);
assert.deepEqual(
  getShoppingPickIds(
    [
      item('chicken', { isChecked: false, updatedAt: 9000 }),
      item('limes', { isChecked: true, updatedAt: 3000 }),
      item('basil', { isChecked: true, updatedAt: 5000 }),
    ],
    [],
    new Map(),
  ),
  ['basil', 'limes'],
  'ticked lines newest first, with what is still to buy left out',
);
assert.deepEqual(
  getShoppingPickIds(
    [
      item('soy', { id: 'soy__CUP', unit: 'CUP', isChecked: false }),
      item('soy', { id: 'soy__TBSP', unit: 'TBSP', isChecked: true }),
    ],
    [],
    new Map(),
  ),
  [],
  'an ingredient with a line still to buy in one unit is on the list, whatever a ticked line in another says',
);
assert.deepEqual(
  getShoppingPickIds(
    [item('limes', { isChecked: true, updatedAt: 3000 })],
    [recipe('adobo', ['garlic', 'soy', 'vinegar'])],
    cooked({ adobo: 4000 }),
  ),
  ['garlic', 'soy', 'vinegar', 'limes'],
  'a recipe cooked more recently than a tick goes first, its lines in the recipe order',
);
assert.deepEqual(
  getShoppingPickIds(
    [item('limes', { isChecked: true, updatedAt: 3000 })],
    [recipe('never-cooked', ['truffle'])],
    new Map(),
  ),
  ['limes'],
  'a recipe that was never cooked adds nothing, even with rows to spare',
);
assert.deepEqual(
  getShoppingPickIds(
    [item('limes', { isChecked: true, updatedAt: 6000 })],
    [recipe('adobo', ['garlic', 'soy'])],
    cooked({ adobo: 4000 }),
  ),
  ['limes', 'garlic', 'soy'],
  'a tick newer than the cook goes first',
);
assert.deepEqual(
  getShoppingPickIds(
    [item('garlic', { isChecked: true, updatedAt: 1000 })],
    [recipe('adobo', ['garlic', 'soy'])],
    cooked({ adobo: 4000 }),
  ),
  ['garlic', 'soy'],
  'an ingredient that is both ticked and cooked with is one row, at its newest time',
);
assert.deepEqual(
  getShoppingPickIds(
    [item('garlic', { isChecked: false, updatedAt: 1000 })],
    [recipe('adobo', ['garlic', 'soy'])],
    cooked({ adobo: 4000 }),
  ),
  ['soy'],
  'a cooked ingredient that is already on the list to buy is left out',
);
assert.equal(
  getShoppingPickIds(
    [],
    [recipe('feast', ['a', 'b', 'c', 'd', 'e', 'f'])],
    cooked({ feast: 1 }),
  ).length,
  4,
  'a big recipe still offers four rows',
);

console.log('pinch pickers checks passed');
