import type { TaskDue } from './commands.js';
import { summarize, type EffectCounts } from './summaries.js';

export const SPOKEN_MAX_CHARS = 280;
const DAY_MS = 86_400_000;

export interface SpokenAckInput {
  inputMode: string | undefined;
  counts: EffectCounts;
  messageCount: number;
  /** The tasks this reply made, in order, with the day or moment each was given. */
  created: { title: string; due: TaskDue | null }[];
  timeZone: string;
  now: number;
}

/** The calendar day an instant falls on in `timeZone`, as UTC midnight so two days subtract cleanly. */
export const getDayIn = (at: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return Date.parse(`${parts}T00:00:00Z`);
};

export const toKnownZone = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return 'UTC';
  }
};

/** "today", "tomorrow", "on Friday" within the week, otherwise "on November 13"; a moment adds "at 9 AM". A day-only due reads in UTC, a moment in the person's zone. */
const describeWhen = (due: TaskDue, timeZone: string, now: number) => {
  const zone = toKnownZone(timeZone);
  const day = due.kind === 'day' ? due.date : getDayIn(due.at, zone);
  const away = Math.round((day - getDayIn(now, zone)) / DAY_MS);
  const label =
    away === 0
      ? 'today'
      : away === 1
        ? 'tomorrow'
        : away > 1 && away < 7
          ? `on ${new Date(day).toLocaleDateString('en-US', {
              timeZone: 'UTC',
              weekday: 'long',
            })}`
          : `on ${new Date(day).toLocaleDateString('en-US', {
              timeZone: 'UTC',
              month: 'long',
              day: 'numeric',
              ...(new Date(day).getUTCFullYear() ===
              new Date(getDayIn(now, zone)).getUTCFullYear()
                ? {}
                : { year: 'numeric' }),
            })}`;
  if (due.kind === 'day') return label;
  const time = new Date(due.at)
    .toLocaleTimeString('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(':00', '');
  return `${label} at ${time}`;
};

const trimEnd = (text: string) => text.trim().replace(/[.!?…]+$/, '');

const limit = (line: string) =>
  line.length <= SPOKEN_MAX_CHARS
    ? line
    : `${line.slice(0, SPOKEN_MAX_CHARS - 2).trimEnd()}…`;

/** The short line said aloud after a spoken turn is filed, built by code from what was done: no name, no tone. Typed turns get null. */
export function buildSpokenAck(input: SpokenAckInput): string | null {
  if (input.inputMode !== 'voice') return null;
  const summary = summarize(input.counts, input.messageCount);
  if (!summary) return null;
  if (input.messageCount > 1) return limit(`${trimEnd(summary)}.`);
  const [only] = input.created;
  const isOneTask =
    input.created.length === 1 &&
    input.counts.made === 1 &&
    input.counts.updated === 0 &&
    input.counts.completed === 0;
  if (!isOneTask || !trimEnd(only.title)) {
    return limit(`Got it. ${trimEnd(summary)}.`);
  }
  // No comma before the day: a voice pauses at one, so "Call Dana, Friday" reads as two thoughts.
  const when = only.due
    ? ` ${describeWhen(only.due, input.timeZone, input.now)}`
    : '';
  return limit(`Got it. ${trimEnd(only.title)}${when}.`);
}
