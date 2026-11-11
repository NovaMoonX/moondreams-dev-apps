import assert from 'node:assert/strict';

import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import { sanitizeScreen } from '../../functions/src/apps/helm/nomos/sanitizeScreen.ts';
import type { CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  MAX_CHANGES,
  MAX_DOC_CHARS,
  MAX_NEW_CHARS,
  MAX_SECTIONS,
  MAX_SECTION_CHARS,
  MAX_SOURCES,
  MAX_VERSIONS,
  LEASE_MS,
  SUBMIT_TOPIC_TOOL,
  applyTopicChanges,
  buildChangeSummary,
  buildWriteMessage,
  createTopicFixtureProvider,
  decideClaim,
  pickPendingNotes,
  pickReason,
  readChanges,
  toNoteSource,
  versionsToDelete,
  type ModelChange,
  type TopicSection,
  type TopicSource,
} from '../../functions/src/apps/helm/topicWrite.ts';

const noteSource = (id: string): TopicSource => ({ kind: 'note', noteId: id });
const section = (
  id: string,
  over: Partial<TopicSection> = {},
): TopicSection => ({
  id,
  heading: `Heading ${id}`,
  level: 2,
  markdown: `Words of ${id}.`,
  writtenBy: 'nomos',
  sources: [noteSource(`note-${id}`)],
  ...over,
});
const change = (over: Partial<ModelChange>): ModelChange => ({
  kind: 'insert',
  sectionId: null,
  sectionIds: [],
  afterSectionId: null,
  heading: 'New',
  level: 2,
  markdown: 'New words.',
  noteIds: ['n1'],
  ...over,
});

const mine = section('a', {
  writtenBy: 'person',
  sources: [{ kind: 'person', at: 1 }],
});
const SECTIONS = [section('s1'), mine, section('s2')];
const known = new Map<string, TopicSource>([
  ['n1', noteSource('n1')],
  ['n2', noteSource('n2')],
  ['note-s1', noteSource('note-s1')],
  ['note-s2', noteSource('note-s2')],
]);
let counter = 0;
const newId = () => `new-${(counter += 1)}`;
const run = (
  changes: ModelChange[],
  over: Partial<Parameters<typeof applyTopicChanges>[0]> = {},
) => applyTopicChanges({ sections: SECTIONS, changes, known, newId, ...over });
const codes = (changes: ModelChange[], over = {}) =>
  run(changes, over).refusals.map((refusal) => refusal.code);

// Each kind of change applies and keeps ids stable.
const inserted = run([change({ afterSectionId: 's1' })]);
assert.deepEqual(inserted.applied, ['insert']);
assert.deepEqual(
  inserted.sections.map((entry) => entry.id),
  ['s1', 'new-1', 'a', 's2'],
);
assert.deepEqual(inserted.sections[1].sources, [noteSource('n1')]);
assert.equal(
  run([change({})]).sections.at(-1)?.markdown,
  'New words.',
  'null afterSectionId appends',
);
const replaced = run([
  change({
    kind: 'replace',
    sectionId: 's1',
    noteIds: ['note-s1', 'n2'],
    markdown: 'Rewritten.',
  }),
]);
assert.equal(replaced.sections[0].id, 's1');
assert.equal(replaced.sections[0].markdown, 'Rewritten.');
assert.deepEqual(replaced.sections[0].sources, [
  noteSource('note-s1'),
  noteSource('n2'),
]);
const merged = run([
  change({
    kind: 'merge',
    sectionIds: ['s1', 's2'],
    noteIds: ['note-s1', 'note-s2'],
    markdown: 'Joined.',
  }),
]);
assert.deepEqual(
  merged.sections.map((entry) => entry.id),
  ['s1', 'a'],
);
const reordered = run([
  change({ kind: 'reorder', sectionIds: ['s2', 'a', 's1'], markdown: null }),
]);
assert.deepEqual(
  reordered.sections.map((entry) => entry.id),
  ['s2', 'a', 's1'],
);
const retitled = run([
  change({
    kind: 'retitle',
    sectionId: 'a',
    heading: 'Mine, renamed',
    markdown: null,
  }),
]);
assert.equal(retitled.sections[1].heading, 'Mine, renamed');
assert.equal(retitled.sections[1].markdown, mine.markdown);
assert.equal(retitled.sections[1].writtenBy, 'person');
assert.deepEqual(retitled.sections[1].sources, mine.sources);
assert.equal(
  run([
    change({
      kind: 'reorder',
      sectionIds: ['s2', 'a', 's1'],
      markdown: null,
    }),
    change({
      kind: 'retitle',
      sectionId: 's1',
      heading: 'Other',
      markdown: null,
    }),
  ]).applied.length,
  2,
);

// Every refusal: the change is skipped and the document is as it was.
const untouched = (changes: ModelChange[], expected: string, over = {}) => {
  const result = run(changes, over);
  assert.deepEqual(
    result.refusals.map((refusal) => refusal.code),
    [expected],
    expected,
  );
  assert.deepEqual(
    result.sections,
    SECTIONS,
    `${expected} leaves the document`,
  );
};
untouched(
  [change({ kind: 'replace', sectionId: 'a', noteIds: ['n1'] })],
  'personSection',
);
untouched(
  [
    change({
      kind: 'merge',
      sectionIds: ['s1', 'a'],
      noteIds: ['note-s1', 'n1'],
    }),
  ],
  'personSection',
);
untouched(
  [change({ kind: 'replace', sectionId: 's1', noteIds: ['n1'] })],
  'droppedSource',
);
untouched(
  [change({ kind: 'merge', sectionIds: ['s1', 's2'], noteIds: ['note-s1'] })],
  'droppedSource',
);
assert.deepEqual(
  codes([change({ kind: 'replace', sectionId: 's1', noteIds: ['n1'] })], {
    gone: new Set(['note-s1']),
  }),
  [],
  'a note that is gone may be dropped',
);
untouched([change({ noteIds: ['invented'] })], 'noSource');
untouched([change({ noteIds: [] })], 'noSource');
untouched([change({ afterSectionId: 'nope' })], 'unknownSection');
untouched(
  [change({ kind: 'replace', sectionId: 'nope', noteIds: ['n1'] })],
  'unknownSection',
);
untouched(
  [
    change({
      kind: 'retitle',
      sectionId: 'nope',
      heading: 'x',
      markdown: null,
    }),
  ],
  'unknownSection',
);
untouched([change({ kind: 'delete' })], 'malformed');
untouched([change({ markdown: '  ' })], 'malformed');
untouched([change({ level: 4 })], 'malformed');
untouched([change({ heading: 'x'.repeat(81) })], 'malformed');
untouched(
  [change({ kind: 'reorder', sectionIds: ['s1', 's2'], markdown: null })],
  'malformed',
);
untouched(
  [change({ kind: 'reorder', sectionIds: ['s1', 's1', 's2'], markdown: null })],
  'malformed',
);
untouched(
  [change({ kind: 'merge', sectionIds: ['s1'], noteIds: ['note-s1'] })],
  'malformed',
);
untouched(
  [
    change({
      kind: 'retitle',
      sectionId: 's1',
      heading: 'Heading s1',
      level: null,
      markdown: null,
    }),
  ],
  'malformed',
);
untouched([change({ markdown: 'x'.repeat(MAX_SECTION_CHARS + 1) })], 'overCap');
untouched(
  [
    change({
      noteIds: Array.from({ length: MAX_SOURCES + 1 }, (_, i) => `m${i}`),
    }),
  ],
  'overCap',
  {
    known: new Map(
      Array.from({ length: MAX_SOURCES + 1 }, (_, i): [string, TopicSource] => [
        `m${i}`,
        noteSource(`m${i}`),
      ]),
    ),
  },
);

// Caps on the whole document.
const full = Array.from({ length: MAX_SECTIONS }, (_, i) =>
  section(`f${i}`, { markdown: 'a' }),
);
const atSections = applyTopicChanges({
  sections: full,
  changes: [change({})],
  known,
  newId,
});
assert.deepEqual(
  atSections.refusals.map((r) => r.code),
  ['overCap'],
);
const heavy = Array.from({ length: 8 }, (_, i) =>
  section(`h${i}`, {
    heading: null,
    markdown: 'b'.repeat(MAX_SECTION_CHARS - 1),
  }),
);
assert.ok(heavy.reduce((sum, s) => sum + s.markdown.length, 0) > MAX_DOC_CHARS);
const atChars = applyTopicChanges({
  sections: heavy,
  changes: [change({})],
  known,
  newId,
});
assert.deepEqual(
  atChars.refusals.map((r) => r.code),
  ['overCap'],
);
const justRoom = Array.from({ length: 7 }, (_, i) =>
  section(`j${i}`, { heading: null, markdown: 'c'.repeat(MAX_SECTION_CHARS) }),
);
assert.deepEqual(
  applyTopicChanges({
    sections: justRoom,
    changes: [
      change({
        heading: null,
        markdown: 'd'.repeat(MAX_DOC_CHARS - 7 * MAX_SECTION_CHARS),
      }),
    ],
    known,
    newId,
  }).refusals,
  [],
  'a document exactly at the cap still takes a change',
);

// Budgets across changes.
const nine = Array.from({ length: MAX_CHANGES + 1 }, () =>
  change({ markdown: 'x', heading: null }),
);
const nineResult = run(nine);
assert.equal(nineResult.applied.length, MAX_CHANGES);
assert.deepEqual(nineResult.refusals, [
  { index: MAX_CHANGES, code: 'tooMany' },
]);
const big = 'y'.repeat(MAX_NEW_CHARS / 2 + 1);
const budget = run([
  change({ markdown: big, heading: null }),
  change({ markdown: big, heading: null }),
]);
assert.deepEqual(budget.refusals, [{ index: 1, code: 'tooMuchNew' }]);
assert.equal(budget.applied.length, 1);
assert.ok(budget.newChars <= MAX_NEW_CHARS);
const afterRefusal = run([
  change({ kind: 'delete' }),
  change({ afterSectionId: 's1' }),
]);
assert.deepEqual(
  afterRefusal.applied,
  ['insert'],
  'a refused change does not stop the rest',
);

// Nothing the model sends can change a person's words.
const tries = run([
  change({ kind: 'replace', sectionId: 'a', noteIds: ['n1'] }),
  change({
    kind: 'merge',
    sectionIds: ['a', 's1'],
    noteIds: ['n1', 'note-s1'],
  }),
  change({
    kind: 'retitle',
    sectionId: 'a',
    heading: 'Renamed',
    markdown: 'Overwritten',
    noteIds: ['n1'],
  }),
]);
const kept = tries.sections.find((entry) => entry.id === 'a');
assert.equal(kept?.markdown, mine.markdown);
assert.equal(kept?.writtenBy, 'person');

// The model's reply.
assert.equal(readChanges(null), null);
assert.equal(readChanges({ changes: 'no' }), null);
const read = readChanges({
  changes: [{ kind: 'insert', markdown: 5, noteIds: ['a', 7] }, 'junk'],
  changeSummary: ` ${'z'.repeat(300)}`,
});
assert.equal(read?.changes.length, 2);
assert.deepEqual(read?.changes[0].noteIds, ['a']);
assert.equal(read?.changes[0].markdown, null);
assert.equal(read?.summary.length, 200);
assert.equal(
  buildChangeSummary('', 'addedFromSource', 2),
  'Brought in 2 notes',
);
assert.equal(pickReason(0, ['insert']), 'firstWritten');
assert.equal(pickReason(3, ['reorder', 'retitle']), 'rearranged');
assert.equal(pickReason(3, ['reorder', 'insert']), 'addedFromSource');
assert.equal(
  (SUBMIT_TOPIC_TOOL.inputSchema.properties as Record<string, unknown>)
    .changes !== undefined,
  true,
);

// The version cap keeps the first and the newest.
assert.deepEqual(versionsToDelete([1, 2, 3], MAX_VERSIONS), []);
const all = Array.from({ length: MAX_VERSIONS + 1 }, (_, i) => i + 1);
assert.deepEqual(versionsToDelete(all), [2]);
assert.deepEqual(versionsToDelete([...all, MAX_VERSIONS + 2]), [2, 3]);
const kept200 = all.filter((v) => !versionsToDelete(all).includes(v));
assert.equal(kept200.length, MAX_VERSIONS);
assert.ok(kept200.includes(1));

// Which notes a write takes: the oldest 20, the rest wait.
const many = Array.from({ length: 25 }, (_, i) => ({
  id: `n${i}`,
  createdAt: 1000 - i,
}));
const picked = pickPendingNotes([...many, many[0]]);
assert.equal(picked.taken.length, 20);
assert.equal(picked.waiting.length, 5);
assert.equal(picked.taken[0], 'n24');
assert.deepEqual(picked.waiting, ['n4', 'n3', 'n2', 'n1', 'n0']);
assert.deepEqual(pickPendingNotes([]), { taken: [], waiting: [] });

// Two calls racing for one topic: the claim is decided against what the first one wrote.
const NOW = 1_000_000;
const base = {
  docState: 'behind' as const,
  version: 3,
  writeClaim: null,
  pendingCount: 2,
  filedCount: 0,
  now: NOW,
};
const first = decideClaim(base);
assert.equal(first, 'claim');
const afterFirst = {
  ...base,
  docState: 'writing' as const,
  writeClaim: { claimId: 'c1', at: NOW },
};
assert.equal(
  decideClaim({ ...afterFirst, now: NOW + 5 }),
  'busy',
  'the second call finds a live claim',
);
assert.equal(decideClaim({ ...afterFirst, now: NOW + LEASE_MS - 1 }), 'busy');
assert.equal(
  decideClaim({ ...afterFirst, now: NOW + LEASE_MS }),
  'claim',
  'a lapsed lease is taken over',
);
const claims = [base, afterFirst].map((state, index) =>
  decideClaim({ ...state, now: NOW + index }),
);
assert.equal(claims.filter((decision) => decision === 'claim').length, 1);
assert.equal(decideClaim({ ...base, docState: 'current' }), 'current');
assert.equal(decideClaim({ ...base, pendingCount: 0 }), 'current');
assert.equal(decideClaim({ ...base, docState: 'failed' }), 'claim');
assert.equal(
  decideClaim({
    ...base,
    docState: 'empty',
    version: 0,
    pendingCount: 0,
    filedCount: 3,
  }),
  'claim',
);
assert.equal(
  decideClaim({
    ...base,
    docState: 'empty',
    version: 0,
    pendingCount: 0,
    filedCount: 0,
  }),
  'current',
);

// A note's mark on a section.
const note = {
  id: 'n',
  source: 'typed',
  isFromGeneralAnswer: false,
  sourceCaptureId: null,
  sourceMediaId: null,
  createdAt: 9,
};
assert.deepEqual(toNoteSource(note, null), { kind: 'note', noteId: 'n' });
assert.deepEqual(
  toNoteSource({ ...note, source: 'capture', sourceCaptureId: 'c' }, 5),
  { kind: 'message', captureId: 'c', at: 5 },
);
assert.deepEqual(toNoteSource({ ...note, isFromGeneralAnswer: true }, null), {
  kind: 'general',
  noteId: 'n',
});
assert.deepEqual(
  toNoteSource({ ...note, source: 'importedFile', sourceMediaId: 'm' }, null),
  { kind: 'file', mediaId: 'm', noteId: 'n' },
);

// The emulator's writer: a document with headings, a list and a source on each section.
const notes = [
  {
    id: 'a1',
    title: 'Tyre pressure',
    body: 'Front 32 psi. Rear 36 psi. Check cold. Winter: add 2 psi.',
    isUnchecked: false,
  },
  {
    id: 'a2',
    title: 'Wash routine',
    body: 'Wash every two weeks. Use a two-bucket method.',
    isUnchecked: false,
  },
];
const message = buildWriteMessage({ name: 'Car care', sections: [], notes });
const loop = await createTopicFixtureProvider().runToolLoop({
  role: 'topicWrite',
  system: '',
  messages: [{ role: 'user', content: message }],
  mcpClient: {
    listTools: async () => ({ tools: [] }),
    callTool: async () => ({ content: [] }),
  } as never,
  terminalTool: SUBMIT_TOPIC_TOOL,
  limits: { maxTurns: 2, maxToolCalls: 0, maxMillis: 1000 },
});
const proposed = readChanges(loop.terminalInput);
assert.ok(proposed);
const fixtureKnown = new Map(
  notes.map((n): [string, TopicSource] => [n.id, noteSource(n.id)]),
);
const written = applyTopicChanges({
  sections: [],
  changes: proposed.changes,
  known: fixtureKnown,
  newId,
});
assert.deepEqual(written.refusals, []);
assert.equal(written.sections.length, 3);
assert.ok(
  written.sections.every(
    (s) => s.sources.length > 0 && s.writtenBy === 'nomos',
  ),
);
assert.ok(written.sections.some((s) => s.markdown.startsWith('- ')));
assert.equal(written.sections[0].level, 1);
const size = JSON.stringify(written.sections).length;
console.log(
  `fixture document: ${written.sections.length} sections, ${written.sections.reduce((sum, s) => sum + s.markdown.length + (s.heading?.length ?? 0), 0)} characters, ${size} bytes as JSON`,
);

// A question asked from a topic's page: the document goes in whole, sections citing their notes.
const reading: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};
const screen = sanitizeScreen({
  view: 'topic',
  topicId: 'topic-1',
  visible: [],
});
assert.equal(screen?.topicId, 'topic-1');
assert.equal(
  sanitizeScreen({
    view: 'topic',
    focus: { collection: 'topics', id: 'topic-2' },
  })?.topicId,
  'topic-2',
);
assert.equal(
  sanitizeScreen({ view: 'knowledge', topicId: 'topic-1' })?.topicId,
  undefined,
);
assert.equal(
  sanitizeScreen({ view: 'topic', topicId: '../x' })?.topicId,
  undefined,
);
const context = buildContext({
  text: "what's the tyre pressure?",
  reading,
  createdAt: NOW,
  timeZone: 'UTC',
  tasks: [],
  notes: [{ id: 'a1', title: 'Tyre pressure', body: '' }],
  focusedTopic: {
    name: 'Car care',
    sections: [
      {
        heading: 'Tyres',
        markdown: 'Front 32 psi.',
        noteIds: ['a1', 'unlisted'],
      },
      {
        heading: 'Huge',
        markdown: 'h'.repeat(MAX_DOC_CHARS + 10),
        noteIds: [],
      },
      { heading: 'Past the cap', markdown: 'never', noteIds: [] },
    ],
  },
});
const block = context.message.match(
  /<topic_document>(.*)<\/topic_document>/,
)?.[1];
assert.ok(block);
const document = JSON.parse(block) as {
  name: string;
  sections: { markdown: string; sourceAliases: string[] }[];
};
assert.equal(document.name, 'Car care');
assert.deepEqual(document.sections[0].sourceAliases, ['n1']);
assert.equal(context.notes.idOf('n1'), 'a1');
assert.equal(
  document.sections.reduce((sum, s) => sum + s.markdown.length, 0),
  MAX_DOC_CHARS,
);
assert.equal(document.sections.length, 2);
assert.ok(!context.message.includes('unlisted'));
assert.ok(
  !buildContext({
    text: 'hi',
    reading,
    createdAt: NOW,
    timeZone: 'UTC',
    tasks: [],
  }).message.includes('topic_document'),
);

console.log('helm topic write: ok');
