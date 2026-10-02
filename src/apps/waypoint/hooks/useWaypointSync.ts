import { useEffect } from 'react';

import { useAppDispatch } from '@/store';

import {
  startMyPendingRequestsListener,
  startTripPendingRequestsListener,
} from '../store/listeners/pendingRequestsListeners';
import { startTripListener } from '../store/listeners/tripListeners';
import { startTripExpensesListener } from '../store/listeners/expenseListeners';
import { startTripEventsListener } from '../store/listeners/eventListeners';
import { startEventSuggestionsListener } from '../store/listeners/eventSuggestionListeners';
import { startAnnouncementsListener } from '../store/listeners/announcementListeners';
import { startIdeasListener } from '../store/listeners/ideaListeners';
import { startChecklistListener } from '../store/listeners/checklistListeners';
import { startTripStaysListener } from '../store/listeners/stayListeners';
import {
  setMyPendingRequests,
  setTripPendingRequests,
} from '../store/slices/pendingRequestsSlice';
import { setTrips } from '../store/slices/tripSlice';
import { clearExpenses, setExpenses } from '../store/slices/expensesSlice';
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

interface UseWaypointSyncOptions {
  tripId: string | null;
  isTripAdmin: boolean;
}

export function useWaypointSync(
  uid: string | null,
  { tripId, isTripAdmin }: UseWaypointSyncOptions,
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
