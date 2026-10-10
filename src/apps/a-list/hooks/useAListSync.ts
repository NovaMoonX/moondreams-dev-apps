import { useEffect } from 'react';

import { useAppDispatch } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { startCalendarSharesListener } from '@apps/a-list/store/listeners/calendarShareListeners';
import { startMembershipListener } from '@apps/a-list/store/listeners/membershipListeners';
import { startTheatresListener } from '@apps/a-list/store/listeners/theatreListeners';
import { startViewingsListener } from '@apps/a-list/store/listeners/viewingListeners';
import { startWatchlistListener } from '@apps/a-list/store/listeners/watchlistListeners';
import {
  clearCalendarShares,
  setCalendarShares,
  setCalendarSharesLoadError,
} from '@apps/a-list/store/slices/calendarSharesSlice';
import {
  clearMembership,
  setMembership,
  setMembershipLoadError,
} from '@apps/a-list/store/slices/membershipSlice';
import {
  clearTheatres,
  setTheatres,
  setTheatresLoadError,
} from '@apps/a-list/store/slices/theatresSlice';
import {
  clearViewings,
  setViewings,
  setViewingsLoadError,
} from '@apps/a-list/store/slices/viewingsSlice';
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
      dispatch(clearViewings());
      dispatch(clearTheatres());
      dispatch(clearCalendarShares());
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

    const unsubscribeViewings = startViewingsListener(
      uid,
      (viewings) => dispatch(setViewings(viewings)),
      (error) =>
        dispatch(
          setViewingsLoadError(
            getErrorMessage(error, 'Unable to load your movies.'),
          ),
        ),
    );

    const unsubscribeTheatres = startTheatresListener(
      uid,
      (theatres) => dispatch(setTheatres(theatres)),
      (error) =>
        dispatch(
          setTheatresLoadError(
            getErrorMessage(error, 'Unable to load your theaters.'),
          ),
        ),
    );

    // Not part of "loaded": a failure here only affects the Share screen, never the calendar.
    const unsubscribeCalendarShares = startCalendarSharesListener(
      uid,
      (shares) => dispatch(setCalendarShares(shares)),
      (error) =>
        dispatch(
          setCalendarSharesLoadError(
            getErrorMessage(error, 'Unable to load your shared calendars.'),
          ),
        ),
    );

    return () => {
      unsubscribeCalendarShares();
      unsubscribeTheatres();
      unsubscribeMembership();
      unsubscribeWatchlist();
      unsubscribeViewings();
    };
  }, [dispatch, uid]);
}
