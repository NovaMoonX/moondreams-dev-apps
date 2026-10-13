import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { freezeBeforeEdit } from '@apps/pinch/store/actions/freezeActions';
import type { Product, Unit } from '@apps/pinch/types';
import { buildCatalogRecord } from '@apps/pinch/utils/ingredientRecord';
import { getGapKeys } from '@apps/pinch/utils/gaps';

const kitchenDoc = (uid: string, collectionName: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, collectionName, id);

export interface ProductDraft {
  /** The product being edited; null adds a new one. */
  id: string | null;
  ingredientId: string;
  storeId: string;
  label: string | null;
  priceCents: number;
  sizeAmount: number;
  sizeUnit: Unit;
  url: string | null;
  makeDefault: boolean;
}

interface SaveProductInput {
  uid: string;
  draft: ProductDraft;
}

/** Writes the product and, when it becomes the ingredient's default, the ingredient's pointer to it in the same batch (a catalog ingredient gets its record on the way). Any closed price or size nudge for the ingredient is reopened in that batch. */
export const saveProduct = createAsyncThunk<
  string,
  SaveProductInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/products/save',
  async ({ uid, draft }, { getState, rejectWithValue }) => {
    const now = Date.now();
    const productId = draft.id ?? generateUuid();
    const { records } = getState().pinch.ingredients;
    const { items: products } = getState().pinch.products;
    const record =
      records.find((candidate) => candidate.id === draft.ingredientId) ?? null;
    const hasOthers = products.some(
      (product) =>
        product.ingredientId === draft.ingredientId && product.id !== productId,
    );
    const becomesDefault = draft.makeDefault || !hasOthers;

    try {
      await freezeBeforeEdit(uid, getState());
      const batch = writeBatch(db);
      const productRef = kitchenDoc(uid, 'products', productId);
      if (draft.id) {
        batch.update(productRef, {
          storeId: draft.storeId,
          label: draft.label,
          priceCents: draft.priceCents,
          sizeAmount: draft.sizeAmount,
          sizeUnit: draft.sizeUnit,
          url: draft.url,
          updatedAt: now,
        });
      } else {
        const product: Product = {
          id: productId,
          ingredientId: draft.ingredientId,
          storeId: draft.storeId,
          label: draft.label,
          priceCents: draft.priceCents,
          sizeAmount: draft.sizeAmount,
          sizeUnit: draft.sizeUnit,
          url: draft.url,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(productRef, product);
      }

      if (becomesDefault) {
        const recordRef = kitchenDoc(uid, 'ingredients', draft.ingredientId);
        if (record) {
          batch.update(recordRef, {
            defaultProductId: productId,
            updatedAt: now,
            ...('gramsPerMl' in record ? {} : { gramsPerMl: null }),
            ...('gramsEach' in record ? {} : { gramsEach: null }),
            ...('isArchived' in record ? {} : { isArchived: false }),
          });
        } else {
          batch.set(
            recordRef,
            buildCatalogRecord(draft.ingredientId, productId, now),
          );
        }
      }
      const dismissed =
        getState().pinch.settings.settings?.dismissedNudges ?? {};
      const closedKeys = getGapKeys(draft.ingredientId).filter(
        (key) => key in dismissed,
      );
      if (closedKeys.length > 0) {
        batch.update(
          doc(db, 'apps', 'pinch', 'kitchens', uid),
          'updatedAt',
          now,
          ...closedKeys.flatMap((key) => [
            new FieldPath('dismissedNudges', key),
            deleteField(),
          ]),
        );
      }
      await batch.commit();
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this product.'),
      );
    }

    return productId;
  },
);

interface SetDefaultProductInput {
  uid: string;
  ingredientId: string;
  productId: string;
}

/** Points the ingredient at one of its products, after confirming in a transaction that the product still exists. */
export const setDefaultProduct = createAsyncThunk<
  string,
  SetDefaultProductInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/products/setDefault',
  async ({ uid, ingredientId, productId }, { getState, rejectWithValue }) => {
    try {
      await freezeBeforeEdit(uid, getState());
      await runTransaction(db, async (transaction) => {
        const productSnapshot = await transaction.get(
          kitchenDoc(uid, 'products', productId),
        );
        if (
          !productSnapshot.exists() ||
          (productSnapshot.data() as Product).ingredientId !== ingredientId
        ) {
          throw new Error('That product has just been removed.');
        }

        const recordRef = kitchenDoc(uid, 'ingredients', ingredientId);
        const recordSnapshot = await transaction.get(recordRef);
        const now = Date.now();
        if (recordSnapshot.exists()) {
          transaction.update(recordRef, {
            defaultProductId: productId,
            updatedAt: now,
            ...('gramsPerMl' in recordSnapshot.data()
              ? {}
              : { gramsPerMl: null }),
            ...('gramsEach' in recordSnapshot.data()
              ? {}
              : { gramsEach: null }),
            ...('isArchived' in recordSnapshot.data()
              ? {}
              : { isArchived: false }),
          });
        } else {
          transaction.set(
            recordRef,
            buildCatalogRecord(ingredientId, productId, now),
          );
        }
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to change the default product.'),
      );
    }

    return productId;
  },
);

interface RemoveProductInput {
  uid: string;
  id: string;
}

/** Deletes the product; if it was the default, the ingredient is re-pointed to another product that still exists, or to none, in the same transaction. */
export const removeProduct = createAsyncThunk<
  string,
  RemoveProductInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/products/remove',
  async ({ uid, id }, { getState, rejectWithValue }) => {
    const target = getState().pinch.products.items.find(
      (product) => product.id === id,
    );
    const candidateId =
      [...getState().pinch.products.items]
        .filter(
          (product) =>
            target &&
            product.ingredientId === target.ingredientId &&
            product.id !== id,
        )
        .sort((a, b) => a.createdAt - b.createdAt)[0]?.id ?? null;

    try {
      await freezeBeforeEdit(uid, getState());
      if (!target) {
        await deleteDoc(kitchenDoc(uid, 'products', id));
        return id;
      }

      await runTransaction(db, async (transaction) => {
        const recordRef = kitchenDoc(uid, 'ingredients', target.ingredientId);
        const recordSnapshot = await transaction.get(recordRef);
        const candidateSnapshot = candidateId
          ? await transaction.get(kitchenDoc(uid, 'products', candidateId))
          : null;

        transaction.delete(kitchenDoc(uid, 'products', id));
        if (
          recordSnapshot.exists() &&
          recordSnapshot.data().defaultProductId === id
        ) {
          transaction.update(recordRef, {
            defaultProductId: candidateSnapshot?.exists() ? candidateId : null,
            updatedAt: Date.now(),
          });
        }
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to remove this product.'),
      );
    }

    return id;
  },
);
