import type { TerminalTool } from '../../../ai/modelProvider.js';

export type TaskDue =
  { kind: 'day'; date: number } | { kind: 'moment'; at: number };

export interface Token {
  id: string;
  text: string;
  start: number;
  end: number;
}

export interface DateSpan extends Token {
  due: TaskDue;
}

export interface CaptureReading {
  people: Token[];
  places: Token[];
  documents: Token[];
  commands: Token[];
  isUrgent: boolean;
  dates: DateSpan[];
  addressedAs: Token | null;
}

export const COMMAND_KINDS = [
  'createTask',
  'updateTask',
  'completeTask',
] as const;

export const ANSWER_SCOPES = ['yourThings', 'theWorld', 'both'] as const;

export type AnswerScope = (typeof ANSWER_SCOPES)[number];

export const MAX_COMMANDS = 20;
export const MAX_EFFECTS = 40;
export const TITLE_CAP = 200;
export const QUESTION_CAP = 200;
export const ANSWER_TEXT_CAP = 1_200;
export const ANSWER_SPOKEN_CAP = 200;

/** A command whose every reference is settled: a task id from the context, a `$new` ref made in the same reply, or a due the reading made. */
export type NomosCommand =
  | {
      kind: 'createTask';
      ref: string;
      title: string;
      due: TaskDue | null;
      isUrgent: boolean;
    }
  | {
      kind: 'updateTask';
      taskId: string;
      title: string | null;
      due: TaskDue | null;
      hasDue: boolean;
      isUrgent: boolean | null;
    }
  | { kind: 'completeTask'; taskId: string };

/** A record an answer rests on, as stored with the answer. */
export type SourceRef =
  | { kind: 'task'; id: string }
  | {
      kind: 'synced';
      id: string;
      connectorId: string;
      title: string | null;
      startAt: number | null;
    }
  | {
      kind: 'connection';
      connectorId: string;
      accountId: string;
      name: string;
      label: string | null;
    };

/** The model's answer to a question, every source alias already resolved; the guards decide what of it is kept. */
export interface AnswerCommand {
  scope: AnswerScope;
  question: string;
  isHealth: boolean;
  fromRecordsText: string | null;
  sources: SourceRef[];
  generalText: string | null;
  generalSpoken: string | null;
}

const nullable = (type: string, description: string) => ({
  type: [type, 'null'],
  description,
});

/** One flat object per command, every field required and nullable, so the model's reply is checked against it before code reads it. */
export const FILE_RESULTS_TOOL: TerminalTool = {
  name: 'file_results',
  description:
    'Files what the capture asks for as commands. Call it once, last, with every command.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['commands'],
    properties: {
      commands: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
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
          ],
          properties: {
            kind: { type: 'string', enum: [...COMMAND_KINDS, 'answer'] },
            ref: nullable(
              'string',
              'createTask: a name for the new task such as $new1, so a later command can point at it; null otherwise.',
            ),
            taskAlias: nullable(
              'string',
              'updateTask and completeTask: the alias of an open task from the context or a search result, or a $new ref from this reply; null for createTask.',
            ),
            title: nullable(
              'string',
              'createTask: the task in plain words, keeping every @, # and ^ name from the capture as written. updateTask: the new title, or null to keep it.',
            ),
            dueSpanId: nullable(
              'string',
              'The id of a date span from the reading that gives this task its day. Never write a date yourself.',
            ),
            isUrgent: nullable(
              'boolean',
              'true when the capture marks this task urgent; null to leave it as it is.',
            ),
            scope: nullable(
              'string',
              `answer: yourThings when the question is about the person's own plans, people, tasks or things; theWorld when it asks about the world; both when the records answer part and the world the rest. null for every other kind.`,
            ),
            question: nullable(
              'string',
              `answer: the question in the person's words, at most ${QUESTION_CAP} characters.`,
            ),
            isHealth: nullable(
              'boolean',
              'answer: true when the question is about health or medicine.',
            ),
            fromRecordsText: nullable(
              'string',
              `answer: what the person's records say, at most ${ANSWER_TEXT_CAP} characters; null when they say nothing about it.`,
            ),
            sourceAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description:
                'answer: the alias of every record fromRecordsText rests on, from the open tasks, the synced records or a tool result.',
            },
            generalText: nullable(
              'string',
              `answer: general knowledge about the world, at most ${ANSWER_TEXT_CAP} characters, only for what the records do not say and never about the person's own plans, people or things.`,
            ),
            generalSpoken: nullable(
              'string',
              `answer: generalText as one plain spoken sentence, at most ${ANSWER_SPOKEN_CAP} characters.`,
            ),
          },
        },
      },
    },
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isToken = (value: unknown): value is Token =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.text === 'string' &&
  typeof value.start === 'number' &&
  typeof value.end === 'number';

const isDue = (value: unknown): value is TaskDue =>
  isRecord(value) &&
  ((value.kind === 'day' && typeof value.date === 'number') ||
    (value.kind === 'moment' && typeof value.at === 'number'));

const toTokens = (value: unknown) =>
  Array.isArray(value) ? value.filter(isToken) : [];

/** Opens a stored reading, an older turn's `{}` included, with every field present. */
export function toReading(value: unknown): CaptureReading {
  const source = isRecord(value) ? value : {};
  return {
    people: toTokens(source.people),
    places: toTokens(source.places),
    documents: toTokens(source.documents),
    commands: toTokens(source.commands),
    isUrgent: source.isUrgent === true,
    dates: Array.isArray(source.dates)
      ? source.dates.filter(
          (entry): entry is DateSpan =>
            isToken(entry) && isDue((entry as DateSpan).due),
        )
      : [],
    addressedAs: isToken(source.addressedAs) ? source.addressedAs : null,
  };
}
