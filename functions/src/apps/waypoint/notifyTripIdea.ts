import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { APP_ORIGIN, sendPushToUsers, toAppUrl } from '../../notifications/sendPush.js';
import { getIdeaPush, getMemberUids, getSafeName, getTripLink } from './tripPushes.js';

if (getApps().length === 0) {
  initializeApp();
}

/** A new idea is worth a nudge for a day; FCM drops the push after this. */
const IDEA_USEFUL_FOR_MS = 24 * 60 * 60 * 1000;

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
      const devices = await sendPushToUsers(firestore, getMessaging(), targetUids, {
        ...content,
        url: toAppUrl(getTripLink(event.params.tripId, 'ideas')) ?? APP_ORIGIN,
        usefulForMs: IDEA_USEFUL_FOR_MS,
        urgency: 'normal',
      });
      logger.info('Trip idea pushed', { devices });
    } catch (error) {
      logger.error('Trip idea push failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default notifyTripIdea;
