import { createAsyncThunk } from '@reduxjs/toolkit';
import { deleteDoc, doc, runTransaction, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import type { RootState } from '@/store';
import { generateUuid } from '@/utils';
import { getErrorMessage } from '@/utils/errorUtils';
import { resizeImageToWebp } from '@/utils/imageCompression';
import { CATALOG_STORES_BY_ID } from '@apps/pinch/catalog/catalogStores';
import { STORE_IMAGE_MAX_DIMENSION } from '@apps/pinch/constants';
import type { Store } from '@apps/pinch/types';

const storeDoc = (uid: string, id: string) =>
  doc(db, 'apps', 'pinch', 'kitchens', uid, 'stores', id);

export const getStoreImagePath = (uid: string, storeId: string) =>
  `apps/pinch/kitchens/${uid}/stores/${storeId}/logo.webp`;

interface EnsureCatalogStoreInput {
  uid: string;
  catalogStoreId: string;
}

/** Makes the person's own copy of a well-known store, once: its document id is the catalog id, so a double tap can only ever make one. Returns that id. */
export const ensureCatalogStore = createAsyncThunk<
  string,
  EnsureCatalogStoreInput,
  { rejectValue: string }
>(
  'pinch/stores/ensureCatalog',
  async ({ uid, catalogStoreId }, { rejectWithValue }) => {
    const catalogStore = CATALOG_STORES_BY_ID.get(catalogStoreId);
    if (!catalogStore) {
      return rejectWithValue('That store is not on the list.');
    }

    try {
      await runTransaction(db, async (transaction) => {
        const ref = storeDoc(uid, catalogStore.id);
        if ((await transaction.get(ref)).exists()) {
          return;
        }
        const now = Date.now();
        const store: Store = {
          id: catalogStore.id,
          name: catalogStore.name,
          catalogStoreId: catalogStore.id,
          imagePath: null,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(ref, store);
      });
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to add this store.'),
      );
    }

    return catalogStore.id;
  },
);

interface SaveStoreInput {
  uid: string;
  /** The store being renamed or re-imaged; null adds a new one of the person's own. */
  id: string | null;
  name: string;
  /** A new image to upload, if one was picked. */
  imageFile: File | null;
  removeImage: boolean;
}

export const saveStore = createAsyncThunk<
  string,
  SaveStoreInput,
  { state: RootState; rejectValue: string }
>(
  'pinch/stores/save',
  async (
    { uid, id, name, imageFile, removeImage },
    { getState, rejectWithValue },
  ) => {
    const now = Date.now();
    const storeId = id ?? generateUuid();
    const existing = id
      ? (getState().pinch.stores.items.find((store) => store.id === id) ?? null)
      : null;
    const path = getStoreImagePath(uid, storeId);

    try {
      if (imageFile) {
        await uploadFile(
          path,
          await resizeImageToWebp(imageFile, STORE_IMAGE_MAX_DIMENSION),
        );
      } else if (removeImage && existing?.imagePath) {
        await deleteFile(existing.imagePath);
      }

      const imagePath = imageFile
        ? path
        : removeImage
          ? null
          : (existing?.imagePath ?? null);
      if (existing) {
        await updateDoc(storeDoc(uid, storeId), {
          ...(existing.catalogStoreId === null && { name: name.trim() }),
          imagePath,
          updatedAt: now,
        });
      } else {
        const store: Store = {
          id: storeId,
          name: name.trim(),
          catalogStoreId: null,
          imagePath,
          createdAt: now,
          updatedAt: now,
        };
        await runTransaction(db, async (transaction) => {
          transaction.set(storeDoc(uid, storeId), store);
        });
      }
    } catch (error) {
      return rejectWithValue(
        getErrorMessage(error, 'Unable to save this store.'),
      );
    }

    return storeId;
  },
);

interface RemoveStoreInput {
  uid: string;
  id: string;
}

/** Deletes the store and its image; products that point at it arrive with Issue 5, which keeps them with their store shown as "Removed store". */
export const removeStore = createAsyncThunk<
  string,
  RemoveStoreInput,
  { state: RootState; rejectValue: string }
>('pinch/stores/remove', async ({ uid, id }, { getState, rejectWithValue }) => {
  const existing = getState().pinch.stores.items.find(
    (store) => store.id === id,
  );

  try {
    await deleteDoc(storeDoc(uid, id));
    if (existing?.imagePath) {
      await deleteFile(existing.imagePath).catch(() => undefined);
    }
  } catch (error) {
    return rejectWithValue(
      getErrorMessage(error, 'Unable to remove this store.'),
    );
  }

  return id;
});
