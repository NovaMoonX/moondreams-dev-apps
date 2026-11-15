import {
  formatDayRuns,
  getLocalToday,
  normalizeDays,
} from '@/utils/dayRunUtils';
import { MAX_PICKUP_DAYS } from '@apps/going-once/constants';
import type { Inquiry } from '@apps/going-once/types';

/** Pickup days as stored: whole days, once each, in order, at most `MAX_PICKUP_DAYS`. */
export const normalizePickupDays = (days: readonly number[]) =>
  normalizeDays(days, MAX_PICKUP_DAYS);

/** The pickup days that haven't passed on this device. */
export const getUpcomingDays = (days: readonly number[], now: number) => {
  const today = getLocalToday(now);
  return normalizeDays(days).filter((day) => day >= today);
};

/** What a buyer said about days, for a quiet line: "Can do Nov 29, Dec 15–17" or "Needs another day"; `null` when they weren't asked. */
export const describeBuyerDays = (
  inquiry: Pick<Inquiry, 'pickupDays' | 'needsAnotherDay'>,
): string | null => {
  if (inquiry.needsAnotherDay) return 'Needs another day';
  if (inquiry.pickupDays === null || inquiry.pickupDays.length === 0)
    return null;
  return `Can do ${formatDayRuns(inquiry.pickupDays)}`;
};

/** What a buyer said about the pickup days, kept for the rest of their visit. */
export interface DaysAnswer {
  days: number[];
  needsAnotherDay: boolean;
  note: string;
}

export const EMPTY_DAYS_ANSWER: DaysAnswer = {
  days: [],
  needsAnotherDay: false,
  note: '',
};

/** The answer counts once it names a day or says another day is needed. */
export const isDaysAnswered = (answer: DaysAnswer) =>
  answer.needsAnotherDay || answer.days.length > 0;
