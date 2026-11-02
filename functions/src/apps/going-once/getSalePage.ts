import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';

import { linkRef, saleRef } from './saleLinkStore.js';
import {
  FINISHED_SALE_STATUS,
  NOT_FOUND_RESULT,
  SALE_PAGE_LIMITS,
  isLinkId,
  isRecord,
  isSafeId,
  sealPage,
  toSalePage,
  type SalePageResult,
} from './salePageView.js';

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
  const members: unknown = sale.get('members');
  const isMember =
    uid !== undefined && Array.isArray(members) && members.includes(uid);
  return toSalePage(
    sale.data(),
    items.docs.map((item) => item.data()),
    isMember,
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
    return sealPage(await readPage(linkId, request.auth?.uid));
  },
);
