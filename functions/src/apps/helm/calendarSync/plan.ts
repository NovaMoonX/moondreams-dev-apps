import { createHmac } from 'node:crypto';

import { zonedDateTimeToEpoch } from '../../../notifications/zonedTime.js';
import { dayKeyToMs, shiftDayKeyBy } from '../../../vendor/cadenceUtils.js';
import {
  isHabitDue,
  readHabitStatusOn,
  readWindowSpans,
  type HabitScheduleLike,
} from '../nomos/habitDay.js';

export const WINDOW_DAYS = 7;
export const MAX_EVENTS = 150;
export const SKEW_MS = 5_000;
export const BUSY_TITLE = 'Busy';
export const DEFAULT_MEET_MINUTES = 60;
export const PLAN_LINK = 'https://apps.moondreams.dev/helm?view=today';

const MINUTE = 60_000;

export interface SlotInput {
  dayKey: string;
  slotId: string;
  taskId: string;
  startAt: number | null;
  endAt: number | null;
  status: string;
  decidedAt: number | null;
}

export interface TaskInput {
  id: string;
  title: string;
  isPrivate: boolean;
  status: 'open' | 'done';
  dueAt: number | null;
  durationMinutes: number | null;
  hasMeets: boolean;
  lastEditedAt: number | null;
}

export interface HabitInput extends HabitScheduleLike {
  id: string;
  name: string;
  isPrivate: boolean;
  lastEditedAt: number | null;
}

export type EventSource =
  | { kind: 'slot'; dayKey: string; slotId: string; taskId: string }
  | { kind: 'habit'; habitId: string; dayKey: string; windowId: string }
  | { kind: 'meet'; taskId: string };

export interface DesiredEvent {
  ref: string;
  source: EventSource;
  title: string;
  isPrivate: boolean;
  startAt: number;
  endAt: number;
  /** When the plan's own side of it last changed, for telling whose edit is newer. */
  changedAt: number | null;
}

/** A link between one plan event and the calendar event written for it; `removedAt` marks one the person deleted in the calendar, so it is not made again. */
export interface EventLink {
  helmRef: string;
  eventId: string;
  calendarId: string;
  startAt: number;
  endAt: number;
  contentHash: string;
  writtenAt: number;
  removedAt: number | null;
}

/** What the calendar read last said about an event the plan wrote. */
export interface RemoteEvent {
  startAt: number | null;
  endAt: number | null;
  sourceUpdatedAt: number | null;
}

export const toSlotRef = (dayKey: string, slotId: string) =>
  `slot:${dayKey}:${slotId}`;
export const toHabitRef = (habitId: string, dayKey: string, windowId: string) =>
  `habit:${habitId}:${dayKey}:${windowId}`;
export const toMeetRef = (taskId: string) => `meet:${taskId}`;

const toDayKeyIn = (at: number, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

export const toWindow = (now: number, timeZone: string) => {
  const today = toDayKeyIn(now, timeZone);
  const dayKeys = Array.from({ length: WINDOW_DAYS }, (_, at) =>
    shiftDayKeyBy(today, at),
  );
  return {
    today,
    dayKeys,
    startAt: zonedDateTimeToEpoch(today, '00:00', timeZone),
    endAt: zonedDateTimeToEpoch(
      shiftDayKeyBy(today, WINDOW_DAYS),
      '00:00',
      timeZone,
    ),
  };
};

const byStart = (a: DesiredEvent, b: DesiredEvent) =>
  a.startAt - b.startAt || (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0);

/** The events the calendar should hold for today and the next six days: kept slots, habit windows and appointments, at most 150, soonest first. */
export function buildDesired(input: {
  now: number;
  timeZone: string;
  slots: SlotInput[];
  tasks: TaskInput[];
  habits: HabitInput[];
}): DesiredEvent[] {
  const window = toWindow(input.now, input.timeZone);
  const isInWindow = (startAt: number) =>
    startAt >= window.startAt && startAt < window.endAt;
  const tasks = new Map(input.tasks.map((task) => [task.id, task]));
  const meets = input.tasks.flatMap((task): DesiredEvent[] =>
    task.hasMeets &&
    task.status === 'open' &&
    task.dueAt !== null &&
    isInWindow(task.dueAt)
      ? [
          {
            ref: toMeetRef(task.id),
            source: { kind: 'meet', taskId: task.id },
            title: task.title,
            isPrivate: task.isPrivate,
            startAt: task.dueAt,
            endAt:
              task.dueAt +
              (task.durationMinutes ?? DEFAULT_MEET_MINUTES) * MINUTE,
            changedAt: task.lastEditedAt,
          },
        ]
      : [],
  );
  const meetTaskIds = new Set(
    meets.flatMap((event) =>
      event.source.kind === 'meet' ? [event.source.taskId] : [],
    ),
  );
  const slots = input.slots.flatMap((slot): DesiredEvent[] => {
    const task = tasks.get(slot.taskId);
    if (
      slot.status !== 'kept' ||
      slot.startAt === null ||
      slot.endAt === null ||
      slot.endAt <= slot.startAt ||
      !window.dayKeys.includes(slot.dayKey) ||
      !isInWindow(slot.startAt) ||
      !task ||
      meetTaskIds.has(task.id)
    )
      return [];
    return [
      {
        ref: toSlotRef(slot.dayKey, slot.slotId),
        source: {
          kind: 'slot',
          dayKey: slot.dayKey,
          slotId: slot.slotId,
          taskId: task.id,
        },
        title: task.title,
        isPrivate: task.isPrivate,
        startAt: slot.startAt,
        endAt: slot.endAt,
        changedAt: slot.decidedAt,
      },
    ];
  });
  const habits = input.habits.flatMap((habit) =>
    window.dayKeys.flatMap((dayKey): DesiredEvent[] => {
      const current = {
        ...habit,
        status: readHabitStatusOn(habit, dayKey),
      };
      if (current.timesPerDay !== null || !isHabitDue(current, dayKey))
        return [];
      return readWindowSpans(habit, dayKey, input.timeZone)
        .filter((span) => span.endAt > span.startAt && isInWindow(span.startAt))
        .map((span) => ({
          ref: toHabitRef(habit.id, dayKey, span.id),
          source: {
            kind: 'habit' as const,
            habitId: habit.id,
            dayKey,
            windowId: span.id,
          },
          title: habit.name,
          isPrivate: habit.isPrivate,
          startAt: span.startAt,
          endAt: span.endAt,
          changedAt: habit.lastEditedAt,
        }));
    }),
  );
  return [...meets, ...slots, ...habits].sort(byStart).slice(0, MAX_EVENTS);
}

const toShownTitle = (event: Pick<DesiredEvent, 'title' | 'isPrivate'>) =>
  event.isPrivate ? BUSY_TITLE : event.title;

/** A keyed fingerprint of what the calendar shows for an event, so a changed title, privacy or time is told from an unchanged one without keeping the title. */
export const toContentHash = (subkey: Buffer, event: DesiredEvent) =>
  createHmac('sha256', subkey)
    .update(
      JSON.stringify({
        title: toShownTitle(event),
        isPrivate: event.isPrivate,
        startAt: event.startAt,
        endAt: event.endAt,
      }),
    )
    .digest('hex');

export interface EventBody {
  summary: string;
  visibility?: 'private';
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  transparency: 'opaque';
  reminders: { useDefault: false };
  extendedProperties: { private: { helmRef: string } };
}

/** The body Google is sent for an event: a private one is a bare "Busy" block with no words from the plan. */
export const toEventBody = (
  event: DesiredEvent,
  assistantName: string,
): EventBody => ({
  summary: toShownTitle(event),
  ...(event.isPrivate
    ? { visibility: 'private' as const }
    : { description: `Planned with ${assistantName}: ${PLAN_LINK}` }),
  start: { dateTime: new Date(event.startAt).toISOString() },
  end: { dateTime: new Date(event.endAt).toISOString() },
  transparency: 'opaque',
  reminders: { useDefault: false },
  extendedProperties: { private: { helmRef: event.ref } },
});

const clean = (value: string) => value.replace(/\s+/g, ' ');

const toWhen = (at: number, now: number, timeZone: string) => {
  const time = clean(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    }).format(at),
  );
  return toDayKeyIn(at, timeZone) === toDayKeyIn(now, timeZone)
    ? time
    : `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at)}, ${time}`;
};

const toPlanDay = (dayKey: string, today: string) =>
  dayKey === today
    ? "today's plan"
    : `${new Date(dayKeyToMs(dayKey)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}'s plan`;

export type ReadBackChange =
  | {
      kind: 'slotMoved';
      dayKey: string;
      slotId: string;
      startAt: number;
      endAt: number;
      line: string;
      isPrivate: boolean;
    }
  | {
      kind: 'slotRemoved';
      dayKey: string;
      slotId: string;
      line: string;
      isPrivate: boolean;
    }
  | {
      kind: 'meetMoved';
      taskId: string;
      startAt: number;
      endAt: number;
      line: string;
      isPrivate: boolean;
    }
  | { kind: 'noted'; line: string; isPrivate: boolean };

export interface ReadBack {
  changes: ReadBackChange[];
  /** Refs whose link changed: the new link, or null to drop it. */
  links: Map<string, EventLink | null>;
}

const hasMoved = (link: EventLink, remote: RemoteEvent) =>
  remote.startAt !== null &&
  remote.endAt !== null &&
  remote.sourceUpdatedAt !== null &&
  remote.sourceUpdatedAt > link.writtenAt + SKEW_MS &&
  (remote.startAt !== link.startAt || remote.endAt !== link.endAt);

/** What the calendar changed since the plan last wrote, as decisions: a moved slot or appointment moves, a deleted slot is set aside, a habit window is only noted; the newer side wins. */
export function readBack(input: {
  now: number;
  timeZone: string;
  desired: DesiredEvent[];
  links: Map<string, EventLink>;
  remote: Map<string, RemoteEvent>;
  /** Whether the calendar is among those read back, so a missing copy means a deleted event. */
  isReadBack: boolean;
  /** When the calendar was last read in full; a copy missing before then is a deleted event, not one not yet read. */
  readThrough: number | null;
  hash: (event: DesiredEvent) => string;
}): ReadBack {
  const { now, timeZone } = input;
  const today = toDayKeyIn(now, timeZone);
  const results = input.desired.map((event) => {
    const link = input.links.get(event.ref);
    if (!link || link.removedAt !== null) return null;
    const remote = input.remote.get(event.ref);
    const base = { isPrivate: event.isPrivate };
    if (!remote) {
      const isGone =
        input.isReadBack &&
        input.readThrough !== null &&
        input.readThrough > link.writtenAt + SKEW_MS;
      if (!isGone) return null;
      const { source } = event;
      if (source.kind === 'slot')
        return {
          ref: event.ref,
          link: null,
          change: {
            kind: 'slotRemoved' as const,
            dayKey: source.dayKey,
            slotId: source.slotId,
            line: `Removed ${event.title} from ${toPlanDay(source.dayKey, today)}, from your calendar`,
            ...base,
          },
        };
      return {
        ref: event.ref,
        link: { ...link, removedAt: now },
        change: {
          kind: 'noted' as const,
          line:
            source.kind === 'meet'
              ? `${event.title} was removed from your calendar; it's still in your tasks`
              : `${event.title} was removed from your calendar; it's still in your habits`,
          ...base,
        },
      };
    }
    if (!hasMoved(link, remote)) return null;
    const startAt = remote.startAt as number;
    const endAt = remote.endAt as number;
    const isHelmNewer =
      event.changedAt !== null &&
      event.changedAt >= (remote.sourceUpdatedAt as number);
    if (isHelmNewer) return null;
    const moved = { ...event, startAt, endAt };
    const { source } = event;
    if (source.kind === 'habit')
      return {
        ref: event.ref,
        link: {
          ...link,
          startAt,
          endAt,
          contentHash: input.hash(event),
          writtenAt: now,
        },
        change: {
          kind: 'noted' as const,
          line: `You moved ${event.title} to ${toWhen(startAt, now, timeZone)} in your calendar; it stays at ${toWhen(event.startAt, now, timeZone)} here.`,
          ...base,
        },
      };
    const line = `Moved ${event.title} to ${toWhen(startAt, now, timeZone)}, from your calendar`;
    return {
      ref: event.ref,
      link: {
        ...link,
        startAt,
        endAt,
        contentHash: input.hash(moved),
        writtenAt: now,
      },
      change:
        source.kind === 'slot'
          ? {
              kind: 'slotMoved' as const,
              dayKey: source.dayKey,
              slotId: source.slotId,
              startAt,
              endAt,
              line,
              ...base,
            }
          : {
              kind: 'meetMoved' as const,
              taskId: source.taskId,
              startAt,
              endAt,
              line,
              ...base,
            },
    };
  });
  const found = results.flatMap((result) => (result ? [result] : []));
  return {
    changes: found.map((result) => result.change),
    links: new Map(found.map((result) => [result.ref, result.link])),
  };
}

export interface WritePlan {
  inserts: DesiredEvent[];
  patches: { event: DesiredEvent; link: EventLink }[];
  /** Calendar events to delete, with their links. */
  deletes: EventLink[];
  /** Links to forget without touching the calendar: a deleted event's, or a past event's, which stays. */
  drops: EventLink[];
}

const EMPTY_PLAN: WritePlan = {
  inserts: [],
  patches: [],
  deletes: [],
  drops: [],
};

/** What to send to the calendar; nothing at all until a calendar is chosen, and a past event is never deleted. */
export function planWrites(input: {
  calendarId: string | null;
  now: number;
  timeZone: string;
  desired: DesiredEvent[];
  links: Map<string, EventLink>;
  remote: Map<string, RemoteEvent>;
  hash: (event: DesiredEvent) => string;
}): WritePlan {
  if (input.calendarId === null) return EMPTY_PLAN;
  const { startAt: windowStart } = toWindow(input.now, input.timeZone);
  const wanted = new Set(input.desired.map((event) => event.ref));
  const isPersonsEdit = (event: DesiredEvent, link: EventLink) => {
    const updatedAt = input.remote.get(event.ref)?.sourceUpdatedAt ?? null;
    return (
      updatedAt !== null &&
      updatedAt > link.writtenAt + SKEW_MS &&
      (event.changedAt ?? 0) < updatedAt
    );
  };
  const inserts = input.desired.filter((event) => !input.links.has(event.ref));
  const patches = input.desired.flatMap((event) => {
    const link = input.links.get(event.ref);
    return link &&
      link.removedAt === null &&
      link.contentHash !== input.hash(event) &&
      !isPersonsEdit(event, link)
      ? [{ event, link }]
      : [];
  });
  const stale = [...input.links.values()].filter(
    (link) => !wanted.has(link.helmRef),
  );
  const isUpcoming = (link: EventLink) =>
    link.removedAt === null && link.startAt >= windowStart;
  return {
    inserts,
    patches,
    deletes: stale.filter(isUpcoming),
    drops: stale.filter((link) => !isUpcoming(link)),
  };
}
