import {
  DEFAULT_RUNTIME_MINUTES,
  PREVIEWS_BUFFER_MINUTES,
} from '@apps/a-list/constants';
import type { ViewingStatus } from '@apps/a-list/types';

const MINUTE_MS = 60_000;

export function computeEndsAt(
  showtimeAt: number,
  runtimeMinutes: number | null,
): number {
  const minutes =
    PREVIEWS_BUFFER_MINUTES + (runtimeMinutes ?? DEFAULT_RUNTIME_MINUTES);
  const result = showtimeAt + minutes * MINUTE_MS;
  return result;
}

/** A showing that has already ended is saved as seen; one still running or ahead is planned. */
export function getInitialStatus(endsAt: number, now: number): ViewingStatus {
  return endsAt <= now ? 'SEEN' : 'PLANNED';
}
