import { createOptionMatcher, toComparable } from '@/utils/optionMatchUtils';
import type { ResolvedIngredient } from '@apps/pinch/types';
import { splitPrep } from '@apps/pinch/utils/ingredientNames';

/** Words a recipe line carries that never say which ingredient it is. They drop from the line only, never from an ingredient's own name, so "pork" never reaches "Ground pork" and "canned tomatoes" never "Canned diced tomatoes"; a word that makes a different product (ground, whole, minced, toasted) is not here at all. The preparation words in `splitPrep` leave the name first. */
const FILLER = new Set([
  'fresh',
  'freshly',
  'large',
  'small',
  'medium',
  'chopped',
  'diced',
  'frozen',
  'sliced',
  'cubed',
  'halved',
  'quartered',
  'raw',
  'extra',
  'virgin',
  'organic',
  'unsalted',
  'salted',
  'ripe',
  'thinly',
  'finely',
  'roughly',
  'coarsely',
  'of',
  'the',
  'a',
]);

const matcher = createOptionMatcher<ResolvedIngredient>({
  names: (ingredient) => [ingredient.name, ...ingredient.aliases],
  ignoreTypedWords: FILLER,
  prepare: (text) => splitPrep(text).name,
  prefer: (ingredient) => ingredient.isCustom,
  foldPlurals: true,
  reorder: false,
  casing: { style: 'sentence', keepAcronyms: true },
});

export const normalizeName = (name: string) => toComparable(name, true);

export const withoutFiller = matcher.comparable;

/** The ingredient a name from a recipe means, the person's own before the catalog's, or null so a near miss is offered as new instead of silently becoming the wrong one ("coconut milk" is not "milk"). */
export const matchIngredient = (
  name: string,
  ingredients: ResolvedIngredient[],
) => matcher.match(name, ingredients);

/** `matchIngredient`, or the name as a new ingredient would be written: prep words dropped, cased like the catalog. */
export const resolveIngredient = (
  name: string,
  ingredients: ResolvedIngredient[],
) => matcher.resolve(name, ingredients);
