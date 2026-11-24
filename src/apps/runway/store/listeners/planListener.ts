import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { openPlan } from '@apps/runway/engine/openDocs';
import { openJson } from '@apps/runway/security';
import type {
  OpenPlan,
  PlanDoc,
  PlanSealedFields,
  RunwayEncryption,
} from '@apps/runway/types';

async function readPlan(
  plan: PlanDoc,
  encryption: RunwayEncryption,
): Promise<OpenPlan> {
  const fields = plan.sealed
    ? await openJson<PlanSealedFields>(plan.sealed, encryption)
    : null;
  return openPlan(plan, fields);
}

/** Each snapshot is opened before it is delivered; a slow open never overwrites a newer snapshot or lands after the listener stopped. */
export function startPlanListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (plan: OpenPlan | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };

  const stop = onSnapshot(
    doc(db, 'apps', 'runway', 'plans', uid),
    async (snapshot) => {
      sequence.latest += 1;
      const mine = sequence.latest;
      try {
        const plan = snapshot.exists()
          ? await readPlan(snapshot.data() as PlanDoc, encryption)
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

  return () => {
    sequence.latest += 1;
    stop();
  };
}
