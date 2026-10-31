import type { DocumentData } from 'firebase-admin/firestore';

import { getLocalClock } from '../../notifications/localClock.js';
import { clip } from './tripPushes.js';

const DAY_MS = 86_400_000;

/** The local hour of the morning note, in the trip's own time zone; the 8:00 and 8:30 runs both fall in it. */
export const MORNING_HOUR = 8;

/** How many days before the trip starts the getting-ready note goes out. */
export const GETTING_READY_DAYS = 2;

export interface MorningDay {
  /** The trip's local date, which is also the claim stamp so a morning is sent once. */
  date: string;
  /** Days from the trip's first day; negative before it starts. */
  dayIndex: number;
}

const isKnownZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/** The trip day it is the morning of, or null outside the 8 AM hour or for a trip with no known zone (8 AM can't be placed for it). */
export function getMorningDay(trip: DocumentData, now: number): MorningDay | null {
  if (typeof trip.startDate !== 'number' || typeof trip.timezone !== 'string' || !isKnownZone(trip.timezone)) {
    return null;
  }
  const { date, hour } = getLocalClock(now, trip.timezone);
  if (hour !== MORNING_HOUR) {
    return null;
  }
  return { date, dayIndex: Math.round((Date.parse(`${date}T00:00:00Z`) - trip.startDate) / DAY_MS) };
}

export interface OpenChecklistItem {
  title: string;
  /** Empty means anyone: every member. */
  assignedToUids: string[];
  completeByDayIndex: number | null;
}

export interface MorningRecipient {
  uid: string;
  dueTitles: string[];
  openCount: number;
}

/** Who gets a morning note and what is theirs: items due today for the people they are assigned to (everyone when nobody is), plus every open item they own on the getting-ready morning, when everyone gets one. */
export function getMorningRecipients(
  items: OpenChecklistItem[],
  memberUids: string[],
  dayIndex: number,
  isGettingReady: boolean,
): MorningRecipient[] {
  return memberUids
    .map((uid) => {
      const mine = items.filter((item) => item.assignedToUids.length === 0 || item.assignedToUids.includes(uid));
      return {
        uid,
        dueTitles: mine.filter((item) => item.completeByDayIndex === dayIndex).map((item) => item.title),
        openCount: mine.length,
      };
    })
    .filter((person) => isGettingReady || person.dueTitles.length > 0);
}

export interface DayForecastReading {
  weatherCode: number | null;
  tempMax: number | null;
  tempMin: number | null;
  precipChance: number | null;
}

// Mirrors the groups in src/lib/weather/weatherCodes.ts, which this package can't import.
const WEATHER_WORDS: { codes: number[]; words: string }[] = [
  { codes: [0], words: 'clear skies' },
  { codes: [1, 2], words: 'partly sunny' },
  { codes: [3], words: 'overcast' },
  { codes: [45, 48], words: 'foggy' },
  { codes: [51, 53, 55, 56, 57], words: 'drizzle' },
  { codes: [61, 63, 80, 81], words: 'rain' },
  { codes: [65, 66, 67, 82], words: 'heavy rain' },
  { codes: [71, 73, 75, 77, 85, 86], words: 'snow' },
  { codes: [95, 96, 99], words: 'thunderstorms' },
];

const NO_FORECAST = 'Check the forecast and pack for it.';

export function getWeatherNudge(forecast: DayForecastReading | null): string {
  if (!forecast || forecast.tempMax === null || forecast.tempMin === null) {
    return NO_FORECAST;
  }
  const words = WEATHER_WORDS.find((entry) => forecast.weatherCode !== null && entry.codes.includes(forecast.weatherCode))?.words;
  const range = `${Math.round(forecast.tempMax)}°/${Math.round(forecast.tempMin)}°F`;
  return `Day one: ${words ? `${words}, ` : ''}${range}. Pack for it.`;
}

export interface GettingReadyDetails {
  forecast: DayForecastReading | null;
  firstPlanTitle: string | null;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const listTitles = (titles: string[]) => {
  const [first, second] = titles.map((title) => clip(title, 40));
  return titles.length === 1
    ? first
    : titles.length === 2
      ? `${first}, ${second}`
      : `${first}, ${second}, +${titles.length - 2} more`;
};

/** One note per person: what is due today, and on the getting-ready morning (`ready` set) the open to-dos, the forecast and the first plan folded into the same note. */
export function getMorningPush(
  person: Pick<MorningRecipient, 'dueTitles' | 'openCount'>,
  tripTitle: unknown,
  ready: GettingReadyDetails | null,
) {
  const place = typeof tripTitle === 'string' && tripTitle ? clip(tripTitle, 50) : 'your trip';
  const due = person.dueTitles.length;
  if (!ready) {
    return {
      title: `${plural(due, 'thing', 'things')} to do today for ${place}`,
      body: clip(listTitles(person.dueTitles)),
    };
  }
  const parts = [
    due > 0 ? `${plural(due, 'thing', 'things')} to do today: ${listTitles(person.dueTitles)}.` : null,
    person.openCount > 0 ? `${plural(person.openCount, 'to-do is', 'to-dos are')} still open for you.` : 'Your to-do list is all clear.',
    getWeatherNudge(ready.forecast),
    ready.firstPlanTitle ? `First up: ${clip(ready.firstPlanTitle, 50)}.` : null,
  ];
  return {
    title: `${place} starts in ${GETTING_READY_DAYS} days`,
    body: clip(parts.filter((part) => part !== null).join(' '), 180),
  };
}
