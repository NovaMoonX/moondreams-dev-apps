import { DAY_MS } from '@apps/runway/engine/dates';
import type { DateOnly, Level, TrackingPeriod } from '@apps/runway/types';

/** The stretch tracking is on for now: the last period, while it has no end. */
export function getOpenPeriod(
  periods: readonly TrackingPeriod[],
): TrackingPeriod | null {
  const last = periods.at(-1) ?? null;
  const result = last !== null && last.to === null ? last : null;
  return result;
}

/** Plan with no open period, Link once the open period has a link day, Track otherwise; a plan with no periods is at Plan. */
export function getLevel(periods: readonly TrackingPeriod[]): Level {
  const open = getOpenPeriod(periods);
  if (open === null) return 'plan';
  const result: Level = (open.linkedFrom ?? null) === null ? 'track' : 'link';
  return result;
}

/** Whether purchases are tracked: Track and Link behave alike for everything built so far. */
export function isTrackingLevel(level: Level): boolean {
  const result = level === 'track' || level === 'link';
  return result;
}

/** The earliest day tracking can start again: the day after the last period ended, so two periods never share a day. */
export function getEarliestTrackingStart(
  periods: readonly TrackingPeriod[],
): DateOnly | null {
  const lastEnd = periods.at(-1)?.to ?? null;
  const result = lastEnd === null ? null : lastEnd + DAY_MS;
  return result;
}

/** Opens a period on `from`, or says why not (already tracking, or the day overlaps an earlier period). */
export function startTrackingPeriod(
  periods: readonly TrackingPeriod[],
  from: DateOnly,
): { periods: TrackingPeriod[] } | { error: string } {
  if (isTrackingLevel(getLevel(periods))) {
    return {
      error:
        'Tracking is already on, probably from another device. Reopen Settings to see where it stands.',
    };
  }
  const earliest = getEarliestTrackingStart(periods);
  if (earliest !== null && from < earliest) {
    return {
      error: 'Pick a day after the last time tracking stopped.',
    };
  }
  return { periods: [...periods, { from, to: null, linkedFrom: null }] };
}

/** Closes the open period on `to`, or says why not (not tracking, or a day before it began). */
export function stopTrackingPeriod(
  periods: readonly TrackingPeriod[],
  to: DateOnly,
): { periods: TrackingPeriod[] } | { error: string } {
  const open = getOpenPeriod(periods);
  if (open === null)
    return {
      error:
        'Tracking is already off, probably from another device. Reopen Settings to see where it stands.',
    };
  if (to < open.from) {
    return { error: 'Tracking cannot stop before the day it started.' };
  }
  return {
    periods: [
      ...periods.slice(0, -1),
      { from: open.from, to, linkedFrom: open.linkedFrom ?? null },
    ],
  };
}

/** Marks the open period as linked from `on`, or says why not (not tracking, or already linked). */
export function linkTrackingPeriod(
  periods: readonly TrackingPeriod[],
  on: DateOnly,
): { periods: TrackingPeriod[] } | { error: string } {
  const open = getOpenPeriod(periods);
  if (open === null) {
    return {
      error:
        'Tracking is off, probably from another device. Reopen Settings to see where it stands.',
    };
  }
  if ((open.linkedFrom ?? null) !== null) {
    return {
      error:
        'A bank is already linked, probably from another device. Reopen Settings to see where it stands.',
    };
  }
  return {
    periods: [
      ...periods.slice(0, -1),
      { from: open.from, to: null, linkedFrom: Math.max(on, open.from) },
    ],
  };
}
