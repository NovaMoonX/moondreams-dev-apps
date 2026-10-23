import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { DEFAULT_CURRENCY_CODE } from '@apps/runway/constants';
import { openJson } from '@apps/runway/security';
import type {
  OpenPlan,
  PlanDoc,
  PlanSealedFields,
  RunwayEncryption,
} from '@apps/runway/types';

async function openPlan(
  plan: PlanDoc,
  encryption: RunwayEncryption,
): Promise<OpenPlan> {
  const fields = plan.sealed
    ? await openJson<PlanSealedFields>(plan.sealed, encryption)
    : { currencyCode: DEFAULT_CURRENCY_CODE };
  const result: OpenPlan = {
    uid: plan.uid,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    stance: plan.stance,
    keyId: plan.keyId ?? null,
    currencyCode: fields.currencyCode,
  };
  return result;
}

/** Each snapshot is opened before it is delivered; a slow open never overwrites a newer snapshot. */
export function startPlanListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (plan: OpenPlan | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };

  return onSnapshot(
    doc(db, 'apps', 'runway', 'plans', uid),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const plan = snapshot.exists()
          ? await openPlan(snapshot.data() as PlanDoc, encryption)
          : null;
        if (mine === sequence.latest) onChange(plan);
      } catch (error) {
        if (mine === sequence.latest) {
          onError(
            error instanceof Error
              ? error
              : new Error('The plan did not open.'),
          );
        }
      }
    },
    onError,
  );
}
