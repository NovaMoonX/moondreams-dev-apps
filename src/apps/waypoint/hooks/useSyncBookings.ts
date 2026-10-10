import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAppDispatch } from '@/store';
import { syncEventBookings } from '@apps/waypoint/store/actions/checklistActions';

export interface BookingPicks {
  picked: string[];
  initial: string[];
}

/** Returns a function that applies an event form's picked to-dos after the event is saved; it says whether any ended up linked. */
export function useSyncBookings(tripId: string) {
  const dispatch = useAppDispatch();
  const { addToast } = useToast();

  return async (eventId: string, bookings: BookingPicks | undefined) => {
    if (bookings === undefined) {
      return false;
    }
    const { linked, message } = await dispatch(syncEventBookings({ tripId, eventId, ...bookings })).unwrap();
    if (message !== null) {
      addToast({
        title: 'Saved, but the to-dos were not all linked',
        description: `${message} Open the event to try again.`,
        type: 'error',
      });
    }
    return linked;
  };
}
