import { doc, getDoc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { FeatureGatesDoc } from '@lib/gates/featureGates';

/** Live switches, for the admin's Features tab only; apps read theirs once per page load. */
export function startFeatureGatesListener(
  appId: string,
  onChange: (gatesDoc: FeatureGatesDoc | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'featureGates', appId),
    (snapshot) =>
      onChange(snapshot.exists() ? (snapshot.data() as FeatureGatesDoc) : null),
    (error) => {
      console.error('Failed to load feature switches:', error);
      onChange(null);
    },
  );
}

const READ_RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One read of an app's switches, retried a few times before it settles on the declared defaults. */
export async function readFeatureGates(
  appId: string,
  attempt = 0,
): Promise<FeatureGatesDoc | null> {
  try {
    const snapshot = await getDoc(doc(db, 'featureGates', appId));
    return snapshot.exists() ? (snapshot.data() as FeatureGatesDoc) : null;
  } catch (error) {
    const delay = READ_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      console.error('Failed to load feature switches:', error);
      return null;
    }
    await wait(delay);
    return readFeatureGates(appId, attempt + 1);
  }
}
