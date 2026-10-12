import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, writeBatch } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { CATALOG_FAMILIES } from '@apps/pinch/catalog';
import type {
  Family,
  IngredientRecord,
  NutritionValues,
  Unit,
} from '@apps/pinch/types';

const kitchenDoc = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, collectionName, id);

export interface IngredientDraft {
  /** The record's id when editing (the catalog id for an adjusted catalog ingredient); null when adding a custom one. */
  id: string | null;
  /** Set when the draft adjusts a catalog ingredient. */
  catalogId: string | null;
  name: string;
  /** An existing family's id, or null for none. Ignored when `newFamilyName` is set, and for a catalog ingredient. */
  familyId: string | null;
  newFamilyName: string | null;
  iconKey: string | null;
  nutrition: NutritionValues | null;
  servingAmount: number | null;
  servingUnit: Unit | null;
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

interface SaveIngredientInput {
  uid: string;
  draft: IngredientDraft;
}

/** Writes a custom ingredient, or the person's changes to a catalog one, with a new family in the same batch when one was typed. */
export const saveIngredient = createAsyncThunk<
  string,
  SaveIngredientInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/ingredients/save',
  async ({ uid, draft }, { getState, rejectWithValue }) => {
    const now = Date.now();
    const { records } = getState().pinch.ingredients;
    const { items: families } = getState().pinch.families;
    const existing = draft.id
      ? (records.find((record) => record.id === draft.id) ?? null)
      : null;
    const isCatalog = draft.catalogId !== null;
    const id = draft.id ?? draft.catalogId ?? generateUuid();
    const typedFamily = draft.newFamilyName?.trim() ?? '';

    const matchedFamilyId =
      typedFamily === ''
        ? null
        : (families.find((family) => sameName(family.name, typedFamily))?.id ??
          CATALOG_FAMILIES.find((family) => sameName(family.name, typedFamily))
            ?.id ??
          null);
    const newFamily: Family | null =
      typedFamily !== '' && matchedFamilyId === null
        ? {
            id: generateUuid(),
            name: typedFamily,
            createdAt: now,
            updatedAt: now,
          }
        : null;
    const familyId = isCatalog
      ? null
      : (newFamily?.id ?? matchedFamilyId ?? draft.familyId);

    try {
      const batch = writeBatch(db);
      if (newFamily && !isCatalog) {
        batch.set(kitchenDoc(uid, 'families', newFamily.id), newFamily);
      }

      if (existing) {
        const ownedFields = {
          iconKey: draft.iconKey,
          nutritionPer100g: draft.nutrition,
          servingAmount: draft.servingAmount,
          servingUnit: draft.servingUnit,
          updatedAt: now,
        };
        batch.update(
          kitchenDoc(uid, 'ingredients', id),
          isCatalog
            ? ownedFields
            : { ...ownedFields, name: draft.name.trim(), familyId },
        );
      } else {
        const record: IngredientRecord = {
          id,
          catalogId: draft.catalogId,
          name: isCatalog ? null : draft.name.trim(),
          familyId,
          iconKey: draft.iconKey,
          nutritionPer100g: draft.nutrition,
          servingAmount: draft.servingAmount,
          servingUnit: draft.servingUnit,
          gramsPerMl: null,
          gramsEach: null,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(kitchenDoc(uid, 'ingredients', id), record);
      }
      await batch.commit();
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this ingredient.'),
      );
    }

    return id;
  },
);

interface RemoveIngredientInput {
  uid: string;
  id: string;
}

/** Deletes the person's record: a custom ingredient disappears, an adjusted catalog one goes back to the built-in values. */
export const removeIngredient = createAsyncThunk<
  string,
  RemoveIngredientInput,
  { rejectValue: string }
>('pinch/ingredients/remove', async ({ uid, id }, { rejectWithValue }) => {
  try {
    await deleteDoc(kitchenDoc(uid, 'ingredients', id));
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to remove this ingredient.'),
    );
  }

  return id;
});
