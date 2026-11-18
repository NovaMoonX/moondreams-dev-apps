import { useAppSelector } from '@/store';
import { getDateTimeFormat } from '@/utils/timezoneUtils';
import type { OpenTask, SyncedRecord } from '@apps/helm/types';
import { readMeetingFormat } from '@apps/helm/utils/meetingWhere';
import {
  formatDayName,
  shiftDayKey,
  toDayKey,
} from '@apps/helm/utils/planDays';

const SHORT_DATE_FROM_DAYS = 7;

/** "today", "tomorrow", a weekday within the week or a short date, in the person's zone; null once the meeting has started. */
export function getMeetingDay(startAt: number, now: number, timeZone: string) {
  if (startAt <= now) return null;
  const todayKey = toDayKey(now, timeZone);
  const key = toDayKey(startAt, timeZone);
  if (key >= shiftDayKey(todayKey, SHORT_DATE_FROM_DAYS)) {
    return getDateTimeFormat({
      timeZone,
      month: 'short',
      day: 'numeric',
    }).format(new Date(startAt));
  }
  return formatDayName(key, todayKey);
}

/** A task's meeting as it stands now: the synced event's live start, title, format and place, or what the task stored when the event isn't among those read. */
export const resolveMeeting = (
  task: Pick<OpenTask, 'meeting' | 'meetingLabel'> | null,
  synced: SyncedRecord[],
) => {
  if (!task?.meeting) return null;
  const record = synced.find((entry) => entry.id === task.meeting?.syncedId);
  return {
    startAt: record?.startAt ?? task.meeting.startAt,
    label: record?.sealed.title || task.meetingLabel,
    format: readMeetingFormat(record?.sealed.extra.format),
    place: record?.sealed.placeLabel ?? null,
  };
};

export const useResolvedMeeting = (
  task: Pick<OpenTask, 'meeting' | 'meetingLabel'> | null,
) =>
  resolveMeeting(
    task,
    useAppSelector((state) => state.helm.synced.items),
  );

/** "Mon 10:00 AM" */
export const formatMeetingWhen = (startAt: number, timeZone: string) =>
  getDateTimeFormat({
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
    .format(new Date(startAt))
    .replace(',', '');
