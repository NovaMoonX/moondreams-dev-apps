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

import { auth, db } from '@/lib/firebase/config';
import { deleteFile, uploadFile } from '@/lib/firebase/storage';
import { generateUuid } from '@/utils';
import { getStorageErrorMessage } from '@/utils/errorUtils';
import {
  MAX_ITEM_PHOTOS,
  MAX_STATUS_HISTORY,
} from '@apps/going-once/constants';
import { photoUploadEnded, photoUploadStarted } from '@apps/going-once/store';
import {
  bundleRef,
  isUnavailable,
} from '@apps/going-once/store/actions/statusActions';
import { toBundle } from '@apps/going-once/store/listeners/toBundle';
import { toItem } from '@apps/going-once/store/listeners/toItem';
import type { Item, ItemPhoto } from '@apps/going-once/types';
import {
  adjustBundlePrice,
  appendBundleChange,
} from '@apps/going-once/utils/bundles';

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
    | 'showBoughtUrl'
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

/** Writes a new thing from its first answer as a draft, which buyers never see until it is saved; the write is queued offline. */
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
    showBoughtUrl: false,
    notes: null,
    isDraft: true,
    photos: [],
    status: 'AVAILABLE',
    pending: null,
    sale: null,
    statusHistory: [],
    bundleId: null,
    isBundleOnly: false,
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

/** Saves only the fields given, never `status` or `photos`; `isFinishing` also takes the thing out of draft. The write is queued offline. */
export function updateItemFields(
  saleId: string,
  itemId: string,
  uid: string,
  fields: ItemFields,
  isFinishing = false,
): Promise<void> {
  return updateDoc(getItemRef(saleId, itemId), {
    ...fields,
    ...(isFinishing ? { isDraft: false } : {}),
    lastEditedAt: Date.now(),
    lastEditedBy: uid,
  });
}

/** Takes a thing out of draft so buyers can be shown it (once it has a photo, a name and a price); the write is queued offline. */
export function markItemSaved(
  saleId: string,
  itemId: string,
  uid: string,
): Promise<void> {
  return updateDoc(getItemRef(saleId, itemId), {
    isDraft: false,
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

/** Deletes a bundled thing and takes it out of its bundle in one transaction: an offer's price drops by what the thing was asking, and a bundle left with nothing goes too. */
async function deleteBundledItem(
  saleId: string,
  itemId: string,
  bundleId: string,
) {
  const ref = getItemRef(saleId, itemId);
  await runTransaction(db, async (transaction) => {
    const bundleSnapshot = await transaction.get(bundleRef(saleId, bundleId));
    const thingSnapshot = await transaction.get(ref);
    if (!bundleSnapshot.exists()) {
      transaction.delete(ref);
      return;
    }
    const bundle = toBundle(bundleSnapshot.id, saleId, bundleSnapshot.data());
    const thing = thingSnapshot.exists()
      ? toItem(itemId, saleId, thingSnapshot.data())
      : null;
    const remainingIds = bundle.itemIds.filter((id) => id !== itemId);
    const isLeavingOffer =
      bundle.status === 'ACTIVE' && thing?.status === 'AVAILABLE';
    const others = isLeavingOffer
      ? (
          await Promise.all(
            remainingIds.map((id) => transaction.get(getItemRef(saleId, id))),
          )
        )
          .filter((found) => found.exists())
          .map((found) => toItem(found.id, saleId, found.data()))
      : [];
    transaction.delete(ref);
    if (remainingIds.length === 0) {
      transaction.delete(bundleRef(saleId, bundleId));
      return;
    }
    const asking = thing?.askingPriceCents ?? 0;
    const priceCents = isLeavingOffer
      ? adjustBundlePrice(
          bundle.priceCents,
          -asking,
          others
            .filter((other) => other.status === 'AVAILABLE')
            .reduce((total, other) => total + (other.askingPriceCents ?? 0), 0),
        )
      : bundle.priceCents;
    const now = Date.now();
    const uid = auth.currentUser?.uid ?? '';
    transaction.update(bundleRef(saleId, bundleId), {
      itemIds: remainingIds,
      dealItemIds: bundle.dealItemIds?.filter((id) => id !== itemId) ?? null,
      priceCents,
      history: isLeavingOffer
        ? appendBundleChange(
            bundle.history,
            {
              kind: 'THING_LEFT',
              byUid: uid,
              at: now,
              itemId,
              itemStatus: null,
              priceCents,
              fromPriceCents: bundle.priceCents,
            },
            MAX_STATUS_HISTORY,
          )
        : bundle.history,
      lastEditedAt: now,
      lastEditedBy: uid,
    });
  });
}

/**
 * Deletes the thing, then its photo files once it is gone (a file that won't delete is logged, and the sale's delete sweeps it).
 * A bundled thing is also taken out of its bundle in the same transaction, which needs a connection; offline it is deleted alone and the bundle simply skips it.
 * The write queues offline and never settles there, so the caller isn't held on it: `onFailed` hears a refusal.
 */
export function deleteItem(
  saleId: string,
  item: Pick<Item, 'id' | 'photos'> & Partial<Pick<Item, 'bundleId'>>,
  onFailed: (error: unknown) => void,
): void {
  const deleteAlone = () => deleteDoc(getItemRef(saleId, item.id));
  const bundleId = item.bundleId ?? null;
  const deleted =
    bundleId === null
      ? deleteAlone()
      : deleteBundledItem(saleId, item.id, bundleId).catch((error: unknown) => {
          if (isUnavailable(error)) return deleteAlone();
          throw error;
        });
  void deleted.then(
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
