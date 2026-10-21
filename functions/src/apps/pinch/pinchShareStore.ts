import { randomUUID } from 'node:crypto';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { shareFolder } from './pinchShareView.js';

if (getApps().length === 0) {
  initializeApp();
}

export const shareRef = (shareId: string) =>
  getFirestore().doc(`apps/pinch/shares/${shareId}`);

export const shareSnapshotRef = (shareId: string) =>
  getFirestore().doc(`apps/pinch/shareSnapshots/${shareId}`);

/** A Storage error's message can carry the object's path, which holds the share's id, so only its code is ever logged. */
export const describeError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'unknown';

/** Copies one file under its own download token, so the copy never shares an address with the original; false when there is nothing to copy or the copy fails, because a cover never fails what asked for it. */
export async function copyCoverFile(
  fromPath: string,
  toPath: string,
  shareId: string,
) {
  const bucket = getStorage().bucket();
  try {
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
  } catch (error) {
    console.error('pinch share cover copy failed', {
      share: shareId.slice(0, 4),
      code: describeError(error),
    });
    return false;
  }
}

/** Deletes the files of a share (all but `keep`); throws when one can't be deleted, so a caller never reports a link ended while its covers are still there. */
export async function removeShareFiles(
  shareId: string,
  keep: ReadonlySet<string> = new Set(),
) {
  const [files] = await getStorage()
    .bucket()
    .getFiles({ prefix: shareFolder(shareId) });
  await Promise.all(
    files
      .filter((file) => !keep.has(file.name))
      .map((file) => file.delete({ ignoreNotFound: true })),
  );
}
