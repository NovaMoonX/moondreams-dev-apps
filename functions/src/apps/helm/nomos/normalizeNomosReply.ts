import {
  createOptionMatcher,
  toComparable,
} from '../../../vendor/optionMatchUtils.js';
import { withoutClosingPhrases } from '../../../vendor/closingPhrase.js';
import type { AliasBook, QuoteBook, SyncedBook } from './aliases.js';
import { normalizeKin } from './kin.js';
import { KIN_KINDS } from './kinKinds.js';
import { ASK_WORDS } from './summaries.js';
import {
  hasProcedureCue,
  hasProcedureReviseCue,
  hasReviseCue,
  hasRunStartCue,
  hasTickCue,
} from './route.js';
import { MEDIA_CAPTION_CAP } from '../media/mediaCaps.js';
import {
  ANSWER_SCOPES,
  ASK_DATE_MODES,
  ASK_RECORD_KINDS,
  ASK_SHAPES,
  MAX_ASKS,
  NUMBER_LIMIT,
  OPTION_CAP,
  UNIT_CAP,
  type AskCommand,
  type AskOption,
  ANSWER_SPOKEN_CAP,
  REPLY_LINE_CAP,
  DIFFERS_SAYS_CAP,
  ANSWER_TEXT_CAP,
  COMMAND_KINDS,
  FACT_KINDS,
  FACT_QUOTE_CAP,
  MAX_COMMANDS,
  MAX_MEDIA_TARGETS,
  MAX_MEDIA_TOPICS,
  type MediaDecision,
  type MediaTarget,
  MAX_NOTED_FACTS,
  MAX_NOTES_PER_TURN,
  TOPIC_COMMAND_KINDS,
  PROCEDURE_COMMAND_KINDS,
  PROCEDURE_GROUP_NAME_CAP,
  PROCEDURE_STEP_DETAIL_CAP,
  PROCEDURE_STEP_TEXT_CAP,
  PROCEDURE_STEPS_MAX,
  PROCEDURE_SUMMARY_CAP,
  PROCEDURE_TITLE_CAP,
  type ModelProcedureStep,
  type ProcedureCommand,
  MAX_TICKS_PER_TURN,
  RUN_COMMAND_KINDS,
  type RunCommand,
  MAX_PARENT_CHILDREN,
  MAX_TOPIC_ADD_CHARS,
  MAX_TOPIC_ADDS_PER_TURN,
  MIN_PARENT_CHILDREN,
  PARENT_NAME_CAP,
  NOTE_BODY_CAP,
  NOTE_TITLE_CAP,
  NOTE_TOPICS_CAP,
  MAX_KEY_DATES,
  MAX_MILESTONES_PER_TURN,
  MAX_PROJECT_ROLES,
  MILESTONE_TITLE_CAP,
  PROJECT_NAME_CAP,
  PROJECT_OBJECTIVE_CAP,
  PROJECT_ROLE_NOTE_CAP,
  PROJECT_ROLES,
  type ProjectCommand,
  KEY_DATE_KINDS,
  KEY_DATE_LABEL_CAP,
  type KeyDateCommand,
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
  TOPIC_CAP,
  VALUE_CAP,
  type AnswerCommand,
  type CaptureReading,
  type CreateNoteCommand,
  type TopicCommand,
  type MentionRead,
  type NoteFactCommand,
  type PlaceRead,
  type PlanDayCommand,
  type SetCurrentPlaceCommand,
  type RememberCommand,
  type SourceRef,
  type NomosCommand,
  type TaskDue,
} from './commands.js';
import { getDayIn, toKnownZone } from './spoken.js';
import type { ModelChange } from '../topicWrite.js';

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
  'differsFromNoteAlias',
  'differsSays',
  'suggestedTopicAlias',
  'statement',
  'quoteAlias',
  'aboutAlias',
  'aboutField',
  'value',
  'whoRefs',
  'placeRefs',
  'quote',
  'isStated',
  'factKind',
  'topic',
  'isSensitive',
  'isAboutMe',
  'contradicts',
  'keyDateAlias',
  'keyDateKind',
  'keyDateLabel',
  'dateSpanId',
  'comesBack',
  'projectRef',
  'projectEmoji',
  'objective',
  'role',
  'roleNote',
  'bodyQuote',
  'topicAliases',
  'topicAlias',
  'parentAlias',
  'childAliases',
  'noteRef',
  'afterSectionAlias',
  'heading',
  'markdown',
  'changeSummary',
  'requestQuote',
  'topicChanges',
  'procedureAlias',
  'procedureSteps',
  'fromTaskAlias',
  'runStepAliases',
  'shape',
  'prompt',
  'options',
  'allowsSomethingElse',
  'recordKinds',
  'dateMode',
  'numberMin',
  'numberMax',
  'unit',
  'isMoney',
  'decimals',
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
  return span.precision ? null : span.due;
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

const readNumbers = (text: string) =>
  (text.match(/\d(?:[\d,.:]*\d)?/g) ?? []).map((number) =>
    number.replace(/,/g, ''),
  );

/** The model's own line about the turn, refused (so code's line stands) when it speaks as "I", falls back on a template, runs long, carries a link or markup, or names a number the person never said. */
export const readReplyLine = (value: unknown, saidText = '') => {
  if (typeof value !== 'string') return null;
  const line = value.replace(/\s+/g, ' ').trim();
  if (line === '' || line.length > REPLY_LINE_CAP) return null;
  if (/\b(i|i'm|i've|i'll|i'd|me|my)\b|^got it\b/i.test(line)) return null;
  if (/:\/\/|www\.|[*_#`[\]<>]/.test(line)) return null;
  // A count ("Added 2 things") is the line's own; an amount, a time or a date must be the person's.
  const said = new Set(readNumbers(saidText));
  return readNumbers(line)
    .filter((number) => !/^\d$/.test(number))
    .every((number) => said.has(number))
    ? line
    : null;
};

const toCutText = (value: unknown, cap: number) => {
  const whole = toText(value, Number.MAX_SAFE_INTEGER);
  if (!whole || whole.length <= cap) return whole;
  return `${cutAtWord(whole, cap - 1).replace(/[\s.!?,;:]+$/, '')}…`;
};

const toSource = (
  alias: unknown,
  aliases: AliasBook,
  synced: SyncedBook | undefined,
  facts: AliasBook | undefined,
  parts: AliasBook | undefined,
): SourceRef | null => {
  if (typeof alias !== 'string') return null;
  const topicId = parts?.idOf(alias);
  if (topicId) return { kind: 'topic', id: topicId };
  const taskId = aliases.idOf(alias);
  if (taskId) return { kind: 'task', id: taskId };
  const factId = facts?.idOf(alias);
  if (factId) return { kind: 'fact', id: factId };
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
  facts: AliasBook | undefined,
  notes: AliasBook | undefined,
  topics: AliasBook | undefined,
  parts: AliasBook | undefined,
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
      const source = toSource(alias, aliases, synced, facts, parts);
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
    noteIds: [
      ...new Set(
        listed.flatMap((alias: unknown) => {
          const id = typeof alias === 'string' ? notes?.idOf(alias) : null;
          return id ? [id] : [];
        }),
      ),
    ],
    differsFromNoteId:
      typeof item.differsFromNoteAlias === 'string'
        ? (notes?.idOf(item.differsFromNoteAlias) ?? null)
        : null,
    differsSays: toCutText(item.differsSays, DIFFERS_SAYS_CAP),
    suggestedTopicId:
      typeof item.suggestedTopicAlias === 'string'
        ? (topics?.idOf(item.suggestedTopicAlias) ?? null)
        : null,
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

const readNoteFact = (
  item: Record<string, unknown>,
  entities: Entities,
  facts: AliasBook | undefined,
): NoteFactCommand | null => {
  const statement = toText(item.statement, STATEMENT_CAP);
  if (!statement) return null;
  const kind = FACT_KINDS.find((entry) => entry === item.factKind) ?? 'world';
  return {
    statement,
    quote: toText(item.quote, FACT_QUOTE_CAP),
    isStated: item.isStated === true,
    whoRefs: toRefs(item.whoRefs, entities.whoRefs),
    placeRefs: toRefs(item.placeRefs, entities.placeRefs),
    kind,
    topic: toText(item.topic, TOPIC_CAP),
    value: toText(item.value, VALUE_CAP),
    isSensitive:
      item.isSensitive === true ||
      (item.isSensitive == null && kind === 'identity'),
    isAboutMe: item.isAboutMe === true,
    contradicts:
      typeof item.contradicts === 'string'
        ? (facts?.idOf(item.contradicts) ?? null)
        : null,
  };
};

export type NoteDrop = 'notInCapture' | 'isFact';

const readNote = (
  item: Record<string, unknown>,
  topics: AliasBook | undefined,
  captureText: string | undefined,
  captureWords: string,
  spoken: Set<string>,
): CreateNoteCommand | NoteDrop => {
  const words =
    typeof item.bodyQuote === 'string'
      ? item.bodyQuote.trim().slice(0, NOTE_BODY_CAP)
      : '';
  if (
    !words ||
    (captureText !== undefined &&
      !captureWords.includes(` ${toComparable(words)} `))
  ) {
    return 'notInCapture';
  }
  if (spoken.has(toComparable(words))) return 'isFact';
  const firstLine = words.split('\n').find((line) => line.trim()) ?? words;
  return {
    kind: 'createNote',
    title:
      toText(item.title, NOTE_TITLE_CAP) ??
      cutAtWord(firstLine.replace(/\s+/g, ' ').trim(), NOTE_TITLE_CAP),
    body: words,
    topicIds: [
      ...new Set(
        (Array.isArray(item.topicAliases) ? item.topicAliases : []).flatMap(
          (alias: unknown) => {
            const id = typeof alias === 'string' ? topics?.idOf(alias) : null;
            return id ? [id] : [];
          },
        ),
      ),
    ].slice(0, NOTE_TOPICS_CAP),
  };
};

/** A note to keep: its words must be a span of the capture, its topics only ones the person has, and it is dropped when it is only the words of a fact or date said in the same turn. */
const readNotes = (
  items: Record<string, unknown>[],
  topics: AliasBook | undefined,
  captureText: string | undefined,
  said: string[],
): { notes: CreateNoteCommand[]; dropped: NoteDrop[]; itemNos: number[] } => {
  const spoken = new Set(said.map((text) => toComparable(text)));
  const captureWords = ` ${toComparable(captureText ?? '')} `;
  const read = items
    .filter((item) => item.kind === 'createNote')
    .map((item, position) => ({
      entry: readNote(item, topics, captureText, captureWords, spoken),
      no: position + 1,
    }));
  const kept = read
    .filter(
      (row): row is { entry: CreateNoteCommand; no: number } =>
        typeof row.entry !== 'string',
    )
    .slice(0, MAX_NOTES_PER_TURN);
  return {
    notes: kept.map((row) => row.entry),
    itemNos: kept.map((row) => row.no),
    dropped: read.flatMap((row) =>
      typeof row.entry === 'string' ? [row.entry] : [],
    ),
  };
};
const MONTH_WORD_RE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
const YEAR_WORD_RE = /(?<!\d)(?:19|20)\d{2}(?!\d)/;

/** A key date's month, day, year and precision come only from a span; a day needs a month word, and a year or a decade needs the span itself to be coarse. */
const readKeyDateSpan = (
  value: unknown,
  reading: CaptureReading,
  timeZone: string,
) => {
  if (value === null || value === undefined) return null;
  const span =
    typeof value === 'string'
      ? reading.dates.find((entry) => entry.id === value)
      : undefined;
  if (!span) throw new NomosReplyError('badDate');
  const first = new Date(
    span.due.kind === 'day'
      ? span.due.date
      : getDayIn(span.due.at, toKnownZone(timeZone)),
  );
  if (span.precision === 'year' || span.precision === 'decade') {
    return {
      precision: span.precision,
      date: {
        month: null,
        day: null,
        year: first.getUTCFullYear(),
      },
    };
  }
  if (span.precision === 'month') {
    return {
      precision: span.precision,
      date: {
        month: first.getUTCMonth() + 1,
        day: null,
        year: first.getUTCFullYear(),
      },
    };
  }
  if (!MONTH_WORD_RE.test(span.text)) return null;
  const year = YEAR_WORD_RE.exec(span.text);
  return {
    precision: 'day' as const,
    date: {
      month: first.getUTCMonth() + 1,
      day: first.getUTCDate(),
      year: year ? Number(year[0]) : null,
    },
  };
};

/** Whether the words, with every closing phrase taken out, still name the subject: a deleting command rests on this, so "forget it" can never remove anything. */
const isSubjectNamed = (text: string | undefined, names: string[]) => {
  const words = ` ${toComparable(withoutClosingPhrases(text ?? ''))} `;
  return names.some((name) => {
    const comparable = toComparable(name);
    return comparable !== '' && words.includes(` ${comparable} `);
  });
};

const readKeyDate = (
  item: Record<string, unknown>,
  entities: Entities,
  reading: CaptureReading,
  keyDates: AliasBook | undefined,
  timeZone: string,
  isRemovalAsked: (keyDateId: string) => boolean,
): KeyDateCommand | null => {
  const keyDateId =
    typeof item.keyDateAlias === 'string'
      ? (keyDates?.idOf(item.keyDateAlias) ?? null)
      : null;
  if (item.kind === 'removeKeyDate') {
    return keyDateId && isRemovalAsked(keyDateId)
      ? { kind: 'removeKeyDate', keyDateId }
      : null;
  }
  const keyKind = KEY_DATE_KINDS.find((entry) => entry === item.keyDateKind);
  if (!keyKind) return null;
  const read = readKeyDateSpan(item.dateSpanId, reading, timeZone);
  return {
    kind: 'setKeyDate',
    whoRefs: toRefs(item.whoRefs, entities.whoRefs).slice(0, 1),
    isAboutMe: item.isAboutMe === true,
    keyDateId,
    keyKind,
    label: toText(item.keyDateLabel, KEY_DATE_LABEL_CAP),
    date: read?.date ?? null,
    precision: read?.precision ?? null,
    comesBack: typeof item.comesBack === 'boolean' ? item.comesBack : null,
    quote: toText(item.quote, FACT_QUOTE_CAP),
  };
};

const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** The first character the person would see as one emoji, or null. */
const toEmoji = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const first = [...new Intl.Segmenter().segment(value.trim())][0]?.segment;
  return first && EMOJI_RE.test(first) ? first : null;
};

/** A project's date is a day, never a moment or a coarse span; an unknown span drops only the date. */
const readProjectDate = (
  value: unknown,
  reading: CaptureReading,
  timeZone: string,
) => {
  const span =
    typeof value === 'string'
      ? reading.dates.find((entry) => entry.id === value)
      : undefined;
  if (!span || span.precision) return null;
  return span.due.kind === 'day'
    ? span.due.date
    : getDayIn(span.due.at, toKnownZone(timeZone));
};

/** A project to start, a role to give or a milestone to add; null when its words are missing. At most one project, `MAX_PROJECT_ROLES` roles and `MAX_MILESTONES_PER_TURN` milestones. */
const readProjects = (
  items: Record<string, unknown>[],
  entities: Entities,
  reading: CaptureReading,
  timeZone: string,
): ProjectCommand[] => {
  const read = items.flatMap((item): ProjectCommand[] => {
    if (item.kind === 'createProject') {
      const name = toText(item.title, PROJECT_NAME_CAP);
      return name
        ? [
            {
              kind: 'createProject',
              name,
              emoji: toEmoji(item.projectEmoji),
              objective: toText(item.objective, PROJECT_OBJECTIVE_CAP),
              targetDate: readProjectDate(item.dueSpanId, reading, timeZone),
            },
          ]
        : [];
    }
    if (item.kind === 'addMilestone') {
      const projectRef = toText(item.projectRef, PROJECT_NAME_CAP);
      const title = toText(item.title, MILESTONE_TITLE_CAP);
      return projectRef && title
        ? [
            {
              kind: 'addMilestone',
              projectRef,
              title,
              date: readProjectDate(item.dueSpanId, reading, timeZone),
            },
          ]
        : [];
    }
    if (item.kind !== 'setProjectRole') return [];
    const projectRef = toText(item.projectRef, PROJECT_NAME_CAP);
    const role = PROJECT_ROLES.find((entry) => entry === item.role);
    const whoRefs = toRefs(item.whoRefs, entities.whoRefs);
    return projectRef && role && whoRefs.length > 0
      ? [
          {
            kind: 'setProjectRole',
            projectRef,
            whoRefs,
            role,
            note: toText(item.roleNote, PROJECT_ROLE_NOTE_CAP),
          },
        ]
      : [];
  });
  return [
    ...read.filter((command) => command.kind === 'createProject').slice(0, 1),
    ...read
      .filter((command) => command.kind === 'setProjectRole')
      .slice(0, MAX_PROJECT_ROLES),
    ...read
      .filter((command) => command.kind === 'addMilestone')
      .slice(0, MAX_MILESTONES_PER_TURN),
  ];
};

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

export type AskDrop = 'ask-invalid' | 'ask-extra';

/** Resolves a person or place alias the model was offered to the record it stands for. */
export interface RecordBook {
  get: (alias: string) => { collection: 'who' | 'places'; id: string } | null;
}

const MAX_PICK_ONE = 6;
const MAX_PICK_SEVERAL = 8;
const MAX_PICK_RECORD = 6;

const readAskOptions = (
  value: unknown,
  records: RecordBook | undefined,
  reserved: Set<string>,
) => {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value.filter(isRecord) : []).flatMap(
    (item): Omit<AskOption, 'id'>[] => {
      const label = toText(item.label, OPTION_CAP);
      const key = label ? toComparable(label) : '';
      if (!label || !key || reserved.has(key) || seen.has(key)) return [];
      seen.add(key);
      return [
        {
          label,
          detail: toText(item.detail, OPTION_CAP),
          ref:
            typeof item.recordAlias === 'string'
              ? (records?.get(item.recordAlias) ?? null)
              : null,
        },
      ];
    },
  );
};

const toOptionIds = (options: Omit<AskOption, 'id'>[]): AskOption[] =>
  options.map((option, index) => ({ id: `o${index + 1}`, ...option }));

const toLimit = (value: unknown) =>
  value === null || value === undefined
    ? { isValid: true as const, value: null }
    : typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) <= NUMBER_LIMIT
      ? { isValid: true as const, value }
      : { isValid: false as const, value: null };

const readAskNumber = (item: Record<string, unknown>) => {
  const min = toLimit(item.numberMin);
  const max = toLimit(item.numberMax);
  if (!min.isValid || !max.isValid) return null;
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return null;
  }
  const isMoney = item.isMoney === true;
  const decimals: 0 | 1 | 2 =
    item.decimals === 1 || item.decimals === 2 ? item.decimals : 0;
  const toUnits = (value: number | null) =>
    value !== null && isMoney ? Math.round(value * 100) : value;
  return {
    min: toUnits(min.value),
    max: toUnits(max.value),
    unit: toText(item.unit, UNIT_CAP),
    isMoney,
    decimals: isMoney ? (0 as const) : decimals,
  };
};

/** One model-written question checked by its shape; null when it can't be shown (fewer than two choices, an unusable range), and the rest of the reply stands. */
const readAsk = (
  item: Record<string, unknown>,
  aliases: AliasBook,
  records: RecordBook | undefined,
): AskCommand | null => {
  const shape = ASK_SHAPES.find((entry) => entry === item.shape);
  const prompt = toText(item.prompt, QUESTION_CAP);
  if (!shape || !prompt) return null;
  const aboutId =
    typeof item.aboutAlias === 'string' ? aliases.idOf(item.aboutAlias) : null;
  const base = {
    shape,
    prompt,
    allowsSomethingElse: false,
    noneOption: false,
    recordKinds: [] as AskCommand['recordKinds'],
    dateMode: null,
    number: null,
    aboutRef: aboutId ? { collection: 'tasks' as const, id: aboutId } : null,
  };
  if (shape === 'yesNo') {
    return {
      ...base,
      options: [
        { id: 'yes', label: ASK_WORDS.yes, detail: null, ref: null },
        { id: 'no', label: ASK_WORDS.no, detail: null, ref: null },
      ],
    };
  }
  if (shape === 'freeText') return { ...base, options: [] };
  if (shape === 'dateTime') {
    return {
      ...base,
      options: [],
      dateMode:
        ASK_DATE_MODES.find((entry) => entry === item.dateMode) ?? 'dateTime',
    };
  }
  if (shape === 'number') {
    const number = readAskNumber(item);
    return number ? { ...base, options: [], number } : null;
  }
  if (shape === 'pickRecord') {
    const recordKinds = ASK_RECORD_KINDS.filter(
      (kind) =>
        Array.isArray(item.recordKinds) && item.recordKinds.includes(kind),
    );
    if (recordKinds.length === 0) return null;
    const reserved = new Set(
      [ASK_WORDS.none, ASK_WORDS.newWho, ASK_WORDS.newPlace].map((word) =>
        toComparable(word),
      ),
    );
    const resolved = readAskOptions(item.options, records, reserved)
      .filter((option) => option.ref !== null)
      .slice(0, MAX_PICK_RECORD);
    return {
      ...base,
      recordKinds,
      options: [
        ...toOptionIds(resolved),
        {
          id: 'new',
          label:
            recordKinds[0] === 'who' ? ASK_WORDS.newWho : ASK_WORDS.newPlace,
          detail: null,
          ref: null,
        },
      ],
    };
  }
  const isSeveral = shape === 'pickSeveral';
  const reserved = new Set(isSeveral ? [toComparable(ASK_WORDS.none)] : []);
  const options = readAskOptions(item.options, records, reserved).slice(
    0,
    isSeveral ? MAX_PICK_SEVERAL : MAX_PICK_ONE,
  );
  if (options.length < 2) return null;
  return {
    ...base,
    allowsSomethingElse: item.allowsSomethingElse === true,
    noneOption: isSeveral,
    options: [
      ...toOptionIds(options),
      ...(isSeveral
        ? [{ id: 'none', label: ASK_WORDS.none, detail: null, ref: null }]
        : []),
    ],
  };
};

const readAsks = (
  items: Record<string, unknown>[],
  aliases: AliasBook,
  records: RecordBook | undefined,
) => {
  const seen = new Set<string>();
  const read = items
    .filter((item) => item.kind === 'ask')
    .map((item) => readAsk(item, aliases, records));
  const valid = read.flatMap((ask) => {
    const key = ask ? toComparable(ask.prompt) : '';
    if (!ask || seen.has(key)) return [];
    seen.add(key);
    return [ask];
  });
  return {
    asks: valid.slice(0, MAX_ASKS),
    dropped: [
      ...read.flatMap((ask) => (ask ? [] : ['ask-invalid' as AskDrop])),
      ...valid.slice(MAX_ASKS).map(() => 'ask-extra' as AskDrop),
    ],
  };
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
/** "younger brother" for a family word and its order, the name a mention that is only a family word carries. */
const toKinWords = (kin: { kind: string; order: string | null }) =>
  [
    kin.order,
    KIN_KINDS.find((entry) => entry.kind === kin.kind)?.spoken ?? kin.kind,
  ]
    .filter(Boolean)
    .join(' ');

const readEntities = (
  raw: Record<string, unknown>,
  reading: CaptureReading,
  people?: AliasBook,
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
      const kinRef = normalizeKin(item.kinRef);
      const name = toName(item.name) ?? (kinRef ? toKinWords(kinRef) : null);
      if (!kind || !name) return;
      const proposedWhoId =
        !kinRef && isRecord(item.proposedAlias)
          ? (people?.idOf(String(item.proposedAlias.whoAlias)) ?? null)
          : null;
      addMention(typeof item.ref === 'string' ? item.ref : null, {
        name,
        kind: kinRef ? 'person' : kind,
        kin: kinRef ? null : normalizeKin(item.kin),
        kinRef,
        proposedWhoId,
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
      kin: null,
      kinRef: null,
      proposedWhoId: null,
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

/** Taking a thing out of private is kept only when the person's own words, quoted, say so. */
const isQuotedPrivateRelease = (
  item: Record<string, unknown>,
  captureText: string,
) => {
  const quote = toComparable(
    typeof item.requestQuote === 'string' ? item.requestQuote : '',
  );
  return (
    quote.split(' ').filter(Boolean).length >= 2 &&
    ` ${toComparable(captureText)} `.includes(` ${quote} `) &&
    /\b(private|public)\b/.test(quote)
  );
};

const readCommand = (
  item: Record<string, unknown>,
  state: { refs: Set<string> },
  reading: CaptureReading,
  aliases: AliasBook,
  entities: Entities,
  captureText: string,
): NomosCommand | null => {
  const kind = COMMAND_KINDS.find((entry) => entry === item.kind);
  if (
    !kind ||
    kind === 'remember' ||
    kind === 'planDay' ||
    kind === 'setCurrentPlace' ||
    kind === 'noteFact' ||
    kind === 'setKeyDate' ||
    kind === 'removeKeyDate' ||
    kind === 'createProject' ||
    kind === 'setProjectRole' ||
    kind === 'addMilestone' ||
    kind === 'createNote'
  ) {
    return null;
  }
  if (kind === 'setPrivate') {
    const alias = typeof item.taskAlias === 'string' ? item.taskAlias : '';
    const subjectId = state.refs.has(alias) ? alias : aliases.idOf(alias);
    if (!subjectId || typeof item.isPrivate !== 'boolean') return null;
    return item.isPrivate || isQuotedPrivateRelease(item, captureText)
      ? { kind, taskId: subjectId, isPrivate: item.isPrivate }
      : null;
  }
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
      projectRef: toText(item.projectRef, PROJECT_NAME_CAP),
    };
  }

  const alias = typeof item.taskAlias === 'string' ? item.taskAlias : '';
  const taskId = state.refs.has(alias) ? alias : aliases.idOf(alias);
  if (!taskId) throw new NomosReplyError('unknownAlias');
  if (kind === 'completeTask') return { kind, taskId };
  const hasDue = item.dueSpanId !== null && item.dueSpanId !== undefined;
  const links = readLinks(item, title, reading, entities);
  const hasLinks = links.whoRefs.length > 0 || links.placeRefs.length > 0;
  if (!title && !hasDue && isUrgent === null && !hasLinks) return null;
  return { kind, taskId, title, due, hasDue, isUrgent, ...links };
};

export type TopicDrop =
  | 'topic-add-unpaired'
  | 'topic-add-unplaced'
  | 'topic-add-long'
  | 'topic-add-extra'
  | 'topic-revise-unasked'
  | 'topic-revise-unseen'
  | 'topic-revise-empty'
  | 'topic-move-unresolved'
  | 'topic-move-unasked'
  | 'topic-group-unresolved';

const GROUP_VERBS = new Set(['put', 'group', 'move']);
const NAME_WINDOW = 4;

/** Whether the words name a topic: its name, or a close spelling of it, as a run of the turn's own words. */
export const isNamedIn = (text: string, name: string) => {
  const words = toComparable(text).split(' ').filter(Boolean).slice(0, 400);
  const matcher = createOptionMatcher<string>();
  return words.some((_, start) =>
    Array.from({ length: NAME_WINDOW }, (__, size) =>
      words.slice(start, start + size + 1).join(' '),
    ).some((run) => matcher.match(run, [name]) !== null),
  );
};

const MOVE_VERBS = new Set(['put', 'move', 'moved', 'nest', 'file']);

const hasMoveVerb = (text: string) =>
  toComparable(text)
    .split(' ')
    .some((word) => MOVE_VERBS.has(word));

/** Whether the person asked to group topics: "put" or "move" with the new parent's name, or "group" / "make a topic" with the parent's name or every child's name in the same words. */
export const isGroupingAsked = (
  text: string,
  name: string,
  childNames: string[],
) => {
  const words = toComparable(text).split(' ');
  const comparable = words.join(' ');
  const hasGroupVerb =
    words.includes('group') ||
    /\bmake a topic (of|for|from)\b/.test(comparable);
  const hasPutVerb = words.some((word) => GROUP_VERBS.has(word));
  const isParentNamed = isNamedIn(text, name);
  return (
    ((hasPutVerb || hasGroupVerb) && isParentNamed) ||
    (hasGroupVerb &&
      childNames.length > 0 &&
      childNames.every((childName) => isNamedIn(text, childName)))
  );
};

interface TopicReadContext {
  topics?: AliasBook;
  sections?: AliasBook;
  topicNames?: Map<string, string>;
  focusedTopicId?: string | null;
  topicVersions?: Map<string, number>;
  captureText?: string;
  notes: CreateNoteCommand[];
  noteItemNos: number[];
}

const toChange = (
  item: unknown,
  sections: AliasBook | undefined,
): ModelChange => {
  const raw = (isRecord(item) ? item : {}) as Record<string, unknown>;
  const idOf = (alias: unknown) =>
    typeof alias === 'string' ? (sections?.idOf(alias) ?? '') : '';
  return {
    kind: typeof raw.kind === 'string' ? raw.kind : '',
    sectionId: raw.sectionAlias == null ? null : idOf(raw.sectionAlias),
    sectionIds: Array.isArray(raw.sectionAliases)
      ? raw.sectionAliases.map(idOf)
      : [],
    afterSectionId: null,
    heading: typeof raw.heading === 'string' ? raw.heading : null,
    level: typeof raw.level === 'number' ? raw.level : null,
    markdown: typeof raw.markdown === 'string' ? raw.markdown : null,
    noteIds: [],
  };
};

/** The topic commands of a reply, each checked against the turn: a part is added only from a note the turn makes into the same topic, a revision only on words that ask for it, a parent only when asked and otherwise passed on as a proposal. Every drop is named. */
const readTopicCommands = (
  items: Record<string, unknown>[],
  context: TopicReadContext,
): { commands: TopicCommand[]; dropped: TopicDrop[] } => {
  const text = context.captureText ?? '';
  const captureWords = ` ${toComparable(text)} `;
  const names = context.topicNames ?? new Map<string, string>();
  const topicOf = (alias: unknown) =>
    typeof alias === 'string' ? (context.topics?.idOf(alias) ?? null) : null;
  const rows = items.flatMap((item) =>
    (TOPIC_COMMAND_KINDS as readonly unknown[]).includes(item.kind)
      ? [item]
      : [],
  );
  const read = rows.reduce<{
    commands: TopicCommand[];
    dropped: TopicDrop[];
  }>(
    (acc, item) => {
      const drop = (code: TopicDrop) => ({
        ...acc,
        dropped: [...acc.dropped, code],
      });
      const keep = (command: TopicCommand) => ({
        ...acc,
        commands: [...acc.commands, command],
      });
      const topicId = topicOf(item.topicAlias);
      if (item.kind === 'addToTopic') {
        const no = Number(
          typeof item.noteRef === 'string'
            ? item.noteRef.match(/^\$note(\d+)$/)?.[1]
            : NaN,
        );
        const at = context.noteItemNos.indexOf(no);
        const note = at >= 0 ? context.notes[at] : undefined;
        const markdown =
          typeof item.markdown === 'string' ? item.markdown.trim() : '';
        const adds = acc.commands.filter((c) => c.kind === 'addToTopic');
        if (
          !topicId ||
          !note ||
          note.topicIds.length !== 1 ||
          note.topicIds[0] !== topicId ||
          markdown === ''
        ) {
          return drop('topic-add-unpaired');
        }
        if (markdown.length > MAX_TOPIC_ADD_CHARS)
          return drop('topic-add-long');
        if (
          adds.length >= MAX_TOPIC_ADDS_PER_TURN ||
          adds.some((add) => add.topicId === topicId)
        ) {
          return drop('topic-add-extra');
        }
        const after =
          typeof item.afterSectionAlias === 'string'
            ? (context.sections?.idOf(item.afterSectionAlias) ?? null)
            : null;
        if (typeof item.afterSectionAlias === 'string' && after === null) {
          return drop('topic-add-unplaced');
        }
        return keep({
          kind: 'addToTopic',
          topicId,
          noteIndex: at,
          afterSectionId: after,
          heading: toText(item.heading, 80),
          markdown,
        });
      }
      if (item.kind === 'reviseTopic') {
        const quote =
          typeof item.requestQuote === 'string' ? item.requestQuote.trim() : '';
        const isQuoted =
          toComparable(quote).split(' ').filter(Boolean).length >= 2 &&
          hasReviseCue(quote) &&
          captureWords.includes(` ${toComparable(quote)} `);
        const name = topicId ? names.get(topicId) : undefined;
        const isAsked =
          topicId !== null &&
          (topicId === context.focusedTopicId ||
            (name !== undefined && isNamedIn(text, name)));
        if (!topicId || !isQuoted || !isAsked) {
          return drop('topic-revise-unasked');
        }
        const seen = context.topicVersions?.get(topicId);
        const changes = (
          Array.isArray(item.topicChanges) ? item.topicChanges : []
        ).map((change) => toChange(change, context.sections));
        if (seen === undefined) return drop('topic-revise-unseen');
        if (
          changes.length === 0 ||
          acc.commands.some((command) => command.kind === 'reviseTopic')
        ) {
          return drop('topic-revise-empty');
        }
        return keep({
          kind: 'reviseTopic',
          topicId,
          changes,
          changeSummary: (toText(item.changeSummary, 200) ?? '').trim(),
          requestQuote: quote,
          seenVersion: seen,
        });
      }
      if (item.kind === 'moveTopic') {
        const parentId =
          item.parentAlias == null ? null : topicOf(item.parentAlias);
        if (!topicId || (item.parentAlias != null && !parentId)) {
          return drop('topic-move-unresolved');
        }
        const movedName = names.get(topicId);
        if (
          !hasMoveVerb(text) ||
          movedName === undefined ||
          !isNamedIn(text, movedName)
        ) {
          return drop('topic-move-unasked');
        }
        return parentId === topicId
          ? drop('topic-move-unresolved')
          : keep({ kind: 'moveTopic', topicId, parentId });
      }
      const name = toText(item.title, PARENT_NAME_CAP);
      const childIds = [
        ...new Set(
          (Array.isArray(item.childAliases) ? item.childAliases : []).flatMap(
            (alias: unknown) => {
              const id = topicOf(alias);
              return id ? [id] : [];
            },
          ),
        ),
      ];
      if (
        !name ||
        childIds.length < MIN_PARENT_CHILDREN ||
        childIds.length > MAX_PARENT_CHILDREN
      ) {
        return drop('topic-group-unresolved');
      }
      return keep({
        kind: 'createParentTopic',
        name,
        childIds,
        isAsked: isGroupingAsked(
          text,
          name,
          childIds.map((id) => names.get(id) ?? ''),
        ),
      });
    },
    { commands: [], dropped: [] },
  );
  return read;
};

export type ProcedureDrop =
  | 'procedure-create-unasked'
  | 'procedure-create-empty'
  | 'procedure-create-extra'
  | 'procedure-create-task-unknown'
  | 'procedure-create-exists'
  | 'procedure-revise-unasked'
  | 'procedure-revise-unseen'
  | 'procedure-revise-empty';

const MAX_PROCEDURE_CREATES_PER_TURN = 3;
const MAKING_WORD_RE =
  /\b(make|create|build|start|new|set up|save|keep|turn)\b/;
const MAKE_THESE_A_PROCEDURE_RE =
  /\bmake (this|these|it|them|the steps)\b.*\b(routine|procedure)\b/;

interface ProcedureReadContext {
  aliases: AliasBook;
  procedures?: AliasBook;
  procedureSteps?: AliasBook;
  procedureNames?: Map<string, string>;
  focusedProcedureId?: string | null;
  focusedTaskId?: string | null;
  procedureTitleByTask?: Map<string, string>;
  procedureVersions?: Map<string, number>;
  captureText?: string;
}

const readProcedureSteps = (
  value: unknown,
  steps: AliasBook | undefined,
): ModelProcedureStep[] =>
  (Array.isArray(value) ? value : []).flatMap((entry) => {
    const raw = isRecord(entry) ? entry : {};
    const text = toText(raw.text, PROCEDURE_STEP_TEXT_CAP);
    const stepId =
      typeof raw.stepAlias === 'string'
        ? (steps?.idOf(raw.stepAlias) ?? null)
        : null;
    return text === null
      ? []
      : [
          {
            stepId,
            text,
            detail:
              typeof raw.detail === 'string' && raw.detail.trim() === ''
                ? ''
                : toText(raw.detail, PROCEDURE_STEP_DETAIL_CAP),
            group: toText(raw.group, PROCEDURE_GROUP_NAME_CAP),
          },
        ];
  });

/** The procedure commands of a reply, each checked against the turn: a procedure is made only when the words say routine, procedure or checklist, and changed only on words that ask for it, about a procedure that is open or named, at the version the model read. Every drop is named. */
const readProcedureCommands = (
  items: Record<string, unknown>[],
  context: ProcedureReadContext,
): { commands: ProcedureCommand[]; dropped: ProcedureDrop[] } => {
  const text = context.captureText ?? '';
  const comparable = toComparable(text);
  const captureWords = ` ${comparable} `;
  const names = context.procedureNames ?? new Map<string, string>();
  return items
    .filter((item) =>
      (PROCEDURE_COMMAND_KINDS as readonly unknown[]).includes(item.kind),
    )
    .reduce<{ commands: ProcedureCommand[]; dropped: ProcedureDrop[] }>(
      (acc, item) => {
        const drop = (code: ProcedureDrop) => ({
          ...acc,
          dropped: [...acc.dropped, code],
        });
        const keep = (command: ProcedureCommand) => ({
          ...acc,
          commands: [...acc.commands, command],
        });
        const quote =
          typeof item.requestQuote === 'string' ? item.requestQuote.trim() : '';
        const isQuoted =
          toComparable(quote).split(' ').filter(Boolean).length >= 2 &&
          captureWords.includes(` ${toComparable(quote)} `);
        if (item.kind === 'createProcedure') {
          const quoted = toComparable(quote);
          const isAsked =
            isQuoted &&
            (MAKE_THESE_A_PROCEDURE_RE.test(quoted) ||
              (hasProcedureCue(quote) && MAKING_WORD_RE.test(quoted)));
          if (!isAsked) return drop('procedure-create-unasked');
          if (
            acc.commands.filter((c) => c.kind === 'createProcedure').length >=
            MAX_PROCEDURE_CREATES_PER_TURN
          ) {
            return drop('procedure-create-extra');
          }
          const title = toText(item.title, PROCEDURE_TITLE_CAP);
          const isFocusedTask =
            !!context.focusedTaskId &&
            MAKE_THESE_A_PROCEDURE_RE.test(comparable);
          const taskId =
            typeof item.fromTaskAlias === 'string'
              ? context.aliases.idOf(item.fromTaskAlias)
              : null;
          if (
            typeof item.fromTaskAlias === 'string' &&
            !taskId &&
            !isFocusedTask
          ) {
            return drop('procedure-create-task-unknown');
          }
          const fromTaskId = isFocusedTask
            ? (context.focusedTaskId ?? null)
            : taskId;
          const existing = fromTaskId
            ? context.procedureTitleByTask?.get(fromTaskId)
            : undefined;
          if (existing !== undefined) {
            return {
              commands: [
                ...acc.commands,
                { kind: 'procedureExists', title: existing },
              ],
              dropped: [...acc.dropped, 'procedure-create-exists'],
            };
          }
          const steps = readProcedureSteps(item.procedureSteps, undefined);
          if (!title || (steps.length === 0 && !fromTaskId)) {
            return drop('procedure-create-empty');
          }
          return keep({
            kind: 'createProcedure',
            title,
            steps: steps.slice(0, PROCEDURE_STEPS_MAX),
            fromTaskId,
            requestQuote: quote,
            isTruncated: steps.length > PROCEDURE_STEPS_MAX,
          });
        }
        if (!isQuoted || !hasProcedureReviseCue(quote)) {
          return drop('procedure-revise-unasked');
        }
        const procedureId =
          typeof item.procedureAlias === 'string'
            ? (context.procedures?.idOf(item.procedureAlias) ?? null)
            : null;
        const name = procedureId ? names.get(procedureId) : undefined;
        const isAsked =
          procedureId !== null &&
          (procedureId === context.focusedProcedureId ||
            (name !== undefined && isNamedIn(text, name)));
        if (!procedureId || !isAsked) return drop('procedure-revise-unseen');
        const seen = context.procedureVersions?.get(procedureId);
        if (seen === undefined) return drop('procedure-revise-unseen');
        const steps = readProcedureSteps(
          item.procedureSteps,
          context.procedureSteps,
        );
        if (
          steps.length === 0 ||
          acc.commands.some(
            (c) =>
              c.kind === 'reviseProcedure' && c.procedureId === procedureId,
          )
        ) {
          return drop('procedure-revise-empty');
        }
        return keep({
          kind: 'reviseProcedure',
          procedureId,
          title: toText(item.title, PROCEDURE_TITLE_CAP),
          steps: steps.slice(0, PROCEDURE_STEPS_MAX + 1),
          changeSummary:
            toText(item.changeSummary, PROCEDURE_SUMMARY_CAP) ?? '',
          requestQuote: quote,
          seenVersion: seen,
          isOverCap: steps.length > PROCEDURE_STEPS_MAX,
        });
      },
      { commands: [], dropped: [] },
    );
};

export type RunDrop =
  | 'run-start-unasked'
  | 'run-start-unknown'
  | 'run-start-extra'
  | 'run-start-itinerary'
  | 'run-tick-unasked'
  | 'run-tick-unknown';

interface RunReadContext {
  synced?: SyncedBook;
  procedures?: AliasBook;
  /** The undone steps of the open runs, by alias; each id is `runId:stepId`. */
  runSteps?: AliasBook;
  captureText?: string;
}

const toRunStep = (id: string | null) => {
  const at = id === null ? -1 : id.indexOf(':');
  return id === null || at < 1
    ? null
    : { runId: id.slice(0, at), stepId: id.slice(at + 1) };
};

const readRunCommands = (
  items: Record<string, unknown>[],
  context: RunReadContext,
): { commands: RunCommand[]; dropped: RunDrop[] } => {
  const captureWords = ` ${toComparable(context.captureText ?? '')} `;
  return items
    .filter((item) =>
      (RUN_COMMAND_KINDS as readonly unknown[]).includes(item.kind),
    )
    .reduce<{ commands: RunCommand[]; dropped: RunDrop[] }>(
      (acc, item) => {
        const drop = (code: RunDrop) => ({
          ...acc,
          dropped: [...acc.dropped, code],
        });
        const keep = (command: RunCommand) => ({
          ...acc,
          commands: [...acc.commands, command],
        });
        const quote =
          typeof item.requestQuote === 'string' ? item.requestQuote.trim() : '';
        const isQuoted =
          toComparable(quote).split(' ').filter(Boolean).length >= 2 &&
          captureWords.includes(` ${toComparable(quote)} `);
        if (item.kind === 'startRun') {
          if (!isQuoted || !hasRunStartCue(quote)) {
            return drop('run-start-unasked');
          }
          if (acc.commands.some((command) => command.kind === 'startRun')) {
            return drop('run-start-extra');
          }
          const procedureId =
            typeof item.procedureAlias === 'string'
              ? (context.procedures?.idOf(item.procedureAlias) ?? null)
              : null;
          if (!procedureId) return drop('run-start-unknown');
          const about =
            typeof item.aboutAlias === 'string'
              ? (context.synced?.get(item.aboutAlias) ?? null)
              : null;
          if (about?.category === 'itinerary')
            return drop('run-start-itinerary');
          const isPlace = about?.kind === 'trip' || about?.kind === 'event';
          return keep({
            kind: 'startRun',
            procedureId,
            about: isPlace ? about : null,
            projectRef: toText(item.projectRef, PROJECT_NAME_CAP),
            requestQuote: quote,
          });
        }
        if (!isQuoted || !hasTickCue(quote)) return drop('run-tick-unasked');
        const taken = acc.commands.reduce(
          (total, command) =>
            total + (command.kind === 'tickRun' ? command.steps.length : 0),
          0,
        );
        const steps = [
          ...new Map(
            (Array.isArray(item.runStepAliases) ? item.runStepAliases : [])
              .flatMap((alias) => {
                const step =
                  typeof alias === 'string'
                    ? toRunStep(context.runSteps?.idOf(alias) ?? null)
                    : null;
                return step ? [step] : [];
              })
              .map((step) => [`${step.runId}:${step.stepId}`, step]),
          ).values(),
        ].slice(0, Math.max(0, MAX_TICKS_PER_TURN - taken));
        return steps.length === 0
          ? drop('run-tick-unknown')
          : keep({ kind: 'tickRun', steps, requestQuote: quote });
      },
      { commands: [], dropped: [] },
    );
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

/** Turns the model's reply into commands code can run, or refuses it: every alias must be one offered, every day one the reading made, every @ # ^ name kept. Only the first answer is kept, at most `MAX_ASKS` model-written questions are kept, each checked by its shape (one that can't be shown is dropped and named in `askDropped`), each source and quote alias resolved or dropped; a `remember` is passed on with its aliases resolved or null, for the guards to judge. A sound reply with nothing in it is `[]`; a `planDay` for today through six days ahead is passed on as one day (a past or farther day is dropped and the rest of the reply kept, a second one is ignored); one past the cap files the first `MAX_COMMANDS` and says `hasMore`. With `alreadyMade`, a task whose title is already there is dropped and the names already in those titles are not required again. */
export type MediaDrop = 'unknownAlias' | 'repeatedAlias';

/** One decision for each attachment sent, in the order sent: an unknown or repeated alias is dropped, a caption is cut, a keep with no target that still resolves and no note to make becomes a discard, and one the model left out is let go. A note or topic is read only for a Markdown file, a topic implies the note, and the topics it is filed to must be ones offered (at most ten). */
export function readMedia(
  raw: unknown,
  context: {
    attachments: { alias: string; kind: string }[];
    aliases: AliasBook;
    facts?: AliasBook;
    topics?: AliasBook;
    madeRefs: Set<string>;
  },
): { decisions: MediaDecision[]; dropped: MediaDrop[] } {
  const items = Array.isArray(raw) ? raw.filter(isRecord) : [];
  const kinds = new Map(
    context.attachments.map(({ alias, kind }) => [alias, kind]),
  );
  const read = items.reduce<{
    byAlias: Map<string, MediaDecision>;
    dropped: MediaDrop[];
  }>(
    (acc, item) => {
      const alias = typeof item.alias === 'string' ? item.alias : '';
      const kind = kinds.get(alias);
      if (kind === undefined) {
        return { ...acc, dropped: [...acc.dropped, 'unknownAlias'] };
      }
      if (acc.byAlias.has(alias)) {
        return { ...acc, dropped: [...acc.dropped, 'repeatedAlias'] };
      }
      const targets = readMediaTargets(item.attachTo, context);
      const isMarkdown = kind === 'markdown';
      const asTopic = isMarkdown && item.asTopic === true;
      const asNote = isMarkdown && (item.asNote === true || asTopic);
      const topicIds = asNote
        ? readMediaTopics(item.topicAliases, context)
        : [];
      const isKeep = asNote || (item.decision === 'keep' && targets.length > 0);
      return {
        ...acc,
        byAlias: new Map(acc.byAlias).set(alias, {
          alias,
          decision: isKeep ? 'keep' : 'discard',
          caption: isKeep ? toText(item.caption, MEDIA_CAPTION_CAP) : null,
          targets: isKeep && item.decision === 'keep' ? targets : [],
          asNote,
          asTopic,
          topicIds,
        }),
      };
    },
    { byAlias: new Map(), dropped: [] },
  );
  return {
    decisions: context.attachments.map(
      ({ alias }) =>
        read.byAlias.get(alias) ?? {
          alias,
          decision: 'discard',
          caption: null,
          targets: [],
          asNote: false,
          asTopic: false,
          topicIds: [],
        },
    ),
    dropped: read.dropped,
  };
}

const readMediaTopics = (
  raw: unknown,
  context: { topics?: AliasBook },
): string[] =>
  [
    ...new Set(
      (Array.isArray(raw) ? raw : []).flatMap((entry: unknown) => {
        const id =
          typeof entry === 'string'
            ? (context.topics?.idOf(entry) ?? null)
            : null;
        return id ? [id] : [];
      }),
    ),
  ].slice(0, MAX_MEDIA_TOPICS);

const readMediaTargets = (
  raw: unknown,
  context: {
    aliases: AliasBook;
    facts?: AliasBook;
    madeRefs: Set<string>;
  },
): MediaTarget[] => {
  const wanted = Array.isArray(raw)
    ? raw.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const resolved = wanted.flatMap((entry): MediaTarget[] => {
    if (NEW_REF_RE.test(entry)) {
      return context.madeRefs.has(entry) ? [{ kind: 'task', ref: entry }] : [];
    }
    const taskId = context.aliases.idOf(entry);
    if (taskId) return [{ kind: 'task', ref: taskId }];
    const factId = context.facts?.idOf(entry) ?? null;
    return factId ? [{ kind: 'fact', ref: factId }] : [];
  });
  return [
    ...new Map(
      resolved.map((target) => [`${target.kind}:${target.ref}`, target]),
    ).values(),
  ].slice(0, MAX_MEDIA_TARGETS);
};

export function normalizeNomosReply(
  raw: unknown,
  context: {
    reading: CaptureReading;
    aliases: AliasBook;
    synced?: SyncedBook;
    facts?: AliasBook;
    keyDates?: AliasBook;
    /** The people listed in the context, by alias (w1, w2, …). */
    people?: AliasBook;
    topics?: AliasBook;
    notes?: AliasBook;
    parts?: AliasBook;
    /** The open topic's parts, by alias. */
    sections?: AliasBook;
    /** Each topic's name, for deciding whether the turn names it. */
    topicNames?: Map<string, string>;
    focusedTopicId?: string | null;
    /** The version of each topic whose document the model read. */
    topicVersions?: Map<string, number>;
    procedures?: AliasBook;
    /** The open procedure's steps, and those a search returned, by alias. */
    procedureSteps?: AliasBook;
    procedureNames?: Map<string, string>;
    focusedProcedureId?: string | null;
    focusedTaskId?: string | null;
    /** The title of the procedure made from each task. */
    procedureTitleByTask?: Map<string, string>;
    /** The version of each procedure whose steps the model read. */
    procedureVersions?: Map<string, number>;
    /** The undone steps of the open runs, by alias. */
    runSteps?: AliasBook;
    /** The words of the turn, which a note's words must come from. */
    captureText?: string;
    /** What names each date in the context (who, label, kind), for the check that a removal is still asked once closing phrases are taken out. */
    keyDateNames?: Map<string, string[]>;
    quotes?: QuoteBook;
    alreadyMade?: string[];
    records?: RecordBook;
    now?: number;
    timeZone?: string;
    /** The photos and files the turn sent, by alias. */
    attachments?: { alias: string; kind: string }[];
  },
): {
  media: MediaDecision[];
  mediaDropped: MediaDrop[];
  commands: NomosCommand[];
  hasMore: boolean;
  replyLine: string | null;
  answer: AnswerCommand | null;
  remember: RememberCommand[];
  noteFacts: NoteFactCommand[];
  keyDates: KeyDateCommand[];
  projects: ProjectCommand[];
  notes: CreateNoteCommand[];
  topicCommands: TopicCommand[];
  topicDropped: TopicDrop[];
  procedureCommands: ProcedureCommand[];
  procedureDropped: ProcedureDrop[];
  runCommands: RunCommand[];
  runDropped: RunDrop[];
  planDay: PlanDayCommand | null;
  setCurrentPlace: SetCurrentPlaceCommand | null;
  asks: AskCommand[];
  askDropped: AskDrop[];
  noteDropped: NoteDrop[];
  mentions: MentionRead[];
  places: PlaceRead[];
} {
  if (!isRecord(raw) || !Array.isArray(raw.commands)) {
    throw new NomosReplyError('badShape');
  }
  const state = { refs: new Set<string>() };
  const entities = readEntities(raw, context.reading, context.people);
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
          context.facts,
          context.notes,
          context.topics,
          context.parts,
        );
        return read ? [read] : [];
      })[0] ?? null;
  const remember = items
    .filter((item) => item.kind === 'remember')
    .map((item) => readRemember(item, context.synced, context.quotes));
  const noteFacts = items
    .filter((item) => item.kind === 'noteFact')
    .flatMap((item) => {
      const fact = readNoteFact(item, entities, context.facts);
      return fact ? [fact] : [];
    })
    .slice(0, MAX_NOTED_FACTS);
  const keyDates = items
    .filter(
      (item) => item.kind === 'setKeyDate' || item.kind === 'removeKeyDate',
    )
    .flatMap((item) => {
      const read = readKeyDate(
        item,
        entities,
        context.reading,
        context.keyDates,
        context.timeZone ?? 'UTC',
        (keyDateId) =>
          isSubjectNamed(
            context.captureText,
            context.keyDateNames?.get(keyDateId) ?? [],
          ),
      );
      return read ? [read] : [];
    })
    .slice(0, MAX_KEY_DATES);
  const {
    notes,
    dropped: noteDropped,
    itemNos: noteItemNos,
  } = readNotes(items, context.topics, context.captureText, [
    ...noteFacts.flatMap((fact) => [fact.statement, fact.quote ?? '']),
    ...keyDates.flatMap((date) =>
      date.kind === 'setKeyDate' ? [date.quote ?? ''] : [],
    ),
  ]);
  const { commands: topicCommands, dropped: topicDropped } = readTopicCommands(
    items,
    {
      topics: context.topics,
      sections: context.sections,
      topicNames: context.topicNames,
      focusedTopicId: context.focusedTopicId,
      topicVersions: context.topicVersions,
      captureText: context.captureText,
      notes,
      noteItemNos,
    },
  );
  const { commands: procedureCommands, dropped: procedureDropped } =
    readProcedureCommands(items, {
      aliases: context.aliases,
      procedures: context.procedures,
      procedureSteps: context.procedureSteps,
      procedureNames: context.procedureNames,
      focusedProcedureId: context.focusedProcedureId,
      focusedTaskId: context.focusedTaskId,
      procedureTitleByTask: context.procedureTitleByTask,
      procedureVersions: context.procedureVersions,
      captureText: context.captureText,
    });
  const { commands: runCommands, dropped: runDropped } = readRunCommands(
    items,
    {
      synced: context.synced,
      procedures: context.procedures,
      runSteps: context.runSteps,
      captureText: context.captureText,
    },
  );
  const projects = readProjects(
    items,
    entities,
    context.reading,
    context.timeZone ?? 'UTC',
  );
  const { asks, dropped: askDropped } = readAsks(
    items,
    context.aliases,
    context.records,
  );
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
      context.captureText ?? '',
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
  const kept = fresh.slice(0, MAX_COMMANDS);
  const { decisions: media, dropped: mediaDropped } = readMedia(raw.media, {
    attachments: context.attachments ?? [],
    aliases: context.aliases,
    facts: context.facts,
    topics: context.topics,
    madeRefs: new Set(
      kept.flatMap((command) =>
        command.kind === 'createTask' ? [command.ref] : [],
      ),
    ),
  });
  return {
    media,
    mediaDropped,
    commands: kept,
    hasMore: fresh.length > MAX_COMMANDS,
    replyLine: readReplyLine(raw.replyLine, context.captureText ?? ''),
    answer,
    remember,
    noteFacts,
    keyDates,
    projects,
    notes,
    topicCommands,
    topicDropped,
    procedureCommands,
    procedureDropped,
    runCommands,
    runDropped,
    planDay,
    setCurrentPlace: items.some(
      (item) => item.kind === 'setCurrentPlace' && item.place === 'home',
    )
      ? { kind: 'setCurrentPlace', place: 'home' }
      : null,
    asks,
    askDropped,
    noteDropped,
    mentions: entities.mentions,
    places: entities.places,
  };
}
