import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { syncThingCopies } from './salePhotoCopies.js';

/**
 * Keeps a thing's public photo copies equal to what its sale's page shows. It reads the sale and the thing again rather than trusting the event, so runs that arrive out of order end in the same state.
 */
export const syncSalePublicPhotos = onDocumentWritten(
  {
    document: 'apps/going-once/sales/{saleId}/items/{itemId}',
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 120,
    maxInstances: 10,
  },
  async (event) => {
    const { saleId, itemId } = event.params;
    const counts = await syncThingCopies(saleId, itemId);
    if (counts.made + counts.deleted + counts.skipped + counts.failed > 0) {
      logger.info('goingOnce.copies.synced', counts);
    }
  },
);
