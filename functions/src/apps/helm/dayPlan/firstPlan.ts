import type { DocumentData } from 'firebase-admin/firestore';

import type { ConnectionGrant } from '../../../vendor/connectionsContract.js';
import { createOptionMatcher } from '../../../vendor/optionMatchUtils.js';
import { dayKeyToMs } from '../../../vendor/cadenceUtils.js';
import { getLocalDay } from '../syncedCopies.js';
import type { SlotRecord } from './dayJob.js';
import { toPlannerTask } from './planRead.js';
import type {
  BusyBlock,
  FinishedTask,
  PlannerInput,
  PlannerTask,
} from './planner.js';
import { readRestDay } from './restDay.js';
import type { PatternBucket } from './plannerTypes.js';

const DAY_MS = 86_400_000;
const UNTIMED_EVENT = 30 * 60_000;
const SPAN_MAX = 12 * 60 * 60_000;
const SAME_THING_WINDOW = 15 * 60_000;
export const OPEN_TASKS_LIMIT = 150;

export interface GrantEntry {
  id: string;
  grant: ConnectionGrant;
}

export const isLiveCalendar = (grant: ConnectionGrant) =>
  grant.connectorId === 'google:calendar' &&
  grant.status === 'live' &&
  Object.values(grant.categories).some((category) => category.isOn);

const isFailingCalendar = (grant: ConnectionGrant) =>
  isLiveCalendar(grant) &&
  Object.entries(grant.categories).some(([id, category]) => {
    const state = grant.categoryState[id];
    return (
      category.isOn &&
      !!state?.lastError &&
      (state.lastOkAt === null || state.lastError.at > state.lastOkAt)
    );
  });

/** Whether planning waits: a calendar that can't be read would be planned around as if it were empty. */
export const isCalendarHeld = (grants: ConnectionGrant[]) =>
  grants.some(
    (grant) =>
      isFailingCalendar(grant) ||
      (grant.connectorId === 'google:calendar' &&
        grant.status === 'needsReconnect'),
  );

const newestOkAt = (grant: ConnectionGrant) =>
  Object.values(grant.categoryState).reduce<number | null>(
    (newest, state) =>
      state.lastOkAt !== null && (newest === null || state.lastOkAt > newest)
        ? state.lastOkAt
        : newest,
    null,
  );

export type AvoidBucket = Extract<PatternBucket, { kind: 'weekdayPart' }>;

export interface PatternRow {
  state: string;
  effect: unknown;
  createdAt: number;
}

/** The day-parts the planner leaves empty: accepted `plannerAvoid` patterns, only while learning is on, none made before the last Forget. */
export const readAvoidBuckets = (
  patterns: PatternRow[],
  input: { isLearningOn: boolean; forgottenAt: number | null },
): AvoidBucket[] =>
  (input.isLearningOn ? patterns : []).flatMap((pattern) => {
    const effect = pattern.effect as {
      kind?: unknown;
      bucket?: { kind?: unknown };
    } | null;
    return (input.forgottenAt === null ||
      pattern.createdAt > input.forgottenAt) &&
      pattern.state === 'accepted' &&
      effect?.kind === 'plannerAvoid' &&
      effect.bucket?.kind === 'weekdayPart'
      ? [effect.bucket as AvoidBucket]
      : [];
  });

export interface TaskRow {
  id: string;
  data: DocumentData;
  isCare: boolean;
  isUnreadable: boolean;
}

const toIds = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : [];

/** The tasks that are awake: a not-until day still ahead, or a task or person it waits on that is still open (any waited task, once the open list is capped), puts one to sleep. */
export function filterAwake(rows: TaskRow[], today: number): TaskRow[] {
  const openIds = new Set(rows.map((row) => row.id));
  const isCapped = rows.length >= OPEN_TASKS_LIMIT;
  return rows.filter(({ id, data }) => {
    const notUntil = typeof data.notUntil === 'number' ? data.notUntil : null;
    if (notUntil !== null && notUntil > today) return false;
    const onTasks = toIds(data.waitsOnTaskIds).filter(
      (waited) => waited !== id && (isCapped || openIds.has(waited)),
    );
    return onTasks.length === 0 && typeof data.waitsOnWhoId !== 'string';
  });
}

export interface PlanEvent {
  id: string;
  grantId: string;
  connectorId: string;
  category: string;
  startAt: number | null;
  endAt: number | null;
  isAllDay: boolean;
  isBusy: boolean | null;
  calendarKey: string | null;
  title: string;
  sameEventKey: string | null;
}

const titles = createOptionMatcher();

const isNear = (first: PlanEvent, second: PlanEvent) =>
  first.startAt !== null &&
  second.startAt !== null &&
  Math.abs(first.startAt - second.startAt) <= SAME_THING_WINDOW;

const isSameKey = (first: PlanEvent, second: PlanEvent) =>
  first.sameEventKey !== null && first.sameEventKey === second.sameEventKey;

const isSameThing = (first: PlanEvent, second: PlanEvent) => {
  if (first.isAllDay !== second.isAllDay || !isNear(first, second))
    return false;
  if (isSameKey(first, second)) return true;
  return (
    first.grantId !== second.grantId &&
    titles.match(first.title, [second.title]) !== null
  );
};

const isCalendar = (event: PlanEvent) =>
  event.connectorId === 'google:calendar';

/** One event on two accounts, or on a calendar and in an app, is one thing: the calendar's copy stands, the others beside it. */
const mergeSameThings = (events: PlanEvent[]) =>
  events
    .reduce<PlanEvent[][]>((groups, event) => {
      const group = groups.find(
        (copies) =>
          isSameThing(copies[0], event) &&
          copies.every(
            (copy) => copy.grantId !== event.grantId || isSameKey(copy, event),
          ),
      );
      if (group) group.push(event);
      else groups.push([event]);
      return groups;
    }, [])
    .map((copies) => {
      const record = copies.find(isCalendar) ?? copies[0];
      return { record, alsoIn: copies.filter((copy) => copy !== record) };
    });

/** The copies whose connection still shares them: the grant live and the category on. */
const readLive = (events: PlanEvent[], grants: GrantEntry[]) =>
  events.filter((event) => {
    const grant = grants.find((entry) => entry.id === event.grantId)?.grant;
    return (
      grant?.status === 'live' &&
      grant.categories[event.category]?.isOn === true
    );
  });

/** A timed event on its first or last day in the person's zone, an all-day one by its UTC dates. */
const isEventToday = (event: PlanEvent, day: number, timeZone: string) => {
  if (event.startAt === null) return false;
  if (!event.isAllDay) {
    const lastAt = Math.max(event.startAt, (event.endAt ?? 0) - 1);
    return (
      getLocalDay(event.startAt, timeZone) === day ||
      getLocalDay(lastAt, timeZone) === day
    );
  }
  return event.startAt <= day && day < (event.endAt ?? event.startAt) + DAY_MS;
};

/** The day's events that block time: calendar events not marked free and apps' events of half a day or less, an all-day one only when the person said it keeps them busy; one event's copies block across the busy copies' times. */
export function readBusyEvents(
  live: PlanEvent[],
  input: { day: number; timeZone: string; busyAllDayEventRefs: string[] },
) {
  const isBusyCopy = (event: PlanEvent) =>
    (isCalendar(event)
      ? event.isBusy !== false
      : (event.endAt ?? 0) - (event.startAt ?? 0) <= SPAN_MAX) &&
    (!event.isAllDay || input.busyAllDayEventRefs.includes(event.id));
  return mergeSameThings(
    live
      .filter((event) => isEventToday(event, input.day, input.timeZone))
      .sort(
        (first, second) =>
          Number(second.isAllDay) - Number(first.isAllDay) ||
          (first.startAt ?? 0) - (second.startAt ?? 0),
      ),
  ).flatMap(({ record, alsoIn }) => {
    const busy = [record, ...alsoIn].filter(isBusyCopy);
    if (busy.length === 0) return [];
    return [
      {
        ...record,
        startAt: Math.min(...busy.map((copy) => copy.startAt ?? 0)),
        endAt: Math.max(...busy.map((copy) => copy.endAt ?? copy.startAt ?? 0)),
      },
    ];
  });
}

export interface FirstPlanSources {
  dayKey: string;
  timeZone: string;
  now: number;
  dayStartAt: number;
  dayEndAt: number;
  dayStartTime: string;
  dayEndTime: string;
  fillPercent: number;
  shiftCalendarIds: string[];
  busyAllDayEventRefs: string[];
  grants: GrantEntry[];
  events: PlanEvent[];
  tasks: TaskRow[];
  projectPlaces: Record<string, number>;
  avoidBuckets: AvoidBucket[];
  aimTaskIds: string[];
  finishedTasks: FinishedTask[];
  /** Task ids on kept slots of the days after this one. */
  laterKeptTaskIds: string[];
  restDayOverriddenAt: number | null;
}

/** Everything the planner reads for the day's first plan, and what the plan seals beside its slots; the same as the device builds. The place the person is at is not read: before they open the app it is stale. */
export function buildFirstPlan(
  sources: FirstPlanSources,
  slots: Record<string, SlotRecord>,
) {
  const day = dayKeyToMs(sources.dayKey);
  const live = readLive(sources.events, sources.grants);
  const busyEvents = readBusyEvents(live, {
    day,
    timeZone: sources.timeZone,
    busyAllDayEventRefs: sources.busyAllDayEventRefs,
  });
  const busy: BusyBlock[] = busyEvents.map((event) =>
    event.isAllDay || event.startAt === null
      ? {
          startAt: sources.dayStartAt,
          endAt: sources.dayEndAt,
          title: event.title,
        }
      : {
          startAt: event.startAt,
          endAt: event.endAt ?? event.startAt + UNTIMED_EVENT,
          title: event.title,
        },
  );
  const calendarSnapshot = busyEvents.flatMap((event) =>
    event.startAt === null
      ? []
      : [
          {
            eventRef: event.id,
            title: event.title,
            startAt: event.startAt,
            endAt: event.endAt ?? event.startAt + UNTIMED_EVENT,
            isAllDay: event.isAllDay,
          },
        ],
  );
  const taken = new Set([
    ...Object.values(slots)
      .filter((slot) => slot.status !== 'suggested')
      .map((slot) => slot.taskId),
    ...sources.laterKeptTaskIds,
  ]);
  const calendars = sources.grants.filter((entry) =>
    isLiveCalendar(entry.grant),
  );
  const noon = day + 12 * 60 * 60_000;
  const restDay =
    calendars.length > 0 && sources.restDayOverriddenAt === null
      ? readRestDay({
          dayKey: sources.dayKey,
          timeZone: sources.timeZone,
          shiftCalendarIds: sources.shiftCalendarIds,
          events: live.filter(
            (event) =>
              isCalendar(event) &&
              event.startAt !== null &&
              Math.abs(event.startAt - noon) <= 2 * DAY_MS,
          ),
        })
      : null;
  const input: PlannerInput = {
    dayKey: sources.dayKey,
    timeZone: sources.timeZone,
    now: sources.now,
    dayStartTime: sources.dayStartTime,
    dayEndTime: sources.dayEndTime,
    fillPercent: sources.fillPercent,
    hasCalendar: calendars.length > 0,
    restDay,
    currentPlaceId: null,
    busy,
    slots,
    avoidBuckets: sources.avoidBuckets,
    aimTaskIds: sources.aimTaskIds,
    finishedTasks: sources.finishedTasks,
    tasks: sources.tasks
      .filter((row) => !row.isUnreadable && !taken.has(row.id))
      .map((row): PlannerTask =>
        toPlannerTask(row.id, row.data, {
          isCare: row.isCare,
          projectPlace:
            typeof row.data.projectId === 'string'
              ? (sources.projectPlaces[row.data.projectId] ?? null)
              : null,
        }),
      ),
  };
  return {
    input,
    calendarSnapshot,
    calendarReadAt: calendars.reduce<number | null>((newest, entry) => {
      const at = newestOkAt(entry.grant);
      return at !== null && (newest === null || at > newest) ? at : newest;
    }, null),
  };
}
