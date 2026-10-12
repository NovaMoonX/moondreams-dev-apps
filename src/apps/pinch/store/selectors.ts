import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { CATALOG_FAMILIES } from '@apps/pinch/catalog';
import type { Product, ResolvedFamily } from '@apps/pinch/types';
import { resolveIngredients } from '@apps/pinch/utils/resolveIngredient';

const selectRecords = (state: RootState) => state.pinch.ingredients.records;
const selectFamilyItems = (state: RootState) => state.pinch.families.items;

export const selectIsPinchLoaded = (state: RootState) =>
  state.pinch.ingredients.isLoaded &&
  state.pinch.families.isLoaded &&
  state.pinch.stores.isLoaded &&
  state.pinch.products.isLoaded &&
  state.pinch.recipes.isLoaded;

export const selectPinchLoadError = (state: RootState) =>
  state.pinch.ingredients.loadError ??
  state.pinch.families.loadError ??
  state.pinch.stores.loadError ??
  state.pinch.products.loadError ??
  state.pinch.recipes.loadError;

export const selectIngredientRecords = selectRecords;

export const selectIngredientRecordsById = createSelector(
  [selectRecords],
  (records) => new Map(records.map((record) => [record.id, record])),
);

/** Every ingredient the person can use, catalog and custom, with their changes applied. */
export const selectIngredients = createSelector([selectRecords], (records) =>
  resolveIngredients(records),
);

export const selectIngredientsById = createSelector(
  [selectIngredients],
  (ingredients) =>
    new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
);

/** Catalog families and the person's own, alphabetical. */
export const selectIngredientFamilies = createSelector(
  [selectFamilyItems],
  (families): ResolvedFamily[] => {
    const all = [
      ...CATALOG_FAMILIES.map((family) => ({
        id: family.id,
        name: family.name,
        isCustom: false,
      })),
      ...families.map((family) => ({
        id: family.id,
        name: family.name,
        isCustom: true,
      })),
    ];
    const result = [...all].sort((a, b) => a.name.localeCompare(b.name));

    return result;
  },
);

export const selectIngredientFamiliesById = createSelector(
  [selectIngredientFamilies],
  (families) => new Map(families.map((family) => [family.id, family])),
);

const selectStoreItems = (state: RootState) => state.pinch.stores.items;

/** The person's stores, alphabetical. */
export const selectStores = createSelector([selectStoreItems], (stores) =>
  [...stores].sort((a, b) => a.name.localeCompare(b.name)),
);

export const selectStoresById = createSelector(
  [selectStores],
  (stores) => new Map(stores.map((store) => [store.id, store])),
);

const selectProductItems = (state: RootState) => state.pinch.products.items;

/** Every product, newest last, so "the first product" is the one added first. */
export const selectProducts = createSelector([selectProductItems], (products) =>
  [...products].sort((a, b) => a.createdAt - b.createdAt),
);

export const selectProductsById = createSelector(
  [selectProducts],
  (products) => new Map(products.map((product) => [product.id, product])),
);

export const selectProductsByIngredient = createSelector(
  [selectProducts],
  (products) =>
    products.reduce((acc, product) => {
      acc.set(product.ingredientId, [
        ...(acc.get(product.ingredientId) ?? []),
        product,
      ]);
      return acc;
    }, new Map<string, Product[]>()),
);

/** The product that prices each ingredient: the one its record points at, else the first one added. */
export const selectDefaultProducts = createSelector(
  [selectProductsByIngredient, selectRecords],
  (byIngredient, records) => {
    const pointers = new Map(
      records.map((record) => [record.id, record.defaultProductId ?? null]),
    );

    return new Map(
      [...byIngredient.entries()].map(([ingredientId, products]) => [
        ingredientId,
        products.find((product) => product.id === pointers.get(ingredientId)) ??
          products[0],
      ]),
    );
  },
);

export const selectProductCountsByStore = createSelector(
  [selectProducts],
  (products) =>
    products.reduce(
      (acc, product) =>
        acc.set(product.storeId, (acc.get(product.storeId) ?? 0) + 1),
      new Map<string, number>(),
    ),
);

const selectRecipeItems = (state: RootState) => state.pinch.recipes.items;

/** The person's recipes, alphabetical. */
export const selectRecipes = createSelector([selectRecipeItems], (recipes) =>
  [...recipes].sort((a, b) => a.title.localeCompare(b.title)),
);

export const selectRecipesById = createSelector(
  [selectRecipes],
  (recipes) => new Map(recipes.map((recipe) => [recipe.id, recipe])),
);
