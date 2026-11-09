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

export const MAX_COMMANDS = 20;
export const MAX_EFFECTS = 40;
export const TITLE_CAP = 200;

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
          ],
          properties: {
            kind: { type: 'string', enum: [...COMMAND_KINDS] },
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
