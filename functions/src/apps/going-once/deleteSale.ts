import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

const BATCH_SIZE = 400;
const FILE_PAGE_SIZE = 500;

const salePath = (saleId: string) => `apps/going-once/sales/${saleId}`;
const storagePrefix = (saleId: string) => `apps/going-once/sales/${saleId}/`;

type SaleBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;
interface FilesQuery {
  prefix?: string;
  maxResults?: number;
  autoPaginate?: boolean;
  pageToken?: string;
}

/** Deletes every file under the sale's folder, a page at a time, and returns how many it removed. */
export async function deleteSaleFiles(
  bucket: SaleBucket,
  saleId: string,
): Promise<number> {
  const removePage = async (
    query: FilesQuery,
    removed: number,
  ): Promise<number> => {
    const [files, next] = await bucket.getFiles(query);
    await Promise.all(
      files.map((file) => file.delete({ ignoreNotFound: true })),
    );
    const total = removed + files.length;
    return next ? removePage(next, total) : total;
  };
  return removePage(
    {
      prefix: storagePrefix(saleId),
      maxResults: FILE_PAGE_SIZE,
      autoPaginate: false,
    },
    0,
  );
}

/** Deletes the sale's things in batches until none are left, and returns how many it removed. */
export async function deleteSaleItems(
  firestore: Firestore,
  saleId: string,
): Promise<number> {
  const removeBatch = async (removed: number): Promise<number> => {
    const snapshot = await firestore
      .collection(`${salePath(saleId)}/items`)
      .select()
      .limit(BATCH_SIZE)
      .get();
    if (snapshot.empty) return removed;
    const batch = firestore.batch();
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    return removeBatch(removed + snapshot.size);
  };
  return removeBatch(0);
}

/** Photos first, then things, then the sale, so an interrupted run leaves the sale and a rerun finishes it. */
export async function deleteSaleContents(
  firestore: Firestore,
  bucket: SaleBucket,
  saleId: string,
) {
  const files = await deleteSaleFiles(bucket, saleId);
  const items = await deleteSaleItems(firestore, saleId);
  await firestore.doc(salePath(saleId)).delete();
  return { files, items };
}

/**
 * Deletes a sale the caller started, with its things and their photos. A sale that is missing and one that belongs to
 * someone else both answer not-found. Run it again after a failure: each step tolerates what is already gone.
 */
export const deleteSale = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 540,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to delete a sale.');
    }
    const saleId =
      typeof request.data?.saleId === 'string'
        ? request.data.saleId.trim()
        : '';
    if (saleId === '' || saleId.includes('/')) {
      throw new HttpsError('invalid-argument', 'A sale is required.');
    }

    const firestore = getFirestore();
    const sale = await firestore.doc(salePath(saleId)).get();
    if (!sale.exists || sale.data()?.ownerUid !== uid) {
      throw new HttpsError(
        'not-found',
        "We couldn't find this sale. It may already be deleted.",
      );
    }

    try {
      const { files, items } = await deleteSaleContents(
        firestore,
        getStorage().bucket(),
        saleId,
      );
      logger.info('goingOnce.sale.deleted', { items, files });
      return { deleted: true };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      logger.error('goingOnce.sale.deleteFailed', {
        code:
          typeof code === 'string' || typeof code === 'number'
            ? code
            : 'unknown',
      });
      throw new HttpsError(
        'internal',
        "The sale wasn't fully deleted. Delete it again to finish.",
      );
    }
  },
);
