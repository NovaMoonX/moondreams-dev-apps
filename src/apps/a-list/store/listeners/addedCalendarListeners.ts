import {
  collection,
  doc,
  onSnapshot,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { AddedCalendar, ShareFeed } from '@apps/a-list/types';

export function startAddedCalendarsListener(
  uid: string,
  onChange: (items: AddedCalendar[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'apps', 'a-list', 'memberships', uid, 'sharedCalendars'),
    (snapshot) =>
      onChange(snapshot.docs.map((item) => item.data() as AddedCalendar)),
    onError,
  );
}

const FEED_RETRY_MS = 5_000;

/**
 * A missing feed, or one the rules refuse, means the share was deleted or its PIN changed: it reaches `onChange` as null.
 * Any other failure (offline, a dropped connection) keeps what was shown and listens again shortly.
 */
export function startShareFeedListener(
  feedId: string,
  onChange: (feed: ShareFeed | null) => void,
): Unsubscribe {
  const state: {
    stop: Unsubscribe;
    retry: ReturnType<typeof setTimeout> | null;
    isStopped: boolean;
  } = {
    stop: () => undefined,
    retry: null,
    isStopped: false,
  };
  const listen = () => {
    state.stop = onSnapshot(
      doc(db, 'apps', 'a-list', 'shareFeeds', feedId),
      (snapshot) =>
        onChange(snapshot.exists() ? (snapshot.data() as ShareFeed) : null),
      (error: FirestoreError) => {
        if (error.code === 'permission-denied' || error.code === 'not-found') {
          onChange(null);
          return;
        }
        if (!state.isStopped) state.retry = setTimeout(listen, FEED_RETRY_MS);
      },
    );
  };
  listen();
  return () => {
    state.isStopped = true;
    if (state.retry !== null) clearTimeout(state.retry);
    state.stop();
  };
}
