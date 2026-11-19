import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { HELM_MASTER_KEYS } from '../getHelmKey.js';
import { ANTHROPIC_API_KEY, loadKeyringOrFail } from '../sortHelmCapture.js';
import {
  pickResearchProvider,
  releaseResearch,
  runResearchItem,
} from './runResearch.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Starts a research item when it is made or set to preparing, and gives back what a cancelled or deleted one held. Each write is read again in a transaction, so a repeated event does nothing. */
export const runHelmResearch = onDocumentWritten(
  {
    document: 'apps/helm/users/{uid}/research/{researchId}',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
    maxInstances: 5,
    secrets: [HELM_MASTER_KEYS, ANTHROPIC_API_KEY],
  },
  async (event) => {
    const { uid, researchId } = event.params;
    const firestore = getFirestore();
    const after = event.data?.after;
    const data = after?.exists ? after.data() : undefined;
    if (!data) {
      if (Number(event.data?.before.data()?.reservedCents ?? 0) > 0) {
        await releaseResearch(firestore, uid, researchId, Date.now());
      }
      return;
    }
    if (data.status === 'dismissed') {
      if (Number(data.reservedCents ?? 0) > 0) {
        const isReleased = await releaseResearch(
          firestore,
          uid,
          researchId,
          Date.now(),
        );
        logger.info('helm.research.released', { isReleased });
      }
      return;
    }
    if (data.status !== 'preparing' || (data.startedAt ?? null) !== null) {
      return;
    }
    const outcome = await runResearchItem(
      firestore,
      pickResearchProvider(),
      loadKeyringOrFail(),
      uid,
      researchId,
      Date.now(),
    );
    logger.info('helm.research.ran', { outcome });
  },
);
