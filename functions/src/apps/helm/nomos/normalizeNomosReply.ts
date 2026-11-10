import type { AliasBook, QuoteBook, SyncedBook } from './aliases.js';
import {
  ANSWER_SCOPES,
  ANSWER_SPOKEN_CAP,
  ANSWER_TEXT_CAP,
  COMMAND_KINDS,
  MAX_COMMANDS,
  MAX_MENTIONS,
  MAX_PLACES,
  MAX_QUOTES,
  MENTION_KINDS,
  NAME_CAP,
  PLAN_DAY_AHEAD,
  QUESTION_CAP,
  REMEMBER_FIELDS,
  STATEMENT_CAP,
  TITLE_CAP,
  VALUE_CAP,
  type AnswerCommand,
  type CaptureReading,
  type MentionRead,
  type PlaceRead,
  type PlanDayCommand,
  type RememberCommand,
  type SourceRef,
  type NomosCommand,
  type TaskDue,
} from './commands.js';
import { getDayIn, toKnownZone } from './spoken.js';

const DAY_MS = 86_400_000;

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
  'quoteAliases',
  'generalText',
  'generalSpoken',
  'statement',
  'quoteAlias',
  'aboutAlias',
  'aboutField',
  'value',
  'whoRefs',
  'placeRefs',
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

const toQuote = (alias: unknown, quotes: QuoteBook | undefined) =>
  typeof alias === 'string' ? (quotes?.get(alias) ?? null) : null;

const readAnswer = (
  item: Record<string, unknown>,
  aliases: AliasBook,
  synced: SyncedBook | undefined,
  quotes: QuoteBook | undefined,
): AnswerCommand | null => {
  const scope = ANSWER_SCOPES.find((entry) => entry === item.scope);
  const question = toText(item.question, QUESTION_CAP);
  if (!scope || !question) return null;
  const listed = Array.isArray(item.sourceAliases) ? item.sourceAliases : [];
  const listedQuotes = Array.isArray(item.quoteAliases)
    ? item.quoteAliases.slice(0, MAX_QUOTES)
    : [];
  return {
    scope,
    question,
    isHealth: item.isHealth === true,
    fromRecordsText: toText(item.fromRecordsText, ANSWER_TEXT_CAP),
    sources: listed.flatMap((alias: unknown) => {
      const source = toSource(alias, aliases, synced);
      return source ? [source] : [];
    }),
    quotes: listedQuotes.flatMap((alias: unknown) => {
      const quote = toQuote(alias, quotes);
      return quote ? [quote] : [];
    }),
    syncedKeys: listed.flatMap((alias: unknown) => {
      const copy = typeof alias === 'string' ? synced?.get(alias) : null;
      return copy ? [`${copy.connectorId}|${copy.accountId}`] : [];
    }),
    generalText: toText(item.generalText, ANSWER_TEXT_CAP),
    generalSpoken: toText(item.generalSpoken, ANSWER_SPOKEN_CAP),
  };
};

const readRemember = (
  item: Record<string, unknown>,
  synced: SyncedBook | undefined,
  quotes: QuoteBook | undefined,
): RememberCommand => ({
  statement: toText(item.statement, STATEMENT_CAP),
  quote: toQuote(item.quoteAlias, quotes),
  about:
    typeof item.aboutAlias === 'string'
      ? (synced?.get(item.aboutAlias) ?? null)
      : null,
  aboutField:
    REMEMBER_FIELDS.find((field) => field === item.aboutField) ?? null,
  value: toText(item.value, VALUE_CAP),
});

/** An unknown span drops only the plan request, never the rest of the reply. */
const readPlanDue = (value: unknown, reading: CaptureReading) => {
  try {
    return { due: toDue(value, reading) };
  } catch (error) {
    if (error instanceof NomosReplyError && error.code === 'badDate') {
      return null;
    }
    throw error;
  }
};

const readPlanDay = (
  item: Record<string, unknown>,
  reading: CaptureReading,
  now: number,
  timeZone: string,
): PlanDayCommand | null => {
  const read = readPlanDue(item.dueSpanId, reading);
  if (!read) return null;
  const { due } = read;
  const today = getDayIn(now, toKnownZone(timeZone));
  const date = due
    ? due.kind === 'day'
      ? due.date
      : getDayIn(due.at, toKnownZone(timeZone))
    : today;
  return date < today || date > today + PLAN_DAY_AHEAD * DAY_MS
    ? null
    : { kind: 'planDay', date: { kind: 'day', date } };
};

const toKeyName = (name: string) => name.toLowerCase();

const toName = (value: unknown) => {
  const text = toText(value, NAME_CAP);
  return text ? text.replace(/['\u2019]s$/i, '').trim() || null : null;
};

const toNextRef = (prefix: string, used: Set<string>) =>
  `${prefix}${used.size + 1}`;

interface Entities {
  mentions: MentionRead[];
  places: PlaceRead[];
  whoRefs: Map<string, string>;
  placeRefs: Map<string, string>;
}

/** Reads the people, pets, organizations and places the reply names; a repeat of one name folds into the first, and every @ person and # place of the reading is there whether the model listed it or not. */
const readEntities = (
  raw: Record<string, unknown>,
  reading: CaptureReading,
): Entities => {
  const mentions: MentionRead[] = [];
  const places: PlaceRead[] = [];
  const whoRefs = new Map<string, string>();
  const placeRefs = new Map<string, string>();
  const addMention = (
    wanted: string | null,
    draft: Omit<MentionRead, 'ref'>,
  ) => {
    const same = mentions.find(
      (entry) =>
        entry.kind === draft.kind &&
        toKeyName(entry.name) === toKeyName(draft.name),
    );
    if (same) {
      if (wanted) whoRefs.set(wanted, same.ref);
      return;
    }
    if (mentions.length >= MAX_MENTIONS) return;
    const ref = toNextRef('$w', new Set(mentions.map((entry) => entry.ref)));
    mentions.push({ ref, ...draft });
    if (wanted) whoRefs.set(wanted, ref);
  };
  const addPlace = (wanted: string | null, name: string) => {
    const same = places.find(
      (entry) => toKeyName(entry.name) === toKeyName(name),
    );
    if (same) {
      if (wanted) placeRefs.set(wanted, same.ref);
      return;
    }
    if (places.length >= MAX_PLACES) return;
    const ref = toNextRef('$p', new Set(places.map((entry) => entry.ref)));
    places.push({ ref, name });
    if (wanted) placeRefs.set(wanted, ref);
  };
  (Array.isArray(raw.mentions) ? raw.mentions.filter(isRecord) : []).forEach(
    (item) => {
      const kind = MENTION_KINDS.find((entry) => entry === item.kind);
      const name = toName(item.name);
      if (!kind || !name) return;
      addMention(typeof item.ref === 'string' ? item.ref : null, {
        name,
        kind,
        relation: toText(item.relation, NAME_CAP),
        species: kind === 'pet' ? toText(item.species, NAME_CAP) : null,
        organizationKind:
          kind === 'organization'
            ? toText(item.organizationKind, NAME_CAP)
            : null,
      });
    },
  );
  (Array.isArray(raw.places) ? raw.places.filter(isRecord) : []).forEach(
    (item) => {
      const name = toName(item.name);
      if (name) addPlace(typeof item.ref === 'string' ? item.ref : null, name);
    },
  );
  reading.people.forEach((token) => {
    const name = toName(token.text.replace(/^@/, ''));
    if (!name) return;
    addMention(null, {
      name,
      kind: 'person',
      relation: null,
      species: null,
      organizationKind: null,
    });
  });
  reading.places.forEach((token) => {
    const name = toName(token.text.replace(/^#/, ''));
    if (name) addPlace(null, name);
  });
  return { mentions, places, whoRefs, placeRefs };
};

const toRefs = (value: unknown, known: Map<string, string>) => [
  ...new Set(
    (Array.isArray(value) ? value : []).flatMap((ref: unknown) => {
      const settled = typeof ref === 'string' ? known.get(ref) : undefined;
      return settled ? [settled] : [];
    }),
  ),
];

const readLinks = (
  item: Record<string, unknown>,
  title: string | null,
  reading: CaptureReading,
  entities: Entities,
) => {
  const inTitle = (text: string) =>
    title !== null && title.toLowerCase().includes(text.toLowerCase());
  const named = <T extends { ref: string; name: string }>(
    tokens: { text: string }[],
    entries: T[],
  ) =>
    tokens.flatMap((token) => {
      const entry = entries.find(
        (candidate) =>
          toKeyName(candidate.name) ===
          toKeyName(toName(token.text.replace(/^[@#]/, '')) ?? ''),
      );
      return entry && inTitle(token.text) ? [entry.ref] : [];
    });
  return {
    whoRefs: [
      ...new Set([
        ...toRefs(item.whoRefs, entities.whoRefs),
        ...named(reading.people, entities.mentions),
      ]),
    ],
    placeRefs: [
      ...new Set([
        ...toRefs(item.placeRefs, entities.placeRefs),
        ...named(reading.places, entities.places),
      ]),
    ],
  };
};

const readCommand = (
  item: Record<string, unknown>,
  state: { refs: Set<string> },
  reading: CaptureReading,
  aliases: AliasBook,
  entities: Entities,
): NomosCommand | null => {
  const kind = COMMAND_KINDS.find((entry) => entry === item.kind);
  if (!kind || kind === 'remember' || kind === 'planDay') return null;
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
      ...readLinks(item, title, reading, entities),
    };
  }

  const alias = typeof item.taskAlias === 'string' ? item.taskAlias : '';
  const taskId = state.refs.has(alias) ? alias : aliases.idOf(alias);
  if (!taskId) throw new NomosReplyError('unknownAlias');
  if (kind === 'completeTask') return { kind, taskId };
  const hasDue = item.dueSpanId !== null && item.dueSpanId !== undefined;
  if (!title && !hasDue && isUrgent === null) return null;
  return {
    kind,
    taskId,
    title,
    due,
    hasDue,
    isUrgent,
    ...readLinks(item, title, reading, entities),
  };
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

/** Turns the model's reply into commands code can run, or refuses it: every alias must be one offered, every day one the reading made, every @ # ^ name kept. Only the first answer is kept, each source and quote alias resolved or dropped; a `remember` is passed on with its aliases resolved or null, for the guards to judge. A sound reply with nothing in it is `[]`; a `planDay` for today through six days ahead is passed on as one day (a past or farther day is dropped and the rest of the reply kept, a second one is ignored); one past the cap files the first `MAX_COMMANDS` and says `hasMore`. With `alreadyMade`, a task whose title is already there is dropped and the names already in those titles are not required again. */
export function normalizeNomosReply(
  raw: unknown,
  context: {
    reading: CaptureReading;
    aliases: AliasBook;
    synced?: SyncedBook;
    quotes?: QuoteBook;
    alreadyMade?: string[];
    now?: number;
    timeZone?: string;
  },
): {
  commands: NomosCommand[];
  hasMore: boolean;
  answer: AnswerCommand | null;
  remember: RememberCommand[];
  planDay: PlanDayCommand | null;
  mentions: MentionRead[];
  places: PlaceRead[];
} {
  if (!isRecord(raw) || !Array.isArray(raw.commands)) {
    throw new NomosReplyError('badShape');
  }
  const state = { refs: new Set<string>() };
  const entities = readEntities(raw, context.reading);
  const made = new Set((context.alreadyMade ?? []).map(toKey));
  const items = raw.commands.filter(isRecord);
  items.forEach(assertNoDateKeys);
  const answer =
    items
      .filter((item) => item.kind === 'answer')
      .flatMap((item) => {
        const read = readAnswer(
          item,
          context.aliases,
          context.synced,
          context.quotes,
        );
        return read ? [read] : [];
      })[0] ?? null;
  const remember = items
    .filter((item) => item.kind === 'remember')
    .map((item) => readRemember(item, context.synced, context.quotes));
  const planItem = items.find((item) => item.kind === 'planDay');
  const planDay = planItem
    ? readPlanDay(
        planItem,
        context.reading,
        context.now ?? Date.now(),
        context.timeZone ?? 'UTC',
      )
    : null;
  const read = items.flatMap((item) => {
    const command = readCommand(
      item,
      state,
      context.reading,
      context.aliases,
      entities,
    );
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
    remember,
    planDay,
    mentions: entities.mentions,
    places: entities.places,
  };
}
