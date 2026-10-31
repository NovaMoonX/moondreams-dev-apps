import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { APP_ORIGIN, sendPushToUsers, toAppUrl } from '../../notifications/sendPush.js';
import { getAnnouncementPush, getMemberUids, getTripLink } from './tripPushes.js';

if (getApps().length === 0) {
  initializeApp();
}

/** An announcement is still news for a day; FCM drops the push after this. */
const ANNOUNCEMENT_USEFUL_FOR_MS = 24 * 60 * 60 * 1000;

/** Pushes a new announcement to everyone on the trip except the Admin who posted it. */
export const notifyTripAnnouncement = onDocumentCreated(
  { document: 'apps/waypoint/trips/{tripId}/announcements/{announcementId}', region: 'us-central1' },
  async (event) => {
    const announcement = event.data?.data();
    if (!announcement) {
      return;
    }
    if (typeof announcement.expiresAt === 'number' && announcement.expiresAt <= Date.now()) {
      return;
    }

    const firestore = getFirestore();
    const tripSnapshot = await firestore.doc(`apps/waypoint/trips/${event.params.tripId}`).get();
    const trip = tripSnapshot.data();
    if (!trip) {
      return;
    }

    const targetUids = getMemberUids(trip).filter((uid) => uid !== announcement.createdBy);
    if (targetUids.length === 0) {
      return;
    }

    const content = getAnnouncementPush(announcement, trip.title);
    try {
      const devices = await sendPushToUsers(firestore, getMessaging(), targetUids, {
        ...content,
        url: toAppUrl(getTripLink(event.params.tripId)) ?? APP_ORIGIN,
        usefulForMs: ANNOUNCEMENT_USEFUL_FOR_MS,
        urgency: announcement.severity === 'URGENT' ? 'high' : 'normal',
      });
      logger.info('Trip announcement pushed', { devices });
    } catch (error) {
      logger.error('Trip announcement push failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default notifyTripAnnouncement;
