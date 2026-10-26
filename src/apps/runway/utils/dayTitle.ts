import { getDayDateLabel } from '@/utils/dateRangeUtils';

/** "Thu, Oct 29": the day an income day's screen is about. */
export const formatDayTitle = (on: number) => getDayDateLabel(on, 0);
