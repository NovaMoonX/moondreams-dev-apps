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
      // A cached "missing" answer can precede the server's; trusting it shows setup to an existing member.
      if (!snapshot.exists() && snapshot.metadata.fromCache) return;

      const membership = snapshot.exists()
        ? (snapshot.data() as MembershipProfile)
        : null;
      onChange(membership);
    },
    onError,
  );
}
