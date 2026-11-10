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
  const own = readSelfAnswer(question, words, message);
  if (own) return own;
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

const PLAN_DAY_RE =
  /^\s*(?:please\s+)?plan\s+(?:my\s+day|today|tomorrow|(?:my\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b(?!['’]s)/i;

const AT_HOME_RE =
  /^\s*(?:i['’]?m|i am|just got|i just got|got)\s+home\b[\s.!]*$/i;

/** The emulator's stand-in for "I'm home" or "just got home": one setCurrentPlace for home. Null for any other words. */
const readAtHome = (text: string) =>
  AT_HOME_RE.test(text)
    ? [toAnswer({ kind: 'setCurrentPlace', place: 'home', isHealth: null })]
    : null;

const FACT_RE =
  /^\s*(@?[A-Z][\p{L}'’.-]*(?: [A-Z][\p{L}'’.-]*)*)\s+is\s+(?:the|a|an)\s+[^?]+?\s*[.!]?\s*$/u;

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

/** The emulator's stand-in for "Dana is the florist" or "Dana is a florist": one noteFact, stated, quoting the words, about the name that starts them. Null for any other words. */
const readFact = (text: string) => {
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
const readSelfFact = (text: string) => {
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

/** The emulator's stand-in for "Dana's birthday is June 3", "our anniversary is June 20" or "Miso's gotcha day is Dec 3": one setKeyDate on the date span the words end with, about the name that starts them or the person. "Remove Dana's birthday" removes the one in context. Null for any other words. */
const readKeyDate = (
  text: string,
  reading: CaptureReading,
  message: string,
) => {
  const removal = REMOVE_KEY_DATE_RE.exec(text);
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
  const match = KEY_DATE_RE.exec(text);
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
      const packed = readPackingAnswer(messages[0]?.content ?? '');
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
      const keyDate = readKeyDate(text, reading, messages[0]?.content ?? '');
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
        readContradiction(text, messages[0]?.content ?? '') ??
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
      const entities = readEntities(text, reading);
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
