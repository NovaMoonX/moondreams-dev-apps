import assert from 'node:assert/strict';

import { NEW_CHOICE } from '../../src/components/forms/PickOrCreate.tsx';
import {
  getInitialData,
  type IngredientRow,
  type RecipeFormData,
} from '../../src/apps/pinch/components/recipes/recipeFormModel.ts';
import type { RecipeRevision } from '../../src/apps/pinch/lib/reviseRecipe.ts';
import type {
  Collection,
  ResolvedIngredient,
  Source,
} from '../../src/apps/pinch/types.ts';
import {
  applyRevision,
  describeRevisionMarks,
  toRevisionInput,
} from '../../src/apps/pinch/utils/pepperRevision.ts';
import {
  describePepperChange,
  getAllLiveMarks,
  getLiveMarks,
} from '../../src/apps/pinch/utils/pepperMarks.ts';

const ingredient = (id: string, name: string): ResolvedIngredient => ({
  id,
  name,
  familyId: null,
  aliases: [],
  per100g: { calories: null, protein: null, carbs: null, fat: null },
  serving: { amount: 1, unit: 'EACH' },
  gramsPerMl: null,
  gramsEach: null,
  isCustom: false,
  isAdjusted: false,
  isArchived: false,
});
const catalog = [
  ingredient('butter', 'Butter'),
  ingredient('olive-oil', 'Olive oil'),
  ingredient('salt', 'Salt'),
  ingredient('garlic', 'Garlic'),
];
const byId = new Map(catalog.map((entry) => [entry.id, entry]));
const sources: Source[] = [
  { id: 'src-mom', label: "Mom's cards", createdAt: 1, updatedAt: 1 },
];
const collections: Collection[] = [
  { id: 'col-weeknight', label: 'Weeknight', createdAt: 1, updatedAt: 1 },
  { id: 'col-bulk', label: 'Bulk', createdAt: 1, updatedAt: 1 },
];
const context = { sources, collections };

const row = (
  id: string,
  ingredientId: string,
  amount: string,
  unit: IngredientRow['unit'],
): IngredientRow => ({
  id,
  ingredientId,
  freeText: null,
  amount,
  unit,
  isAmountless: false,
  amountText: null,
  note: null,
  proposedName: null,
  newName: null,
  group: null,
  adaptedFrom: null,
});
const base: RecipeFormData = {
  ...getInitialData(null),
  title: 'Garlic toast',
  description: 'Crisp and buttery.',
  categories: ['SIDE'],
  ingredients: [
    row('r1', 'butter', '2', 'TBSP'),
    row('r2', 'salt', '1', 'TSP'),
    row('r3', 'garlic', '3', 'EACH'),
  ],
  steps: ['Melt the butter.', 'Add the salt.', 'Serve.'],
  stepSections: [null, null, null],
  care: { fridge: '3', freezer: '', reheat: '', tip: '' },
  sourceChoice: { choice: 'src-mom', newText: '' },
  collections: { ids: ['col-weeknight'], added: [] },
};
const { input, refMap } = toRevisionInput(base, byId, context, {
  ask: 'x',
  earlierAsks: [],
});
const keep = (
  ref: string,
  over: Partial<RecipeRevision['ingredients'][0]> = {},
) => {
  const line = input.ingredients.find((entry) => entry.ref === ref)!;
  return {
    ref,
    name: line.name,
    amount: line.amount,
    unit: line.unit,
    amountText: line.amountText,
    note: line.note,
    group: line.group,
    ...over,
  };
};
const same: RecipeRevision = {
  reply: 'Nothing changed.',
  isChanged: false,
  title: input.title,
  description: input.description,
  servings: input.servings,
  prepMinutes: null,
  cookMinutes: null,
  categories: input.categories,
  care: input.care,
  source: input.source,
  collections: input.collections,
  ingredients: input.ingredients.map((line) => keep(line.ref)),
  steps: input.steps,
};
const apply = (over: Partial<RecipeRevision>) =>
  applyRevision(base, { ...same, ...over }, refMap, catalog, context);

assert.deepEqual(
  [...refMap.entries()],
  [
    ['i1', 'r1'],
    ['i2', 'r2'],
    ['i3', 'r3'],
  ],
  'refs are short and map back to the rows',
);
assert.equal(input.ingredients[0].name, 'Butter');
assert.equal(input.source, "Mom's cards");
assert.deepEqual(input.collections, ['Weeknight']);
assert.deepEqual(input.otherCollections, ['Bulk']);

const unchanged = apply({});
assert.ok(
  unchanged.marks.isEmpty,
  'a revision that repeats the recipe marks nothing',
);
assert.deepEqual(unchanged.data.ingredients, base.ingredients);
assert.equal(describeRevisionMarks(unchanged.marks), 'No changes');

const amount = apply({
  ingredients: same.ingredients.map((line) =>
    line.ref === 'i1' ? { ...line, amount: 3 } : line,
  ),
});
assert.equal(amount.data.ingredients[0].id, 'r1');
assert.equal(amount.data.ingredients[0].ingredientId, 'butter');
assert.equal(amount.data.ingredients[0].amount, '3');
assert.deepEqual(amount.marks.changedIngredientIds, ['r1']);
assert.deepEqual(amount.marks.addedIngredientIds, []);
assert.equal(describeRevisionMarks(amount.marks), 'Changed 1 ingredient');

const renamed = apply({
  ingredients: same.ingredients.map((line) =>
    line.ref === 'i1' ? { ...line, name: 'Olive oil' } : line,
  ),
});
assert.equal(
  renamed.data.ingredients[0].id,
  'r1',
  'a renamed line keeps its row',
);
assert.equal(renamed.data.ingredients[0].ingredientId, 'olive-oil');
assert.deepEqual(renamed.marks.changedIngredientIds, ['r1']);

const added = apply({
  ingredients: [
    ...same.ingredients,
    {
      ref: null,
      name: 'Gochujang',
      amount: 1,
      unit: 'TBSP',
      amountText: null,
      note: null,
      group: null,
    },
  ],
});
const staged = added.data.ingredients[3];
assert.equal(
  staged.newName,
  'Gochujang',
  'a name nothing is near is staged as new',
);
assert.notEqual(staged.ingredientId, '');
assert.deepEqual(added.marks.addedIngredientIds, [staged.id]);

const removed = apply({
  ingredients: same.ingredients.filter((line) => line.ref !== 'i2'),
});
assert.deepEqual(removed.marks.removedIngredientNames, ['Salt']);
assert.deepEqual(
  removed.data.ingredients.map((entry) => entry.id),
  ['r1', 'r3'],
);
assert.equal(describeRevisionMarks(removed.marks), 'Removed 1 ingredient');

const inserted = apply({
  steps: [
    { text: 'Melt the butter.', section: null },
    { text: 'Mince the garlic.', section: null },
    { text: 'Add the salt.', section: null },
    { text: 'Serve.', section: null },
  ],
});
assert.deepEqual(inserted.marks.changedStepIndices, [1]);
assert.deepEqual(inserted.data.steps.length, 4);
assert.equal(describeRevisionMarks(inserted.marks), 'Changed 1 step');

const retitled = apply({ title: 'Cheesy garlic toast' });
assert.ok(retitled.marks.title && !retitled.marks.isEmpty);
assert.equal(retitled.data.title, 'Cheesy garlic toast');
assert.deepEqual(retitled.data.care, base.care);
assert.deepEqual(retitled.data.sourceChoice, base.sourceChoice);

const categories = apply({ categories: ['SIDE', 'SNACK'] });
assert.ok(categories.marks.categories);
assert.deepEqual(categories.data.categories, ['SIDE', 'SNACK']);

const care = apply({
  care: { fridgeDays: 4, freezerDays: null, reheat: 'Oven', tip: null },
});
assert.ok(care.marks.care);
assert.deepEqual(care.data.care, {
  fridge: '4',
  freezer: '',
  reheat: 'Oven',
  tip: '',
});

const known = apply({ source: "MOM'S CARDS" });
assert.ok(
  !known.marks.source,
  'the same label in other case is the same source',
);
assert.deepEqual(known.data.sourceChoice, { choice: 'src-mom', newText: '' });
const fresh = apply({ source: 'Grandma' });
assert.ok(fresh.marks.source);
assert.deepEqual(fresh.data.sourceChoice, {
  choice: NEW_CHOICE,
  newText: 'Grandma',
});
assert.deepEqual(apply({ source: null }).data.sourceChoice, {
  choice: '',
  newText: '',
});

const filed = apply({ collections: ['weeknight', 'Bulk', 'Game night'] });
assert.ok(filed.marks.collections);
assert.equal(filed.data.collections.ids.length, 3);
assert.ok(filed.data.collections.ids.includes('col-bulk'));
assert.deepEqual(
  filed.data.collections.added.map((entry) => entry.label),
  ['Game night'],
  'a new name is held the way the form holds a typed one',
);
assert.ok(
  !apply({ collections: ['weeknight'] }).marks.collections,
  'the same collection in other case is no change',
);

const odd: RecipeFormData = {
  ...base,
  ingredients: [
    {
      ...row('r1', 'butter', '1/3', 'CUP'),
      adaptedFrom: { amount: 75, unit: 'G' },
    },
    row('r2', 'salt', '2-3', 'TSP'),
    {
      ...row('r3', '', '', 'EACH'),
      freeText: 'A pinch of love',
      isAmountless: true,
    },
  ],
} as RecipeFormData;
const oddIn = toRevisionInput(odd, byId, context, {
  ask: 'x',
  earlierAsks: [],
});
const oddKeep = (
  ref: string,
  over: Partial<RecipeRevision['ingredients'][0]> = {},
) => {
  const line = oddIn.input.ingredients.find((entry) => entry.ref === ref)!;
  return {
    ref,
    name: line.name,
    amount: line.amount,
    unit: line.unit,
    amountText: line.amountText,
    note: line.note,
    group: line.group,
    ...over,
  };
};
const oddSame: RecipeRevision = {
  ...same,
  ingredients: oddIn.input.ingredients.map((line) => oddKeep(line.ref)),
};
const oddApply = (over: Partial<RecipeRevision>) =>
  applyRevision(odd, { ...oddSame, ...over }, oddIn.refMap, catalog, context);
const rounded = oddApply({
  ingredients: [oddKeep('i1', { amount: 0.33 }), oddKeep('i2'), oddKeep('i3')],
});
assert.equal(
  rounded.data.ingredients[0].amount,
  '1/3',
  'a model-rounded ⅓ keeps its typed text',
);
assert.ok(rounded.data.ingredients[0].adaptedFrom !== null, 'and its original');
assert.equal(
  rounded.data.ingredients[1].amount,
  '2-3',
  'an amount the app cannot read is kept',
);
assert.equal(rounded.data.ingredients[1].unit, 'TSP');
assert.ok(rounded.marks.isEmpty, 'so nothing is marked');
const unitless = oddApply({
  ingredients: [oddKeep('i1', { unit: null }), oddKeep('i2'), oddKeep('i3')],
});
assert.equal(
  unitless.data.ingredients[0].unit,
  'CUP',
  'a dropped unit on an unchanged amount keeps the unit',
);
const reworded = oddApply({
  ingredients: [
    oddKeep('i1'),
    oddKeep('i2'),
    oddKeep('i3', { name: 'A pinch of joy' }),
  ],
});
assert.equal(
  reworded.data.ingredients[2].freeText,
  'A pinch of joy',
  'a reworded free line stays free',
);
assert.equal(reworded.data.ingredients[2].ingredientId, '');
assert.throws(
  () => apply({ isChanged: true, ingredients: [] }),
  'a revision with no ingredients is refused',
);
assert.throws(
  () => apply({ isChanged: true, steps: [] }),
  'a revision with no steps is refused',
);

const roundOne = apply({
  ingredients: same.ingredients
    .filter((line) => line.ref !== 'i2')
    .map((line) => (line.ref === 'i1' ? { ...line, amount: 3 } : line)),
});
const second = toRevisionInput(roundOne.data, byId, context, {
  ask: 'y',
  earlierAsks: ['x'],
});
const secondSame: RecipeRevision = {
  ...same,
  title: second.input.title,
  ingredients: second.input.ingredients.map((line) => ({
    ref: line.ref,
    name: line.name,
    amount: line.amount,
    unit: line.unit,
    amountText: line.amountText,
    note: line.note,
    group: line.group,
  })),
  steps: second.input.steps,
};
const applySecond = (over: Partial<RecipeRevision>) =>
  applyRevision(
    roundOne.data,
    { ...secondSame, ...over },
    second.refMap,
    catalog,
    context,
  );
const roundTwo = applySecond({ title: 'Spicy garlic toast' });
assert.deepEqual(
  getLiveMarks(roundOne.marks, roundOne.data, roundTwo.data)
    .changedIngredientIds,
  ['r1'],
  'round one alone is still live after round two',
);
assert.deepEqual(roundTwo.marks.changedIngredientIds, []);
const together = getAllLiveMarks(
  [
    { marks: roundOne.marks, data: roundOne.data },
    { marks: roundTwo.marks, data: roundTwo.data },
  ],
  roundTwo.data,
)!;
assert.ok(together.title, 'the later round is marked');
assert.deepEqual(
  together.changedIngredientIds,
  ['r1'],
  'and an earlier round stays marked',
);
assert.deepEqual(together.removedIngredientNames, ['Salt']);
assert.equal(
  describePepperChange(together, ['Butter']),
  'changed the title and butter',
);
assert.equal(getAllLiveMarks([], base), null);

assert.equal(
  describePepperChange(
    {
      ...together,
      title: false,
      changedIngredientIds: ['a', 'b'],
      changedStepIndices: [1, 2],
    },
    ['Chicken breast', 'Olive oil'],
  ),
  'changed chicken breast, olive oil, and 2 steps',
  'named ingredients read as list items in sentence case',
);

const reworded2 = apply({
  steps: same.steps.map((step, index) =>
    index === 1 ? { ...step, text: `${step.text} Until golden.` } : step,
  ),
});
const stepSecond = toRevisionInput(reworded2.data, byId, context, {
  ask: 'y',
  earlierAsks: ['x'],
});
const preheated = applyRevision(
  reworded2.data,
  {
    ...same,
    title: stepSecond.input.title,
    ingredients: stepSecond.input.ingredients.map((line) => ({
      ref: line.ref,
      name: line.name,
      amount: line.amount,
      unit: line.unit,
      amountText: line.amountText,
      note: line.note,
      group: line.group,
    })),
    steps: [
      { text: 'Preheat the oven.', section: null },
      ...stepSecond.input.steps,
    ],
  },
  stepSecond.refMap,
  catalog,
  context,
);
assert.deepEqual(
  getAllLiveMarks(
    [
      { marks: reworded2.marks, data: reworded2.data },
      { marks: preheated.marks, data: preheated.data },
    ],
    preheated.data,
  )!.changedStepIndices,
  [0, 2],
  "a step inserted above keeps an earlier round's rewritten step marked",
);

console.log('pinch pepper revision checks passed');
