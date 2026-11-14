import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { Cadence, Weekday } from '../../../vendor/cadenceUtils.js';
import type { AliasBook } from './aliases.js';
import {
  HABIT_CADENCE_KINDS,
  HABIT_CHANGES,
  HABIT_CHECK_DAYS,
  HABIT_CHECK_STATUSES,
  HABIT_LABEL_CAP,
  HABIT_NAME_CAP,
  HABIT_NOTE_CAP,
  HABIT_PARTS,
  HABIT_TIMES_PER_DAY_MAX,
  HABIT_WINDOWS_MAX,
  HABIT_COMMAND_KINDS,
  MAX_CARE_PER_TURN,
  MAX_CHECKINS_PER_TURN,
  MAX_HABIT_CANDIDATES,
  MAX_HABITS_PER_TURN,
  type CaptureReading,
  type CheckInCommand,
  type CreateHabitCommand,
  type HabitCommand,
  type HabitWindowRead,
  type SetCareCommand,
  type UpdateHabitCommand,
} from './commands.js';
import { habitDayKey } from './habitDay.js';

export type HabitDrop =
  'habit-unknown' | 'habit-unasked' | 'habit-extra' | 'habit-shape';

export interface HabitReadContext {
  habits?: AliasBook;
  people?: AliasBook;
  reading: CaptureReading;
  captureText?: string;
  timeZone?: string;
  now?: number;
}

const EMOJI_RE = /\p{Extended_Pictographic}/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toWords = (value: unknown, cap: number) => {
  if (typeof value !== 'string') return null;
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat === '') return null;
  if (flat.length <= cap) return flat;
  const cut = flat.slice(0, cap);
  const space = cut.lastIndexOf(' ');
  return (space > cap / 2 ? cut.slice(0, space) : cut).trim();
};

const toEmoji = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const first = [...new Intl.Segmenter().segment(value.trim())][0]?.segment;
  return first && EMOJI_RE.test(first) ? first : null;
};

const toLocalClock = (at: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${read('hour')}:${read('minute')}`;
};

const toSpanClock = (
  value: unknown,
  reading: CaptureReading,
  timeZone: string,
) => {
  if (typeof value !== 'string') return null;
  const span = reading.dates.find((entry) => entry.id === value);
  return span && span.due.kind === 'moment'
    ? toLocalClock(span.due.at, timeZone)
    : null;
};

const toCadence = (
  value: unknown,
  anchorDay: number,
): Cadence | null | 'bad' => {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return 'bad';
  const kind = HABIT_CADENCE_KINDS.find((entry) => entry === value.kind);
  if (kind === 'everyDay') return { kind };
  if (kind === 'onWeekdays') {
    const weekdays = [
      ...new Set(
        (Array.isArray(value.weekdays) ? value.weekdays : []).filter(
          (day): day is Weekday =>
            Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
        ),
      ),
    ].sort();
    return weekdays.length === 0 ? 'bad' : { kind, weekdays };
  }
  if (kind === 'timesPerWeek') {
    const count = value.count;
    return typeof count === 'number' &&
      Number.isInteger(count) &&
      count >= 1 &&
      count <= 6
      ? { kind, count }
      : 'bad';
  }
  if (kind === 'everyNDays') {
    const days = value.days;
    return typeof days === 'number' &&
      Number.isInteger(days) &&
      days >= 2 &&
      days <= 30
      ? { kind, days, anchor: anchorDay }
      : 'bad';
  }
  return 'bad';
};

const toWindowReads = (
  value: unknown,
  reading: CaptureReading,
  timeZone: string,
): HabitWindowRead[] =>
  (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .flatMap((entry): HabitWindowRead[] => {
      const part = HABIT_PARTS.find((name) => name === entry.part) ?? null;
      const start = toSpanClock(entry.startSpanId, reading, timeZone);
      const end = start
        ? toSpanClock(entry.endSpanId, reading, timeZone)
        : null;
      return part || start
        ? [
            {
              part: start ? null : part,
              start,
              end,
              label: toWords(entry.label, HABIT_LABEL_CAP),
            },
          ]
        : [];
    })
    .slice(0, HABIT_WINDOWS_MAX);

const toAnchor = (context: HabitReadContext) =>
  Date.parse(
    `${habitDayKey(context.now ?? Date.now(), context.timeZone ?? 'UTC')}T00:00:00Z`,
  );

const toUntil = (value: unknown, reading: CaptureReading) => {
  const span =
    typeof value === 'string'
      ? reading.dates.find((entry) => entry.id === value)
      : undefined;
  return span && !span.precision && span.due.kind === 'day'
    ? span.due.date
    : null;
};

/** Reads the reply's habit commands from their own list; a habit the context never listed, or a change no words asked for, is dropped with a code. */
export const readHabitCommands = (
  items: Record<string, unknown>[],
  context: HabitReadContext,
): { commands: HabitCommand[]; dropped: HabitDrop[] } => {
  const captureWords = ` ${toComparable(context.captureText ?? '')} `;
  const timeZone = context.timeZone ?? 'UTC';
  const anchor = toAnchor(context);
  const isQuoted = (quote: string) =>
    toComparable(quote).split(' ').filter(Boolean).length >= 2 &&
    captureWords.includes(` ${toComparable(quote)} `);
  const habitOf = (alias: unknown) =>
    typeof alias === 'string' ? (context.habits?.idOf(alias) ?? null) : null;
  return items
    .filter((item) =>
      (HABIT_COMMAND_KINDS as readonly unknown[]).includes(item.kind),
    )
    .reduce<{ commands: HabitCommand[]; dropped: HabitDrop[] }>(
      (acc, item) => {
        const drop = (code: HabitDrop) => ({
          ...acc,
          dropped: [...acc.dropped, code],
        });
        const keep = (command: HabitCommand) => ({
          ...acc,
          commands: [...acc.commands, command],
        });
        const count = (kind: HabitCommand['kind']) =>
          acc.commands.filter((command) => command.kind === kind).length;
        const quote =
          typeof item.requestQuote === 'string' ? item.requestQuote.trim() : '';
        if (item.kind === 'createHabit') {
          const name = toWords(item.title, HABIT_NAME_CAP);
          const cadence = toCadence(item.cadence, anchor);
          if (!name || cadence === 'bad') return drop('habit-shape');
          if (count('createHabit') >= MAX_HABITS_PER_TURN)
            return drop('habit-extra');
          const timesPerDay =
            typeof item.timesPerDay === 'number' &&
            Number.isInteger(item.timesPerDay) &&
            item.timesPerDay >= 2 &&
            item.timesPerDay <= HABIT_TIMES_PER_DAY_MAX
              ? item.timesPerDay
              : null;
          const command: CreateHabitCommand = {
            kind: 'createHabit',
            name,
            emoji: toEmoji(item.projectEmoji),
            cadence: cadence ?? { kind: 'everyDay' },
            windows:
              timesPerDay === null
                ? toWindowReads(item.windows, context.reading, timeZone)
                : [],
            timesPerDay,
            forWhoId:
              typeof item.whoAlias === 'string'
                ? (context.people?.idOf(item.whoAlias) ?? null)
                : null,
            isCare: item.isCare === true,
            isPrivate: item.isPrivate === true,
            words: context.captureText ?? '',
          };
          return keep(command);
        }
        if (item.kind === 'updateHabit') {
          const habitId = habitOf(item.habitAlias);
          const change = HABIT_CHANGES.find(
            (entry) => entry === item.habitChange,
          );
          if (!habitId) return drop('habit-unknown');
          if (!change || !isQuoted(quote)) return drop('habit-unasked');
          const cadence = toCadence(item.cadence, anchor);
          if (cadence === 'bad') return drop('habit-shape');
          const windows = Array.isArray(item.windows)
            ? toWindowReads(item.windows, context.reading, timeZone)
            : null;
          const command: UpdateHabitCommand = {
            kind: 'updateHabit',
            habitId,
            change,
            cadence: change === 'reschedule' ? cadence : null,
            windows: change === 'reschedule' ? windows : null,
            until:
              change === 'pause'
                ? toUntil(item.dateSpanId, context.reading)
                : null,
            requestQuote: quote,
          };
          return keep(command);
        }
        if (item.kind === 'setCare') {
          const habitId = habitOf(item.habitAlias);
          if (!habitId) return drop('habit-unknown');
          if (typeof item.isCare !== 'boolean' || !isQuoted(quote))
            return drop('habit-unasked');
          if (count('setCare') >= MAX_CARE_PER_TURN) return drop('habit-extra');
          const command: SetCareCommand = {
            kind: 'setCare',
            habitId,
            isCare: item.isCare,
            requestQuote: quote,
          };
          return keep(command);
        }
        const named = [
          ...new Set(
            [
              habitOf(item.habitAlias),
              ...(Array.isArray(item.candidateAliases)
                ? item.candidateAliases.map(habitOf)
                : []),
            ].flatMap((id) => id ?? []),
          ),
        ].slice(0, MAX_HABIT_CANDIDATES);
        if (named.length === 0) return drop('habit-unknown');
        if (count('checkIn') >= MAX_CHECKINS_PER_TURN)
          return drop('habit-extra');
        const note = toWords(item.quote, HABIT_NOTE_CAP);
        const command: CheckInCommand = {
          kind: 'checkIn',
          habitIds: named,
          windowKey: toWords(item.windowKey, HABIT_LABEL_CAP),
          day:
            HABIT_CHECK_DAYS.find((entry) => entry === item.checkDay) ??
            'today',
          status:
            HABIT_CHECK_STATUSES.find((entry) => entry === item.checkStatus) ??
            'done',
          note:
            note && captureWords.includes(` ${toComparable(note)} `)
              ? note
              : null,
        };
        return keep(command);
      },
      { commands: [], dropped: [] },
    );
};
