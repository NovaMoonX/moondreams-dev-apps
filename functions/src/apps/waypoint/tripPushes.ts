import type { DocumentData } from 'firebase-admin/firestore';

import { getLocalClock } from '../../notifications/localClock.js';

export { getLocalClock };

const DAY_MS = 86_400_000;

/** The local hour a trip's day is wrapped up, in the trip's own time zone. */
export const WRAP_UP_HOUR = 21;

const BODY_LIMIT = 140;

export function clip(text: string, limit = BODY_LIMIT): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

export function getMemberUids(trip: DocumentData): string[] {
  const members = trip.members;
  return members && typeof members === 'object' ? Object.keys(members) : [];
}

export function getAdminUids(trip: DocumentData): string[] {
  const members = (trip.members ?? {}) as Record<string, { role?: unknown }>;
  return Object.entries(members)
    .filter(([, member]) => member?.role === 'ADMIN')
    .map(([uid]) => uid);
}

/** A profile's display name can be the person's email (the sign-in fallback), which a push must never carry. A full name reads as first name and last initial ("Alex R."); one word stays as it is. */
export function getSafeName(displayName: unknown): string {
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.includes('@')) {
    return 'Someone';
  }
  const words = displayName.trim().split(/\s+/);
  const lastInitial = words.length > 1 ? Array.from(words[words.length - 1])[0]?.toLocaleUpperCase() : null;
  return lastInitial ? `${words[0]} ${lastInitial}.` : words[0];
}

export function getTripLink(tripId: string, tab: string | null = null): string {
  const base = `/waypoint?trip=${encodeURIComponent(tripId)}`;
  return tab ? `${base}&tab=${tab}` : base;
}

const SEVERITY_PREFIXES: Record<string, string> = { HEADS_UP: 'Heads up', URGENT: 'Urgent' };

export function getAnnouncementPush(announcement: DocumentData, tripTitle: unknown) {
  const prefix = SEVERITY_PREFIXES[String(announcement.severity)] ?? null;
  const title = clip(String(announcement.title ?? ''), 80);
  return {
    title: prefix ? `${prefix}: ${title}` : title,
    body: clip(String(announcement.body ?? '')) || (typeof tripTitle === 'string' ? tripTitle : ''),
  };
}

export function getIdeaPush(idea: DocumentData, authorName: string, tripTitle: unknown) {
  return {
    title: typeof tripTitle === 'string' && tripTitle ? `New idea for ${clip(tripTitle, 60)}` : 'New trip idea',
    body: `${authorName} suggested ${clip(String(idea.title ?? ''), 80)}`,
  };
}

export interface WrapUpDay {
  /** The trip's local date, which is also the claim stamp so a day is wrapped up once. */
  date: string;
  dayIndex: number;
}

/** The trip day to wrap up now, or null before the wrap-up hour, after it, or outside the trip's dates.
 * Two 30-minute runs fall in the hour, so one late or failed run still leaves the other. */
export function getWrapUpDay(trip: DocumentData, now: number): WrapUpDay | null {
  if (typeof trip.startDate !== 'number' || typeof trip.endDate !== 'number') {
    return null;
  }
  const { date, hour } = getLocalClock(now, typeof trip.timezone === 'string' ? trip.timezone : null);
  if (hour !== WRAP_UP_HOUR) {
    return null;
  }
  const dayIndex = Math.round((Date.parse(`${date}T00:00:00Z`) - trip.startDate) / DAY_MS);
  const dayCount = Math.floor((trip.endDate - trip.startDate) / DAY_MS) + 1;
  return dayIndex >= 0 && dayIndex < dayCount ? { date, dayIndex } : null;
}

export function getWrapUpPush(titles: string[], tripTitle: unknown) {
  const [first, second] = titles.map((title) => clip(title, 50));
  const named =
    titles.length === 1
      ? first
      : titles.length === 2
        ? `${first} and ${second}`
        : `${first}, ${second} and ${titles.length - 2} more`;
  const place = typeof tripTitle === 'string' && tripTitle ? ` on ${clip(tripTitle, 60)}` : '';
  return {
    title: 'Any expenses paid today?',
    body:
      titles.length === 1
        ? `${named} is still marked Expected${place}. Mark it paid if you've settled up.`
        : `${named} are still marked Expected${place}. Mark any you've settled up.`,
  };
}
