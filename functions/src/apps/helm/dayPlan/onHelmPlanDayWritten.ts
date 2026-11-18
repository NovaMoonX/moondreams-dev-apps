import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { dayQueuePath, stampDayQueue } from './dayAimsStore.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Enrols anyone who plans a day, aims or not, in the day queue so the first plan is made for them before the app opens; a person already waiting on a look is left alone. */
export const onHelmPlanDayWritten = onDocumentWritten(
  {
    document: 'apps/helm/users/{uid}/planDays/{dayKey}',
    region: 'us-central1',
    maxInstances: 5,
  },
  async (event) => {
    if (!event.data?.after.exists) return;
    const firestore = getFirestore();
    const queue = await firestore.doc(dayQueuePath(event.params.uid)).get();
    if (!queue.exists || queue.get('lookAt') == null)
      await stampDayQueue(firestore, event.params.uid, Date.now());
  },
);

export default onHelmPlanDayWritten;
