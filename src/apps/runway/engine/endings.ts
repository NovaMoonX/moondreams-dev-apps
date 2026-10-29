import type { DateOnly, Ending, Schedule } from '@apps/runway/types';

import { DAY_MS } from './dates';

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

/** What happens to the money an item holds when it stops: Free to Spend, or kept by the item until the person releases it. */
export type HeldChoice = 'free' | 'keep';

/** The day an item that stops on `stopsOn` (archived that day, or the day after its last day) releases what it holds, or null when the person kept it. */
export function getHeldReleaseDay(
  choice: HeldChoice,
  stopsOn: DateOnly,
): DateOnly | null {
  const result = choice === 'free' ? stopsOn : null;
  return result;
}

/** The day a kept item releases what it holds when the person asks later: today, or the day after its last day when that is still ahead. */
export function getLaterReleaseDay(
  header: { endedAt: DateOnly | null; archivedAt: number | null },
  today: DateOnly,
): DateOnly {
  const result =
    header.archivedAt === null && header.endedAt !== null
      ? Math.max(today, header.endedAt + DAY_MS)
      : today;
  return result;
}

/**
 * The release day a stored header stands for. A header written before the choice existed has no
 * `heldReleasedOn` key and reads as round 7 shipped it: released from the archive day, or the day
 * after its last day, whichever comes first. A key that is there is the person's choice.
 */
export function readHeldReleasedOn(header: {
  archivedAt?: number | null;
  endedAt?: DateOnly | null;
  heldReleasedOn?: DateOnly | null;
}): DateOnly | null {
  if (Object.hasOwn(header, 'heldReleasedOn')) {
    return header.heldReleasedOn ?? null;
  }
  const ends = [
    ...(header.archivedAt == null ? [] : [header.archivedAt]),
    ...(header.endedAt == null ? [] : [header.endedAt + DAY_MS]),
  ];
  const result = ends.length === 0 ? null : Math.min(...ends);
  return result;
}
