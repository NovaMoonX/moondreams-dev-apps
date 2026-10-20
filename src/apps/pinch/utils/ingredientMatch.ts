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

const singular = (word: string) => {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|oes|ses|xes)$/.test(word))
    return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss'))
    return word.slice(0, -1);
  return word;
};

/** Lowercase, punctuation stripped, plural folded, accents removed: the form two names are compared in. */
export const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ');

export const withoutFiller = (name: string) =>
  normalizeName(splitPrep(name).name)
    .split(' ')
    .filter((word) => !FILLER.has(word))
    .join(' ');

const MIN_TYPO_LENGTH = 6;

const isOneEditAway = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const at = [...short].findIndex((char, index) => char !== long[index]);
  if (at === -1) return short.length !== long.length;
  return short.length === long.length
    ? short.slice(at + 1) === long.slice(at + 1)
    : short.slice(at) === long.slice(at + 1);
};

const sortedWords = (text: string) => text.split(' ').sort().join(' ');

const namesCache = new WeakMap<ResolvedIngredient, string[]>();

const getNames = (ingredient: ResolvedIngredient) => {
  const cached = namesCache.get(ingredient);
  if (cached) return cached;
  const names = [ingredient.name, ...ingredient.aliases]
    .map(withoutFiller)
    .filter(Boolean);
  namesCache.set(ingredient, names);
  return names;
};

/** The ingredient a name from a recipe means, the person's own first and then the catalog, in three steps and only when sure: the same name or alias once filler and prep words (fresh, chopped, boneless, bone-in) are dropped; the same words in another order; and one wrong letter in a name of six letters or more, when exactly one ingredient is that close. Null when nothing fits, so a near miss is offered as a new ingredient instead of silently becoming the wrong one ("coconut milk" is not "milk"). */
export function matchIngredient(
  name: string,
  ingredients: ResolvedIngredient[],
): ResolvedIngredient | null {
  const target = withoutFiller(name);
  if (target === '') {
    return null;
  }

  const ordered = [
    ...ingredients.filter((ingredient) => ingredient.isCustom),
    ...ingredients.filter((ingredient) => !ingredient.isCustom),
  ];
  const sameName = ordered.find((ingredient) =>
    getNames(ingredient).includes(target),
  );
  if (sameName) return sameName;

  const targetWords = sortedWords(target);
  const sameWords = ordered.find((ingredient) =>
    getNames(ingredient).some((known) => sortedWords(known) === targetWords),
  );
  if (sameWords) return sameWords;

  if (target.length < MIN_TYPO_LENGTH) return null;
  const close = ordered.filter((ingredient) =>
    getNames(ingredient).some(
      (known) =>
        known.length >= MIN_TYPO_LENGTH && isOneEditAway(known, target),
    ),
  );

  return close.length === 1 ? close[0] : null;
}
