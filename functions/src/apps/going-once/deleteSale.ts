import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { publicFolder } from './saleLinkStore.js';

if (getApps().length === 0) {
  initializeApp();
}

const FILE_PAGE_SIZE = 500;
const SALE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const salePath = (saleId: string) => `apps/going-once/sales/${saleId}`;
const storagePrefix = (saleId: string) => `apps/going-once/sales/${saleId}/`;

type SaleBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;
interface FilesQuery {
  prefix?: string;
  maxResults?: number;
  autoPaginate?: boolean;
  pageToken?: string;
}

/** Deletes every file under a folder, a page at a time, and returns how many it removed. */
async function deleteFilesUnder(
  bucket: SaleBucket,
  prefix: string,
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
    { prefix, maxResults: FILE_PAGE_SIZE, autoPaginate: false },
    0,
  );
}

/** Deletes every file under the sale's folder and returns how many it removed. */
export const deleteSaleFiles = (bucket: SaleBucket, saleId: string) =>
  deleteFilesUnder(bucket, storagePrefix(saleId));

/** Ends the sale's public links, each one's photo copies first and then its record, so no address outlives its photos; returns how many links it ended. */
export async function deleteSaleLinks(
  firestore: Firestore,
  bucket: SaleBucket,
  saleId: string,
): Promise<number> {
  const links = await firestore
    .collection('apps/going-once/publicLinks')
    .where('saleId', '==', saleId)
    .get();
  await Promise.all(
    links.docs.map(async (link) => {
      await deleteFilesUnder(bucket, publicFolder(link.id));
      await link.ref.delete();
    }),
  );
  return links.size;
}

/** Deletes the sale's waiting invitations, which live beside the sale rather than under it, and returns how many it removed. */
export async function deleteSaleInvites(
  firestore: Firestore,
  saleId: string,
): Promise<number> {
  const invites = await firestore
    .collection('apps/going-once/emailInvites')
    .where('saleId', '==', saleId)
    .get();
  const writer = firestore.bulkWriter();
  invites.docs.forEach((invite) => void writer.delete(invite.ref));
  await writer.close();
  return invites.size;
}

/** Photos, public links and invitations first, then the sale with everything under it, so an interrupted run leaves the sale and a rerun finishes it. */
export async function deleteSaleContents(
  firestore: Firestore,
  bucket: SaleBucket,
  saleId: string,
) {
  const files = await deleteSaleFiles(bucket, saleId);
  const links = await deleteSaleLinks(firestore, bucket, saleId);
  const invites = await deleteSaleInvites(firestore, saleId);
  await firestore.recursiveDelete(firestore.doc(salePath(saleId)));
  // A link minted while the sale was being deleted would outlive it; the sale is gone now, so no later one can be.
  const lateLinks = await deleteSaleLinks(firestore, bucket, saleId);
  return { files, links: links + lateLinks, invites };
}

/**
 * Deletes a sale the caller started, with everything under it and its photos. A sale that is missing and one that belongs to
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
    if (!SALE_ID_PATTERN.test(saleId)) {
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
      const { files, links, invites } = await deleteSaleContents(
        firestore,
        getStorage().bucket(),
        saleId,
      );
      logger.info('goingOnce.sale.deleted', { saleId, files, links, invites });
      return { deleted: true };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      logger.error('goingOnce.sale.deleteFailed', {
        saleId,
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
