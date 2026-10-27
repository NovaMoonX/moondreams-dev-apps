import type { DayOverrideSealed, OpenDay } from '@apps/runway/types';

import type { ComingDay } from './comingDays';
import { DAY_MS } from './dates';

/** The span a date with no neighbours reaches across, half a month each way. */
const LONE_GAP = 31 * DAY_MS;

/**
 * Where each date of `old` that `next` no longer holds moved to: the nearest date of `next` within half
 * the gap to its neighbours (half a month each way for a lone date), that is not itself one of `old`,
 * each taken once, nearest pairs first. A date far from every new one moved nowhere.
 */
export function matchMovedDates(
  old: readonly number[],
  next: readonly number[],
): Map<number, number> {
  const sorted = [...new Set(next)].sort((a, b) => a - b);
  const kept = new Set(sorted);
  const before = new Set(old);
  const gone = [...before].filter((date) => !kept.has(date));
  const pairs = sorted.flatMap((date, index) => {
    if (before.has(date)) return [];
    const gapBefore =
      sorted.length < 2
        ? LONE_GAP
        : index > 0
          ? date - sorted[index - 1]
          : sorted[1] - sorted[0];
    const gapAfter =
      sorted.length < 2
        ? LONE_GAP
        : index < sorted.length - 1
          ? sorted[index + 1] - date
          : date - sorted[index - 1];
    return gone
      .filter(
        (from) => from > date - gapBefore / 2 && from <= date + gapAfter / 2,
      )
      .map((from) => ({ from, to: date, distance: Math.abs(from - date) }));
  });
  const result = [...pairs]
    .sort((a, b) => a.distance - b.distance || a.from - b.from)
    .reduce<{ moved: Map<number, number>; taken: Set<number> }>(
      (acc, pair) => {
        if (acc.moved.has(pair.from) || acc.taken.has(pair.to)) return acc;
        acc.moved.set(pair.from, pair.to);
        acc.taken.add(pair.to);
        return acc;
      },
      { moved: new Map(), taken: new Set() },
    ).moved;
  return result;
}

export const hasOwnChoices = (override: DayOverrideSealed) =>
  override.pairings !== null ||
  Object.keys(override.holdResolutions).length > 0 ||
  Object.keys(override.payloads).length > 0;

export interface OverrideCarry {
  /** Days whose own choices move to the date their pay line now falls on. */
  carried: { from: OpenDay; to: ComingDay }[];
  /** Days whose own choices have no new date to go to. */
  stranded: OpenDay[];
}

/**
 * What a change to pay lines' schedules does to the income days the person changed for themselves: a
 * day's own choices follow it to its new date, and a day with no new date near it is listed, never
 * dropped without a word. `before` and `after` are the coming days without and with the change.
 */
export function planOverrideCarry(
  openDays: readonly OpenDay[],
  before: readonly ComingDay[],
  after: readonly ComingDay[],
): OverrideCarry {
  const afterKeys = new Set(after.map((day) => day.dayKey));
  const beforeKeys = new Set(before.map((day) => day.dayKey));
  const owned = new Set(
    openDays.filter((day) => hasOwnChoices(day.override)).map((day) => day.id),
  );
  const lost = openDays.filter(
    (day) =>
      day.status === 'draft' &&
      hasOwnChoices(day.override) &&
      beforeKeys.has(day.id) &&
      !afterKeys.has(day.id),
  );
  const datesOf = (days: readonly ComingDay[], payLineId: string) =>
    days.filter((day) => day.payLineId === payLineId).map((day) => day.on);
  const moves = [...new Set(lost.map((day) => day.payLineId))].map(
    (payLineId) => ({
      payLineId,
      moved: matchMovedDates(
        datesOf(before, payLineId),
        datesOf(after, payLineId),
      ),
    }),
  );
  const targetOf = (day: OpenDay) => {
    const to = moves
      .find((entry) => entry.payLineId === day.payLineId)
      ?.moved.get(day.expectedOn);
    const found = after.find(
      (coming) => coming.payLineId === day.payLineId && coming.on === to,
    );
    return found && !owned.has(found.dayKey) ? found : null;
  };
  const result = lost.reduce<OverrideCarry>(
    (acc, day) => {
      const to = targetOf(day);
      return to
        ? { ...acc, carried: [...acc.carried, { from: day, to }] }
        : { ...acc, stranded: [...acc.stranded, day] };
    },
    { carried: [], stranded: [] },
  );
  return result;
}
