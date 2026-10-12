import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';
import { CATALOG_FAMILIES } from '@apps/pinch/catalog';
import type { ResolvedFamily } from '@apps/pinch/types';
import { resolveIngredients } from '@apps/pinch/utils/resolveIngredient';

const selectRecords = (state: RootState) => state.pinch.ingredients.records;
const selectFamilyItems = (state: RootState) => state.pinch.families.items;

export const selectIsPinchLoaded = (state: RootState) =>
  state.pinch.ingredients.isLoaded && state.pinch.families.isLoaded;

export const selectPinchLoadError = (state: RootState) =>
  state.pinch.ingredients.loadError ?? state.pinch.families.loadError;

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
