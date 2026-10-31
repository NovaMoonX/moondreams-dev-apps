import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { sendBudgetedPush } from '../../notifications/sendBudgetedPush.js';
import { APP_ORIGIN, toAppUrl } from '../../notifications/sendPush.js';
import { getIdeaPush, getMemberUids, getSafeName, getTripLink } from './tripPushes.js';

if (getApps().length === 0) {
  initializeApp();
}

/** Pushes a new idea to everyone on the trip except the member who added it. */
export const notifyTripIdea = onDocumentCreated(
  { document: 'apps/waypoint/trips/{tripId}/ideas/{ideaId}', region: 'us-central1' },
  async (event) => {
    const idea = event.data?.data();
    if (!idea) {
      return;
    }

    const firestore = getFirestore();
    const tripSnapshot = await firestore.doc(`apps/waypoint/trips/${event.params.tripId}`).get();
    const trip = tripSnapshot.data();
    if (!trip) {
      return;
    }

    const targetUids = getMemberUids(trip).filter((uid) => uid !== idea.addedByUid);
    if (targetUids.length === 0) {
      return;
    }

    try {
      const author = typeof idea.addedByUid === 'string' ? await firestore.doc(`users/${idea.addedByUid}`).get().catch(() => null) : null;
      const content = getIdeaPush(idea, getSafeName(author?.get('displayName')), trip.title);
      const result = await sendBudgetedPush(firestore, getMessaging(), {
        appId: 'waypoint',
        uids: targetUids,
        content: { ...content, url: toAppUrl(getTripLink(event.params.tripId, 'ideas')) ?? APP_ORIGIN },
        zone: typeof trip.timezone === 'string' ? trip.timezone : null,
        now: Date.now(),
      });
      logger.info('Trip idea pushed', result);
    } catch (error) {
      logger.error('Trip idea push failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default notifyTripIdea;
