import type { Cat } from '../types';

export interface UpcomingBirthday {
  catId: string;
  /** This year's (or next year's, if this year's has passed) occurrence of the cat's birthday. */
  occursAt: number;
}

export interface AdoptionAnniversary {
  catId: string;
  /** This year's occurrence of the adoption date. */
  occursAt: number;
  yearsSinceAdoption: number;
}

const DAY_MS = 86_400_000;
const UPCOMING_BIRTHDAY_WINDOW_MS = 7 * DAY_MS;
const ADOPTION_ANNIVERSARY_WINDOW_MS = 7 * DAY_MS;

function nextOccurrenceThisYear(timestamp: number, now: Date): Date {
  const source = new Date(timestamp);
  const occurrence = new Date(now.getFullYear(), source.getMonth(), source.getDate());

  if (occurrence.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    occurrence.setFullYear(occurrence.getFullYear() + 1);
  }

  return occurrence;
}

/** Cats whose birthday falls within the next 7 days. */
export function getUpcomingBirthdays(cats: Cat[], now: number = Date.now()): UpcomingBirthday[] {
  const nowDate = new Date(now);

  return cats
    .map((cat) => ({ catId: cat.id, occursAt: nextOccurrenceThisYear(cat.dateOfBirth, nowDate).getTime() }))
    .filter((entry) => entry.occursAt - now <= UPCOMING_BIRTHDAY_WINDOW_MS)
    .sort((a, b) => a.occursAt - b.occursAt);
}

/** Cats whose adoption anniversary ("gotcha day") occurred within the last 7 days (including today). */
export function getRecentAdoptionAnniversaries(cats: Cat[], now: number = Date.now()): AdoptionAnniversary[] {
  const nowDate = new Date(now);

  return cats
    .filter((cat): cat is Cat & { adoptedAt: number } => cat.adoptedAt != null)
    .map((cat) => {
      const adoptedDate = new Date(cat.adoptedAt);
      const occurrence = new Date(nowDate.getFullYear(), adoptedDate.getMonth(), adoptedDate.getDate());

      if (occurrence.getTime() > now) {
        occurrence.setFullYear(occurrence.getFullYear() - 1);
      }

      return {
        catId: cat.id,
        occursAt: occurrence.getTime(),
        yearsSinceAdoption: occurrence.getFullYear() - adoptedDate.getFullYear(),
      };
    })
    .filter((entry) => now - entry.occursAt <= ADOPTION_ANNIVERSARY_WINDOW_MS && entry.yearsSinceAdoption > 0)
    .sort((a, b) => b.occursAt - a.occursAt);
}
