import { collection, doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import type { AddedCalendar, ShareFeed } from '@apps/a-list/types';

export function startAddedCalendarsListener(
  uid: string,
  onChange: (items: AddedCalendar[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'apps', 'a-list', 'memberships', uid, 'sharedCalendars'),
    (snapshot) => onChange(snapshot.docs.map((item) => item.data() as AddedCalendar)),
    onError,
  );
}

/** A missing feed, or one the rules refuse, means the share was deleted or its PIN changed: it reaches `onChange` as null. */
export function startShareFeedListener(
  feedId: string,
  onChange: (feed: ShareFeed | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'apps', 'a-list', 'shareFeeds', feedId),
    (snapshot) => onChange(snapshot.exists() ? (snapshot.data() as ShareFeed) : null),
    () => onChange(null),
  );
}
