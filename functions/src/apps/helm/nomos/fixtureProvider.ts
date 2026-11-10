import type {
  ModelProvider,
  ToolLoopRequest,
} from '../../../ai/modelProvider.js';
import { EMPTY_USAGE } from '../../../ai/models.js';
import { toSenderName } from './answerGuards.js';
import type { CaptureReading } from './commands.js';

const SPLIT_RE = /\n|,(?!\d)|\band\b/gi;
const FILLER = new Set([
  'the',
  'a',
  'an',
  'thing',
  'things',
  'stuff',
  'with',
  'of',
  'that',
  'this',
  'it',
  'um',
  'uh',
]);

const ANSWER_DELAY_MS = { quick: 400, interpret: 1_200 };
const HAND_OVER_PIECES = 3;

const waitOrAbort = (delayMs: number, signal?: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    if (signal?.aborted) return resolve(true);
    const done = (isAborted: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(isAborted);
    };
    const onAbort = () => done(true);
    const timer = setTimeout(() => done(false), delayMs);
    signal?.addEventListener('abort', onAbort);
  });

const hasMeaning = (title: string) =>
  /\p{L}/u.test(title) &&
  title
    .toLowerCase()
    .split(/\s+/)
    .some((word) => !FILLER.has(word.replace(/[^\p{L}\p{N}]/gu, '')));

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];

interface ScreenBlock {
  focus: { alias: string } | null;
  visible: { alias: string; position: number }[];
}

const readBlock = <T>(message: string, tag: string): T | null => {
  const match = message.match(new RegExp(`<${tag}>(.*)</${tag}>`));
  try {
    return match ? (JSON.parse(match[1]) as T) : null;
  } catch {
    return null;
  }
};

const toUpdate = (
  alias: string,
  dueSpanId: string | null,
  isUrgent: true | null,
) => ({
  kind: 'updateTask',
  ref: null,
  taskAlias: alias,
  title: null,
  dueSpanId,
  isUrgent,
});

/** The follow-ups a page makes possible, read from the context blocks: "move this to Saturday", "make it urgent", "the second one is done", "this is done". Null when the words are none of them or what they point at is missing. */
function readFollowUp(text: string, reading: CaptureReading, message: string) {
  const screen = readBlock<ScreenBlock>(message, 'screen');
  const earlier = readBlock<{ records: string[] }[]>(message, 'earlier_turns');
  const focus = screen?.focus?.alias ?? null;
  const lastMade = earlier?.[earlier.length - 1]?.records.at(-1) ?? null;
  const ordinal = ORDINALS.findIndex((word) =>
    new RegExp(`\\b${word} one is done\\b`, 'i').test(text),
  );
  const span = reading.dates[0];
  if (/\bmove (this|it|that) to\b/i.test(text)) {
    return focus && span ? [toUpdate(focus, span.id, null)] : [];
  }
  const urgentTarget = focus ?? lastMade;
  if (/\bmake (this|it|that) urgent\b/i.test(text)) {
    return urgentTarget ? [toUpdate(urgentTarget, null, true)] : [];
  }
  const isPointedDone = /\b(this is done|done with (this|it))\b/i.test(text);
  const target =
    ordinal >= 0
      ? (screen?.visible.find((entry) => entry.position === ordinal + 1)
          ?.alias ?? null)
      : isPointedDone
        ? focus
        : null;
  return target
    ? [
        {
          kind: 'completeTask',
          ref: null,
          taskAlias: target,
          title: null,
          dueSpanId: null,
          isUrgent: null,
        },
      ]
    : ordinal >= 0 || isPointedDone
      ? []
      : null;
}

interface ListedRecord {
  alias: string;
  title: string;
  due?: string | null;
  start?: string | null;
  isAllDay?: boolean;
}

const QUESTION_WORDS = new Set(
  'when whens is are the a an my our of for to who pays should i how long what do does it that this'.split(
    ' ',
  ),
);

/** "Friday, November 13 at 2 PM" from a day, a local "YYYY-MM-DD HH:mm" or an ISO instant. */
const toWhen = (record: ListedRecord, timeZone: string) => {
  const value = record.start ?? record.due ?? null;
  if (!value) return null;
  const isDay = value.length === 10;
  const isInstant = !isDay && value.endsWith('Z');
  const at = new Date(
    isDay
      ? `${value}T00:00:00Z`
      : isInstant
        ? value
        : `${value.replace(' ', 'T')}:00Z`,
  );
  if (Number.isNaN(at.getTime())) return null;
  const zone = isInstant ? timeZone : 'UTC';
  const day = at.toLocaleDateString('en-US', {
    timeZone: zone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  if (isDay) return day;
  const time = at
    .toLocaleTimeString('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(':00', '');
  return `${day} at ${time}`;
};

const describeRecord = (record: ListedRecord, timeZone: string) => {
  const when = toWhen(record, timeZone);
  return when
    ? `${record.title} is on ${when}.`
    : `${record.title} is on your list with no day set.`;
};

const GENERAL_STAND_IN = {
  text: 'As a rule of thumb it depends on the details, so check a reliable source for the specifics. This is a stand-in answer from the emulator.',
  spoken: 'As a rule of thumb it depends on the details.',
};

const toAnswer = (fields: Partial<Record<string, unknown>>) => ({
  kind: 'answer',
  ref: null,
  taskAlias: null,
  title: null,
  dueSpanId: null,
  isUrgent: null,
  scope: null,
  question: null,
  isHealth: false,
  fromRecordsText: null,
  sourceAliases: [],
  quoteAliases: [],
  generalText: null,
  generalSpoken: null,
  statement: null,
  quoteAlias: null,
  aboutAlias: null,
  aboutField: null,
  value: null,
  ...fields,
});

const MAIL_QUESTION_RE = /\b(tasting|e-?mails?|mailed)\b/i;

interface MailResult {
  alias: string;
  from: string;
  subject: string;
  snippet: string;
}

const callJson = async <T>(
  client: ToolLoopRequest['mcpClient'],
  toolCalls: string[],
  name: string,
  args: Record<string, unknown>,
): Promise<T | null> => {
  toolCalls.push(name);
  try {
    const result = await client.callTool({ name, arguments: args });
    const [part] = result.content as { type: string; text?: string }[];
    return result.isError || part?.type !== 'text'
      ? null
      : (JSON.parse(part.text ?? 'null') as T);
  } catch {
    return null;
  }
};

/** The emulator's stand-in for a model that reaches for the mail tools: searches, takes the one message from a business that fits the question (the others are untrusted and ignored), finds the calendar event it is about, and files an answer quoting the email with the one time that differs. Null when mail is not offered or nothing fits. */
async function readMailAnswer(
  text: string,
  client: ToolLoopRequest['mcpClient'] | undefined,
  toolCalls: string[],
) {
  const question = text.trim();
  if (!client || !MAIL_QUESTION_RE.test(question)) return null;
  const offered = (await client.listTools().catch(() => ({ tools: [] }))).tools;
  if (!offered.some((tool) => tool.name === 'search_mail')) return null;
  const found = await callJson<{ messages?: MailResult[] }>(
    client,
    toolCalls,
    'search_mail',
    { query: question.match(/tasting|bakery|cake/i)?.[0] ?? 'tasting' },
  );
  const message = found?.messages?.find((entry) =>
    /bakery|tasting/i.test(`${entry.from} ${entry.subject}`),
  );
  if (!message) return null;
  const time = message.snippet
    .match(/\b(\d{1,2}(?::\d{2})?)\s*([AP])\.?M\b/i)
    ?.slice(1, 3);
  const shownTime = time
    ? `${time[0].includes(':') ? time[0] : `${time[0]}:00`} ${time[1].toUpperCase()}M`
    : null;
  const synced = await callJson<{
    records?: { alias: string; kind: string }[];
  }>(client, toolCalls, 'search_synced', { query: 'tasting' });
  const event = synced?.records?.find((record) => record.kind === 'event');
  const sender = toSenderName(message.from);
  return [
    toAnswer({
      scope: 'yourThings',
      question,
      fromRecordsText: shownTime
        ? `An email from ${sender} says ${shownTime}.`
        : `${sender} emailed about it.`,
      sourceAliases: event ? [event.alias] : [],
      quoteAliases: [message.alias],
    }),
    ...(event && shownTime
      ? [
          toAnswer({
            kind: 'remember',
            statement: `${sender} says the ${shownTime} is when it starts.`,
            quoteAlias: message.alias,
            aboutAlias: event.alias,
            aboutField: 'startAt',
            value: shownTime,
          }),
        ]
      : []),
  ];
}

interface DocumentAsk {
  question: RegExp;
  query: string;
  title: RegExp;
  find: string;
  toText: (title: string) => string | null;
}

const DOCUMENT_ASKS: DocumentAsk[] = [
  {
    question: /\b(floor plan|seat|seats|seating)\b/i,
    query: 'floor plan',
    title: /floor plan/i,
    find: 'seats',
    toText: (title: string) => `The ${title} says the main hall seats 120.`,
  },
  {
    question: /\bbudget\b/i,
    query: 'budget',
    title: /budget/i,
    find: '',
    toText: () => null,
  },
  {
    question: /\b(contract|deposit|venue)\b/i,
    query: 'venue contract',
    title: /contract/i,
    find: 'deposit',
    toText: (title: string) =>
      `The ${title} says the deposit is due 30 days before the event.`,
  },
];

interface DocumentResult {
  alias: string;
  title: string;
  kind: string;
}

/** The emulator's stand-in for a model that reaches for the document tools: searches for the file the question names, reads a Google Doc or PDF around the words it is about and files an answer quoting the passage, or says a spreadsheet can't be read. Null when documents are not offered or nothing fits. */
async function readDocumentAnswer(
  text: string,
  client: ToolLoopRequest['mcpClient'] | undefined,
  toolCalls: string[],
) {
  const question = text.trim();
  const ask = DOCUMENT_ASKS.find((entry) => entry.question.test(question));
  if (!client || !ask) return null;
  const offered = (await client.listTools().catch(() => ({ tools: [] }))).tools;
  if (!offered.some((tool) => tool.name === 'search_documents')) return null;
  const found = await callJson<{ files?: DocumentResult[] }>(
    client,
    toolCalls,
    'search_documents',
    { query: ask.query },
  );
  const file = found?.files?.find((entry) => ask.title.test(entry.title));
  if (!file) return null;
  if (file.kind === 'other') {
    return [toAnswer({ scope: 'yourThings', question })];
  }
  const read = await callJson<{ passages?: { quote: string; text: string }[] }>(
    client,
    toolCalls,
    'read_document',
    { alias: file.alias, find: ask.find },
  );
  const passage = read?.passages?.[0];
  if (!passage) return null;
  return [
    toAnswer({
      scope: 'yourThings',
      question,
      fromRecordsText: ask.toText(file.title),
      quoteAliases: [passage.quote],
    }),
  ];
}

/** The emulator's stand-in answer to a question, from the records in the context; null when the text is not a question it knows. */
function readQuestion(text: string, message: string) {
  const question = text.trim();
  if (!question.endsWith('?')) return null;
  const lower = question.toLowerCase();
  const timeZone =
    readBlock<{ timeZone?: string }>(message, 'context')?.timeZone ?? 'UTC';
  const records = [
    ...(readBlock<ListedRecord[]>(message, 'open_tasks') ?? []),
    ...(readBlock<ListedRecord[]>(message, 'synced_records') ?? []),
  ];
  const words = lower
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !QUESTION_WORDS.has(word));
  const scored = records.map((record) => ({
    record,
    score: words.filter((word) => record.title.toLowerCase().includes(word))
      .length,
  }));
  const best = Math.max(0, ...scored.map((entry) => entry.score));
  const matches =
    best > 0 && best >= words.length / 2
      ? scored
          .filter((entry) => entry.score === best)
          .map((entry) => entry.record)
      : [];
  const [match] = matches;
  const fromRecords = match ? describeRecord(match, timeZone) : null;
  const sourced = {
    fromRecordsText: fromRecords,
    sourceAliases: match ? matches.map((record) => record.alias) : [],
  };
  const general = {
    generalText: GENERAL_STAND_IN.text,
    generalSpoken: GENERAL_STAND_IN.spoken,
  };
  if (/\b(ibuprofen|medicine|dose|doctor)\b/.test(lower)) {
    return toAnswer({
      scope: 'theWorld',
      question,
      isHealth: true,
      ...general,
    });
  }
  if (/\b(who pays|should i)\b/.test(lower) && match) {
    return toAnswer({ scope: 'both', question, ...sourced, ...general });
  }
  if (/^(when is|when's|whens)\b/.test(lower)) {
    return toAnswer({ scope: 'yourThings', question, ...sourced });
  }
  if (/^(how long|what is|how do)\b/.test(lower)) {
    return toAnswer({ scope: 'theWorld', question, ...general });
  }
  return null;
}

/** Emulator stand-in with no key: one createTask per comma (not one inside a number), "and" or line, each carrying the date span that lies inside it; a piece of only filler words or no letters makes none. */
export function createFixtureProvider(
  text: string,
  reading: CaptureReading,
): ModelProvider {
  return {
    runToolLoop: async ({ role, messages, signal, mcpClient }) => {
      const delayMs =
        role === 'quick' ? ANSWER_DELAY_MS.quick : ANSWER_DELAY_MS.interpret;
      if (await waitOrAbort(delayMs, signal)) {
        return {
          terminalInput: null,
          terminalName: null,
          endedBy: 'aborted',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const followUp = readFollowUp(text, reading, messages[0]?.content ?? '');
      if (followUp) {
        return {
          terminalInput: { commands: followUp },
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const toolCalls: string[] = [];
      const mail = await readMailAnswer(text, mcpClient, toolCalls);
      if (mail) {
        return {
          terminalInput: { commands: mail },
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls,
        };
      }
      const document = mail
        ? null
        : await readDocumentAnswer(text, mcpClient, toolCalls);
      if (document) {
        return {
          terminalInput: { commands: document },
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls,
        };
      }
      const answer = readQuestion(text, messages[0]?.content ?? '');
      if (answer) {
        return {
          terminalInput: { commands: [answer] },
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const cuts = [...text.matchAll(SPLIT_RE)].map(
        (match): [number, number] => [
          match.index,
          match.index + match[0].length,
        ],
      );
      const bounds: [number, number][] = [
        [0, cuts[0]?.[0] ?? text.length],
        ...cuts.map(([, end], index): [number, number] => [
          end,
          cuts[index + 1]?.[0] ?? text.length,
        ]),
      ];
      const commands = bounds.flatMap(([start, end], index) => {
        const spans = reading.dates.filter(
          (span) => span.start >= start && span.end <= end,
        );
        const title = spans
          .reduce(
            (rest, span) => rest.replace(span.text, ' '),
            text.slice(start, end),
          )
          .replace(/[@#^!]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return hasMeaning(title)
          ? [
              {
                kind: 'createTask',
                ref: `$new${index + 1}`,
                taskAlias: null,
                title: title.charAt(0).toUpperCase() + title.slice(1),
                dueSpanId: spans[0]?.id ?? null,
                isUrgent: null,
              },
            ]
          : [];
      });
      const isHandOver = role === 'quick' && commands.length > HAND_OVER_PIECES;
      return {
        terminalInput: isHandOver
          ? { reason: 'More than a few changes' }
          : { commands },
        terminalName: isHandOver ? 'hand_over' : 'file_results',
        endedBy: 'terminal',
        errorCode: null,
        usage: EMPTY_USAGE,
        toolCalls: [],
      };
    },
  };
}
