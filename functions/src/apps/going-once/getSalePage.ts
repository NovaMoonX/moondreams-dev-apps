import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall } from 'firebase-functions/v2/https';

import { linkRef, saleRef } from './saleLinkStore.js';
import {
  FINISHED_SALE_STATUS,
  NOT_FOUND_RESULT,
  SALE_PAGE_LIMITS,
  isLinkId,
  isRecord,
  isSafeId,
  publicFolder,
  sealPage,
  toSalePage,
  type SalePageResult,
} from './salePageView.js';

const LISTING_TTL_MS = 30_000;
const MAX_CACHED_LINKS = 50;

const listings = new Map<string, { at: number; paths: Set<string> }>();

/** The copies in a link's folder, listed at most once per 30 seconds per instance; an empty folder is never kept, so copies that have just been made show on the next call. */
async function listCopyPaths(linkId: string) {
  const kept = listings.get(linkId);
  if (kept !== undefined && Date.now() - kept.at < LISTING_TTL_MS) {
    return kept.paths;
  }

  const [files] = await getStorage()
    .bucket()
    .getFiles({ prefix: publicFolder(linkId) });
  const paths = new Set(files.map((file) => file.name));
  listings.delete(linkId);
  if (paths.size > 0) {
    listings.set(linkId, { at: Date.now(), paths });
    [...listings.keys()]
      .slice(0, Math.max(0, listings.size - MAX_CACHED_LINKS))
      .forEach((key) => listings.delete(key));
  }
  return paths;
}

async function readPage(
  linkId: unknown,
  uid: string | undefined,
): Promise<SalePageResult> {
  if (!isLinkId(linkId)) {
    return NOT_FOUND_RESULT;
  }

  const link = await linkRef(linkId).get();
  const saleId = link.get('saleId');
  if (!link.exists || !isSafeId(saleId)) {
    return NOT_FOUND_RESULT;
  }

  const sale = await saleRef(saleId).get();
  if (
    !sale.exists ||
    sale.get('publicLinkId') !== linkId ||
    sale.get('status') === FINISHED_SALE_STATUS
  ) {
    return NOT_FOUND_RESULT;
  }

  const items = await getFirestore()
    .collection(`apps/going-once/sales/${saleId}/items`)
    .orderBy('createdAt', 'desc')
    .limit(SALE_PAGE_LIMITS.MAX_PAGE_THINGS)
    .get();
  const paths = await listCopyPaths(linkId);
  const members: unknown = sale.get('members');
  const isMember =
    uid !== undefined && Array.isArray(members) && members.includes(uid);
  return toSalePage(
    sale.data(),
    items.docs.map((item) => item.data()),
    isMember,
    { saleId, linkId, paths },
  );
}

/**
 * The public page behind a link, read for anyone with the link. Unlike a share, it is live: every call reads the sale and its things and runs each through the allowlist in `salePageView.ts`.
 * Every link that shows nothing answers one identical `not_found`, so the answer never says why.
 */
export const getSalePage = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 15,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<SalePageResult> => {
    const linkId = isRecord(request.data) ? request.data.linkId : null;
    return sealPage(
      await readPage(linkId, request.auth?.uid),
      isLinkId(linkId) ? linkId : null,
    );
  },
);
