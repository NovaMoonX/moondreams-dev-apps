import type { Cat } from '../types';

export interface UpcomingBirthday {
  catId: string;
  /** This year's (or next year's, if this year's has passed) occurrence of the cat's birthday. */
  occursAt: number;
  daysUntil: number;
}

export interface AdoptionAnniversary {
  catId: string;
  /** This year's (or a prior year's, if not yet reached) occurrence of the adoption date. */
  occursAt: number;
  daysSince: number;
  yearsSinceAdoption: number;
}

const DAY_MS = 86_400_000;
const UPCOMING_BIRTHDAY_WINDOW_DAYS = 7;
const ADOPTION_ANNIVERSARY_WINDOW_DAYS = 7;

/** Midnight UTC for the given timestamp's UTC calendar date — used as a stable day-granularity anchor regardless of local timezone. */
function startOfUtcDay(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcCalendarDaysBetween(fromMs: number, toMs: number): number {
  return Math.round((startOfUtcDay(toMs) - startOfUtcDay(fromMs)) / DAY_MS);
}

/** The next occurrence (today or later) of `timestamp`'s UTC month/day, anchored to `nowMs`'s year (or the following year, if this year's date has already passed). */
export function nextOccurrenceOnOrAfter(timestamp: number, nowMs: number): number {
  const source = new Date(timestamp);
  const now = new Date(nowMs);
  const occurrence = Date.UTC(now.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate());

  return occurrence < startOfUtcDay(nowMs) ? Date.UTC(now.getUTCFullYear() + 1, source.getUTCMonth(), source.getUTCDate()) : occurrence;
}

/** The most recent occurrence (today or earlier) of `timestamp`'s UTC month/day, anchored to `nowMs`'s year (or the prior year, if this year's date hasn't happened yet). */
function lastOccurrenceOnOrBefore(timestamp: number, nowMs: number): number {
  const source = new Date(timestamp);
  const now = new Date(nowMs);
  const occurrence = Date.UTC(now.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate());

  return occurrence > startOfUtcDay(nowMs) ? Date.UTC(now.getUTCFullYear() - 1, source.getUTCMonth(), source.getUTCDate()) : occurrence;
}

/** Cats whose birthday falls within the next 7 days, counting today as day 0 — never cats whose birthday already passed. */
export function getUpcomingBirthdays(cats: Cat[], now: number = Date.now()): UpcomingBirthday[] {
  return cats
    .map((cat) => {
      const occursAt = nextOccurrenceOnOrAfter(cat.dateOfBirth, now);
      return { catId: cat.id, occursAt, daysUntil: utcCalendarDaysBetween(now, occursAt) };
    })
    .filter((entry) => entry.daysUntil >= 0 && entry.daysUntil <= UPCOMING_BIRTHDAY_WINDOW_DAYS)
    .sort((a, b) => a.occursAt - b.occursAt);
}

/** Cats whose adoption anniversary ("gotcha day") occurred within the last 7 days, counting today as day 0. */
export function getRecentAdoptionAnniversaries(cats: Cat[], now: number = Date.now()): AdoptionAnniversary[] {
  return cats
    .filter((cat): cat is Cat & { adoptedAt: number } => cat.adoptedAt != null)
    .map((cat) => {
      const adoptedDate = new Date(cat.adoptedAt);
      const occursAt = lastOccurrenceOnOrBefore(cat.adoptedAt, now);
      const daysSince = utcCalendarDaysBetween(occursAt, now);
      const yearsSinceAdoption = new Date(occursAt).getUTCFullYear() - adoptedDate.getUTCFullYear();

      return { catId: cat.id, occursAt, daysSince, yearsSinceAdoption };
    })
    .filter((entry) => entry.daysSince >= 0 && entry.daysSince <= ADOPTION_ANNIVERSARY_WINDOW_DAYS && entry.yearsSinceAdoption > 0)
    .sort((a, b) => b.occursAt - a.occursAt);
}
