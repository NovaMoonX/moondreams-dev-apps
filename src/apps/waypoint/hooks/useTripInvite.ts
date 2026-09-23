import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase/config';

export interface TripInviteState {
  loading: boolean;
  /** False once the listener has resolved and found no matching invite code. */
  exists: boolean;
  tripId: string | null;
  title: string | null;
}

const INITIAL_STATE: TripInviteState = {
  loading: true,
  exists: false,
  tripId: null,
  title: null,
};

/**
 * Live view of an invite code's `{ tripId, title }` doc, so a join modal can
 * show the trip's current name and keep it in sync if an editor renames the
 * trip while the modal is open, without needing read access to the trip
 * itself (invite codes are readable by any signed-in user; trips aren't).
 *
 * Callers should remount (e.g. `key={inviteCode}`) rather than change
 * `inviteCode` on an already-mounted instance.
 */
export function useTripInvite(inviteCode: string): TripInviteState {
  const [state, setState] = useState<TripInviteState>(INITIAL_STATE);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'apps', 'waypoint', 'inviteCodes', inviteCode),
      (snapshot) => {
        const data = snapshot.data();
        const tripId = typeof data?.tripId === 'string' ? data.tripId : null;
        const title = typeof data?.title === 'string' ? data.title : null;

        setState({
          loading: false,
          exists: snapshot.exists() && tripId !== null,
          tripId,
          title,
        });
      },
      () => {
        setState({ loading: false, exists: false, tripId: null, title: null });
      },
    );
  }, [inviteCode]);

  return state;
}
