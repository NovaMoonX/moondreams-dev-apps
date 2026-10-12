import assert from 'node:assert/strict';

import type {
  IngredientRecord,
  PlannedMeal,
  Recipe,
} from '../../src/apps/pinch/types.ts';
import { resolveIngredients } from '../../src/apps/pinch/utils/resolveIngredient.ts';
import {
  dayMarkdown,
  weekMarkdown,
} from '../../src/apps/pinch/utils/markdown/dayMarkdown.ts';
import { ingredientsMarkdown } from '../../src/apps/pinch/utils/markdown/ingredientsMarkdown.ts';
import { recipeMarkdown } from '../../src/apps/pinch/utils/markdown/recipeMarkdown.ts';
import { getDateOfDayKey } from '../../src/apps/pinch/utils/dayKeys.ts';

const custom = (id: string, name: string): IngredientRecord => ({
  id,
  catalogId: null,
  name,
  familyId: null,
  iconKey: null,
  nutritionPer100g: null,
  servingAmount: null,
  servingUnit: null,
  gramsPerMl: null,
  gramsEach: null,
  defaultProductId: null,
  createdAt: 0,
  updatedAt: 0,
});
const ingredients = resolveIngredients([
  custom('c-1', 'Hot *sauce* #1 @home'),
  custom('c-2', 'Rice'),
]);
const ingredientsById = new Map(
  ingredients.map((ingredient) => [ingredient.id, ingredient]),
);
const recipe: Recipe = {
  id: 'r-1',
  title: '*Bold* #1 dinner @ home',
  description: 'Line one\nline two',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: null,
  coverPath: 'secret/cover.png',
  ingredients: [
    {
      id: 'l1',
      ingredientId: 'c-1',
      amount: 2,
      unit: 'TBSP',
      note: 'the [spicy] one',
    },
    { id: 'l2', ingredientId: 'c-2', amount: 1.5, unit: 'CUP', note: null },
  ],
  steps: ['Cook the rice.', 'Add *everything* and stir_'],
  nutritionOverride: { calories: 999, protein: null, carbs: null, fat: null },
  source: 'MANUAL',
  createdAt: 0,
  updatedAt: 0,
};
const recipesById = new Map([[recipe.id, recipe]]);
const lookups = { recipesById, ingredientsById };

const planned = (
  id: string,
  date: string,
  mealType: PlannedMeal['mealType'],
): PlannedMeal => ({
  id,
  date: getDateOfDayKey(date),
  mealType,
  name: null,
  sourceMealId: null,
  items: [{ id: `i-${id}`, kind: 'RECIPE', refId: 'r-1', servings: 2 }],
  refIds: ['r-1'],
  snapshot: null,
  createdAt: 0,
  updatedAt: 0,
});

const outputs = {
  recipe: recipeMarkdown(recipe, ingredientsById),
  day: dayMarkdown(
    '2026-10-14',
    [planned('a', '2026-10-14', 'DINNER')],
    lookups,
  ),
  ingredients: ingredientsMarkdown(
    ingredients,
    [],
    (ingredient) => ingredient.isCustom,
  ),
};

// nothing that leaves carries money, a cover, a typed nutrition value or raw Markdown punctuation from user text
Object.entries(outputs).forEach(([name, text]) => {
  assert.ok(!text.includes('$'), `${name} has a $`);
  assert.ok(!text.includes('secret/cover'), `${name} has the cover path`);
  assert.ok(!text.includes('999'), `${name} has nutrition`);
  assert.ok(
    !/(^|[^\\])[*#@]/m.test(text.replace(/^#{1,4} /gm, '')),
    `${name} has an unescaped * # or @`,
  );
});
assert.match(outputs.recipe, /^# \\\*Bold\\\* \\#1 dinner \\@ home/);
assert.match(
  outputs.recipe,
  /- 2 tbsp Hot \\\*sauce\\\* \\#1 \\@home \(the \\\[spicy\\\] one\)/i,
);
assert.match(outputs.recipe, /1\. Cook the rice\./);
assert.ok(
  outputs.recipe.includes('Line one line two'),
  'a description collapses to one line',
);

// a week is exactly Monday to Sunday, wherever in it the day is, and an empty day says so in one line
const days = (text: string) =>
  [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
const midweek = new Map([
  ['2026-10-14', [planned('a', '2026-10-14', 'DINNER')]],
]);
const week = weekMarkdown('2026-10-14', midweek, lookups);
assert.equal(days(week).length, 7);
assert.match(days(week)[0], /Mon/);
assert.match(days(week)[6], /Sun/);
assert.equal(
  days(weekMarkdown('2026-10-18', midweek, lookups)).join(),
  days(week).join(),
  'Sunday belongs to the week that started the Monday before',
);
assert.equal(days(week)[0], 'Mon, Oct 12');
assert.equal(
  days(weekMarkdown('2026-10-19', midweek, lookups))[0],
  'Mon, Oct 19',
);
assert.equal(week.match(/^Nothing planned\.$/gm)?.length, 6);

// the list is capped with a count of what was left out
const many = resolveIngredients(
  Array.from({ length: 205 }, (_, index) =>
    custom(`c-${index}`, `Thing ${index}`),
  ),
);
assert.match(
  ingredientsMarkdown(many, [], (ingredient) => ingredient.isCustom),
  /…and 5 more$/,
);
assert.match(
  ingredientsMarkdown(many, [], () => false),
  /Nothing here yet\./,
);

console.log('pinch markdown ok');
