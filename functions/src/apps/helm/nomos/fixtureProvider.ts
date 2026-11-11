import {
  messageText,
  type ModelProvider,
  type ToolLoopRequest,
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

const KNOWN_MENTIONS = [
  { name: 'Dana', kind: 'person', species: null, organizationKind: null },
  { name: 'Miso', kind: 'pet', species: 'cat', organizationKind: null },
  {
    name: 'Acme Bakery',
    kind: 'organization',
    species: null,
    organizationKind: 'bakery',
  },
] as const;

const PLACE_RE = /\bat the ((?:[A-Z]\p{L}+)(?: [A-Z]\p{L}+)*)/gu;

/** The people, pets, organizations and places the emulator can tell from words alone: the reading's @ people and # places, three known names (Dana, Miso, Acme Bakery) and "at the Capitalized Name". */
const readEntities = (text: string, reading: CaptureReading) => {
  const mentions = [
    ...KNOWN_MENTIONS.filter((entry) => text.includes(entry.name)),
    ...reading.people.map((token) => ({
      name: token.text.replace(/^@/, ''),
      kind: 'person',
      species: null,
      organizationKind: null,
    })),
  ].map((entry, index) => ({
    ref: `$w${index + 1}`,
    relation: null,
    ...entry,
  }));
  const names = [
    ...[...text.matchAll(PLACE_RE)].map((match) => match[1]),
    ...reading.places.map((token) => token.text.replace(/^#/, '')),
  ].filter(
    (name, index, all) =>
      all.indexOf(name) === index &&
      !mentions.some((mention) => mention.name === name),
  );
  const places = names.map((name, index) => ({ ref: `$p${index + 1}`, name }));
  return { mentions, places };
};

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
  differsFromNoteAlias: null,
  differsSays: null,
  suggestedTopicAlias: null,
  statement: null,
  quoteAlias: null,
  aboutAlias: null,
  aboutField: null,
  value: null,
  ...fields,
});

const toAsk = (fields: Partial<Record<string, unknown>>) =>
  toAnswer({
    kind: 'ask',
    isHealth: null,
    shape: null,
    prompt: null,
    options: [],
    allowsSomethingElse: null,
    recordKinds: null,
    dateMode: null,
    numberMin: null,
    numberMax: null,
    unit: null,
    isMoney: null,
    decimals: null,
    ...fields,
  });

const PACKING_PROMPT = 'Which of these should go on the packing list?';
const PACKING_RE = /\bpack\b.*\btahoe\b/i;

const packingOption = (label: string) => ({
  label,
  detail: null,
  recordAlias: null,
});

/** The emulator's two questions for "Help me pack for the Tahoe trip": what goes on the list, and how many nights. */
const readPackingAsks = (text: string) =>
  PACKING_RE.test(text)
    ? [
        toAsk({
          shape: 'pickSeveral',
          prompt: PACKING_PROMPT,
          options: ['Snow chains', 'Sunscreen', 'Board games'].map(
            packingOption,
          ),
        }),
        toAsk({
          shape: 'number',
          prompt: 'How many nights?',
          unit: 'nights',
          numberMin: 1,
          numberMax: 30,
        }),
      ]
    : null;

/** The tasks for the items picked in answer to the packing question, read from the context's answered question; any other answered question files nothing, and null means the turn answers no question. */
const readPackingAnswer = (message: string) => {
  const line = readBlock<string>(message, 'answered_question');
  if (line === null) return null;
  if (!line.includes(PACKING_PROMPT)) return [];
  const options = (line.match(/Options: ([^·]*)/)?.[1] ?? '')
    .split(', ')
    .map((label) => label.trim());
  const answer = line.split('Answer: ')[1] ?? '';
  return options
    .filter((label) => label && answer.includes(label))
    .map((label, index) => ({
      kind: 'createTask',
      ref: `$new${index + 1}`,
      taskAlias: null,
      title: `Pack ${label.toLowerCase()}`,
      dueSpanId: null,
      isUrgent: null,
      whoRefs: [],
      placeRefs: [],
    }));
};

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

interface ListedSelfFact {
  alias: string;
  kind: string;
  topic: string | null;
  value: string | null;
  by: string;
}

/** "Where should I get gas?" answered from the person's own preference on that topic, or plainly not known yet; null for any other question. */
function readSelfAnswer(question: string, words: string[], message: string) {
  const asked = /^where should i get (\p{L}+)/iu.exec(question);
  if (!asked) return null;
  const own = (readBlock<ListedSelfFact[]>(message, 'about_you') ?? []).find(
    (fact) =>
      fact.kind === 'preference' &&
      fact.value !== null &&
      (fact.topic ?? '')
        .split(' ')
        .some((word) => word.length > 2 && words.includes(word)),
  );
  if (own?.value) {
    return toAnswer({
      scope: 'yourThings',
      question,
      fromRecordsText:
        own.by === 'inferred'
          ? `It looks like you usually go to ${own.value}.`
          : `You usually go to ${own.value}.`,
      sourceAliases: [own.alias],
    });
  }
  return toAnswer({
    scope: 'theWorld',
    question,
    generalText: `I don't know where you like to get ${asked[1].toLowerCase()} yet.`,
  });
}

interface ListedNote {
  alias: string;
  title: string;
  body?: string;
}

const DIFFERING_GENERAL = {
  text: 'Published guides often give a shorter time than that, so check a reliable source for the specifics. This is a stand-in answer from the emulator.',
  spoken: 'Published guides often give a shorter time than that.',
};

/** A question a kept note answers: cited as a record, and with "guide", "official", "really" or "recommend" in it a general part that says the note differs. Null when no note's words cover half the question's. */
function readNoteAnswer(question: string, words: string[], message: string) {
  const found = (readBlock<ListedNote[]>(message, 'related_notes') ?? []).find(
    (note) =>
      note.body !== undefined &&
      words.filter((word) =>
        `${note.title} ${note.body}`.toLowerCase().includes(word),
      ).length >= Math.max(1, words.length / 2),
  );
  if (!found?.body) return null;
  const says = found.body.replace(/\s+/g, ' ').trim();
  const records = {
    fromRecordsText: says.slice(0, 1_100),
    sourceAliases: [found.alias],
  };
  return /\b(guide|guides|official|really|recommend)\b/i.test(question)
    ? toAnswer({
        scope: 'both',
        question,
        ...records,
        generalText: DIFFERING_GENERAL.text,
        generalSpoken: DIFFERING_GENERAL.spoken,
        differsFromNoteAlias: found.alias,
        differsSays: says.split(/(?<=[.!?])\s/)[0].slice(0, 80),
      })
    : toAnswer({ scope: 'yourThings', question, ...records });
}

interface ListedPart {
  heading: string | null;
  markdown: string;
  sourceAliases: string[];
}

function readPartAnswer(question: string, words: string[], message: string) {
  const document = readBlock<{ sections: ListedPart[] }>(
    message,
    'topic_document',
  );
  const found = document?.sections.find(
    (part) =>
      part.sourceAliases.length > 0 &&
      words.some((word) =>
        `${part.heading ?? ''} ${part.markdown}`.toLowerCase().includes(word),
      ),
  );
  if (!found) return null;
  return toAnswer({
    scope: 'yourThings',
    question,
    fromRecordsText: found.markdown
      .replace(/[*_`#>]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1_100),
    sourceAliases: [found.sourceAliases[0]],
  });
}

/** The alias of the first topic whose name shares its first four letters with a word of the question; null when none does. */
const readSuggestedTopic = (words: string[], message: string) =>
  (readBlock<{ alias: string; name: string }[]>(message, 'your_topics') ?? [])
    .filter((topic) =>
      (topic.name.toLowerCase().match(/\p{L}+/gu) ?? []).some((nameWord) =>
        words.some(
          (word) =>
            word.length >= 4 &&
            nameWord.length >= 4 &&
            word.slice(0, 4) === nameWord.slice(0, 4),
        ),
      ),
    )
    .map((topic) => topic.alias)[0] ?? null;

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
  const fromPart = readPartAnswer(question, words, message);
  if (fromPart) return fromPart;
  const own = readSelfAnswer(question, words, message);
  if (own) return own;
  const fromNote = readNoteAnswer(question, words, message);
  if (fromNote) return fromNote;
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
    suggestedTopicAlias: readSuggestedTopic(words, message),
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

const PLAN_DAY_RE =
  /^\s*(?:please\s+)?plan\s+(?:my\s+day|today|tomorrow|(?:my\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b(?!['’]s)/i;

const AT_HOME_RE =
  /^\s*(?:i['’]?m|i am|just got|i just got|got)\s+home\b[\s.!]*$/i;

/** The emulator's stand-in for "I'm home" or "just got home": one setCurrentPlace for home. Null for any other words. */
const readAtHome = (text: string) =>
  AT_HOME_RE.test(text)
    ? [toAnswer({ kind: 'setCurrentPlace', place: 'home', isHealth: null })]
    : null;

const LEAD_RE = /^\s*(?:please\s+)?(?:remember\s+that|note\s*(?:that|:))\s+/i;

const withoutLead = (text: string) => text.replace(LEAD_RE, '');

const FACT_RE =
  /^\s*(@?[A-Z][\p{L}'’.-]*(?: [A-Z][\p{L}'’.-]*)*)\s+is\s+(?:(?:the|a|an)|allergic\s+to)\s+[^?]+?\s*[.!]?\s*$/u;

const NOT_NAMES = new Set([
  'It',
  'This',
  'That',
  'There',
  'Here',
  'He',
  'She',
  'They',
  'Who',
  'What',
  'Where',
  'When',
  'Why',
  'How',
  'Today',
  'Tomorrow',
]);

/** The emulator's stand-in for "Dana is the florist" or "Dana is a florist": one noteFact, stated, quoting the words, about the name that starts them ("Dana is allergic to nuts" too). Null for any other words. */
const readFact = (said: string) => {
  const text = withoutLead(said);
  const match = FACT_RE.exec(text);
  const handle = match?.[1];
  const name = handle?.replace(/^@/, '');
  if (!match || !handle || !name || NOT_NAMES.has(name)) return null;
  const quote = text.trim().replace(/[.!]$/, '');
  const known = KNOWN_MENTIONS.find((entry) => entry.name === name);
  return {
    commands: [
      toAnswer({
        kind: 'noteFact',
        statement: quote.replace(/^@/, ''),
        quote,
        isStated: true,
        isHealth: null,
        whoRefs: ['$w1'],
        placeRefs: [],
        factKind: 'world',
        topic: null,
        value: null,
        isSensitive: false,
        isAboutMe: false,
        contradicts: null,
      }),
    ],
    mentions: [
      {
        ref: '$w1',
        name,
        kind: known?.kind ?? 'person',
        relation: null,
        species: known?.species ?? null,
        organizationKind: known?.organizationKind ?? null,
      },
    ],
    places: [],
  };
};

const PREFERENCE_RE =
  /^\s*i\s+(?:always|usually)\s+go\s+to\s+(.+?)\s+for\s+(.+?)\s*[.!]?\s*$/i;
const FAVORITE_RE = /^\s*my\s+favou?rite\s+(.+?)\s+is\s+(.+?)\s*[.!]?\s*$/i;
const IDENTITY_RE = /^\s*i(?:'m|’m| am)\s+(vegan|vegetarian)\s*[.!]?\s*$/i;
const SENSITIVE_ME_RE = /^\s*i\s+have\s+(diabetes)\s*[.!]?\s*$/i;
const SENSITIVE_OTHER_RE =
  /^\s*@?([A-Z][\p{L}'’.-]*)\s+(?:has diabetes|is pregnant)\s*[.!]?\s*$/u;

const TOPIC_NAMES: Record<string, string> = { gas: 'gas station' };

const upperFirst = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const toNoteFact = (fields: Record<string, unknown>) => ({
  kind: 'noteFact',
  isStated: true,
  isHealth: null,
  whoRefs: [],
  placeRefs: [],
  factKind: 'world',
  topic: null,
  value: null,
  isSensitive: false,
  isAboutMe: true,
  contradicts: null,
  ...fields,
});

interface ListedFact {
  alias: string;
  subject: string;
  statement: string;
}

const NOW_AFTER_RE =
  /^\s*(?:@?([A-Z][\p{L}'’.-]*)\s+says\s+)?(.+?)\s+(is|are)\s+(.+?)\s+now\s*[.!]?\s*$/u;
const NOW_BEFORE_RE =
  /^\s*(?:@?([A-Z][\p{L}'’.-]*)\s+says\s+)?(.+?)\s+(is|are)\s+now\s+(.+?)\s*[.!]?\s*$/u;

const toPhrase = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/^(?:the|a|an)\s+/, '');

/** The emulator's stand-in for "Dana says centerpieces are $2,100 now" or "The venue is now X": one noteFact that says it contradicts the fact in context about the same thing (the words before is or are). Null when no fact in context is about it. */
const readContradiction = (text: string, message: string) => {
  const match = NOW_BEFORE_RE.exec(text) ?? NOW_AFTER_RE.exec(text);
  if (!match) return null;
  const [, named, about, verb, value] = match;
  const phrase = toPhrase(about);
  const facts = readBlock<ListedFact[]>(message, 'known_facts') ?? [];
  const other = facts.find((fact) => {
    const lead = /^(.+?)\s+(?:is|are)\s/i.exec(fact.statement)?.[1];
    return (
      lead !== undefined &&
      toPhrase(lead) === phrase &&
      (!named || fact.subject === named)
    );
  });
  if (!other) return null;
  const known = KNOWN_MENTIONS.find((entry) => entry.name === other.subject);
  const quote = text.trim().replace(/[.!]$/, '');
  return {
    commands: [
      toNoteFact({
        statement: `${upperFirst(about.trim())} ${verb} ${value.trim()}`,
        quote,
        whoRefs: ['$w1'],
        isAboutMe: false,
        contradicts: other.alias,
      }),
    ],
    mentions: [
      {
        ref: '$w1',
        name: other.subject,
        kind: known?.kind ?? 'person',
        relation: null,
        species: known?.species ?? null,
        organizationKind: known?.organizationKind ?? null,
      },
    ],
    places: [],
  };
};

/** The emulator's stand-in for the facts a person says about themself ("I always go to Shell for gas", "my favorite movie is Arrival", "I'm vegan", "I have diabetes") and the private detail said about a named person ("Dana has diabetes"): one noteFact, stated, quoting the words. Null for any other words. */
const readSelfFact = (said: string) => {
  const text = withoutLead(said);
  const quote = text.trim().replace(/[.!]$/, '');
  const preference = PREFERENCE_RE.exec(text);
  if (preference) {
    const [, value, about] = preference;
    return {
      commands: [
        toNoteFact({
          statement: `Goes to ${value} for ${about.toLowerCase()}`,
          quote,
          factKind: 'preference',
          topic: TOPIC_NAMES[about.toLowerCase()] ?? about.toLowerCase(),
          value: upperFirst(value),
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  const favorite = FAVORITE_RE.exec(text);
  if (favorite) {
    const [, about, value] = favorite;
    const topic = about.toLowerCase();
    return {
      commands: [
        toNoteFact({
          statement: `Favorite ${topic} is ${value}`,
          quote,
          factKind: 'favorite',
          topic: topic.endsWith('s') ? topic : `${topic}s`,
          value,
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  const identity = IDENTITY_RE.exec(text);
  if (identity) {
    return {
      commands: [
        toNoteFact({
          statement: upperFirst(identity[1].toLowerCase()),
          quote,
          factKind: 'identity',
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  if (SENSITIVE_ME_RE.test(text)) {
    return {
      commands: [
        toNoteFact({
          statement: 'Has diabetes',
          quote,
          factKind: 'identity',
          isSensitive: true,
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  const other = SENSITIVE_OTHER_RE.exec(text);
  const name = other?.[1];
  if (!name || NOT_NAMES.has(name)) return null;
  const known = KNOWN_MENTIONS.find((entry) => entry.name === name);
  return {
    commands: [
      toNoteFact({
        statement: quote.replace(/^@/, ''),
        quote,
        factKind: 'identity',
        isSensitive: true,
        isAboutMe: false,
        whoRefs: ['$w1'],
      }),
    ],
    mentions: [
      {
        ref: '$w1',
        name,
        kind: known?.kind ?? 'person',
        relation: null,
        species: known?.species ?? null,
        organizationKind: known?.organizationKind ?? null,
      },
    ],
    places: [],
  };
};

const KEY_DATE_RE =
  /^\s*(?:(@?[A-Z][\p{L}'’.-]*(?: [A-Z][\p{L}'’.-]*)*)['’]s|(my|our))\s+(birthday|anniversary|gotcha day)\s+is\s+(.+?)\s*[.!]?\s*$/u;
const REMOVE_KEY_DATE_RE =
  /^\s*(?:remove|delete)\s+(@?[A-Z][\p{L}'’.-]*)['’]s\s+(birthday|anniversary|gotcha day)\s*[.!]?\s*$/iu;

interface ListedKeyDate {
  alias: string;
  who: string;
  kind: string;
  label: string | null;
}

const KEY_DATE_LABELS: Record<string, string> = {
  'gotcha day': 'Gotcha day',
};

const NAME_PATTERN = "@?[A-Z][\\p{L}'’.-]*(?: [A-Z][\\p{L}'’.-]*)*";
const MOMENT_PATTERNS: {
  re: RegExp;
  kind: (match: RegExpExecArray) => string;
}[] = [
  {
    re: new RegExp(
      `^\\s*(?:I|we)\\s+met\\s+(${NAME_PATTERN})\\s+(?:in|on)\\s+(.+?)\\s*[.!]?\\s*$`,
      'u',
    ),
    kind: () => 'met',
  },
  {
    re: new RegExp(
      `^\\s*(${NAME_PATTERN})\\s+and\\s+(?:I|me)\\s+met\\s+(?:in|on)\\s+(.+?)\\s*[.!]?\\s*$`,
      'u',
    ),
    kind: () => 'met',
  },
  {
    re: new RegExp(
      `^\\s*(${NAME_PATTERN})\\s+(?:passed away|graduated|moved|started a job|left a job|was adopted)\\s+(?:in|on)\\s+(.+?)\\s*[.!]?\\s*$`,
      'u',
    ),
    kind: (match) =>
      match[0].includes('passed away')
        ? 'passedAway'
        : match[0].includes('graduated')
          ? 'graduated'
          : match[0].includes('started a job')
            ? 'startedJob'
            : match[0].includes('left a job')
              ? 'leftJob'
              : match[0].includes('was adopted')
                ? 'adopted'
                : 'moved',
  },
  {
    re: new RegExp(
      `^\\s*(${NAME_PATTERN})\\s+was born\\s+(?:on\\s+)?(.+?)\\s*[.!]?\\s*$`,
      'u',
    ),
    kind: () => 'birthday',
  },
  {
    re: new RegExp(
      `^\\s*(${NAME_PATTERN})\\s+lived in\\s+([A-Z]\\p{L}+(?: [A-Z]\\p{L}+)*)\\s+(?:in|during)\\s+(.+?)\\s*[.!]?\\s*$`,
      'u',
    ),
    kind: () => 'custom',
  },
];

/** The emulator's stand-in for "I met Dana in March 2015", "Grandpa lived in Lisbon in the 80s", "Dana passed away in 2019" or "Mum was born June 3, 1958": one setKeyDate on the date span the words end with. Null for any other words. */
const readMoment = (text: string, reading: CaptureReading) => {
  const found = MOMENT_PATTERNS.flatMap(({ re, kind }) => {
    const match = re.exec(text);
    return match ? [{ match, kind: kind(match) }] : [];
  })[0];
  if (!found) return null;
  const { match, kind } = found;
  const name = match[1].replace(/^@/, '');
  const place = kind === 'custom' ? match[2] : null;
  const said = match[match.length - 1];
  const span = reading.dates.find(
    (entry) => entry.start >= text.lastIndexOf(said),
  );
  if (!span || NOT_NAMES.has(name)) return null;
  const known = KNOWN_MENTIONS.find((entry) => entry.name === name);
  return {
    commands: [
      toAnswer({
        kind: 'setKeyDate',
        isHealth: null,
        whoRefs: ['$w1'],
        isAboutMe: false,
        keyDateKind: kind,
        keyDateLabel: place ? `Lived in ${place}` : null,
        dateSpanId: span.id,
        comesBack: kind === 'custom' ? false : null,
        quote: text.trim().replace(/[.!]$/, ''),
      }),
    ],
    mentions: [
      {
        ref: '$w1',
        name,
        kind: known?.kind ?? 'person',
        relation: null,
        species: known?.species ?? null,
        organizationKind: known?.organizationKind ?? null,
      },
    ],
    places: [],
  };
};

const START_PROJECT_RE =
  /^\s*start a project for (?:the |my |our )?(.+?)[.!]?\s*$/i;
const PROJECT_KEY_RE =
  /^\s*@?(\p{Lu}\p{L}+) is key for (?:the |my |our )?(.+?)[.!]?\s*$/iu;

const MILESTONE_DUE_RE =
  /^\s*(.+?) is due (.+?) for (?:the |my |our )?(.+?)[.!]?\s*$/i;
const MILESTONE_LABELLED_RE =
  /^\s*milestone for (?:the |my |our )?(.+?):\s*(.+?) on (.+?)[.!]?\s*$/i;

const toProjectName = (words: string) =>
  words.charAt(0).toUpperCase() + words.slice(1);

/** One addMilestone from "The venue deposit is due March 3 for the wedding" or "Milestone for the wedding: Venue booked on March 3", dated by the span the words end with. */
const readMilestone = (text: string, reading: CaptureReading) => {
  const due = MILESTONE_DUE_RE.exec(text);
  const labelled = due ? null : MILESTONE_LABELLED_RE.exec(text);
  const [title, said, project] = due
    ? [due[1], due[2], due[3]]
    : labelled
      ? [labelled[2], labelled[3], labelled[1]]
      : [];
  if (!title || !said || !project) return null;
  const span = reading.dates.find(
    (entry) => entry.start >= text.lastIndexOf(said),
  );
  return {
    commands: [
      toAnswer({
        kind: 'addMilestone',
        isHealth: null,
        title: toProjectName(title),
        projectRef: toProjectName(project),
        dueSpanId: span?.id ?? null,
      }),
    ],
    mentions: [],
    places: [],
  };
};

/** The emulator's stand-in for "Start a project for the move" (one createProject), "Dana is key for the wedding" (one setProjectRole) and a milestone (one addMilestone). Null for any other words. */
const readProject = (text: string, reading: CaptureReading) => {
  const start = START_PROJECT_RE.exec(text);
  if (start) {
    return {
      commands: [
        toAnswer({
          kind: 'createProject',
          isHealth: null,
          title: toProjectName(start[1]),
          dueSpanId: null,
          projectEmoji: null,
          objective: null,
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  const milestone = readMilestone(text, reading);
  if (milestone) return milestone;
  const key = PROJECT_KEY_RE.exec(text);
  if (!key || NOT_NAMES.has(key[1])) return null;
  const known = KNOWN_MENTIONS.find((entry) => entry.name === key[1]);
  return {
    commands: [
      toAnswer({
        kind: 'setProjectRole',
        isHealth: null,
        projectRef: toProjectName(key[2]),
        whoRefs: ['$w1'],
        role: 'key',
        roleNote: null,
      }),
    ],
    mentions: [
      {
        ref: '$w1',
        name: key[1],
        kind: known?.kind ?? 'person',
        relation: null,
        species: known?.species ?? null,
        organizationKind: known?.organizationKind ?? null,
      },
    ],
    places: [],
  };
};

/** The emulator's stand-in for "Dana's birthday is June 3", "our anniversary is June 20" or "Miso's gotcha day is Dec 3": one setKeyDate on the date span the words end with, about the name that starts them or the person. "Remove Dana's birthday" removes the one in context. Null for any other words. */
const readKeyDate = (
  text: string,
  reading: CaptureReading,
  message: string,
) => {
  const removal = REMOVE_KEY_DATE_RE.exec(withoutLead(text));
  if (removal) {
    const name = removal[1].replace(/^@/, '');
    const word = removal[2].toLowerCase();
    const listed = readBlock<ListedKeyDate[]>(message, 'key_dates') ?? [];
    const found = listed.find(
      (entry) =>
        entry.who === name &&
        (entry.kind === word || entry.label?.toLowerCase() === word),
    );
    return found
      ? {
          commands: [
            toAnswer({
              kind: 'removeKeyDate',
              isHealth: null,
              keyDateAlias: found.alias,
            }),
          ],
          mentions: [],
          places: [],
        }
      : null;
  }
  const match = KEY_DATE_RE.exec(withoutLead(text));
  if (!match) return readMoment(text, reading);
  const [, handle, owner, word, said] = match;
  const name = handle?.replace(/^@/, '');
  if (name && NOT_NAMES.has(name)) return null;
  const start = text.lastIndexOf(said);
  const span = reading.dates.find((entry) => entry.start >= start);
  if (!span) return null;
  const lower = word.toLowerCase();
  const known = KNOWN_MENTIONS.find((entry) => entry.name === name);
  return {
    commands: [
      toAnswer({
        kind: 'setKeyDate',
        isHealth: null,
        whoRefs: name ? ['$w1'] : [],
        isAboutMe: owner !== undefined,
        keyDateKind: lower === 'gotcha day' ? 'custom' : lower,
        keyDateLabel: KEY_DATE_LABELS[lower] ?? null,
        dateSpanId: span.id,
        comesBack: lower === 'gotcha day' ? true : null,
        quote: text.trim().replace(/[.!]$/, ''),
      }),
    ],
    mentions: name
      ? [
          {
            ref: '$w1',
            name,
            kind: known?.kind ?? 'person',
            relation: null,
            species: known?.species ?? null,
            organizationKind: known?.organizationKind ?? null,
          },
        ]
      : [],
    places: [],
  };
};

/** Topic words a body word stands for in the emulator, beside the words that share their first four letters. */
const NOTE_TOPIC_WORDS: Record<string, string> = {
  bread: 'baking',
  dough: 'baking',
  sourdough: 'baking',
  cake: 'baking',
  cookie: 'baking',
  sauce: 'kitchen',
  soup: 'kitchen',
};

interface ListedTopic {
  alias: string;
  name: string;
}

const stemOf = (word: string) => word.toLowerCase().slice(0, 4);

interface TopicDocBlock {
  topic: string;
  sections: { section: string; writtenBy: 'nomos' | 'person' }[];
}

const toTopicCommand = (fields: Record<string, unknown>) =>
  toAnswer({
    isHealth: null,
    topicAlias: null,
    parentAlias: null,
    childAliases: [],
    noteRef: null,
    afterSectionAlias: null,
    heading: null,
    markdown: null,
    changeSummary: null,
    requestQuote: null,
    topicChanges: [],
    ...fields,
  });

const topicNamed = (topics: ListedTopic[], words: string) =>
  topics.find((topic) =>
    words.toLowerCase().includes(topic.name.toLowerCase()),
  );

/** The emulator's stand-in for the four ways a topic grows: a fact said about a topic, "make the intro shorter" on an open topic, "put Washing under Car care", and "Running and Stretching could go under Fitness". Null for any other words. */
const readTopicWork = (text: string, message: string) => {
  const topics = readBlock<ListedTopic[]>(message, 'your_topics') ?? [];
  const document = readBlock<TopicDocBlock>(message, 'topic_document');
  const body = text.trim().replace(/[.!]+$/, '');
  const tyres = topicNamed(topics, 'car care');
  if (/\bwinter tyres? are\b/i.test(text) && tyres) {
    return {
      commands: [
        toAnswer({
          kind: 'createNote',
          title: upperFirst(body),
          bodyQuote: body,
          topicAliases: [tyres.alias],
          isHealth: null,
        }),
        toTopicCommand({
          kind: 'addToTopic',
          topicAlias: tyres.alias,
          noteRef: '$note1',
          heading: 'Winter tyre size',
          markdown: `${upperFirst(body)}.`,
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  const first = document?.sections.find(
    (entry, index) => index === 0 && entry.writtenBy === 'nomos',
  );
  if (/\bmake the intro shorter\b/i.test(text) && document) {
    return {
      commands: !first
        ? []
        : [
            toTopicCommand({
              kind: 'reviseTopic',
              topicAlias: document.topic,
              requestQuote: 'make the intro shorter',
              changeSummary: 'Shortened the intro',
              topicChanges: [
                {
                  kind: 'replace',
                  sectionAlias: first.section,
                  sectionAliases: [],
                  afterSectionAlias: null,
                  heading: null,
                  level: 2,
                  markdown: 'A shorter intro.',
                },
              ],
            }),
          ],
      mentions: [],
      places: [],
    };
  }
  const move = /\bput (.+?) under (.+?)[.!]*$/i.exec(text);
  const moved = move ? topicNamed(topics, move[1]) : undefined;
  const under = move ? topicNamed(topics, move[2]) : undefined;
  if (moved && under) {
    return {
      commands: [
        toTopicCommand({
          kind: 'moveTopic',
          topicAlias: moved.alias,
          parentAlias: under.alias,
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  const group = /^(.+?) and (.+?) could go under (.+?)[.!]*$/i.exec(text);
  const children = group
    ? [topicNamed(topics, group[1]), topicNamed(topics, group[2])]
    : [];
  if (group && children.every((child) => child)) {
    return {
      commands: [
        toTopicCommand({
          kind: 'createParentTopic',
          title: upperFirst(group[3].trim()),
          childAliases: children.map((child) => child?.alias),
        }),
      ],
      mentions: [],
      places: [],
    };
  }
  return null;
};

/** The emulator's stand-in for "remember that cakes keep 3 days in the fridge" or "note: the wifi at the cabin is …": one createNote of the words after the lead, filed under every topic whose name shares its first four letters with a word of them (or that a few kitchen words stand for). Null for any other words. */
const readNote = (text: string, message: string) => {
  const match = LEAD_RE.exec(text);
  const body = match ? text.slice(match[0].length).trim() : '';
  if (!match || !body) return null;
  const words = body.toLowerCase().match(/\p{L}+/gu) ?? [];
  const topics = readBlock<ListedTopic[]>(message, 'your_topics') ?? [];
  const matched = topics.filter((topic) =>
    (topic.name.toLowerCase().match(/\p{L}+/gu) ?? []).some((nameWord) =>
      words.some(
        (word) =>
          word.length >= 4 &&
          nameWord.length >= 4 &&
          (stemOf(word) === stemOf(nameWord) ||
            NOTE_TOPIC_WORDS[word.replace(/s$/, '')] === nameWord),
      ),
    ),
  );
  const title = upperFirst(body.replace(/[.!]+$/, ''));
  return {
    commands: [
      toAnswer({
        kind: 'createNote',
        title: title.length > 80 ? title.slice(0, 80).trim() : title,
        bodyQuote: body,
        topicAliases: matched.map((topic) => topic.alias),
        isHealth: null,
      }),
    ],
    mentions: [],
    places: [],
  };
};

/** The emulator's stand-in for "plan my day" or "plan tomorrow": one planDay on the day span the reading found, or today when it found none. Null for any other words. */
const readPlanDay = (text: string, reading: CaptureReading) =>
  PLAN_DAY_RE.test(text)
    ? [
        toAnswer({
          kind: 'planDay',
          dueSpanId: reading.dates[0]?.id ?? null,
          isHealth: null,
        }),
      ]
    : null;

/** Emulator stand-in with no key: one createTask per comma (not one inside a number), "and" or line, each carrying the date span that lies inside it; a piece of only filler words or no letters makes none. */
function createTextFixtureProvider(
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
      const packed = readPackingAnswer(messageText(messages[0]?.content ?? ''));
      const packingAsks = packed ? null : readPackingAsks(text);
      if (packed !== null || packingAsks) {
        return {
          terminalInput: { commands: packed ?? packingAsks ?? [] },
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const followUp = readFollowUp(
        text,
        reading,
        messageText(messages[0]?.content ?? ''),
      );
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
      const grown = readTopicWork(
        text,
        messageText(messages[0]?.content ?? ''),
      );
      if (grown) {
        return {
          terminalInput: grown,
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const atHome = readAtHome(text);
      if (atHome) {
        return {
          terminalInput: { commands: atHome },
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const project = readProject(text, reading);
      if (project) {
        return {
          terminalInput: project,
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const keyDate = readKeyDate(
        text,
        reading,
        messageText(messages[0]?.content ?? ''),
      );
      if (keyDate) {
        return {
          terminalInput: keyDate,
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const fact =
        readContradiction(text, messageText(messages[0]?.content ?? '')) ??
        readSelfFact(text) ??
        readFact(text);
      if (fact) {
        return {
          terminalInput: fact,
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const noted = readNote(text, messageText(messages[0]?.content ?? ''));
      if (noted) {
        return {
          terminalInput: noted,
          terminalName: 'file_results',
          endedBy: 'terminal',
          errorCode: null,
          usage: EMPTY_USAGE,
          toolCalls: [],
        };
      }
      const planDay = readPlanDay(text, reading);
      if (planDay) {
        return {
          terminalInput: { commands: planDay },
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
      const answer = readQuestion(
        text,
        messageText(messages[0]?.content ?? ''),
      );
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
      const entities = readEntities(text, reading);
      const openProjects = (
        readBlock<{ name: string }[]>(
          messageText(messages[0]?.content ?? ''),
          'open_projects',
        ) ?? []
      ).map((project) => project.name);
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
          .trim()
          .replace(/\s+(about|on|at|by|for)$/i, '');
        const piece = text.slice(start, end);
        const refsIn = <T extends { ref: string; name: string }>(
          entries: T[],
        ) =>
          entries.flatMap((entry) =>
            piece.toLowerCase().includes(entry.name.toLowerCase())
              ? [entry.ref]
              : [],
          );
        const forProject = /\bfor the ([a-z]+)\b/i.exec(piece)?.[1] ?? null;
        const projectRef = forProject
          ? (openProjects.find(
              (name) => name.toLowerCase() === forProject.toLowerCase(),
            ) ?? toProjectName(forProject))
          : null;
        return hasMeaning(title)
          ? [
              {
                kind: 'createTask',
                ref: `$new${index + 1}`,
                taskAlias: null,
                title: title.charAt(0).toUpperCase() + title.slice(1),
                dueSpanId: spans[0]?.id ?? null,
                isUrgent: null,
                whoRefs: refsIn(entities.mentions),
                placeRefs: refsIn(entities.places),
                projectRef,
              },
            ]
          : [];
      });
      const isHandOver = role === 'quick' && commands.length > HAND_OVER_PIECES;
      return {
        terminalInput: isHandOver
          ? { reason: 'More than a few changes' }
          : { commands, ...entities },
        terminalName: isHandOver ? 'hand_over' : 'file_results',
        endedBy: 'terminal',
        errorCode: null,
        usage: EMPTY_USAGE,
        toolCalls: [],
      };
    },
  };
}

const KEEP_PHOTO_RE = /\b(quote|receipt|letter|form|invoice|keep)\b/i;
const NOT_KEEP_PHOTO_RE = /\b(?:don'?t|do not) keep\b/i;

const wordsOf = (value: string) =>
  new Set(
    (
      value
        .toLowerCase()
        .replace(/'s\b/g, '')
        .match(/[a-z]{3,}/g) ?? []
    ).filter((word) => !FILLER.has(word) && !KEEP_PHOTO_RE.test(word)),
  );

/** Emulator stand-in for photos: words that call the photo a quote, receipt, letter, form or invoice (or say keep) keep each one on the first open task sharing a word with them, else on a task made from the words; any other photo is read and let go, and the usual splitter files the words. */
export function createFixtureProvider(
  text: string,
  reading: CaptureReading,
): ModelProvider {
  const base = createTextFixtureProvider(text, reading);
  return {
    runToolLoop: async (request) => {
      const result = await base.runToolLoop(request);
      const message = messageText(request.messages[0]?.content ?? '');
      const photos = readBlock<{ alias: string }[]>(message, 'attachments');
      if (
        !photos?.length ||
        result.endedBy !== 'terminal' ||
        result.terminalName !== 'file_results'
      ) {
        return result;
      }
      const isKeep = KEEP_PHOTO_RE.test(text) && !NOT_KEEP_PHOTO_RE.test(text);
      const mine = wordsOf(text);
      const task = isKeep
        ? (
            readBlock<{ alias: string; title: string }[]>(
              message,
              'open_tasks',
            ) ?? []
          ).find((entry) =>
            [...wordsOf(entry.title)].some((word) => mine.has(word)),
          )
        : undefined;
      const title = text.trim().replace(/[.!]+$/, '');
      const made = isKeep && !task && hasMeaning(title);
      const target = task?.alias ?? '$new1';
      const media = photos.map(({ alias }) => ({
        alias,
        decision: isKeep && (task || made) ? 'keep' : 'discard',
        caption: isKeep ? 'A photo you sent' : 'A screenshot',
        attachTo: isKeep && (task || made) ? [target] : [],
      }));
      if (!isKeep) {
        return {
          ...result,
          terminalInput: { ...(result.terminalInput as object), media },
        };
      }
      return {
        ...result,
        terminalInput: {
          commands: made
            ? [
                {
                  kind: 'createTask',
                  ref: '$new1',
                  taskAlias: null,
                  title: title.charAt(0).toUpperCase() + title.slice(1),
                  dueSpanId: null,
                  isUrgent: null,
                  whoRefs: [],
                  placeRefs: [],
                  projectRef: null,
                },
              ]
            : [],
          ...readEntities(text, reading),
          media,
        },
      };
    },
  };
}
