import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import {
  LINK_CORS,
  LINK_SECRETS,
  loadKeyringOrFail,
  planDocPath,
  requireLinkCaller,
} from './link/linkShared.js';
import { syncRunwayLink, type LinkSyncResult } from './link/syncRunwayLink.js';

if (getApps().length === 0) {
  initializeApp();
}

/**
 * `{ linkId }` → `LinkSyncResult`: after the person signed in again at their bank, sets their `needsAttention` link back to `active` and syncs it. A sync that still needs attention sets it back. Safe to repeat.
 */
export const reconnectRunwayLink = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 120,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const data = request.data as Record<string, unknown> | null;
    const linkId = data?.linkId;
    if (
      typeof data !== 'object' ||
      data === null ||
      Object.keys(data).some((key) => key !== 'linkId') ||
      typeof linkId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(linkId)
    ) {
      throw new HttpsError('invalid-argument', 'That link is not valid.');
    }
    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const linkRef = firestore.doc(planDocPath(uid, 'links', linkId));
    const snapshot = await linkRef.get();
    const status = snapshot.data()?.status;
    if (status !== 'needsAttention' && status !== 'active') {
      throw new HttpsError(
        'failed-precondition',
        'That bank is not waiting for a reconnect.',
      );
    }
    if (status === 'needsAttention') {
      await linkRef.update({ status: 'active' });
    }
    logger.info('runway.link.reconnected');
    const result: LinkSyncResult = await syncRunwayLink(
      firestore,
      keyring,
      uid,
      linkId,
    );
    return result;
  },
);
