import type { ActiveFilter } from '@/components/FilterBar';
import {
  INGREDIENT_FLAG_OPTIONS,
  INGREDIENT_PRICE_FILTER_OPTIONS,
} from '@apps/pinch/constants';
import type {
  Product,
  ResolvedFamily,
  ResolvedIngredient,
} from '@apps/pinch/types';

export type IngredientPriceFilter =
  (typeof INGREDIENT_PRICE_FILTER_OPTIONS)[number]['value'];
export type IngredientFlag = (typeof INGREDIENT_FLAG_OPTIONS)[number]['value'];

export interface IngredientFilters {
  price: IngredientPriceFilter;
  flags: IngredientFlag[];
  familyIds: string[];
}

export const NO_INGREDIENT_FILTERS: IngredientFilters = {
  price: 'any',
  flags: [],
  familyIds: [],
};

const PRICE_KEY = 'price';
const FLAG_PREFIX = 'flag:';
const FAMILY_PREFIX = 'family:';

const FLAG_LABELS = new Map<string, string>(
  INGREDIENT_FLAG_OPTIONS.map((option) => [option.value, option.label]),
);

export function getActiveIngredientFilters(
  filters: IngredientFilters,
  familiesById: Map<string, ResolvedFamily>,
): ActiveFilter[] {
  const priceLabel = INGREDIENT_PRICE_FILTER_OPTIONS.find(
    (option) => option.value === filters.price,
  )?.label;
  const result = [
    ...(filters.price === 'any' || !priceLabel
      ? []
      : [{ key: PRICE_KEY, label: priceLabel }]),
    ...filters.flags.map((flag) => ({
      key: `${FLAG_PREFIX}${flag}`,
      label: FLAG_LABELS.get(flag) ?? flag,
    })),
    ...filters.familyIds.map((id) => ({
      key: `${FAMILY_PREFIX}${id}`,
      label: familiesById.get(id)?.name ?? 'Removed family',
    })),
  ];

  return result;
}

export function removeIngredientFilter(
  filters: IngredientFilters,
  key: string,
): IngredientFilters {
  if (key === PRICE_KEY) {
    return { ...filters, price: 'any' };
  }
  if (key.startsWith(FLAG_PREFIX)) {
    return {
      ...filters,
      flags: filters.flags.filter(
        (flag) => flag !== key.slice(FLAG_PREFIX.length),
      ),
    };
  }
  return {
    ...filters,
    familyIds: filters.familyIds.filter(
      (id) => id !== key.slice(FAMILY_PREFIX.length),
    ),
  };
}

const isMissingNutrition = (ingredient: ResolvedIngredient) =>
  Object.values(ingredient.per100g).some((value) => value === null);

interface FilterContext {
  defaultProducts: Map<string, Product>;
  usedIds: Set<string>;
}

/** One pass over the ingredients, keeping the ones every active filter allows. */
export function applyIngredientFilters(
  ingredients: ResolvedIngredient[],
  filters: IngredientFilters,
  { defaultProducts, usedIds }: FilterContext,
): ResolvedIngredient[] {
  const families = new Set(filters.familyIds);
  const wantsNoNutrition = filters.flags.includes('noNutrition');
  const wantsCustom = filters.flags.includes('custom');
  const isUnfiltered =
    filters.price === 'any' &&
    families.size === 0 &&
    filters.flags.length === 0;

  const matches = (ingredient: ResolvedIngredient) => {
    const hasPrice = defaultProducts.has(ingredient.id);
    return (
      (filters.price === 'any' ||
        (filters.price === 'has'
          ? hasPrice
          : !hasPrice && usedIds.has(ingredient.id))) &&
      (families.size === 0 || families.has(ingredient.familyId ?? '')) &&
      (!wantsCustom || ingredient.isCustom) &&
      (!wantsNoNutrition || isMissingNutrition(ingredient))
    );
  };
  const result = isUnfiltered ? ingredients : ingredients.filter(matches);

  return result;
}
