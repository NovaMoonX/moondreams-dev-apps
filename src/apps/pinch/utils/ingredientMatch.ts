import type { ResolvedIngredient } from '@apps/pinch/types';

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

const withoutFiller = (name: string) =>
  normalizeName(name)
    .split(' ')
    .filter((word) => !FILLER.has(word))
    .join(' ');

/** The ingredient a name from a recipe means: the person's own first, then the catalog, by exact name or alias once filler words (fresh, chopped, boneless) are dropped; null when nothing fits, so a near miss is offered as a new ingredient instead of silently becoming the wrong one. */
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
  const names = (ingredient: ResolvedIngredient) =>
    [ingredient.name, ...ingredient.aliases].map(withoutFiller).filter(Boolean);

  return (
    ordered.find((ingredient) => names(ingredient).includes(target)) ?? null
  );
}
