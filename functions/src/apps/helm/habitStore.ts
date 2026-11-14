import { FieldValue } from 'firebase-admin/firestore';
import type {
  DocumentData,
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

import type { SealedPayload } from '../../appKeys/seal.js';
import type { Cadence } from '../../vendor/cadenceUtils.js';
import { openForHelm, type HelmKey } from './helmKey.js';
import {
  habitDayKey,
  isHabitDue,
  readHabitStatusOn,
  type ClockWindow,
} from './nomos/habitDay.js';
import { readPrivacy, type PrivacyClass, type PrivateMark } from './privacy.js';

const HABITS_READ = 200;
const CADENCE_KINDS = ['everyDay', 'onWeekdays', 'timesPerWeek', 'everyNDays'];

export interface HabitWindowDoc extends ClockWindow {
  part: string | null;
  order: number;
  editedAt: number | null;
}

export interface HabitWords {
  name: string;
  emoji: string | null;
  notes: string | null;
  medicine: { name: string; dose: string | null } | null;
  windows: Record<string, { label: string }>;
  importance: unknown;
  privateMark: PrivateMark | null;
  isPrivacyCleared: boolean;
}

export interface HabitEvent {
  kind: string;
  at: number;
  by: string;
  pace: string | null;
  stage: string | null;
}

/** A habit as a turn read it: the readable fields with the defaults a record from before a field reads as, and its words opened. */
export interface LiveHabit extends HabitWords {
  id: string;
  status: string;
  /** What the document holds; `status` may read a finished pause as active. */
  storedStatus: string;
  lastEditedAt: number | null;
  cadence: Cadence;
  windowState: Record<string, HabitWindowDoc>;
  timesPerDay: number | null;
  forWhoId: string | null;
  isCare: boolean;
  startsOn: number;
  endsOn: number | null;
  pausedUntil: number | null;
  pausedAt: number | null;
  endedAt: number | null;
  retiredAt: number | null;
  careAskedAt: number | null;
  stage: string | null;
  reminder: { isOn: boolean; pace: string } | null;
  history: HabitEvent[];
  privacy: PrivacyClass;
}

export interface LiveDayEntry {
  checks: Record<string, { status: string; at: number }>;
  count: number;
  followUpAt: number | null;
  followUpState: string | null;
  noteKeys: string[];
}

export interface LiveHabitDay {
  exists: boolean;
  /** The day holds sealed notes that did not open, so writing its notes would overwrite them. */
  isNotesUnreadable: boolean;
  entries: Record<string, LiveDayEntry>;
  notes: Record<string, { text: string; at: number; captureId: string | null }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown) => (typeof value === 'string' ? value : null);

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const toCadence = (value: unknown): Cadence => {
  if (!isRecord(value) || !CADENCE_KINDS.includes(String(value.kind)))
    return { kind: 'everyDay' };
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

const toWindowState = (value: unknown): Record<string, HabitWindowDoc> =>
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
                    part: toText(window.part),
                    order: toNumber(window.order) ?? 0,
                    editedAt: toNumber(window.editedAt),
                  },
                ] as [string, HabitWindowDoc],
              ]
            : [],
        ),
      )
    : {};

const toMark = (value: unknown): PrivateMark | null =>
  value === 'health' || value === 'care' || value === 'person' ? value : null;

const toWindowLabels = (value: unknown): Record<string, { label: string }> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, window]) =>
          isRecord(window) && typeof window.label === 'string'
            ? [[id, { label: window.label }] as [string, { label: string }]]
            : [],
        ),
      )
    : {};

/** Whether a habit is private in effect: marked so, or a medicine or care habit. */
export const isPrivateHabit = (habit: Pick<LiveHabit, 'privacy' | 'isCare'>) =>
  habit.privacy === 'private' || habit.isCare;

/** Opens a habit document; null when its words will not open. A record from before `startsOn` starts on the day it was made, in `timeZone`. */
export const openLiveHabit = (
  key: HelmKey,
  id: string,
  data: DocumentData,
  timeZone = 'UTC',
): LiveHabit | null => {
  try {
    const status =
      data.status === 'paused' ||
      data.status === 'ended' ||
      data.status === 'retired'
        ? data.status
        : 'active';
    const createdAt = toNumber(data.createdAt);
    const words = openForHelm(key, data.sealed as SealedPayload);
    if (typeof words.name !== 'string') return null;
    const forWhoId = toText(data.forWhoId);
    const medicine = isRecord(words.medicine) ? words.medicine : null;
    const reminder = isRecord(data.reminder) ? data.reminder : null;
    return {
      id,
      name: words.name,
      emoji: toText(words.emoji),
      notes: toText(words.notes),
      medicine:
        medicine && typeof medicine.name === 'string'
          ? { name: medicine.name, dose: toText(medicine.dose) }
          : null,
      windows: toWindowLabels(words.windows),
      importance: words.importance ?? null,
      privateMark: toMark(words.privateMark),
      isPrivacyCleared: words.isPrivacyCleared === true,
      status,
      storedStatus: status,
      lastEditedAt: toNumber(data.lastEditedAt),
      cadence: toCadence(data.cadence),
      windowState: toWindowState(data.windowState),
      timesPerDay: toNumber(data.timesPerDay),
      forWhoId,
      isCare: data.isCare === true || forWhoId !== null,
      startsOn:
        toNumber(data.startsOn) ??
        (createdAt === null
          ? 0
          : Date.parse(`${habitDayKey(createdAt, timeZone)}T00:00:00Z`)),
      endsOn: toNumber(data.endsOn),
      pausedUntil: toNumber(data.pausedUntil),
      pausedAt: toNumber(data.pausedAt),
      endedAt: toNumber(data.endedAt),
      retiredAt: toNumber(data.retiredAt),
      careAskedAt: toNumber(data.careAskedAt),
      stage: toText(data.stage),
      reminder: reminder
        ? {
            isOn: reminder.isOn === true,
            pace: toText(reminder.pace) ?? 'adaptive',
          }
        : null,
      history: Array.isArray(data.history)
        ? data.history.filter(
            (event): event is HabitEvent =>
              isRecord(event) &&
              typeof event.kind === 'string' &&
              typeof event.at === 'number',
          )
        : [],
      privacy: readPrivacy(data.privacy),
    };
  } catch {
    return null;
  }
};

const toEntry = (value: unknown): LiveDayEntry => {
  const entry = isRecord(value) ? value : {};
  const checks = isRecord(entry.checks) ? entry.checks : {};
  return {
    checks: Object.fromEntries(
      Object.entries(checks).flatMap(([id, check]) =>
        isRecord(check) && typeof check.status === 'string'
          ? [
              [id, { status: check.status, at: toNumber(check.at) ?? 0 }] as [
                string,
                { status: string; at: number },
              ],
            ]
          : [],
      ),
    ),
    count: toNumber(entry.count) ?? 0,
    followUpAt: toNumber(entry.followUpAt),
    followUpState: toText(entry.followUpState),
    noteKeys: Array.isArray(entry.noteKeys)
      ? entry.noteKeys.filter((id): id is string => typeof id === 'string')
      : [],
  };
};

const toNotes = (value: unknown): LiveHabitDay['notes'] =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([id, note]) =>
          isRecord(note) && typeof note.text === 'string'
            ? [
                [
                  id,
                  {
                    text: note.text,
                    at: toNumber(note.at) ?? 0,
                    captureId: toText(note.captureId),
                  },
                ] as [string, LiveHabitDay['notes'][string]],
              ]
            : [],
        ),
      )
    : {};

export const EMPTY_HABIT_DAY: LiveHabitDay = {
  exists: false,
  isNotesUnreadable: false,
  entries: {},
  notes: {},
};

/** Opens a habit day; the readable entries are kept when its notes will not open. */
export const openLiveHabitDay = (
  key: HelmKey,
  data: DocumentData | undefined,
): LiveHabitDay => {
  if (!data) return EMPTY_HABIT_DAY;
  const entries = isRecord(data.entries)
    ? Object.fromEntries(
        Object.entries(data.entries).map(([id, entry]) => [id, toEntry(entry)]),
      )
    : {};
  try {
    const words = data.sealed
      ? openForHelm(key, data.sealed as SealedPayload)
      : null;
    return {
      exists: true,
      isNotesUnreadable: false,
      entries,
      notes: toNotes(words?.notes),
    };
  } catch {
    return { exists: true, isNotesUnreadable: true, entries, notes: {} };
  }
};

export const habitsQuery = (firestore: Firestore, base: string) =>
  firestore.collection(`${base}/habits`).limit(HABITS_READ);

export const habitDayRef = (
  firestore: Firestore,
  base: string,
  dayKey: string,
) => firestore.doc(`${base}/habitDays/${dayKey}`);

export interface HabitDayWrite {
  dayKey: string;
  checks: {
    habitId: string;
    windowId: string;
    check: {
      status: 'done' | 'skipped';
      at: number;
      by: 'nomos';
      executionId: string | null;
    };
  }[];
  tallies: { habitId: string; at: number }[];
  noteKeys: { habitId: string; key: string }[];
  followUps: { habitId: string; at: number }[];
  /** The day's whole notes payload after the turn; null when it holds none. */
  sealed: SealedPayload | null;
}

/** One merge on the day: a tick lands beside another device's tick in a different window, a tally is an increment so two devices adding at once make two. */
export const writeHabitDayIn = (
  transaction: Transaction,
  ref: DocumentReference,
  write: HabitDayWrite,
) => {
  const dayMs = Date.parse(`${write.dayKey}T00:00:00Z`);
  const entry = (habitId: string) => `entries.${habitId}`;
  const data: Record<string, unknown> = {
    date: dayMs,
    isInUse: true,
    ...Object.fromEntries(
      write.checks.map(({ habitId, windowId, check }) => [
        `${entry(habitId)}.checks.${windowId}`,
        check,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(
        write.tallies.reduce<Record<string, { n: number; at: number }>>(
          (sums, { habitId, at }) => ({
            ...sums,
            [habitId]: {
              n: (sums[habitId]?.n ?? 0) + 1,
              at: Math.max(sums[habitId]?.at ?? 0, at),
            },
          }),
          {},
        ),
      ).flatMap(([habitId, { n, at }]) => [
        [`${entry(habitId)}.count`, FieldValue.increment(n)],
        [`${entry(habitId)}.lastCountAt`, at],
      ]),
    ),
    ...Object.fromEntries(
      write.followUps.flatMap(({ habitId, at }) => [
        [`${entry(habitId)}.followUpAt`, at],
        [`${entry(habitId)}.followUpState`, 'asked'],
      ]),
    ),
    ...Object.fromEntries(
      write.noteKeys.map(({ habitId }) => [
        `${entry(habitId)}.noteKeys`,
        FieldValue.arrayUnion(
          ...write.noteKeys
            .filter((note) => note.habitId === habitId)
            .map((note) => note.key),
        ),
      ]),
    ),
    ...(write.sealed ? { sealed: write.sealed } : {}),
  };
  transaction.set(ref, nested(data), { merge: true });
};

/** Dotted keys turned into nested maps, so a merge set (which has no dotted paths) writes the same fields an update would. */
const nested = (flat: Record<string, unknown>) =>
  Object.entries(flat).reduce<Record<string, unknown>>(
    (tree, [path, value]) => {
      const parts = path.split('.');
      parts.slice(0, -1).reduce<Record<string, unknown>>((node, part) => {
        node[part] = isRecord(node[part]) ? node[part] : {};
        return node[part] as Record<string, unknown>;
      }, tree)[parts[parts.length - 1]] = value;
      return tree;
    },
    {},
  );

/** A habit as the context shows it: today's windows with their ticks, or its count. */
export const toContextHabit = (
  habit: LiveHabit,
  day: LiveHabitDay | undefined,
  dayKey: string,
) => {
  const entry = day?.entries[habit.id];
  const windows = Object.entries(habit.windowState)
    .sort(([, first], [, second]) => first.order - second.order)
    .map(([id]) => ({
      label: habit.windows[id]?.label ?? 'Window',
      isDone: entry?.checks[id] !== undefined,
    }));
  return {
    id: habit.id,
    name: habit.name,
    emoji: habit.emoji,
    status: habit.status,
    isCare: habit.isCare,
    isDue: isHabitDue(habit, dayKey),
    windows,
    count: habit.timesPerDay === null ? null : (entry?.count ?? 0),
    timesPerDay: habit.timesPerDay,
    isForOther: habit.forWhoId !== null,
    isPrivate: isPrivateHabit(habit),
  };
};

const STATUS_ORDER = ['active', 'paused', 'ended', 'retired'];

/** The person's habits with today's state, for the turn's context: active first, retired last and flagged by their status so a check-in on one is answered by code. */
export const readContextHabits = async (
  firestore: Firestore,
  base: string,
  key: HelmKey,
  at: number,
  timeZone: string,
) => {
  const dayKey = habitDayKey(at, timeZone);
  const [habitsSnap, daySnap] = await Promise.all([
    habitsQuery(firestore, base).get(),
    habitDayRef(firestore, base, dayKey).get(),
  ]);
  const day = openLiveHabitDay(key, daySnap.data());
  return habitsSnap.docs
    .flatMap((doc) => openLiveHabit(key, doc.id, doc.data(), timeZone) ?? [])
    .map((habit) => ({ ...habit, status: readHabitStatusOn(habit, dayKey) }))
    .sort(
      (first, second) =>
        STATUS_ORDER.indexOf(first.status) -
        STATUS_ORDER.indexOf(second.status),
    )
    .map((habit) => toContextHabit(habit, day, dayKey));
};

const DAY_MS = 86_400_000;

/** Every habit and the habit days today and yesterday, read inside the turn's transaction so a tick lands on what is there now. */
export const readHabitState = async (
  transaction: Transaction,
  firestore: Firestore,
  base: string,
  key: HelmKey,
  at: number,
  timeZone: string,
) => {
  const dayKeys = [
    ...new Set([habitDayKey(at, timeZone), habitDayKey(at - DAY_MS, timeZone)]),
  ];
  const [habitsSnap, ...daySnaps] = await Promise.all([
    transaction.get(habitsQuery(firestore, base)),
    ...dayKeys.map((dayKey) =>
      transaction.get(habitDayRef(firestore, base, dayKey)),
    ),
  ]);
  return {
    habits: habitsSnap.docs
      .flatMap((doc) => openLiveHabit(key, doc.id, doc.data(), timeZone) ?? [])
      .map((habit) => ({
        ...habit,
        status: readHabitStatusOn(habit, dayKeys[0]),
      })),
    days: new Map(
      daySnaps.map((snap, index): [string, LiveHabitDay] => [
        dayKeys[index],
        openLiveHabitDay(key, snap.data()),
      ]),
    ),
  };
};
