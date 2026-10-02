import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';

/** Number of calendar days a `[rangeStart, rangeEnd]` timestamp range spans, inclusive. */
export function getDayCount(rangeStart: number, rangeEnd: number) {
  return Math.max(1, Math.floor((rangeEnd - rangeStart) / 86_400_000) + 1);
}

/** Zero-based day offset of `timestamp` from `rangeStart`, clamped to non-negative. */
export function getDayIndex(rangeStart: number, timestamp: number) {
  return Math.max(0, Math.floor((timestamp - rangeStart) / 86_400_000));
}

/** Zero-based index of the viewer's current local calendar day against a UTC-midnight `rangeStart`.
 * Unlike `getDayIndex`, it isn't clamped and doesn't flip to tomorrow in the evening west of UTC. */
export function getLocalDayIndex(rangeStart: number, now: number) {
  const today = new Date(now);
  const todayAsUtcMidnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const result = Math.round((todayAsUtcMidnight - rangeStart) / 86_400_000);
  return result;
}

export function getIndexBucket(index: number | null, count: number): IndexBucket {
  if (index === null) return 'none';
  if (index < 0 || index >= count) return 'outside';
  return index;
}

export type IndexBucket = 'none' | 'outside' | number;

/** Groups items by which day of a `count`-day range they fall on: each day ascending, then anything
 * outside the range, then anything with no day at all. */
export function groupByIndexBucket<T>(
  items: T[],
  getIndex: (item: T) => number | null,
  count: number,
): { bucket: IndexBucket; items: T[] }[] {
  const byBucket = items.reduce<Map<IndexBucket, T[]>>((groups, item) => {
    const bucket = getIndexBucket(getIndex(item), count);
    groups.set(bucket, [...(groups.get(bucket) ?? []), item]);
    return groups;
  }, new Map());
  const days = Array.from(byBucket.keys())
    .filter((bucket): bucket is number => typeof bucket === 'number')
    .sort((a, b) => a - b);
  const result = [...days, 'outside' as const, 'none' as const]
    .filter((bucket) => byBucket.has(bucket))
    .map((bucket) => ({ bucket, items: byBucket.get(bucket) ?? [] }));
  return result;
}

/** `rangeStart` is always a UTC-midnight-anchored value (from `fromDateInputValue`), so the
 * label is read from UTC fields — local fields would shift it a day off for viewers behind UTC. */
export function getDayLabel(rangeStart: number, dayIndex: number) {
  const date = new Date(rangeStart + dayIndex * 86_400_000);
  return `Day ${dayIndex + 1} · ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })}`;
}

/** Just the calendar date ("Oct 3") of a day offset — for days outside a range, where "Day N" reads badly. */
export function getDayDateLabel(rangeStart: number, dayIndex: number) {
  const result = new Date(rangeStart + dayIndex * 86_400_000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return result;
}

export function getDayInputValue(rangeStart: number, dayIndex: number) {
  return toDateInputValue(rangeStart + dayIndex * 86_400_000);
}

/** Moving a range's start carries an already-chosen end along by the same number of days, so the
 * range length survives; moving the end alone only changes the length. Values are date-input strings. */
export function shiftDateRangeStart(
  range: { startDate: string; endDate: string },
  nextStartDate: string,
) {
  const previousStart = fromDateInputValue(range.startDate);
  const nextStart = fromDateInputValue(nextStartDate);
  const end = fromDateInputValue(range.endDate);
  if (previousStart === undefined || nextStart === undefined || end === undefined) {
    return { ...range, startDate: nextStartDate };
  }

  const result = {
    startDate: nextStartDate,
    endDate: toDateInputValue(end + (nextStart - previousStart)),
  };
  return result;
}

export function getBucketLabel(bucket: IndexBucket, rangeStart: number) {
  if (bucket === 'none') return 'No specific day';
  if (bucket === 'outside') return 'Outside trip dates';
  return getDayLabel(rangeStart, bucket);
}

/** One option per day of the range, plus the `current` day when it sits outside the range so a
 * select showing a stored out-of-range value doesn't go blank. */
export function getDayOptions(rangeStart: number, rangeEnd: number, current: number | null = null) {
  const count = getDayCount(rangeStart, rangeEnd);
  const days = Array.from({ length: count }, (_, index) => ({
    value: String(index),
    label: getDayLabel(rangeStart, index),
  }));
  const isOutside = current !== null && (current < 0 || current >= count);
  const outside = isOutside
    ? [{ value: String(current), label: `${getDayDateLabel(rangeStart, current)} (outside trip dates)` }]
    : [];
  return [...days, ...outside];
}
