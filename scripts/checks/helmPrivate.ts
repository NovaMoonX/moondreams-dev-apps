// Private things: each source of the class, what code may and may not change, the copy filter and the unattended turn.
import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import type { CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';
import { planWrites } from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import {
  toContextTask,
  type MaskedName,
} from '../../functions/src/apps/helm/nomos/unattended.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import { planUndo } from '../../src/apps/helm/nomos/planUndo.ts';
import {
  buildInheritedLine,
  buildLeftOutLine,
  filterPrivate,
  filterPrivateOwnPage,
  isPrivateInEffect,
  isUnattendedTurn,
  maskPrivateNames,
  readDerivedPrivacy,
  readEffectivePrivacy,
  readMaskedLabel,
  readPersonMark,
  readPrivateMark,
  readPrivacy,
  readSetPrivate,
  type PrivacyFacts,
} from '../../src/apps/helm/utils/privacy.ts';
import {
  buildParentIndex,
  planKeepOnLeaving,
  readRecordPrivacy,
} from '../../src/apps/helm/utils/privacyParents.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const NONE: PrivacyFacts = { privateMark: null, isPrivacyCleared: false };
const mark = (words: string, current: PrivacyFacts = NONE, isCare = false) =>
  readPrivateMark({
    current,
    isCare,
    isForOtherWho: false,
    commandMark: null,
    isSensitiveHealth: false,
    words,
  });

test('a record from before the field reads as ordinary', () => {
  assert.equal(readPrivacy(undefined), 'ordinary');
  assert.equal(readPrivacy(null), 'ordinary');
  assert.equal(readPrivacy('private'), 'private');
});

test('care marks a record private, with care as the reason', () => {
  const facts = mark('Mom, morning', NONE, true);
  assert.equal(facts.privateMark, 'care');
  assert.equal(readEffectivePrivacy(facts), 'private');
});

test('a health word the model missed marks a record private, a plain one does not', () => {
  assert.equal(mark('Take my medicine').privateMark, 'health');
  assert.equal(mark('Refill the prescription').privateMark, 'health');
  assert.equal(mark('Buy milk').privateMark, null);
  assert.equal(mark('Pills at 8').privateMark, 'health');
});

test('the person marks a record private and the mark stays theirs', () => {
  const facts = readPersonMark(NONE, true);
  assert.equal(facts.privateMark, 'person');
  assert.equal(readEffectivePrivacy(facts), 'private');
  assert.equal(readPersonMark(facts, false).privateMark, null);
});

test('a private project or a private who makes what is filed under it private, and leaving it ends that', () => {
  const private_ = readPersonMark(NONE, true);
  assert.equal(isPrivateInEffect(NONE, [private_]), true);
  assert.equal(isPrivateInEffect(NONE, [NONE]), false);
  const index = buildParentIndex(
    [{ id: 'p1', name: 'Surprise party', ...private_ }],
    [{ id: 'w1', name: 'Mom', ...private_ }],
    [],
  );
  assert.equal(
    readRecordPrivacy('task', { id: 't1', projectId: 'p1' }, index),
    'private',
  );
  assert.equal(
    readRecordPrivacy('task', { id: 't2', whoIds: ['w1'] }, index),
    'private',
  );
  assert.equal(
    readRecordPrivacy('task', { id: 't3', projectId: null }, index),
    'ordinary',
  );
  assert.equal(
    readRecordPrivacy('task', { id: 't4', projectId: 'gone' }, index),
    'ordinary',
  );
});

test('code never clears a health mark', () => {
  const health = mark('Take my medicine');
  assert.equal(mark('Buy milk', health).privateMark, 'health');
  assert.equal(mark('', health).privateMark, 'health');
});

test('code never marks again what the person cleared', () => {
  const cleared = readPersonMark(mark('Take my medicine'), false);
  assert.equal(cleared.privateMark, null);
  assert.equal(cleared.isPrivacyCleared, true);
  assert.equal(mark('Take my medicine', cleared).privateMark, null);
  assert.equal(mark('anything', cleared, true).privateMark, null);
});

test('a person who turns a mark back on keeps clearing from blocking it', () => {
  const cleared = readPersonMark(mark('Take my medicine'), false);
  const on = readPersonMark(cleared, true);
  assert.equal(on.privateMark, 'person');
  assert.equal(on.isPrivacyCleared, false);
});

test('setPrivate is refused on an inherited class with the code-built line', () => {
  const parent = {
    id: 'p1',
    name: 'Surprise party',
    facts: readPersonMark(NONE, true),
  };
  const outcome = readSetPrivate({
    current: NONE,
    isPrivate: false,
    parents: [parent],
  });
  assert.deepEqual(outcome, {
    kind: 'refused',
    line: buildInheritedLine('Surprise party'),
  });
  assert.equal(
    buildInheritedLine('Surprise party'),
    "It's private because Surprise party is private. Change it on Surprise party's page?",
  );
});

test('setPrivate changes nothing when it already is so, and applies otherwise', () => {
  assert.equal(
    readSetPrivate({ current: NONE, isPrivate: false, parents: [] }).kind,
    'unchanged',
  );
  const on = readSetPrivate({ current: NONE, isPrivate: true, parents: [] });
  assert.equal(on.kind, 'applied');
  assert.equal(
    readSetPrivate({
      current: readPersonMark(NONE, true),
      isPrivate: true,
      parents: [],
    }).kind,
    'unchanged',
  );
});

test('a copy leaves private things out and says how many, and one copy can include them', () => {
  const items = [
    { name: 'Milk', isPrivate: false },
    { name: 'Medicine', isPrivate: true },
    { name: 'Refill', isPrivate: true },
  ];
  const left = filterPrivate(items, (item) => item.isPrivate);
  assert.deepEqual(
    left.kept.map((item) => item.name),
    ['Milk'],
  );
  assert.equal(left.leftOutCount, 2);
  assert.equal(left.line, '2 private things left out');
  assert.equal(buildLeftOutLine(1), '1 private thing left out');
  assert.equal(buildLeftOutLine(0), null);
  const included = filterPrivate(items, (item) => item.isPrivate, {
    include: true,
  });
  assert.equal(included.kept.length, 3);
  assert.equal(included.line, null);
});

test('one private thing copied from its own page is copied as usual', () => {
  const item = { name: 'Medicine', isPrivate: true };
  assert.equal(
    filterPrivateOwnPage(item, (entry) => entry.isPrivate),
    item,
  );
});

test('a derived record is private when any source is', () => {
  const classes = new Map<string, 'ordinary' | 'private'>([
    ['a', 'ordinary'],
    ['b', 'private'],
  ]);
  const classOf = (key: string) => classes.get(key);
  assert.equal(readDerivedPrivacy(['a', 'b'], classOf), 'private');
  assert.equal(readDerivedPrivacy(['a'], classOf), 'ordinary');
  assert.equal(readDerivedPrivacy(['a', 'unknown'], classOf), 'ordinary');
  assert.equal(readDerivedPrivacy([], classOf), 'ordinary');
});

test('an unattended turn is one the wake phrase began on a hidden or untouched page', () => {
  const seen = { isHidden: false, isUntouched: false };
  assert.equal(isUnattendedTurn(true, { ...seen, isHidden: true }), true);
  assert.equal(isUnattendedTurn(true, { ...seen, isUntouched: true }), true);
  assert.equal(isUnattendedTurn(true, seen), false);
  assert.equal(isUnattendedTurn(false, { ...seen, isHidden: true }), false);
  assert.equal(isUnattendedTurn(true, null), false);
});

test('a touch ends the unattended turn', () => {
  assert.equal(
    isUnattendedTurn(true, { isHidden: false, isUntouched: true }),
    true,
  );
  assert.equal(
    isUnattendedTurn(true, { isHidden: false, isUntouched: false }),
    false,
  );
});

test('a private thing is named by its label, never its name', () => {
  assert.equal(
    readMaskedLabel({
      mark: 'health',
      windowLabel: 'morning',
      timeLabel: '8:00 AM',
    }),
    'your morning medicine',
  );
  assert.equal(
    readMaskedLabel({
      mark: 'person',
      windowLabel: null,
      timeLabel: '3:00 PM',
    }),
    'a private thing at 3:00 PM',
  );
  assert.equal(
    readMaskedLabel({ mark: null, windowLabel: null, timeLabel: null }),
    'a private thing',
  );
});

test('a private name left in a reply is replaced, an ordinary one is named as usual', () => {
  const names = [{ name: 'Metoprolol', label: 'your morning medicine' }];
  assert.equal(
    maskPrivateNames('Done: Metoprolol, and buy milk.', names),
    'Done: your morning medicine, and buy milk.',
  );
  assert.equal(maskPrivateNames('Added buy milk', names), 'Added buy milk');
  assert.equal(
    maskPrivateNames('metoprolols is different', names),
    'metoprolols is different',
  );
});

const MORNING = Date.UTC(2026, 10, 9, 8, 0);

const contextOf = (isOn: boolean, privacy: 'private' | 'ordinary') => {
  const names: MaskedName[] = [];
  const task = toContextTask(
    'task-1',
    { privacy, due: { kind: 'moment', at: MORNING } },
    {
      title: 'Metoprolol',
      sealed: { privateMark: privacy === 'private' ? 'health' : null },
    },
    { isOn, timeZone: 'UTC', names },
  );
  return { task, names };
};

test('in an unattended turn the model is given the label of a private task, never its name', () => {
  const { task, names } = contextOf(true, 'private');
  assert.equal(task.title, 'your morning medicine');
  assert.equal(JSON.stringify(task).includes('Metoprolol'), false);
  assert.deepEqual(names, [
    { name: 'Metoprolol', label: 'your morning medicine' },
  ]);
});

test('an ordinary task, or any task once the page is touched, is named as usual', () => {
  assert.equal(contextOf(true, 'ordinary').task.title, 'Metoprolol');
  assert.equal(contextOf(false, 'private').task.title, 'Metoprolol');
  assert.deepEqual(contextOf(false, 'private').names, []);
});

test('deleting a private project leaves each child that inherited it with its own mark', () => {
  const private_ = readPersonMark(NONE, true);
  const index = buildParentIndex(
    [
      { id: 'p1', name: 'Surprise party', ...private_ },
      { id: 'p2', name: 'Garden' },
    ],
    [],
    [],
  );
  const kept = planKeepOnLeaving(
    'project',
    'p1',
    [
      { kind: 'task', record: { id: 't1', projectId: 'p1' } },
      { kind: 'task', record: { id: 't2', projectId: 'p2' } },
      {
        kind: 'task',
        record: { id: 't3', projectId: 'p1', ...private_ },
      },
    ],
    index,
  );
  assert.deepEqual(kept, [{ kind: 'task', id: 't1' }]);
});

test('forgetting a private person leaves each child that inherited it with its own mark, but not one another private parent still covers', () => {
  const private_ = readPersonMark(NONE, true);
  const index = buildParentIndex(
    [{ id: 'p1', name: 'Surprise party', ...private_ }],
    [{ id: 'w1', name: 'Mom', ...private_ }],
    [],
  );
  const kept = planKeepOnLeaving(
    'who',
    'w1',
    [
      { kind: 'task', record: { id: 't1', whoIds: ['w1'] } },
      { kind: 'task', record: { id: 't2', whoIds: ['w1'], projectId: 'p1' } },
      { kind: 'fact', record: { id: 'f1', subjectIds: ['w1'] } },
    ],
    index,
  );
  assert.deepEqual(
    kept.map((entry) => entry.id),
    ['t1', 'f1'],
  );
});

const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const readCommands = (text: string, commands: Record<string, unknown>[]) => {
  const aliases = createAliasBook('t');
  aliases.add('task-1');
  return normalizeNomosReply(
    { commands },
    { reading: READING, aliases, captureText: text },
  ).commands;
};

const setPrivate = (isPrivate: boolean, requestQuote: string | null) => ({
  kind: 'setPrivate',
  taskAlias: 't1',
  isPrivate,
  requestQuote,
});

test('the model can mark a task private, and a release is kept only with the person words quoted', () => {
  assert.deepEqual(
    readCommands('keep the dentist task private', [setPrivate(true, null)]),
    [{ kind: 'setPrivate', taskId: 'task-1', isPrivate: true }],
  );
  assert.deepEqual(
    readCommands('the dentist task is not private anymore', [
      setPrivate(false, 'not private anymore'),
    ]),
    [{ kind: 'setPrivate', taskId: 'task-1', isPrivate: false }],
  );
  assert.deepEqual(readCommands('buy milk', [setPrivate(false, null)]), []);
  assert.deepEqual(
    readCommands('buy milk', [setPrivate(false, 'not private anymore')]),
    [],
  );
});

const seal = (fields: Record<string, unknown>) => ({
  nonce: 'n',
  ciphertext: JSON.stringify(fields),
  keyId: 'k',
  keyVersion: 1,
});

const planFor = (
  command: { isPrivate: boolean },
  existing: {
    privacyFacts?: PrivacyFacts;
    privateParents?: {
      id: string;
      name: string;
      facts: PrivacyFacts;
    }[];
  } = {},
) =>
  planWrites({
    commands: [{ kind: 'setPrivate', taskId: 'task-1', ...command }],
    existing: new Map([
      [
        'task-1',
        {
          status: 'open' as const,
          due: null,
          isUrgent: false,
          title: 'Dentist',
          whoIds: [],
          placeIds: [],
          sealed: { title: 'Dentist', notes: null, steps: {} },
          ...existing,
        },
      ],
    ]),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: () => 'new-1',
  });

test('the turn that marks a task private writes an effect with its Undo, and the execution is private', () => {
  const plan = planFor({ isPrivate: true });
  assert.equal(plan.effects.length, 1);
  assert.deepEqual(plan.effects[0], {
    written: {
      'sealed.title': 'Dentist',
      privacy: 'private',
      'sealed.privateMark': 'person',
      'sealed.isPrivacyCleared': false,
    },
    previous: {
      'sealed.title': 'Dentist',
      privacy: 'ordinary',
      'sealed.privateMark': null,
      'sealed.isPrivacyCleared': false,
    },
  });
  assert.equal(plan.isPrivate, true);
  assert.equal(plan.updates[0].data.privacy, 'private');
  assert.equal(plan.counts.updated, 1);
});

test('the Undo of that turn restores the class and the mark through the same Undo as any change', () => {
  const plan = planFor({ isPrivate: true });
  const undone = planUndo({
    original: {
      id: 'exec-1',
      privacy: 'private',
      said: null,
      captureId: 'turn-1',
      actor: 'nomos',
      category: 'organize',
      autonomyLevel: 2,
      state: 'succeeded',
      effectRefs: plan.effectRefs,
      linkedWhoIds: [],
      linkedPlaceIds: [],
      undoesExecutionId: null,
      undoneByExecutionId: null,
      questionRef: null,
      errorCode: null,
      createdAt: 1000,
      decidedAt: 1000,
      finishedAt: 1000,
      summary: 'Updated a task',
      effects: plan.effects,
      undoReport: null,
      spoken: null,
      goneIds: null,
      lines: [],
      isUnreadable: false,
    },
    targets: new Map([
      [
        'task-1',
        {
          docId: 'task-1',
          data: { privacy: 'private' },
          opened: {
            title: 'Dentist',
            notes: null,
            steps: {},
            privateMark: 'person',
            isPrivacyCleared: false,
          },
        },
      ],
    ]),
    undoExecutionId: 'undo-1',
    now: 6000,
    usedIds: new Set(),
  });
  assert.equal(undone.kind, 'write');
  if (undone.kind !== 'write') return;
  assert.equal(undone.updates[0].fields.privacy, 'ordinary');
  assert.equal(
    (undone.updates[0].reseal as { privateMark?: unknown } | null)?.privateMark,
    null,
  );
});

test('setPrivate on an inherited class writes nothing and says why', () => {
  const plan = planFor(
    { isPrivate: false },
    {
      privacyFacts: NONE,
      privateParents: [
        { id: 'p1', name: 'Surprise party', facts: readPersonMark(NONE, true) },
      ],
    },
  );
  assert.equal(plan.effects.length, 0);
  assert.deepEqual(plan.notKept, [buildInheritedLine('Surprise party')]);
  assert.equal(plan.isPrivate, true);
});

test('a task made with a health word is private and carries the reason, one without is not', () => {
  const made = (title: string) =>
    planWrites({
      commands: [
        {
          kind: 'createTask',
          ref: '$new1',
          title,
          due: null,
          isUrgent: false,
          whoRefs: [],
          placeRefs: [],
          projectRef: null,
        },
      ],
      existing: new Map(),
      captureId: 'capture-1',
      executionId: 'exec-1',
      now: 5000,
      seal: seal as never,
      newId: () => 'new-1',
    });
  const medicine = made('Take my medicine');
  assert.equal(medicine.creates[0].data.privacy, 'private');
  assert.equal(medicine.isPrivate, true);
  const milk = made('Buy milk');
  assert.equal(milk.creates[0].data.privacy, 'ordinary');
  assert.equal(milk.isPrivate, false);
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
