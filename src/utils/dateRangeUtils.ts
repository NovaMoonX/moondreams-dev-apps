import { toDateInputValue } from '@/utils/dateInputUtils';

/** Number of calendar days a `[rangeStart, rangeEnd]` timestamp range spans, inclusive. */
export function getDayCount(rangeStart: number, rangeEnd: number) {
  return Math.max(1, Math.floor((rangeEnd - rangeStart) / 86_400_000) + 1);
}

/** Zero-based day offset of `timestamp` from `rangeStart`, clamped to non-negative. */
export function getDayIndex(rangeStart: number, timestamp: number) {
  return Math.max(0, Math.floor((timestamp - rangeStart) / 86_400_000));
}

export function getDayLabel(rangeStart: number, dayIndex: number) {
  const date = new Date(rangeStart + dayIndex * 86_400_000);
  return `Day ${dayIndex + 1} · ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

export function getDayInputValue(rangeStart: number, dayIndex: number) {
  return toDateInputValue(rangeStart + dayIndex * 86_400_000);
}
