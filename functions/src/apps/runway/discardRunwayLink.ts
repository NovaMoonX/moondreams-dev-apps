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
  type LinkSealed,
} from './link/linkShared.js';
import { discardLink, isUnfinishedLink } from './link/unfinishedLinks.js';
import { openWithKey, unwrapPlanKey, type SealedPayload } from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

/**
 * `{ linkId }` → `{ discarded }`: revokes the grant of a link the person never finished and deletes the link and its
 * grant. A link with any account already bound or left out is refused.
 */
export const discardRunwayLink = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 60,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
    cors: LINK_CORS,
  },
  async (request) => {
    const uid = await requireLinkCaller(request);
    const linkId: unknown = request.data?.linkId;
    if (
      typeof linkId !== 'string' ||
      linkId === '' ||
      linkId === '.' ||
      linkId === '..' ||
      linkId.includes('/')
    ) {
      throw new HttpsError('invalid-argument', 'That link is missing.');
    }

    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const planKey = await unwrapPlanKey(firestore, keyring, uid).catch(() => {
      throw new HttpsError(
        'failed-precondition',
        'Open your plan once before linking a bank.',
      );
    });

    const linkSnapshot = await firestore
      .doc(planDocPath(uid, 'links', linkId))
      .get();
    if (!linkSnapshot.exists) {
      const gone = { discarded: false };
      return gone;
    }
    const link = openWithKey(
      planKey.key,
      linkSnapshot.data()?.sealed as SealedPayload,
    ) as unknown as LinkSealed;
    if (!isUnfinishedLink(link)) {
      throw new HttpsError(
        'failed-precondition',
        'That bank link already has accounts in it, so it cannot be discarded.',
      );
    }

    await discardLink(firestore, keyring, uid, linkId);
    logger.info('runway.link.discarded', { linkId });
    const result = { discarded: true };
    return result;
  },
);
