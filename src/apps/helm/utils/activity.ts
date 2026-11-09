import { HELM_COPY } from '@apps/helm/constants';
import type { OpenExecution } from '@apps/helm/types';
import { formatDate } from '@/utils/formatUtils';

export interface ActivityDay {
  dayStart: number;
  items: OpenExecution[];
}

export const toDayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
};

/** Newest-first executions under their local days, in the order given. */
export const groupByDay = (items: OpenExecution[]): ActivityDay[] =>
  items.reduce<ActivityDay[]>((days, item) => {
    const dayStart = toDayStart(item.createdAt);
    const last = days[days.length - 1];
    return last?.dayStart === dayStart
      ? [...days.slice(0, -1), { dayStart, items: [...last.items, item] }]
      : [...days, { dayStart, items: [item] }];
  }, []);

export function formatDayHeading(dayStart: number, now: number) {
  const today = toDayStart(now);
  if (dayStart === today) return HELM_COPY.activityToday;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return dayStart === yesterday.getTime()
    ? HELM_COPY.activityYesterday
    : formatDate(dayStart);
}

const withoutPeriod = (text: string) => text.replace(/[.!]+$/, '');

/** One line for a row: what was done, as the summary the execution sealed. */
export function getActivityLine(execution: OpenExecution) {
  if (execution.isUnreadable) return HELM_COPY.unreadable;
  if (!execution.summary) return HELM_COPY.activityMadeChange;
  return execution.category === 'undo'
    ? HELM_COPY.youTookBack(withoutPeriod(execution.summary))
    : withoutPeriod(execution.summary);
}
