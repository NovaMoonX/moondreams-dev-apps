import { toDateInputValue } from '@/utils/dateInputUtils';

export function getTripDayCount(startDate: number, endDate: number) {
  return Math.max(1, Math.floor((endDate - startDate) / 86_400_000) + 1);
}

export function getDayIndex(startDate: number, timestamp: number) {
  return Math.max(0, Math.floor((timestamp - startDate) / 86_400_000));
}

export function getDayLabel(startDate: number, dayIndex: number) {
  const date = new Date(startDate + dayIndex * 86_400_000);
  return `Day ${dayIndex + 1} · ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

export function getDayInputValue(startDate: number, dayIndex: number) {
  return toDateInputValue(startDate + dayIndex * 86_400_000);
}

export function formatEventTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
