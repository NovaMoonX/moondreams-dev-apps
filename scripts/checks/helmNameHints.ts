// Names handed to the recognizer: nothing private, no health word or dose, even through a non-private record carrying the same word; the cut stays in budget and the order holds.
import assert from 'node:assert/strict';

import {
  buildNameHints,
  countHintTokens,
} from '../../src/lib/speech/nameHints.ts';
import { toRecognitionPhrases } from '../../src/hooks/useSpeechCommands.ts';
import { toListenUrl } from '../../src/lib/speech/voice/deepgramStream.ts';
import type { ScreenContext } from '../../src/apps/helm/types.ts';
import {
  readHelmNameHints,
  type NameHintState,
} from '../../src/apps/helm/utils/nameHints.ts';

import {
  readSpokenNames,
  readSwappedWords,
  readTypedHeardNames,
  type NameRecord,
} from '../../src/apps/helm/utils/spokenNames.ts';

const NOW = Date.UTC(2026, 10, 23, 12);
const UID = 'u1';
const DAY = 24 * 60 * 60 * 1000;

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const base = {
  createdAt: NOW - 90 * DAY,
  lastEditedAt: null,
  isUnreadable: false,
};
const ordinary = {
  privacy: 'ordinary',
  privateMark: null,
  isPrivacyCleared: false,
};
const marked = {
  privacy: 'private',
  privateMark: 'person',
  isPrivacyCleared: false,
};

const person = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  ...base,
  ...ordinary,
  id,
  kind: 'person',
  name,
  aliases: [],
  soundsLike: null,
  lastMentionedAt: null,
  ...extra,
});
const place = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  ...base,
  ...ordinary,
  id,
  name,
  aliases: [],
  ...extra,
});
const project = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  ...base,
  ...ordinary,
  id,
  name,
  status: 'active',
  ...extra,
});
const topic = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  ...base,
  ...ordinary,
  id,
  name,
  projectIds: [] as string[],
  ...extra,
});
const procedure = (
  id: string,
  title: string,
  extra: Record<string, unknown> = {},
) => ({
  ...base,
  ...ordinary,
  id,
  title,
  ...extra,
});
const loaded = (items: unknown[]) => ({
  items,
  isLoaded: true,
  isFailed: false,
});
const captures = (items: unknown[]) => ({
  captures: items,
  isLoaded: true,
  isFailed: false,
});
const capture = (whoIds: string[], placeIds: string[], daysAgo: number) => ({
  whoIds,
  placeIds,
  createdAt: NOW - daysAgo * DAY,
});

interface Parts {
  who?: unknown[];
  places?: unknown[];
  projects?: unknown[];
  topics?: unknown[];
  procedures?: unknown[];
  tasks?: unknown[];
  captures?: unknown[];
}
const toState = (parts: Parts): NameHintState =>
  ({
    profile: { assistantName: null },
    who: loaded(parts.who ?? []),
    places: loaded(parts.places ?? []),
    projects: loaded(parts.projects ?? []),
    topics: loaded(parts.topics ?? []),
    procedures: loaded(parts.procedures ?? []),
    openTasks: loaded(parts.tasks ?? []),
    projectTasks: loaded([]),
    recentCaptures: captures(parts.captures ?? []),
    unseenCaptures: captures([]),
    waitingCaptures: captures([]),
  }) as unknown as NameHintState;

const screenOf = (taskId: string | null): ScreenContext | null =>
  taskId === null
    ? null
    : {
        view: 'today' as const,
        focus: null,
        visible: [{ collection: 'tasks' as const, id: taskId }],
        topicId: null,
        procedureId: null,
        runId: null,
        v: 1 as const,
      };

const FORBIDDEN = [
  'Marcus',
  'Webb',
  'Marc W',
  'Lakeview',
  'Lantern',
  'Okonkwo',
  'Lexapro',
  'Insulin',
  'prescription',
  'refill',
  'Hollowbrook',
  'tobi@example.com',
  'Shivon',
  'Friday',
];

const hostile = toState({
  who: [
    person('sio', 'Siobhan Kelly', {
      aliases: ['Shiv'],
      soundsLike: ['Shivon'],
    }),
    person('priya', 'Priya Natarajan', { aliases: ['Pree'] }),
    person('eleni', 'Eleni', { lastMentionedAt: NOW - DAY }),
    person('marcus', 'Marcus Webb', { ...marked, aliases: ['Marc W'] }),
    person('clinic', 'Lakeview Clinic', { ...marked, kind: 'organization' }),
    person('tobias', 'Tobias', {
      aliases: [
        'Marcus Webb',
        'Hollowbrook',
        'tobi@example.com',
        'Friday',
        '3 tablets',
      ],
    }),
    person('quill', 'Quillon'),
  ],
  places: [
    place('harbor', 'Harborview'),
    place('hollow', 'Hollowbrook', marked),
    place('pharm', 'Lexapro Pharmacy'),
    place('gym', 'Granite Gym', { aliases: ['Take 20 mg'] }),
  ],
  projects: [
    project('lantern', 'Lantern Plan', { ...marked, privacy: 'private' }),
    project('fund', 'Insulin Pump Fund'),
    project('garden', 'Garden Wall'),
  ],
  topics: [
    topic('okon', 'Okonkwo Notes', { projectIds: ['lantern'] }),
    topic('refill', 'Pick up Lexapro refill'),
    topic('bread', 'Sourdough Starter'),
  ],
  procedures: [
    procedure('lex', 'Pick up Lexapro', {
      privateMark: 'health',
      privacy: 'private',
    }),
    procedure('rx', 'Renew prescription'),
    procedure('close', 'Closing Up Shop'),
  ],
  tasks: [{ id: 't1', whoIds: [], placeIds: ['harbor'], projectId: null }],
  captures: [
    capture(['priya'], [], 40),
    capture(['priya'], [], 41),
    capture(['priya'], [], 42),
    capture(['marcus'], ['hollow'], 1),
  ],
});

test('no private name, health word, dose, address or misheard form reaches the list, the Deepgram URL or Chrome phrases', () => {
  const hints = readHelmNameHints(hostile, screenOf('t1'), UID, NOW);
  const url = decodeURIComponent(toListenUrl('nova-3', 'en-US', hints));
  const seen: string[] = [];
  class Phrase {
    constructor(
      public phrase: string,
      public boost: number,
    ) {
      seen.push(phrase);
    }
  }
  toRecognitionPhrases(hints, Phrase);
  const lowered = [hints.join('|'), url, seen.join('|')].map((text) =>
    text.toLowerCase(),
  );
  FORBIDDEN.forEach((word) =>
    lowered.forEach((text) =>
      assert.equal(text.includes(word.toLowerCase()), false, `${word} leaked`),
    ),
  );
  [
    'Siobhan Kelly',
    'Priya Natarajan',
    'Eleni',
    'Tobias',
    'Harborview',
    'Granite Gym',
    'Garden Wall',
    'Sourdough Starter',
    'Closing Up Shop',
  ].forEach((kept) => assert.ok(hints.includes(kept), `${kept} is a hint`));
  assert.ok(hints.includes('Nomos'), 'the assistant is a hint');
  assert.equal(
    (url.match(/keyterm=/g) ?? []).length,
    hints.length,
    'one keyterm per hint',
  );
});

test('a non-private alias equal to a private name is refused, and the rest of its record stays', () => {
  const hints = readHelmNameHints(hostile, null, UID, NOW);
  assert.equal(hints.includes('Marcus Webb'), false);
  assert.equal(hints.includes('Hollowbrook'), false);
  assert.ok(hints.includes('Tobias'));
});

test('a record inherits privacy from its project, and a health word in an ordinary title is refused', () => {
  const hints = readHelmNameHints(hostile, null, UID, NOW);
  assert.equal(
    hints.some((hint) => /okonkwo/i.test(hint)),
    false,
  );
  assert.equal(
    hints.some((hint) => /insulin|prescription|refill/i.test(hint)),
    false,
  );
});

test('ranking: the assistant and the page in view, then the last 2 weeks, then the most named, then the rest; a misheard name ranks up a step', () => {
  const hints = readHelmNameHints(hostile, screenOf('t1'), UID, NOW);
  const at = (term: string) => hints.indexOf(term);
  const order = [
    'Nomos',
    'Harborview',
    'Eleni',
    'Priya Natarajan',
    'Siobhan Kelly',
    'Quillon',
  ];
  order.forEach((term) => assert.ok(at(term) >= 0, `${term} is listed`));
  order
    .slice(1)
    .forEach((term, index) =>
      assert.ok(
        at(order[index]) < at(term),
        `${order[index]} comes before ${term}`,
      ),
    );
  assert.ok(at('Siobhan Kelly') < at('Quillon'), 'misheard before unmentioned');
});

test('the cut stays within 90 terms and 450 counted tokens, for short and long names', () => {
  const letters = (index: number, length: number) =>
    Array.from({ length }, (_, at) =>
      String.fromCharCode(97 + ((index * 7 + at * 3 + (index >> 3)) % 26)),
    ).join('');
  const crowd = (length: number, count: number) =>
    toState({
      who: Array.from({ length: count }, (_, index) =>
        person(
          `p${index}`,
          `${letters(index, length)}${'abcdefghijklmnopqrstuvwxyz'[index % 26]}${'qxzjv'[index % 5]}${letters(index + 1000, 3)}`,
        ),
      ),
    });
  const short = readHelmNameHints(crowd(6, 300), null, UID, NOW);
  assert.equal(short.length, 90);
  assert.ok(countHintTokens(short) <= 450);
  const long = readHelmNameHints(crowd(26, 300), null, UID, NOW);
  assert.ok(long.length < 90 && long.length > 20);
  assert.ok(countHintTokens(long) <= 450, `${countHintTokens(long)} tokens`);
});

test('the shared list drops everyday words, dates, numbers, units and addresses, dedupes and orders', () => {
  assert.deepEqual(
    buildNameHints(
      [
        { text: 'Friday', rank: 0, weight: 1 },
        { text: 'tablespoon', rank: 0, weight: 1 },
        { text: 'Studio 54', rank: 0, weight: 1 },
        { text: 'a@b.co', rank: 0, weight: 1 },
        { text: 'Mark', rank: 0, weight: 1 },
        { text: 'the', rank: 0, weight: 9 },
        { text: 'Zed', rank: 1, weight: 9 },
        { text: 'zed', rank: 0, weight: 1 },
        { text: 'Anya', rank: 0, weight: 5 },
        { text: 'Bram', rank: 0, weight: 2 },
        { text: 'Cato', rank: 0, weight: 2 },
      ],
      { exclude: (text) => text === 'Cato' },
    ),
    ['Anya', 'Bram', 'Mark', 'zed'],
  );
  assert.equal(countHintTokens(['abcdefg', 'ab']), 1 + 3 + 1 + 1);
});

test('the same slices and page give the same list without rebuilding it', () => {
  const screen = screenOf('t1');
  const first = readHelmNameHints(hostile, screen, UID, NOW);
  assert.equal(readHelmNameHints(hostile, screen, UID, NOW), first);
});

const record = (
  id: string,
  name: string,
  soundsLike: string[] = [],
): NameRecord => ({
  id,
  name,
  aliases: [],
  soundsLike,
});
const FRIENDS = [
  record('sio', 'Siobhan Kelly'),
  record('niamh', 'Niamh'),
  record('priya', 'Priya'),
];

test('a spoken sound-alike is swapped for the name and sealed with what was heard; a restored one is left as said', () => {
  const said = 'lunch with Nieve on Friday';
  assert.deepEqual(
    readSpokenNames(said, FRIENDS).map((hit) => hit.recordId),
    ['niamh'],
  );
  const swapped = readSwappedWords(said, FRIENDS);
  assert.equal(swapped.text, 'lunch with Niamh on Friday');
  assert.deepEqual(
    swapped.swaps.map((swap) => [swap.start, swap.end, swap.heard]),
    [[11, 16, 'Nieve']],
  );
  assert.deepEqual(swapped.heardNames, [
    { heard: 'Nieve', said: 'Niamh', recordId: 'niamh', candidateIds: [] },
  ]);
  const kept = readSwappedWords(said, FRIENDS, ['nieve']);
  assert.equal(kept.text, said);
  assert.deepEqual(kept.heardNames, [
    { heard: 'Nieve', said: null, recordId: null, candidateIds: [] },
  ]);
});

test('two names that fit are a tie, a typed turn keeps its words, and a form that was misheard before is read as the name', () => {
  const tie = readSwappedWords('call Shivon', [
    record('a', 'Siobhan'),
    record('b', 'Siobhan'),
  ]);
  assert.equal(tie.text, 'call Shivon');
  assert.deepEqual(tie.heardNames, [
    { heard: 'Shivon', said: null, recordId: null, candidateIds: ['a', 'b'] },
  ]);
  assert.deepEqual(readTypedHeardNames('call Nieve', FRIENDS), [
    { heard: 'Nieve', said: null, recordId: 'niamh', candidateIds: [] },
  ]);
  assert.equal(readTypedHeardNames('call Priya', FRIENDS), null);
  const remembered = [record('k', 'Kate', ['Cait'])];
  assert.equal(readSwappedWords('with Cait', remembered).text, 'with Kate');
});

test('a name that is also a word is hinted: Mark, Grace, Rose, Bill, Joy and Hope all stay', () => {
  const names = ['Mark', 'Grace', 'Rose', 'Bill', 'Joy', 'Hope'];
  assert.deepEqual(
    buildNameHints(
      [...names, 'the', 'and', 'with'].map((text) => ({
        text,
        rank: 0,
        weight: 1,
      })),
    ),
    names,
  );
});

test('the kept list is per person: the same slices under another uid are rebuilt', () => {
  const screen = screenOf('t1');
  const mine = readHelmNameHints(hostile, screen, 'a', NOW);
  assert.equal(readHelmNameHints(hostile, screen, 'a', NOW), mine);
  const theirs = readHelmNameHints(hostile, screen, 'b', NOW);
  assert.notEqual(theirs, mine);
  assert.deepEqual(theirs, mine);
  assert.equal(readHelmNameHints(hostile, screen, 'b', NOW), theirs);
  assert.notEqual(readHelmNameHints(hostile, screen, null, NOW), theirs);
});

const FALSE_FRIENDS = [
  record('kate', 'Kate'),
  record('dan', 'Dan'),
  record('cole', 'Cole'),
  record('ben', 'Ben'),
  record('nick', 'Nick'),
  record('marc', 'Marc'),
  record('jon', 'Jon'),
];

test('an everyday word is never swapped for a name that sounds like it', () => {
  [
    'the cat is on the mat',
    'we are done for today',
    'call me when you land',
    'buy a bun for lunch',
    'my neck hurts',
    'please mark the box',
    'I need to mark it done and call back',
    'Cat food is on the list',
    'Done with the dishes',
    'Call the plumber',
    'Bun and cheese for lunch',
    'Neck pillow from the shop',
    'Mark that as finished',
    'ask jon to come',
  ].forEach((said) => {
    const swapped = readSwappedWords(said, FALSE_FRIENDS);
    assert.equal(swapped.text, said, said);
    assert.deepEqual(swapped.heardNames, [], said);
    assert.equal(readTypedHeardNames(said, FALSE_FRIENDS), null, said);
  });
});

test('a capitalised word mid-sentence is read as a name, and one that only starts the sentence is held to a closer spelling', () => {
  assert.equal(
    readSwappedWords('ask Jon to come', FALSE_FRIENDS.slice(0, 1)).text,
    'ask Jon to come',
  );
  assert.equal(
    readSwappedWords('ask Jon to come', [record('j', 'John')]).text,
    'ask John to come',
  );
  assert.equal(
    readSwappedWords('Jon needs a ride', [record('j', 'John')]).text,
    'John needs a ride',
  );
  assert.equal(
    readSwappedWords('Nieve needs a ride', FRIENDS).text,
    'Nieve needs a ride',
  );
  assert.equal(
    readSwappedWords('a ride for Nieve', FRIENDS).text,
    'a ride for Niamh',
  );
});

const CROWD_SIZE = 2000;
const crowdNames = Array.from({ length: CROWD_SIZE }, (_, at) =>
  record(
    `c${at}`,
    `${['Anya', 'Bram', 'Cato', 'Dina', 'Elio', 'Faye', 'Gus', 'Hana'][at % 8]}${String.fromCharCode(97 + (at % 26))}${at} ${['Ward', 'Stone', 'Lake', 'Frost', 'Moss'][at % 5]}`,
  ),
);

test('2,000 people are read in a few milliseconds once the index is built, and a long text reads only its first 300 words', () => {
  const said =
    'Remind me to call Nieve and Dina about the party on Friday with Marcus then ask Jon to buy bread and milk near Shivon house';
  readSpokenNames(said, crowdNames);
  const runs = 20;
  const began = performance.now();
  Array.from({ length: runs }, () => readSwappedWords(said, crowdNames));
  const each = (performance.now() - began) / runs;
  assert.ok(each < 20, `${each.toFixed(1)} ms per read`);
  const long = `${'Thanks again Nieve '.repeat(400)}`;
  const hits = readSpokenNames(long, [...crowdNames, ...FRIENDS]);
  assert.ok(hits.every((hit) => hit.end <= long.length));
  assert.ok(hits.length <= 100, `${hits.length} swaps from 400 repeats`);
  assert.deepEqual(readSwappedWords(said, []).swaps, []);
});

const failures = tests.flatMap(([name, run]) => {
  try {
    run();
    console.log(`ok   ${name}`);
    return [];
  } catch (error) {
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
    return [name];
  }
});
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
