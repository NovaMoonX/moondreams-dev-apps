import assert from 'node:assert/strict';

import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import {
  canUndo,
  getTakenBackIds,
  planUndo,
  type UndoPlan,
  type UndoTarget,
} from '../../src/apps/helm/nomos/planUndo.ts';
import type {
  EffectRef,
  ExecutionEffect,
  OpenExecution,
  TaskSealed,
} from '../../src/apps/helm/types.ts';

const NOW = Date.UTC(2026, 10, 9, 17, 0);
const EARLIER = NOW - 3_600_000;
const SUNDAY = Date.UTC(2026, 10, 15);
const FRIDAY = Date.UTC(2026, 10, 13);

const sealedOf = (title: string): TaskSealed => ({
  title,
  notes: 'Ask about the cake',
  steps: { a: { text: 'Find the number' } },
});

const target = (
  docId: string,
  data: Record<string, unknown> | null,
  opened: TaskSealed | null = data ? sealedOf('Task') : null,
): [string, UndoTarget] => [docId, { docId, data, opened }];

const create = (
  docId: string,
  title: string,
): { ref: EffectRef; effect: ExecutionEffect } => ({
  ref: { op: 'create', collection: 'tasks', docId },
  effect: {
    written: {
      'sealed.title': title,
      due: null,
      status: 'open',
      isUrgent: false,
    },
    previous: null,
  },
});

const update = (
  docId: string,
  written: Record<string, unknown>,
  previous: Record<string, unknown>,
) => ({
  ref: { op: 'update', collection: 'tasks', docId } as EffectRef,
  effect: { written, previous },
});

const execution = (
  entries: { ref: EffectRef; effect: ExecutionEffect }[],
  overrides: Partial<OpenExecution> = {},
): OpenExecution => ({
  id: 'exec-1',
  captureId: 'turn-1',
  actor: 'nomos',
  category: 'organize',
  autonomyLevel: 2,
  state: 'succeeded',
  effectRefs: entries.map((entry) => entry.ref),
  linkedWhoIds: [],
  linkedPlaceIds: [],
  undoesExecutionId: null,
  undoneByExecutionId: null,
  questionRef: null,
  errorCode: null,
  createdAt: EARLIER,
  decidedAt: EARLIER,
  finishedAt: EARLIER,
  summary: 'Made 2 tasks',
  effects: entries.map((entry) => entry.effect),
  undoReport: null,
  spoken: null,
  goneIds: null,
  isUnreadable: false,
  ...overrides,
});

const plan = (
  original: OpenExecution,
  targets: [string, UndoTarget][],
  usedIds = new Set<string>(),
): UndoPlan =>
  planUndo({
    original,
    targets: new Map(targets),
    undoExecutionId: 'undo-1',
    now: NOW,
    usedIds,
  });

const asWrite = (result: UndoPlan) => {
  assert.equal(result.kind, 'write');
  if (result.kind !== 'write') throw new Error('expected a write');
  return result;
};

const asRefused = (result: UndoPlan) => {
  assert.equal(result.kind, 'refused');
  if (result.kind !== 'refused') throw new Error('expected a refusal');
  return result;
};

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const TWO_CREATES = [
  create('t1', 'Book the hair trial'),
  create('t2', 'Send the save-the-dates'),
];

test('full undo deletes every task the execution made', () => {
  const result = asWrite(
    plan(execution(TWO_CREATES), [
      target('t1', { lastEditedAt: null }, sealedOf('Book the hair trial')),
      target('t2', { lastEditedAt: null }, sealedOf('Send the save-the-dates')),
    ]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['t1', 't2'],
  );
  assert.equal(result.updates.length, 0);
  assert.equal(result.report, 'Took back 2 tasks.');
  assert.equal(result.undoSealed.summary, 'Took back 2 tasks');
  assert.deepEqual(result.undoSealed.commands, []);
  assert.deepEqual(result.undoSealed.goneIds, []);
  assert.deepEqual(
    result.undoExecution.effectRefs.map((ref) => ref.op),
    ['delete', 'delete'],
  );
  assert.deepEqual(result.undoSealed.effects[0], {
    written: { 'sealed.title': 'Book the hair trial' },
    previous: TWO_CREATES[0].effect.written,
  });
  assert.equal(result.undoExecution.category, 'undo');
  assert.equal(result.undoExecution.actor, 'person');
  assert.equal(result.undoExecution.undoesExecutionId, 'exec-1');
  assert.equal(result.undoExecution.undoneByExecutionId, null);
  assert.equal(result.undoExecution.createdAt, NOW);
});

test('a task the person changed is kept and the rest is taken back', () => {
  const result = asWrite(
    plan(execution(TWO_CREATES), [
      target('t1', { lastEditedAt: null }, sealedOf('Book the hair trial')),
      target(
        't2',
        { lastEditedAt: EARLIER + 1 },
        sealedOf('Send the save-the-dates'),
      ),
    ]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['t1'],
  );
  assert.deepEqual(result.kept, ['Send the save-the-dates']);
  assert.equal(result.report, 'Took back 1 task. Kept 1 you changed since.');
  assert.equal(result.undoSealed.summary, 'Took back 1 task, kept 1');
  assert.equal(result.undoExecution.effectRefs.length, 1);
});

const RENAME = update(
  't1',
  { 'sealed.title': 'Call Dana now', due: FRIDAY, isUrgent: true },
  { 'sealed.title': 'Call Dana', due: SUNDAY, isUrgent: false },
);

test('an update still as written is reverted, resealed with notes and steps kept', () => {
  const opened = { ...sealedOf('Call Dana now'), notes: 'Mind the time zone' };
  const result = asWrite(
    plan(execution([RENAME]), [
      target(
        't1',
        { due: FRIDAY, isUrgent: true, lastEditedAt: EARLIER },
        opened,
      ),
    ]),
  );
  const [only] = result.updates;
  assert.deepEqual(only.fields, {
    due: SUNDAY,
    isUrgent: false,
    lastEditedAt: NOW,
  });
  assert.equal(only.fields.lastEditedAt, NOW);
  assert.deepEqual(only.reseal, { ...opened, title: 'Call Dana' });
  assert.ok(!Object.keys(only.fields).some((key) => key.includes('sealed')));
  assert.deepEqual(result.undoExecution.effectRefs[0].op, 'update');
  assert.deepEqual(result.undoSealed.effects[0].written, {
    due: SUNDAY,
    isUrgent: false,
    'sealed.title': 'Call Dana',
  });
  assert.deepEqual(result.undoSealed.effects[0].previous, {
    due: FRIDAY,
    isUrgent: true,
    'sealed.title': 'Call Dana now',
  });
});

test('an update whose path the person changed since is kept whole', () => {
  const result = asRefused(
    plan(execution([RENAME]), [
      target(
        't1',
        { due: SUNDAY + 1, isUrgent: true },
        sealedOf('Call Dana now'),
      ),
    ]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
  assert.deepEqual(result.kept, ['Call Dana now']);
  assert.equal(
    result.report,
    'Nothing was taken back: you changed Call Dana now since.',
  );
});

test('a changed sealed title keeps the record, an untouched label does not', () => {
  const kept = asRefused(
    plan(execution([RENAME]), [
      target(
        't1',
        { due: FRIDAY, isUrgent: true },
        sealedOf('Call Dana Friday'),
      ),
    ]),
  );
  assert.equal(kept.reason, 'nothingToTakeBack');
});

test('a completion is reverted even after a rename', () => {
  const complete = update(
    't1',
    { 'sealed.title': 'Call Dana', status: 'done', completedAt: EARLIER },
    { 'sealed.title': 'Call Dana', status: 'open', completedAt: null },
  );
  const result = asWrite(
    plan(execution([complete]), [
      target(
        't1',
        { status: 'done', completedAt: EARLIER },
        sealedOf('Call Dana back'),
      ),
    ]),
  );
  const [only] = result.updates;
  assert.deepEqual(only.fields, {
    status: 'open',
    completedAt: null,
    lastEditedAt: NOW,
  });
  assert.equal(only.reseal, null);
});

test('an undo, a failed execution or one with no effects is not undoable', () => {
  const base = execution(TWO_CREATES);
  assert.equal(canUndo(base), true);
  assert.equal(canUndo({ ...base, category: 'undo' }), false);
  assert.equal(canUndo({ ...base, state: 'failed' }), false);
  assert.equal(canUndo({ ...base, effectRefs: [], effects: [] }), false);
  assert.equal(canUndo({ ...base, isUnreadable: true }), false);
  assert.equal(canUndo({ ...base, undoneByExecutionId: 'undo-0' }), false);
  assert.equal(
    asRefused(plan({ ...base, undoneByExecutionId: 'undo-0' }, [])).reason,
    'alreadyUndone',
  );
  assert.equal(
    asRefused(plan({ ...base, category: 'undo' }, [])).reason,
    'notUndoable',
  );
  assert.equal(
    asRefused(plan({ ...base, state: 'failed' }, [])).reason,
    'notUndoable',
  );
});

test('a deleted task is counted, not an error', () => {
  const result = asWrite(
    plan(execution(TWO_CREATES), [
      target('t1', { lastEditedAt: null }, sealedOf('Book the hair trial')),
      target('t2', null),
    ]),
  );
  assert.equal(result.gone, 1);
  assert.deepEqual(result.goneIds, ['t2']);
  assert.deepEqual(result.undoSealed.goneIds, ['t2']);
  assert.equal(result.undoSealed.summary, 'Took back 1 task');
  assert.equal(result.report, 'Took back 1 task. 1 was deleted since.');
});

test('nothing to take back writes nothing and says why', () => {
  const edited = asRefused(
    plan(execution(TWO_CREATES), [
      target('t1', { lastEditedAt: 5 }, sealedOf('Book the hair trial')),
      target('t2', { lastEditedAt: 6 }, sealedOf('Send the save-the-dates')),
    ]),
  );
  assert.equal(edited.reason, 'nothingToTakeBack');
  assert.equal(
    edited.report,
    'Nothing was taken back: you changed Book the hair trial and Send the save-the-dates since.',
  );
  const missing = asRefused(plan(execution(TWO_CREATES), []));
  assert.equal(
    missing.report,
    'Nothing was taken back. 2 tasks were deleted since.',
  );
});

test('two effects on one task are undone newest first', () => {
  const first = update(
    't1',
    { 'sealed.title': 'Call Dana now', due: FRIDAY },
    { 'sealed.title': 'Call Dana', due: SUNDAY },
  );
  const second = update(
    't1',
    { 'sealed.title': 'Call Dana now', status: 'done', completedAt: EARLIER },
    { 'sealed.title': 'Call Dana now', status: 'open', completedAt: null },
  );
  const result = asWrite(
    plan(execution([first, second]), [
      target(
        't1',
        { due: FRIDAY, status: 'done', completedAt: EARLIER },
        sealedOf('Call Dana now'),
      ),
    ]),
  );
  assert.equal(result.updates.length, 1);
  assert.equal(result.undoExecution.effectRefs.length, 1);
  assert.deepEqual(result.updates[0].fields, {
    due: SUNDAY,
    status: 'open',
    completedAt: null,
    lastEditedAt: NOW,
  });
  assert.deepEqual(
    result.updates[0].reseal && 'title' in result.updates[0].reseal
      ? result.updates[0].reseal.title
      : null,
    'Call Dana',
  );
  const partial = asRefused(
    plan(execution([first, second]), [
      target(
        't1',
        { due: FRIDAY, status: 'open', completedAt: null },
        sealedOf('Call Dana now'),
      ),
    ]),
  );
  assert.equal(partial.reason, 'nothingToTakeBack');
});

test('a task made and changed by the same execution is still taken back', () => {
  const completed = update(
    't1',
    {
      'sealed.title': 'Book the hair trial',
      status: 'done',
      completedAt: EARLIER,
    },
    {
      'sealed.title': 'Book the hair trial',
      status: 'open',
      completedAt: null,
    },
  );
  const result = asWrite(
    plan(execution([TWO_CREATES[0], completed]), [
      target(
        't1',
        { lastEditedAt: EARLIER, status: 'done', completedAt: EARLIER },
        sealedOf('Book the hair trial'),
      ),
    ]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['t1'],
  );
});

test('unreadable, mismatched or foreign effects are refused', () => {
  const base = execution(TWO_CREATES);
  assert.equal(
    asRefused(plan({ ...base, isUnreadable: true }, [])).reason,
    'unreadable',
  );
  assert.equal(
    asRefused(plan({ ...base, effects: base.effects.slice(1) }, [])).reason,
    'unreadable',
  );
  const many = Array.from({ length: 41 }, (_, index) =>
    create(`t${index}`, `Task ${index}`),
  );
  assert.equal(asRefused(plan(execution(many), [])).reason, 'unreadable');
});

test('an update path with no previous value keeps the record', () => {
  const unknown = update(
    't1',
    { 'sealed.title': 'Call Dana', due: FRIDAY },
    { 'sealed.title': 'Call Dana' },
  );
  const result = asRefused(
    plan(execution([unknown]), [
      target('t1', { due: FRIDAY }, sealedOf('Call Dana')),
    ]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
  assert.deepEqual(result.kept, ['Call Dana']);
});

test('a due day compares by value, whatever the key order', () => {
  const moment = update(
    't1',
    { 'sealed.title': 'Call Dana', due: { kind: 'day', date: FRIDAY } },
    { 'sealed.title': 'Call Dana', due: null },
  );
  const result = asWrite(
    plan(execution([moment]), [
      target(
        't1',
        { due: { date: FRIDAY, kind: 'day' } },
        sealedOf('Call Dana'),
      ),
    ]),
  );
  assert.deepEqual(result.updates[0].fields.due, null);
});

test('taken back ids come from the undo execution', () => {
  const result = asWrite(
    plan(execution(TWO_CREATES), [
      target('t1', { lastEditedAt: null }),
      target('t2', { lastEditedAt: 9 }),
    ]),
  );
  const undo = execution([], {
    id: 'undo-1',
    category: 'undo',
    effectRefs: result.undoExecution.effectRefs,
  });
  assert.deepEqual([...getTakenBackIds(undo)], ['t1']);
  assert.equal(getTakenBackIds(null).size, 0);
});

test('copy never names the app or the default assistant', () => {
  const lines = [
    HELM_COPY.undoAll,
    HELM_COPY.tookBack(1),
    HELM_COPY.tookBackKept(1, 1),
    HELM_COPY.nothingToTakeBack(['Call Dana'], 1),
    HELM_COPY.nothingToTakeBack([], 0),
    HELM_COPY.undoReport(1, 1, 1),
    HELM_COPY.undoFailed,
    HELM_COPY.undoNeedsConnectionTitle,
    HELM_COPY.undoNeedsConnectionBody,
  ];
  assert.equal(
    lines.some((line) => /helm|nomos/i.test(line)),
    false,
  );
  assert.equal(
    HELM_COPY.undoReport(2, 1, 2),
    'Took back 2 tasks. Kept 1 you changed since. 2 were deleted since.',
  );
  assert.equal(HELM_COPY.tookBackKept(2, 1), 'Took back 2 tasks, kept 1');
  assert.equal(
    HELM_COPY.nothingToTakeBack(['Call Dana'], 1),
    'Nothing was taken back: you changed Call Dana since. 1 task was deleted since.',
  );
});

const madeWho = (docId: string, name: string) => ({
  ref: { op: 'create', collection: 'who', docId } as EffectRef,
  effect: {
    written: { 'sealed.name': name, kind: 'person', tier: 'regular' },
    previous: null,
  },
});

const WITH_JORDAN = [
  create('t1', 'Bring Jordan the book'),
  madeWho('w1', 'Jordan'),
];

test('a person the turn made is taken back but never counted as a task', () => {
  const result = asWrite(
    plan(execution(WITH_JORDAN), [
      target('t1', { lastEditedAt: null }, sealedOf('Bring Jordan the book')),
      target('w1', { lastEditedAt: null, lastMentionedAt: EARLIER }, null),
    ]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => [entry.docId, entry.collection]),
    [
      ['t1', 'tasks'],
      ['w1', 'who'],
    ],
  );
  assert.equal(result.report, 'Took back 1 task.');
  assert.equal(result.undoSealed.summary, 'Took back 1 task');
  assert.deepEqual(result.takenBack, ['Bring Jordan the book']);
});

test('a person a later turn mentioned or another task links stays', () => {
  const mentioned = asWrite(
    plan(execution(WITH_JORDAN), [
      target('t1', { lastEditedAt: null }, sealedOf('Bring Jordan the book')),
      target('w1', { lastEditedAt: null, lastMentionedAt: NOW }, null),
    ]),
  );
  assert.deepEqual(
    mentioned.deletes.map((entry) => entry.docId),
    ['t1'],
  );
  assert.deepEqual(mentioned.kept, []);
  const linked = asWrite(
    plan(
      execution(WITH_JORDAN),
      [
        target('t1', { lastEditedAt: null }, sealedOf('Bring Jordan the book')),
        target('w1', { lastEditedAt: null, lastMentionedAt: EARLIER }, null),
      ],
      new Set(['w1']),
    ),
  );
  assert.deepEqual(
    linked.deletes.map((entry) => entry.docId),
    ['t1'],
  );
  assert.equal(linked.report, 'Took back 1 task.');
});

test('a turn whose tasks are all gone leaves the people it made alone', () => {
  const result = asRefused(
    plan(execution(WITH_JORDAN), [
      target('t1', null),
      target('w1', { lastEditedAt: null, lastMentionedAt: EARLIER }, null),
    ]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
});

test('a person a kept task still links stays', () => {
  const result = asWrite(
    plan(execution([...WITH_JORDAN, create('t2', 'Buy candles')]), [
      target(
        't1',
        { lastEditedAt: NOW, whoIds: ['w1'] },
        sealedOf('Bring Jordan the book'),
      ),
      target('w1', { lastEditedAt: null, lastMentionedAt: EARLIER }, null),
      target('t2', { lastEditedAt: null }, sealedOf('Buy candles')),
    ]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['t2'],
  );
  assert.deepEqual(result.kept, ['Bring Jordan the book']);
});

const sayHome = (previous: { placeId: string; saidAt: number } | null) => {
  const written = { placeId: 'p1', saidAt: EARLIER };
  return {
    ref: { op: 'update', collection: 'profile', docId: 'uid-1' } as EffectRef,
    effect: {
      written: { currentPlace: written, 'sealed.title': 'Home' },
      previous: { currentPlace: previous, 'sealed.title': 'Home' },
    },
    written,
  };
};

test('"I\'m home" is taken back by putting the profile\'s previous place back', () => {
  const { ref, effect, written } = sayHome(null);
  const result = asWrite(
    plan(execution([{ ref, effect }], { category: 'organize' }), [
      target('uid-1', { currentPlace: written, lastEditedAt: EARLIER }, null),
    ]),
  );
  assert.deepEqual(result.deletes, []);
  assert.deepEqual(result.updates, [
    {
      docId: 'uid-1',
      collection: 'profile',
      fields: { currentPlace: null, lastEditedAt: NOW },
      reseal: null,
    },
  ]);
  assert.equal(result.report, "You're no longer marked home.");
  assert.equal(result.undoSealed.summary, 'Took back being home');
  assert.deepEqual(result.undoExecution.effectRefs, [
    { op: 'update', collection: 'profile', docId: 'uid-1' },
  ]);
});

test('"I\'m home" said again since is kept, never overwritten', () => {
  const { ref, effect } = sayHome(null);
  const result = asRefused(
    plan(execution([{ ref, effect }]), [
      target(
        'uid-1',
        { currentPlace: { placeId: 'p1', saidAt: NOW }, lastEditedAt: NOW },
        null,
      ),
    ]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
});

test('"I\'m home" taken back to an earlier home that still holds says so', () => {
  const earlier = { placeId: 'p1', saidAt: NOW - 60_000 };
  const { ref, effect, written } = sayHome(earlier);
  const result = asWrite(
    plan(execution([{ ref, effect }], { category: 'organize' }), [
      target('uid-1', { currentPlace: written, lastEditedAt: EARLIER }, null),
    ]),
  );
  assert.equal(result.report, "You're marked home again.");
  assert.equal(result.undoSealed.summary, 'Took back being home');
});

test('an import keeps a person who is in use and says so', () => {
  const result = asWrite(
    plan(
      execution([madeWho('w1', 'Priya'), madeWho('w2', 'Sam')], {
        category: 'import',
      }),
      [
        target('w1', { lastEditedAt: null, lastMentionedAt: NOW }, null),
        target('w2', { lastEditedAt: null, lastMentionedAt: null }, null),
      ],
    ),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['w2'],
  );
  assert.deepEqual(result.kept, ['Priya']);
});

test("a noted fact is deleted by its turn's undo while untouched, and kept once the person confirmed it", () => {
  const fact = {
    ref: { op: 'create', collection: 'facts', docId: 'f1' } as EffectRef,
    effect: {
      written: {
        status: 'inferred',
        stated: 'nomosInferred',
        'sealed.title': 'Fact · Dana · Nomos inferred',
        'sealed.statement': 'Dana does the wedding flowers',
      },
      previous: null,
    },
  };
  const original = execution([fact], {
    category: 'remember',
    summary: 'Noted a fact',
  });
  const result = asWrite(
    plan(original, [target('f1', { lastEditedAt: null }, null)]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['f1'],
  );
  assert.equal(result.report, 'Took back 1 fact.');
  const confirmed = plan(original, [
    target('f1', { lastEditedAt: NOW - 1000 }, null),
  ]);
  assert.equal(confirmed.kind === 'write' ? confirmed.deletes.length : 0, 0);
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
