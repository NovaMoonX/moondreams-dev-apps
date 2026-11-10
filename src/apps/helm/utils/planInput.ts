import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import {
  findOpenings,
  type BusyBlock,
  type PlannerInput,
  type PlannerTask,
} from '@apps/helm/engine/planner';
import type {
  HelmProfile,
  OpenTask,
  PlanCalendarEntry,
  PlanDay,
  PlanSlot,
  SyncedRecord,
} from '@apps/helm/types';
import { getDayNoon } from '@apps/helm/utils/planDays';
import {
  getDayEvents,
  getLiveRecords,
  getNewestOkAt,
  isCalendarEvent,
} from '@apps/helm/utils/synced';

const UNTIMED_EVENT_MS = 30 * 60_000;

export interface PlanSources {
  profile: HelmProfile;
  timeZone: string;
  now: number;
  todayKey: string;
  synced: SyncedRecord[];
  grants: ConnectionGrantWithId[];
  /** Open tasks that are awake. */
  tasks: OpenTask[];
  planDays: Record<string, PlanDay>;
}

export const isLiveCalendar = (grant: ConnectionGrantWithId) =>
  grant.connectorId === 'google:calendar' &&
  grant.status === 'live' &&
  Object.values(grant.categories).some((category) => category.isOn);

export const toPlannerTask = (task: OpenTask): PlannerTask => ({
  id: task.id,
  title: task.title,
  due: task.due,
  importance: task.importance,
  isUrgent: task.isUrgent,
  durationMinutes: task.durationMinutes,
  energy: task.energy,
});

/** A day's events that block time: calendar events not marked free and apps' events, an all-day one only when the person said it keeps them busy. */
export function getBusyEvents(
  sources: PlanSources,
  dayKey: string,
): SyncedRecord[] {
  const { synced, grants, profile, timeZone } = sources;
  const live = getLiveRecords(synced, grants, false).filter(
    (record) =>
      grants.find((grant) => grant.id === record.grantId)?.status === 'live',
  );
  const { calendarEvents, appEvents } = getDayEvents(
    live,
    getDayNoon(dayKey, timeZone),
    timeZone,
  );
  return [...calendarEvents, ...appEvents].filter(
    (record) =>
      (!isCalendarEvent(record) || record.isBusy !== false) &&
      (!record.isAllDay || profile.busyAllDayEventRefs.includes(record.id)),
  );
}

/** Everything the planner needs for one day, and what the day's plan seals beside its slots. */
export function buildPlanInput(
  sources: PlanSources,
  dayKey: string,
  slots: Record<string, PlanSlot> = sources.planDays[dayKey]?.slots ?? {},
) {
  const { profile, timeZone, now, todayKey, grants, tasks, planDays } = sources;
  const windowStart = zonedDateTimeToEpoch(
    dayKey,
    profile.dayStartTime,
    timeZone,
  );
  const windowEnd = zonedDateTimeToEpoch(dayKey, profile.dayEndTime, timeZone);
  const events = getBusyEvents(sources, dayKey);
  const busy: BusyBlock[] = events.map((record) =>
    record.isAllDay || record.startAt === null
      ? { startAt: windowStart, endAt: windowEnd, title: record.sealed.title }
      : {
          startAt: record.startAt,
          endAt: record.endAt ?? record.startAt + UNTIMED_EVENT_MS,
          title: record.sealed.title,
        },
  );
  const calendarSnapshot: PlanCalendarEntry[] = events.flatMap((record) =>
    record.startAt === null
      ? []
      : [
          {
            eventRef: record.id,
            title: record.sealed.title,
            startAt: record.startAt,
            endAt: record.endAt ?? record.startAt + UNTIMED_EVENT_MS,
            isAllDay: record.isAllDay,
          },
        ],
  );
  const taken = new Set([
    ...Object.values(slots)
      .filter((slot) => slot.status !== 'suggested')
      .map((slot) => slot.taskId),
    ...Object.entries(planDays)
      .filter(([key]) => key >= todayKey && key !== dayKey)
      .flatMap(([, day]) => Object.values(day.slots))
      .filter((slot) => slot.status === 'kept')
      .map((slot) => slot.taskId),
  ]);
  const calendars = grants.filter(isLiveCalendar);
  const input: PlannerInput = {
    dayKey,
    timeZone,
    now,
    dayStartTime: profile.dayStartTime,
    dayEndTime: profile.dayEndTime,
    fillPercent: profile.planFillPercent,
    hasCalendar: calendars.length > 0,
    busy,
    slots,
    tasks: tasks
      .filter((task) => !task.isUnreadable && !taken.has(task.id))
      .map(toPlannerTask),
  };
  return {
    input,
    calendarSnapshot,
    calendarReadAt: calendars.reduce<number | null>((newest, grant) => {
      const at = getNewestOkAt(grant);
      return at !== null && (newest === null || at > newest) ? at : newest;
    }, null),
  };
}

export interface Opening {
  startAt: number;
  endAt: number;
}

/** Where a task fits on a day, earliest first; the slot it already holds there doesn't count as taken. */
export function getOpenings(
  sources: PlanSources,
  dayKey: string,
  task: PlannerTask,
  ownSlotId: string | null,
  limit: number,
): Opening[] {
  const slots = Object.fromEntries(
    Object.entries(sources.planDays[dayKey]?.slots ?? {}).filter(
      ([id]) => id !== ownSlotId,
    ),
  );
  return findOpenings(
    buildPlanInput(sources, dayKey, slots).input,
    task,
    limit,
  );
}
