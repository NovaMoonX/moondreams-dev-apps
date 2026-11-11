import type { TerminalTool } from '../../../ai/modelProvider.js';
import type { QuoteEntry } from './aliases.js';
import type { SyncedCopy } from '../syncedCopies.js';
import { SENSITIVE_CATEGORIES } from './sensitive.js';
import type { MomentPrecision } from '../../../vendor/yearlyDateUtils.js';

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
  /** How exactly the words said it: a bare year, a decade or a month with no day; null for a day or a time. */
  precision: Exclude<MomentPrecision, 'day'> | null;
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
  'remember',
  'planDay',
  'setCurrentPlace',
  'noteFact',
  'setKeyDate',
  'removeKeyDate',
  'createProject',
  'setProjectRole',
  'addMilestone',
  'createNote',
] as const;

export const REMEMBER_FIELDS = ['startAt', 'endAt', 'place'] as const;

export type RememberField = (typeof REMEMBER_FIELDS)[number];

export const ANSWER_SCOPES = ['yourThings', 'theWorld', 'both'] as const;

export type AnswerScope = (typeof ANSWER_SCOPES)[number];

export const MENTION_KINDS = ['person', 'pet', 'organization'] as const;

export type MentionKind = (typeof MENTION_KINDS)[number];

/** The assistant's name until the person can rename it; a who never takes it. */
export const DEFAULT_ASSISTANT_NAME = 'Nomos';

export const MAX_COMMANDS = 20;
export const MAX_MENTIONS = 10;
export const MAX_PLACES = 5;
export const NAME_CAP = 80;
export const PLAN_DAY_AHEAD = 6;
export const MAX_EFFECTS = 40;
export const TITLE_CAP = 200;
export const QUESTION_CAP = 200;
export const ANSWER_TEXT_CAP = 1_200;
export const MAX_QUOTES = 5;
export const QUOTE_CAP = 300;
export const STATEMENT_CAP = 500;
export const FACT_QUOTE_CAP = 280;
export const MAX_NOTED_FACTS = 5;
export const TOPIC_CAP = 40;
export const MAX_KEY_DATES = 5;
export const PROJECT_NAME_CAP = 80;
export const PROJECT_OBJECTIVE_CAP = 200;
export const PROJECT_ROLE_NOTE_CAP = 40;
export const MAX_PROJECT_ROLES = 5;
export const MAX_CONTEXT_PROJECTS = 20;
export const NOTE_TITLE_CAP = 80;
export const NOTE_BODY_CAP = 20_000;
export const NOTES_LIMIT = 1_000;
export const NOTE_TOPICS_CAP = 10;
export const MAX_NOTES_PER_TURN = 3;
export const MAX_CONTEXT_TOPICS = 100;
export const MAX_HINT_NOTES = 8;
export const NOTES_CONTEXT_CHARS = 6_000;
export const DIFFERS_SAYS_CAP = 80;
export const MILESTONE_TITLE_CAP = 80;
export const MAX_MILESTONES_PER_TURN = 3;
export const MAX_MILESTONES_PER_PROJECT = 30;
export const MAX_CONTEXT_MILESTONES = 10;
export const PROJECT_ROLES = ['key', 'involved'] as const;
export const KEY_DATE_LABEL_CAP = 60;
export const MAX_MOMENTS_PER_WHO = 500;
export const KEY_DATE_PRECISIONS = ['day', 'month', 'year', 'decade'] as const;
export const KEY_DATE_KINDS = [
  'birthday',
  'anniversary',
  'custom',
  'passedAway',
  'met',
  'adopted',
  'startedJob',
  'leftJob',
  'moved',
  'graduated',
] as const;

export type KeyDateKind = (typeof KEY_DATE_KINDS)[number];

/** Whether a kind is a one-time event; a custom date is one only when it does not come back. */
export const isMomentKind = (kind: KeyDateKind) =>
  kind !== 'birthday' && kind !== 'anniversary' && kind !== 'custom';
export const FACT_KINDS = [
  'world',
  'preference',
  'favorite',
  'identity',
] as const;

export type NoteFactKind = (typeof FACT_KINDS)[number];
export const VALUE_CAP = 80;
export const ANSWER_SPOKEN_CAP = 200;
export const MAX_ASKS = 5;
export const MAX_OPEN_ASKED = 20;
export const OPTION_CAP = 80;
export const UNIT_CAP = 20;
export const NUMBER_LIMIT = 1e9;
export const FREE_TEXT_CAP = 500;

export const ASK_SHAPES = [
  'pickOne',
  'pickSeveral',
  'yesNo',
  'freeText',
  'dateTime',
  'pickRecord',
  'number',
] as const;

export type AskShape = (typeof ASK_SHAPES)[number];

export const ASK_RECORD_KINDS = ['who', 'place'] as const;

export const ASK_DATE_MODES = ['date', 'time', 'dateTime'] as const;

export interface AskOption {
  id: string;
  label: string;
  detail: string | null;
  ref: { collection: 'who' | 'places'; id: string } | null;
}

/** A question the model asked, checked by shape: the options carry their code-added closers and every record settled to a reference. */
export interface AskCommand {
  shape: AskShape;
  prompt: string;
  options: AskOption[];
  allowsSomethingElse: boolean;
  noneOption: boolean;
  recordKinds: (typeof ASK_RECORD_KINDS)[number][];
  dateMode: (typeof ASK_DATE_MODES)[number] | null;
  number: {
    min: number | null;
    max: number | null;
    unit: string | null;
    isMoney: boolean;
    decimals: 0 | 1 | 2;
  } | null;
  aboutRef: { collection: 'tasks'; id: string } | null;
}

/** A command whose every reference is settled: a task id from the context, a `$new` ref made in the same reply, or a due the reading made. */
export type NomosCommand =
  | {
      kind: 'createTask';
      ref: string;
      title: string;
      due: TaskDue | null;
      isUrgent: boolean;
      whoRefs: string[];
      placeRefs: string[];
      /** A project's name as the person said it; code matches it. */
      projectRef: string | null;
    }
  | {
      kind: 'updateTask';
      taskId: string;
      title: string | null;
      due: TaskDue | null;
      hasDue: boolean;
      isUrgent: boolean | null;
      whoRefs: string[];
      placeRefs: string[];
    }
  | { kind: 'completeTask'; taskId: string };

/** A person, pet or organization the reply names. */
export interface MentionRead {
  ref: string;
  name: string;
  kind: MentionKind;
  relation: string | null;
  species: string | null;
  organizationKind: string | null;
}

/** A location the reply names, its ref `$p1`, `$p2`, …. */
export interface PlaceRead {
  ref: string;
  name: string;
}

/** A record an answer rests on, as stored with the answer. */
export type SourceRef =
  | { kind: 'task' | 'fact' | 'topic'; id: string }
  | {
      kind: 'note';
      id: string;
      title: string;
      topicPath: string | null;
      topicEmoji: string | null;
    }
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

/** One noted fact from a live lookup, its aliases resolved; the guards decide whether it is written. Null where an alias named nothing offered. */
export interface RememberCommand {
  statement: string | null;
  quote: QuoteEntry | null;
  about: SyncedCopy | null;
  aboutField: RememberField | null;
  value: string | null;
}

/** Something true about a person, pet, organization or place the capture named, its refs settled to the reply's mentions and places; code decides whether it is stated or inferred. */
export interface NoteFactCommand {
  statement: string;
  quote: string | null;
  isStated: boolean;
  whoRefs: string[];
  placeRefs: string[];
  kind: NoteFactKind;
  topic: string | null;
  value: string | null;
  isSensitive: boolean;
  isAboutMe: boolean;
  /** The id of a fact in context this one disagrees with, settled from the alias the model wrote. */
  contradicts: string | null;
}

/** A date for someone or the person, its month, day, year and precision settled from a resolved date span by code. */
export interface SetKeyDateCommand {
  kind: 'setKeyDate';
  whoRefs: string[];
  isAboutMe: boolean;
  /** The date being changed, settled from its alias; null adds one. */
  keyDateId: string | null;
  keyKind: KeyDateKind;
  label: string | null;
  /** A year or a decade has no month or day; a decade's year is its first. */
  date: {
    month: number | null;
    day: number | null;
    year: number | null;
  } | null;
  /** How exactly the span said the date; null when it gave none. */
  precision: MomentPrecision | null;
  comesBack: boolean | null;
  quote: string | null;
}

export interface RemoveKeyDateCommand {
  kind: 'removeKeyDate';
  keyDateId: string;
}

export type KeyDateCommand = SetKeyDateCommand | RemoveKeyDateCommand;

/** The person starts something with several steps; its date is date-only (UTC midnight). */
export interface CreateProjectCommand {
  kind: 'createProject';
  name: string;
  emoji: string | null;
  objective: string | null;
  targetDate: number | null;
}

/** A person is key to or involved in a project, named by words code matches; it only raises a role. */
export interface SetProjectRoleCommand {
  kind: 'setProjectRole';
  projectRef: string;
  whoRefs: string[];
  role: (typeof PROJECT_ROLES)[number];
  note: string | null;
}

/** A dated point in a project, named by words code matches; its date is date-only (UTC midnight). */
export interface AddMilestoneCommand {
  kind: 'addMilestone';
  projectRef: string;
  title: string;
  date: number | null;
}

export type ProjectCommand =
  CreateProjectCommand | SetProjectRoleCommand | AddMilestoneCommand;

/** Something general to remember that is about no person, pet, place or project, its topics settled to ids of ones the person already has. */
export interface CreateNoteCommand {
  kind: 'createNote';
  title: string;
  body: string;
  topicIds: string[];
}

/** A request to lay out one day, its date already settled to a calendar day in the person's zone; the device makes the plan, so it files no effect. */
export interface PlanDayCommand {
  kind: 'planDay';
  date: Extract<TaskDue, { kind: 'day' }>;
}

/** The person said they are home; the device's profile holds it for a few hours. Only home can be said so. */
export interface SetCurrentPlaceCommand {
  kind: 'setCurrentPlace';
  place: 'home';
}

/** The model's answer to a question, every source alias already resolved; the guards decide what of it is kept. */
export interface AnswerCommand {
  scope: AnswerScope;
  question: string;
  isHealth: boolean;
  fromRecordsText: string | null;
  sources: SourceRef[];
  quotes: QuoteEntry[];
  syncedKeys: string[];
  generalText: string | null;
  generalSpoken: string | null;
  /** Notes the answer cites, resolved from the context's note aliases. */
  noteIds: string[];
  differsFromNoteId: string | null;
  differsSays: string | null;
  suggestedTopicId: string | null;
}

const NAMED_BY_REF = (name: string) => ({
  type: ['array', 'null'],
  items: { type: 'string' },
  description: name,
});

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
            'place',
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
          ],
          properties: {
            kind: { type: 'string', enum: [...COMMAND_KINDS, 'answer', 'ask'] },
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
              `createTask: the task in plain words, keeping every @, # and ^ name from the capture as written. updateTask: the new title, or null to keep it. createProject: its name the way the person said it, at most 80 characters. addMilestone: the milestone in the person's words, at most ${MILESTONE_TITLE_CAP} characters. createNote: a short name for the note, at most ${NOTE_TITLE_CAP} characters.`,
            ),
            dueSpanId: nullable(
              'string',
              "The id of a date span from the reading that gives this task its day, the day to plan for planDay (null means today), the project's target date for createProject, or the date of an addMilestone (null when it has none). Never write a date yourself.",
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
            quoteAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: `answer: the alias (q1, q2, …) of each email fromRecordsText rests on, from search_mail, at most ${MAX_QUOTES}. The quote shown is copied from the email by code.`,
            },
            generalText: nullable(
              'string',
              `answer: general knowledge about the world, at most ${ANSWER_TEXT_CAP} characters, only for what the records do not say and never about the person's own plans, people or things.`,
            ),
            generalSpoken: nullable(
              'string',
              `answer: generalText as one plain spoken sentence, at most ${ANSWER_SPOKEN_CAP} characters.`,
            ),
            differsFromNoteAlias: nullable(
              'string',
              'answer: the alias of a note in related_notes that generalText disagrees with; null when it disagrees with none.',
            ),
            differsSays: nullable(
              'string',
              `answer: what that note says on the point, at most ${DIFFERS_SAYS_CAP} characters; null with no differsFromNoteAlias.`,
            ),
            suggestedTopicAlias: nullable(
              'string',
              'answer: the alias of the one topic in your_topics generalText plainly belongs in, for keeping it; null when none plainly fits.',
            ),
            statement: nullable(
              'string',
              `remember: one plain sentence for what an email says that differs from a calendar event, at most ${STATEMENT_CAP} characters. noteFact: the fact as one plain sentence ("Dana is the florist"), at most ${STATEMENT_CAP} characters; null for every other kind.`,
            ),
            quoteAlias: nullable(
              'string',
              "remember: the alias of the email from search_mail that says it; it must also be in the answer's quoteAliases.",
            ),
            aboutAlias: nullable(
              'string',
              'remember: the alias (e1, e2, …) of the calendar event the email disagrees with. ask: the alias of the open task the question is about, or null.',
            ),
            aboutField: {
              type: ['string', 'null'],
              enum: [...REMEMBER_FIELDS, null],
              description:
                'remember: which part of that event the email gives differently; null for every other kind.',
            },
            value: nullable(
              'string',
              `remember: what the email says for that part, as it should read ("2:00 PM"), at most ${VALUE_CAP} characters. noteFact: the preferred or favorite thing ("Shell", "Arrival"), at most ${VALUE_CAP} characters; null otherwise.`,
            ),
            whoRefs: NAMED_BY_REF(
              'createTask, updateTask and noteFact: the ref ($w1, …) of each entry in mentions this task or fact is about; setProjectRole: the people given the role; null or empty when none.',
            ),
            placeRefs: NAMED_BY_REF(
              'createTask, updateTask and noteFact: the ref ($p1, …) of each entry in places this task or fact is about; null or empty when none.',
            ),
            place: {
              type: ['string', 'null'],
              enum: ['home', null],
              description:
                'setCurrentPlace: home, when the person says they are home or just got home; null for every other kind.',
            },
            shape: {
              type: ['string', 'null'],
              enum: [...ASK_SHAPES, null],
              description:
                'ask: the kind of answer wanted; null for every other kind.',
            },
            prompt: nullable(
              'string',
              `ask: the question in plain words, at most ${QUESTION_CAP} characters, no Markdown or links.`,
            ),
            options: {
              type: ['array', 'null'],
              description:
                'ask: the choices for pickOne (2 to 6), pickSeveral (2 to 8) and pickRecord (people or places already in the records); null or empty for the other shapes. Never add "None of these", "Yes", "No" or "Someone new": they are added for you.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'detail', 'recordAlias'],
                properties: {
                  label: {
                    type: 'string',
                    description: `The choice in plain words, at most ${OPTION_CAP} characters.`,
                  },
                  detail: nullable(
                    'string',
                    `What tells it apart, at most ${OPTION_CAP} characters; null when nothing does.`,
                  ),
                  recordAlias: nullable(
                    'string',
                    'pickRecord: the alias of the person or place this choice is; null otherwise.',
                  ),
                },
              },
            },
            allowsSomethingElse: nullable(
              'boolean',
              'ask pickOne: true when the choices may not cover what the person means, so a "Something else" answer is offered.',
            ),
            recordKinds: {
              type: ['array', 'null'],
              items: { type: 'string', enum: [...ASK_RECORD_KINDS, 'project'] },
              description:
                'ask pickRecord: who the question searches, who for people, pets and organizations and place for places; null otherwise.',
            },
            dateMode: {
              type: ['string', 'null'],
              enum: [...ASK_DATE_MODES, null],
              description:
                'ask dateTime: date, time or dateTime; null otherwise.',
            },
            numberMin: nullable(
              'number',
              'ask number: the smallest sensible answer, or null. In dollars when isMoney.',
            ),
            numberMax: nullable(
              'number',
              'ask number: the largest sensible answer, or null. In dollars when isMoney.',
            ),
            unit: nullable(
              'string',
              `ask number: the unit after the figure ("nights"), at most ${UNIT_CAP} characters; null when none.`,
            ),
            isMoney: nullable(
              'boolean',
              'ask number: true when the answer is an amount of money.',
            ),
            decimals: nullable(
              'number',
              'ask number: 0, 1 or 2 digits after the point; null for whole numbers.',
            ),
            quote: nullable(
              'string',
              `noteFact: the person's exact words from the capture that say it, at most ${FACT_QUOTE_CAP} characters; null when none.`,
            ),
            isStated: nullable(
              'boolean',
              'noteFact: true only when the person said it outright; false when it is read between the lines.',
            ),
            factKind: {
              type: ['string', 'null'],
              enum: [...FACT_KINDS, null],
              description:
                'noteFact: preference for what someone usually picks ("I always go to Shell for gas"), favorite for a favorite ("my favorite movie is Arrival"), identity for who someone is ("I\'m vegan", "Dana is allergic to nuts"), world for anything else; null for every other kind.',
            },
            topic: nullable(
              'string',
              `noteFact: a preference or favorite's subject in one or two lowercase words ("gas station", "movies"), at most ${TOPIC_CAP} characters; null otherwise.`,
            ),
            isSensitive: nullable(
              'boolean',
              `noteFact: true when it is about ${SENSITIVE_CATEGORIES.join(', ')}; false otherwise.`,
            ),
            isAboutMe: nullable(
              'boolean',
              'noteFact: true when it is about the person talking ("I", "my"); false when it is about someone or something else. setKeyDate: true only when the date is the person\'s own; "my mum\'s birthday" is about Mum, so false with Mum in whoRefs.',
            ),
            keyDateAlias: nullable(
              'string',
              'setKeyDate: the alias of a date in <key_dates> being changed; null to add a new one. removeKeyDate: the alias of the date to remove.',
            ),
            keyDateKind: {
              type: ['string', 'null'],
              enum: [...KEY_DATE_KINDS, null],
              description:
                'setKeyDate: birthday or anniversary; met, moved, startedJob, leftJob, graduated, adopted or passedAway for one-time events; custom for any other date ("gotcha day", "lived in Lisbon"); null for every other kind.',
            },
            keyDateLabel: nullable(
              'string',
              `setKeyDate: the name of a custom date ("Gotcha day"), at most ${KEY_DATE_LABEL_CAP} characters; null otherwise.`,
            ),
            dateSpanId: nullable(
              'string',
              'setKeyDate: the id of the date span in the reading that gives the date. Never write a date yourself.',
            ),
            comesBack: nullable(
              'boolean',
              'setKeyDate custom only: true when the date comes back each year; false for a one-time event.',
            ),
            projectRef: nullable(
              'string',
              'createTask: the name of the project from <open_projects> (or one this reply creates) that the task is a step of, only when the person says so ("for the wedding"). setProjectRole and addMilestone: the name of the project. null otherwise.',
            ),
            projectEmoji: nullable(
              'string',
              'createProject: one emoji that fits it; null when none does.',
            ),
            objective: nullable(
              'string',
              `createProject: what done looks like in one plain sentence, only when said, at most ${PROJECT_OBJECTIVE_CAP} characters; null otherwise.`,
            ),
            role: {
              type: ['string', 'null'],
              enum: [...PROJECT_ROLES, null],
              description:
                'setProjectRole: key for someone the project depends on ("Dana is key for the wedding", "Dana is doing the flowers"); involved for someone who is part of it ("add Maya to the move"); null for every other kind.',
            },
            roleNote: nullable(
              'string',
              `setProjectRole: what the person does in it, in a word or two ("florist"), only when said, at most ${PROJECT_ROLE_NOTE_CAP} characters; null otherwise.`,
            ),
            contradicts: nullable(
              'string',
              'noteFact: the alias of a fact above that this one disagrees with ("centerpieces are $2,100 now" against "centerpieces are $1,800"); null when it adds to it.',
            ),
            bodyQuote: nullable(
              'string',
              `createNote: the words to keep, copied exactly from the capture, at most ${NOTE_BODY_CAP} characters.`,
            ),
            topicAliases: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description:
                'createNote: the alias of each topic in <your_topics> the note plainly belongs in; empty when none fits. Never invent one.',
            },
          },
        },
      },
      mentions: {
        type: 'array',
        description: `Every person, pet or organization the capture names, at most ${MAX_MENTIONS}, each once. A @handle is a person. Never the assistant itself, never "me" or "I".`,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'ref',
            'name',
            'kind',
            'relation',
            'species',
            'organizationKind',
          ],
          properties: {
            ref: { type: 'string', description: 'A name such as $w1.' },
            name: {
              type: 'string',
              description: `The name as written, without "'s", at most ${NAME_CAP} characters.`,
            },
            kind: { type: 'string', enum: [...MENTION_KINDS] },
            relation: nullable(
              'string',
              'How the person puts it when they say it ("my sister", "our vet"); null otherwise.',
            ),
            species: nullable(
              'string',
              'A pet only: the kind of animal when said ("cat"); null otherwise.',
            ),
            organizationKind: nullable(
              'string',
              'An organization only: what it is when said ("bakery", "clinic"); null otherwise.',
            ),
          },
        },
      },
      places: {
        type: 'array',
        description: `Every location the capture names ("the Ferry Building", "home"), at most ${MAX_PLACES}, each once. A business or a person is a mention, never a place.`,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ref', 'name'],
          properties: {
            ref: { type: 'string', description: 'A name such as $p1.' },
            name: {
              type: 'string',
              description: `The place as written, at most ${NAME_CAP} characters.`,
            },
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

const toSpanPrecision = (value: unknown): DateSpan['precision'] =>
  value === 'month' || value === 'year' || value === 'decade' ? value : null;

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
      ? source.dates
          .filter(
            (entry): entry is DateSpan =>
              isToken(entry) && isDue((entry as DateSpan).due),
          )
          .map((entry) => ({
            ...entry,
            precision: toSpanPrecision(
              (entry as { precision?: unknown }).precision,
            ),
          }))
      : [],
    addressedAs: isToken(source.addressedAs) ? source.addressedAs : null,
  };
}
