import type { DocumentData, Firestore } from 'firebase-admin/firestore';

import {
  dayKeyToMs,
  shiftDayKeyBy,
  type Cadence,
} from '../../../vendor/cadenceUtils.js';
import {
  habitDayKey,
  readHabitClock,
  type DayPart,
} from '../nomos/habitDay.js';
import type { LifeDay, LifeStage } from '../nomos/habitLife.js';
import type {
  ReminderHabit,
  ReminderProfile,
} from '../nomos/habitReminders.js';

export const HABIT_HISTORY_MAX = 30;
export const HABITS_READ = 30;

export const userPath = (uid: string) => `apps/helm/users/${uid}`;
export const queuePath = (uid: string) => `apps/helm/reminderQueue/${uid}`;

const DAY_PARTS: DayPart[] = [
  'morning',
  'midday',
  'afternoon',
  'evening',
  'bedtime',
];
const STAGES: LifeStage[] = ['building', 'holding', 'formed', 'buildingAgain'];
const PACES = ['adaptive', 'start', 'late'] as const;
const NAME_MAX = 60;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toClock = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback;

const toZone = (value: unknown) => {
  if (typeof value !== 'string') return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
};

export interface HelmEventDoc {
  kind: string;
  at: number;
  by: string;
  pace: string | null;
  stage: string | null;
}

export interface PlanProfile extends ReminderProfile {
  assistantName: string | null;
  zoneSpans: { zone: string; from: number; to: number; awayId?: string }[];
  habitRemindersChangedAt: number | null;
}

/** The profile's readable fields, with the defaults a profile from before a field reads as. */
export const readProfile = (data: DocumentData): PlanProfile => {
  const quiet = isRecord(data.quietHours) ? data.quietHours : null;
  return {
    timeZone: toZone(data.timeZone),
    dayStartTime: toClock(data.dayStartTime, '08:00'),
    dayEndTime: toClock(data.dayEndTime, '22:00'),
    quietHours:
      quiet && toText(quiet.start) && toText(quiet.end)
        ? {
            start: toClock(quiet.start, '22:00'),
            end: toClock(quiet.end, '07:00'),
          }
        : null,
    remindersPausedAt: toNumber(data.remindersPausedAt),
    habitRemindersIdleAt: toNumber(data.habitRemindersIdleAt),
    assistantName: toText(data.assistantName),
    zoneSpans: Array.isArray(data.zoneSpans)
      ? data.zoneSpans.flatMap((span) =>
          isRecord(span) &&
          typeof span.zone === 'string' &&
          typeof span.from === 'number' &&
          typeof span.to === 'number'
            ? [
                {
                  zone: toZone(span.zone),
                  from: span.from,
                  to: span.to,
                  ...(typeof span.awayId === 'string'
                    ? { awayId: span.awayId }
                    : {}),
                },
              ]
            : [],
        )
      : [],
    habitRemindersChangedAt: toNumber(data.habitRemindersChangedAt),
  };
};

/** The zone and habit day an instant falls on for this person, following an away span's clock while one covers the day. */
export const readClock = (at: number, profile: PlanProfile) =>
  readHabitClock(at, profile);

export interface PlanHabit extends ReminderHabit {
  history: HelmEventDoc[];
  projectId: string | null;
  lockScreenName: string | null;
  untoldSince: number | null;
}

const readWindowState = (value: unknown): ReminderHabit['windowState'] =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, window]) =>
          isRecord(window) &&
          typeof window.start === 'string' &&
          typeof window.end === 'string'
            ? [
                [
                  id,
                  {
                    start: window.start,
                    end: window.end,
                    order: toNumber(window.order) ?? 0,
                    editedAt: toNumber(window.editedAt),
                    part:
                      DAY_PARTS.find((part) => part === window.part) ?? null,
                  },
                ] as const,
              ]
            : [],
        ),
      )
    : {};

const readCadence = (value: unknown): Cadence => {
  if (!isRecord(value)) return { kind: 'everyDay' };
  if (value.kind === 'onWeekdays' && Array.isArray(value.weekdays))
    return value as Cadence;
  if (value.kind === 'timesPerWeek' && typeof value.count === 'number')
    return value as Cadence;
  if (
    value.kind === 'everyNDays' &&
    typeof value.days === 'number' &&
    typeof value.anchor === 'number'
  )
    return value as Cadence;
  return { kind: 'everyDay' };
};

/** A habit's readable fields; its sealed words are never touched. */
export const readHabit = (
  id: string,
  data: DocumentData,
  timeZone: string,
): PlanHabit => {
  const forWhoId = toText(data.forWhoId);
  const isCare = data.isCare === true || forWhoId !== null;
  const createdAt = toNumber(data.createdAt);
  const reminder = isRecord(data.reminder) ? data.reminder : null;
  const pace = PACES.find((one) => one === reminder?.pace);
  const lockScreenName = toText(data.lockScreenName)?.trim().slice(0, NAME_MAX);
  return {
    id,
    status: toText(data.status) ?? 'active',
    cadence: readCadence(data.cadence),
    windowState: readWindowState(data.windowState),
    timesPerDay: toNumber(data.timesPerDay),
    startsOn:
      toNumber(data.startsOn) ??
      (createdAt === null ? 0 : dayKeyToMs(habitDayKey(createdAt, timeZone))),
    endsOn: toNumber(data.endsOn),
    pausedAt: toNumber(data.pausedAt),
    pausedUntil: toNumber(data.pausedUntil),
    history: Array.isArray(data.history)
      ? data.history.flatMap((event) =>
          isRecord(event) &&
          typeof event.kind === 'string' &&
          typeof event.at === 'number'
            ? [
                {
                  kind: event.kind,
                  at: event.at,
                  by: toText(event.by) ?? 'nomos',
                  pace: toText(event.pace),
                  stage: toText(event.stage),
                },
              ]
            : [],
        )
      : [],
    isCare,
    forWhoId,
    stage:
      forWhoId !== null
        ? null
        : (STAGES.find((one) => one === data.stage) ?? 'building'),
    stageAt: toNumber(data.stageAt) ?? createdAt ?? 0,
    stageWeek: toText(data.stageWeek),
    rejudgeFrom: toText(data.rejudgeFrom),
    formedAt: toNumber(data.formedAt),
    reminder: reminder
      ? {
          isOn: reminder.isOn === true,
          pace:
            pace && !(isCare && pace === 'adaptive')
              ? pace
              : isCare
                ? 'start'
                : 'adaptive',
          anyTimeAt: toText(reminder.anyTimeAt),
          allowQuietHours: reminder.allowQuietHours === true,
        }
      : null,
    projectId: toText(data.projectId),
    lockScreenName: lockScreenName ? lockScreenName : null,
    untoldSince: toNumber(data.untoldSince),
  };
};

/** One habit day's readable ticks; a day from before `isInUse` reads as in use when it holds any check. */
export const readDay = (data: DocumentData | undefined): LifeDay => {
  const entries = isRecord(data?.entries) ? data.entries : {};
  const read = Object.fromEntries(
    Object.entries(entries).map(([habitId, entry]) => {
      const value = isRecord(entry) ? entry : {};
      const checks = isRecord(value.checks) ? value.checks : {};
      const reminded = isRecord(value.reminded) ? value.reminded : {};
      return [
        habitId,
        {
          checks: Object.fromEntries(
            Object.entries(checks).flatMap(([windowId, check]) =>
              isRecord(check) && typeof check.status === 'string'
                ? [
                    [
                      windowId,
                      { status: check.status, at: toNumber(check.at) ?? 0 },
                    ],
                  ]
                : [],
            ),
          ),
          count: toNumber(value.count) ?? 0,
          lastCountAt: toNumber(value.lastCountAt),
          reminded: Object.fromEntries(
            Object.entries(reminded).flatMap(([windowId, at]) =>
              typeof at === 'number' ? [[windowId, at]] : [],
            ),
          ),
        },
      ];
    }),
  );
  const hasCheck = Object.values(read).some(
    (entry) => Object.keys(entry.checks).length > 0,
  );
  return { isInUse: data?.isInUse === true || hasCheck, entries: read };
};

/** The habit days from `from` to `to` (inclusive keys), read by id; a missing day is absent. */
export const readDays = async (
  firestore: Firestore,
  uid: string,
  from: string,
  to: string,
): Promise<Record<string, LifeDay>> => {
  const count =
    Math.round((dayKeyToMs(to) - dayKeyToMs(from)) / 86_400_000) + 1;
  const keys = Array.from({ length: Math.max(0, count) }, (_, at) =>
    shiftDayKeyBy(from, at),
  );
  const snaps =
    keys.length === 0
      ? []
      : await firestore.getAll(
          ...keys.map((key) =>
            firestore.doc(`${userPath(uid)}/habitDays/${key}`),
          ),
        );
  return Object.fromEntries(
    snaps.flatMap((snap, at) =>
      snap.exists ? [[keys[at], readDay(snap.data())]] : [],
    ),
  );
};

export interface QueueSlot {
  reminderId: string;
  fireAt: number;
  refs: string[];
  part: DayPart | null;
}

export interface QueueDoc {
  lookAt: number | null;
  plannedAt: number;
  plannedFor: number | null;
  leaseUntil: number | null;
  dayKey: string;
  stageWeek: string | null;
  slots: Record<string, QueueSlot>;
}

export const readQueue = (data: DocumentData | undefined): QueueDoc => {
  const slots = isRecord(data?.slots) ? data.slots : {};
  return {
    lookAt: toNumber(data?.lookAt),
    plannedAt: toNumber(data?.plannedAt) ?? 0,
    plannedFor: toNumber(data?.plannedFor),
    leaseUntil: toNumber(data?.leaseUntil),
    dayKey: toText(data?.dayKey) ?? '',
    stageWeek: toText(data?.stageWeek),
    slots: Object.fromEntries(
      Object.entries(slots).flatMap(([key, slot]) =>
        isRecord(slot) &&
        typeof slot.reminderId === 'string' &&
        typeof slot.fireAt === 'number' &&
        Array.isArray(slot.refs)
          ? [
              [
                key,
                {
                  reminderId: slot.reminderId,
                  fireAt: slot.fireAt,
                  refs: slot.refs.filter(
                    (ref): ref is string => typeof ref === 'string',
                  ),
                  part: DAY_PARTS.find((part) => part === slot.part) ?? null,
                },
              ],
            ]
          : [],
      ),
    ),
  };
};
