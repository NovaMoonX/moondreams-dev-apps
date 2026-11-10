import type { ConnectionGrantWithId } from '@/lib/connections/useConnections';
import { zonedDateTimeToEpoch } from '@/utils/timezoneUtils';
import { readRestDay } from '@apps/helm/engine/restDay';
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
import { DAY_MS } from '@apps/helm/constants';
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

/** A live calendar whose latest read failed: an error newer than its last good read, or an error with no good read. */
export const isFailingCalendar = (grant: ConnectionGrantWithId) =>
  isLiveCalendar(grant) &&
  Object.entries(grant.categories).some(([id, category]) => {
    const state = grant.categoryState[id];
    return (
      category.isOn &&
      !!state?.lastError &&
      (state.lastOkAt === null || state.lastError.at > state.lastOkAt)
    );
  });

export const toPlannerTask = (task: OpenTask): PlannerTask => ({
  id: task.id,
  title: task.title,
  due: task.due,
  importance: task.importance,
  isUrgent: task.isUrgent,
  durationMinutes: task.durationMinutes,
  energy: task.energy,
});

// A stay or rental runs for days and says where the person is, not time it takes.
const SPAN_MS = 12 * 60 * 60 * 1000;

const getLiveGrantRecords = (sources: PlanSources) => {
  const { synced, grants } = sources;
  return getLiveRecords(synced, grants, false).filter(
    (record) =>
      grants.find((grant) => grant.id === record.grantId)?.status === 'live',
  );
};

/** A day's events that block time: calendar events not marked free and apps' events of half a day or less, an all-day one only when the person said it keeps them busy. */
export function getBusyEvents(
  sources: PlanSources,
  dayKey: string,
): SyncedRecord[] {
  const { profile, timeZone } = sources;
  const live = getLiveGrantRecords(sources);
  const { calendarEvents, appEvents } = getDayEvents(
    live,
    getDayNoon(dayKey, timeZone),
    timeZone,
  );
  return [...calendarEvents, ...appEvents].filter(
    (record) =>
      (isCalendarEvent(record)
        ? record.isBusy !== false
        : (record.endAt ?? 0) - (record.startAt ?? 0) <= SPAN_MS) &&
      (!record.isAllDay || profile.busyAllDayEventRefs.includes(record.id)),
  );
}

/** Whether the day follows a night out or a shift, read from the live calendar copies of the days around it; null once the person asked for a plan anyway. */
function getRestDay(sources: PlanSources, dayKey: string) {
  const { profile, timeZone, planDays } = sources;
  if ((planDays[dayKey]?.restDayOverriddenAt ?? null) !== null) return null;
  const noon = getDayNoon(dayKey, timeZone);
  return readRestDay({
    dayKey,
    timeZone,
    shiftCalendarIds: profile.shiftCalendarIds,
    events: getLiveGrantRecords(sources).filter(
      (record) =>
        isCalendarEvent(record) &&
        record.kind === 'event' &&
        record.startAt !== null &&
        Math.abs(record.startAt - noon) <= 2 * DAY_MS,
    ),
  });
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
    restDay: calendars.length > 0 ? getRestDay(sources, dayKey) : null,
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

/** A day's suggested slots that now sit on a busy event (a calendar copy that arrived after the plan), as `slotId:start` keys. */
export function findClashes(sources: PlanSources, dayKey: string): string[] {
  const { input } = buildPlanInput(sources, dayKey);
  return Object.entries(input.slots).flatMap(
    ([id, { status, startAt, endAt }]) =>
      status === 'suggested' &&
      startAt !== null &&
      endAt !== null &&
      input.busy.some((block) => block.startAt < endAt && block.endAt > startAt)
        ? [`${id}:${startAt}`]
        : [],
  );
}

/** A day's kept slots that sit on a busy block, as slot id to the block's title. */
export function findOverlaps(
  input: Pick<PlannerInput, 'slots' | 'busy'>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input.slots).flatMap(([id, { status, startAt, endAt }]) => {
      const block =
        status === 'kept' && startAt !== null && endAt !== null
          ? input.busy.find(
              (entry) => entry.startAt < endAt && entry.endAt > startAt,
            )
          : undefined;
      return block ? [[id, block.title]] : [];
    }),
  );
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
