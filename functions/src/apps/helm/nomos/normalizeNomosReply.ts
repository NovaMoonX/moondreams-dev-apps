import type { AliasBook, SyncedBook } from './aliases.js';
import {
  ANSWER_SCOPES,
  ANSWER_SPOKEN_CAP,
  ANSWER_TEXT_CAP,
  COMMAND_KINDS,
  MAX_COMMANDS,
  QUESTION_CAP,
  TITLE_CAP,
  type AnswerCommand,
  type CaptureReading,
  type SourceRef,
  type NomosCommand,
  type TaskDue,
} from './commands.js';

export type NomosReplyErrorCode =
  'badShape' | 'unknownAlias' | 'droppedToken' | 'badDate';

/** A reply that can't be trusted: the capture goes back to be read again, never filed in part. */
export class NomosReplyError extends Error {
  constructor(readonly code: NomosReplyErrorCode) {
    super(code);
  }
}

const KNOWN_KEYS = new Set([
  'kind',
  'ref',
  'taskAlias',
  'title',
  'dueSpanId',
  'isUrgent',
  'scope',
  'question',
  'isHealth',
  'fromRecordsText',
  'sourceAliases',
  'generalText',
  'generalSpoken',
]);
const DATE_KEY_RE = /due|date|time|when|deadline|day/i;
const NEW_REF_RE = /^\$new\d+$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const cutAtWord = (text: string, cap: number) => {
  if (text.length <= cap) return text;
  const cut = text.slice(0, cap);
  const space = cut.lastIndexOf(' ');
  return (space > cap / 2 ? cut.slice(0, space) : cut).trim();
};

const toTitle = (value: unknown) =>
  typeof value === 'string'
    ? cutAtWord(value.replace(/\s+/g, ' ').trim(), TITLE_CAP) || null
    : null;

const toDue = (value: unknown, reading: CaptureReading): TaskDue | null => {
  if (value === null || value === undefined) return null;
  const span =
    typeof value === 'string'
      ? reading.dates.find((entry) => entry.id === value)
      : undefined;
  if (!span) throw new NomosReplyError('badDate');
  return span.due;
};

const assertNoDateKeys = (item: Record<string, unknown>) => {
  if (
    Object.keys(item).some(
      (key) => !KNOWN_KEYS.has(key) && DATE_KEY_RE.test(key),
    )
  ) {
    throw new NomosReplyError('badDate');
  }
};

const toText = (value: unknown, cap: number) =>
  typeof value === 'string'
    ? cutAtWord(value.replace(/\s+/g, ' ').trim(), cap) || null
    : null;

const toSource = (
  alias: unknown,
  aliases: AliasBook,
  synced: SyncedBook | undefined,
): SourceRef | null => {
  if (typeof alias !== 'string') return null;
  const taskId = aliases.idOf(alias);
  if (taskId) return { kind: 'task', id: taskId };
  const copy = synced?.get(alias);
  if (copy)
    return {
      kind: 'synced',
      id: copy.id,
      connectorId: copy.connectorId,
      title: copy.title,
      startAt: copy.startAt,
    };
  const connection = synced?.getConnection(alias);
  return connection ? { kind: 'connection', ...connection } : null;
};

const readAnswer = (
  item: Record<string, unknown>,
  aliases: AliasBook,
  synced: SyncedBook | undefined,
): AnswerCommand | null => {
  const scope = ANSWER_SCOPES.find((entry) => entry === item.scope);
  const question = toText(item.question, QUESTION_CAP);
  if (!scope || !question) return null;
  const listed = Array.isArray(item.sourceAliases) ? item.sourceAliases : [];
  return {
    scope,
    question,
    isHealth: item.isHealth === true,
    fromRecordsText: toText(item.fromRecordsText, ANSWER_TEXT_CAP),
    sources: listed.flatMap((alias: unknown) => {
      const source = toSource(alias, aliases, synced);
      return source ? [source] : [];
    }),
    generalText: toText(item.generalText, ANSWER_TEXT_CAP),
    generalSpoken: toText(item.generalSpoken, ANSWER_SPOKEN_CAP),
  };
};

const readCommand = (
  item: Record<string, unknown>,
  state: { refs: Set<string> },
  reading: CaptureReading,
  aliases: AliasBook,
): NomosCommand | null => {
  const kind = COMMAND_KINDS.find((entry) => entry === item.kind);
  if (!kind) return null;
  const title = toTitle(item.title);
  const due = toDue(item.dueSpanId, reading);
  const isUrgent = typeof item.isUrgent === 'boolean' ? item.isUrgent : null;

  if (kind === 'createTask') {
    if (!title) return null;
    const wanted = typeof item.ref === 'string' ? item.ref : '';
    const ref =
      NEW_REF_RE.test(wanted) && !state.refs.has(wanted)
        ? wanted
        : `$new${state.refs.size + 1}`;
    state.refs.add(ref);
    return {
      kind,
      ref,
      title,
      due,
      isUrgent: isUrgent ?? reading.isUrgent,
    };
  }

  const alias = typeof item.taskAlias === 'string' ? item.taskAlias : '';
  const taskId = state.refs.has(alias) ? alias : aliases.idOf(alias);
  if (!taskId) throw new NomosReplyError('unknownAlias');
  if (kind === 'completeTask') return { kind, taskId };
  const hasDue = item.dueSpanId !== null && item.dueSpanId !== undefined;
  if (!title && !hasDue && isUrgent === null) return null;
  return { kind, taskId, title, due, hasDue, isUrgent };
};

const toKey = (title: string) => title.trim().toLowerCase();

const hasEveryToken = (
  commands: NomosCommand[],
  reading: CaptureReading,
  madeTitles: string[],
) => {
  const titles = commands.flatMap((command) =>
    'title' in command && command.title ? [command.title.toLowerCase()] : [],
  );
  if (titles.length === 0) return true;
  const made = madeTitles.map((title) => title.toLowerCase());
  return [...reading.people, ...reading.places, ...reading.documents]
    .filter(
      (token) =>
        !made.some((title) => title.includes(token.text.toLowerCase())),
    )
    .every((token) =>
      titles.some((title) => title.includes(token.text.toLowerCase())),
    );
};

/** Turns the model's reply into commands code can run, or refuses it: every alias must be one offered, every day one the reading made, every @ # ^ name kept. Only the first answer is kept, each source alias resolved or dropped. A sound reply with nothing in it is `[]`; one past the cap files the first `MAX_COMMANDS` and says `hasMore`. With `alreadyMade`, a task whose title is already there is dropped and the names already in those titles are not required again. */
export function normalizeNomosReply(
  raw: unknown,
  context: {
    reading: CaptureReading;
    aliases: AliasBook;
    synced?: SyncedBook;
    alreadyMade?: string[];
  },
): {
  commands: NomosCommand[];
  hasMore: boolean;
  answer: AnswerCommand | null;
} {
  if (!isRecord(raw) || !Array.isArray(raw.commands)) {
    throw new NomosReplyError('badShape');
  }
  const state = { refs: new Set<string>() };
  const made = new Set((context.alreadyMade ?? []).map(toKey));
  const items = raw.commands.filter(isRecord);
  items.forEach(assertNoDateKeys);
  const answer =
    items
      .filter((item) => item.kind === 'answer')
      .flatMap((item) => {
        const read = readAnswer(item, context.aliases, context.synced);
        return read ? [read] : [];
      })[0] ?? null;
  const read = items.flatMap((item) => {
    const command = readCommand(item, state, context.reading, context.aliases);
    return command ? [command] : [];
  });
  const fresh = read.filter(
    (command) =>
      command.kind !== 'createTask' || !made.has(toKey(command.title)),
  );
  if (!hasEveryToken(fresh, context.reading, context.alreadyMade ?? [])) {
    throw new NomosReplyError('droppedToken');
  }
  return {
    commands: fresh.slice(0, MAX_COMMANDS),
    hasMore: fresh.length > MAX_COMMANDS,
    answer,
  };
}
