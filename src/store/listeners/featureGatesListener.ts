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

export async function readFeatureGates(appId: string) {
  try {
    const snapshot = await getDoc(doc(db, 'featureGates', appId));
    return snapshot.exists() ? (snapshot.data() as FeatureGatesDoc) : null;
  } catch (error) {
    console.error('Failed to load feature switches:', error);
    return null;
  }
}
