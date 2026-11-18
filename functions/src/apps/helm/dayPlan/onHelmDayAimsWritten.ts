import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { stampDayQueue } from './dayAimsStore.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Asks the day job to look soon whenever the person's aims or their answers change; the job's own readable fields (`windDownState`, `lookAt`, `rolledAt`) never ask again. */
export const onHelmDayAimsWritten = onDocumentWritten(
  {
    document: 'apps/helm/users/{uid}/dayAims/{dayKey}',
    region: 'us-central1',
    maxInstances: 5,
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    const isChanged =
      !before ||
      before.state !== after.state ||
      before.date !== after.date ||
      JSON.stringify(before.sealed) !== JSON.stringify(after.sealed);
    if (isChanged)
      await stampDayQueue(getFirestore(), event.params.uid, Date.now());
  },
);

export default onHelmDayAimsWritten;
