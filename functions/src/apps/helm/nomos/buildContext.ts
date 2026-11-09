import { createAliasBook, type AliasBook } from './aliases.js';
import type { CaptureReading, TaskDue, Token } from './commands.js';
import { MAX_CAPTURE_CHARS, MAX_CONTEXT_TASKS } from './prompt.js';

export interface ContextTask {
  id: string;
  title: string;
  due: TaskDue | null;
}

export interface ContextInput {
  text: string;
  reading: CaptureReading;
  createdAt: number;
  timeZone: string;
  tasks: ContextTask[];
}

/** JSON that cannot close a data block early: a typed `</capture>` stays inside its string. */
const toDataJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

export const describeDue = (due: TaskDue | null) => {
  if (!due) return null;
  return due.kind === 'day'
    ? new Date(due.date).toISOString().slice(0, 10)
    : new Date(due.at).toISOString();
};

const toKnownZone = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions()
      .timeZone;
  } catch {
    return 'UTC';
  }
};

const describeNow = (at: number, timeZone: string) => {
  const zone = toKnownZone(timeZone);
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(at));
  return { timeZone: zone, saidAt: new Date(at).toISOString(), local };
};

const toTokenView = (token: Token) => ({ id: token.id, text: token.text });

const withoutAddress = (text: string, reading: CaptureReading) => {
  const address = reading.addressedAs;
  if (!address) return text;
  return text.slice(address.end).replace(/^\s*,\s*/, '');
};

/** The whole of what the model is told about this capture. Records come as aliases; no id, no uid. */
export function buildContext(input: ContextInput): {
  message: string;
  aliases: AliasBook;
} {
  const aliases = createAliasBook('t');
  const tasks = input.tasks.slice(0, MAX_CONTEXT_TASKS).map((task) => ({
    alias: aliases.add(task.id),
    title: task.title,
    due: describeDue(task.due),
  }));
  const { reading } = input;
  const text = withoutAddress(input.text, reading).slice(0, MAX_CAPTURE_CHARS);
  const message = [
    `<context>${toDataJson(describeNow(input.createdAt, input.timeZone))}</context>`,
    `<reading>${toDataJson({
      people: reading.people.map(toTokenView),
      places: reading.places.map(toTokenView),
      documents: reading.documents.map(toTokenView),
      isUrgent: reading.isUrgent,
      dates: reading.dates.map((span) => ({
        ...toTokenView(span),
        due: describeDue(span.due),
      })),
    })}</reading>`,
    `<open_tasks>${toDataJson(tasks)}</open_tasks>`,
    `<capture>${toDataJson(text)}</capture>`,
  ].join('\n');
  return { message, aliases };
}
