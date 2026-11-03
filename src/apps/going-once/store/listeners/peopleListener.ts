import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

/** The sales whose interest push this person turned off; a person who never touched the switch has no document, which reads as none. */
export function startPushOffListener(
  uid: string,
  onChange: (saleIds: string[]) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'apps', 'going-once', 'people', uid),
    (snapshot) => {
      const stored: unknown = snapshot.data()?.inquiryPushOffSaleIds;
      onChange(
        Array.isArray(stored)
          ? stored.filter((id): id is string => typeof id === 'string')
          : [],
      );
    },
    // A failed read says nothing about the switch, so the last answer stands.
    () => undefined,
  );
}
