import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { startMembershipListener } from '@apps/a-list/store/listeners/membershipListeners';
import { startWatchlistListener } from '@apps/a-list/store/listeners/watchlistListeners';
import {
  clearMembership,
  setMembership,
  setMembershipLoadError,
} from '@apps/a-list/store/slices/membershipSlice';
import {
  clearWatchlist,
  setWatchlist,
  setWatchlistLoadError,
} from '@apps/a-list/store/slices/watchlistSlice';

export function useAListSync(uid: string | null) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) {
      dispatch(clearMembership());
      dispatch(clearWatchlist());
      return;
    }

    const unsubscribeMembership = startMembershipListener(
      uid,
      (membership) => dispatch(setMembership(membership)),
      (error) =>
        dispatch(
          setMembershipLoadError(
            getErrorMessage(error, 'Unable to load your membership.'),
          ),
        ),
    );
    const unsubscribeWatchlist = startWatchlistListener(
      uid,
      (items) => dispatch(setWatchlist(items)),
      (error) =>
        dispatch(
          setWatchlistLoadError(
            getErrorMessage(error, 'Unable to load your watchlist.'),
          ),
        ),
    );

    return () => {
      unsubscribeMembership();
      unsubscribeWatchlist();
    };
  }, [dispatch, uid]);
}
