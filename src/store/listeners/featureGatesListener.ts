import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';
import type { FeatureGatesDoc } from '@lib/gates/featureGates';

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
