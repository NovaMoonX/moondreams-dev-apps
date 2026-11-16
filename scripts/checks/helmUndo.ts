import assert from 'node:assert/strict';

import { MAX_EXECUTION_EFFECTS } from '../../functions/src/apps/helm/nomos/commands.ts';
import { buildWriteExecution } from '../../functions/src/apps/helm/topicWriteExecution.ts';
import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';
import { HELM_COPY } from '../../src/apps/helm/constants.ts';
import {
  MAX_UNDO_EFFECTS,
  canUndo,
  getTakenBackIds,
  getUndoneDocIds,
  narrowForUndo,
  planReopen,
  planUndo,
  procedureEffectKind,
  toOfferDocIds,
  readUndoFields,
  topicEffectKind,
  type UndoPlan,
  type UndoTarget,
} from '../../src/apps/helm/nomos/planUndo.ts';
import {
  buildUndoUnits,
  getRemainingUnits,
} from '../../src/apps/helm/utils/undoUnits.ts';
import { planPhotoRelease } from '../../src/apps/helm/utils/mediaRelease.ts';
import { buildResultLines } from '../../src/apps/helm/utils/resultLines.ts';
import type {
  EffectRef,
  ExecutionEffect,
  HabitDaySealed,
  HabitSealed,
  KeyDateSealed,
  OpenExecution,
  ProcedureSealed,
  ResearchSealed,
  RunSealed,
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
  meetingLabel: null,
  privateMark: null,
  isPrivacyCleared: false,
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
  privacy: 'ordinary',
  said: null,
  via: null,
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
  undoneDocIds: [],
  partUndoIds: [],
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
  undoReason: null,
  lines: [],
  abilityOffer: null,
  awayZoneOffer: null,
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

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

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

test('a task made for a meeting from a document question goes with its turn untouched and stays once a question is ticked', () => {
  const made = [
    create('q1', 'Questions for Priya and Sam'),
    create('t2', 'Send the save-the-dates'),
  ];
  const stepState = (doneAt: number | null) => ({
    a: { order: 0, doneAt },
    b: { order: 1, doneAt: null },
  });
  const untouched = asWrite(
    plan(
      execution(made, {
        questionRef: { captureId: 'turn-1', questionId: 'q' },
      }),
      [
        target('q1', { lastEditedAt: null, stepState: stepState(null) }),
        target('t2', { lastEditedAt: null }),
      ],
    ),
  );
  assert.deepEqual(
    untouched.deletes.map((entry) => entry.docId),
    ['q1', 't2'],
  );
  const ticked = asWrite(
    plan(execution(made), [
      target('q1', {
        lastEditedAt: EARLIER + 1,
        stepState: stepState(EARLIER + 1),
      }),
      target('t2', { lastEditedAt: null }),
    ]),
  );
  assert.deepEqual(
    ticked.deletes.map((entry) => entry.docId),
    ['t2'],
  );
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
  const many = Array.from({ length: MAX_UNDO_EFFECTS + 1 }, (_, index) =>
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
    HELM_COPY.undoPickTitle,
    HELM_COPY.undoPickAll,
    HELM_COPY.undoPickSome(2),
    HELM_COPY.undoPickNone,
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
  assert.deepEqual(
    planReopen({ questionRef: ref }, capture('questionsTask', NOW, 'sorted')),
    { 'questionState.q1.answeredAt': null, status: 'needsYou' },
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
  assert.equal((result.creates[0].seal as KeyDateSealed).year, 1960);
  assert.equal((result.creates[0].seal as KeyDateSealed).month, 6);
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
  assert.equal((result.creates[0].seal as KeyDateSealed).precision, 'month');
  assert.equal((result.creates[0].seal as KeyDateSealed).year, 2015);
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
  why: null,
  importance: null,
  privateMark: null,
  isPrivacyCleared: false,
  aheadAsks: null,
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

const offerMeta = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  leadDays: 14,
  offerOn: 5,
  state: 'waiting',
  declineCount: 0,
  nextEligibleOn: null,
  shownOn: null,
  researchId: null,
  toldAt: null,
  createdAt: 1,
  ...over,
});
const offerAsk = (subject: string) => ({
  subject,
  question: `Look into ${subject}?`,
  whyNow: null,
  isDecision: false,
  questions: [],
  answers: null,
  brief: null,
});

test('an offer the turn added to a project is taken away from both places by its undo, even once Today showed it, and one answered since is kept', () => {
  const line = 'I will offer to look into venues 2 weeks before Wedding';
  const added: { ref: EffectRef; effect: ExecutionEffect } = {
    ref: { op: 'update', collection: 'projects', docId: 'p1' },
    effect: {
      written: {
        researchOffers: [offerMeta('o0'), offerMeta('o1')],
        'sealed.aheadAsks': { o0: offerAsk('cake'), o1: offerAsk('venues') },
        'sealed.title': line,
      },
      previous: {
        researchOffers: [offerMeta('o0')],
        'sealed.aheadAsks': { o0: offerAsk('cake') },
        'sealed.title': line,
      },
    },
  };
  const target = (offers: unknown[]): [string, UndoTarget] => [
    'p1',
    {
      docId: 'p1',
      data: { researchOffers: offers, lastEditedAt: NOW },
      opened: {
        ...projectSealed(),
        aheadAsks: { o0: offerAsk('cake'), o1: offerAsk('venues') },
      },
    },
  ];
  const result = asWrite(
    plan(execution([added]), [target([offerMeta('o0'), offerMeta('o1')])]),
  );
  assert.deepEqual(result.updates[0].fields.researchOffers, [offerMeta('o0')]);
  assert.deepEqual(
    (result.updates[0].reseal as { aheadAsks: unknown }).aheadAsks,
    { o0: offerAsk('cake') },
  );
  const taken = plan(execution([added]), [
    target([offerMeta('o0'), offerMeta('o1', { state: 'taken' })]),
  ]);
  assert.equal(taken.kind, 'refused');
  assert.deepEqual(taken.kept, ['Wedding']);
  const shown = asWrite(
    plan(execution([added]), [
      target([
        offerMeta('o0', { shownOn: '2026-11-10' }),
        offerMeta('o1', { shownOn: '2026-11-16' }),
      ]),
    ]),
  );
  assert.deepEqual(shown.updates[0].fields.researchOffers, [
    offerMeta('o0', { shownOn: '2026-11-10' }),
  ]);
  const declined = plan(execution([added]), [
    target([offerMeta('o0'), offerMeta('o1', { declineCount: 1 })]),
  ]);
  assert.equal(declined.kind, 'refused');
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
  privateMark: null,
  isPrivacyCleared: false,
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
  assert.deepEqual(result.versionRestores, [
    { docId: 'car', collection: 'topics', from: 5, to: 4 },
  ]);
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
  assert.deepEqual(result.versionRestores, [
    { docId: 'car', collection: 'topics', from: 5, to: 4 },
  ]);
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
    { docId: 'washing', collection: 'topics', from: 3, to: 2 },
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

test('a topic made from a file goes at the version the import wrote, and stays once it is edited', () => {
  const imported = [
    topicEntry(
      'create',
      'pack',
      { 'sealed.title': 'Made Packing list', importedVersion: 1 },
      null,
    ),
  ];
  const target = (version: number) => [
    topicTarget('pack', { ...FRESH_PARENT, version }, 'Packing list'),
  ];
  const fresh = asWrite(plan(execution(imported), target(1)));
  assert.deepEqual(
    fresh.deletes.map((entry) => entry.docId),
    ['pack'],
  );
  const edited = plan(execution(imported), target(2));
  assert.equal(edited.kind, 'refused');
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

const procedureSealed = (title: string): ProcedureSealed => ({
  title,
  steps: { a: { text: 'Laptop', detail: null } },
  groups: {},
  privateMark: null,
  isPrivacyCleared: false,
});

const procedureTarget = (
  data: Record<string, unknown> | null,
  title = 'Packing for a work trip',
): [string, UndoTarget] => [
  'pack',
  { docId: 'pack', data, opened: data ? procedureSealed(title) : null },
];

const PROCEDURE_MADE_LINE = 'New procedure: Packing for a work trip · 12 steps';
const PROCEDURE_CHANGED_LINE =
  'Changed Packing for a work trip: added the laptop charger';

const procedureMade = {
  ref: { op: 'create', collection: 'procedures', docId: 'pack' } as EffectRef,
  effect: {
    written: {
      'sealed.title': PROCEDURE_MADE_LINE,
      'sealed.name': 'Packing for a work trip',
      version: 1,
    },
    previous: null,
  } as ExecutionEffect,
};

const procedureRevised = {
  ref: { op: 'update', collection: 'procedures', docId: 'pack' } as EffectRef,
  effect: {
    written: {
      version: 3,
      change: 'revised',
      'sealed.title': PROCEDURE_CHANGED_LINE,
      'sealed.name': 'Packing for a work trip',
    },
    previous: {
      version: 2,
      'sealed.title': PROCEDURE_CHANGED_LINE,
      'sealed.name': 'Packing for a work trip',
    },
  } as ExecutionEffect,
};

test('procedureEffectKind tells a made procedure from a new version', () => {
  assert.equal(procedureEffectKind(procedureMade.effect), 'made');
  assert.equal(procedureEffectKind(procedureRevised.effect), 'version');
});

test('a procedure the turn made is deleted while it is at version 1', () => {
  const result = asWrite(
    plan(execution([procedureMade]), [procedureTarget({ version: 1 })]),
  );
  assert.deepEqual(result.deletes, [
    { docId: 'pack', collection: 'procedures' },
  ]);
  assert.equal(result.versionRestores.length, 0);
  assert.equal(
    result.undoSealed.summary,
    'Took back 1 change to Packing for a work trip',
  );
  assert.equal(result.report, 'Took back 1 change to Packing for a work trip.');
});

test('a procedure the person changed since is kept, not deleted', () => {
  const result = asRefused(
    plan(execution([procedureMade]), [procedureTarget({ version: 2 })]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
  assert.deepEqual(result.kept, ['Packing for a work trip']);
});

test('a revised procedure goes back as a new version holding the earlier one', () => {
  const result = asWrite(
    plan(execution([procedureRevised]), [procedureTarget({ version: 3 })]),
  );
  assert.deepEqual(result.versionRestores, [
    { docId: 'pack', collection: 'procedures', from: 3, to: 2 },
  ]);
  assert.equal(result.deletes.length, 0);
  assert.deepEqual(result.undoSealed.effects[0].written, {
    version: 4,
    change: 'restored',
    'sealed.title': PROCEDURE_CHANGED_LINE,
  });
});

test('a revised procedure edited since is kept', () => {
  const result = asRefused(
    plan(execution([procedureRevised]), [procedureTarget({ version: 4 })]),
  );
  assert.deepEqual(result.kept, ['Packing for a work trip']);
});

test('a made procedure that is already gone is counted as gone', () => {
  const result = asRefused(
    plan(execution([procedureMade]), [procedureTarget(null)]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
});

test('a turn that made a procedure and a note takes back both and says so', () => {
  const result = asWrite(
    plan(execution([noteMade, procedureMade]), [
      noteTarget(),
      procedureTarget({ version: 1 }),
    ]),
  );
  assert.deepEqual(result.deletes.map((entry) => entry.docId).sort(), [
    'n1',
    'pack',
  ]);
  assert.equal(
    result.undoSealed.summary,
    'Took back 1 note and 1 change to Packing for a work trip',
  );
  assert.equal(
    result.report,
    'Took back 1 note. 1 change to Packing for a work trip too.',
  );
});

test('a procedure result line names the procedure and opens it', () => {
  const lines = buildResultLines(
    execution([procedureMade, procedureRevised]),
    new Map(),
    'America/Los_Angeles',
    NOW,
  );
  assert.deepEqual(
    lines.map((line) => [line.title, line.ref]),
    [
      [PROCEDURE_MADE_LINE, { collection: 'procedures', id: 'pack' }],
      [PROCEDURE_CHANGED_LINE, { collection: 'procedures', id: 'pack' }],
    ],
  );
});

test('procedure undo copy counts one change by name and several by number', () => {
  assert.equal(
    HELM_COPY.undoProcedureChanges(1, 'Cabin'),
    'Took back 1 change to Cabin',
  );
  assert.equal(
    HELM_COPY.undoProcedureChanges(2, null),
    'Took back 2 changes to procedures',
  );
  assert.equal(
    HELM_COPY.undoReportProceduresToo(1, null),
    '1 change to a procedure too.',
  );
});

const runSealed = (): RunSealed => ({
  title: 'Packing for a work trip',
  steps: { a: { text: 'Laptop', detail: null } },
  groups: {},
  attachedLabel: 'Portland weekend',
});

const runTarget = (
  data: Record<string, unknown> | null,
): [string, UndoTarget] => [
  'run1',
  { docId: 'run1', data, opened: data ? runSealed() : null },
];

const RUN_STARTED_LINE = 'Started Packing for a work trip for Portland weekend';
const RUN_TICKED_LINE = 'Ticked Laptop on Packing for a work trip';

const runStarted = {
  ref: {
    op: 'create',
    collection: 'procedureRuns',
    docId: 'run1',
  } as EffectRef,
  effect: {
    written: {
      'sealed.title': RUN_STARTED_LINE,
      'sealed.name': 'Packing for a work trip',
    },
    previous: null,
  } as ExecutionEffect,
};

const runTicked = {
  ref: {
    op: 'update',
    collection: 'procedureRuns',
    docId: 'run1',
  } as EffectRef,
  effect: {
    written: { 'stepState.a.doneAt': EARLIER, 'sealed.title': RUN_TICKED_LINE },
    previous: { 'stepState.a.doneAt': null, 'sealed.title': RUN_TICKED_LINE },
  } as ExecutionEffect,
};

const ticked = (doneAt: number | null, editedAt = EARLIER) => ({
  lastEditedAt: editedAt,
  stepState: { a: { order: 0, groupId: null, doneAt, isExtra: false } },
});

test('a run the turn started is deleted while nothing was ticked on it', () => {
  const result = asWrite(
    plan(execution([runStarted]), [runTarget({ lastEditedAt: null })]),
  );
  assert.deepEqual(result.deletes, [
    { docId: 'run1', collection: 'procedureRuns' },
  ]);
  assert.equal(
    result.undoSealed.summary,
    'Took back the run of Packing for a work trip',
  );
  assert.equal(result.report, 'Took back the run of Packing for a work trip.');
});

test('a started run the person ticked since is kept', () => {
  const result = asRefused(
    plan(execution([runStarted]), [runTarget(ticked(NOW, NOW))]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
  assert.deepEqual(result.kept, ['Packing for a work trip']);
});

test('a started run is deleted once a later tick on it was undone', () => {
  const result = asWrite(
    plan(execution([runStarted]), [runTarget(ticked(null, EARLIER))]),
  );
  assert.deepEqual(result.deletes, [
    { docId: 'run1', collection: 'procedureRuns' },
  ]);
});

test('a started run with a step ticked by hand is kept whatever its edit stamp', () => {
  const result = asRefused(
    plan(execution([runStarted]), [runTarget(ticked(NOW, EARLIER))]),
  );
  assert.deepEqual(result.kept, ['Packing for a work trip']);
});

test('a tick by voice is unticked while it is still the way it was left', () => {
  const result = asWrite(
    plan(execution([runTicked]), [runTarget(ticked(EARLIER))]),
  );
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].collection, 'procedureRuns');
  assert.equal(result.updates[0].fields['stepState.a.doneAt'], null);
  assert.equal(result.undoSealed.summary, 'Unticked 1 step');
  assert.equal(result.report, 'Unticked 1 step.');
});

test('a tick the person undid by hand is kept', () => {
  const result = asRefused(
    plan(execution([runTicked]), [runTarget(ticked(null))]),
  );
  assert.deepEqual(result.kept, ['Packing for a work trip']);
});

test('a run result line names what was done and opens the run', () => {
  const lines = buildResultLines(
    execution([runStarted, runTicked]),
    new Map(),
    'America/Los_Angeles',
    NOW,
  );
  assert.deepEqual(
    lines.map((line) => [line.title, line.ref]),
    [
      [RUN_STARTED_LINE, { collection: 'procedureRuns', id: 'run1' }],
      [RUN_TICKED_LINE, { collection: 'procedureRuns', id: 'run1' }],
    ],
  );
});

test('run undo copy counts ticks and joins them with a taken-back run', () => {
  assert.equal(HELM_COPY.undoRunChanges([], 3), 'Unticked 3 steps');
  assert.equal(
    HELM_COPY.undoRunChanges(['Cabin'], 2),
    'Took back the run of Cabin and unticked 2 steps',
  );
  assert.equal(
    HELM_COPY.undoReportRunsToo(['Cabin', 'Trip'], 0),
    'Took back 2 runs.',
  );
});

test('a turn that made a note and a run takes back both and says so', () => {
  const result = asWrite(
    plan(execution([noteMade, runStarted]), [
      noteTarget(),
      runTarget({ lastEditedAt: null }),
    ]),
  );
  assert.equal(
    result.undoSealed.summary,
    'Took back 1 note and took back the run of Packing for a work trip',
  );
  assert.equal(
    result.report,
    'Took back 1 note. Took back the run of Packing for a work trip.',
  );
});

const habitSealed = (name: string): HabitSealed => ({
  name,
  emoji: null,
  notes: null,
  medicine: null,
  windows: { w1: { label: 'Evening' } },
  importance: null,
  privateMark: null,
  isPrivacyCleared: null,
});

const habitEntry = (
  collection: 'habits' | 'habitDays',
  op: EffectRef['op'],
  docId: string,
  written: Record<string, unknown>,
  previous: Record<string, unknown> | null,
) => ({
  ref: { op, collection, docId } as EffectRef,
  effect: { written, previous },
});

const entry = (
  collection: EffectRef['collection'],
  docId: string,
  written: Record<string, unknown>,
  previous: Record<string, unknown> | null = null,
  op: EffectRef['op'] = previous === null ? 'create' : 'update',
) => ({
  ref: { op, collection, docId } as EffectRef,
  effect: { written, previous },
});

const habitTarget = (
  docId: string,
  data: Record<string, unknown> | null,
  name = 'Pills',
): [string, UndoTarget] => [docId, { docId, data, opened: habitSealed(name) }];

const dayTarget = (
  docId: string,
  data: Record<string, unknown> | null,
  notes: HabitDaySealed['notes'] = {},
): [string, UndoTarget] => [docId, { docId, data, opened: { notes } }];

const CHECK = {
  status: 'done',
  at: NOW,
  by: 'nomos',
  executionId: 'exec-1',
};
const TICK_PATH = 'entries.h1.checks.w1';

test('a created habit is deleted while it is as it was made and never reads as a task', () => {
  const made = habitEntry(
    'habits',
    'create',
    'h1',
    { 'sealed.title': 'Pills', cadence: { kind: 'everyDay' } },
    null,
  );
  const result = asWrite(
    plan(execution([made]), [habitTarget('h1', { lastEditedAt: null })]),
  );
  assert.deepEqual(result.deletes, [{ docId: 'h1', collection: 'habits' }]);
  assert.equal(result.report, 'Took back 1 habit change.');
  assert.equal(result.undoSealed.summary, 'Took back 1 habit change');
  const kept = asRefused(
    plan(execution([made]), [habitTarget('h1', { lastEditedAt: EARLIER + 5 })]),
  );
  assert.deepEqual(kept.kept, ['Pills']);
});

test('an updated habit gets its status, pause and schedule back, field by field', () => {
  const paused = habitEntry(
    'habits',
    'update',
    'h1',
    {
      status: 'paused',
      pausedAt: EARLIER,
      pausedUntil: SUNDAY,
      history: [{ kind: 'paused' }],
      lastEditedAt: EARLIER,
      'sealed.title': 'Pills',
    },
    {
      status: 'active',
      pausedAt: null,
      pausedUntil: null,
      history: [],
      lastEditedAt: null,
      'sealed.title': 'Pills',
    },
  );
  const result = asWrite(
    plan(execution([paused]), [
      habitTarget('h1', {
        status: 'paused',
        pausedAt: EARLIER,
        pausedUntil: SUNDAY,
        history: [{ kind: 'paused' }],
        lastEditedAt: EARLIER,
      }),
    ]),
  );
  assert.deepEqual(result.updates, [
    {
      docId: 'h1',
      collection: 'habits',
      fields: {
        status: 'active',
        pausedAt: null,
        pausedUntil: null,
        history: [],
        lastEditedAt: NOW,
      },
      reseal: null,
    },
  ]);
  assert.equal(result.report, 'Took back 1 habit change.');
  const rescheduled = habitEntry(
    'habits',
    'update',
    'h1',
    {
      cadence: { kind: 'onWeekdays', weekdays: [1] },
      lastEditedAt: EARLIER,
      'sealed.title': 'Pills',
    },
    {
      cadence: { kind: 'everyDay' },
      lastEditedAt: null,
      'sealed.title': 'Pills',
    },
  );
  const changedSince = asRefused(
    plan(execution([rescheduled]), [
      habitTarget('h1', {
        cadence: { kind: 'everyDay' },
        lastEditedAt: EARLIER + 9,
      }),
    ]),
  );
  assert.deepEqual(changedSince.kept, ['Pills']);
});

test('a check-in is taken off one window and the other windows and devices stay', () => {
  const tick = habitEntry(
    'habitDays',
    'update',
    '2026-11-09',
    { [TICK_PATH]: CHECK, 'sealed.title': 'Pills', noteKey: null },
    { [TICK_PATH]: null, 'sealed.title': 'Pills', noteKey: null },
  );
  const result = asWrite(
    plan(execution([tick]), [
      dayTarget('2026-11-09', {
        entries: {
          h1: {
            checks: { w1: CHECK, w2: { ...CHECK, at: NOW + 1 } },
            count: 0,
          },
        },
      }),
    ]),
  );
  assert.deepEqual(result.updates, [
    {
      docId: '2026-11-09',
      collection: 'habitDays',
      fields: { [TICK_PATH]: null },
      reseal: null,
    },
  ]);
  assert.deepEqual(result.undoExecution.effectRefs, [
    { op: 'update', collection: 'habitDays', docId: '2026-11-09' },
  ]);
  assert.equal(result.report, 'Unticked 1 check-in.');
  assert.equal(result.undoSealed.summary, 'Unticked 1 check-in');
  assert.equal(result.deletes.length, 0);
});

test('a check-in the person already took off is left, and says so', () => {
  const tick = habitEntry(
    'habitDays',
    'create',
    '2026-11-09',
    { [TICK_PATH]: CHECK, 'sealed.title': 'Pills', noteKey: null },
    { [TICK_PATH]: null, 'sealed.title': 'Pills', noteKey: null },
  );
  const result = asRefused(
    plan(execution([tick]), [
      dayTarget('2026-11-09', { entries: { h1: { checks: {}, count: 0 } } }),
    ]),
  );
  assert.equal(result.reason, 'nothingToTakeBack');
  assert.deepEqual(result.kept, ['Pills']);
});

test('a tally goes back to its earlier count only while it is the count the turn left', () => {
  const COUNT_PATH = 'entries.h2.count';
  const tally = habitEntry(
    'habitDays',
    'update',
    '2026-11-09',
    { [COUNT_PATH]: 3, 'sealed.title': 'Water' },
    { [COUNT_PATH]: 2, 'sealed.title': 'Water' },
  );
  const back = asWrite(
    plan(execution([tally]), [
      dayTarget('2026-11-09', { entries: { h2: { checks: {}, count: 3 } } }),
    ]),
  );
  assert.deepEqual(back.updates[0].fields, { [COUNT_PATH]: 2 });
  const another = asRefused(
    plan(execution([tally]), [
      dayTarget('2026-11-09', { entries: { h2: { checks: {}, count: 4 } } }),
    ]),
  );
  assert.deepEqual(another.kept, ['Water']);
});

test('a note said with a check-in is cleared from the day when the check-in is taken back', () => {
  const tick = habitEntry(
    'habitDays',
    'update',
    '2026-11-09',
    { [TICK_PATH]: CHECK, 'sealed.title': 'Pills', noteKey: 'h1/w1' },
    { [TICK_PATH]: null, 'sealed.title': 'Pills', noteKey: null },
  );
  const result = asWrite(
    plan(execution([tick]), [
      dayTarget(
        '2026-11-09',
        {
          entries: {
            h1: {
              checks: { w1: CHECK },
              count: 0,
              noteKeys: ['h1/w1', 'h1/w2'],
            },
          },
        },
        {
          'h1/w1': { text: 'felt dizzy', at: NOW, captureId: 'turn-1' },
          'h1/w2': { text: 'with food', at: NOW, captureId: 'turn-0' },
        },
      ),
    ]),
  );
  assert.deepEqual(result.updates[0].fields, {
    [TICK_PATH]: null,
    'entries.h1.noteKeys': ['h1/w2'],
  });
  assert.deepEqual(result.updates[0].reseal, {
    notes: { 'h1/w2': { text: 'with food', at: NOW, captureId: 'turn-0' } },
  });
});

test('a habit turn names its habits in the result lines, never as a task', () => {
  const lines = buildResultLines(
    execution([
      habitEntry('habits', 'create', 'h1', { 'sealed.title': 'Pills' }, null),
      habitEntry(
        'habitDays',
        'update',
        '2026-11-09',
        { [TICK_PATH]: CHECK, 'sealed.title': 'Pills' },
        { [TICK_PATH]: null, 'sealed.title': 'Pills' },
      ),
    ]),
    new Map(),
    'America/Los_Angeles',
    NOW,
  );
  assert.deepEqual(
    lines.map((line) => [line.title, line.detail]),
    [
      ['Pills', null],
      ['Pills', HELM_COPY.resultDone],
    ],
  );
});

test('taking back something Helm did on its own says what it took back, in plain words', () => {
  assert.equal(
    HELM_COPY.patternTookBack('Evening pills moved'),
    'Took back: Evening pills moved',
  );
  assert.doesNotMatch(
    `${HELM_COPY.patternTookBack('x')}${HELM_COPY.patternTookBackReport}`,
    /Nomos|pattern/i,
  );
});

const THREE_TASKS = [
  create('t1', 'Book the venue'),
  create('t2', 'Send invites'),
  create('t3', 'Order flowers'),
];
const taskTargets = (ids: string[]) =>
  ids.map((id) => target(id, { lastEditedAt: null }, sealedOf(id)));

test('a project and its milestone on one record are one unit', () => {
  const { units } = buildUndoUnits(
    execution([
      entry('projects', 'p1', { 'sealed.name': 'Wedding' }),
      entry(
        'projects',
        'p1',
        { 'sealed.milestones.m1': { text: 'Book' }, 'sealed.title': 'Wedding' },
        { 'sealed.title': 'Wedding' },
      ),
      create('t1', 'Book the venue'),
    ]),
  );
  assert.equal(units.length, 2);
  assert.deepEqual(units[0].effectIndexes, [0, 1]);
  assert.equal(units[0].kind, 'project');
  assert.equal(units[0].change, 'added');
  assert.equal(units[1].kind, 'task');
});

test('topics of one title (a grouping) are one unit, with a note hidden by a topic', () => {
  const built = buildUndoUnits(
    execution([
      entry('notes', 'n1', { 'sealed.title': 'Baking' }),
      entry('topics', 'a', { 'sealed.title': 'Baking', version: 1 }, null),
      entry('topics', 'b', { 'sealed.title': 'Baking', version: 1 }, null),
      entry('topics', 'c', { 'sealed.title': 'Garden', version: 1 }, null),
    ]),
  );
  assert.equal(built.units.length, 2);
  assert.deepEqual(built.units[0].effectIndexes, [0, 1, 2]);
  assert.deepEqual(built.units[0].docIds, ['n1', 'a', 'b']);
  assert.equal(built.units[0].key, 'a:1');
  assert.equal(built.units[1].key, 'c:3');
});

test('a filing rides along; a row-less topic effect joins its record or title', () => {
  const built = buildUndoUnits(
    execution([
      entry(
        'topics',
        'a',
        { 'sealed.title': 'Baking', version: 2 },
        { version: 1 },
      ),
      entry(
        'topics',
        'a',
        { 'sealed.title': 'Baking', depth: 1 },
        { depth: 0 },
      ),
      entry(
        'topics',
        'z',
        { 'sealed.title': 'Baking', version: 3, change: 'moved' },
        { version: 2 },
      ),
      entry(
        'topics',
        'k',
        { pendingNoteIds: ['n'], docState: 'fresh' },
        { pendingNoteIds: [] },
      ),
      entry('topics', 'q', { 'sealed.title': 'Lost', depth: 2 }, { depth: 1 }),
    ]),
  );
  assert.equal(built.units.length, 1);
  assert.deepEqual(built.units[0].effectIndexes, [0, 1, 2]);
  assert.deepEqual(built.riders, [3]);
  assert.deepEqual(built.rest, [4]);
});

test('people, places and photos are held apart; an import is one unit', () => {
  const effects = [
    create('t1', 'Book'),
    entry('who', 'w1', { 'sealed.name': 'Dana' }),
    entry('places', 'pl1', { 'sealed.name': 'Home' }),
    entry('media', 'm1', { attachedTo: [{ kind: 'task', id: 't1' }] }),
    entry(
      'profile',
      'me',
      { currentPlace: null, 'sealed.title': 'Home' },
      { currentPlace: {} },
    ),
  ];
  const built = buildUndoUnits(execution(effects));
  assert.deepEqual(built.entities, [1, 2]);
  assert.deepEqual(built.media, [3]);
  assert.equal(built.units.length, 2);
  assert.equal(built.units[1].kind, 'home');
  const imported = buildUndoUnits(execution(effects, { category: 'import' }));
  assert.equal(imported.units.length, 1);
  assert.equal(imported.units[0].effectIndexes.length, 5);
});

test('every drawn row names its unit, and a unit key is its first row key', () => {
  const original = execution([
    entry('notes', 'n1', { 'sealed.title': 'Baking' }),
    entry('topics', 'a', { 'sealed.title': 'Baking', version: 1 }, null),
    create('t1', 'Book'),
    update(
      't1',
      { 'sealed.title': 'Book', status: 'done' },
      { 'sealed.title': 'Book', status: 'open' },
    ),
    entry('who', 'w1', { 'sealed.name': 'Dana' }),
  ]);
  const { units } = buildUndoUnits(original);
  const lines = buildResultLines(original, new Map(), 'UTC', NOW);
  assert.ok(lines.every((line) => line.unitKey !== null));
  assert.ok(
    lines.every((line) => units.some((unit) => unit.key === line.unitKey)),
  );
  units.forEach((unit) =>
    assert.equal(
      lines.find((line) => line.unitKey === unit.key)?.key,
      unit.key,
    ),
  );
  assert.equal(units[1].change, 'added');
  assert.equal(units[1].docIds[0], 't1');
});

test('a partial undo takes back only the chosen tasks', () => {
  const original = execution(THREE_TASKS);
  const narrowed = narrowForUndo(original, ['t1']);
  assert.equal(narrowed.kind, 'ok');
  if (narrowed.kind !== 'ok') return;
  assert.equal(narrowed.isFinal, false);
  assert.deepEqual(narrowed.recordedDocIds, ['t1']);
  assert.deepEqual(
    narrowed.view.effectRefs.map((ref) => ref.docId),
    ['t1'],
  );
  assert.equal(narrowed.view.effects.length, 1);
  const result = asWrite(
    planUndo({
      original: narrowed.view,
      targets: new Map(taskTargets(['t1', 't2', 't3'])),
      undoExecutionId: 'undo-1',
      now: NOW,
      usedIds: new Set(),
      questionRef: { captureId: 'c1', questionId: 'q1' },
    }),
  );
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['t1'],
  );
  assert.deepEqual(result.undoExecution.questionRef, {
    captureId: 'c1',
    questionId: 'q1',
  });
  assert.equal(result.undoExecution.undoneDocIds, null);
});

test('the last units finish the undo and take the people and places with them', () => {
  const original = execution([
    ...THREE_TASKS,
    entry('who', 'w1', { 'sealed.name': 'Dana' }),
  ]);
  const partial = narrowForUndo(original, ['t1', 't2']);
  assert.equal(partial.kind === 'ok' && partial.isFinal, false);
  if (partial.kind === 'ok') {
    assert.ok(!partial.view.effectRefs.some((ref) => ref.docId === 'w1'));
  }
  const after = {
    ...original,
    undoneDocIds: ['t1', 't2'],
    partUndoIds: ['u1'],
  };
  const last = narrowForUndo(after, null);
  assert.equal(last.kind, 'ok');
  if (last.kind !== 'ok') return;
  assert.equal(last.isFinal, true);
  assert.deepEqual(
    last.view.effectRefs.map((ref) => ref.docId),
    ['t3', 'w1'],
  );
  assert.deepEqual(last.recordedDocIds.sort(), ['t1', 't2', 't3', 'w1']);
  assert.equal(
    narrowForUndo(after, ['t1']).kind,
    'refused',
    'a unit already undone is not taken twice',
  );
  const everything = narrowForUndo(original, null);
  assert.equal(everything.kind === 'ok' && everything.isFinal, true);
});

test('a photo on a task that is not chosen survives; photos with outside owners go last', () => {
  const original = execution([
    create('t1', 'Book'),
    create('t2', 'Send'),
    entry('media', 'm1', { attachedTo: [{ kind: 'task', id: 't2' }] }),
    entry('media', 'm2', { attachedTo: [{ kind: 'fact', id: 'elsewhere' }] }),
  ]);
  const ids = (docIds: string[], base = original) => {
    const narrowed = narrowForUndo(base, docIds);
    return narrowed.kind === 'ok'
      ? narrowed.view.effectRefs.map((ref) => ref.docId)
      : [];
  };
  assert.deepEqual(ids(['t1']), ['t1']);
  assert.deepEqual(ids(['t2']), ['t2', 'm1']);
  const afterT2 = {
    ...original,
    undoneDocIds: ['t2', 'm1'],
    partUndoIds: ['u'],
  };
  assert.deepEqual(ids(['t1'], afterT2), ['t1', 'm2']);
  const afterT1 = { ...original, undoneDocIds: ['t1'], partUndoIds: ['u'] };
  assert.deepEqual(ids(['t2'], afterT1), ['t2', 'm1', 'm2']);
});

test('what an earlier undo took back is not planned again', () => {
  const original = {
    ...execution(THREE_TASKS),
    undoneDocIds: ['t1'],
    partUndoIds: ['u1'],
  };
  const narrowed = narrowForUndo(original, null);
  assert.equal(narrowed.kind === 'ok' && narrowed.isFinal, true);
  assert.deepEqual(
    narrowed.kind === 'ok'
      ? narrowed.view.effectRefs.map((ref) => ref.docId)
      : [],
    ['t2', 't3'],
  );
  assert.deepEqual(
    getRemainingUnits(
      buildUndoUnits(original).units,
      getUndoneDocIds(original),
    ).map((unit) => unit.docIds[0]),
    ['t2', 't3'],
  );
});

test('Undo is offered only while a unit is left', () => {
  const base = execution(THREE_TASKS);
  assert.equal(canUndo(base), true);
  assert.equal(canUndo({ ...base, undoneDocIds: ['t1', 't2'] }), true);
  assert.equal(canUndo({ ...base, undoneDocIds: ['t1', 't2', 't3'] }), false);
  assert.equal(canUndo({ ...base, undoneByExecutionId: 'u' }), false);
  assert.equal(
    canUndo(execution([entry('who', 'w1', { 'sealed.name': 'Dana' })])),
    true,
    'an execution with no unit keeps the old rule',
  );
});

test('a full turn of the most effects the server writes can still be taken back', () => {
  assert.ok(MAX_UNDO_EFFECTS >= MAX_EXECUTION_EFFECTS);
  const many = Array.from({ length: MAX_EXECUTION_EFFECTS }, (_, index) =>
    create(`t${index}`, `Task ${index}`),
  );
  const result = plan(
    execution(many),
    taskTargets(many.map((entry) => entry.ref.docId)),
  );
  assert.equal(result.kind, 'write');
});

test('an execution from before partial undo opens with its undone ids filled in', () => {
  const open = (data: Parameters<typeof readUndoFields>[0]) =>
    readUndoFields(data);
  const fresh = open({ undoneByExecutionId: null });
  assert.deepEqual(fresh.undoneDocIds, []);
  assert.deepEqual(fresh.partUndoIds, []);
  const old = open({ undoneByExecutionId: 'u9' });
  assert.deepEqual(old.partUndoIds, ['u9']);
  const part = open({
    undoneByExecutionId: null,
    undoneDocIds: ['t1'],
    partUndoIds: ['u1', 'u2'],
  });
  assert.deepEqual(part.undoneDocIds, ['t1']);
  assert.deepEqual(part.partUndoIds, ['u1', 'u2']);
});

test('a later batch write to a topic is taken back as a version; the first write has nothing to go back to', () => {
  const written = (from: number, reason = 'notesBrought') =>
    buildWriteExecution(
      NOW,
      (fields) => fields as unknown as SealedPayload,
      'Brought 2 notes into Car care',
      { topicId: 'car', name: 'Car care', reason, from, to: from + 1 },
    ) as unknown as {
      effectRefs: EffectRef[];
      sealed: { effects: ExecutionEffect[] };
    };
  const first = written(0, 'firstWritten');
  assert.deepEqual(first.effectRefs, []);
  assert.deepEqual(first.sealed.effects, []);
  const later = written(4);
  assert.deepEqual(later.effectRefs, [
    { op: 'update', collection: 'topics', docId: 'car' },
  ]);
  assert.deepEqual(Object.keys(later.sealed.effects[0].written).sort(), [
    'change',
    'sealed.title',
    'version',
  ]);
  const result = asWrite(
    plan(
      execution(
        later.effectRefs.map((ref, index) => ({
          ref,
          effect: later.sealed.effects[index],
        })),
      ),
      [topicTarget('car', { version: 5, writeClaim: null })],
    ),
  );
  assert.deepEqual(result.versionRestores, [
    { docId: 'car', collection: 'topics', from: 5, to: 4 },
  ]);
  const moved = asRefused(
    plan(
      execution(
        later.effectRefs.map((ref, index) => ({
          ref,
          effect: later.sealed.effects[index],
        })),
      ),
      [topicTarget('car', { version: 6, writeClaim: null })],
    ),
  );
  assert.ok(moved);
});

test('an undo offer names what is still left: the whole turn, a part, or nothing', () => {
  const exec = execution(TWO_CREATES);
  assert.deepEqual(toOfferDocIds({ docIds: [], isAll: true }, exec), [
    't1',
    't2',
  ]);
  assert.deepEqual(
    toOfferDocIds({ docIds: ['t2', 'zzz'], isAll: false }, exec),
    ['t2'],
  );
  const part = execution(TWO_CREATES, { undoneDocIds: ['t1'] });
  assert.deepEqual(toOfferDocIds({ docIds: [], isAll: true }, part), ['t2']);
  assert.deepEqual(toOfferDocIds({ docIds: ['t1'], isAll: false }, part), []);
  const whole = execution(TWO_CREATES, { undoneByExecutionId: 'undo-0' });
  assert.deepEqual(toOfferDocIds({ docIds: [], isAll: true }, whole), []);
});

test('an undo carries the reason it was asked for, null when none was given', () => {
  const targets: [string, UndoTarget][] = [
    target('t1', { lastEditedAt: null }, sealedOf('Book the hair trial')),
    target('t2', { lastEditedAt: null }, sealedOf('Send the save-the-dates')),
  ];
  const reason = {
    reason: 'wrongDetails' as const,
    quote: 'not that one',
    via: 'offer' as const,
  };
  const withReason = asWrite(
    planUndo({
      original: execution(TWO_CREATES),
      targets: new Map(targets),
      undoExecutionId: 'undo-1',
      now: NOW,
      usedIds: new Set(),
      reason,
    }),
  );
  assert.deepEqual(withReason.undoSealed.undoReason, reason);
  const without = asWrite(plan(execution(TWO_CREATES), targets));
  assert.equal(without.undoSealed.undoReason, null);
});

const researchSealed = (
  subject: string,
  extra: Partial<ResearchSealed> = {},
): ResearchSealed => ({
  question: `how does ${subject} work`,
  subject,
  overview: null,
  sources: [],
  moreAsked: [],
  videos: [],
  searchQuery: null,
  contextLine: null,
  ...extra,
});

const researchTarget = (
  docId: string,
  data: Record<string, unknown> | null,
  opened: ResearchSealed | null = data ? researchSealed('Engines') : null,
): [string, UndoTarget] => [docId, { docId, data, opened }];

const researchRef = (op: EffectRef['op']) =>
  ({ op, collection: 'research', docId: 'r1' }) as EffectRef;

const researchCreate = (mode: string) => ({
  ref: researchRef('create'),
  effect: {
    written: { mode, status: 'planned', 'sealed.title': 'Engines' },
    previous: null,
  },
});

const researchUpdate = (
  written: Record<string, unknown>,
  previous: Record<string, unknown>,
) => ({
  ref: researchRef('update'),
  effect: {
    written: { ...written, 'sealed.title': 'Engines' },
    previous: { ...previous, 'sealed.title': 'Engines' },
  },
});

const LEARN_UNTOUCHED = {
  mode: 'learnLater',
  offers: [],
  notNowStreak: 0,
  resultNoteId: null,
  mergedInto: null,
  lastEditedAt: EARLIER + 5,
};

test('a question asked for a look is dismissed while it is still asking or preparing, and kept once ready', () => {
  const made = execution([researchCreate('asked')]);
  ['asking', 'preparing'].forEach((status) => {
    const result = asWrite(
      plan(made, [
        researchTarget('r1', { mode: 'asked', status, lastEditedAt: null }),
      ]),
    );
    assert.equal(result.updates[0].fields.status, 'dismissed');
    assert.equal(result.updates[0].collection, 'research');
  });
  const ready = asRefused(
    plan(made, [
      researchTarget('r1', {
        mode: 'asked',
        status: 'ready',
        lastEditedAt: null,
      }),
    ]),
  );
  assert.deepEqual(ready.kept, ['Engines']);
});

test('a saved learn-later question is dismissed while planned, ready or offered and untouched; being prepared or answered keeps it', () => {
  const made = execution([researchCreate('learnLater')]);
  ['planned', 'ready', 'offered'].forEach((status) => {
    const result = asWrite(
      plan(made, [researchTarget('r1', { ...LEARN_UNTOUCHED, status })]),
    );
    assert.deepEqual(result.updates[0].fields, {
      status: 'dismissed',
      lastEditedAt: NOW,
    });
  });
  const preparing = asRefused(
    plan(made, [
      researchTarget('r1', { ...LEARN_UNTOUCHED, status: 'preparing' }),
    ]),
  );
  assert.deepEqual(preparing.kept, ['Engines']);
  const answered = asRefused(
    plan(made, [
      researchTarget('r1', {
        ...LEARN_UNTOUCHED,
        status: 'ready',
        notNowStreak: 1,
      }),
    ]),
  );
  assert.deepEqual(answered.kept, ['Engines']);
});

test('a merge into a saved question puts its words and status back', () => {
  const merged = execution([
    researchUpdate(
      { status: 'planned', 'sealed.moreAsked': ['what a camshaft does'] },
      { status: 'ready', 'sealed.moreAsked': [] },
    ),
  ]);
  const result = asWrite(
    plan(merged, [
      researchTarget(
        'r1',
        { ...LEARN_UNTOUCHED, status: 'planned' },
        researchSealed('Engines', { moreAsked: ['what a camshaft does'] }),
      ),
    ]),
  );
  const [one] = result.updates;
  assert.equal(one.fields.status, 'ready');
  assert.equal(one.fields.lastEditedAt, NOW);
  assert.deepEqual((one.reseal as ResearchSealed).moreAsked, []);
});

test('putting a saved question back to planned with no night booked is kept, never restored', () => {
  const sentBack = execution([
    researchUpdate({ status: 'ready' }, { status: 'planned' }),
  ]);
  const result = asRefused(
    plan(sentBack, [
      researchTarget('r1', {
        ...LEARN_UNTOUCHED,
        status: 'ready',
        prepareAt: null,
      }),
    ]),
  );
  assert.deepEqual(result.kept, ['Engines']);
});

test('removing a saved question comes back with its status and reason, kept if it changed since', () => {
  const removed = execution([
    researchUpdate(
      { status: 'dismissed', declineReason: 'lostInterest', removedAt: NOW },
      { status: 'ready', declineReason: null, removedAt: null },
    ),
  ]);
  const result = asWrite(
    plan(removed, [
      researchTarget('r1', {
        ...LEARN_UNTOUCHED,
        status: 'dismissed',
        declineReason: 'lostInterest',
        removedAt: NOW,
      }),
    ]),
  );
  assert.deepEqual(result.updates[0].fields, {
    status: 'ready',
    declineReason: null,
    removedAt: null,
    lastEditedAt: NOW,
  });
  assert.equal(result.updates[0].reseal, null);
  const changed = asRefused(
    plan(removed, [
      researchTarget('r1', {
        ...LEARN_UNTOUCHED,
        status: 'ready',
        declineReason: null,
        removedAt: null,
      }),
    ]),
  );
  assert.equal(changed.reason, 'nothingToTakeBack');
});

test('changing what a saved question asks restores its words and sends it back to ready', () => {
  const changed = execution([
    researchUpdate(
      {
        status: 'planned',
        declineReason: 'changedMind',
        'sealed.question': 'how do rockets work',
        'sealed.subject': 'rockets',
      },
      {
        status: 'ready',
        declineReason: null,
        'sealed.question': 'how does engines work',
        'sealed.subject': 'Engines',
      },
    ),
  ]);
  const result = asWrite(
    plan(changed, [
      researchTarget(
        'r1',
        { ...LEARN_UNTOUCHED, status: 'planned', declineReason: 'changedMind' },
        researchSealed('rockets', { question: 'how do rockets work' }),
      ),
    ]),
  );
  const [one] = result.updates;
  assert.equal(one.fields.status, 'ready');
  assert.equal(one.fields.declineReason, null);
  assert.equal((one.reseal as ResearchSealed).subject, 'Engines');
  assert.equal(
    (one.reseal as ResearchSealed).question,
    'how does engines work',
  );
});

test('Together brings the newer question back and reseals the older one', () => {
  const newer = {
    ref: { op: 'update', collection: 'research', docId: 'r2' } as EffectRef,
    effect: {
      written: {
        status: 'dismissed',
        mergedInto: 'r1',
        'sealed.title': 'Motors',
      },
      previous: { status: 'ready', mergedInto: null, 'sealed.title': 'Motors' },
    },
  };
  const older = {
    ref: researchRef('update'),
    effect: {
      written: {
        status: 'planned',
        'sealed.subject': 'How engines and motors work',
        'sealed.moreAsked': ['how motors work'],
        'sealed.title': 'Engines',
      },
      previous: {
        status: 'ready',
        'sealed.subject': 'Engines',
        'sealed.moreAsked': [],
        'sealed.title': 'Engines',
      },
    },
  };
  const result = asWrite(
    plan(execution([older, newer]), [
      researchTarget(
        'r1',
        { ...LEARN_UNTOUCHED, status: 'planned' },
        researchSealed('How engines and motors work', {
          moreAsked: ['how motors work'],
        }),
      ),
      researchTarget(
        'r2',
        { ...LEARN_UNTOUCHED, status: 'dismissed', mergedInto: 'r1' },
        researchSealed('Motors'),
      ),
    ]),
  );
  const byId = Object.fromEntries(
    result.updates.map((entry) => [entry.docId, entry]),
  );
  assert.equal(byId.r2.fields.status, 'ready');
  assert.equal(byId.r2.fields.mergedInto, null);
  assert.equal(byId.r1.fields.status, 'ready');
  assert.equal((byId.r1.reseal as ResearchSealed).subject, 'Engines');
  assert.deepEqual((byId.r1.reseal as ResearchSealed).moreAsked, []);
});

test('Done with it goes back to ready', () => {
  const done = execution([
    researchUpdate({ status: 'done' }, { status: 'ready' }),
  ]);
  const result = asWrite(
    plan(done, [researchTarget('r1', { ...LEARN_UNTOUCHED, status: 'done' })]),
  );
  assert.deepEqual(result.updates[0].fields, {
    status: 'ready',
    lastEditedAt: NOW,
  });
});

test('Save to my knowledge takes the note away while unedited and puts the question back', () => {
  const noteMade = {
    ref: { op: 'create', collection: 'notes', docId: 'n1' } as EffectRef,
    effect: { written: { 'sealed.title': 'Engines' }, previous: null },
  };
  const kept = execution(
    [
      researchUpdate(
        { status: 'done', resultNoteId: 'n1' },
        { status: 'ready', resultNoteId: null },
      ),
      noteMade,
    ],
    { actor: 'person', captureId: null, category: 'plan' },
  );
  const targets = (noteEdited: number | null): [string, UndoTarget][] => [
    researchTarget('r1', {
      ...LEARN_UNTOUCHED,
      status: 'done',
      resultNoteId: 'n1',
    }),
    [
      'n1',
      {
        docId: 'n1',
        data: { lastEditedAt: noteEdited, topicIds: [] },
        opened: {
          title: 'Engines',
          body: 'x',
        } as unknown as UndoTarget['opened'],
      },
    ],
  ];
  const result = asWrite(plan(kept, targets(null)));
  assert.deepEqual(
    result.deletes.map((entry) => entry.docId),
    ['n1'],
  );
  assert.equal(result.updates[0].fields.status, 'ready');
  assert.equal(result.updates[0].fields.resultNoteId, null);
  const edited = asWrite(plan(kept, targets(NOW)));
  assert.deepEqual(edited.deletes, []);
  assert.deepEqual(edited.kept, ['Engines']);
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
    failures.push(name);
  }
}
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
