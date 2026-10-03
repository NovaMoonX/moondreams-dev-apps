import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { MembershipProfile } from '@apps/a-list/types';

export function startMembershipListener(
  uid: string,
  onChange: (membership: MembershipProfile | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const membershipRef = doc(db, 'apps', 'a-list', 'memberships', uid);

  return onSnapshot(
    membershipRef,
    (snapshot) => {
      const membership = snapshot.exists()
        ? (snapshot.data() as MembershipProfile)
        : null;
      onChange(membership);
    },
    onError,
  );
}
