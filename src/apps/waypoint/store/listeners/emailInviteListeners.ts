import { collection, query, where, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import { createFirestoreCollectionListener } from '@/store/listeners/createFirestoreCollectionListener';
import type { TripEmailInvite } from '@apps/waypoint/types';

const EMAIL_INVITES_COLLECTION = collection(db, 'apps', 'waypoint', 'emailInvites');

export function startMyEmailInvitesListener(
  email: string | null,
  onChange: (invites: TripEmailInvite[]) => void,
): Unsubscribe {
  if (!email) {
    onChange([]);
    return () => undefined;
  }

  return createFirestoreCollectionListener<TripEmailInvite>({
    query: query(EMAIL_INVITES_COLLECTION, where('email', '==', email.trim().toLowerCase())),
    normalize: (_id, data) => data as TripEmailInvite,
    onData: onChange,
    // Someone whose email isn't verified can't read these; that just means no invitations, not an error screen.
    onError: () => onChange([]),
  });
}

export function startTripEmailInvitesListener(
  tripId: string | null,
  onChange: (invites: TripEmailInvite[]) => void,
): Unsubscribe {
  if (!tripId) {
    onChange([]);
    return () => undefined;
  }

  return createFirestoreCollectionListener<TripEmailInvite>({
    query: query(EMAIL_INVITES_COLLECTION, where('tripId', '==', tripId)),
    normalize: (_id, data) => data as TripEmailInvite,
    onData: onChange,
    onError: () => onChange([]),
  });
}
