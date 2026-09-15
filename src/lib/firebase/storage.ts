import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';

import { storage } from './config';

/** Uploads `file` to `path` in Firebase Storage (overwriting any existing object) and returns its download URL. */
export async function uploadFile(path: string, file: File): Promise<string> {
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
}

/** Deletes the object at `path`. Best-effort: a missing object is not an error. */
export async function deleteFile(path: string): Promise<void> {
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    const firebaseError = error as { code?: string };

    if (firebaseError.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}
