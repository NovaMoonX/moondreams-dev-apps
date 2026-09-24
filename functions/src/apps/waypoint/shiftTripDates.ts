import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
// Firestore caps a single batch at 500 writes; a trip with hundreds of dated
// items can exceed that, so the shift is committed in chunks rather than one.
const BATCH_LIMIT = 450;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getDayCount(startDate: number, endDate: number) {
  return Math.max(1, Math.floor((endDate - startDate) / DAY_MS) + 1);
}

async function commitInChunks(
  firestore: Firestore,
  updates: { ref: DocumentReference; data: Record<string, unknown> }[],
) {
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = firestore.batch();
    chunk.forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
}

/** A document missing one of these (rather than holding an explicit null) fails
 * the security rules' shape check on any future write; healing it here prevents
 * a legacy/malformed document from blocking this trip's next date change too. */
function backfillMissingFields(
  updates: Record<string, unknown>,
  data: FirebaseFirestore.DocumentData,
  fields: readonly string[],
) {
  fields.forEach((field) => {
    if (!(field in data)) {
      updates[field] = null;
    }
  });
}

interface ShiftTripDatesInput {
  tripId: string;
  title: string;
  startDate: number;
  endDate: number;
  coverImageUrl: string | null;
  defaultCurrency: string | null;
  /** True: shift every absolute timestamp so Day 1 stays Day 1. False: keep
   * exact dates/times and recompute day numbers instead — stays have no day
   * number, so they're left untouched either way. */
  shiftDates: boolean;
}

function parseInput(data: unknown): ShiftTripDatesInput {
  const payload = (data ?? {}) as Record<string, unknown>;
  const tripId = typeof payload.tripId === 'string' ? payload.tripId.trim() : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const startDate = typeof payload.startDate === 'number' ? payload.startDate : NaN;
  const endDate = typeof payload.endDate === 'number' ? payload.endDate : NaN;

  if (
    !tripId ||
    !title ||
    !Number.isFinite(startDate) ||
    !Number.isFinite(endDate) ||
    endDate < startDate
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Enter a trip title and an end date on or after the start date.',
    );
  }

  return {
    tripId,
    title,
    startDate,
    endDate,
    coverImageUrl: typeof payload.coverImageUrl === 'string' ? payload.coverImageUrl : null,
    defaultCurrency: typeof payload.defaultCurrency === 'string' ? payload.defaultCurrency : null,
    shiftDates: payload.shiftDates !== false,
  };
}

/**
 * Re-dates a trip's items after its start/end date changes. Called for every
 * date change; the trip document's own new dates are written last.
 *
 * Only some items are purely relative to the trip's start:
 *   - expenses (`dayIndex`) and checklist items (`completeByDayIndex`) store
 *     just a day number, nullable ("no specific day");
 *   - events store a required `dayIndex` AND an absolute `startAt`/`endAt`
 *     (what the clock times, reminders, "Active now" and sorting read);
 *   - stays store only absolute `checkInAt`/`checkOutAt`, no day number.
 *
 * shiftDates = true ("Day 1 stays Day 1"): day numbers are left alone, so
 * expenses/checklist need no writes. Event and stay timestamps move by the
 * start-date delta, and each event's pending reminder is rescheduled. Items
 * now past the new last day keep an out-of-range day number (the modal warns).
 *
 * shiftDates = false ("keep exact dates"): timestamps are left alone and day
 * numbers are recomputed against the new start. Expenses/checklist outside
 * the new range become null; events are clamped into range, since their
 * `dayIndex` can't be null. Stays have no day number, so nothing changes.
 *
 * Either way, events/stays missing `place`/`linkUrl`/`linkPreview` get them
 * backfilled to null so the rules' shape check can't block the next write.
 * `trip.dateShiftStatus` is 'PENDING' for the duration, which makes the
 * trip read-only in firestore.rules; this Admin SDK code bypasses that.
 */
export const shiftTripDates = onCall(
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
      throw new HttpsError('unauthenticated', 'You must be signed in to edit a trip.');
    }

    const input = parseInput(request.data);
    const firestore = getFirestore();
    const tripRef = firestore.doc(`apps/waypoint/trips/${input.tripId}`);
    const tripSnapshot = await tripRef.get();

    if (!tripSnapshot.exists) {
      throw new HttpsError('not-found', "We couldn't find this trip — it may have been deleted.");
    }

    const trip = tripSnapshot.data()!;
    const role = (trip.members as Record<string, { role: string }> | undefined)?.[authUid]?.role;
    if (role !== 'ADMIN' && role !== 'EDITOR') {
      throw new HttpsError('permission-denied', 'You do not have permission to edit this trip.');
    }
    if (trip.dateShiftStatus === 'PENDING') {
      throw new HttpsError(
        'failed-precondition',
        "This trip's dates are already being updated.",
      );
    }

    await tripRef.update({ dateShiftStatus: 'PENDING' });

    try {
      const dateDelta = input.startDate - trip.startDate;
      const deltaDays = Math.round(dateDelta / DAY_MS);
      const newDayCount = getDayCount(input.startDate, input.endDate);
      const datesChanged = dateDelta !== 0 || input.endDate !== trip.endDate;

      if (datesChanged) {
        const [eventsSnapshot, staysSnapshot, expensesSnapshot, checklistSnapshot] =
          await Promise.all([
            tripRef.collection('events').get(),
            tripRef.collection('stays').get(),
            tripRef.collection('expenses').get(),
            tripRef.collection('checklist').get(),
          ]);

        const updates: { ref: DocumentReference; data: Record<string, unknown> }[] = [];

        eventsSnapshot.docs.forEach((eventDoc) => {
          const data = eventDoc.data();
          const eventUpdates: Record<string, unknown> = {};

          if (input.shiftDates) {
            if (dateDelta !== 0) {
              if (typeof data.startAt === 'number') {
                eventUpdates.startAt = data.startAt + dateDelta;
              }
              if (typeof data.endAt === 'number') {
                eventUpdates.endAt = data.endAt + dateDelta;
              }
              if (
                data.reminderEnabled &&
                typeof data.reminderId === 'string' &&
                typeof eventUpdates.startAt === 'number' &&
                typeof data.reminderMinutesBefore === 'number'
              ) {
                updates.push({
                  ref: firestore.doc(`reminders/${data.reminderId}`),
                  data: {
                    scheduledFor:
                      eventUpdates.startAt - data.reminderMinutesBefore * 60_000,
                  },
                });
              }
            }
          } else if (typeof data.dayIndex === 'number' && typeof data.endDayIndex === 'number') {
            const nextDayIndex = clamp(data.dayIndex - deltaDays, 0, newDayCount - 1);
            eventUpdates.dayIndex = nextDayIndex;
            eventUpdates.endDayIndex = clamp(
              data.endDayIndex - deltaDays,
              nextDayIndex,
              newDayCount - 1,
            );
          }

          backfillMissingFields(eventUpdates, data, ['place', 'linkUrl', 'linkPreview']);
          if (Object.keys(eventUpdates).length > 0) {
            updates.push({ ref: eventDoc.ref, data: eventUpdates });
          }
        });

        staysSnapshot.docs.forEach((stayDoc) => {
          const data = stayDoc.data();
          const stayUpdates: Record<string, unknown> = {};

          if (input.shiftDates && dateDelta !== 0) {
            (['checkInAt', 'checkOutAt', 'plannedArrivalAt', 'plannedDepartureAt'] as const).forEach(
              (field) => {
                if (typeof data[field] === 'number') {
                  stayUpdates[field] = data[field] + dateDelta;
                }
              },
            );
          }

          backfillMissingFields(stayUpdates, data, ['place', 'linkUrl', 'linkPreview']);
          if (Object.keys(stayUpdates).length > 0) {
            updates.push({ ref: stayDoc.ref, data: stayUpdates });
          }
        });

        if (!input.shiftDates) {
          expensesSnapshot.docs.forEach((expenseDoc) => {
            const data = expenseDoc.data();
            if (typeof data.dayIndex !== 'number') {
              return;
            }
            const nextDayIndex = data.dayIndex - deltaDays;
            const clamped =
              nextDayIndex >= 0 && nextDayIndex < newDayCount ? nextDayIndex : null;
            if (clamped !== data.dayIndex) {
              updates.push({ ref: expenseDoc.ref, data: { dayIndex: clamped } });
            }
          });

          checklistSnapshot.docs.forEach((checklistDoc) => {
            const data = checklistDoc.data();
            if (typeof data.completeByDayIndex !== 'number') {
              return;
            }
            const nextDayIndex = data.completeByDayIndex - deltaDays;
            const clamped =
              nextDayIndex >= 0 && nextDayIndex < newDayCount ? nextDayIndex : null;
            if (clamped !== data.completeByDayIndex) {
              updates.push({ ref: checklistDoc.ref, data: { completeByDayIndex: clamped } });
            }
          });
        }

        await commitInChunks(firestore, updates);
      }

      const lastEditedAt = Date.now();
      await tripRef.update({
        title: input.title,
        startDate: input.startDate,
        endDate: input.endDate,
        coverImageUrl: input.coverImageUrl,
        defaultCurrency: input.defaultCurrency,
        dateShiftStatus: 'IDLE',
        lastEditedAt,
      });

      if (input.title !== trip.title && trip.inviteCode) {
        await firestore.doc(`apps/waypoint/inviteCodes/${trip.inviteCode}`).update({
          title: input.title,
        });
      }

      return { tripId: input.tripId, lastEditedAt };
    } catch (error) {
      await tripRef.update({ dateShiftStatus: 'IDLE' }).catch(() => {});
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('shiftTripDates failed', error);
      throw new HttpsError('internal', "Something went wrong while updating your trip's dates.");
    }
  },
);
