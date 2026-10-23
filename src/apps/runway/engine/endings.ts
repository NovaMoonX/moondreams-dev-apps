import type { Ending, Schedule } from '@apps/runway/types';

import { occurrences } from './schedule';

/** An ending that also stops after the day its item was ended, so nothing is planned for a date past it. */
export function capEnding(ending: Ending, endedAt: number | null): Ending {
  if (endedAt === null) return ending;
  const result: Ending = {
    ...ending,
    onDate: ending.onDate === null ? endedAt : Math.min(ending.onDate, endedAt),
  };
  return result;
}

/**
 * The last income day of a pay line whose ending has been reached: every occurrence it will ever have
 * is behind `today`, or it is `today` and has been confirmed. Null while it still has days to come,
 * or never ends.
 */
export function findReachedEnding(
  schedule: Schedule,
  ending: Ending,
  today: number,
  isConfirmed: (on: number) => boolean,
): number | null {
  if (schedule.anchor === null) return null;
  const isOnce = schedule.kind === 'once';
  if (!isOnce && ending.onDate === null && ending.afterCount === null)
    return null;
  const dates = occurrences(schedule, ending, schedule.anchor, today);
  const last = dates[dates.length - 1];
  if (last === undefined) return null;
  const isDone =
    isOnce ||
    (ending.afterCount !== null && dates.length >= ending.afterCount) ||
    (ending.onDate !== null && ending.onDate <= today);
  if (!isDone) return null;
  const result =
    last < today || (last === today && isConfirmed(last)) ? last : null;
  return result;
}
