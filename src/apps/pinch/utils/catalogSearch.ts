import { CATALOG_FAMILIES_BY_ID } from '@apps/pinch/catalog';
import type {
  Recipe,
  ResolvedFamily,
  ResolvedIngredient,
  Source,
} from '@apps/pinch/types';
import { getRecipeSource } from '@apps/pinch/utils/sources';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

interface SearchText {
  name: string;
  aliases: string[];
  family: string;
  haystack: string;
}

// An ingredient object is replaced when it changes, so its normalized text is built once per object.
const SEARCH_TEXT = new WeakMap<ResolvedIngredient, SearchText>();

const getSearchText = (ingredient: ResolvedIngredient) => {
  const cached = SEARCH_TEXT.get(ingredient);
  if (cached) {
    return cached;
  }
  const entry = {
    name: normalize(ingredient.name),
    aliases: ingredient.aliases.map(normalize),
    family: normalize(
      (ingredient.familyId &&
        CATALOG_FAMILIES_BY_ID.get(ingredient.familyId)?.name) ||
        '',
    ),
    haystack: normalize([ingredient.name, ...ingredient.aliases].join(' ')),
  };
  SEARCH_TEXT.set(ingredient, entry);
  return entry;
};

const startsAWord = (text: string, word: string) =>
  text.startsWith(word) || text.includes(` ${word}`);

/** Lower is closer: the name, then an alias, said exactly; the name starting with it; every word starting a word of the name; a member of a family with that name; an alias starting with it; anything else that contains every word. */
const getRank = (text: SearchText, typed: string, words: string[]) => {
  if (text.name === typed) return 0;
  if (text.aliases.includes(typed)) return 1;
  if (text.name.startsWith(typed)) return 2;
  if (words.every((word) => startsAWord(text.name, word))) return 3;
  if (words.every((word) => text.family.includes(word))) return 4;
  if (
    text.aliases.some((alias) =>
      words.every((word) => startsAWord(alias, word)),
    )
  ) {
    return 5;
  }
  return 6;
};

/** Ingredients whose name, an alias or their catalog family's name holds every word typed, closest first (an exact name or alias, then a name that starts with it, then a family's members), accents ignored. */
export function searchIngredients(
  ingredients: ResolvedIngredient[],
  query: string,
): ResolvedIngredient[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return ingredients;
  }

  const typed = words.join(' ');
  const result = ingredients
    .flatMap((ingredient) => {
      const text = getSearchText(ingredient);
      const isMatch = words.every(
        (word) => text.haystack.includes(word) || text.family.includes(word),
      );
      return isMatch ? [{ ingredient, rank: getRank(text, typed, words) }] : [];
    })
    .sort(
      (a, b) =>
        a.rank - b.rank || a.ingredient.name.localeCompare(b.ingredient.name),
    )
    .map(({ ingredient }) => ingredient);

  return result;
}

export interface FamilyGroupData {
  family: ResolvedFamily;
  ingredients: ResolvedIngredient[];
}

/** Stands in for the group of ingredients that belong to no family. */
export const NO_FAMILY: ResolvedFamily = {
  id: '',
  name: 'On their own',
  isCustom: false,
};

/** Ingredients bucketed under their family in one pass, families and ingredients alphabetical, empty families dropped, the family-less last. */
export function groupByFamily(
  ingredients: ResolvedIngredient[],
  families: ResolvedFamily[],
): FamilyGroupData[] {
  const buckets = ingredients.reduce((acc, ingredient) => {
    const key = ingredient.familyId ?? '';
    acc.set(key, [...(acc.get(key) ?? []), ingredient]);
    return acc;
  }, new Map<string, ResolvedIngredient[]>());

  const toGroup = (family: ResolvedFamily) => {
    const items = buckets.get(family.id);
    return items
      ? [
          {
            family,
            ingredients: [...items].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          },
        ]
      : [];
  };
  const known = new Set(families.map((family) => family.id));
  const orphans = [...buckets.entries()]
    .filter(([key]) => key === '' || !known.has(key))
    .flatMap(([, items]) => items);
  const orphanGroup =
    orphans.length > 0
      ? [
          {
            family: NO_FAMILY,
            ingredients: [...orphans].sort((a, b) =>
              a.name.localeCompare(b.name),
            ),
          },
        ]
      : [];

  const result = [...families.flatMap(toGroup), ...orphanGroup];

  return result;
}

/** Items whose name contains every word typed, in the order given; an empty query keeps them all. */
export function searchByName<T extends { name: string }>(
  items: T[],
  query: string,
): T[] {
  const words = normalize(query).split(' ').filter(Boolean);
  const result =
    words.length === 0
      ? items
      : items.filter((item) =>
          words.every((word) => normalize(item.name).includes(word)),
        );

  return result;
}

export interface RecipeSearchEntry {
  recipe: Recipe;
  title: string;
  rest: string;
}

/** Each recipe's title and the rest of what a person might type to find it (its ingredients' names and aliases, its source and its description), normalized once. */
export function buildRecipeSearchIndex(
  recipes: Recipe[],
  ingredientsById: Map<string, ResolvedIngredient>,
  sourcesById: Map<string, Source>,
): RecipeSearchEntry[] {
  const result = recipes.map((recipe) => ({
    recipe,
    title: normalize(recipe.title),
    rest: normalize(
      [
        ...recipe.ingredients.flatMap((line) => {
          const ingredient = ingredientsById.get(line.ingredientId);
          return ingredient ? [ingredient.name, ...ingredient.aliases] : [];
        }),
        getRecipeSource(recipe, sourcesById)?.label ?? '',
        recipe.description ?? '',
      ].join(' '),
    ),
  }));

  return result;
}

/** Recipes where every word typed is in the title or starts a word of the rest, those with every word in the title first, each group in the index's order; an empty query keeps them all. */
export function searchRecipes(
  index: RecipeSearchEntry[],
  query: string,
): Recipe[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return index.map((entry) => entry.recipe);
  }

  const isInTitle = (entry: RecipeSearchEntry) =>
    words.every((word) => entry.title.includes(word));
  const matches = index.filter((entry) =>
    words.every(
      (word) => entry.title.includes(word) || startsAWord(entry.rest, word),
    ),
  );
  const result = [
    ...matches.filter(isInTitle),
    ...matches.filter((entry) => !isInTitle(entry)),
  ].map((entry) => entry.recipe);

  return result;
}
