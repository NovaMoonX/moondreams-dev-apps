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

/** Words and amounts a line carries about the cut or the leanness that the ingredient's own name does not ("lean", "93%", "80/20"). */
const DESCRIPTOR_PATTERN =
  /(?<![\p{L}\p{N}-])(?:\d{1,3}\s*%|\d{1,3}\s*\/\s*\d{1,3}%?|extra[\s-]+lean|low[\s-]+sodium|bone[\s-]*in|lean|boneless|skinless|fresh|frozen|large|small|medium|chopped|diced|sliced|organic|unsalted)(?![\p{L}\p{N}-])/giu;

export interface DescriptorMatch {
  ingredient: ResolvedIngredient;
  /** The descriptor words the line carried that the ingredient's own name lacks, in order, for the line's note ("sliced bread" is Bread with "sliced"). */
  noteWords: string[];
}

/** `matchIngredient` on the full name first, then with descriptor words ignored; either way the descriptors go to the note ("Lean ground beef" is the person's "Ground beef", with "lean" for the note). A descriptor that is a word of the matched ingredient's own name stays with the name, never the note, and only the line's words are ever dropped, so "ground" in "Ground beef" is never lost. */
export const matchIngredientWithNote = (
  name: string,
  ingredients: ResolvedIngredient[],
): DescriptorMatch | null => {
  const dropped = Array.from(name.matchAll(DESCRIPTOR_PATTERN), ([word]) =>
    word.toLowerCase().replace(/\s+/g, ' '),
  );
  const withNote = (ingredient: ResolvedIngredient): DescriptorMatch => {
    const own = ` ${normalizeName(ingredient.name)} `;
    return {
      ingredient,
      noteWords: dropped.filter(
        (word) => !own.includes(` ${normalizeName(word)} `),
      ),
    };
  };
  const full = matcher.match(name, ingredients);
  if (full) return withNote(full);
  if (dropped.length === 0) return null;
  const rest = name
    .replace(DESCRIPTOR_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const ingredient = rest === '' ? null : matcher.match(rest, ingredients);
  return ingredient ? withNote(ingredient) : null;
};

/** Up to `limit` names of ingredients that share a word with a name nothing matched, the person's own first, for an assistant to choose from. */
export const suggestIngredients = (
  name: string,
  ingredients: ResolvedIngredient[],
  limit = 3,
) => {
  const asked = new Set(
    withoutFiller(name.replace(DESCRIPTOR_PATTERN, ' '))
      .split(' ')
      .filter((word) => word.length > 2),
  );
  return ingredients
    .map((ingredient) => ({
      ingredient,
      shared: normalizeName(ingredient.name)
        .split(' ')
        .filter((word) => asked.has(word)).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort(
      (left, right) =>
        right.shared - left.shared ||
        Number(right.ingredient.isCustom) - Number(left.ingredient.isCustom) ||
        left.ingredient.name.length - right.ingredient.name.length,
    )
    .slice(0, limit)
    .map(({ ingredient }) => ingredient.name);
};

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
