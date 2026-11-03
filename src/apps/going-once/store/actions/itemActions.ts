import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  deleteDoc,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
  type DocumentReference,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import { generateUuid } from '@/utils';
import { getStorageErrorMessage } from '@/utils/errorUtils';
import { MAX_ITEM_PHOTOS } from '@apps/going-once/constants';
import { photoUploadEnded, photoUploadStarted } from '@apps/going-once/store';
import type { Item, ItemPhoto } from '@apps/going-once/types';

/** The answers a person gives about a thing in this flow. */
export type ItemFields = Partial<
  Pick<
    Item,
    | 'title'
    | 'condition'
    | 'askingPriceCents'
    | 'floorPriceCents'
    | 'description'
    | 'brandModel'
    | 'size'
    | 'originalPriceCents'
    | 'showOriginalPrice'
    | 'boughtFrom'
    | 'boughtOn'
    | 'boughtUrl'
    | 'boughtUrlPreview'
    | 'notes'
  >
>;

const getItemRef = (saleId: string, itemId: string): DocumentReference =>
  doc(db, 'apps', 'going-once', 'sales', saleId, 'items', itemId);

const readImageSize = async (file: File) => {
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/** Writes a new thing from its first answer, so it starts Not listed yet; the write is queued offline. */
export function createItem(
  saleId: string,
  itemId: string,
  uid: string,
  fields: ItemFields,
): Promise<void> {
  const item: Item = {
    id: itemId,
    saleId,
    title: '',
    condition: null,
    askingPriceCents: null,
    floorPriceCents: null,
    description: null,
    brandModel: null,
    size: null,
    originalPriceCents: null,
    showOriginalPrice: false,
    boughtFrom: null,
    boughtOn: null,
    boughtUrl: null,
    boughtUrlPreview: null,
    notes: null,
    photos: [],
    status: 'AVAILABLE',
    pending: null,
    sale: null,
    statusHistory: [],
    listingCopiedAt: null,
    listingCopiedBy: null,
    createdBy: uid,
    createdAt: Date.now(),
    lastEditedAt: null,
    lastEditedBy: null,
    ...fields,
  };
  return setDoc(getItemRef(saleId, itemId), item);
}

/** Saves only the fields given, never `status` or `photos`; the write is queued offline. */
export function updateItemFields(
  saleId: string,
  itemId: string,
  uid: string,
  fields: ItemFields,
): Promise<void> {
  return updateDoc(getItemRef(saleId, itemId), {
    ...fields,
    lastEditedAt: Date.now(),
    lastEditedBy: uid,
  });
}

/** Remembers who copied the listing text last; touches only those two fields, so it never counts as an edit. */
export function markListingCopied(
  saleId: string,
  itemId: string,
  uid: string,
): Promise<void> {
  return updateDoc(getItemRef(saleId, itemId), {
    listingCopiedAt: Date.now(),
    listingCopiedBy: uid,
  });
}

const describeSaveFailure = (error: unknown) => {
  const reason = error instanceof Error ? error.message : '';
  if (reason === 'full')
    return `A thing can have ${MAX_ITEM_PHOTOS} photos at most.`;
  if (reason === 'missing') return 'This thing is no longer here.';
  return "This photo didn't save. Check your connection and try again.";
};

interface AddItemPhotoInput {
  saleId: string;
  itemId: string;
  uid: string;
  /** Already shrunk to the listing size. */
  file: File;
}

/** Uploads one photo, then adds it to the thing in a transaction that refuses a 13th; resolves with the new photo's id. */
export const addItemPhoto = createAsyncThunk<
  string,
  AddItemPhotoInput,
  { rejectValue: string }
>(
  'goingOnce/items/addPhoto',
  async ({ saleId, itemId, uid, file }, { dispatch, rejectWithValue }) => {
    const photoId = generateUuid();
    const path = `apps/going-once/sales/${saleId}/items/${itemId}/${photoId}.jpg`;
    const { width, height } = await readImageSize(file);
    const photo: ItemPhoto = {
      id: photoId,
      path,
      width,
      height,
      sizeBytes: file.size,
      createdAt: Date.now(),
    };

    dispatch(photoUploadStarted(itemId));
    try {
      await uploadFile(path, file);
    } catch (error) {
      return rejectWithValue(
        getStorageErrorMessage(
          error,
          "This photo didn't upload. Check your connection and try again.",
        ),
      );
    } finally {
      dispatch(photoUploadEnded(itemId));
    }

    const ref = getItemRef(saleId, itemId);
    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error('missing');
        const photos = (snapshot.data().photos ?? []) as ItemPhoto[];
        if (photos.length >= MAX_ITEM_PHOTOS) throw new Error('full');
        transaction.update(ref, {
          photos: [...photos, photo],
          lastEditedAt: Date.now(),
          lastEditedBy: uid,
        });
      });
    } catch (error) {
      // A commit whose answer was lost may still have gone through; the file stays unless the thing doesn't list it.
      const isListed = await getDoc(ref)
        .then((snapshot) =>
          ((snapshot.data()?.photos ?? []) as ItemPhoto[]).some(
            (found) => found.id === photoId,
          ),
        )
        .catch(() => true);
      if (!isListed) await deleteFile(path).catch(() => undefined);
      return rejectWithValue(describeSaveFailure(error));
    }
    return photoId;
  },
);

/** Saves the photos in the order given (the first is the cover); a photo added meanwhile stays at the end. */
export async function reorderItemPhotos(
  saleId: string,
  itemId: string,
  uid: string,
  orderedIds: string[],
): Promise<void> {
  const ref = getItemRef(saleId, itemId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const photos = (snapshot.data()?.photos ?? []) as ItemPhoto[];
    const ordered = orderedIds.flatMap((id) =>
      photos.filter((photo) => photo.id === id),
    );
    const rest = photos.filter((photo) => !orderedIds.includes(photo.id));
    transaction.update(ref, {
      photos: [...ordered, ...rest],
      lastEditedAt: Date.now(),
      lastEditedBy: uid,
    });
  });
}

/** Takes a photo off the thing, then deletes its file; the file is only deleted once the thing no longer lists it. */
export async function removeItemPhoto(
  saleId: string,
  itemId: string,
  uid: string,
  photoId: string,
): Promise<void> {
  const ref = getItemRef(saleId, itemId);
  const removed = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const photos = (snapshot.data()?.photos ?? []) as ItemPhoto[];
    const found = photos.find((photo) => photo.id === photoId) ?? null;
    if (found === null) return null;
    transaction.update(ref, {
      photos: photos.filter((photo) => photo.id !== photoId),
      lastEditedAt: Date.now(),
      lastEditedBy: uid,
    });
    return found;
  });
  if (removed !== null)
    await deleteFile(removed.path).catch((error: unknown) =>
      console.error(`Could not delete ${removed.path}`, error),
    );
}

/**
 * Deletes the thing, then its photo files once it is gone (a file that won't delete is logged, and the sale's delete sweeps it).
 * The write queues offline and never settles there, so the caller isn't held on it: `onFailed` hears a refusal.
 */
export function deleteItem(
  saleId: string,
  item: Pick<Item, 'id' | 'photos'>,
  onFailed: (error: unknown) => void,
): void {
  void deleteDoc(getItemRef(saleId, item.id)).then(
    () =>
      Promise.all(
        item.photos.map((photo) =>
          deleteFile(photo.path).catch((error: unknown) =>
            console.error(`Could not delete ${photo.path}`, error),
          ),
        ),
      ),
    onFailed,
  );
}
