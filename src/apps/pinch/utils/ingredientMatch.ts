import { createOptionMatcher, toComparable } from '@/utils/optionMatchUtils';
import type { ResolvedIngredient } from '@apps/pinch/types';
import { splitPrep } from '@apps/pinch/utils/ingredientNames';

const FILLER = new Set([
  'fresh',
  'frozen',
  'large',
  'small',
  'medium',
  'chopped',
  'diced',
  'minced',
  'sliced',
  'ground',
  'boneless',
  'skinless',
  'raw',
  'whole',
  'extra',
  'virgin',
  'organic',
  'unsalted',
  'salted',
  'ripe',
  'trimmed',
  'peeled',
  'deveined',
  'pitted',
  'cored',
  'seeded',
  'rinsed',
  'drained',
  'softened',
  'melted',
  'cubed',
  'halved',
  'quartered',
  'thinly',
  'finely',
  'roughly',
  'coarsely',
  'freshly',
  'of',
  'the',
  'a',
]);

const matcher = createOptionMatcher<ResolvedIngredient>({
  names: (ingredient) => [ingredient.name, ...ingredient.aliases],
  ignoreWords: FILLER,
  prepare: (text) => splitPrep(text).name,
  foldPlurals: true,
  casing: { style: 'sentence', keepAcronyms: true },
});

export const normalizeName = (name: string) => toComparable(name, true);

export const withoutFiller = matcher.comparable;

const preferCustom = (ingredients: ResolvedIngredient[]) => [
  ...ingredients.filter((ingredient) => ingredient.isCustom),
  ...ingredients.filter((ingredient) => !ingredient.isCustom),
];

/** The ingredient a name from a recipe means, the person's own first and then the catalog, or null so a near miss is offered as new instead of silently becoming the wrong one ("coconut milk" is not "milk"). */
export const matchIngredient = (
  name: string,
  ingredients: ResolvedIngredient[],
) => matcher.match(name, preferCustom(ingredients));

/** `matchIngredient`, or the name as a new ingredient would be written: prep words dropped, cased like the catalog. */
export const resolveIngredient = (
  name: string,
  ingredients: ResolvedIngredient[],
) => matcher.resolve(name, preferCustom(ingredients));
