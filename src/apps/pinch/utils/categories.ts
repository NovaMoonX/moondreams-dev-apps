import {
  CATEGORY_FILTER_ANY,
  CATEGORY_FILTER_NONE,
  DISH_CATEGORIES,
} from '@apps/pinch/constants';
import type { DishCategory } from '@apps/pinch/types';

/** A recipe or saved meal written before categories has no key. */
interface HasCategories {
  categories?: readonly string[] | null;
}

export const getCategories = (item: HasCategories): DishCategory[] => {
  const held = new Set(item.categories ?? []);
  const result = DISH_CATEGORIES.map((category) => category.value).filter(
    (value) => held.has(value),
  );

  return result;
};

export const getCategoryLabels = (categories: readonly DishCategory[]) =>
  DISH_CATEGORIES.filter((category) => categories.includes(category.value)).map(
    (category) => category.label,
  );

export interface CategoryCounts {
  byCategory: Map<DishCategory, number>;
  withoutCategory: number;
}

export const getCategoryCounts = (
  items: readonly HasCategories[],
): CategoryCounts => {
  const result = items.reduce<CategoryCounts>(
    (acc, item) => {
      const held = getCategories(item);
      held.forEach((value) =>
        acc.byCategory.set(value, (acc.byCategory.get(value) ?? 0) + 1),
      );

      return held.length === 0
        ? { ...acc, withoutCategory: acc.withoutCategory + 1 }
        : acc;
    },
    { byCategory: new Map(), withoutCategory: 0 },
  );

  return result;
};

export const filterByCategory = <T extends HasCategories>(
  items: readonly T[],
  filter: string,
): T[] => {
  if (filter === CATEGORY_FILTER_ANY) return [...items];
  if (filter === CATEGORY_FILTER_NONE) {
    return items.filter((item) => getCategories(item).length === 0);
  }

  const result = items.filter((item) =>
    getCategories(item).some((value) => value === filter),
  );

  return result;
};

/** The filter's pills: "Any", each category some item holds with its count, and "No category" while some item has none. */
export const getCategoryFilterOptions = (counts: CategoryCounts) => {
  const options = [
    { value: CATEGORY_FILTER_ANY, label: 'Any' },
    ...DISH_CATEGORIES.filter((category) =>
      counts.byCategory.has(category.value),
    ).map((category) => ({
      value: category.value as string,
      label: `${category.label} · ${counts.byCategory.get(category.value)}`,
      emoji: category.emoji,
    })),
    ...(counts.withoutCategory > 0
      ? [
          {
            value: CATEGORY_FILTER_NONE,
            label: `No category · ${counts.withoutCategory}`,
          },
        ]
      : []),
  ];

  return options;
};
