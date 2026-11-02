import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) {
  initializeApp();
}

/** A Storage error's message can carry the object's path, which holds a link's id, so only its code is ever logged. */
export const describeError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'unknown';

/** Copies one file under its own download token, so the copy never shares an address with the original; false when there is nothing to copy, and a failed copy throws. */
export async function copyFileUnderNewToken(fromPath: string, toPath: string) {
  const bucket = getStorage().bucket();
  const source = bucket.file(fromPath);
  const [exists] = await source.exists();
  if (!exists) {
    return false;
  }

  const copy = bucket.file(toPath);
  await source.copy(copy);
  await copy.setMetadata({
    metadata: { firebaseStorageDownloadTokens: randomUUID() },
  });
  return true;
}

/** Deletes the files under a folder (all but `keep`); throws when one can't be deleted, so a caller never reports a link ended while its files are still there. */
export async function removeFolderFiles(
  prefix: string,
  keep: ReadonlySet<string> = new Set(),
) {
  const [files] = await getStorage().bucket().getFiles({ prefix });
  await Promise.all(
    files
      .filter((file) => !keep.has(file.name))
      .map((file) => file.delete({ ignoreNotFound: true })),
  );
}
