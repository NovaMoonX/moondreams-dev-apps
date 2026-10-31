import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { sendBudgetedPush } from '../../notifications/sendBudgetedPush.js';
import { APP_ORIGIN, toAppUrl } from '../../notifications/sendPush.js';
import {
  GETTING_READY_DAYS,
  getMorningDay,
  getMorningPush,
  getMorningRecipients,
  type DayForecastReading,
  type GettingReadyDetails,
  type OpenChecklistItem,
} from './morningPushes.js';
import { getMemberUids, getTripLink } from './tripPushes.js';

if (getApps().length === 0) {
  initializeApp();
}

const DAY_MS = 86_400_000;
const STATE_PATH = 'apps/waypoint/pushState';
const ITEM_LIMIT = 300;
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Takes the trip's morning inside a transaction, so overlapping runs send one: the stamp is written before the pushes, which makes a failed send a skipped morning rather than a doubled one. */
const claimMorning = (firestore: Firestore, tripId: string, date: string) =>
  firestore.runTransaction(async (transaction) => {
    const ref = firestore.doc(`${STATE_PATH}/${tripId}`);
    const snapshot = await transaction.get(ref);
    if (snapshot.get('lastMorningDay') === date) {
      return false;
    }
    transaction.set(ref, { lastMorningDay: date }, { merge: true });
    return true;
  });

/** The trip's first day's forecast from Open-Meteo's keyless endpoint, or null when the trip has no city or the request fails: the note then just says to check the weather. */
async function fetchFirstDayForecast(trip: DocumentData): Promise<DayForecastReading | null> {
  const { latitude, longitude } = (trip.city ?? {}) as { latitude?: unknown; longitude?: unknown };
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  try {
    const date = new Date(trip.startDate).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      temperature_unit: 'fahrenheit',
      timezone: trip.timezone,
      start_date: date,
      end_date: date,
    });
    const response = await fetch(`${FORECAST_URL}?${params.toString()}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return null;
    }
    const daily = ((await response.json()) as { daily?: Record<string, (number | null)[]> }).daily;
    return {
      weatherCode: daily?.weather_code?.[0] ?? null,
      tempMax: daily?.temperature_2m_max?.[0] ?? null,
      tempMin: daily?.temperature_2m_min?.[0] ?? null,
      precipChance: daily?.precipitation_probability_max?.[0] ?? null,
    };
  } catch {
    return null;
  }
}

/** The title of the trip's earliest timed plan on its first day, for a relative-time trip; null when there is none. */
async function findFirstPlanTitle(firestore: Firestore, tripId: string): Promise<string | null> {
  const events = await firestore
    .collection(`apps/waypoint/trips/${tripId}/events`)
    .where('dayIndex', '==', 0)
    .limit(30)
    .get();
  const timed = events.docs
    .filter((event) => event.get('isArchived') !== true && typeof event.get('startTime') === 'string' && event.get('attendeeTargetType') !== 'SPECIFIC_MEMBERS')
    .sort((first, second) => String(first.get('startTime')).localeCompare(String(second.get('startTime'))));
  const title = timed[0]?.get('title');
  return typeof title === 'string' && title.trim() ? title : null;
}

async function readGettingReady(firestore: Firestore, tripId: string, trip: DocumentData): Promise<GettingReadyDetails> {
  const [forecast, firstPlanTitle] = await Promise.all([
    fetchFirstDayForecast(trip),
    findFirstPlanTitle(firestore, tripId).catch(() => null),
  ]);
  return { forecast, firstPlanTitle };
}

async function sendTripMorning(
  firestore: Firestore,
  messaging: Messaging,
  tripId: string,
  trip: DocumentData,
  now: number,
): Promise<number> {
  const day = getMorningDay(trip, now);
  const memberUids = getMemberUids(trip);
  if (trip.isArchived === true || day === null || memberUids.length === 0) {
    return 0;
  }

  const isGettingReady = day.dayIndex === -GETTING_READY_DAYS;
  const snapshot = await firestore
    .collection(`apps/waypoint/trips/${tripId}/checklist`)
    .where('isCompleted', '==', false)
    .limit(ITEM_LIMIT)
    .get();
  const items = snapshot.docs.map(
    (item): OpenChecklistItem => ({
      title: String(item.get('title') ?? 'A to-do'),
      assignedToUids: Array.isArray(item.get('assignedToUids'))
        ? item.get('assignedToUids').filter((uid: unknown): uid is string => typeof uid === 'string')
        : [],
      completeByDayIndex: typeof item.get('completeByDayIndex') === 'number' ? item.get('completeByDayIndex') : null,
    }),
  );
  const recipients = getMorningRecipients(items, memberUids, day.dayIndex, isGettingReady);
  if (recipients.length === 0 || !(await claimMorning(firestore, tripId, day.date))) {
    return 0;
  }

  const ready = isGettingReady ? await readGettingReady(firestore, tripId, trip) : null;
  const url = toAppUrl(getTripLink(tripId, 'checklist')) ?? APP_ORIGIN;
  const results = await Promise.all(
    recipients.map((person) =>
      sendBudgetedPush(firestore, messaging, {
        appId: 'waypoint',
        uids: [person.uid],
        content: { ...getMorningPush(person, trip.title, ready), url },
        zone: trip.timezone,
        now,
      }),
    ),
  );
  if (results.some((result) => result.quiet + result.capped > 0)) {
    logger.info('Morning push held back', {
      tripId,
      quiet: results.reduce((total, result) => total + result.quiet, 0),
      capped: results.reduce((total, result) => total + result.capped, 0),
    });
  }
  return results.reduce((total, result) => total + result.devices, 0);
}

/**
 * At 8 AM in the trip's own time zone, sends each member one note: the open to-dos due today that are
 * theirs (or for anyone), and two days before the trip starts, the getting-ready note with their open
 * to-do count, the first day's forecast and the first plan, folded into the same push. Nothing due and
 * no getting-ready morning sends nothing and writes nothing.
 */
export const sendMorningPush = onSchedule(
  { schedule: 'every 30 minutes', timeoutSeconds: 300 },
  async () => {
    const firestore = getFirestore();
    const messaging = getMessaging();
    const now = Date.now();
    const trips = await firestore
      .collection('apps/waypoint/trips')
      .where('endDate', '>=', now - 2 * DAY_MS)
      .get();

    const results = await Promise.allSettled(
      trips.docs.map((trip) => sendTripMorning(firestore, messaging, trip.id, trip.data(), now)),
    );
    results.forEach((result) => {
      if (result.status === 'rejected') {
        logger.error('Morning push failed for one trip', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    });
    logger.info('Morning push', {
      checked: trips.size,
      devices: results.reduce((total, result) => total + (result.status === 'fulfilled' ? result.value : 0), 0),
    });
  },
);

export default sendMorningPush;
