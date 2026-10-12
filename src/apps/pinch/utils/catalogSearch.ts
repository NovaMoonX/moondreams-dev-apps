import { CATALOG_FAMILIES, CATALOG_INGREDIENTS } from '@apps/pinch/catalog';
import type { CatalogFamily, CatalogIngredient } from '@apps/pinch/types';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SEARCH_INDEX = CATALOG_INGREDIENTS.map((ingredient) => ({
  ingredient,
  name: normalize(ingredient.name),
  haystack: normalize([ingredient.name, ...ingredient.aliases].join(' ')),
}));

/** Catalog ingredients whose name or an alias contains every word typed, names that start with the text first. */
export function searchCatalog(query: string): CatalogIngredient[] {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) {
    return CATALOG_INGREDIENTS;
  }

  const typed = words.join(' ');
  const matches = SEARCH_INDEX.filter((entry) =>
    words.every((word) => entry.haystack.includes(word)),
  );
  const result = [...matches]
    .sort(
      (a, b) =>
        Number(b.name.startsWith(typed)) - Number(a.name.startsWith(typed)) ||
        a.name.localeCompare(b.name),
    )
    .map((entry) => entry.ingredient);

  return result;
}

export interface FamilyGroupData {
  family: CatalogFamily;
  ingredients: CatalogIngredient[];
}

const FAMILIES_BY_NAME = [...CATALOG_FAMILIES].sort((a, b) =>
  a.name.localeCompare(b.name),
);

/** Ingredients bucketed under their family in one pass, families and ingredients alphabetical, empty families dropped. */
export function groupByFamily(
  ingredients: CatalogIngredient[],
): FamilyGroupData[] {
  const buckets = ingredients.reduce((acc, ingredient) => {
    const key = ingredient.familyId ?? '';
    acc.set(key, [...(acc.get(key) ?? []), ingredient]);
    return acc;
  }, new Map<string, CatalogIngredient[]>());

  const result = FAMILIES_BY_NAME.flatMap((family) => {
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
  });

  return result;
}
