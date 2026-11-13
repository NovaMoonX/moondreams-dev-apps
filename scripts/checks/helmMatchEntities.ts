import assert from 'node:assert/strict';

import { sealForHelm } from '../../functions/src/apps/helm/helmKey.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  MAX_MENTIONS,
  MAX_PLACES,
  type CaptureReading,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  buildExecution,
  planWrites,
  type KnownWhoState,
  type PeopleInput,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { createFixtureProvider } from '../../functions/src/apps/helm/nomos/fixtureProvider.ts';
import {
  matchPlaces,
  matchWho,
  type KnownWho,
} from '../../functions/src/apps/helm/nomos/matchEntities.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';

const KEY = { keyId: 'helm-key-test', keyVersion: 1, key: Buffer.alloc(32, 7) };
const seal = (fields: Record<string, unknown>) => sealForHelm(KEY, fields);

const who = (
  id: string,
  kind: KnownWho['kind'],
  name: string,
  aliases: string[] = [],
): KnownWho => ({ id, kind, name, aliases, lastMentionedAt: null });

const person = (name: string) => ({ name, kind: 'person' as const });
const kindsOf = (results: { kind: string }[]) =>
  results.map((result) => result.kind);

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

test('one sure match links, by name or by alias', () => {
  const known = [
    who('w1', 'person', 'Dana Lee', ['Dani']),
    who('w2', 'pet', 'Miso'),
  ];
  assert.deepEqual(
    matchWho({
      mentions: [
        person('dana lee'),
        person('Dani'),
        { name: 'Miso', kind: 'pet' },
      ],
      known,
      assistantNames: [],
    }),
    [
      { kind: 'match', id: 'w1' },
      { kind: 'match', id: 'w1' },
      { kind: 'match', id: 'w2' },
    ],
  );
});

test('a first name that fits two people is unsure, and so is one that fits only half of one', () => {
  const twoSams = [
    who('w1', 'person', 'Sam Rivera'),
    who('w2', 'person', 'Sam Patel'),
  ];
  assert.deepEqual(
    kindsOf(
      matchWho({
        mentions: [person('Sam')],
        known: twoSams,
        assistantNames: [],
      }),
    ),
    ['unsure'],
  );
  assert.deepEqual(
    kindsOf(
      matchWho({
        mentions: [person('Sam Rivera'), person('Sam Chen')],
        known: twoSams,
        assistantNames: [],
      }),
    ),
    ['match', 'unsure'],
  );
  assert.deepEqual(
    kindsOf(
      matchWho({
        mentions: [person('Sam')],
        known: [who('w3', 'person', 'Sam Rivera')],
        assistantNames: [],
      }),
    ),
    ['unsure'],
  );
});

test('a cat and a person both named Miso are unsure, never merged', () => {
  const both = [who('w1', 'pet', 'Miso'), who('w2', 'person', 'Miso')];
  assert.deepEqual(
    kindsOf(
      matchWho({
        mentions: [{ name: 'Miso', kind: 'pet' }],
        known: both,
        assistantNames: [],
      }),
    ),
    ['unsure'],
  );
  assert.deepEqual(
    kindsOf(
      matchWho({
        mentions: [{ name: 'Miso', kind: 'organization' }],
        known: [who('w1', 'pet', 'Miso')],
        assistantNames: [],
      }),
    ),
    ['unsure'],
  );
});

test('a name nobody has is new, and the assistant is dropped', () => {
  const known = [who('w1', 'person', 'Dana Lee'), who('w2', 'person', 'Nova')];
  assert.deepEqual(
    matchWho({
      mentions: [person('Priya'), person('nova'), person('Nova')],
      known,
      assistantNames: ['Nova'],
    }),
    [{ kind: 'new' }, { kind: 'dropped' }, { kind: 'dropped' }],
  );
  assert.deepEqual(
    matchWho({ mentions: [person('Nova')], known, assistantNames: [] }),
    [{ kind: 'match', id: 'w2' }],
  );
  assert.deepEqual(
    matchWho({
      mentions: [person('Nomos'), person('Juniper'), person('Priya')],
      known,
      assistantNames: ['Juniper', 'Nomos'],
    }),
    [{ kind: 'dropped' }, { kind: 'dropped' }, { kind: 'new' }],
    'the old or default name said after a rename is still never a person',
  );
});

test('places match by name or alias, are new when unknown and unsure when half known', () => {
  const known = [
    { id: 'p1', name: 'Home', aliases: ['the house'] },
    { id: 'p2', name: 'Ferry Building', aliases: [] },
  ];
  assert.deepEqual(
    matchPlaces({
      names: [
        'home',
        'The House',
        'Ferry building',
        'the Ferry Building',
        'Pier 39',
        'Ferry Terminal',
        'Nova',
      ],
      known,
      assistantNames: ['Nova'],
    }),
    [
      { kind: 'match', id: 'p1' },
      { kind: 'match', id: 'p1' },
      { kind: 'match', id: 'p2' },
      { kind: 'match', id: 'p2' },
      { kind: 'new' },
      { kind: 'unsure', candidateIds: ['p2'] },
      { kind: 'dropped' },
    ],
  );
});

const READING: CaptureReading = {
  people: [{ id: 'people:0', text: 'Dana', start: 0, end: 4 }],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};
const task = (title: string, extra: Record<string, unknown> = {}) => ({
  kind: 'createTask',
  ref: null,
  taskAlias: null,
  title,
  dueSpanId: null,
  isUrgent: null,
  ...extra,
});
const read = (raw: Record<string, unknown>, reading = READING) =>
  normalizeNomosReply(raw, { reading, aliases: createAliasBook('t') });

test('a dropped mention or refs out of order never link another who', () => {
  const mention = (ref: string, name: string, kind: string) => ({
    ref,
    name,
    kind,
    relation: null,
    species: null,
    organizationKind: null,
  });
  const reply = read(
    {
      commands: [
        task('Walk Rex', { whoRefs: ['$w1'] }),
        task('Call Sam', { whoRefs: ['$w2'] }),
        task('Text Ana', { whoRefs: ['$w9'] }),
      ],
      mentions: [
        mention('$w1', 'Rex', 'dog'),
        mention('$w2', 'Sam', 'person'),
        mention('$w9', 'Ana', 'person'),
      ],
      places: [],
    },
    { ...READING, people: [] },
  );
  const [walk, call, text] = reply.commands;
  assert.ok(
    walk.kind === 'createTask' &&
      call.kind === 'createTask' &&
      text.kind === 'createTask',
  );
  const refOf = (name: string) =>
    reply.mentions.find((entry) => entry.name === name)?.ref;
  assert.deepEqual(walk.whoRefs, [], 'the dropped $w1 links nothing');
  assert.deepEqual(call.whoRefs, [refOf('Sam')]);
  assert.deepEqual(text.whoRefs, [refOf('Ana')]);
});

test('an update that only links a person still reaches the executor', () => {
  const aliases = createAliasBook('t');
  const alias = aliases.add('task-1');
  const reply = normalizeNomosReply(
    {
      commands: [
        {
          kind: 'updateTask',
          ref: null,
          taskAlias: alias,
          title: null,
          dueSpanId: null,
          isUrgent: null,
          whoRefs: ['$w1'],
        },
      ],
      mentions: [
        {
          ref: '$w1',
          name: 'Sam',
          kind: 'person',
          relation: null,
          species: null,
          organizationKind: null,
        },
      ],
      places: [],
    },
    { reading: { ...READING, people: [] }, aliases },
  );
  const [update] = reply.commands;
  assert.ok(update?.kind === 'updateTask', 'the link-only update is kept');
  assert.equal(update.taskId, 'task-1');
  assert.deepEqual(update.whoRefs, [reply.mentions[0]?.ref]);
});

test('a reply names who and places; refs, caps and unknown refs are settled by code', () => {
  const reply = read({
    commands: [
      task('Buy Miso’s food', { whoRefs: ['$w1', '$w9'], placeRefs: ['$p1'] }),
      task('Call @Dana'),
    ],
    mentions: [
      {
        ref: '$w1',
        name: 'Miso’s',
        kind: 'pet',
        relation: null,
        species: 'cat',
        organizationKind: 'ignored',
      },
      {
        ref: '$w2',
        name: 'miso’s',
        kind: 'pet',
        relation: null,
        species: null,
        organizationKind: null,
      },
      {
        ref: '$w3',
        name: 'Acme Bakery',
        kind: 'organization',
        relation: 'our baker',
        species: 'x',
        organizationKind: 'bakery',
      },
      {
        ref: '$w4',
        name: 'Rex',
        kind: 'dog',
        relation: null,
        species: null,
        organizationKind: null,
      },
    ],
    places: [{ ref: '$p1', name: 'Ferry Building' }],
  });
  assert.deepEqual(
    reply.mentions.map(
      ({ name, kind, species, organizationKind, relation }) => [
        name,
        kind,
        species,
        organizationKind,
        relation,
      ],
    ),
    [
      ['Miso', 'pet', 'cat', null, null],
      ['Acme Bakery', 'organization', null, 'bakery', 'our baker'],
      ['Dana', 'person', null, null, null],
    ],
  );
  assert.deepEqual(
    reply.places.map((place) => place.name),
    ['Ferry Building'],
  );
  const [buy, call] = reply.commands;
  assert.ok(buy.kind === 'createTask' && call.kind === 'createTask');
  assert.deepEqual(buy.whoRefs, ['$w1']);
  assert.deepEqual(buy.placeRefs, ['$p1']);
  assert.deepEqual(
    call.whoRefs,
    [reply.mentions[2].ref],
    'a @handle links its task',
  );
});

test('a reply with no mentions still files, and the lists are capped', () => {
  const plain = read(
    { commands: [task('Buy milk')] },
    { ...READING, people: [] },
  );
  assert.deepEqual([plain.mentions, plain.places], [[], []]);
  const many = read(
    {
      commands: [task('Buy milk')],
      mentions: Array.from({ length: 30 }, (_, index) => ({
        ref: `$w${index + 1}`,
        name: `Person ${String.fromCharCode(65 + index)}`,
        kind: 'person',
        relation: null,
        species: null,
        organizationKind: null,
      })),
      places: Array.from({ length: 30 }, (_, index) => ({
        ref: `$p${index + 1}`,
        name: `Place ${String.fromCharCode(65 + index)}`,
      })),
    },
    { ...READING, people: [] },
  );
  assert.equal(many.mentions.length, MAX_MENTIONS);
  assert.equal(many.places.length, MAX_PLACES);
});

const state = (
  id: string,
  kind: KnownWho['kind'],
  name: string,
  extra: Partial<KnownWhoState> = {},
): KnownWhoState => ({
  ...who(id, kind, name),
  tier: 'passing',
  tierSetBy: 'nomos',
  mentionDayKeys: [],
  taskLinkCount: 0,
  yearlyDateCount: 0,
  momentCount: 0,
  hasRole: false,
  ...extra,
});

const counter = () => {
  const count = { n: 0 };
  return () => {
    count.n += 1;
    return `new-${count.n}`;
  };
};

const plan = (people: Partial<PeopleInput>, commands: unknown[]) =>
  planWrites({
    commands: read(
      {
        commands,
        mentions: people.mentions ?? [],
        places: people.places ?? [],
      },
      { ...READING, people: [] },
    ).commands,
    existing: new Map(),
    captureId: 'c1',
    executionId: 'e1',
    now: 5000,
    seal,
    newId: counter(),
    people: {
      mentions: [],
      places: [],
      known: [],
      knownPlaces: [],
      assistantName: null,
      assistantNames: [],
      dayKey: '2026-11-10',
      capturedAt: 4000,
      ...people,
    },
  });

const dana = {
  ref: '$w1',
  name: 'Dana',
  kind: 'person' as const,
  relation: 'my sister',
  species: null,
  organizationKind: null,
};
const miso = {
  ref: '$w2',
  name: 'miso',
  kind: 'pet' as const,
  relation: null,
  species: 'cat',
  organizationKind: null,
};

test('a turn makes a new who and place, links them, and Undo can remove them', () => {
  const result = plan(
    {
      mentions: [dana, miso],
      places: [{ ref: '$p1', name: 'the ferry building' }],
    },
    [task('Call Dana', { whoRefs: ['$w1'], placeRefs: ['$p1'] })],
  );
  assert.equal(result.creates.length, 1);
  assert.equal(result.whoCreates.length, 2);
  assert.equal(result.placeCreates.length, 1);
  const taskData = result.creates[0].data;
  assert.equal((taskData.whoIds as string[]).length, 1);
  assert.equal((taskData.placeIds as string[]).length, 1);
  assert.deepEqual(
    result.effectRefs.map((ref) => `${ref.op}:${ref.collection}`),
    ['create:tasks', 'create:who', 'create:who', 'create:places'],
  );
  const [danaDoc, misoDoc] = result.whoCreates;
  assert.equal(danaDoc.data.tier, 'regular', 'a linked who is regular');
  assert.equal(misoDoc.data.tier, 'passing', 'a name alone stays passing');
  assert.equal(danaDoc.data.tierSetBy, 'nomos');
  assert.equal(danaDoc.data.isSelf, false);
  assert.equal(danaDoc.data.lastMentionedAt, 4000);
  assert.equal(danaDoc.data.executionId, 'e1');
  assert.equal(danaDoc.data.importedFrom, null);
  assert.deepEqual(
    result.linkedWhoIds.sort(),
    result.whoCreates.map((entry) => entry.id).sort(),
  );
  const execution = buildExecution(result, {
    commands: [],
    captureId: 'c1',
    now: 5000,
    seal,
  });
  assert.equal((execution.effectRefs as unknown[]).length, 4);
});

test('a sure match links the existing who and raises only a passing tier', () => {
  const result = plan(
    {
      mentions: [dana],
      known: [
        state('w1', 'person', 'Dana', { mentionDayKeys: ['a', 'b'] }),
        state('w2', 'person', 'Priya', { tier: 'close', tierSetBy: 'person' }),
      ],
    },
    [task('Call Dana', { whoRefs: ['$w1'] })],
  );
  assert.equal(result.whoCreates.length, 0);
  assert.deepEqual(result.creates[0].data.whoIds, ['w1']);
  assert.deepEqual(result.whoUpdates, [
    { id: 'w1', data: { lastMentionedAt: 4000, tier: 'regular' } },
  ]);
  const kept = plan(
    {
      mentions: [dana],
      known: [
        state('w1', 'person', 'Dana', { tier: 'close', tierSetBy: 'person' }),
      ],
    },
    [task('Call Dana', { whoRefs: ['$w1'] })],
  );
  assert.deepEqual(kept.whoUpdates[0].data, { lastMentionedAt: 4000 });
});

test('an unsure or assistant-named mention links nothing and makes nothing', () => {
  const result = plan(
    {
      mentions: [
        { ...dana, name: 'Sam' },
        { ...miso, name: 'Nova', kind: 'person' },
      ],
      known: [
        state('w1', 'person', 'Sam Rivera'),
        state('w2', 'person', 'Sam Patel'),
        state('w3', 'person', 'Nova'),
      ],
      assistantName: 'Nova',
      assistantNames: ['Nova'],
    },
    [task('Call Sam', { whoRefs: ['$w1', '$w2'] })],
  );
  assert.equal(result.whoCreates.length, 0);
  assert.equal(result.whoUpdates.length, 0);
  assert.deepEqual(result.linkedWhoIds, []);
  assert.deepEqual(result.creates[0].data.whoIds, []);
});

test('a turn that files nothing makes no who or place', () => {
  const result = plan(
    { mentions: [dana], places: [{ ref: '$p1', name: 'Home' }] },
    [],
  );
  assert.deepEqual(
    [result.whoCreates, result.placeCreates, result.linkedWhoIds],
    [[], [], []],
  );
});

test('the emulator names a pet, an organization, a person and a place', async () => {
  const text =
    'Remind me to buy Miso’s food at Acme Bakery and call Dana about Saturday, pick up the cake at the Ferry Building';
  const reply = await createFixtureProvider(text, {
    ...READING,
    people: [],
  }).runToolLoop({
    role: 'interpret',
    messages: [{ role: 'user', content: '' }],
  } as never);
  const parsed = normalizeNomosReply(reply.terminalInput, {
    reading: { ...READING, people: [] },
    aliases: createAliasBook('t'),
  });
  assert.deepEqual(
    parsed.mentions.map(({ name, kind, species, organizationKind }) => [
      name,
      kind,
      species,
      organizationKind,
    ]),
    [
      ['Dana', 'person', null, null],
      ['Miso', 'pet', 'cat', null],
      ['Acme Bakery', 'organization', null, 'bakery'],
    ],
  );
  assert.deepEqual(
    parsed.places.map((place) => place.name),
    ['Ferry Building'],
  );
  const linked = parsed.commands.flatMap((command) =>
    command.kind === 'createTask' && command.title.includes('Miso')
      ? [command.whoRefs.length]
      : [],
  );
  assert.deepEqual(linked, [2], 'Miso and Acme Bakery are on the buy task');
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
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
