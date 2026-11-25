import {
  BILL_FREQUENCY_LABELS,
  BILL_REPEAT_KINDS,
  SCHEDULE_LABELS,
} from './engineConstants';
import { getIntervalMonths } from './schedule';
import type { Schedule } from '@apps/runway/types';

/** How often a bill repeats every few months, from the months between its dates: "Every other month", "Every 3 months", "Yearly", "Every 2 years". */
export function describeEveryMonths(interval: number) {
  if (interval === 1) return BILL_FREQUENCY_LABELS.monthly;
  if (interval === 2) return 'Every other month';
  if (interval === 12) return BILL_FREQUENCY_LABELS.yearly;
  if (interval % 12 === 0) return `Every ${interval / 12} years`;
  return `Every ${interval} months`;
}

export function describeBillRepeat(schedule: Schedule) {
  const interval = getIntervalMonths(schedule);
  if (interval !== null) return describeEveryMonths(interval);
  const known = BILL_REPEAT_KINDS.find((kind) => kind === schedule.kind);
  const result = known
    ? BILL_FREQUENCY_LABELS[known]
    : SCHEDULE_LABELS[schedule.kind];
  return result;
}
