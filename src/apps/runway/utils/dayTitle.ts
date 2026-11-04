import { formatDateOrdinalUTC } from '@/utils/formatUtils';

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'UTC',
});

/** "Thu, Oct 29th", or "Thu, Nov 4th, 2027" outside this year: the day an income day's screen is about. */
export const formatDayTitle = (on: number) => {
  const result = `${weekdayFormatter.format(on)}, ${formatDateOrdinalUTC(on)}`;
  return result;
};
