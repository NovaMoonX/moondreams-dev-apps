import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  requireLinkCaller,
} from './link/linkShared.js';
import { finishRevokedLinks } from './link/revokeGrant.js';
import { syncRunwayLink, type LinkSyncResult } from './link/syncRunwayLink.js';

if (getApps().length === 0) {
  initializeApp();
}

/**
 * `{}` → `{ results: [{ linkId, state, created, updated, removed }] }`: brings in what is new from every active link of
 * the caller, and retries the bank's revoke for an unlinked link whose grant was kept. Safe to call again at any time; a repeat
 * changes nothing.
 */
export const syncRunwayLinks = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 120,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const links = await firestore
      .collection(`apps/runway/plans/${uid}/links`)
      .where('status', '==', 'active')
      .get();
    const [results] = await Promise.all([
      Promise.all(
        links.docs.map((link) =>
          syncRunwayLink(firestore, keyring, uid, link.id),
        ),
      ) as Promise<LinkSyncResult[]>,
      finishRevokedLinks(firestore, keyring, uid).catch(() => {
        logger.warn('runway.link.revokeRetryFailed');
        return 0;
      }),
    ]);
    return { results };
  },
);
