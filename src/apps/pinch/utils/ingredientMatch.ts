import {
  createOptionMatcher,
  toComparable,
  type OptionResolution,
} from '@/utils/optionMatchUtils';
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

export interface ReadNameResolution {
  resolution: OptionResolution<ResolvedIngredient>;
  /** The other name the line gave, only when the line matched no ingredient, so the new one's note keeps it. */
  leftover: string | null;
}

const pickWinner = (
  byName: ResolvedIngredient | null,
  bySynonym: ResolvedIngredient | null,
) => {
  if (!byName || !bySynonym) return byName ?? bySynonym;
  const result = bySynonym.isCustom && !byName.isCustom ? bySynonym : byName;
  return result;
};

/** `matchIngredient`, or the name as a new ingredient would be written (prep words dropped, cased like the catalog), for a line that may give two names ("beef mince (ground beef)"): each is matched on its own, the person's own ingredient wins over the catalog's when they differ, and a new ingredient takes the first name. The matching rules are the same, so a look-alike is never linked through the second name either. */
export function resolveReadName(
  name: string,
  alsoCalled: string | null,
  ingredients: ResolvedIngredient[],
): ReadNameResolution {
  const byName = matcher.match(name, ingredients);
  const bySynonym = alsoCalled ? matcher.match(alsoCalled, ingredients) : null;
  const winner = pickWinner(byName, bySynonym);
  const resolution: OptionResolution<ResolvedIngredient> = winner
    ? { kind: 'match', option: winner }
    : matcher.resolve(name, ingredients);

  return { resolution, leftover: winner ? null : alsoCalled };
}
