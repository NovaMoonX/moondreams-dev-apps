import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

import { db, storage } from '@lib/firebase/config';
import { deleteFile } from '@lib/firebase/storage';

import { resizeImageToWebp } from '@/utils/imageCompression';
import { generateUuid } from '@/utils/idUtils';
import {
  RECEIPT_MAX_BYTES,
  RECEIPT_MAX_DIMENSION,
  SPEND_WORDS,
} from '@apps/runway/constants';
import { sealBytes, sealJson } from '@apps/runway/security';
import type {
  ReceiptImageDoc,
  ReceiptImageSealed,
  RunwayEncryption,
} from '@apps/runway/types';

export const getReceiptObjectPath = (
  uid: string,
  purchaseId: string,
  imageId: string,
) => `apps/runway/receipts/${uid}/${purchaseId}/${imageId}`;

const imagesRef = (uid: string, purchaseId: string) =>
  collection(
    db,
    'apps',
    'runway',
    'plans',
    uid,
    'purchases',
    purchaseId,
    'receiptImages',
  );

/** Shrinks a photo, seals it on this device and uploads the sealed bytes, then writes the document that names them; an upload whose document did not write is deleted again. */
export async function addReceiptImage(
  uid: string,
  encryption: RunwayEncryption,
  purchaseId: string,
  file: File,
): Promise<void> {
  if (!file.type.startsWith('image/')) {
    throw new Error(SPEND_WORDS.receiptNotImage);
  }
  const shrunk = await resizeImageToWebp(file, RECEIPT_MAX_DIMENSION);
  if (shrunk.size > RECEIPT_MAX_BYTES) {
    throw new Error(SPEND_WORDS.receiptTooBig);
  }
  const sealedBytes = await sealBytes(
    new Uint8Array(await shrunk.arrayBuffer()),
    encryption,
  );
  const id = generateUuid();
  const path = getReceiptObjectPath(uid, purchaseId, id);
  await uploadBytes(ref(storage, path), sealedBytes.bytes, {
    contentType: 'application/octet-stream',
  });
  try {
    await setDoc(doc(imagesRef(uid, purchaseId), id), {
      id,
      purchaseId,
      createdAt: Date.now(),
      bytes: sealedBytes.bytes.length,
      sealed: await sealJson(
        {
          fileName: shrunk.name || null,
          contentType: shrunk.type,
          nonce: sealedBytes.nonce,
        } satisfies ReceiptImageSealed,
        encryption,
      ),
    } satisfies ReceiptImageDoc);
  } catch (error) {
    await deleteFile(path).catch(() => undefined);
    throw error;
  }
}

/** Adds each photo one after another, so a phone shrinks one at a time; answers how many did not upload. */
export function addReceiptImages(
  uid: string,
  encryption: RunwayEncryption,
  purchaseId: string,
  files: readonly File[],
): Promise<number> {
  return files.reduce(async (failed, file) => {
    const count = await failed;
    try {
      await addReceiptImage(uid, encryption, purchaseId, file);
      return count;
    } catch (error) {
      console.error('A receipt did not upload', error);
      return count + 1;
    }
  }, Promise.resolve(0));
}

/** Removes the document, then the sealed bytes; a missing object is not an error. */
export async function removeReceiptImage(
  uid: string,
  image: { id: string; purchaseId: string },
): Promise<void> {
  await deleteDoc(doc(imagesRef(uid, image.purchaseId), image.id));
  await deleteFile(getReceiptObjectPath(uid, image.purchaseId, image.id));
}

/** Removes every receipt a purchase has; used after the purchase itself is gone. */
export async function removeReceiptImagesOf(
  uid: string,
  purchaseId: string,
): Promise<void> {
  const found = await getDocs(imagesRef(uid, purchaseId));
  await Promise.all(
    found.docs.map((entry) =>
      removeReceiptImage(uid, { id: entry.id, purchaseId }),
    ),
  );
}
