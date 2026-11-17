import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { dayKeyToMs, shiftDayKeyBy } from '../../../vendor/cadenceUtils.js';
import {
  planDay,
  type BusyBlock,
  type FinishedTask,
  type PlannerTask,
} from './planner.js';
import type { PlanSlot } from './plannerTypes.js';

const MINUTE = 60_000;
export const SLICE = 15 * MINUTE;
export const WIND_DOWN_LEAD = 120 * MINUTE;
export const MAX_DAY_AIMS = 12;
const BUFFER = 15 * MINUTE;
const ROLLOVER_LOOKBACK_DAYS = 7;

export interface DayClock {
  dayKey: string;
  startAt: number;
  endAt: number;
  windDownAt: number;
  nextStartAt: number;
}

export const toDayKeyIn = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

/** The person's day around an instant: its key in their zone, when it starts and ends, when the wind-down opens and when the next day starts. */
export function readDayClock(
  now: number,
  profile: { timeZone: string; dayStartTime: string; dayEndTime: string },
): DayClock {
  const dayKey = toDayKeyIn(now, profile.timeZone);
  const startAt = zonedDateTimeToEpoch(
    dayKey,
    profile.dayStartTime,
    profile.timeZone,
  );
  const endAt = zonedDateTimeToEpoch(
    dayKey,
    profile.dayEndTime,
    profile.timeZone,
  );
  return {
    dayKey,
    startAt,
    endAt,
    windDownAt: Math.max(startAt, endAt - WIND_DOWN_LEAD),
    nextStartAt: zonedDateTimeToEpoch(
      shiftDayKeyBy(dayKey, 1),
      profile.dayStartTime,
      profile.timeZone,
    ),
  };
}

export interface Aim {
  aimId: string;
  taskId: string;
  order: number;
  lengthIsGuess: boolean;
  broughtFrom: string | null;
}

export interface WindDownEntry {
  result: 'done' | 'tonight' | 'wontHappen';
  choice: 'tomorrow' | 'later' | 'dropped' | null;
  reason: string | null;
  saidSpanId: string | null;
}

/** The only parts of a day's sealed aims the job reads: each aim's task, order and wind-down result. */
export interface AimsView {
  aims: Aim[];
  windDown: Record<string, WindDownEntry>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const RESULTS = ['done', 'tonight', 'wontHappen'] as const;
const CHOICES = ['tomorrow', 'later', 'dropped'] as const;

export const readAimsView = (raw: unknown): AimsView => {
  const opened = isRecord(raw) ? raw : {};
  const aims = Array.isArray(opened.aims) ? opened.aims : [];
  const windDown = isRecord(opened.windDown) ? opened.windDown : {};
  return {
    aims: aims
      .flatMap((entry): Aim[] =>
        isRecord(entry) &&
        typeof entry.aimId === 'string' &&
        typeof entry.taskId === 'string'
          ? [
              {
                aimId: entry.aimId,
                taskId: entry.taskId,
                order: typeof entry.order === 'number' ? entry.order : 0,
                lengthIsGuess: entry.lengthIsGuess === true,
                broughtFrom:
                  typeof entry.broughtFrom === 'string'
                    ? entry.broughtFrom
                    : null,
              },
            ]
          : [],
      )
      .sort((first, second) => first.order - second.order),
    windDown: Object.fromEntries(
      Object.entries(windDown).flatMap(([aimId, entry]) => {
        if (!isRecord(entry)) return [];
        const result = RESULTS.find((known) => known === entry.result);
        if (!result) return [];
        return [
          [
            aimId,
            {
              result,
              choice: CHOICES.find((known) => known === entry.choice) ?? null,
              reason: typeof entry.reason === 'string' ? entry.reason : null,
              saidSpanId:
                typeof entry.saidSpanId === 'string' ? entry.saidSpanId : null,
            },
          ],
        ];
      }),
    ),
  };
};

/** Whether the rollover looks at a past day at all: one that is recent and was never rolled. */
export const isRollable = (
  past: { dayKey: string; rolledAt: number | null },
  todayKey: string,
) =>
  past.rolledAt === null &&
  past.dayKey < todayKey &&
  dayKeyToMs(todayKey) - dayKeyToMs(past.dayKey) <=
    ROLLOVER_LOOKBACK_DAYS * 86_400_000;

/** The aims of a past day that carry into today: the task is still open and the person did not send it to Later or drop it. A task already among today's aims is never added twice. */
export function planRollover(input: {
  fromDayKey: string;
  from: AimsView;
  taskStatus: ReadonlyMap<string, 'open' | 'done'>;
  today: AimsView;
  newAimId: () => string;
}): { aims: Aim[]; added: number } {
  const have = new Set(input.today.aims.map((aim) => aim.taskId));
  const carried = input.from.aims.filter((aim) => {
    const entry = input.from.windDown[aim.aimId];
    return (
      input.taskStatus.get(aim.taskId) === 'open' &&
      !have.has(aim.taskId) &&
      entry?.choice !== 'later' &&
      entry?.choice !== 'dropped' &&
      entry?.result !== 'done'
    );
  });
  const room = Math.max(0, MAX_DAY_AIMS - input.today.aims.length);
  const first = input.today.aims.reduce(
    (max, aim) => Math.max(max, aim.order + 1),
    0,
  );
  const added = carried.slice(0, room).map((aim, at): Aim => ({
    aimId: input.newAimId(),
    taskId: aim.taskId,
    order: first + at,
    lengthIsGuess: aim.lengthIsGuess,
    broughtFrom: input.fromDayKey,
  }));
  return { aims: [...input.today.aims, ...added], added: added.length };
}

/** The wind-down opens once its time has come, on a day that has aims. */
export const isWindDownDue = (input: {
  now: number;
  clock: DayClock;
  windDownState: string;
  aimCount: number;
}) =>
  input.windDownState === 'waiting' &&
  input.aimCount > 0 &&
  input.now >= input.clock.windDownAt;

export interface BusyEvent {
  ref: string;
  startAt: number;
  endAt: number;
}

export type SlotRecord = PlanSlot;

const overlaps = (
  slot: { startAt: number | null; endAt: number | null },
  event: { startAt: number; endAt: number },
  buffer: number,
) =>
  slot.startAt !== null &&
  slot.endAt !== null &&
  slot.startAt < event.endAt + buffer &&
  slot.endAt > event.startAt - buffer;

/** What a kept aim's slot now overlaps, as slot id to the event's ref, for only the slots whose flag is out of date (null clears one). A kept slot is never moved. */
export function planOverlapFlags(input: {
  slots: Record<string, SlotRecord>;
  busy: BusyEvent[];
  aimTaskIds: ReadonlySet<string>;
}): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(input.slots).flatMap(([slotId, slot]) => {
      if (slot.status !== 'kept' || !input.aimTaskIds.has(slot.taskId))
        return [];
      const now = input.busy.find((event) => overlaps(slot, event, 0));
      const next = now?.ref ?? null;
      return next === (slot.overlapsEventRef ?? null) ? [] : [[slotId, next]];
    }),
  );
}

/** The suggested slots that now sit on an event or lost their buffer around one. */
export const findStaleSuggestions = (
  slots: Record<string, SlotRecord>,
  busy: { startAt: number; endAt: number }[],
) =>
  Object.entries(slots).flatMap(([slotId, slot]) =>
    slot.status === 'suggested' &&
    busy.some((event) => overlaps(slot, event, BUFFER))
      ? [slotId]
      : [],
  );

export interface ReplanInput {
  dayKey: string;
  timeZone: string;
  now: number;
  dayStartTime: string;
  dayEndTime: string;
  fillPercent: number;
  busy: BusyBlock[];
  slots: Record<string, SlotRecord>;
  /** The planner's view of the tasks of the suggested slots that no longer fit; titles are never opened, so they are empty. */
  tasks: PlannerTask[];
  aimTaskIds: string[];
  finishedTasks: FinishedTask[];
}

export interface ReplanPatch {
  /** The new times of a slot that still fits somewhere, by its own id. */
  moved: Record<string, { startAt: number; endAt: number; was: number | null }>;
  /** Suggested slots nothing could make room for. */
  removed: Record<string, number | null>;
}

/** Re-places only the suggested slots that no longer fit, through the planner; every other slot stays as an obstacle and is never rewritten. */
export function planReplan(input: ReplanInput): ReplanPatch {
  const stale = findStaleSuggestions(input.slots, input.busy);
  if (stale.length === 0) return { moved: {}, removed: {} };
  const staleTasks = new Set(stale.map((id) => input.slots[id].taskId));
  const held = Object.fromEntries(
    Object.entries(input.slots)
      .filter(([id]) => !stale.includes(id))
      .map(([id, slot]) => [
        id,
        slot.status === 'suggested'
          ? { ...slot, status: 'kept' as const }
          : slot,
      ]),
  );
  const result = planDay(
    {
      dayKey: input.dayKey,
      timeZone: input.timeZone,
      now: input.now,
      dayStartTime: input.dayStartTime,
      dayEndTime: input.dayEndTime,
      fillPercent: input.fillPercent,
      hasCalendar: true,
      restDay: null,
      currentPlaceId: null,
      busy: input.busy,
      slots: held,
      tasks: input.tasks.filter((task) => staleTasks.has(task.id)),
      aimTaskIds: input.aimTaskIds.filter((id) => staleTasks.has(id)),
      finishedTasks: input.finishedTasks,
    },
    (taskId) => `replan:${taskId}`,
  );
  const placed = new Map(
    Object.entries(result.slots).flatMap(([id, slot]) =>
      id.startsWith('replan:') && slot.startAt !== null && slot.endAt !== null
        ? [[slot.taskId, { startAt: slot.startAt, endAt: slot.endAt }] as const]
        : [],
    ),
  );
  return stale.reduce<ReplanPatch>(
    (patch, id) => {
      const slot = input.slots[id];
      const next = placed.get(slot.taskId);
      return next
        ? {
            ...patch,
            moved: { ...patch.moved, [id]: { ...next, was: slot.startAt } },
          }
        : { ...patch, removed: { ...patch.removed, [id]: slot.startAt } };
    },
    { moved: {}, removed: {} },
  );
}

const nextBoundary = (now: number) => (Math.floor(now / SLICE) + 1) * SLICE;

/** When the day next needs the server: the day's start while it has not come, the wind-down time, the next quarter hour while an aim is planned today, else the next day's start. */
export function readNextLookAt(input: {
  now: number;
  clock: DayClock;
  windDownState: string;
  hasAims: boolean;
  isPlanned: boolean;
}): number {
  const { now, clock } = input;
  const times = [
    ...(now < clock.startAt ? [clock.startAt] : []),
    ...(input.hasAims &&
    input.windDownState === 'waiting' &&
    now < clock.windDownAt
      ? [clock.windDownAt]
      : []),
    ...(input.hasAims && input.isPlanned && now < clock.endAt
      ? [Math.min(nextBoundary(now), clock.endAt)]
      : []),
  ];
  return times.length > 0 ? Math.min(...times) : clock.nextStartAt;
}
