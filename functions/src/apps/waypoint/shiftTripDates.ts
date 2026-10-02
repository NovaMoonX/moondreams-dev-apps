import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
// A transaction commits at most 500 writes; a trip with more items than this needs a different approach.
const MAX_ITEMS = 450;

const STAY_DAY_FIELDS = [
  'checkInDayIndex',
  'checkOutDayIndex',
  'plannedArrivalDayIndex',
  'plannedDepartureDayIndex',
] as const;

interface ShiftTripDatesInput {
  tripId: string;
  title: string;
  startDate: number;
  endDate: number;
  coverImageUrl: string | null;
  defaultCurrency: string | null;
  timezone: string | null;
}

function isValidTimezone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
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

  const timezone =
    typeof payload.timezone === 'string' && payload.timezone.trim() ? payload.timezone.trim() : null;
  if (timezone && !isValidTimezone(timezone)) {
    throw new HttpsError('invalid-argument', 'Choose a valid time zone.');
  }

  return {
    tripId,
    title,
    startDate,
    endDate,
    coverImageUrl: typeof payload.coverImageUrl === 'string' ? payload.coverImageUrl : null,
    defaultCurrency: typeof payload.defaultCurrency === 'string' ? payload.defaultCurrency : null,
    timezone,
  };
}

function rebaseDayFields(data: DocumentData, fields: readonly string[], deltaDays: number) {
  const result = Object.fromEntries(
    fields
      .filter((field) => typeof data[field] === 'number')
      .map((field) => [field, data[field] - deltaDays]),
  );
  return result;
}

// An idea's suggested days are only a hint: any that land outside the new range are cleared
// from the idea (which is always kept, with none left it just has no day preference).
function rebaseIdeaDays(
  data: DocumentData,
  deltaDays: number,
  dayCount: number,
): Record<string, number[]> {
  const days: unknown = data.ideaDetails?.suggestedDays;
  if (!Array.isArray(days) || days.length === 0) {
    return {};
  }

  const rebasedDays = days
    .filter((day): day is number => typeof day === 'number')
    .map((day) => day - deltaDays)
    .filter((day) => day >= 0 && day < dayCount);
  const hasChanged =
    rebasedDays.length !== days.length || rebasedDays.some((day, index) => day !== days[index]);
  return hasChanged ? { 'ideaDetails.suggestedDays': rebasedDays } : {};
}

/**
 * Moves a trip's dates while keeping every event, stay, expense, checklist item and idea's
 * suggested days on the
 * calendar day it was already on: the trip's start moves, so each item's day number is
 * rebased by the same amount. Called only when someone opts into "keep original dates" —
 * the default (items travel with the trip) is a plain trip-document write on the client.
 *
 * Runs with the Admin SDK because Firestore rules limit who can write events and stays
 * while a trip is live, and inside one transaction so a concurrent edit can't be half-applied.
 * Items pushed outside the new range keep their out-of-range number rather than being clamped;
 * the exception is an idea's suggested days, which are cleared (the idea itself is kept).
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

    try {
      const { lastEditedAt, previousTitle, inviteCode } = await firestore.runTransaction(
        async (transaction) => {
          const tripSnapshot = await transaction.get(tripRef);
          if (!tripSnapshot.exists) {
            throw new HttpsError(
              'not-found',
              "We couldn't find this trip — it may have been deleted.",
            );
          }

          const trip = tripSnapshot.data() as DocumentData;
          const role = (trip.members as Record<string, { role: string }> | undefined)?.[authUid]
            ?.role;
          if (role !== 'ADMIN' && role !== 'EDITOR') {
            throw new HttpsError(
              'permission-denied',
              'You do not have permission to edit this trip.',
            );
          }
          if (trip.timeModel !== 'RELATIVE') {
            throw new HttpsError('failed-precondition', "This trip's dates are fixed.");
          }

          const [events, stays, expenses, checklist, ideas] = await Promise.all([
            transaction.get(tripRef.collection('events')),
            transaction.get(tripRef.collection('stays')),
            transaction.get(tripRef.collection('expenses')),
            transaction.get(tripRef.collection('checklist')),
            transaction.get(tripRef.collection('ideas')),
          ]);
          const itemCount =
            events.size + stays.size + expenses.size + checklist.size + ideas.size;
          if (itemCount > MAX_ITEMS) {
            throw new HttpsError(
              'failed-precondition',
              'This trip has too many items to keep on their original dates. Try moving the dates without that option.',
            );
          }

          const deltaDays = Math.round((input.startDate - trip.startDate) / DAY_MS);
          const newDayCount = Math.max(1, Math.floor((input.endDate - input.startDate) / DAY_MS) + 1);
          const rebased: { ref: DocumentReference; data: Record<string, number | unknown[]> }[] = [
            ...events.docs.map((doc) => ({
              ref: doc.ref,
              data: rebaseDayFields(doc.data(), ['dayIndex', 'endDayIndex'], deltaDays),
            })),
            ...stays.docs.map((doc) => ({
              ref: doc.ref,
              data: rebaseDayFields(doc.data(), STAY_DAY_FIELDS, deltaDays),
            })),
            ...expenses.docs.map((doc) => ({
              ref: doc.ref,
              data: rebaseDayFields(doc.data(), ['dayIndex'], deltaDays),
            })),
            ...checklist.docs.map((doc) => ({
              ref: doc.ref,
              data: rebaseDayFields(doc.data(), ['completeByDayIndex'], deltaDays),
            })),
            ...ideas.docs.map((doc) => ({
              ref: doc.ref,
              data: rebaseIdeaDays(doc.data(), deltaDays, newDayCount),
            })),
          ].filter(({ data }) => Object.keys(data).length > 0);

          const editedAt = Date.now();
          rebased.forEach(({ ref, data }) => transaction.update(ref, data));
          transaction.update(tripRef, {
            title: input.title,
            startDate: input.startDate,
            endDate: input.endDate,
            coverImageUrl: input.coverImageUrl,
            defaultCurrency: input.defaultCurrency,
            ...(input.timezone ? { timezone: input.timezone } : {}),
            lastEditedAt: editedAt,
          });

          return {
            lastEditedAt: editedAt,
            previousTitle: trip.title as string,
            inviteCode: (trip.inviteCode as string | null) ?? null,
          };
        },
      );

      if (input.title !== previousTitle && inviteCode) {
        await firestore.doc(`apps/waypoint/inviteCodes/${inviteCode}`).update({
          title: input.title,
        });
      }

      return { tripId: input.tripId, lastEditedAt };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }
      console.error('shiftTripDates failed', error);
      throw new HttpsError('internal', "Something went wrong while updating your trip's dates.");
    }
  },
);
