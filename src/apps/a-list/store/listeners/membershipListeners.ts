import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { logAListDebug } from '@apps/a-list/debug/aListDebug';
import type { MembershipProfile } from '@apps/a-list/types';

export function startMembershipListener(
  uid: string,
  onChange: (membership: MembershipProfile | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const membershipRef = doc(db, 'apps', 'a-list', 'memberships', uid);
  logAListDebug(`listener start path=${membershipRef.path}`);

  return onSnapshot(
    membershipRef,
    { includeMetadataChanges: true },
    (snapshot) => {
      logAListDebug(
        `snapshot exists=${snapshot.exists()} fromCache=${snapshot.metadata.fromCache} pendingWrites=${snapshot.metadata.hasPendingWrites}`,
      );
      const membership = snapshot.exists()
        ? (snapshot.data() as MembershipProfile)
        : null;
      onChange(membership);
    },
    (error) => {
      logAListDebug(`ERROR code=${(error as { code?: string }).code} msg=${error.message}`);
      onError(error);
    },
  );
}
