import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import { topicDocumentFor } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import { hasReviseCue } from '../../functions/src/apps/helm/nomos/route.ts';
import type {
  CaptureReading,
  TopicCommand,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  isGroupingAsked,
  normalizeNomosReply,
} from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planGroupTopics,
  planTopicCommands,
  type PlacedTopic,
  type PlannedNote,
  type PlannedVersion,
} from '../../functions/src/apps/helm/nomos/planTopicCommands.ts';
import { planResolve } from '../../functions/src/apps/helm/nomos/resolveQuestion.ts';
import {
  buildGroupQuestion,
  buildTopicRacedLine,
} from '../../functions/src/apps/helm/nomos/summaries.ts';
import * as serverLimits from '../../functions/src/apps/helm/topicLimits.ts';
import type { LiveTopic } from '../../functions/src/apps/helm/topicVersionStore.ts';
import {
  dropGoneSources,
  sourceNoteId,
  type TopicSection,
} from '../../functions/src/apps/helm/topicWrite.ts';
import * as deviceLimits from '../../src/apps/helm/constants.ts';

const NOW = 1_000_000;
const seal = (fields: Record<string, unknown>) => fields as never;
let counter = 0;
const newId = () => `id-${(counter += 1)}`;

const reading: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const section = (
  id: string,
  over: Partial<TopicSection> = {},
): TopicSection => ({
  id,
  heading: `Heading ${id}`,
  level: 2,
  markdown: `Words of ${id}.`,
  writtenBy: 'nomos',
  sources: [{ kind: 'note', noteId: `note-${id}` }],
  ...over,
});
const person = (id: string): TopicSection =>
  section(id, { writtenBy: 'person', sources: [{ kind: 'person', at: 1 }] });

const topicOf = (id: string, over: Partial<LiveTopic> = {}): LiveTopic => ({
  id,
  name: id,
  version: 3,
  docState: 'current',
  pendingNoteIds: [],
  writeClaim: null,
  parentId: null,
  depth: 1,
  sections: [],
  words: { name: id, sections: [] },
  ...over,
});

const treeOf = (topics: LiveTopic[]): PlacedTopic[] =>
  topics.map((topic) => ({
    id: topic.id,
    parentId: topic.parentId,
    depth: topic.depth,
    name: topic.name,
  }));

const plan = (
  commands: TopicCommand[],
  topics: LiveTopic[],
  over: Partial<Parameters<typeof planTopicCommands>[0]> = {},
) =>
  planTopicCommands({
    commands,
    topics: new Map(topics.map((topic) => [topic.id, topic])),
    tree: treeOf(topics),
    notes: [],
    madeNoteIds: null,
    captureId: 'c1',
    captureText: 'text',
    executionId: 'e1',
    now: NOW,
    newId,
    seal,
    room: 40,
    questionRoom: 3,
    ...over,
  });

const revise = (
  topicId: string,
  changes: Record<string, unknown>[],
  seenVersion = 3,
): TopicCommand => ({
  kind: 'reviseTopic',
  topicId,
  changes: changes.map((change) => ({
    kind: 'replace',
    sectionId: null,
    sectionIds: [],
    afterSectionId: null,
    heading: 'Heading',
    level: 2,
    markdown: null,
    noteIds: [],
    ...change,
  })),
  changeSummary: 'Changed it',
  requestQuote: 'text',
  seenVersion,
});

// 1. A revision that nothing asked for, or that quotes words not said, writes nothing.
const books = () => {
  const topics = createAliasBook('tp');
  const sections = createAliasBook('s');
  topics.add('car');
  topics.add('kitchen');
  sections.add('sec-1');
  return { topics, sections };
};
const reply = (text: string, over: Record<string, unknown> = {}) => {
  const { topics, sections } = books();
  return normalizeNomosReply(
    {
      commands: [
        {
          kind: 'reviseTopic',
          topicAlias: 'tp1',
          requestQuote: 'make the intro shorter',
          changeSummary: 'Shortened it',
          topicChanges: [
            {
              kind: 'replace',
              sectionAlias: 's1',
              sectionAliases: [],
              afterSectionAlias: null,
              heading: null,
              level: null,
              markdown: 'Short.',
            },
          ],
          ...over,
        },
      ],
      mentions: [],
      places: [],
    },
    {
      reading,
      aliases: createAliasBook('t'),
      topics,
      sections,
      topicNames: new Map([
        ['car', 'Car care'],
        ['kitchen', 'Kitchen'],
      ]),
      focusedTopicId: null,
      topicVersions: new Map([['car', 3]]),
      captureText: text,
    },
  );
};
assert.deepEqual(reply('make the intro shorter').topicDropped, [
  'topic-revise-unasked',
]);
assert.deepEqual(reply('make the intro shorter in Car care').topicDropped, []);
assert.equal(
  reply('make the intro shorter in Car care').topicCommands.length,
  1,
);
assert.deepEqual(
  reply('shorten Car care', { requestQuote: 'other words' }).topicDropped,
  ['topic-revise-unasked'],
);
assert.deepEqual(
  reply('make the intro shorter in Kitchen', { topicAlias: 'tp2' })
    .topicDropped,
  ['topic-revise-unseen'],
);

// 1b. A question about a topic never revises it: the quote itself must ask for a change, in two words or more.
assert.deepEqual(
  reply('what size are my tyres in Car care?', { requestQuote: 'tyres' })
    .topicDropped,
  ['topic-revise-unasked'],
);
assert.deepEqual(
  reply('what should I change the oil with in Car care?', {
    requestQuote: 'change the oil with',
  }).topicDropped,
  ['topic-revise-unasked'],
);
assert.deepEqual(
  reply('shorten Car care', { requestQuote: 'shorten' }).topicDropped,
  ['topic-revise-unasked'],
);
assert.equal(hasReviseCue('what should I change the oil with?'), false);
assert.equal(hasReviseCue('what size are my tyres?'), false);
assert.equal(hasReviseCue('make the intro shorter'), true);

// 1c. A move is kept only when the words move the topic they name; grouping is asked only by its own words.
const moveReply = (text: string) => {
  const { topics } = books();
  return normalizeNomosReply(
    {
      commands: [
        {
          kind: 'moveTopic',
          topicAlias: 'tp1',
          parentAlias: 'tp2',
          childAliases: [],
          title: null,
        },
      ],
      mentions: [],
      places: [],
    },
    {
      reading,
      aliases: createAliasBook('t'),
      topics,
      topicNames: new Map([
        ['car', 'Car care'],
        ['kitchen', 'Kitchen'],
      ]),
      captureText: text,
    },
  );
};
assert.equal(moveReply('put Car care under Kitchen').topicCommands.length, 1);
assert.deepEqual(moveReply('what is in Car care?').topicDropped, [
  'topic-move-unasked',
]);
assert.deepEqual(moveReply('move the dentist to Tuesday').topicDropped, [
  'topic-move-unasked',
]);
assert.equal(
  isGroupingAsked(
    'move Running to Tuesday and Stretching to Wednesday',
    'Fitness',
    ['Running', 'Stretching'],
  ),
  false,
);
assert.equal(
  isGroupingAsked('group Running and Stretching', 'Fitness', [
    'Running',
    'Stretching',
  ]),
  true,
);
assert.equal(
  isGroupingAsked('put them under Fitness', 'Fitness', ['Running']),
  true,
);

// 2. A person's sections are byte-for-byte unchanged unless the words name them.
const doc = [section('s1'), person('mine'), section('s2')];
const carTopic = topicOf('car', { name: 'Car care', sections: doc });
const before = JSON.stringify(doc[1]);
const edited = plan(
  [
    revise('car', [
      { kind: 'replace', sectionId: 's1', markdown: 'New s1.' },
      { kind: 'replace', sectionId: 'mine', markdown: 'Taken over.' },
    ]),
  ],
  [carTopic],
  { captureText: 'make Car care shorter' },
);
assert.equal(edited.versions.length, 1);
assert.equal(
  JSON.stringify(edited.versions[0].sections.find((s) => s.id === 'mine')),
  before,
);
assert.equal(edited.versions[0].sections[0].markdown, 'New s1.');
const intro = plan(
  [
    revise('car', [
      { kind: 'replace', sectionId: 'mine', markdown: 'Rewritten intro.' },
      { kind: 'replace', sectionId: 's2', markdown: 'Not this.' },
    ]),
  ],
  [
    topicOf('car', {
      name: 'Car care',
      sections: [person('mine'), section('s1'), section('s2')],
    }),
  ],
  { captureText: 'rewrite the intro of Car care' },
);
const introSections = intro.versions[0].sections;
assert.equal(introSections[0].markdown, 'Rewritten intro.');
assert.equal(introSections[0].writtenBy, 'nomos');
const note: PlannedNote = {
  id: 'n-new',
  title: 'Tyre size',
  topicIds: ['car'],
  source: { kind: 'note', noteId: 'n-new' },
};
const added = plan(
  [
    {
      kind: 'addToTopic',
      topicId: 'car',
      noteIndex: 0,
      afterSectionId: null,
      heading: 'Tyre size',
      markdown: 'It is 205.',
    },
  ],
  [carTopic],
  { notes: [note] },
);
assert.equal(added.versions.length, 1);
assert.equal(
  JSON.stringify(added.versions[0].sections.find((s) => s.id === 'mine')),
  before,
);
assert.deepEqual([...added.skipFiling], ['car:n-new']);
assert.equal(added.versions[0].reason, 'addedFromSource');

// 3. A parent that was not asked for is a question, with nothing written.
const running = topicOf('running', { name: 'Running' });
const stretching = topicOf('stretching', { name: 'Stretching' });
const group: TopicCommand = {
  kind: 'createParentTopic',
  name: 'Fitness',
  childIds: ['running', 'stretching'],
  isAsked: false,
};
const asked = plan([group], [running, stretching]);
assert.equal(asked.questions.length, 1);
assert.equal(asked.questions[0].state.kind, 'groupTopics');
assert.deepEqual(
  [
    asked.versions.length,
    asked.placements.length,
    asked.parentCreates.length,
    asked.effects.length,
  ],
  [0, 0, 0, 0],
);
assert.equal(
  isGroupingAsked('group Running and Stretching', 'Fitness', [
    'Running',
    'Stretching',
  ]),
  true,
);
assert.equal(
  isGroupingAsked('Fitness is something I care about', 'Fitness', [
    'Running',
    'Stretching',
  ]),
  false,
);
assert.equal(
  isGroupingAsked('Running and Stretching were good', 'Fitness', [
    'Running',
    'Stretching',
  ]),
  false,
);
const doneAsked = plan(
  [{ ...group, isAsked: true } as TopicCommand],
  [running, stretching],
);
assert.equal(doneAsked.questions.length, 0);
assert.equal(doneAsked.parentCreates.length, 1);

const live = [
  topicOf('running', { name: 'Running', sections: [section('r1')] }),
  topicOf('stretching', { name: 'Stretching', version: 0 }),
];
const grouping = (name = 'Fitness') =>
  planGroupTopics({
    name,
    childIds: ['running', 'stretching'],
    topics: new Map(live.map((topic) => [topic.id, topic])),
    tree: treeOf(live),
    captureId: 'c1',
    executionId: 'e1',
    now: NOW,
    newId,
    seal,
    room: 40,
  });
const grouped = grouping();
assert.equal(grouped.kind, 'grouped');
if (grouped.kind === 'grouped') {
  assert.equal(grouped.parentCreate.data.createdBy, 'nomos');
  assert.equal(grouped.parentCreate.data.version, 0);
  assert.equal(grouped.parentCreate.data.docState, 'empty');
  assert.deepEqual(
    grouped.placements.map((p) => [p.id, p.parentId, p.depth]),
    [
      ['running', grouped.parentId, 2],
      ['stretching', grouped.parentId, 2],
    ],
  );
  assert.deepEqual(
    grouped.versions.map((v: PlannedVersion) => [v.topicId, v.reason]),
    [['running', 'grouped']],
  );
  assert.equal(grouped.line, 'Grouped Running and Stretching under Fitness');
}

const heldQuestion = buildGroupQuestion({
  name: 'Fitness',
  childIds: ['running', 'stretching'],
  childNames: ['Running', 'Stretching'],
});
const resolve = (optionId: 'yes' | 'no', withGroup: boolean) =>
  planResolve({
    captureId: 'c1',
    questionId: 'q1',
    optionId,
    by: 'tap',
    now: NOW,
    timeZone: 'UTC',
    executionId: 'e2',
    capture: {
      status: 'needsYou',
      createdAt: NOW,
      whoIds: [],
      placeIds: [],
      executionIds: [],
      questionState: {
        q1: {
          kind: 'groupTopics',
          shape: 'yesNo',
          askedAt: NOW,
          answeredAt: null,
          skippedAt: null,
          dismissedAt: null,
        },
      },
    },
    opened: { questions: { q1: heldQuestion } },
    tasks: new Map(),
    facts: new Map(),
    keyDate: null,
    text: null,
    chosen: null,
    group: withGroup
      ? {
          topics: new Map(live.map((topic) => [topic.id, topic])),
          tree: treeOf(live),
        }
      : undefined,
    newId,
    seal,
  });
const no = resolve('no', false);
assert.equal(no.refused, null);
if (no.refused === null) {
  assert.equal(no.plan.execution, null);
  assert.equal(no.plan.groupWrite ?? null, null);
  assert.equal(no.plan.capture.status, 'sorted');
}
const yes = resolve('yes', true);
assert.equal(yes.refused, null);
if (yes.refused === null) {
  assert.equal(yes.plan.groupWrite?.parentCreate.data.createdBy, 'nomos');
  assert.equal(yes.plan.groupWrite?.placements.length, 2);
  assert.equal(yes.plan.groupWrite?.versions[0].reason, 'grouped');
  assert.ok(yes.plan.execution);
}
assert.deepEqual(resolve('yes', false), { refused: 'topicGone' });

// 4. Two topics citing one edited note each get a run, and a removed note's marks go in code.
const cited = (id: string): TopicSection =>
  section(`${id}-s`, {
    sources: [{ kind: 'message', captureId: 'c', at: 1, noteId: 'shared' }],
  });
const citing = [
  topicOf('washing', { sections: [cited('washing'), section('w2')] }),
  topicOf('fragrance', {
    sections: [
      section('f1', { sources: [{ kind: 'note', noteId: 'shared' }] }),
    ],
  }),
  topicOf('kitchen', { sections: [section('k1')] }),
];
const citingTopics = citing.filter((topic) =>
  topic.sections.some((entry) =>
    entry.sources.some((source) => sourceNoteId(source) === 'shared'),
  ),
);
assert.deepEqual(
  citingTopics.map((topic) => topic.id),
  ['washing', 'fragrance'],
);
const droppedOnes = citingTopics.map((topic) =>
  dropGoneSources(topic.sections, new Set(['shared'])),
);
assert.deepEqual(
  droppedOnes.map((result) => result.changed),
  [true, true],
);
assert.deepEqual(
  droppedOnes[0].sections.map((entry) => entry.id),
  ['w2'],
);
assert.equal(droppedOnes[1].sections.length, 0);

// 5. Two revisions that read the same version: the second is sent back, redone from the new version and kept as the next one.
const store = {
  topic: topicOf('car', {
    name: 'Car care',
    sections: [section('s1'), section('s2')],
  }),
  versions: [3],
};
const commit = (result: ReturnType<typeof plan>) =>
  result.versions.forEach((version) => {
    store.topic = {
      ...store.topic,
      version: version.currentVersion + 1,
      sections: version.sections,
    };
    store.versions = [...store.versions, version.currentVersion + 1];
  });
const first = plan(
  [revise('car', [{ kind: 'replace', sectionId: 's1', markdown: 'First.' }])],
  [store.topic],
);
commit(first);
assert.equal(store.topic.version, 4);
const second = revise('car', [
  { kind: 'replace', sectionId: 's2', markdown: 'Second.' },
]);
const sent = plan([second], [store.topic]);
assert.equal(sent.versions.length, 0);
assert.equal(sent.retry.length, 1);
assert.equal(sent.notKept[0], buildTopicRacedLine('Car care'));
assert.match(sent.notKept[0], /changed while this was made/);
const again = revise(
  'car',
  [{ kind: 'replace', sectionId: 's2', markdown: 'Second.' }],
  store.topic.version,
);
const retried = plan([again], [store.topic]);
commit(retried);
assert.equal(store.topic.version, 5);
assert.equal(
  store.topic.sections.find((entry) => entry.id === 's1')?.markdown,
  'First.',
);
assert.equal(
  store.topic.sections.find((entry) => entry.id === 's2')?.markdown,
  'Second.',
);
const third = plan([second], [store.topic]);
assert.equal(third.versions.length, 0);
assert.match(third.notKept[0], /changed while this was made/);
assert.deepEqual(store.versions, [3, 4, 5]);

// 5b. A refusal for lack of room says so, never silently: an add waits as a pending note, a move names itself.
const roomAdd = plan(
  [
    {
      kind: 'addToTopic',
      topicId: 'car',
      noteIndex: 0,
      afterSectionId: null,
      heading: 'H',
      markdown: 'M',
    },
  ],
  [store.topic],
  { notes: [note], room: 0 },
);
assert.deepEqual([roomAdd.versions.length, roomAdd.skipFiling.size], [0, 0]);
assert.match(roomAdd.notKept[0], /Not written into Car care yet/);
const roomMove = plan(
  [{ kind: 'moveTopic', topicId: 'car', parentId: 'kitchen' }],
  [store.topic, topicOf('kitchen', { name: 'Kitchen' })],
  { room: 0 },
);
assert.match(roomMove.notKept[0], /Not moved · Too much changed at once/);

// 6. A live write claim refuses an add and a revision, and a move under it writes no version.
const claimed = topicOf('car', {
  name: 'Car care',
  sections: [section('s1')],
  writeClaim: { claimId: 'x', at: NOW - 1_000 },
});
const target = topicOf('kitchen', { name: 'Kitchen' });
const busyAdd = plan(
  [
    {
      kind: 'addToTopic',
      topicId: 'car',
      noteIndex: 0,
      afterSectionId: null,
      heading: 'H',
      markdown: 'M',
    },
  ],
  [claimed],
  { notes: [note] },
);
assert.deepEqual([busyAdd.versions.length, busyAdd.skipFiling.size], [0, 0]);
assert.match(busyAdd.notKept[0], /is being written/);
const busyRevise = plan(
  [revise('car', [{ kind: 'replace', sectionId: 's1', markdown: 'X' }])],
  [claimed],
);
assert.equal(busyRevise.versions.length, 0);
assert.match(busyRevise.notKept[0], /is being written/);
const busyMove = plan(
  [{ kind: 'moveTopic', topicId: 'car', parentId: 'kitchen' }],
  [claimed, target],
);
assert.equal(busyMove.versions.length, 0);
const expired = plan(
  [revise('car', [{ kind: 'replace', sectionId: 's1', markdown: 'X' }])],
  [{ ...claimed, writeClaim: { claimId: 'x', at: NOW - 200_000 } }],
);
assert.equal(expired.versions.length, 1);

// 7. A move past three levels, into its own subtree or into a full parent is refused.
const deep = [
  topicOf('a', { name: 'A' }),
  topicOf('b', { name: 'B', parentId: 'a', depth: 2 }),
  topicOf('c', { name: 'C', parentId: 'b', depth: 3 }),
  topicOf('d', { name: 'D' }),
  topicOf('e', { name: 'E', parentId: 'd', depth: 2 }),
];
const tooDeep = plan(
  [{ kind: 'moveTopic', topicId: 'd', parentId: 'c' }],
  deep,
);
assert.deepEqual([tooDeep.placements.length, tooDeep.notKept.length], [0, 1]);
const cycle = plan([{ kind: 'moveTopic', topicId: 'a', parentId: 'b' }], deep);
assert.deepEqual([cycle.placements.length, cycle.notKept.length], [0, 1]);
const crowded = [
  topicOf('parent', { name: 'Parent' }),
  ...Array.from({ length: serverLimits.SUBTOPICS_MAX }, (_, index) =>
    topicOf(`kid-${index}`, {
      name: `Kid ${index}`,
      parentId: 'parent',
      depth: 2,
    }),
  ),
  topicOf('extra', { name: 'Extra' }),
];
const full = plan(
  [{ kind: 'moveTopic', topicId: 'extra', parentId: 'parent' }],
  crowded,
);
assert.deepEqual([full.placements.length, full.notKept.length], [0, 1]);
const fine = plan([{ kind: 'moveTopic', topicId: 'e', parentId: 'a' }], deep);
assert.equal(fine.versions[0].topicFields?.parentId, 'a');
assert.equal(fine.notKept.length, 0);

// 8. The whole document is read for a question or a change; otherwise its outline.
assert.equal(topicDocumentFor('hello there', false), null);
assert.equal(topicDocumentFor('what size are the tyres?', true), 'whole');
assert.equal(topicDocumentFor('make the intro shorter', true), 'whole');
assert.equal(
  topicDocumentFor('the winter tyres are 205/55 R16', true),
  'outline',
);

// The server's limits are the device's.
assert.equal(serverLimits.SUBTOPICS_MAX, deviceLimits.SUBTOPICS_MAX);
assert.equal(serverLimits.TOPIC_DEPTH_MAX, deviceLimits.TOPIC_DEPTH_MAX);
assert.equal(serverLimits.TOPICS_LIMIT, deviceLimits.TOPICS_LIMIT);

console.log('helm topic grow: ok');
