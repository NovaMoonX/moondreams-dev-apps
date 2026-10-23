import { doc, runTransaction } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { DEFAULT_CURRENCY_CODE } from '@apps/runway/constants';
import { sealJson } from '@apps/runway/security';
import type { PlanDoc, RunwayEncryption } from '@apps/runway/types';

/** Creates the plan on first open and leaves an existing one alone, so two tabs opening together make one. */
export async function ensurePlan(uid: string, encryption: RunwayEncryption) {
  const planRef = doc(db, 'apps', 'runway', 'plans', uid);
  const sealed = await sealJson(
    { currencyCode: DEFAULT_CURRENCY_CODE },
    encryption,
  );

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(planRef);
    if (snapshot.exists()) return;

    const now = Date.now();
    const plan: PlanDoc = {
      uid,
      createdAt: now,
      updatedAt: now,
      stance: 'conservative',
      keyId: encryption.keyId,
      sealed,
    };
    transaction.set(planRef, plan);
  });
}
