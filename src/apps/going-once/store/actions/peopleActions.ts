import { arrayRemove, arrayUnion, doc, setDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';

/** Turns this person's "someone's interested" push for one sale on or off, on their own settings document. */
export function setInquiryPush(
  uid: string,
  saleId: string,
  isOn: boolean,
): Promise<void> {
  return setDoc(
    doc(db, 'apps', 'going-once', 'people', uid),
    { inquiryPushOffSaleIds: isOn ? arrayRemove(saleId) : arrayUnion(saleId) },
    { merge: true },
  );
}
