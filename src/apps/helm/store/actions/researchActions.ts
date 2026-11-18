import { doc, updateDoc } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

/** "Stop looking": the server drops a late answer for an item that is no longer preparing. */
export const cancelResearch = (uid: string, researchId: string) => {
  const now = Date.now();
  return updateDoc(
    doc(db, 'apps', 'helm', 'users', uid, 'research', researchId),
    { status: 'dismissed', cancelledAt: now, lastEditedAt: now },
  );
};
