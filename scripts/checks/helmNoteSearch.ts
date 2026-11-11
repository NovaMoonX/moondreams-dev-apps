import assert from 'node:assert/strict';

import {
  openForHelm,
  sealForHelm,
} from '../../functions/src/apps/helm/helmKey.ts';
import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import { createFixtureProvider } from '../../functions/src/apps/helm/nomos/fixtureProvider.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import { NOTES_CONTEXT_CHARS } from '../../functions/src/apps/helm/nomos/commands.ts';
import { readHintedNotes } from '../../functions/src/apps/helm/noteStore.ts';
import { toContextNotes } from '../../functions/src/apps/helm/sortHelmCapture.ts';
import type { OpenNote, OpenTopic } from '../../src/apps/helm/types.ts';
import {
  pickFittingTopic,
  rankNotes,
  rankTopicChoices,
} from '../../src/apps/helm/utils/noteSearch.ts';
import {
  planSavedAnswer,
  toSavedNoteTitle,
} from '../../src/apps/helm/utils/savedAnswer.ts';

const KEY = { keyId: 'helm-key-test', keyVersion: 1, key: Buffer.alloc(32, 7) };

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, body: () => void | Promise<void>) =>
  tests.push([name, body]);

const note = (
  id: string,
  title: string,
  body: string,
  topicIds: string[] = [],
) => ({ id, title, body, topicIds });

const NOTES = [
  note('cake', 'Cake storage', 'Cakes keep 3 days in the fridge', ['baking']),
  note('car', 'Washing the car', 'Use a microfibre cloth in the shade', [
    'cars',
  ]),
  note('wifi', 'Cabin wifi', 'The password is on the router', []),
  note('tires', 'Tire pressure', 'Check the tires every month', ['cars']),
  note('bread', 'Sourdough starter', 'Feed it daily and keep it warm', [
    'baking',
  ]),
];
const TOPIC_NAMES = [
  { id: 'baking', name: 'Baking' },
  { id: 'cars', name: 'Car care' },
];

test('rankNotes puts the expected note first for each question', () => {
  const asked: [string, string][] = [
    ['how long do cakes keep in the fridge', 'cake'],
    ['how do I wash the car', 'car'],
    ['what is the wifi password', 'wifi'],
    ['when should I check the tires', 'tires'],
    ['how often feed the sourdough', 'bread'],
  ];
  asked.forEach(([text, expected]) =>
    assert.equal(rankNotes(text, NOTES, TOPIC_NAMES)[0], expected, text),
  );
});

test('rankNotes over 1,000 notes takes under 20 ms', () => {
  const words = Array.from({ length: 400 }, (_, index) => `word${index}`);
  const many = Array.from({ length: 1_000 }, (_, index) =>
    note(
      `n${index}`,
      `Note ${words[index % 400]} ${words[(index * 7) % 400]}`,
      Array.from(
        { length: 120 },
        (_, at) => words[(index * 13 + at * 5) % 400],
      ).join(' '),
      [index % 2 === 0 ? 'baking' : 'cars'],
    ),
  );
  rankNotes('word12 word99 cakes', many, TOPIC_NAMES);
  const times = Array.from({ length: 5 }, () => {
    const start = performance.now();
    rankNotes('how do word12 and word250 word99 work', many, TOPIC_NAMES);
    return performance.now() - start;
  });
  assert.ok(
    Math.min(...times) < 20,
    `best of five was ${Math.min(...times)} ms`,
  );
});

const TOPICS = TOPIC_NAMES;
const PLENTY = [
  note('a', 'Cake storage', 'Cakes keep 3 days covered in the fridge', [
    'baking',
  ]),
  note('b', 'Washing the car', 'Use a cloth in the shade', ['cars']),
];

test('a topic fits only when one stored note is clearly ahead and sits in exactly one topic', () => {
  assert.equal(
    pickFittingTopic('cake storage in the fridge', PLENTY, TOPICS),
    'baking',
  );
  assert.equal(pickFittingTopic('zebra crossing', PLENTY, TOPICS), null);
  assert.equal(pickFittingTopic('anything', [], TOPICS), null);
  assert.equal(
    pickFittingTopic(
      'cake storage in the fridge',
      [note('a', 'Cake storage', 'cakes fridge', ['baking', 'cars'])],
      TOPICS,
    ),
    null,
    'a note in two topics is not a clear answer',
  );
  assert.equal(
    pickFittingTopic(
      'cake storage in the fridge',
      [
        note('a', 'Cake storage', 'cakes fridge', ['baking']),
        note('b', 'Cake storage', 'cakes fridge', ['cars']),
      ],
      TOPICS,
    ),
    null,
    'two equally close notes in different topics are not clearly ahead',
  );
  assert.equal(
    pickFittingTopic(
      'cake',
      [note('a', 'Cake storage', 'cakes', ['baking'])],
      TOPICS,
    ),
    null,
    'one shared word scores under the floor',
  );
  assert.equal(
    pickFittingTopic('cake storage in the fridge', PLENTY, []),
    null,
    'a topic that no longer exists is not offered',
  );
});

test('a saved answer title is the question cleaned, capitalised and cut at 80', () => {
  assert.equal(
    toSavedNoteTitle('how long do cakes keep?'),
    'How long do cakes keep',
  );
  assert.equal(toSavedNoteTitle('  What   is   a  roux ?! '), 'What is a roux');
  const long = toSavedNoteTitle(`why ${'sourdough '.repeat(20)}rises?`);
  assert.ok(long.length <= 80 && !long.endsWith(' '));
  assert.equal(long.charAt(0), 'W');
});

const open = (
  id: string,
  title: string,
  body: string,
  topicIds: string[],
): OpenNote =>
  ({ id, title, body, topicIds, isUnreadable: false }) as unknown as OpenNote;
const topicOf = (id: string, name: string): OpenTopic =>
  ({
    id,
    name,
    parentId: null,
    overview: null,
    sections: [],
    isUnreadable: false,
  }) as unknown as OpenTopic;

test('saving a general answer: a repeat saves nothing, the suggested topic wins, a similar note decides, else loose', () => {
  const notes = [
    open('a', 'Cake storage', 'Cakes keep 3 days covered in the fridge', [
      'baking',
    ]),
  ];
  const topics = [topicOf('baking', 'Baking'), topicOf('cars', 'Car care')];
  const answer = (
    general: string,
    suggestedTopicId: string | null = null,
    question = 'What do zebras eat?',
  ) => ({
    question,
    general,
    suggestedTopicId,
  });
  const repeat = planSavedAnswer(
    answer('cakes KEEP 3 days covered, in the fridge'),
    notes,
    topics,
  );
  assert.equal(repeat.kind, 'kept');
  const suggested = planSavedAnswer(
    answer('Brakes need checking', 'cars'),
    notes,
    topics,
  );
  assert.equal(suggested.kind === 'new' && suggested.topic?.id, 'cars');
  const missing = planSavedAnswer(
    answer('Zebras graze', 'gone'),
    notes,
    topics,
  );
  assert.equal(missing.kind === 'new' && missing.topic, null);
  const similar = planSavedAnswer(
    answer(
      'Cake storage in the fridge depends on the filling.',
      null,
      'How long does cake storage last in the fridge?',
    ),
    notes,
    topics,
  );
  assert.equal(similar.kind === 'new' && similar.topic?.id, 'baking');
});

test('topic choices put overlapping topics first and stop at five', () => {
  const topics = Array.from({ length: 8 }, (_, index) =>
    topicOf(`t${index}`, `Topic ${index}`),
  ).concat(topicOf('kitchen', 'Kitchen cakes'));
  const choices = rankTopicChoices('cakes in the fridge', topics, []);
  assert.equal(choices.length, 5);
  assert.equal(choices[0].id, 'kitchen');
});

test('topic choices also score through the notes filed in them, and with nothing shared lead with the fullest top-level topics', () => {
  const topics = [
    topicOf('a', 'Alpha'),
    topicOf('b', 'Bravo'),
    topicOf('c', 'Charlie'),
  ];
  const filed = [
    note('n1', 'Cake storage', 'Cakes keep 3 days in the fridge', ['c']),
    note('n2', 'Spare', 'Nothing alike', ['b']),
    note('n3', 'Spare two', 'Nothing alike either', ['b']),
  ];
  assert.equal(
    rankTopicChoices('cakes in the fridge', topics, filed)[0].id,
    'c',
  );
  assert.equal(rankTopicChoices('zebra', topics, filed)[0].id, 'b');
});

const BASE = 'apps/helm/users/me';
const seal = (fields: Record<string, unknown>) => sealForHelm(KEY, fields);

const fakeFirestore = (docs: Record<string, Record<string, unknown>>) => {
  const wanted: string[] = [];
  return {
    wanted,
    firestore: {
      doc: (path: string) => ({ path }),
      getAll: async (...refs: { path: string }[]) => {
        refs.forEach((ref) => wanted.push(ref.path));
        return refs.map((ref) => ({
          id: ref.path.split('/').pop() ?? '',
          data: () => docs[ref.path],
        }));
      },
    } as never,
  };
};

test('a hinted note that is missing, foreign, malformed or repeated is dropped', async () => {
  const { firestore, wanted } = fakeFirestore({
    [`${BASE}/notes/mine`]: {
      sealed: seal({ title: 'Cake storage', body: 'Cakes keep 3 days' }),
      isFromGeneralAnswer: true,
      checkedAt: null,
      topicIds: ['baking'],
    },
    [`${BASE}/notes/checked`]: {
      sealed: seal({ title: 'Kept', body: 'Checked' }),
      isFromGeneralAnswer: true,
      checkedAt: 5,
      topicIds: [],
    },
    'apps/helm/users/someone-else/notes/theirs': {
      sealed: seal({ title: 'Secret', body: 'Not yours' }),
      topicIds: [],
    },
  });
  const hinted = await readHintedNotes(firestore, BASE, KEY, [
    'mine',
    'mine',
    'theirs',
    'gone',
    '../someone-else/notes/theirs',
    'checked',
  ]);
  assert.deepEqual(
    hinted.map((entry) => entry.id),
    ['mine', 'checked'],
  );
  assert.ok(wanted.every((path) => path.startsWith(`${BASE}/notes/`)));
  assert.equal(hinted[0].isUnchecked, true);
  assert.equal(hinted[1].isUnchecked, false);
  assert.deepEqual(hinted[0].topicIds, ['baking']);
  assert.equal(openForHelm(KEY, seal({ title: 'x', body: 'y' })).body, 'y');
});

const contextOf = (
  notes: { id: string; title: string; body?: string; isUnchecked?: boolean }[],
) => {
  const { message } = buildContext({
    text: 'How long do cakes keep?',
    reading: {
      people: [],
      places: [],
      documents: [],
      commands: [],
      isUrgent: false,
      dates: [],
      addressedAs: null,
    },
    createdAt: Date.UTC(2026, 10, 10, 12),
    timeZone: 'UTC',
    tasks: [],
    notes,
  });
  const block = /<related_notes>(.*)<\/related_notes>/.exec(message)?.[1];
  return JSON.parse(block ?? '[]') as {
    alias: string;
    title: string;
    body?: string;
    savedFromGeneralAnswer?: boolean;
  }[];
};

test('note bodies reach the model within 6,000 characters in all, a short one leaving its room', () => {
  const records = contextOf([
    { id: 'a', title: 'A', body: 'x'.repeat(5_000) },
    { id: 'b', title: 'B', body: 'short note' },
    { id: 'c', title: 'C', body: 'y'.repeat(5_000), isUnchecked: true },
  ]);
  const total = records.reduce(
    (sum, record) => sum + (record.body?.length ?? 0),
    0,
  );
  assert.ok(total <= NOTES_CONTEXT_CHARS, `total ${total}`);
  assert.equal(records[1].body, 'short note');
  assert.ok((records[0].body?.length ?? 0) > 2_500);
  assert.equal(records[2].savedFromGeneralAnswer, true);
  assert.equal(records[0].savedFromGeneralAnswer, undefined);
});

test('a turn that is not a question sends titles only', () => {
  const [record] = contextOf([{ id: 'a', title: 'A' }]);
  assert.equal(record.body, undefined);
  assert.equal(record.alias, 'n1');
});

const asked = async (text: string) => {
  const reading = {
    people: [],
    places: [],
    documents: [],
    commands: [],
    isUrgent: false,
    dates: [],
    addressedAs: null,
  };
  const context = buildContext({
    text,
    reading,
    createdAt: Date.UTC(2026, 10, 10, 12),
    timeZone: 'UTC',
    tasks: [],
    topics: [{ id: 'baking', name: 'Baking', path: 'Baking' }],
    notes: [
      {
        id: 'cake',
        title: 'Cake storage',
        body: 'Cakes keep 3 days in the fridge when covered.',
      },
    ],
  });
  const loop = await createFixtureProvider(text, reading).runToolLoop({
    role: 'interpret',
    system: '',
    messages: [{ role: 'user', content: context.message }],
    terminalTool: { name: 'file_results', description: '', inputSchema: {} },
    limits: { maxTurns: 1, maxToolCalls: 1, maxMillis: 5_000 },
  } as never);
  return normalizeNomosReply(loop.terminalInput, {
    reading,
    aliases: context.aliases,
    notes: context.notes,
    topics: context.topics,
    captureText: text,
  }).answer;
};

test('the emulator cites a kept note, and gives a general answer that differs from it and a topic to keep it in', async () => {
  const cited = await asked('How long do cakes keep in the fridge?');
  assert.deepEqual(cited?.noteIds, ['cake']);
  assert.equal(cited?.generalText, null);
  const differs = await asked(
    'Do guides really say how long cakes keep in the fridge?',
  );
  assert.deepEqual(differs?.noteIds, ['cake']);
  assert.equal(differs?.differsFromNoteId, 'cake');
  assert.ok(differs?.generalText);
  const general = await asked('What is a baking roux?');
  assert.equal(general?.suggestedTopicId, 'baking');
  assert.deepEqual(general?.noteIds, []);
});

test('a question sends the hinted notes with their bodies, anything else sends titles only', () => {
  const hinted = [
    {
      id: 'cake',
      title: 'Cake',
      body: 'Keeps 3 days',
      isUnchecked: true,
      topicIds: ['baking'],
    },
  ];
  assert.deepEqual(toContextNotes(hinted, 'How long do cakes keep?'), hinted);
  assert.deepEqual(toContextNotes(hinted, 'Remember the cake tin is blue'), [
    { id: 'cake', title: 'Cake' },
  ]);
});

const failures: string[] = [];
for (const [name, body] of tests) {
  try {
    await body();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
