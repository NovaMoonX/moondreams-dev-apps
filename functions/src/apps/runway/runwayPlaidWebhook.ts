import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { loadKeyring, RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { itemIndexPath, type ItemIndexDoc } from './link/grant.js';
import { LINK_SECRETS } from './link/linkShared.js';
import { getWebhookKey } from './link/providerPlaid.js';
import { syncRunwayLink } from './link/syncRunwayLink.js';
import { verifyPlaidWebhook } from './link/webhookVerify.js';

const ANSWER_WITHIN_MS = 8_000;

if (getApps().length === 0) {
  initializeApp();
}

/**
 * Plaid's webhook. A request that does not carry a valid signed header over its own body is answered 401 and does
 * nothing. A valid "updates available" notice syncs the link its item belongs to, answering within eight seconds
 * either way. Logs counts and ids only.
 */
export const runwayPlaidWebhook = onRequest(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 120,
    secrets: [...LINK_SECRETS, RUNWAY_MASTER_KEYS],
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }
    const isVerified = await verifyPlaidWebhook(
      request.header('Plaid-Verification'),
      request.rawBody ?? Buffer.alloc(0),
      Date.now(),
      getWebhookKey,
    );
    if (!isVerified) {
      logger.warn('runway.webhook.rejected');
      response.status(401).send('Unauthorized');
      return;
    }

    const body = request.body as {
      webhook_type?: unknown;
      webhook_code?: unknown;
      item_id?: unknown;
    };
    if (
      body.webhook_type === 'TRANSACTIONS' &&
      body.webhook_code === 'SYNC_UPDATES_AVAILABLE' &&
      typeof body.item_id === 'string' &&
      body.item_id !== '' &&
      !body.item_id.includes('/')
    ) {
      const firestore = getFirestore();
      const owner = await firestore.doc(itemIndexPath(body.item_id)).get();
      if (owner.exists) {
        const { uid, linkId } = owner.data() as ItemIndexDoc;
        /* Plaid retries a webhook not answered within 10 seconds. A sync still running then is answered anyway:
           its cursor moves only after its writes commit, so the next notice or the backstop picks up the rest. */
        const sync = syncRunwayLink(firestore, loadKeyring(), uid, linkId).then(
          (result) => {
            logger.info('runway.webhook.synced', {
              linkId,
              state: result.state,
            });
          },
          () => {
            logger.warn('runway.webhook.syncFailed', { linkId });
          },
        );
        await Promise.race([
          sync,
          new Promise((resolve) => setTimeout(resolve, ANSWER_WITHIN_MS)),
        ]);
      } else {
        logger.warn('runway.webhook.unknownItem');
      }
    }
    response.status(200).send('ok');
  },
);
