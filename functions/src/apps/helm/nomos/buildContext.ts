import {
  createAliasBook,
  createSyncedBook,
  type AliasBook,
  type SyncedBook,
} from './aliases.js';
import { toKnownZone, toSyncedView, type SyncedCopy } from '../syncedCopies.js';
import {
  MAX_CONTEXT_PROJECTS,
  MAX_CONTEXT_TOPICS,
  MAX_HINT_NOTES,
  NOTES_CONTEXT_CHARS,
  type CaptureReading,
  type TaskDue,
  type Token,
} from './commands.js';
import { withoutAddress } from './joinedTurn.js';
import { hasReviseCue, isQuestion } from './route.js';
import type { ContextKeyDate, ContextUpcoming } from '../keyDateStore.js';
import type { ContextProject } from '../projectStore.js';
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

/** A topic as the model sees it: its name and its path from the top down ("Car care › Washing"). */
export interface ContextTopic {
  id: string;
  name: string;
  path: string;
}

/** A note the device ranked for what was typed. Its title always goes to the model; its body only on a question, and `isUnchecked` says it was saved from a general answer nobody has checked. */
export interface ContextNote {
  id: string;
  title: string;
  body?: string;
  isUnchecked?: boolean;
}

/** Each body trimmed so that all together stay within the cap: the shortest keep every word and what they leave over is shared by the longer ones. */
const toNoteBodies = (notes: ContextNote[]): (string | null)[] => {
  const withBody = notes.flatMap((note, index) =>
    note.body === undefined ? [] : [{ index, body: note.body }],
  );
  const kept = withBody
    .sort((left, right) => left.body.length - right.body.length)
    .reduce(
      (acc, { index, body }) => {
        const share = Math.floor(acc.left / (withBody.length - acc.done));
        const text =
          body.length > share ? body.slice(0, share).trimEnd() : body;
        return {
          left: acc.left - text.length,
          done: acc.done + 1,
          byIndex: acc.byIndex.set(index, text),
        };
      },
      {
        left: NOTES_CONTEXT_CHARS,
        done: 0,
        byIndex: new Map<number, string>(),
      },
    ).byIndex;
  return notes.map((_, index) => kept.get(index) ?? null);
};

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
  /** The active projects, newest first, each with its open milestones. */
  projects?: ContextProject[];
  /** The person's topics, at most `MAX_CONTEXT_TOPICS`. */
  topics?: ContextTopic[];
  /** The notes the device thinks the turn may be about, at most `MAX_HINT_NOTES`. */
  notes?: ContextNote[];
  /** The photos and files sent with the turn, by alias. */
  attachments?: { alias: string; kind: 'photo' | 'pdf' | 'markdown' }[];
  /** What the files say, as data: each name and text goes through `toDataJson`, so a file can never close the block. */
  files?: {
    alias: string;
    kind: 'pdf' | 'markdown';
    name: string;
    pages: number | null;
    text: string | null;
    isCut: boolean;
  }[];
  focusedTopic?: ContextFocusedTopic | null;
  /** How much of the focused topic's document the model sees; the whole of it when left out. */
  topicDocument?: 'whole' | 'outline' | null;
}

export interface ContextFocusedTopic {
  id: string;
  name: string;
  version: number;
  sections: {
    id: string;
    heading: string | null;
    markdown: string;
    writtenBy: 'nomos' | 'person';
    noteIds: string[];
  }[];
}

/** How much of the open topic's document the turn gets: all of it for a question or a request to change it, otherwise only its outline, so a new part can be placed; none with no topic open. */
export const topicDocumentFor = (
  text: string,
  hasFocus: boolean,
): 'whole' | 'outline' | null => {
  if (!hasFocus) return null;
  return isQuestion(text.trim()) || hasReviseCue(text) ? 'whole' : 'outline';
};

export const MAX_TOPIC_DOCUMENT_CHARS = 30_000;

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
  topics: AliasBook;
  notes: AliasBook;
  parts: AliasBook;
  sections: AliasBook;
  focus: { id: string; version: number } | null;
} {
  const aliases = createAliasBook('t');
  const sectionBook = createAliasBook('s');
  const topics = createAliasBook('tp');
  const notes = createAliasBook('n');
  const partIds = new Map<string, string>();
  const parts: AliasBook = {
    add: (id) => {
      const alias = `d${partIds.size + 1}`;
      partIds.set(alias, id);
      return alias;
    },
    idOf: (alias) => partIds.get(alias) ?? null,
  };
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
  const keptNotes = (input.notes ?? []).slice(0, MAX_HINT_NOTES);
  const noteBodies = toNoteBodies(keptNotes);
  const noteRecords = keptNotes.map((note, index) => ({
    alias: notes.add(note.id),
    title: note.title,
    ...(noteBodies[index] === null ? {} : { body: noteBodies[index] }),
    ...(note.isUnchecked ? { savedFromGeneralAnswer: true } : {}),
  }));
  const noteIds = new Set(keptNotes.map((note) => note.id));
  const focused = input.focusedTopic;
  const documentMode = input.topicDocument ?? 'whole';
  const topicDocument = !focused
    ? null
    : documentMode === 'outline'
      ? {
          topic: topics.add(focused.id),
          name: focused.name,
          version: focused.version,
          sections: focused.sections.map((section) => ({
            section: sectionBook.add(section.id),
            heading: section.heading,
            writtenBy: section.writtenBy,
          })),
        }
      : {
          topic: topics.add(focused.id),
          name: focused.name,
          version: focused.version,
          sections: focused.sections.reduce<
            {
              section: string;
              heading: string | null;
              writtenBy: 'nomos' | 'person';
              markdown: string;
              sourceAliases: string[];
            }[]
          >((kept, section) => {
            const used = kept.reduce(
              (sum, entry) => sum + entry.markdown.length,
              0,
            );
            const room = MAX_TOPIC_DOCUMENT_CHARS - used;
            return room <= 0
              ? kept
              : [
                  ...kept,
                  {
                    section: sectionBook.add(section.id),
                    heading: section.heading,
                    writtenBy: section.writtenBy,
                    markdown: section.markdown.slice(0, room),
                    sourceAliases: [
                      parts.add(focused.id),
                      ...section.noteIds
                        .filter((id) => noteIds.has(id))
                        .map((id) => notes.add(id)),
                    ],
                  },
                ];
          }, []),
        };
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
            input.projects
              .slice(0, MAX_CONTEXT_PROJECTS)
              .map(({ name, milestones }) =>
                milestones.length > 0 ? { name, milestones } : { name },
              ),
          )}</open_projects>`,
        ]
      : []),
    ...(input.topics?.length
      ? [
          `<your_topics>${toDataJson(
            input.topics.slice(0, MAX_CONTEXT_TOPICS).map((topic) => ({
              alias: topics.add(topic.id),
              name: topic.name,
              path: topic.path,
            })),
          )}</your_topics>`,
        ]
      : []),
    ...(input.notes?.length
      ? [`<related_notes>${toDataJson(noteRecords)}</related_notes>`]
      : []),
    ...(topicDocument
      ? [`<topic_document>${toDataJson(topicDocument)}</topic_document>`]
      : []),
    ...(input.attachments?.length
      ? [`<attachments>${toDataJson(input.attachments)}</attachments>`]
      : []),
    ...(input.files?.length
      ? [`<files>${toDataJson(input.files)}</files>`]
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
  return {
    message,
    aliases,
    synced,
    facts,
    keyDates,
    topics,
    notes,
    parts,
    sections: sectionBook,
    focus: focused ? { id: focused.id, version: focused.version } : null,
  };
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
