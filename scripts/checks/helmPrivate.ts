// Private things: each source of the class, what code may and may not change, the copy filter and the unattended turn.
import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import type { CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  sealForHelm,
  type HelmKey,
} from '../../functions/src/apps/helm/helmKey.ts';
import { buildHelmTools } from '../../functions/src/apps/helm/mcp/buildTools.ts';
import {
  planWrites,
  type KnownWhoState,
  type PeopleInput,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import {
  readAlreadyMade,
  readEarlierTurns,
} from '../../functions/src/apps/helm/sortHelmCapture.ts';
import { buildContext } from '../../functions/src/apps/helm/nomos/buildContext.ts';
import {
  maskContextRecords,
  toContextTask,
  type MaskedName,
} from '../../functions/src/apps/helm/nomos/unattended.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import { planUndo } from '../../src/apps/helm/nomos/planUndo.ts';
import {
  buildInheritedLine,
  buildOnItsPageLine,
  buildUnattendedReleaseLine,
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
  planCascade,
  planKeepOnLeaving,
  readRecordPrivacy,
  readNewRecordPrivacy,
  withParentFacts,
} from '../../src/apps/helm/utils/privacyParents.ts';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, run: () => void | Promise<void>) =>
  tests.push([name, run]);

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

test('a private task is named by its time of day, never its name or what it seems to be about', () => {
  assert.equal(
    readMaskedLabel({ windowLabel: 'morning' }),
    'a private task this morning',
  );
  assert.equal(
    readMaskedLabel({ windowLabel: 'evening' }),
    'a private task this evening',
  );
  assert.equal(readMaskedLabel({ windowLabel: null }), 'a private task');
  assert.equal(
    /medicine|health|care/i.test(readMaskedLabel({ windowLabel: 'morning' })),
    false,
  );
});

test('a private name left in a reply is replaced, an ordinary one is named as usual', () => {
  const names = [{ name: 'Metoprolol', label: 'a private task this morning' }];
  assert.equal(
    maskPrivateNames('Done: Metoprolol, and buy milk.', names),
    'Done: a private task this morning, and buy milk.',
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
    { title: 'Metoprolol' },
    { isOn, timeZone: 'UTC', names },
  );
  return { task, names };
};

test('in an unattended turn the model is given the label of a private task, never its name', () => {
  const { task, names } = contextOf(true, 'private');
  assert.equal(task.title, 'a private task this morning');
  assert.equal(JSON.stringify(task).includes('Metoprolol'), false);
  assert.deepEqual(names, [
    { name: 'Metoprolol', label: 'a private task this morning' },
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

test('the model can mark a task private, and either change is kept only with the person words quoted', () => {
  assert.deepEqual(
    readCommands('keep the dentist task private', [setPrivate(true, null)]),
    [],
  );
  assert.deepEqual(
    readCommands('keep the dentist task private', [
      setPrivate(true, 'keep the dentist task private'),
    ]),
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
    readCommands('buy milk', [setPrivate(true, 'keep it private')]),
    [],
  );
});

test('a release is kept only when the quote releases, and a mark only when it does not', () => {
  assert.deepEqual(
    readCommands('please keep that one private', [
      setPrivate(false, 'keep that one private'),
    ]),
    [],
  );
  assert.deepEqual(
    readCommands("that doesn't need to be private", [
      setPrivate(false, "that doesn't need to be private"),
    ]),
    [{ kind: 'setPrivate', taskId: 'task-1', isPrivate: false }],
  );
  assert.deepEqual(
    readCommands("it doesn't need to be private", [
      setPrivate(true, "it doesn't need to be private"),
    ]),
    [],
  );
  assert.deepEqual(
    readCommands('make it public', [setPrivate(false, 'make it public')]),
    [{ kind: 'setPrivate', taskId: 'task-1', isPrivate: false }],
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
      abilityOffer: null,
      awayZoneOffer: null,
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

test('a task made under a private project is stored private from the start, one under an ordinary project is not', () => {
  const project = (id: string, name: string, mark: 'health' | null) => ({
    id,
    name,
    emoji: null,
    whoRoles: {},
    roleNotes: {},
    milestoneState: {},
    milestoneTitles: {},
    sealed: { name, privateMark: mark, isPrivacyCleared: false },
  });
  const made = (projectRef: string) =>
    planWrites({
      commands: [
        {
          kind: 'createTask',
          ref: '$new1',
          title: 'Book the visit',
          due: null,
          isUrgent: false,
          whoRefs: [],
          placeRefs: [],
          projectRef,
        },
      ],
      existing: new Map(),
      existingProjects: [
        project('p1', 'Fertility plan', 'health'),
        project('p2', 'Garden', null),
      ],
      captureId: 'capture-1',
      executionId: 'exec-1',
      now: 5000,
      seal: seal as never,
      newId: () => 'new-1',
    });
  const inherited = made('Fertility plan');
  assert.equal(inherited.creates[0].data.privacy, 'private');
  assert.equal(inherited.isPrivate, true);
  assert.equal(made('Garden').creates[0].data.privacy, 'ordinary');
});

test('on an unattended turn every private record kind reaches the model as a label, and an ordinary one as itself', () => {
  const mask = (isOn: boolean) => ({
    isOn,
    names: [] as { name: string; label: string }[],
  });
  const input = {
    facts: [
      {
        id: 'f1',
        subject: 'Ann',
        statement: 'has a rash',
        by: 'said' as const,
        isPrivate: true,
        isSubjectPrivate: false,
      },
      {
        id: 'f2',
        subject: 'Dr Lee',
        statement: 'is kind',
        by: 'said' as const,
        isPrivate: true,
        isSubjectPrivate: true,
      },
      {
        id: 'f3',
        subject: 'Ann',
        statement: 'likes tea',
        by: 'said' as const,
        isPrivate: false,
        isSubjectPrivate: false,
      },
    ],
    selfFacts: [
      {
        id: 's1',
        kind: 'preference' as const,
        topic: 'meds',
        value: 'statin',
        statement: 'takes statin',
        by: 'said' as const,
        isPrivate: true,
      },
    ],
    keyDates: [
      {
        id: 'k1',
        who: 'Dr Lee',
        kind: 'custom',
        label: 'surgery',
        when: 'Mar 3',
        isPrivate: true,
      },
    ],
    upcoming: [
      { who: 'Dr Lee', what: 'surgery', on: '2026-03-03', isPrivate: true },
    ],
    projects: [
      {
        name: 'Fertility plan',
        milestones: [{ title: 'Clinic visit', date: null }],
        isPrivate: true,
      },
    ],
    topics: [
      { id: 't1', name: 'Therapy', path: 'Health › Therapy', isPrivate: true },
    ],
    notes: [
      { id: 'n1', title: 'Lab results', body: 'LDL high', isPrivate: true },
    ],
    procedures: [
      { id: 'p1', title: 'Wound care', stepCount: 3, isPrivate: true },
    ],
    focusedProcedure: {
      id: 'p1',
      title: 'Wound care',
      version: 1,
      blocks: [
        {
          groupId: null,
          name: null,
          steps: [{ id: 'a', text: 'Clean the cut', detail: null, order: 0 }],
        },
      ],
      isPrivate: true,
    },
    focusedTopic: {
      id: 't1',
      name: 'Therapy',
      version: 1,
      isPrivate: true,
      sections: [
        {
          id: 's',
          heading: null,
          markdown: 'Panic attacks',
          writtenBy: 'person' as const,
          noteIds: [],
        },
      ],
    },
    runs: [
      {
        id: 'r1',
        title: 'Wound care',
        forLabel: 'Sam',
        isOpen: true,
        doneCount: 0,
        total: 1,
        isPrivate: true,
        undone: [{ id: 'a', text: 'Clean the cut', group: null }],
      },
    ],
    synced: [
      {
        id: 'c1',
        connectorId: 'x',
        accountId: 'y',
        kind: 'event',
        category: null,
        title: 'Clinic with Dr Lee',
        subtitle: 'Room 4',
        startAt: 1,
        endAt: null,
        dueAt: null,
        isAllDay: false,
        isEnded: false,
        detail: 'bring forms',
        placeLabel: 'Clinic',
        amountCents: 500,
        currency: 'USD',
        extra: {},
        asOf: null,
        isPrivate: true,
      },
    ],
  };
  const on = mask(true);
  const out = maskContextRecords(on, input as never);
  const seen = JSON.stringify(out);
  [
    'Sam',
    'rash',
    'Dr Lee',
    'statin',
    'surgery',
    'Fertility',
    'Clinic visit',
    'Therapy',
    'Lab results',
    'LDL',
    'Wound care',
    'Clean the cut',
    'Panic',
    'Room 4',
    'bring forms',
    'Mar 3',
  ].forEach((word) => assert.ok(!seen.includes(word), `${word} leaked`));
  assert.ok(seen.includes('likes tea') && seen.includes('Ann'));
  assert.ok(on.names.some((entry) => entry.name === 'LDL high'));
  const off = mask(false);
  assert.equal(
    JSON.stringify(maskContextRecords(off, input as never)).includes(
      'Wound care',
    ),
    true,
  );
  assert.equal(off.names.length, 0);
});

test('a private record read on an ordinary turn is remembered so an answer that quotes it marks the turn', () => {
  const mask = {
    isOn: false,
    names: [] as { name: string; label: string }[],
    quoted: [] as { name: string; label: string }[],
  };
  const out = maskContextRecords(mask, {
    notes: [
      { id: 'n1', title: 'Lab results', body: 'LDL high', isPrivate: true },
    ],
    synced: [],
  } as never);
  assert.equal(out.notes?.[0].title, 'Lab results');
  assert.equal(mask.names.length, 0);
  const quoting = (text: string) =>
    maskPrivateNames(text, mask.quoted) !== text;
  assert.equal(quoting('Your Lab results say LDL high.'), true);
  assert.equal(quoting('Nothing private here.'), false);
});

const HELM_KEY: HelmKey = {
  keyId: 'k',
  keyVersion: 1,
  key: Buffer.alloc(32, 7),
};

const planOf = (
  commands: Record<string, unknown>[],
  options: {
    task?: Record<string, unknown>;
    isUnattended?: boolean;
    known?: KnownWhoState[];
    mentions?: PeopleInput['mentions'];
  } = {},
) => {
  const people: PeopleInput | undefined = options.known && {
    mentions: options.mentions ?? [],
    places: [],
    known: options.known,
    knownPlaces: [],
    assistantName: null,
    assistantNames: [],
    dayKey: '2026-11-10',
    capturedAt: 4000,
  };
  return planWrites({
    commands: commands as never,
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
          ...options.task,
        },
      ],
    ]),
    people,
    isUnattended: options.isUnattended,
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: () => 'new-1',
  });
};

const PRIVATE_WHO = (id: string): KnownWhoState => ({
  id,
  kind: 'person',
  name: 'Mom',
  aliases: [],
  lastMentionedAt: null,
  tier: 'passing',
  tierSetBy: 'nomos',
  mentionDayKeys: [],
  taskLinkCount: 0,
  yearlyDateCount: 0,
  momentCount: 0,
  hasRole: false,
  privacyFacts: readPersonMark(NONE, true),
});

test('a turn cannot clear a mark code set, and says to change it on its page', () => {
  const plan = planOf(
    [{ kind: 'setPrivate', taskId: 'task-1', isPrivate: false }],
    {
      task: {
        privacy: 'private',
        privacyFacts: mark('Take my medicine'),
      },
    },
  );
  assert.equal(plan.effects.length, 0);
  assert.deepEqual(plan.notKept, [buildOnItsPageLine()]);
  assert.equal(plan.isPrivate, true);
});

test('nothing is made not private on an unattended turn, though the same words release a person mark when attended', () => {
  const task = {
    privacy: 'private',
    privacyFacts: readPersonMark(NONE, true),
  };
  const release = [{ kind: 'setPrivate', taskId: 'task-1', isPrivate: false }];
  const unattended = planOf(release, { task, isUnattended: true });
  assert.equal(unattended.effects.length, 0);
  assert.deepEqual(unattended.notKept, [buildUnattendedReleaseLine()]);
  const attended = planOf(release, { task, isUnattended: false });
  assert.equal(attended.effects.length, 1);
  assert.equal(attended.effects[0].written.privacy, 'ordinary');
});

test('a task private only through its stored class stays private when it is completed', () => {
  const plan = planOf([{ kind: 'completeTask', taskId: 'task-1' }], {
    task: { privacy: 'private' },
  });
  assert.equal(plan.isPrivate, true);
  assert.equal(
    planOf([{ kind: 'completeTask', taskId: 'task-1' }]).isPrivate,
    false,
  );
});

test('linking a private person to a task makes it private with an Undo that restores it', () => {
  const plan = planOf(
    [
      {
        kind: 'updateTask',
        taskId: 'task-1',
        title: null,
        hasDue: false,
        due: null,
        isUrgent: null,
        whoRefs: ['$w1'],
        placeRefs: [],
      },
    ],
    {
      known: [PRIVATE_WHO('who-1')],
      mentions: [
        {
          ref: '$w1',
          name: 'Mom',
          kind: 'person',
          relation: null,
          species: null,
          organizationKind: null,
        },
      ],
    },
  );
  assert.equal(plan.effects[0].written.privacy, 'private');
  assert.equal(plan.effects[0].previous?.privacy, 'ordinary');
  assert.equal(plan.updates[0].data.privacy, 'private');
  assert.equal(plan.isPrivate, true);
});

test('retitling a task with a health word marks it private, with the reason', () => {
  const plan = planOf([
    {
      kind: 'updateTask',
      taskId: 'task-1',
      title: 'Take my medicine',
      hasDue: false,
      due: null,
      isUrgent: null,
      whoRefs: [],
      placeRefs: [],
    },
  ]);
  assert.equal(plan.effects[0].written['sealed.privateMark'], 'health');
  assert.equal(plan.effects[0].written.privacy, 'private');
  assert.equal(plan.isPrivate, true);
});

test('make this and keep it private starts the new task private', () => {
  const plan = planOf([
    {
      kind: 'createTask',
      ref: '$new1',
      title: 'Plan the surprise',
      due: null,
      isUrgent: false,
      whoRefs: [],
      placeRefs: [],
      projectRef: null,
    },
    { kind: 'setPrivate', taskId: '$new1', isPrivate: true },
  ]);
  assert.equal(plan.creates[0].data.privacy, 'private');
  assert.equal(plan.isPrivate, true);
});

test('a cascade takes the parent facts from the write, never the store', () => {
  const stale = buildParentIndex([], [{ id: 'w1', name: 'Mom', ...NONE }], []);
  const fresh = withParentFacts(stale, 'who', 'w1', readPersonMark(NONE, true));
  const child = {
    kind: 'task' as const,
    record: { id: 't1', whoIds: ['w1'], privacy: 'ordinary' as const },
  };
  assert.deepEqual(planCascade([child], stale), []);
  assert.deepEqual(planCascade([child], fresh), [
    { kind: 'task', id: 't1', privacy: 'private' },
  ]);
  assert.equal(stale.who.get('w1')?.facts.privateMark, null);
});

test('a child with a parent that cannot be read is not made ordinary, and a record with no parent has nothing to cascade', () => {
  const index = buildParentIndex([], [], []);
  assert.deepEqual(
    planCascade(
      [
        {
          kind: 'task',
          record: { id: 't1', whoIds: ['gone'], privacy: 'private' },
        },
        { kind: 'task', record: { id: 't2', privacy: 'private' } },
      ],
      index,
    ),
    [{ kind: 'task', id: 't2', privacy: 'ordinary' }],
  );
});

test('a new fact about a private person starts private, and a new task takes the class of its parents and words', () => {
  const private_ = readPersonMark(NONE, true);
  const index = buildParentIndex(
    [],
    [{ id: 'w1', name: 'Mom', ...private_ }],
    [],
  );
  const fact = readNewRecordPrivacy(
    'fact',
    { id: '', subjectIds: ['w1'] },
    'likes tea',
    index,
  );
  assert.equal(fact.privacy, 'private');
  const task = readNewRecordPrivacy(
    'task',
    { id: '' },
    'Take my medicine',
    index,
  );
  assert.equal(task.privacy, 'private');
  assert.equal(task.facts.privateMark, 'health');
  assert.equal(
    readNewRecordPrivacy('task', { id: '' }, 'Buy milk', index).privacy,
    'ordinary',
  );
});

const UNATTENDED = () => ({
  isOn: true,
  timeZone: 'UTC',
  names: [] as MaskedName[],
  quoted: [] as MaskedName[],
});

test('a tool result on an unattended turn names a private task by its time of day and pushes its name into the mask', async () => {
  const makeDoc = (id: string, title: string, privacy: string) => ({
    id,
    data: () => ({
      status: 'open',
      due: null,
      createdAt: 1000,
      privacy,
      sealed: sealForHelm(HELM_KEY, { title }),
    }),
  });
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => ({
      docs: [
        makeDoc('a', 'Metoprolol refill', 'private'),
        makeDoc('b', 'Metoprolol is not a word here', 'ordinary'),
      ],
    }),
  };
  const run = async (mask: ReturnType<typeof UNATTENDED> | undefined) => {
    const tools = buildHelmTools({
      uid: 'u1',
      key: HELM_KEY,
      aliases: createAliasBook('t'),
      timeZone: 'UTC',
      firestore: { collection: () => query } as never,
      mask,
    });
    const found = (await tools
      .find((tool) => tool.name === 'search_tasks')
      ?.run({ query: 'metoprolol', includeDone: false } as never)) as {
      tasks: { title: string }[];
    };
    return found.tasks.map((task) => task.title);
  };
  const mask = UNATTENDED();
  const masked = await run(mask);
  assert.ok(masked.includes('a private task'));
  assert.ok(masked.includes('Metoprolol is not a word here'));
  assert.ok(!masked.some((title) => title.includes('refill')));
  assert.deepEqual(mask.names, [
    { name: 'Metoprolol refill', label: 'a private task' },
  ]);
  const attended = await run({ ...UNATTENDED(), isOn: false });
  assert.ok(attended.includes('Metoprolol refill'));
});

test('earlier turns and already-made lines that touch something private are labelled, and their words join the mask', async () => {
  const sealedDoc = (fields: Record<string, unknown>) =>
    sealForHelm(HELM_KEY, fields);
  const docs = {
    'exec-1': {
      privacy: 'private',
      effectRefs: [{ op: 'create', collection: 'tasks', docId: 't1' }],
      sealed: sealedDoc({
        summary: 'Made Metoprolol refill',
        effects: [{ written: { 'sealed.title': 'Metoprolol refill' } }],
      }),
    },
  };
  const firestore = {
    doc: (path: string) => ({
      get: async () => ({
        data: () => docs[path.split('/').pop() as keyof typeof docs],
      }),
    }),
    collection: () => {
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        get: async () => ({
          docs: [
            {
              id: 'c1',
              data: () => ({
                turnIndex: 0,
                sessionId: 's',
                executionIds: ['exec-1'],
                sealed: sealedDoc({
                  text: 'remind me about my metoprolol refill',
                }),
              }),
            },
          ],
        }),
      };
      return query;
    },
  };
  const mask = UNATTENDED();
  const turns = await readEarlierTurns(
    firestore as never,
    'apps/helm/users/u1',
    HELM_KEY,
    { sessionId: 's', turnIndex: 1 } as never,
    mask,
  );
  assert.equal(turns[0].said, 'Something private was said.');
  assert.equal(turns[0].did, 'Something private was done.');
  assert.ok(mask.names.some((entry) => entry.name.includes('metoprolol')));
  const made = await readAlreadyMade(
    firestore as never,
    'apps/helm/users/u1',
    HELM_KEY,
    ['exec-1'],
    UNATTENDED(),
  );
  assert.deepEqual(made, ['a private task']);
});

test('a topic under a private ancestor shows the masked path on an unattended turn', () => {
  const mask = UNATTENDED();
  const out = maskContextRecords(mask, {
    topics: [
      {
        id: 't1',
        name: 'Recipes',
        path: 'Therapy > Recipes',
        maskedPath: 'a private topic > Recipes',
      },
    ],
    synced: [],
  } as never);
  assert.equal(out.topics?.[0].path, 'a private topic > Recipes');
  const off = maskContextRecords({ ...UNATTENDED(), isOn: false }, {
    topics: [
      {
        id: 't1',
        name: 'Recipes',
        path: 'Therapy > Recipes',
        maskedPath: 'a private topic > Recipes',
      },
    ],
    synced: [],
  } as never);
  assert.equal(off.topics?.[0].path, 'Therapy > Recipes');
});

test('the message the model reads over masked inputs holds no private word', () => {
  const mask = UNATTENDED();
  const masked = maskContextRecords(mask, {
    facts: [
      {
        id: 'f1',
        subject: 'Dr. Chen',
        statement: 'prescribed Metoprolol',
        by: 'said',
        isPrivate: true,
        isSubjectPrivate: true,
      },
    ],
    notes: [
      { id: 'n1', title: 'Lab results', body: 'LDL high', isPrivate: true },
    ],
    synced: [],
  } as never);
  const { message } = buildContext({
    text: 'what is on my plate',
    reading: READING,
    createdAt: Date.UTC(2026, 10, 10, 12),
    timeZone: 'UTC',
    tasks: [
      toContextTask(
        'task-1',
        { privacy: 'private', due: null },
        { title: 'Metoprolol refill' },
        mask,
      ),
    ],
    facts: masked.facts,
    notes: masked.notes,
  });
  ['Metoprolol', 'Chen', 'Lab results', 'LDL'].forEach((word) =>
    assert.ok(!message.includes(word), `${word} reached the message`),
  );
  assert.ok(message.includes('a private task'));
});

const failures = (
  await Promise.all(
    tests.map(async ([name, run]) => {
      try {
        await run();
        console.log(`ok   ${name}`);
        return [];
      } catch (error) {
        console.error(
          `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
        );
        return [name];
      }
    }),
  )
).flat();
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
