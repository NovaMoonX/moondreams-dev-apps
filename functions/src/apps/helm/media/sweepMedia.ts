import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { isMediaExpired, MEDIA_SWEEP_LIMIT } from './mediaCaps.js';
import { mediaObjectPath, type MediaBucket } from './openMedia.js';

const SWEPT_STATUSES = ['uploading', 'received', 'discarded'];

/** Deletes up to `limit` of a person's media whose time is up, each one's objects first and its document only once they are gone. Best effort: a failure leaves the document for the next sweep. */
export async function sweepExpiredMedia(input: {
  firestore: Pick<Firestore, 'collection'>;
  bucket: MediaBucket;
  uid: string;
  now: number;
  limit?: number;
}): Promise<{ deleted: number; failed: number }> {
  const { firestore, bucket, uid, now, limit = MEDIA_SWEEP_LIMIT } = input;
  const due = await firestore
    .collection(`apps/helm/users/${uid}/media`)
    .where('status', 'in', SWEPT_STATUSES)
    .where('deleteAfter', '<=', now)
    .limit(limit)
    .get();
  const outcomes = await Promise.all(
    due.docs
      .filter((snapshot) =>
        isMediaExpired(
          typeof snapshot.get('deleteAfter') === 'number'
            ? (snapshot.get('deleteAfter') as number)
            : null,
          now,
        ),
      )
      .map(async (snapshot) => {
        try {
          await Promise.all(
            [false, true].map((isThumb) =>
              bucket
                .file(mediaObjectPath(uid, snapshot.id, isThumb))
                .delete({ ignoreNotFound: true }),
            ),
          );
          await snapshot.ref.delete();
          return true;
        } catch (error) {
          logger.warn('helm.media.sweepFailed', {
            cause: error instanceof Error ? error.name : 'error',
          });
          return false;
        }
      }),
  );
  return {
    deleted: outcomes.filter(Boolean).length,
    failed: outcomes.filter((done) => !done).length,
  };
}
