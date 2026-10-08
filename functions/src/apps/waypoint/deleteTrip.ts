import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

const BATCH_LIMIT = 450;

// The trip and its invite code go in one batch so an invite never outlives its trip;
// the rest (subcollections, requests, email invitations, members' personal expenses, reminders, cover) is what a client deleteDoc can't reach.
export const deleteTrip = onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 180,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const authUid = request.auth?.uid;
    if (!authUid) {
      throw new HttpsError('unauthenticated', 'You must be signed in to delete a trip.');
    }

    const tripId =
      typeof request.data?.tripId === 'string' ? request.data.tripId.trim() : '';
    if (!tripId) {
      throw new HttpsError('invalid-argument', 'A trip is required.');
    }

    const firestore = getFirestore();
    const tripRef = firestore.doc(`apps/waypoint/trips/${tripId}`);
    const tripSnapshot = await tripRef.get();

    if (!tripSnapshot.exists) {
      throw new HttpsError('not-found', "We couldn't find this trip — it may already be deleted.");
    }

    const trip = tripSnapshot.data()!;
    const role = (trip.members as Record<string, { role: string }> | undefined)?.[authUid]?.role;
    if (role !== 'ADMIN') {
      throw new HttpsError('permission-denied', 'Only trip admins can delete this trip.');
    }

    try {
      const eventsSnapshot = await tripRef.collection('events').get();
      const reminderRefs = eventsSnapshot.docs.flatMap((eventDoc) => {
        const reminderId = eventDoc.data().reminderId;
        return typeof reminderId === 'string' && reminderId
          ? [firestore.doc(`reminders/${reminderId}`)]
          : [];
      });
      const requestsSnapshot = await firestore
        .collection('apps/waypoint/pendingRequests')
        .where('tripId', '==', tripId)
        .get();

      const invitesSnapshot = await firestore
        .collection('apps/waypoint/emailInvites')
        .where('tripId', '==', tripId)
        .get();

      const memberIds = Object.keys((trip.members as Record<string, unknown> | undefined) ?? {});
      const personalSnapshots = await Promise.all(
        memberIds.flatMap((uid) =>
          ['personalExpenses', 'personalChecklist'].map((root) =>
            firestore.collection(`apps/waypoint/${root}/${uid}/items`).where('tripId', '==', tripId).get(),
          ),
        ),
      );

      const batch = firestore.batch();
      batch.delete(tripRef);
      if (typeof trip.inviteCode === 'string' && trip.inviteCode) {
        batch.delete(firestore.doc(`apps/waypoint/inviteCodes/${trip.inviteCode}`));
      }
      await batch.commit();

      await firestore.recursiveDelete(tripRef);

      const looseRefs = [
        ...reminderRefs,
        ...requestsSnapshot.docs.map((d) => d.ref),
        ...invitesSnapshot.docs.map((d) => d.ref),
        ...personalSnapshots.flatMap((snapshot) => snapshot.docs.map((d) => d.ref)),
      ];
      for (let i = 0; i < looseRefs.length; i += BATCH_LIMIT) {
        const cleanup = firestore.batch();
        looseRefs.slice(i, i + BATCH_LIMIT).forEach((ref) => cleanup.delete(ref));
        await cleanup.commit();
      }

      await getStorage()
        .bucket()
        .deleteFiles({ prefix: `waypoint/trips/${tripId}/` })
        .catch((error) => console.error('deleteTrip storage cleanup failed', error));

      return { tripId };
    } catch (error) {
      console.error('deleteTrip failed', error);
      throw new HttpsError('internal', 'Something went wrong while deleting your trip.');
    }
  },
);
