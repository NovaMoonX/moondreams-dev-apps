import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { WithId } from '@apps/a-list/store/heldLists';
import type { MembershipProfile } from '@apps/a-list/types';

export function startMembershipListener(
  uid: string,
  onChange: (membership: WithId<MembershipProfile> | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const membershipRef = doc(db, 'apps', 'a-list', 'memberships', uid);

  return onSnapshot(
    membershipRef,
    (snapshot) => {
      const membership = snapshot.exists()
        ? ({ ...snapshot.data(), id: snapshot.id } as WithId<MembershipProfile>)
        : null;
      onChange(membership);
    },
    onError,
  );
}
