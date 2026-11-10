import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { sealJson } from '@apps/helm/security';
import type {
  HelmEncryption,
  HelmProfile,
  Who,
  WhoSealed,
} from '@apps/helm/types';

/** Makes the person's own who and points the profile at it in one transaction, so two tabs opening together make one. A profile that already points at one is left alone. */
export async function ensureSelfWho(
  uid: string,
  encryption: HelmEncryption,
  name: string,
) {
  const profileRef = doc(db, 'apps', 'helm', 'users', uid);
  const whoRef = doc(db, 'apps', 'helm', 'users', uid, 'who', 'self');
  const now = Date.now();
  const sealed = await sealJson<WhoSealed>(
    {
      name,
      aliases: [],
      relation: null,
      phone: null,
      email: null,
      notes: null,
      species: null,
      organizationKind: null,
    },
    encryption,
  );
  const who: Who = {
    kind: 'person',
    tier: 'close',
    tierSetBy: 'person',
    isSelf: true,
    placeIds: [],
    photoMediaId: null,
    mediaIds: [],
    importedFrom: null,
    importedFields: {},
    lastMentionedAt: null,
    yearlyDateCount: 0,
    momentCount: 0,
    createdBy: 'person',
    executionId: null,
    createdAt: now,
    lastEditedAt: null,
    sealed,
  };

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (!snapshot.exists()) return;
    const profile = snapshot.data() as Partial<HelmProfile>;
    if (profile.selfWhoId) return;
    transaction.set(whoRef, who);
    transaction.update(profileRef, { selfWhoId: whoRef.id });
  });
}
