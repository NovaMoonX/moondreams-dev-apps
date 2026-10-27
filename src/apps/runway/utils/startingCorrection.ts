import type { DateOnly } from '@apps/runway/types';

export const STARTING_CORRECTION_DAYS = 14;
const DAY_MS = 86_400_000;

interface StartingCorrectionInput {
  startDate: DateOnly | null;
  /** When the first start record was made; null when none is in hand. */
  startCreatedAt: number | null;
  /** The days of income that have been confirmed. */
  confirmedDays: readonly DateOnly[];
  now: number;
}

/** Whether changing the starting amounts is still a correction: until the first income day from the start is confirmed, and for at most 14 days. Shown or hidden only; nothing is refused. */
export function canChangeStart({
  startDate,
  startCreatedAt,
  confirmedDays,
  now,
}: StartingCorrectionInput) {
  if (startDate === null || startCreatedAt === null) return true;
  const isConfirmed = confirmedDays.some((day) => day >= startDate);
  const isExpired = now > startCreatedAt + STARTING_CORRECTION_DAYS * DAY_MS;
  const result = !isConfirmed && !isExpired;
  return result;
}
