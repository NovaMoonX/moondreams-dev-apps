import assert from 'node:assert/strict';

import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import {
  canUndo,
  getTakenBackIds,
  planReopen,
  planUndo,
  topicEffectKind,
  type UndoPlan,
  type UndoTarget,
} from '../../src/apps/helm/nomos/planUndo.ts';
import { planPhotoRelease } from '../../src/apps/helm/utils/mediaRelease.ts';
import { buildResultLines } from '../../src/apps/helm/utils/resultLines.ts';
import type {
  EffectRef,
  ExecutionEffect,
  OpenExecution,
  TaskSealed,
  TopicSealed,
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
  lines: [],
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

test("a guess the person then said outright goes back to a guess on that turn's undo", () => {
  const label = 'Fact · Dana · You said';
  const said = {
    ref: { op: 'update', collection: 'facts', docId: 'f2' } as EffectRef,
    effect: {
      written: {
        status: 'confirmed',
        confirmedAt: NOW,
        'sealed.title': label,
        'sealed.statement': 'Dana is the florist',
      },
      previous: {
        status: 'inferred',
        confirmedAt: null,
        'sealed.title': label,
        'sealed.statement': 'Dana is the florist',
      },
    },
  };
  const result = asWrite(
    plan(execution([said], { category: 'remember' }), [
      target(
        'f2',
        { status: 'confirmed', confirmedAt: NOW, lastEditedAt: NOW },
        {
          statement: 'Dana is the florist',
          quote: null,
          value: null,
        } as unknown as TaskSealed,
      ),
    ]),
  );
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].fields.status, 'inferred');
  assert.equal(result.updates[0].fields.confirmedAt, null);
});

test('taking back a settle reopens its question and the turn; no other answer does', () => {
  const ref = { captureId: 'turn-1', questionId: 'q1' };
  const capture = (
    kind: string,
    answeredAt: number | null,
    status: string,
  ) => ({
    status,
    questionState: { q1: { kind, answeredAt } },
  });
  assert.deepEqual(
    planReopen({ questionRef: ref }, capture('whichIsTrue', NOW, 'sorted')),
    { 'questionState.q1.answeredAt': null, status: 'needsYou' },
  );
  assert.deepEqual(
    planReopen({ questionRef: ref }, capture('whichIsTrue', NOW, 'needsYou')),
    { 'questionState.q1.answeredAt': null },
  );
  assert.deepEqual(
    planReopen({ questionRef: ref }, capture('groupTopics', NOW, 'needsYou')),
    { 'questionState.q1.answeredAt': null },
  );
  assert.equal(
    planReopen({ questionRef: ref }, capture('groupTopics', null, 'needsYou')),
    null,
  );
  assert.equal(
    planReopen({ questionRef: ref }, capture('asked', NOW, 'sorted')),
    null,
  );
  assert.equal(
    planReopen({ questionRef: ref }, capture('whichIsTrue', null, 'needsYou')),
    null,
  );
  assert.equal(planReopen({ questionRef: null }, null), null);
});

const dateWords = {
  kind: 'birthday' as const,
  label: null,
  month: 6,
  day: 3,
  year: null,
  precision: null,
  captureId: 'turn-1',
};

const dateTarget = (
  docId: string,
  data: Record<string, unknown> | null,
  isOwnerHere = true,
): [string, UndoTarget] => [
  docId,
  { docId, data, opened: data ? dateWords : null, isOwnerHere },
];

const dateRef = (op: EffectRef['op'], docId: string) =>
  ({ op, collection: 'keyDates', docId }) as EffectRef;

test('a date the turn made is deleted by its undo, and says dates', () => {
  const result = asWrite(
    plan(
      execution([
        {
          ref: dateRef('create', 'k1'),
          effect: {
            written: { 'sealed.title': "Added Mum's birthday: June 3" },
            previous: null,
          },
        },
      ]),
      [dateTarget('k1', { lastEditedAt: null })],
    ),
  );
  assert.deepEqual(
    result.deletes.map((entry) => [entry.docId, entry.collection]),
    [['k1', 'keyDates']],
  );
  assert.equal(result.undoSealed.summary, 'Took back 1 date');
});

test('a year the turn filled in goes back to none, and is kept once the person edited the date', () => {
  const fill = execution([
    {
      ref: dateRef('update', 'k1'),
      effect: {
        written: { 'sealed.title': 'Changed', 'sealed.year': 1960 },
        previous: { 'sealed.title': 'Changed', 'sealed.year': null },
      },
    },
  ]);
  const restored = asWrite(
    plan(fill, [
      [
        'k1',
        {
          docId: 'k1',
          data: { lastEditedAt: null },
          opened: { ...dateWords, year: 1960 },
        },
      ],
    ]),
  );
  assert.ok(restored.updates[0].reseal);
  assert.deepEqual(
    { ...restored.updates[0].reseal },
    { ...dateWords, year: null },
  );
  const kept = plan(fill, [
    [
      'k1',
      {
        docId: 'k1',
        data: { lastEditedAt: null },
        opened: { ...dateWords, year: 1961 },
      },
    ],
  ]);
  assert.equal(kept.kind === 'write' ? kept.updates.length : 0, 0);
});

const removal = execution([
  {
    ref: dateRef('delete', 'k1'),
    effect: {
      written: { 'sealed.title': "Removed Mum's birthday: June 3" },
      previous: {
        'sealed.title': "Removed Mum's birthday: June 3",
        whoId: 'w1',
        shape: 'yearly',
        source: 'person',
        createdAt: 7,
        'sealed.kind': 'birthday',
        'sealed.label': null,
        'sealed.month': 6,
        'sealed.day': 3,
        'sealed.year': 1960,
        'sealed.captureId': null,
      },
    },
  },
]);

test('a removed date is written back under its id, with its words', () => {
  const result = asWrite(plan(removal, [dateTarget('k1', null)]));
  assert.equal(result.creates.length, 1);
  assert.equal(result.creates[0].docId, 'k1');
  assert.equal(result.creates[0].fields.whoId, 'w1');
  assert.equal(result.creates[0].seal.year, 1960);
  assert.equal(result.creates[0].seal.month, 6);
  assert.deepEqual(
    result.undoExecution.effectRefs.map((ref) => ref.op),
    ['update'],
  );
});

test('a removed date is not brought back for a person who is gone', () => {
  const result = plan(removal, [dateTarget('k1', null, false)]);
  assert.equal(result.kind === 'write' ? result.creates.length : 0, 0);
});

const momentWords = {
  kind: 'met' as const,
  label: null,
  month: 3,
  day: null,
  year: 2015,
  precision: 'month' as const,
  captureId: 'turn-1',
};

test("a moment the turn made is deleted by its undo and says dates; the target's shape tells the device to move the moment count", () => {
  const result = asWrite(
    plan(
      execution([
        {
          ref: dateRef('create', 'k1'),
          effect: {
            written: { 'sealed.title': 'Moment · Dana · Met · Mar 2015' },
            previous: null,
          },
        },
      ]),
      [
        [
          'k1',
          {
            docId: 'k1',
            data: { lastEditedAt: null, shape: 'moment' },
            opened: momentWords,
            isOwnerHere: true,
          },
        ],
      ],
    ),
  );
  assert.deepEqual(
    result.deletes.map((entry) => [entry.docId, entry.collection]),
    [['k1', 'keyDates']],
  );
});

test('a settled date goes back to the kept parts, and stays when the person edited it since', () => {
  const settle = execution([
    {
      ref: dateRef('update', 'k1'),
      effect: {
        written: { 'sealed.title': 'Kept', 'sealed.day': 4 },
        previous: { 'sealed.title': 'Kept', 'sealed.day': 3 },
      },
    },
  ]);
  const restored = asWrite(
    plan(settle, [
      [
        'k1',
        {
          docId: 'k1',
          data: { lastEditedAt: null },
          opened: { ...dateWords, day: 4 },
        },
      ],
    ]),
  );
  assert.deepEqual({ ...restored.updates[0].reseal }, { ...dateWords, day: 3 });
  const kept = plan(settle, [
    [
      'k1',
      {
        docId: 'k1',
        data: { lastEditedAt: null },
        opened: { ...dateWords, day: 9 },
      },
    ],
  ]);
  assert.equal(kept.kind === 'write' ? kept.updates.length : 0, 0);
});

test('a removed moment is written back as a moment with its precision', () => {
  const removed = execution([
    {
      ref: dateRef('delete', 'k1'),
      effect: {
        written: { 'sealed.title': 'Removed' },
        previous: {
          'sealed.title': 'Removed',
          whoId: 'w1',
          shape: 'moment',
          source: 'person',
          createdAt: 7,
          'sealed.kind': 'met',
          'sealed.label': null,
          'sealed.month': 3,
          'sealed.day': null,
          'sealed.year': 2015,
          'sealed.precision': 'month',
          'sealed.captureId': null,
        },
      },
    },
  ]);
  const result = asWrite(plan(removed, [dateTarget('k1', null)]));
  assert.equal(result.creates[0].fields.shape, 'moment');
  assert.equal(result.creates[0].seal.precision, 'month');
  assert.equal(result.creates[0].seal.year, 2015);
});

const projectSealed = (
  roleNotes: Record<string, string> = {},
  milestones: Record<string, { title: string }> = {},
) => ({
  name: 'Wedding',
  emoji: '💍',
  objective: null,
  milestones,
  roleNotes,
});

test('a project the turn made is deleted by its undo, and says projects', () => {
  const made: { ref: EffectRef; effect: ExecutionEffect } = {
    ref: { op: 'create', collection: 'projects', docId: 'p1' },
    effect: {
      written: {
        'sealed.name': 'Wedding',
        'sealed.emoji': '💍',
        status: 'active',
        whoRoles: {},
        'sealed.roleNotes': {},
      },
      previous: null,
    },
  };
  const result = asWrite(
    plan(execution([made]), [
      [
        'p1',
        {
          docId: 'p1',
          data: { status: 'active', whoRoles: {}, lastEditedAt: null },
          opened: projectSealed(),
        },
      ],
    ]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => `${entry.collection}:${entry.docId}`),
    ['projects:p1'],
  );
  assert.equal(result.report, 'Took back 1 project.');
});

test('a role the turn gave is stepped back with the earlier roles and notes, and a role changed since is kept', () => {
  const label = 'Dana is key for 💍 Wedding';
  const given: { ref: EffectRef; effect: ExecutionEffect } = {
    ref: { op: 'update', collection: 'projects', docId: 'p1' },
    effect: {
      written: {
        whoRoles: { w1: 'key' },
        'sealed.roleNotes': { w1: 'florist' },
        'sealed.title': label,
      },
      previous: {
        whoRoles: { w1: 'involved' },
        'sealed.roleNotes': {},
        'sealed.title': label,
      },
    },
  };
  const result = asWrite(
    plan(execution([given]), [
      [
        'p1',
        {
          docId: 'p1',
          data: { whoRoles: { w1: 'key' }, lastEditedAt: NOW },
          opened: projectSealed({ w1: 'florist' }),
        },
      ],
    ]),
  );
  assert.deepEqual(result.updates[0].fields.whoRoles, { w1: 'involved' });
  assert.deepEqual(
    (result.updates[0].reseal as { roleNotes: unknown }).roleNotes,
    {},
  );
  const kept = plan(execution([given]), [
    [
      'p1',
      {
        docId: 'p1',
        data: { whoRoles: { w1: 'key', w2: 'involved' }, lastEditedAt: NOW },
        opened: projectSealed({ w1: 'florist' }),
      },
    ],
  ]);
  assert.equal(kept.kind, 'refused');
});

const milestoneEffect = (
  id: string,
  title: string,
  date: number | null,
): { ref: EffectRef; effect: ExecutionEffect } => {
  const line = `Milestone · ${title} · 💍 Wedding`;
  return {
    ref: { op: 'update', collection: 'projects', docId: 'p1' },
    effect: {
      written: {
        [`milestoneState.${id}`]: { date, order: 0, doneAt: null },
        [`sealed.milestones.${id}`]: { title },
        'sealed.title': line,
      },
      previous: {
        [`milestoneState.${id}`]: null,
        [`sealed.milestones.${id}`]: null,
        'sealed.title': line,
      },
    },
  };
};

test('a milestone the turn added is taken away from both maps by its undo', () => {
  const result = asWrite(
    plan(execution([milestoneEffect('m1', 'Venue booked', 9)]), [
      [
        'p1',
        {
          docId: 'p1',
          data: {
            milestoneState: {
              m1: { date: 9, order: 0, doneAt: null },
              m0: { date: null, order: 1, doneAt: null },
            },
            lastEditedAt: NOW,
          },
          opened: projectSealed(
            {},
            { m1: { title: 'Venue booked' }, m0: { title: 'Pick the menu' } },
          ),
        },
      ],
    ]),
  );
  assert.equal(result.updates[0].fields['milestoneState.m1'], null);
  assert.deepEqual(
    (result.updates[0].reseal as { milestones: unknown }).milestones,
    { m0: { title: 'Pick the menu' } },
  );
});

test('a milestone ticked or retitled since is kept, and the other one the turn added still goes', () => {
  const both = execution([
    milestoneEffect('m1', 'Venue booked', 9),
    milestoneEffect('m2', 'Final guest list', null),
  ]);
  const live = (doneAt: number | null, title: string) => [
    [
      'p1',
      {
        docId: 'p1',
        data: {
          milestoneState: {
            m1: { date: 9, order: 0, doneAt },
            m2: { date: null, order: 0, doneAt: null },
          },
          lastEditedAt: NOW,
        },
        opened: projectSealed(
          {},
          { m1: { title }, m2: { title: 'Final guest list' } },
        ),
      },
    ] as [string, UndoTarget],
  ];
  const ticked = asWrite(plan(both, live(5, 'Venue booked')));
  assert.equal(ticked.updates[0].fields['milestoneState.m2'], null);
  assert.equal('milestoneState.m1' in ticked.updates[0].fields, false);
  const retitled = asWrite(plan(both, live(null, 'Venue is booked')));
  assert.equal('milestoneState.m1' in retitled.updates[0].fields, false);
  const alone = plan(
    execution([milestoneEffect('m1', 'Venue booked', 9)]),
    live(5, 'Venue booked'),
  );
  assert.equal(alone.kind, 'refused');
  assert.deepEqual(alone.kept, ['Wedding']);
});

test('a project the turn made stays when the person ticked one of its milestones since', () => {
  const made: { ref: EffectRef; effect: ExecutionEffect } = {
    ref: { op: 'create', collection: 'projects', docId: 'p1' },
    effect: {
      written: {
        'sealed.name': 'Wedding',
        'sealed.emoji': '💍',
        status: 'active',
        whoRoles: {},
        'sealed.roleNotes': {},
      },
      previous: null,
    },
  };
  const result = plan(
    execution([milestoneEffect('m1', 'Venue booked', 9), made]),
    [
      [
        'p1',
        {
          docId: 'p1',
          data: {
            status: 'active',
            whoRoles: {},
            milestoneState: { m1: { date: 9, order: 0, doneAt: 5 } },
            lastEditedAt: null,
          },
          opened: projectSealed({}, { m1: { title: 'Venue booked' } }),
        },
      ],
    ],
  );
  assert.equal(result.kind, 'refused');
  assert.deepEqual(result.kept, ['Wedding']);
});

const topicSealed = (name: string): TopicSealed => ({
  name,
  emoji: null,
  overview: null,
  sections: [],
});

const topicTarget = (
  docId: string,
  data: Record<string, unknown> | null,
  name = 'Car care',
): [string, UndoTarget] => [
  docId,
  { docId, data, opened: data ? topicSealed(name) : null },
];

const topicEntry = (
  op: EffectRef['op'],
  docId: string,
  written: Record<string, unknown>,
  previous: Record<string, unknown> | null,
) => ({
  ref: { op, collection: 'topics', docId } as EffectRef,
  effect: { written, previous },
});

const ADDED = 'Added to Car care: Winter tyre size';
const versionEffect = (change: string, title = ADDED, from = 4) =>
  topicEntry(
    'update',
    'car',
    { version: from + 1, change, 'sealed.title': title },
    { version: from, 'sealed.title': title },
  );
const noteMade = {
  ref: { op: 'create', collection: 'notes', docId: 'n1' } as EffectRef,
  effect: {
    written: { 'sealed.title': 'Winter tyre size', topicIds: ['car'] },
    previous: null,
  },
};
const noteTarget = (): [string, UndoTarget] => [
  'n1',
  {
    docId: 'n1',
    data: { lastEditedAt: null, topicIds: ['car'] },
    opened: null,
  },
];

test('topicEffectKind tells the four topic effect shapes apart', () => {
  assert.equal(
    topicEffectKind({
      written: { docState: 'behind', pendingNoteIds: ['n'] },
      previous: { docState: 'current', pendingNoteIds: [] },
    }),
    'filing',
  );
  assert.equal(topicEffectKind(versionEffect('added').effect), 'version');
  assert.equal(
    topicEffectKind({
      written: { parentId: 'x', depth: 2, 'sealed.title': 't' },
      previous: { parentId: null, depth: 1, 'sealed.title': 't' },
    }),
    'placement',
  );
  assert.equal(
    topicEffectKind({
      written: { depth: 3, 'sealed.title': 't' },
      previous: { depth: 2, 'sealed.title': 't' },
    }),
    'placement',
  );
  assert.equal(
    topicEffectKind({
      written: {
        'sealed.title': 'g',
        'sealed.name': 'Car care',
        parentId: null,
      },
      previous: null,
    }),
    'made',
  );
});

test('a turn that made a note and added to a topic takes back both, the topic as a new version', () => {
  const result = asWrite(
    plan(execution([noteMade, versionEffect('added')]), [
      noteTarget(),
      topicTarget('car', { version: 5, writeClaim: null }),
    ]),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['n1'],
  );
  assert.deepEqual(result.versionRestores, [{ docId: 'car', from: 5, to: 4 }]);
  assert.equal(
    result.undoSealed.summary,
    'Took back 1 note and 1 change to Car care',
  );
  assert.equal(result.report, 'Took back 1 note. 1 change to Car care too.');
  assert.deepEqual(
    result.undoExecution.effectRefs.map((ref) => [ref.op, ref.collection]),
    [
      ['delete', 'notes'],
      ['update', 'topics'],
    ],
  );
});

test('a version change alone is taken back, and says the topic', () => {
  const result = asWrite(
    plan(
      execution([versionEffect('revised', 'Changed Car care: shorter intro')]),
      [topicTarget('car', { version: 5, writeClaim: null })],
    ),
  );
  assert.deepEqual(result.versionRestores, [{ docId: 'car', from: 5, to: 4 }]);
  assert.equal(result.undoSealed.summary, 'Took back 1 change to Car care');
  assert.equal(result.report, 'Took back 1 change to Car care.');
  assert.equal(result.deletes.length, 0);
});

test('a version is kept after a later version, and while the topic is being written', () => {
  const later = asRefused(
    plan(execution([versionEffect('added')]), [
      topicTarget('car', { version: 6, writeClaim: null }),
    ]),
  );
  assert.equal(later.reason, 'nothingToTakeBack');
  assert.deepEqual(later.kept, ['Car care']);
  const claimed = asRefused(
    plan(execution([versionEffect('added')]), [
      topicTarget('car', {
        version: 5,
        writeClaim: { claimId: 'c', at: NOW - 1000 },
      }),
    ]),
  );
  assert.deepEqual(claimed.kept, ['Car care']);
  const stale = asWrite(
    plan(execution([versionEffect('added')]), [
      topicTarget('car', {
        version: 5,
        writeClaim: { claimId: 'c', at: NOW - 200_000 },
      }),
    ]),
  );
  assert.equal(stale.versionRestores.length, 1);
});

const MOVED = 'Moved Washing under Car care';
const placement = () => [
  topicEntry(
    'update',
    'washing',
    { parentId: 'car', depth: 2, 'sealed.title': MOVED },
    { parentId: null, depth: 1, 'sealed.title': MOVED },
  ),
  topicEntry(
    'update',
    'rinse',
    { depth: 3, 'sealed.title': MOVED },
    { depth: 2, 'sealed.title': MOVED },
  ),
];

test('a move goes back together with its subtree', () => {
  const result = asWrite(
    plan(execution(placement()), [
      topicTarget('washing', { parentId: 'car', depth: 2 }, 'Washing'),
      topicTarget('rinse', { parentId: 'washing', depth: 3 }, 'Rinse'),
      topicTarget('car', { parentId: null, depth: 1 }),
    ]),
  );
  assert.deepEqual(
    result.updates.map((entry) => [
      entry.docId,
      entry.fields.parentId,
      entry.fields.depth,
    ]),
    [
      ['washing', null, 1],
      ['rinse', undefined, 2],
    ],
  );
  assert.equal(result.undoSealed.summary, 'Took back 1 change to Washing');
});

test('a move is kept whole when any topic in it changed, or the old parent is gone', () => {
  const moved = refusedKept(
    plan(execution(placement()), [
      topicTarget('washing', { parentId: 'car', depth: 2 }, 'Washing'),
      topicTarget('rinse', { parentId: 'washing', depth: 2 }, 'Rinse'),
    ]),
  );
  assert.deepEqual(moved, ['Washing']);
  const parentGone = refusedKept(
    plan(execution(placement()), [
      [
        'washing',
        {
          docId: 'washing',
          data: { parentId: 'car', depth: 2 },
          opened: topicSealed('Washing'),
          isOwnerHere: false,
        },
      ],
      topicTarget('rinse', { parentId: 'washing', depth: 3 }, 'Rinse'),
    ]),
  );
  assert.deepEqual(parentGone, ['Washing']);
});

test('two moves of one topic in a turn go back to where it started', () => {
  const twice = [
    topicEntry(
      'update',
      'washing',
      { parentId: 'car', depth: 2, 'sealed.title': MOVED },
      { parentId: null, depth: 1, 'sealed.title': MOVED },
    ),
    topicEntry(
      'update',
      'washing',
      { parentId: 'kitchen', depth: 2, 'sealed.title': MOVED },
      { parentId: 'car', depth: 2, 'sealed.title': MOVED },
    ),
  ];
  const result = asWrite(
    plan(execution(twice), [
      topicTarget('washing', { parentId: 'kitchen', depth: 2 }, 'Washing'),
      topicTarget('kitchen', { parentId: null, depth: 1 }),
    ]),
  );
  assert.deepEqual(
    result.updates.map((entry) => [
      entry.docId,
      entry.fields.parentId,
      entry.fields.depth,
    ]),
    [['washing', null, 1]],
  );
  const stopped = refusedKept(
    plan(execution(twice), [
      topicTarget('washing', { parentId: 'car', depth: 2 }, 'Washing'),
    ]),
  );
  assert.deepEqual(stopped, ['Washing']);
});

const refusedKept = (result: UndoPlan) => asRefused(result).kept;

const GROUPED = 'Grouped Washing and Fragrance under Car care';
const grouping = () => [
  topicEntry(
    'create',
    'parent',
    { 'sealed.title': GROUPED, 'sealed.name': 'Car care', parentId: null },
    null,
  ),
  topicEntry(
    'update',
    'washing',
    { parentId: 'parent', depth: 2, 'sealed.title': GROUPED },
    { parentId: null, depth: 1, 'sealed.title': GROUPED },
  ),
  topicEntry(
    'update',
    'washing',
    { version: 3, change: 'grouped', 'sealed.title': GROUPED },
    { version: 2, 'sealed.title': GROUPED },
  ),
];
const groupTargets = (parent: Record<string, unknown>, washingDepth = 2) => [
  topicTarget('parent', parent, 'Car care'),
  topicTarget(
    'washing',
    { parentId: 'parent', depth: washingDepth, version: 3, writeClaim: null },
    'Washing',
  ),
];
const FRESH_PARENT = {
  parentId: null,
  depth: 1,
  version: 0,
  pendingNoteIds: [],
};

test('a grouping goes back as one change: the child moves out, its version is restored, the made parent goes', () => {
  const result = asWrite(
    plan(execution(grouping()), groupTargets(FRESH_PARENT)),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['parent'],
  );
  assert.deepEqual(result.versionRestores, [
    { docId: 'washing', from: 3, to: 2 },
  ]);
  assert.equal(result.updates.length, 1);
  assert.equal(result.undoSealed.summary, 'Took back grouping under Car care');
});

test('a made parent stays when it was written, used, or a child stayed under it', () => {
  const written = asWrite(
    plan(execution(grouping()), groupTargets({ ...FRESH_PARENT, version: 1 })),
  );
  assert.equal(written.deletes.length, 0);
  assert.deepEqual(written.kept, [GROUPED]);
  const used = asWrite(
    plan(
      execution(grouping()),
      groupTargets(FRESH_PARENT),
      new Set(['parent']),
    ),
  );
  assert.equal(used.deletes.length, 0);
  const stayed = asWrite(
    plan(execution(grouping()), groupTargets(FRESH_PARENT, 3)),
  );
  assert.equal(stayed.deletes.length, 0);
  assert.equal(stayed.updates.length, 0);
});

test('an old filing effect still takes the note back out and ignores the new shapes', () => {
  const filing = topicEntry(
    'update',
    'car',
    { docState: 'behind', pendingNoteIds: ['n1'], 'sealed.title': 'Car care' },
    { docState: 'current', pendingNoteIds: [], 'sealed.title': 'Car care' },
  );
  const result = asWrite(
    plan(execution([noteMade, filing]), [
      noteTarget(),
      topicTarget('car', {
        docState: 'behind',
        pendingNoteIds: ['n1'],
        version: 5,
      }),
    ]),
  );
  assert.equal(result.versionRestores.length, 0);
  assert.deepEqual(
    result.updates.map((entry) => entry.fields),
    [{ pendingNoteIds: [], docState: 'current' }],
  );
});

test('topic effects give one line each, a grouping gives one line, and filing gives none', () => {
  const linesOf = (entries: { ref: EffectRef; effect: ExecutionEffect }[]) =>
    buildResultLines(execution(entries), new Map(), 'UTC', NOW).map((line) => [
      line.title,
      line.ref?.collection,
      line.ref?.id,
    ]);
  assert.deepEqual(linesOf([noteMade, versionEffect('added')]), [
    ['Winter tyre size', 'notes', 'n1'],
    [ADDED, 'topics', 'car'],
  ]);
  assert.deepEqual(linesOf(grouping()), [[GROUPED, 'topics', 'parent']]);
  assert.deepEqual(linesOf(placement()), [[MOVED, 'topics', 'washing']]);
  assert.deepEqual(
    linesOf([
      topicEntry(
        'update',
        'car',
        {
          docState: 'behind',
          pendingNoteIds: ['n1'],
          'sealed.title': 'Car care',
        },
        { docState: 'current', pendingNoteIds: [], 'sealed.title': 'Car care' },
      ),
    ]),
    [],
  );
});

const keptPhoto = (
  data: Record<string, unknown> | null,
): [string, UndoTarget] => ['m1', { docId: 'm1', data, opened: null }];

const KEEP_PHOTO = {
  ref: { op: 'update', collection: 'media', docId: 'm1' } as EffectRef,
  effect: {
    written: {
      status: 'kept',
      attachedTo: [{ kind: 'task', id: 't1' }],
      'sealed.title': 'Confirm the venue quote',
    },
    previous: {
      status: 'received',
      attachedTo: [],
      'sealed.title': 'Confirm the venue quote',
    },
  } as ExecutionEffect,
};

test('undo of a keep lets the photo go for a fresh 24 hours', () => {
  const result = asWrite(
    plan(execution([KEEP_PHOTO]), [
      keptPhoto({
        status: 'kept',
        role: 'attachment',
        executionId: 'exec-1',
        attachedTo: [{ kind: 'task', id: 't1' }],
        deleteAfter: null,
      }),
    ]),
  );
  assert.equal(result.deletes.length, 0);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].collection, 'media');
  assert.deepEqual(result.updates[0].fields, {
    status: 'discarded',
    attachedTo: [],
    decidedAt: NOW,
    deleteAfter: NOW + 24 * 60 * 60 * 1000,
    executionId: null,
  });
  assert.equal(result.undoSealed.summary, 'Took back a kept photo');
  assert.deepEqual(
    result.undoExecution.effectRefs.map((ref) => ref.op),
    ['update'],
  );
});

test('undo of a keep skips a photo the person already removed', () => {
  const result = asRefused(
    plan(execution([KEEP_PHOTO]), [
      keptPhoto({
        status: 'discarded',
        role: 'attachment',
        executionId: null,
        attachedTo: [],
      }),
    ]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
});

test('a kept photo is not listed as a result line', () => {
  assert.deepEqual(
    buildResultLines(execution([KEEP_PHOTO]), new Map(), 'UTC', NOW),
    [],
  );
});

const HELD_PHOTO = {
  id: 'm1',
  status: 'kept' as const,
  attachedTo: [{ kind: 'task' as const, id: 't1' }],
  decidedAt: EARLIER,
  deleteAfter: null,
};

test('deleting a task lets its kept photo go for 24 hours and Undo keeps it again', () => {
  const [released] = planPhotoRelease(
    [HELD_PHOTO],
    [{ kind: 'task', id: 't1' }],
    NOW,
  );
  assert.deepEqual(released.forward, {
    status: 'discarded',
    attachedTo: [],
    decidedAt: NOW,
    deleteAfter: NOW + 24 * 60 * 60 * 1000,
  });
  assert.deepEqual(released.back, {
    attachedTo: [{ kind: 'task', id: 't1' }],
    status: 'kept',
    decidedAt: EARLIER,
    deleteAfter: null,
  });
});

test('deleting a task only takes itself off a photo kept elsewhere too', () => {
  const [released] = planPhotoRelease(
    [
      {
        ...HELD_PHOTO,
        attachedTo: [
          { kind: 'task', id: 't1' },
          { kind: 'fact', id: 'f1' },
        ],
      },
    ],
    [{ kind: 'task', id: 't1' }],
    NOW,
  );
  assert.deepEqual(released.forward, {
    attachedTo: [{ kind: 'fact', id: 'f1' }],
  });
  assert.equal(released.back.status, 'kept');
});

test('deleting a task leaves other photos and discarded ones alone', () => {
  assert.deepEqual(
    planPhotoRelease(
      [
        { ...HELD_PHOTO, id: 'm2', attachedTo: [{ kind: 'task', id: 't2' }] },
        { ...HELD_PHOTO, id: 'm3', status: 'discarded', attachedTo: [] },
      ],
      [{ kind: 'task', id: 't1' }],
      NOW,
    ),
    [],
  );
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
