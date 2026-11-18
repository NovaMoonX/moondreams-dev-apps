import { toComparable } from '../../../vendor/optionMatchUtils.js';
import type { AliasBook } from './aliases.js';
import {
  MAX_HELD_COMMANDS,
  MAX_SCHEDULE_COMMANDS_PER_TURN,
  SCHEDULE_CHANGES,
  SCHEDULE_COMMAND_KINDS,
  SCHEDULE_FREQS,
  SCHEDULE_INSTRUCTION_CAP,
  SCHEDULE_SCOPES,
  SCHEDULE_TITLE_CAP,
  SCHEDULED_ALLOWED_ENUM,
  SCHEDULED_OUTBOUND_KINDS,
  SCHEDULED_OWN_KINDS,
  type CaptureReading,
  type ChangeScheduledActionCommand,
  type HeldScheduleCommand,
  type ScheduleActionCommand,
  type ScheduleRepeatRead,
} from './commands.js';
import { sliceOfCapture } from './readHabitCommands.js';

export type ScheduleDrop =
  | 'schedule-unasked'
  | 'schedule-unknown'
  | 'schedule-shape'
  | 'schedule-outbound'
  | 'schedule-extra';

export type ScheduleCommand =
  ScheduleActionCommand | ChangeScheduledActionCommand;

export interface ScheduleReadContext {
  actions?: AliasBook;
  reading: CaptureReading;
  captureText?: string;
  timeZone?: string;
}

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toWords = (value: unknown, cap: number) => {
  if (typeof value !== 'string') return null;
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat === '' ? null : flat.slice(0, cap).trim();
};

const spanOf = (value: unknown, reading: CaptureReading) =>
  typeof value === 'string'
    ? reading.dates.find((entry) => entry.id === value)
    : undefined;

const toDay = (value: unknown, reading: CaptureReading) => {
  const span = spanOf(value, reading);
  return span && !span.precision && span.due.kind === 'day'
    ? new Date(span.due.date).toISOString().slice(0, 10)
    : null;
};

const clockOf = (at: number, timeZone: string) => {
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

const toClock = (value: unknown, reading: CaptureReading, timeZone: string) => {
  const span = spanOf(value, reading);
  return span && span.due.kind === 'moment'
    ? clockOf(span.due.at, timeZone)
    : null;
};

const allClocks = (reading: CaptureReading, timeZone: string) => [
  ...new Set(
    reading.dates.flatMap((span) =>
      span.due.kind === 'moment' ? [clockOf(span.due.at, timeZone)] : [],
    ),
  ),
];

/** The repeat's fields as the model filled them; null when they are not a shape code could build a rule from. */
const toRepeat = (
  value: unknown,
  reading: CaptureReading,
): ScheduleRepeatRead | null => {
  if (!isRecord(value)) return null;
  const freq =
    value.freq === 'subDaily'
      ? 'subDaily'
      : (SCHEDULE_FREQS.find((entry) => entry === value.freq) ?? null);
  const interval = value.interval;
  const endsKind =
    value.endsKind === 'on' || value.endsKind === 'after'
      ? value.endsKind
      : 'never';
  const until = endsKind === 'on' ? toDay(value.untilSpanId, reading) : null;
  const count = typeof value.count === 'number' ? value.count : null;
  if (
    typeof interval !== 'number' ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    (endsKind === 'on' && until === null) ||
    (endsKind === 'after' && (count === null || !Number.isInteger(count)))
  ) {
    return null;
  }
  const nth = [1, 2, 3, 4, -1].find((entry) => entry === value.nth) ?? null;
  const monthBy =
    value.monthBy === 'day' ||
    value.monthBy === 'nthWeekday' ||
    value.monthBy === 'lastDay'
      ? value.monthBy
      : null;
  return {
    freq,
    interval,
    weekdays: [
      ...new Set(
        (Array.isArray(value.weekdays) ? value.weekdays : []).filter(
          (day): day is (typeof WEEKDAYS)[number] =>
            WEEKDAYS.some((entry) => entry === day),
        ),
      ),
    ],
    monthBy,
    nth: nth as ScheduleRepeatRead['nth'],
    endsKind,
    until,
    count: endsKind === 'after' ? count : null,
  };
};

const toHeld = (value: unknown): HeldScheduleCommand[] =>
  (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .flatMap((entry): HeldScheduleCommand[] => {
      const kind = SCHEDULED_ALLOWED_ENUM.find((one) => one === entry.kind);
      return kind
        ? [{ kind, title: toWords(entry.title, SCHEDULE_TITLE_CAP) }]
        : [];
    })
    .slice(0, MAX_HELD_COMMANDS);

const isOutbound = (kind: string) =>
  (SCHEDULED_OUTBOUND_KINDS as readonly string[]).includes(kind);

/** Reads the reply's scheduled-action commands from their own list. Words must be quoted from the turn; a change names an action by an alias the context listed; a rule is only fields here, and code builds it later. */
export const readScheduledCommands = (
  items: Record<string, unknown>[],
  context: ScheduleReadContext,
): { commands: ScheduleCommand[]; dropped: ScheduleDrop[] } => {
  const words = ` ${toComparable(context.captureText ?? '')} `;
  const timeZone = context.timeZone ?? 'UTC';
  const raw = items.filter((item) =>
    (SCHEDULE_COMMAND_KINDS as readonly unknown[]).includes(item.kind),
  );
  const read = raw.map(
    (item): { command: ScheduleCommand } | { drop: ScheduleDrop } => {
      const quote = toWords(item.quote, 200);
      const quoted =
        quote && words.includes(` ${toComparable(quote)} `)
          ? (sliceOfCapture(context.captureText ?? '', quote) ?? quote)
          : null;
      if (!quoted) return { drop: 'schedule-unasked' };
      const time = toClock(item.timeSpanId, context.reading, timeZone);
      if (item.kind === 'changeScheduledAction') {
        const actionId =
          typeof item.actionAlias === 'string'
            ? (context.actions?.idOf(item.actionAlias) ?? null)
            : null;
        if (!actionId) return { drop: 'schedule-unknown' };
        const change = SCHEDULE_CHANGES.find((entry) => entry === item.change);
        if (!change) return { drop: 'schedule-shape' };
        const repeat =
          item.repeat === null || item.repeat === undefined
            ? null
            : toRepeat(item.repeat, context.reading);
        if (change === 'reschedule' && repeat === null && time === null) {
          return { drop: 'schedule-shape' };
        }
        return {
          command: {
            kind: 'changeScheduledAction',
            actionId,
            scope:
              SCHEDULE_SCOPES.find((entry) => entry === item.scope) ??
              'thisAndFollowing',
            change,
            fromKey: toDay(item.fromSpanId, context.reading),
            toDay: toDay(item.toSpanId, context.reading),
            time,
            repeat,
            quote: quoted,
          },
        };
      }
      const title = toWords(item.title, SCHEDULE_TITLE_CAP);
      const repeat = toRepeat(item.repeat, context.reading);
      const read = toHeld(item.heldCommands);
      const held = read.filter(
        (entry) => entry.kind === 'createTask' && entry.title !== null,
      );
      const instruction = toWords(item.instruction, SCHEDULE_INSTRUCTION_CAP);
      const asked = (
        Array.isArray(item.allowedKinds) ? item.allowedKinds : []
      ).filter((kind): kind is string => typeof kind === 'string');
      if ([...read.map((entry) => entry.kind), ...asked].some(isOutbound)) {
        return { drop: 'schedule-outbound' };
      }
      if (!title || !repeat || (held.length === 0 && !instruction)) {
        return { drop: 'schedule-shape' };
      }
      return {
        command: {
          kind: 'scheduleAction',
          title,
          repeat,
          startsOn: toDay(item.startsSpanId, context.reading),
          time,
          times: allClocks(context.reading, timeZone),
          instruction: held.length > 0 ? null : instruction,
          held,
          allowedKinds:
            held.length > 0
              ? [...new Set(held.map((entry) => entry.kind))]
              : (asked.length > 0 ? asked : [...SCHEDULED_OWN_KINDS]).filter(
                  (kind) =>
                    (SCHEDULED_OWN_KINDS as readonly string[]).includes(kind),
                ),
          quote: quoted,
        },
      };
    },
  );
  const kept = read.flatMap((entry) =>
    'command' in entry ? [entry.command] : [],
  );
  return {
    commands: kept.slice(0, MAX_SCHEDULE_COMMANDS_PER_TURN),
    dropped: [
      ...read.flatMap((entry) => ('drop' in entry ? [entry.drop] : [])),
      ...(kept.length > MAX_SCHEDULE_COMMANDS_PER_TURN
        ? (['schedule-extra'] as const)
        : []),
    ],
  };
};
