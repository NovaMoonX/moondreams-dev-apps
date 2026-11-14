import assert from 'node:assert/strict';

import {
  openForHelm,
  sealForHelm,
} from '../../functions/src/apps/helm/helmKey.ts';
import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import { createFixtureProvider } from '../../functions/src/apps/helm/nomos/fixtureProvider.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import type { CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  buildExecution,
  planWrites,
  settleCapture,
  type KeptNote,
  type NoteTopicState,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planResolve,
  type ResolveInput,
} from '../../functions/src/apps/helm/nomos/resolveQuestion.ts';
import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';
import {
  planUndo,
  type UndoTarget,
} from '../../src/apps/helm/nomos/planUndo.ts';
import type { OpenExecution } from '../../src/apps/helm/types.ts';
import { rankNotes } from '../../src/apps/helm/utils/noteSearch.ts';

const KEY = { keyId: 'helm-key-test', keyVersion: 1, key: Buffer.alloc(32, 7) };
const seal = (fields: Record<string, unknown>) => sealForHelm(KEY, fields);

const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const TOPICS = new Map<string, NoteTopicState>([
  [
    'kitchen',
    {
      name: 'Kitchen',
      path: 'Kitchen',
      docState: 'current',
      pendingNoteIds: [],
    },
  ],
  [
    'baking',
    {
      name: 'Baking',
      path: 'Kitchen › Baking',
      docState: 'empty',
      pendingNoteIds: ['n-old'],
    },
  ],
  [
    'cars',
    {
      name: 'Car care',
      path: 'Car care',
      docState: 'writing',
      pendingNoteIds: [],
    },
  ],
]);

const TEXT = 'remember that cakes keep 3 days in the fridge';

const note = (extra: Record<string, unknown> = {}) => ({
  kind: 'createNote',
  title: 'Cakes keep 3 days in the fridge',
  bodyQuote: 'cakes keep 3 days in the fridge',
  topicAliases: [] as string[],
  ...extra,
});

const run = (
  commands: unknown[],
  extra: {
    text?: string;
    kept?: KeptNote[];
    noteCount?: number;
  } = {},
) => {
  const topics = createAliasBook('tp');
  ['kitchen', 'baking', 'cars'].forEach((id) => topics.add(id));
  const text = extra.text ?? TEXT;
  const read = normalizeNomosReply(
    { commands, mentions: [], places: [] },
    {
      reading: READING,
      aliases: createAliasBook('t'),
      topics,
      captureText: text,
    },
  );
  const ids = { n: 0 };
  const result = planWrites({
    commands: read.commands,
    notes: read.notes,
    noteFacts: read.noteFacts,
    captureText: text,
    existing: new Map(),
    captureId: 'c1',
    executionId: 'e1',
    now: 5000,
    seal,
    newId: () => `id-${(ids.n += 1)}`,
    topics: TOPICS,
    keptNotes: extra.kept ?? [],
    noteCount: extra.noteCount ?? 0,
  });
  return { read, result };
};

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

test('one topic files the note, marks the topic behind and records both effects', () => {
  const { result } = run([note({ topicAliases: ['tp2'] })]);
  assert.equal(result.noteCreates.length, 1);
  const [made] = result.noteCreates;
  assert.deepEqual(made.data.topicIds, ['baking']);
  assert.equal(made.data.source, 'capture');
  assert.equal(made.data.createdBy, 'nomos');
  assert.equal(made.data.sourceCaptureId, 'c1');
  assert.equal(made.data.lastEditedAt, null);
  const opened = openForHelm(KEY, made.data.sealed as SealedPayload);
  assert.equal(opened.title, 'Cakes keep 3 days in the fridge');
  assert.equal(opened.body, 'cakes keep 3 days in the fridge');
  assert.deepEqual(result.topicUpdates, [
    { id: 'baking', docState: 'behind', addPendingIds: [made.id] },
  ]);
  assert.deepEqual(
    result.effectRefs.map((ref) => [ref.op, ref.collection]),
    [
      ['create', 'notes'],
      ['update', 'topics'],
    ],
  );
  assert.deepEqual(result.effects[1].previous, {
    docState: 'empty',
    pendingNoteIds: ['n-old'],
  });
  assert.deepEqual(result.effects[1].written, {
    docState: 'behind',
    pendingNoteIds: ['n-old', made.id],
  });
  assert.equal(
    result.effects[0].written['sealed.title'],
    'Saved a note: Cakes keep 3 days in the fridge · Baking',
  );
  assert.equal(result.questions.length, 0);
});

test('no topic saves it loose, and a topic being written keeps its state', () => {
  const loose = run([note()]).result;
  assert.deepEqual(loose.noteCreates[0].data.topicIds, []);
  assert.equal(loose.topicUpdates.length, 0);
  assert.equal(
    loose.effects[0].written['sealed.title'],
    'Saved a note: Cakes keep 3 days in the fridge',
  );
  const writing = run([note({ topicAliases: ['tp3'] })]).result;
  assert.equal(writing.topicUpdates[0].docState, 'writing');
});

test('two topics save it loose and ask which, with both as options and none ticked', () => {
  const { result } = run([note({ topicAliases: ['tp1', 'tp2'] })]);
  assert.deepEqual(result.noteCreates[0].data.topicIds, []);
  assert.equal(result.topicUpdates.length, 0);
  assert.equal(result.questions.length, 1);
  const [question] = result.questions;
  assert.equal(question.state.kind, 'whichTopic');
  assert.equal(question.state.shape, 'pickSeveral');
  const sealed = question.sealed as {
    prompt: string;
    options: { id: string; label: string; ref: unknown }[];
    heldCommands: { kind: string; noteId: string }[];
    builtBy: string;
  };
  assert.equal(
    sealed.prompt,
    'Where should "Cakes keep 3 days in the fridge" go?',
  );
  assert.equal(sealed.builtBy, 'code');
  assert.deepEqual(
    sealed.options.map((option) => [option.id, option.label, option.ref]),
    [
      ['kitchen', 'Kitchen', { collection: 'topics', id: 'kitchen' }],
      ['baking', 'Kitchen › Baking', { collection: 'topics', id: 'baking' }],
    ],
  );
  assert.deepEqual(sealed.heldCommands, [
    { kind: 'fileNote', noteId: result.noteCreates[0].id },
  ]);
  assert.equal(
    question.spoken,
    'Which topics should this note go in: Kitchen, Baking, or both?',
  );
});

test('a hinted note with the same words writes nothing and says so', () => {
  const { result } = run([note({ topicAliases: ['tp2'] })], {
    kept: [
      {
        id: 'n-kept',
        title: 'Cake life',
        body: 'Cakes keep 3 days in the Fridge!',
      },
    ],
  });
  assert.equal(result.noteCreates.length, 0);
  assert.equal(result.effects.length, 0);
  assert.deepEqual(result.lines, [
    {
      text: 'Already in your notes: Cake life',
      ref: { collection: 'notes', id: 'n-kept' },
    },
  ]);
});

test('an unknown topic alias is dropped, and the note still saves', () => {
  const { read, result } = run([
    note({ topicAliases: ['tp9', 'nope', 'tp1', 'tp1'] }),
  ]);
  assert.deepEqual(read.notes[0].topicIds, ['kitchen']);
  assert.deepEqual(result.noteCreates[0].data.topicIds, ['kitchen']);
});

test('words that are not in the capture, or are a same-turn fact, are dropped', () => {
  assert.equal(
    run([note({ bodyQuote: 'cakes keep a week' })]).read.notes.length,
    0,
  );
  const fact = {
    kind: 'noteFact',
    statement: 'cakes keep 3 days in the fridge',
    quote: 'cakes keep 3 days in the fridge',
  };
  assert.equal(
    run([fact, note()]).read.notes.length,
    0,
    'a fact said in the same turn wins',
  );
});

test('the 1,000th note is the last; past it nothing is written', () => {
  assert.equal(run([note()], { noteCount: 999 }).result.noteCreates.length, 1);
  const full = run([note()], { noteCount: 1000 }).result;
  assert.equal(full.noteCreates.length, 0);
  assert.ok(full.notKept.includes('Your notes are full (1,000).'));
});

test('a note refused at the cap is not also a could-not-read question', () => {
  const { read, result } = run([note()], { noteCount: 1000 });
  assert.equal(result.noteCreates.length, 0);
  const settled = settleCapture({
    mode: 'full',
    filed: 0,
    hasMore: false,
    hasFacts: read.notes.length > 0,
    executionId: null,
    now: 5000,
    newId: () => 'x',
    opened: { text: TEXT },
    questionState: {},
    executionIds: [],
    questions: result.questions,
  });
  assert.equal(settled.status, 'sorted');
  assert.deepEqual(Object.keys(settled.questionState), []);
});

test('the model adding a closing period or curly quotes keeps the note, and a word cut in half does not', () => {
  const quoted = run([
    note({ bodyQuote: '\u201Ccakes keep 3 days in the fridge.\u201D' }),
  ]).read;
  assert.equal(quoted.notes.length, 1);
  assert.deepEqual(quoted.noteDropped, []);
  const cut = run([note({ bodyQuote: 'cakes keep 3 days in the frid' })]).read;
  assert.equal(cut.notes.length, 0);
  assert.deepEqual(cut.noteDropped, ['notInCapture']);
  const fact = run([
    {
      kind: 'noteFact',
      statement: 'cakes keep 3 days in the fridge',
      quote: 'cakes keep 3 days in the fridge',
    },
    note(),
  ]).read;
  assert.deepEqual(fact.noteDropped, ['isFact']);
});

test('a saved note reads in the turn summary and its spoken line', () => {
  const { result } = run([note({ topicAliases: ['tp2'] })]);
  assert.equal(result.spokenNote, 'Saved a note in Baking.');
  const built = buildExecution(result, {
    captureId: 'c1',
    now: 5000,
    seal,
    isVoice: true,
    answer: null,
  } as never);
  assert.ok(built);
});

test("the assistant's own line never stands in for a line only code knows to say", () => {
  const { result } = run([note({ topicAliases: ['tp2'] })]);
  const built = buildExecution(result, {
    captureId: 'c1',
    now: 5000,
    seal,
    commands: [],
    inputMode: 'voice',
    said: 'Saved it.',
  });
  const opened = openForHelm(KEY, built.sealed as SealedPayload);
  assert.equal(opened.said, null);
  assert.notEqual(opened.spoken, 'Saved it.');
});

const heldQuestion = () => ({
  kind: 'whichTopic',
  options: [
    { id: 'kitchen', label: 'Kitchen', detail: null, ref: null },
    { id: 'baking', label: 'Kitchen › Baking', detail: null, ref: null },
  ],
  heldCommands: [{ kind: 'fileNote', noteId: 'n1' }],
  answer: null,
});

const resolveInput = (extra: Partial<ResolveInput> = {}): ResolveInput => ({
  captureId: 'c1',
  questionId: 'q1',
  optionId: '',
  optionIds: ['kitchen', 'baking'],
  by: 'tap',
  now: 9000,
  timeZone: 'UTC',
  executionId: 'e9',
  capture: {
    status: 'needsYou',
    createdAt: 4000,
    whoIds: [],
    placeIds: [],
    executionIds: ['e1'],
    questionState: {
      q1: {
        kind: 'whichTopic',
        shape: 'pickSeveral',
        askedAt: 4000,
        answeredAt: null,
        skippedAt: null,
        leftAt: null,
      },
    },
  },
  opened: { text: TEXT, questions: { q1: heldQuestion() } },
  tasks: new Map(),
  facts: new Map(),
  keyDate: null,
  text: null,
  chosen: null,
  note: { title: 'Cakes keep 3 days', topicIds: ['cars'] },
  topics: TOPICS,
  newId: () => 'made',
  seal,
  ...extra,
});

test('picking both files the note in the union and marks both topics behind', () => {
  const resolved = planResolve(resolveInput());
  assert.equal(resolved.refused, null);
  if (resolved.refused !== null) return;
  const { plan } = resolved;
  assert.deepEqual(plan.noteUpdate, {
    id: 'n1',
    data: { topicIds: ['cars', 'kitchen', 'baking'] },
  });
  assert.deepEqual(
    plan.topicUpdates.map((update) => [
      update.id,
      update.docState,
      update.addPendingIds,
    ]),
    [
      ['kitchen', 'behind', ['n1']],
      ['baking', 'behind', ['n1']],
    ],
  );
  const execution = plan.execution as { effectRefs: { collection: string }[] };
  assert.deepEqual(
    execution.effectRefs.map((ref) => ref.collection),
    ['notes', 'topics', 'topics'],
  );
  assert.equal(plan.capture.status, 'sorted');
});

test('a note that is gone, or topics that are all gone, are refused', () => {
  assert.equal(planResolve(resolveInput({ note: null })).refused, 'noteGone');
  assert.equal(
    planResolve(resolveInput({ topics: new Map() })).refused,
    'topicGone',
  );
  assert.equal(
    planResolve(resolveInput({ optionIds: ['elsewhere'] })).refused,
    'unknown',
  );
});

const asOpen = (
  refs: {
    op: 'create' | 'update';
    collection: 'notes' | 'topics';
    docId: string;
  }[],
  effects: {
    written: Record<string, unknown>;
    previous: Record<string, unknown> | null;
  }[],
): OpenExecution => ({
  privacy: 'ordinary',
  id: 'exec-1',
  said: null,
  captureId: 'c1',
  actor: 'nomos',
  category: 'remember',
  autonomyLevel: 2,
  state: 'succeeded',
  effectRefs: refs,
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  questionRef: null,
  errorCode: null,
  createdAt: 5000,
  decidedAt: 5000,
  finishedAt: 5000,
  summary: 'Saved a note',
  effects,
  undoReport: null,
  spoken: null,
  goneIds: null,
  lines: [],
  isUnreadable: false,
});

const undoTargets = (
  noteEdited: boolean,
  topicPending: string[],
): [string, UndoTarget][] => [
  [
    'id-1',
    {
      docId: 'id-1',
      data: { lastEditedAt: noteEdited ? 7000 : null },
      opened: { title: 'Cakes keep 3 days in the fridge', body: 'x' },
    },
  ],
  [
    'baking',
    {
      docId: 'baking',
      data: {
        docState: 'behind',
        pendingNoteIds: topicPending,
        lastEditedAt: null,
      },
      opened: null,
    },
  ],
];

test('Undo deletes the note and puts the topic back as it was, without an edit stamp', () => {
  const { result } = run([note({ topicAliases: ['tp2'] })]);
  const original = asOpen(result.effectRefs as never, result.effects);
  const undone = planUndo({
    original,
    targets: new Map(undoTargets(false, ['n-old', 'id-1'])),
    undoExecutionId: 'u1',
    now: 8000,
    usedIds: new Set(),
  });
  assert.equal(undone.kind, 'write');
  if (undone.kind !== 'write') return;
  assert.deepEqual(
    undone.deletes.map((entry) => entry.docId),
    ['id-1'],
  );
  assert.deepEqual(undone.updates, [
    {
      docId: 'baking',
      collection: 'topics',
      fields: { pendingNoteIds: ['n-old'] },
      reseal: null,
    },
  ]);
  assert.equal(undone.report, 'Took back 1 note.');
});

test('Undo keeps a note the person edited and leaves its topic marked', () => {
  const { result } = run([note({ topicAliases: ['tp2'] })]);
  const original = asOpen(result.effectRefs as never, result.effects);
  const undone = planUndo({
    original,
    targets: new Map(undoTargets(true, ['n-old', 'id-1'])),
    undoExecutionId: 'u1',
    now: 8000,
    usedIds: new Set(),
  });
  assert.equal(undone.kind, 'refused');
});

test('Undo of a filing restores the note topics and the topic marks without touching the edit time', () => {
  const resolved = planResolve(resolveInput({ optionIds: ['baking'] }));
  if (resolved.refused !== null) throw new Error('expected a plan');
  const execution = resolved.plan.execution as {
    effectRefs: {
      op: 'update';
      collection: 'notes' | 'topics';
      docId: string;
    }[];
    sealed: SealedPayload;
  };
  const { effects } = openForHelm(KEY, execution.sealed) as {
    effects: {
      written: Record<string, unknown>;
      previous: Record<string, unknown> | null;
    }[];
  };
  const original = asOpen(execution.effectRefs, effects);
  const undone = planUndo({
    original,
    targets: new Map<string, UndoTarget>([
      [
        'n1',
        {
          docId: 'n1',
          data: { topicIds: ['cars', 'baking'], lastEditedAt: null },
          opened: { title: 'Cakes keep 3 days', body: 'x' },
        },
      ],
      [
        'baking',
        {
          docId: 'baking',
          data: { docState: 'behind', pendingNoteIds: ['n-old', 'n1'] },
          opened: null,
        },
      ],
    ]),
    undoExecutionId: 'u1',
    now: 8000,
    usedIds: new Set(),
  });
  assert.equal(undone.kind, 'write');
  if (undone.kind !== 'write') return;
  const byDoc = new Map(
    undone.updates.map((update) => [update.docId, update.fields]),
  );
  assert.deepEqual(byDoc.get('n1'), { topicIds: ['cars'] });
  assert.deepEqual(byDoc.get('baking'), { pendingNoteIds: ['n-old'] });
});

const TWO_TEXT = 'remember that cakes keep 3 days and bread needs a warm room';

const twoNotes = () =>
  run(
    [
      note({
        bodyQuote: 'cakes keep 3 days',
        topicAliases: ['tp2'],
      }),
      note({
        title: 'Bread needs a warm room',
        bodyQuote: 'bread needs a warm room',
        topicAliases: ['tp2'],
      }),
    ],
    { text: TWO_TEXT },
  ).result;

const undoTwo = (targets: [string, UndoTarget][]) => {
  const result = twoNotes();
  const undone = planUndo({
    original: asOpen(result.effectRefs as never, result.effects),
    targets: new Map(targets),
    undoExecutionId: 'u1',
    now: 8000,
    usedIds: new Set(),
  });
  assert.equal(undone.kind, 'write');
  if (undone.kind !== 'write') throw new Error('expected a write');
  return undone;
};

const noteTarget = (id: string, isEdited: boolean): [string, UndoTarget] => [
  id,
  {
    docId: id,
    data: { lastEditedAt: isEdited ? 7000 : null },
    opened: { title: 'T', body: 'x' },
  },
];

const topicTarget = (pending: string[]): [string, UndoTarget] => [
  'baking',
  {
    docId: 'baking',
    data: { docState: 'behind', pendingNoteIds: pending, lastEditedAt: null },
    opened: null,
  },
];

test('Undo with one of two notes edited keeps that note pending and the topic behind', () => {
  const undone = undoTwo([
    noteTarget('id-1', true),
    noteTarget('id-2', false),
    topicTarget(['n-old', 'id-1', 'id-2']),
  ]);
  assert.deepEqual(
    undone.deletes.map((entry) => entry.docId),
    ['id-2'],
  );
  assert.deepEqual(undone.updates[0].fields, {
    pendingNoteIds: ['n-old', 'id-1'],
  });
});

test('Undo removes only its own note from a topic that gained another since, and restores the topic only when nothing is pending', () => {
  const gained = undoTwo([
    noteTarget('id-1', false),
    noteTarget('id-2', false),
    topicTarget(['n-old', 'id-1', 'id-2', 'later']),
  ]);
  assert.deepEqual(gained.updates[0].fields, {
    pendingNoteIds: ['n-old', 'later'],
  });
  const alone = undoTwo([
    noteTarget('id-1', false),
    noteTarget('id-2', false),
    topicTarget(['id-1', 'id-2']),
  ]);
  assert.deepEqual(alone.updates[0].fields, {
    pendingNoteIds: [],
    docState: 'empty',
  });
});

const NOTES = [
  {
    id: 'a',
    title: 'Washing the car',
    body: 'Use a microfibre cloth in the shade',
    topicIds: ['cars'],
  },
  {
    id: 'b',
    title: 'Cake storage',
    body: 'Cakes keep 3 days in the fridge when covered',
    topicIds: ['baking'],
  },
  {
    id: 'c',
    title: 'Wifi',
    body: 'The wash cycle code is on the router',
    topicIds: [],
  },
];
const RANK_TOPICS = [
  { id: 'cars', name: 'Car care' },
  { id: 'baking', name: 'Baking' },
];

test('rankNotes puts a title match above a body match, and a topic name counts', () => {
  assert.deepEqual(rankNotes('washing', NOTES, RANK_TOPICS).slice(0, 1), ['a']);
  assert.deepEqual(rankNotes('baking', NOTES, RANK_TOPICS), ['b']);
  assert.deepEqual(rankNotes('wash', NOTES, RANK_TOPICS), ['c']);
  assert.deepEqual(
    rankNotes(
      'fridge',
      [
        { id: 'y', title: 'Other', body: 'fridge', topicIds: [] },
        { id: 'x', title: 'Fridge', body: 'other', topicIds: [] },
      ],
      [],
    ),
    ['x', 'y'],
  );
  assert.deepEqual(rankNotes('cake', NOTES, RANK_TOPICS), ['b']);
  assert.equal(rankNotes('cakes', NOTES, RANK_TOPICS)[0], 'b');
});

test('rankNotes ignores stopwords, scores above zero only, and keeps eight', () => {
  assert.deepEqual(rankNotes('the and of to', NOTES, RANK_TOPICS), []);
  assert.deepEqual(rankNotes('', NOTES, RANK_TOPICS), []);
  assert.deepEqual(rankNotes('zebra', NOTES, RANK_TOPICS), []);
  const many = Array.from({ length: 20 }, (_, index) => ({
    id: `n${index}`,
    title: 'Fridge',
    body: 'fridge',
    topicIds: [],
  }));
  assert.equal(rankNotes('the fridge', many, []).length, 8);
});

const ask = async (text: string, reading: CaptureReading = READING) => {
  const context = buildContext({
    text,
    reading: READING,
    createdAt: Date.UTC(2026, 10, 10, 12),
    timeZone: 'UTC',
    tasks: [],
    topics: [
      { id: 'kitchen', name: 'Kitchen', path: 'Kitchen' },
      { id: 'baking', name: 'Baking', path: 'Kitchen › Baking' },
      { id: 'tomatoes', name: 'Tomatoes', path: 'Garden › Tomatoes' },
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
    topics: context.topics,
    facts: context.facts,
    captureText: text,
  });
};

test('the emulator files a cake note in Baking, asks for a two-topic note, and keeps facts and dates as they were', async () => {
  const cakes = await ask('remember that cakes keep 3 days in the fridge');
  assert.equal(cakes.notes.length, 1);
  assert.equal(cakes.notes[0].title, 'Cakes keep 3 days in the fridge');
  assert.deepEqual(cakes.notes[0].topicIds, ['baking']);
  const both = await ask('remember that tomato sauce freezes well');
  assert.deepEqual(both.notes[0].topicIds, ['kitchen', 'tomatoes']);
  const wifi = await ask('note: the wifi at the cabin is cabin-guest');
  assert.equal(wifi.notes.length, 1);
  const birthday = "remember that Dana's birthday is June 3";
  const start = birthday.indexOf('June 3');
  const date = await ask(birthday, {
    ...READING,
    dates: [
      {
        id: 'date:1',
        text: 'June 3',
        start,
        end: start + 6,
        due: { kind: 'day', date: Date.UTC(2027, 5, 3) },
        precision: null,
      },
    ],
  });
  assert.equal(date.notes.length, 0);
  assert.ok(date.keyDates.length > 0);
  const fact = await ask('Dana is allergic to nuts');
  assert.equal(fact.notes.length, 0);
  assert.ok(fact.noteFacts.length > 0);
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
