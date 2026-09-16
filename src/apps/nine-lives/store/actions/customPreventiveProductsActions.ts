import { createAsyncThunk } from '@reduxjs/toolkit';
import { collection, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import type { CustomPreventiveProduct } from '@apps/nine-lives/types';

import { upsertCustomPreventiveProduct } from '../slices/customPreventiveProductsSlice';

const getProductsCollectionRef = (householdId: string) =>
  collection(
    db,
    'apps',
    'nine-lives',
    'households',
    householdId,
    'customPreventiveProducts',
  );

export const createCustomPreventiveProduct = createAsyncThunk<
  CustomPreventiveProduct,
  { householdId: string; uid: string; label: string },
  { rejectValue: string }
>(
  'nineLives/customPreventiveProducts/create',
  async ({ householdId, uid, label }, { dispatch, getState, rejectWithValue }) => {
    const trimmedLabel = label.trim();

    if (!trimmedLabel) {
      return rejectWithValue('Custom product name is required.');
    }

    const state = getState() as RootState;
    const existing = state.nineLives.customPreventiveProducts.items.find(
      (product) =>
        product.householdId === householdId &&
        product.label.trim().toLowerCase() === trimmedLabel.toLowerCase(),
    );

    if (existing) {
      return existing;
    }

    const productId = doc(getProductsCollectionRef(householdId)).id;
    const nextProduct: CustomPreventiveProduct = {
      id: productId,
      householdId,
      label: trimmedLabel,
      createdBy: uid,
      createdAt: Date.now(),
    };

    await setDoc(doc(getProductsCollectionRef(householdId), productId), nextProduct);
    dispatch(upsertCustomPreventiveProduct(nextProduct));

    return nextProduct;
  },
);
