import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

import { zonedDateTimeToEpoch } from './zonedTime.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const WATCHED_TRIP_FIELDS = ['startDate', 'endDate', 'timezone'] as const;

function formatLead(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [
    hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '',
    rest ? `${rest} minutes` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function getReminderInstant(trip: DocumentData, event: DocumentData): number | null {
  const dayCount = Math.max(1, Math.floor((trip.endDate - trip.startDate) / DAY_MS) + 1);
  const { dayIndex, startTime } = event;
  const zone = event.timezone ?? trip.timezone;
  const isScheduled =
    typeof dayIndex === 'number' &&
    dayIndex >= 0 &&
    dayIndex < dayCount &&
    typeof startTime === 'string' &&
    TIME_PATTERN.test(startTime) &&
    typeof zone === 'string';
  if (!isScheduled) {
    return null;
  }

  try {
    const date = new Date(trip.startDate + dayIndex * DAY_MS).toISOString().slice(0, 10);
    return zonedDateTimeToEpoch(date, startTime, zone) - event.reminderMinutesBefore * 60_000;
  } catch {
    return null;
  }
}

/**
 * Re-times every event reminder when a relative trip's dates or time zone change. Reminders are
 * absolute instants (that's all the delivery function understands), so they have to follow the
 * trip: moved when the event is still on the calendar, cancelled when it has fallen outside the
 * trip's dates or has no day, and re-created if an event comes back into range after its reminder
 * was cancelled or already sent. Everything is re-derived from the stored events, so a concurrent
 * event edit simply converges on the same answer.
 */
export const rescheduleTripReminders = onDocumentUpdated(
  { document: 'apps/waypoint/trips/{tripId}', region: 'us-central1' },
  async (change) => {
    const before = change.data?.before.data();
    const after = change.data?.after.data();
    if (!before || !after || after.timeModel !== 'RELATIVE') {
      return;
    }
    if (WATCHED_TRIP_FIELDS.every((field) => before[field] === after[field])) {
      return;
    }

    const firestore = getFirestore();
    const tripRef = change.data!.after.ref;
    const eventsSnapshot = await tripRef.collection('events').get();
    const now = Date.now();

    const writes = (
      await Promise.all(
        eventsSnapshot.docs.map(async (eventDoc) => {
          const event = eventDoc.data();
          if (event.reminderEnabled !== true) {
            return [];
          }

          const scheduledFor = event.isArchived === true ? null : getReminderInstant(after, event);
          const reminderRef =
            typeof event.reminderId === 'string' ? firestore.doc(`reminders/${event.reminderId}`) : null;
          const reminder = reminderRef ? (await reminderRef.get()).data() : undefined;
          const isPending = reminder?.status === 'pending';

          const cancelPending = () =>
            reminderRef && isPending
              ? [(batch: FirebaseFirestore.WriteBatch) => batch.update(reminderRef, { status: 'cancelled' })]
              : [];

          // A reminder moved to a time that already passed would be delivered all at once.
          if (scheduledFor === null || scheduledFor <= now) {
            return cancelPending();
          }
          if (isPending && reminderRef) {
            return [(batch: FirebaseFirestore.WriteBatch) => batch.update(reminderRef, { scheduledFor })];
          }

          // Triggers can be delivered more than once; a fixed id per event means a repeat rewrites
          // the same document instead of creating a second one that would also be sent.
          const newReminderRef = firestore.doc(`reminders/waypoint-${tripRef.id}-${eventDoc.id}`);
          const assigned: string[] = Array.isArray(event.assignedMemberIds) ? event.assignedMemberIds : [];
          const targetUids = assigned.length > 0 ? assigned : Object.keys(after.members ?? {});
          return [
            (batch: FirebaseFirestore.WriteBatch) =>
              batch.set(newReminderRef, {
                id: newReminderRef.id,
                appId: 'waypoint',
                targetUids,
                title: event.title,
                body: `Starting in ${formatLead(event.reminderMinutesBefore)}.`,
                scheduledFor,
                status: 'pending',
                channels: ['push'],
                relatedEntityPath: `apps/waypoint/trips/${tripRef.id}/events/${eventDoc.id}`,
                recurrence: 'none',
                createdBy: event.createdBy,
                createdAt: now,
              }),
            (batch: FirebaseFirestore.WriteBatch) =>
              batch.update(eventDoc.ref, { reminderId: newReminderRef.id }),
          ];
        }),
      )
    ).flat();

    const BATCH_LIMIT = 450;
    const chunks = Array.from({ length: Math.ceil(writes.length / BATCH_LIMIT) }, (_, index) =>
      writes.slice(index * BATCH_LIMIT, (index + 1) * BATCH_LIMIT),
    );
    await chunks.reduce(async (previous, chunk) => {
      await previous;
      const batch = firestore.batch();
      chunk.forEach((write) => write(batch));
      await batch.commit();
    }, Promise.resolve());
  },
);
