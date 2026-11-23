import { isDeepStrictEqual } from 'node:util';

import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { fromStoredViewing } from '../calendarShareView.js';
import { refreshLiveFeeds, retireShareFeed } from './shareFeeds.js';

const TRIGGER_OPTIONS = { region: 'us-central1', maxInstances: 10, timeoutSeconds: 60 } as const;

const toShown = (data: Record<string, unknown> | undefined) => (data === undefined ? null : fromStoredViewing(data));

/** Any change a visitor would see in a member's showings, from the app or from a forwarded email, reaches their live links within seconds. */
export const syncAListLiveFeeds = onDocumentWritten(
  { ...TRIGGER_OPTIONS, document: 'apps/a-list/memberships/{uid}/viewings/{viewingId}' },
  async (event) => {
    if (isDeepStrictEqual(toShown(event.data?.before.data()), toShown(event.data?.after.data()))) return;
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
    if (after !== undefined && (before?.pin ?? null) === (after.pin ?? null)) return;
    await retireShareFeed(event.params.shareId, feedId);
  },
);
