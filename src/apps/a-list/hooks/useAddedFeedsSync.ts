import { useEffect } from 'react';

import { useAppDispatch, useAppSelector } from '@/store';
import { selectAddedCalendarItems } from '@apps/a-list/store/selectors';
import { startShareFeedListener } from '@apps/a-list/store/listeners/addedCalendarListeners';
import { setAddedFeed } from '@apps/a-list/store/slices/addedCalendarsSlice';

/** Listens to the feed of every share the member added, so a friend's live changes arrive without a refresh. */
export function useAddedFeedsSync() {
  const dispatch = useAppDispatch();
  const calendars = useAppSelector(selectAddedCalendarItems);
  const feedKey = calendars
    .map((calendar) => `${calendar.id}:${calendar.feedId}`)
    .sort()
    .join(',');

  useEffect(() => {
    if (feedKey === '') return;

    const unsubscribes = feedKey.split(',').map((entry) => {
      const [id, feedId] = entry.split(':');
      return startShareFeedListener(feedId, (feed) =>
        dispatch(setAddedFeed({ id, feed })),
      );
    });
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [dispatch, feedKey]);
}
