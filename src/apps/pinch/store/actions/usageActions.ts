import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  collection,
  getCountFromServer,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { RootState } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import {
  getIngredientUsage,
  getRecipeUsage,
  getStoreUsage,
  type Usage,
} from '@apps/pinch/utils/references';

export type UsageKind = 'RECIPE' | 'INGREDIENT' | 'STORE';

/** How many planned meals, in any month, list this id: the loaded window can't answer that, and the offline cache would undercount, so it fails offline instead. */
const countPlannedMeals = async (uid: string, id: string) =>
  (
    await getCountFromServer(
      query(
        collection(db, 'apps', 'pinch', 'kitchens', uid, 'plannedMeals'),
        where('refIds', 'array-contains', id),
      ),
    )
  ).data().count;

/** How many containers of a recipe are still in the fridge or freezer, read from the server for the same reason as the planned meals. */
const countContainers = async (uid: string, id: string) =>
  (
    await getCountFromServer(
      query(
        collection(db, 'apps', 'pinch', 'kitchens', uid, 'containers'),
        where('recipeId', '==', id),
        where('status', '==', 'IN_STOCK'),
      ),
    )
  ).data().count;

/** What still points at a recipe, ingredient or store: the loaded collections plus one read of the planned meals that list it. */
export async function readUsage(
  uid: string,
  state: RootState,
  kind: UsageKind,
  id: string,
): Promise<Usage> {
  const { recipes, meals, products } = state.pinch;
  if (kind === 'STORE') {
    return getStoreUsage(products.items, id);
  }

  const plannedMeals = await countPlannedMeals(uid, id);
  return kind === 'RECIPE'
    ? getRecipeUsage(
        meals.items,
        id,
        plannedMeals,
        await countContainers(uid, id),
      )
    : getIngredientUsage(
        recipes.items,
        meals.items,
        products.items,
        id,
        plannedMeals,
      );
}

interface GetUsageInput {
  uid: string;
  kind: UsageKind;
  id: string;
}

/** Asked before a delete is confirmed, so the confirm can say whether the thing will be hidden or erased. */
export const getUsage = createAsyncThunk<
  Usage,
  GetUsageInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/usage/get',
  async ({ uid, kind, id }, { getState, rejectWithValue }) => {
    try {
      return await readUsage(uid, getState(), kind, id);
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to check what uses this.'),
      );
    }
  },
);
