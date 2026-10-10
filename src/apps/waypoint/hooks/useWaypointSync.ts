import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startMyPendingRequestsListener,
  startTripPendingRequestsListener,
} from '../store/listeners/pendingRequestsListeners';
import {
  startMyEmailInvitesListener,
  startTripEmailInvitesListener,
} from '../store/listeners/emailInviteListeners';
import { startTripListener } from '../store/listeners/tripListeners';
import { startTripExpensesListener } from '../store/listeners/expenseListeners';
import { startPersonalExpensesListener } from '../store/listeners/personalExpenseListeners';
import { startPersonalChecklistListener } from '../store/listeners/personalChecklistListeners';
import { startTripEventsListener } from '../store/listeners/eventListeners';
import { startEventSuggestionsListener } from '../store/listeners/eventSuggestionListeners';
import { startAnnouncementsListener } from '../store/listeners/announcementListeners';
import { startIdeasListener } from '../store/listeners/ideaListeners';
import { startChecklistListener } from '../store/listeners/checklistListeners';
import { startTripStaysListener } from '../store/listeners/stayListeners';
import { startTripRentalsListener } from '../store/listeners/rentalListeners';
import {
  setMyPendingRequests,
  setTripPendingRequests,
} from '../store/slices/pendingRequestsSlice';
import { setMyEmailInvites, setTripEmailInvites } from '../store/slices/emailInvitesSlice';
import { setTrips } from '../store/slices/tripSlice';
import { clearExpenses, setExpenses } from '../store/slices/expensesSlice';
import { clearPersonalExpenses, setPersonalExpenses } from '../store/slices/personalExpensesSlice';
import { clearPersonalChecklist, setPersonalChecklist } from '../store/slices/personalChecklistSlice';
import { clearEvents, setEvents } from '../store/slices/eventsSlice';
import {
  clearEventSuggestions,
  setEventSuggestions,
} from '../store/slices/eventSuggestionsSlice';
import {
  clearAnnouncements,
  setAnnouncements,
} from '../store/slices/announcementsSlice';
import { clearIdeas, setIdeas } from '../store/slices/ideasSlice';
import { setChecklist } from '../store/slices/checklistSlice';
import { clearStays, setStays } from '../store/slices/staysSlice';
import { clearRentals, setRentals } from '../store/slices/rentalsSlice';

interface UseWaypointSyncOptions {
  tripId: string | null;
  isTripAdmin: boolean;
  /** The signed-in user's email, to find invitations addressed to it. */
  email: string | null;
}

export function useWaypointSync(
  uid: string | null,
  { tripId, isTripAdmin, email }: UseWaypointSyncOptions,
) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!uid) {
      dispatch(setTrips([]));
      dispatch(setMyPendingRequests([]));
      return;
    }

    const unsubscribeTrips = startTripListener(uid, (trips) => {
      dispatch(setTrips(trips));
    });
    const unsubscribeMyPendingRequests = startMyPendingRequestsListener(
      uid,
      (requests) => {
        dispatch(setMyPendingRequests(requests));
      },
    );

    return () => {
      unsubscribeTrips();
      unsubscribeMyPendingRequests();
    };
  }, [dispatch, uid]);

  useEffect(() => {
    return startMyEmailInvitesListener(uid ? email : null, (invites) => {
      dispatch(setMyEmailInvites(invites));
    });
  }, [dispatch, uid, email]);

  useEffect(() => {
    const activeTripId = isTripAdmin ? tripId : null;

    return startTripEmailInvitesListener(activeTripId, (invites) => {
      dispatch(setTripEmailInvites(invites));
    });
  }, [dispatch, tripId, isTripAdmin]);

  useEffect(() => {
    const activeTripId = isTripAdmin ? tripId : null;

    return startTripPendingRequestsListener(activeTripId, (requests) => {
      dispatch(setTripPendingRequests(requests));
    });
  }, [dispatch, tripId, isTripAdmin]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearExpenses());
      return;
    }

    return startTripExpensesListener(tripId, (expenses) => {
      dispatch(setExpenses({ tripId, expenses }));
    });
  }, [dispatch, tripId]);

  useEffect(() => {
    if (!tripId || !uid) {
      dispatch(clearPersonalExpenses());
      return;
    }

    return startPersonalExpensesListener(uid, tripId, (expenses) => {
      dispatch(setPersonalExpenses({ tripId, expenses }));
    });
  }, [dispatch, uid, tripId]);

  useEffect(() => {
    if (!tripId || !uid) {
      dispatch(clearPersonalChecklist());
      return;
    }

    return startPersonalChecklistListener(uid, tripId, (items) => {
      dispatch(setPersonalChecklist({ tripId, items }));
    });
  }, [dispatch, uid, tripId]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearStays());
      return;
    }

    return startTripStaysListener(tripId, (stays) => {
      dispatch(setStays({ tripId, stays }));
    });
  }, [dispatch, tripId]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearRentals());
      return;
    }

    return startTripRentalsListener(tripId, (rentals) => {
      dispatch(setRentals({ tripId, rentals }));
    });
  }, [dispatch, tripId]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearEvents());
      return;
    }

    return startTripEventsListener(tripId, (events) => {
      dispatch(setEvents({ tripId, events }));
    });
  }, [dispatch, tripId]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearEventSuggestions());
      return;
    }

    return startEventSuggestionsListener(tripId, (suggestions) => {
      dispatch(setEventSuggestions({ tripId, suggestions }));
    });
  }, [dispatch, tripId]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearAnnouncements());
      return;
    }

    return startAnnouncementsListener(tripId, (announcements) => {
      dispatch(setAnnouncements({ tripId, announcements }));
    });
  }, [dispatch, tripId]);

  useEffect(() => {
    if (!tripId) {
      dispatch(clearIdeas());
      return;
    }

    return startIdeasListener(tripId, (ideas) => {
      dispatch(setIdeas({ tripId, ideas }));
    });
  }, [dispatch, tripId]);

  useEffect(() => {
    return startChecklistListener(tripId, (items) => {
      dispatch(setChecklist({ tripId, items }));
    });
  }, [dispatch, tripId]);
}
