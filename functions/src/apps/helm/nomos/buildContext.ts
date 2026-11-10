import {
  createAliasBook,
  createSyncedBook,
  type AliasBook,
  type SyncedBook,
} from './aliases.js';
import { toKnownZone, toSyncedView, type SyncedCopy } from '../syncedCopies.js';
import {
  MAX_CONTEXT_PROJECTS,
  type CaptureReading,
  type TaskDue,
  type Token,
} from './commands.js';
import { withoutAddress } from './joinedTurn.js';
import type { ContextKeyDate, ContextUpcoming } from '../keyDateStore.js';
import { MAX_CAPTURE_CHARS, MAX_CONTEXT_TASKS } from './prompt.js';

export interface ContextTask {
  id: string;
  title: string;
  due: TaskDue | null;
}

/** What the records hold about a person, pet, organization or place the turn names; `by` says whether the person said it or the assistant inferred it. */
export interface ContextFact {
  id: string;
  subject: string;
  statement: string;
  by: 'said' | 'inferred';
}

/** What the records hold about the person themself: a preference, a favorite or who they are. */
export interface ContextSelfFact {
  id: string;
  kind: 'preference' | 'favorite' | 'identity';
  topic: string | null;
  value: string | null;
  statement: string;
  by: 'said' | 'inferred';
}

export interface ContextInput {
  text: string;
  /** Each message of a turn made of several, address already stripped. */
  texts?: string[];
  reading: CaptureReading;
  createdAt: number;
  timeZone: string;
  tasks: ContextTask[];
  synced?: SyncedCopy[];
  alreadyMade?: string[];
  screen?: {
    view: string;
    focus: ContextTask | null;
    visible: (ContextTask & { position: number })[];
  } | null;
  earlierTurns?: EarlierTurn[];
  /** For a turn that answers a question the model asked: the question, its choices and the answer in words. */
  answeredQuestion?: string | null;
  facts?: ContextFact[];
  selfFacts?: ContextSelfFact[];
  /** The dates that come back of the people the turn names. */
  keyDates?: ContextKeyDate[];
  /** The next dates that come back, when the turn asks what is coming up. */
  upcoming?: ContextUpcoming[];
  /** The names of the active projects, newest first. */
  projects?: string[];
}

/** A turn said earlier in this conversation: its words, what it did, and the tasks it made or changed. */
export interface EarlierTurn {
  said: string;
  did: string | null;
  taskIds: string[];
}

const MAX_EARLIER_SAID_CHARS = 500;

/** JSON that cannot close a data block early: a typed `</capture>` stays inside its string. */
const toDataJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

export const describeDue = (due: TaskDue | null) => {
  if (!due) return null;
  return due.kind === 'day'
    ? new Date(due.date).toISOString().slice(0, 10)
    : new Date(due.at).toISOString();
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

/** The whole of what the model is told about this capture. Records come as aliases; no id, no uid. */
export function buildContext(input: ContextInput): {
  message: string;
  aliases: AliasBook;
  synced: SyncedBook;
  facts: AliasBook;
  keyDates: AliasBook;
} {
  const aliases = createAliasBook('t');
  const facts = createAliasBook('f');
  const keyDates = createAliasBook('k');
  const synced = createSyncedBook();
  const syncedRecords = (input.synced ?? []).map((copy) => ({
    alias: synced.add(copy),
    ...toSyncedView(copy, toKnownZone(input.timeZone)),
  }));
  const tasks = input.tasks.slice(0, MAX_CONTEXT_TASKS).map((task) => ({
    alias: aliases.add(task.id),
    title: task.title,
    due: describeDue(task.due),
  }));
  const toRef = (task: ContextTask) => ({
    alias: aliases.add(task.id),
    title: task.title,
  });
  const screen = input.screen
    ? {
        view: input.screen.view,
        focus: input.screen.focus ? toRef(input.screen.focus) : null,
        visible: input.screen.visible.map((task) => ({
          position: task.position,
          ...toRef(task),
        })),
      }
    : null;
  const earlierTurns = (input.earlierTurns ?? []).map((turn) => ({
    said: turn.said.slice(0, MAX_EARLIER_SAID_CHARS),
    did: turn.did,
    records: turn.taskIds.map((id) => aliases.add(id)),
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
        due: span.precision ? null : describeDue(span.due),
        precision: span.precision,
      })),
    })}</reading>`,
    `<open_tasks>${toDataJson(tasks)}</open_tasks>`,
    ...(syncedRecords.length
      ? [`<synced_records>${toDataJson(syncedRecords)}</synced_records>`]
      : []),
    ...(screen && (screen.focus || screen.visible.length)
      ? [`<screen>${toDataJson(screen)}</screen>`]
      : []),
    ...(earlierTurns.length
      ? [`<earlier_turns>${toDataJson(earlierTurns)}</earlier_turns>`]
      : []),
    ...(input.answeredQuestion
      ? [
          `<answered_question>${toDataJson(input.answeredQuestion)}</answered_question>`,
        ]
      : []),
    ...(input.facts?.length
      ? [
          `<known_facts>${toDataJson(
            input.facts.map(({ id, ...fact }) => ({
              alias: facts.add(id),
              ...fact,
            })),
          )}</known_facts>`,
        ]
      : []),
    ...(input.selfFacts?.length
      ? [
          `<about_you>${toDataJson(
            input.selfFacts.map(({ id, ...fact }) => ({
              alias: facts.add(id),
              ...fact,
            })),
          )}</about_you>`,
        ]
      : []),
    ...(input.keyDates?.length
      ? [
          `<key_dates>${toDataJson(
            input.keyDates.map(({ id, ...date }) => ({
              alias: keyDates.add(id),
              ...date,
            })),
          )}</key_dates>`,
        ]
      : []),
    ...(input.upcoming?.length
      ? [`<upcoming_dates>${toDataJson(input.upcoming)}</upcoming_dates>`]
      : []),
    ...(input.projects?.length
      ? [
          `<open_projects>${toDataJson(
            input.projects.slice(0, MAX_CONTEXT_PROJECTS),
          )}</open_projects>`,
        ]
      : []),
    ...(input.alreadyMade
      ? [`<already_made>${toDataJson(input.alreadyMade)}</already_made>`]
      : []),
    input.texts && input.texts.length > 1
      ? `<messages>${toDataJson(
          input.texts.map((entry) => entry.slice(0, MAX_CAPTURE_CHARS)),
        )}</messages>`
      : `<capture>${toDataJson(text)}</capture>`,
  ].join('\n');
  return { message, aliases, synced, facts, keyDates };
}

/** The titles of the tasks an Execution made: its readable refs say which effects were creates, its opened record holds their words. */
export function readMadeTitles(
  effectRefs: unknown,
  opened: Record<string, unknown>,
): string[] {
  const refs = Array.isArray(effectRefs) ? effectRefs : [];
  const effects = Array.isArray(opened.effects) ? opened.effects : [];
  return refs.flatMap((ref: unknown, index) => {
    const written = (effects[index] as { written?: Record<string, unknown> })
      ?.written;
    const title = written?.['sealed.title'];
    return (ref as { op?: string })?.op === 'create' &&
      typeof title === 'string'
      ? [title]
      : [];
  });
}
