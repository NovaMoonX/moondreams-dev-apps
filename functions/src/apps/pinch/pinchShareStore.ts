import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  copyFileUnderNewToken,
  describeError,
  removeFolderFiles,
} from '../../share/shareFiles.js';
import { shareFolder } from './pinchShareView.js';

if (getApps().length === 0) {
  initializeApp();
}

export const shareRef = (shareId: string) =>
  getFirestore().doc(`apps/pinch/shares/${shareId}`);

export const shareSnapshotRef = (shareId: string) =>
  getFirestore().doc(`apps/pinch/shareSnapshots/${shareId}`);

/** Copies one cover under its own token; false when there is nothing to copy or the copy fails, because a cover never fails what asked for it. */
export async function copyCoverFile(
  fromPath: string,
  toPath: string,
  shareId: string,
) {
  try {
    return await copyFileUnderNewToken(fromPath, toPath);
  } catch (error) {
    console.error('pinch share cover copy failed', {
      share: shareId.slice(0, 4),
      code: describeError(error),
    });
    return false;
  }
}

/** Deletes the files of a share (all but `keep`); throws when one can't be deleted, so a caller never reports a link ended while its covers are still there. */
export const removeShareFiles = (
  shareId: string,
  keep: ReadonlySet<string> = new Set(),
) => removeFolderFiles(shareFolder(shareId), keep);
