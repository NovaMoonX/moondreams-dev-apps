import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase/config';

export interface TripInviteState {
  loading: boolean;
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
