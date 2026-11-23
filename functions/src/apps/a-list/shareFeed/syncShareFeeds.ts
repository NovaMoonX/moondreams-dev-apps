import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { getFeedRef, getShareRef, refreshLiveFeeds } from './shareFeeds.js';

const TRIGGER_OPTIONS = { region: 'us-central1', maxInstances: 10, timeoutSeconds: 60 } as const;

/** Any change to a member's showings, from the app or from a forwarded email, reaches their live links within seconds. */
export const syncAListLiveFeeds = onDocumentWritten(
  { ...TRIGGER_OPTIONS, document: 'apps/a-list/memberships/{uid}/viewings/{viewingId}' },
  async (event) => {
    const count = await refreshLiveFeeds(event.params.uid);
    if (count > 0) logger.info('aList.liveFeeds.refreshed', { count });
  },
);

/** Deleting a share or changing its PIN retires its feed, so everyone who added it loses it at once and must open the link again. */
export const retireAListShareFeed = onDocumentWritten(
  { ...TRIGGER_OPTIONS, document: 'apps/a-list/calendarShares/{shareId}' },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const feedId = typeof before?.feedId === 'string' ? before.feedId : '';
    if (feedId === '') return;

    if (after === undefined) {
      await getFeedRef(feedId).delete();
      return;
    }
    if ((before?.pin ?? null) === (after.pin ?? null)) return;

    await getFeedRef(feedId).delete();
    if (after.feedId === feedId) {
      await getShareRef(event.params.shareId).update({ feedId: null });
    }
  },
);
