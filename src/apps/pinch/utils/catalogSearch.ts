import type { ResolvedFamily, ResolvedIngredient } from '@apps/pinch/types';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// An ingredient object is replaced when it changes, so its normalized text is built once per object.
const SEARCH_TEXT = new WeakMap<
  ResolvedIngredient,
  { name: string; haystack: string }
>();

const getSearchText = (ingredient: ResolvedIngredient) => {
  const cached = SEARCH_TEXT.get(ingredient);
  if (cached) {
    return cached;
  }
  const entry = {
    name: normalize(ingredient.name),
    haystack: normalize([ingredient.name, ...ingredient.aliases].join(' ')),
  };
  SEARCH_TEXT.set(ingredient, entry);
  return entry;
};

/** Ingredients whose name or an alias contains every word typed, names that start with the text first. */
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
    .filter((ingredient) =>
      words.every((word) => getSearchText(ingredient).haystack.includes(word)),
    )
    .sort(
      (a, b) =>
        Number(getSearchText(b).name.startsWith(typed)) -
          Number(getSearchText(a).name.startsWith(typed)) ||
        a.name.localeCompare(b.name),
    );

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
