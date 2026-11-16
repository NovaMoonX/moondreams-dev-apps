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
  buildExecution,
  planWrites,
  settleCapture,
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
import { buildQuietLine } from '../../functions/src/apps/helm/nomos/summaries.ts';
import {
  buildQuietIndex,
  isQuietTurn,
} from '../../functions/src/apps/helm/nomos/quietTurn.ts';
import {
  readActiveProjects,
  readQuietProjects,
  toContextProjects,
} from '../../functions/src/apps/helm/projectStore.ts';
import { planUndo } from '../../src/apps/helm/nomos/planUndo.ts';
import {
  buildInheritedLine,
  buildOnItsPageLine,
  buildUnattendedReleaseLine,
  buildLeftOutLine,
  filterPrivate,
  filterPrivateOwnPage,
  holdQuietSpoken,
  isPrivateInEffect,
  isQuietOn,
  isUnattendedTurn,
  maskPrivateNames,
  mentionsQuietName,
  QUIET_SPOKEN_LINE,
  readDerivedPrivacy,
  readEffectivePrivacy,
  readMaskedLabel,
  readPersonMark,
  readPrivateMark,
  readPrivacy,
  readSetPrivate,
  readSetQuiet,
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

const makeIdCounter = () => {
  const made = { count: 0 };
  return () => {
    made.count += 1;
    return `id-${made.count}`;
  };
};

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
    today: '2026-11-16',
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
    readSetPrivate({
      current: NONE,
      isPrivate: false,
      parents: [],
      today: '2026-11-16',
    }).kind,
    'unchanged',
  );
  const on = readSetPrivate({
    current: NONE,
    isPrivate: true,
    parents: [],
    today: '2026-11-16',
  });
  assert.equal(on.kind, 'applied');
  assert.equal(
    readSetPrivate({
      current: readPersonMark(NONE, true),
      isPrivate: true,
      parents: [],
      today: '2026-11-16',
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
      via: null,
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
      heldSpoken: null,
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
            quietMark: null,
            quietUntil: null,
            isQuietCleared: false,
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

test('list_topics, as an outside assistant reads it with the mask always on, labels a private topic and never returns its name', async () => {
  const doc = (id: string, name: string, privacy: string) => ({
    id,
    data: () => ({
      privacy,
      version: 1,
      depth: 1,
      sealed: sealForHelm(HELM_KEY, { name, sections: [] }),
    }),
  });
  const run = async (mask: ReturnType<typeof UNATTENDED>) => {
    const tools = buildHelmTools({
      uid: 'u1',
      key: HELM_KEY,
      aliases: createAliasBook('t'),
      timeZone: 'UTC',
      firestore: {
        collection: () => ({
          limit: () => ({
            get: async () => ({
              docs: [
                doc('a', 'Mom medication plan', 'private'),
                doc('b', 'Packing list', 'ordinary'),
              ],
            }),
          }),
        }),
      } as never,
      topicRead: {
        topics: createAliasBook('tp'),
        sections: createAliasBook('s'),
        versions: new Map(),
      },
      mask,
    });
    const found = (await tools
      .find((tool) => tool.name === 'list_topics')
      ?.run({} as never)) as { topics: { name: string }[] };
    return found.topics.map((topic) => topic.name);
  };
  const masked = await run(UNATTENDED());
  assert.deepEqual(masked, ['a private topic', 'Packing list']);
  const attended = await run({ ...UNATTENDED(), isOn: false });
  assert.ok(attended.includes('Mom medication plan'));
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

const DAY = '2026-11-16';
const quiet = (
  facts: PrivacyFacts,
  over: Partial<Parameters<typeof readSetQuiet>[0]> = {},
) =>
  readSetQuiet({
    current: facts,
    isQuiet: true,
    until: null,
    mark: 'person',
    parents: [],
    today: DAY,
    ...over,
  });

test('keeping a thing quiet makes it private, and releasing it leaves it private', () => {
  const kept = quiet(NONE);
  assert.equal(kept.kind, 'applied');
  if (kept.kind !== 'applied') return;
  assert.equal(kept.facts.privateMark, 'person');
  assert.equal(kept.facts.quietMark, 'person');
  const released = quiet(kept.facts, { isQuiet: false });
  assert.equal(released.kind, 'applied');
  if (released.kind !== 'applied') return;
  assert.equal(released.facts.quietMark, null);
  assert.equal(released.facts.isQuietCleared, true);
  assert.equal(released.facts.privateMark, 'person');
  assert.equal(readEffectivePrivacy(released.facts, []), 'private');
});

test('a quiet release is refused on an inherited quiet and while nobody is looking', () => {
  const marked: PrivacyFacts = {
    ...NONE,
    privateMark: 'person',
    quietMark: 'person',
  };
  const inherited = quiet(NONE, {
    isQuiet: false,
    parents: [{ id: 'p1', name: 'Anniversary trip', facts: marked }],
  });
  assert.equal(inherited.kind, 'refused');
  const unattended = quiet(marked, {
    isQuiet: false,
    byTurn: { isUnattended: true },
  });
  assert.equal(unattended.kind, 'refused');
});

test('a guess never re-marks a release or changes a person mark, and the end day is included', () => {
  const released: PrivacyFacts = { ...NONE, isQuietCleared: true };
  assert.equal(quiet(released, { mark: 'guessed' }).kind, 'unchanged');
  const person: PrivacyFacts = {
    ...NONE,
    privateMark: 'person',
    quietMark: 'person',
    quietUntil: '2026-11-20',
  };
  assert.equal(
    quiet(person, { mark: 'guessed', until: '2026-11-30', today: '2026-11-18' })
      .kind,
    'unchanged',
  );
  const lapsed = quiet(person, {
    mark: 'guessed',
    until: '2026-11-30',
    today: '2026-11-25',
  });
  assert.equal(lapsed.kind, 'applied');
  if (lapsed.kind === 'applied') {
    assert.equal(lapsed.facts.quietMark, 'person');
  }
  assert.equal(isQuietOn(person, '2026-11-20'), true);
  assert.equal(isQuietOn(person, '2026-11-21'), false);
});

test('a quiet turn says only the screen line and holds its own, anything else is said as it is', () => {
  assert.deepEqual(holdQuietSpoken('Made a task for the ring.', true), {
    spoken: QUIET_SPOKEN_LINE,
    heldSpoken: 'Made a task for the ring.',
  });
  assert.deepEqual(holdQuietSpoken('Made a task for the ring.', false), {
    spoken: 'Made a task for the ring.',
    heldSpoken: null,
  });
  assert.deepEqual(holdQuietSpoken(null, true), {
    spoken: null,
    heldSpoken: null,
  });
  assert.deepEqual(holdQuietSpoken(QUIET_SPOKEN_LINE, true), {
    spoken: QUIET_SPOKEN_LINE,
    heldSpoken: null,
  });
});

test('a quiet name is found as a whole word in any case, and a part of another word is not', () => {
  assert.equal(
    mentionsQuietName('Added it to the anniversary trip', ['Anniversary trip']),
    true,
  );
  assert.equal(mentionsQuietName('The ringing stopped', ['Ring']), false);
  assert.equal(mentionsQuietName('Anything', ['', '  ']), false);
});

const quietReply = (text: string, items: Record<string, unknown>[]) => {
  const aliases = createAliasBook('t');
  aliases.add('task-1');
  const projects = createAliasBook('p');
  projects.add('project-1');
  return normalizeNomosReply(
    { commands: items },
    {
      reading: READING,
      aliases,
      projectAliases: projects,
      captureText: text,
    },
  );
};

const setQuiet = (
  targetAlias: string,
  extra: Record<string, unknown> = {},
) => ({
  kind: 'setQuiet',
  targetAlias,
  isQuiet: true,
  untilSpanId: null,
  isGuess: false,
  requestQuote: null,
  ...extra,
});

test('a quiet request is kept with a quote copied from the capture, whatever words it holds', () => {
  const words = "don't let Sam hear about the ring";
  const kept = quietReply(words, [setQuiet('t1', { requestQuote: words })]);
  assert.deepEqual(kept.quietCommands, [
    {
      kind: 'setQuiet',
      targetKind: 'task',
      targetId: 'task-1',
      isNew: false,
      isQuiet: true,
      until: null,
      isUntilUnread: false,
      isGuess: false,
    },
  ]);
  const invented = quietReply(words, [
    setQuiet('t1', { requestQuote: 'keep it quiet' }),
  ]);
  assert.deepEqual(invented.quietCommands, []);
  assert.deepEqual(invented.quietDropped, ['quiet-unquoted']);
});

test('a guess may only keep quiet and needs no quote, a guessed release is dropped', () => {
  const guessed = quietReply('buy a ring for Sam', [
    setQuiet('p1', { isGuess: true }),
  ]);
  assert.equal(guessed.quietCommands.length, 1);
  assert.equal(guessed.quietCommands[0].targetKind, 'project');
  assert.equal(guessed.quietCommands[0].isGuess, true);
  const release = quietReply('buy a ring for Sam', [
    setQuiet('p1', { isGuess: true, isQuiet: false }),
  ]);
  assert.deepEqual(release.quietCommands, []);
  assert.deepEqual(release.quietDropped, ['quiet-guess-release']);
  assert.deepEqual(
    quietReply('x', [setQuiet('t9', { isGuess: true })]).quietDropped,
    ['quiet-unknown-target'],
  );
});

const quietProject = (name: string) => ({
  kind: 'createProject' as const,
  ref: '$new1',
  name,
  emoji: null,
  objective: null,
  targetDate: null,
});

const quietCommand = (over: Record<string, unknown>) => ({
  kind: 'setQuiet' as const,
  targetKind: 'project' as const,
  targetId: '$new1',
  isNew: true,
  isQuiet: true,
  until: '2026-12-01',
  isUntilUnread: false,
  isGuess: true,
  ...over,
});

test('a project made quiet in the same reply is stored quiet and private, with its tasks private', () => {
  const plan = planWrites({
    commands: [
      {
        kind: 'createTask',
        ref: '$new2',
        title: 'Book the table',
        due: null,
        isUrgent: false,
        whoRefs: [],
        placeRefs: [],
        projectRef: 'Anniversary trip',
      },
    ],
    projectCommands: [quietProject('Anniversary trip')],
    quietCommands: [quietCommand({}) as never],
    today: DAY,
    existing: new Map(),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: makeIdCounter(),
  });
  assert.equal(plan.projectCreates.length, 1);
  const [made] = plan.projectCreates;
  assert.equal(made.data.privacy, 'private');
  const sealed = JSON.parse(
    (made.data.sealed as { ciphertext: string }).ciphertext,
  );
  assert.equal(sealed.quietMark, 'guessed');
  assert.equal(sealed.quietUntil, '2026-12-01');
  assert.equal(sealed.privateMark, 'person');
  assert.equal(plan.creates[0].data.privacy, 'private');
  assert.equal(plan.isQuiet, true);
  assert.deepEqual(plan.quietLines, [
    'Kept Anniversary trip quiet: it sounded like a surprise',
  ]);
});

test('an end day that cannot be read keeps it quiet until released, and says so', () => {
  const words = "don't let Sam hear about the ring";
  const kept = quietReply(words, [
    setQuiet('t1', { requestQuote: words, untilSpanId: 'nowhere' }),
  ]);
  assert.equal(kept.quietCommands[0]?.until, null);
  assert.equal(kept.quietCommands[0]?.isUntilUnread, true);
  assert.equal(
    buildQuietLine({
      name: 'Gift',
      isQuiet: true,
      isGuess: false,
      isUntilUnread: true,
    }),
    'Kept Gift quiet until you turn it off',
  );
});

test('a project with more things than fit says how many are not private yet', () => {
  const plan = planWrites({
    commands: [],
    quietCommands: [
      quietCommand({
        targetId: 'project-1',
        isNew: false,
        isGuess: false,
        until: null,
      }) as never,
    ],
    today: DAY,
    existingProjects: [
      {
        id: 'project-1',
        name: 'Anniversary trip',
        emoji: null,
        whoRoles: {},
        roleNotes: {},
        milestoneState: {},
        milestoneTitles: {},
        sealed: { name: 'Anniversary trip' },
      },
    ],
    projectChildren: new Map([
      [
        'project-1',
        {
          isMore: false,
          children: Array.from({ length: 400 }, (_, index) => ({
            kind: 'task' as const,
            id: `task-${index}`,
            title: `Task ${index}`,
            privacy: null,
          })),
        },
      ],
    ]),
    existing: new Map(),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: () => 'new-1',
  });
  assert.equal(plan.quietLines.length, 2);
  assert.equal(
    plan.quietLines[1],
    "100 of Anniversary trip's things aren't private yet",
  );
  assert.equal(plan.updates.length, 300);
  assert.equal(plan.effectRefs.length, 40);
});

test('keeping a stored project quiet writes an Undo effect and makes its open tasks private', () => {
  const plan = planWrites({
    commands: [],
    quietCommands: [
      quietCommand({
        targetId: 'project-1',
        isNew: false,
        isGuess: false,
        until: null,
      }) as never,
    ],
    today: DAY,
    existingProjects: [
      {
        id: 'project-1',
        name: 'Anniversary trip',
        emoji: null,
        whoRoles: {},
        roleNotes: {},
        milestoneState: {},
        milestoneTitles: {},
        sealed: { name: 'Anniversary trip' },
      },
    ],
    projectChildren: new Map([
      [
        'project-1',
        {
          isMore: false,
          children: [
            {
              kind: 'task' as const,
              id: 'task-9',
              title: 'Book flights',
              privacy: null,
            },
          ],
        },
      ],
    ]),
    existing: new Map(),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: () => 'new-1',
  });
  assert.deepEqual(
    plan.effectRefs.map((ref) => `${ref.op}:${ref.collection}:${ref.docId}`),
    ['update:projects:project-1', 'update:tasks:task-9'],
  );
  const [project] = plan.effects;
  assert.equal(project.written['sealed.quietMark'], 'person');
  assert.equal(project.previous?.['sealed.quietMark'], null);
  assert.equal(project.previous?.privacy, 'ordinary');
  assert.equal(plan.projectUpdates[0].data.privacy, 'private');
  assert.equal(plan.updates[0].data.privacy, 'private');
  assert.deepEqual(plan.quietLines, ['Kept Anniversary trip quiet']);
});

test('a quiet turn swaps its spoken line for the screen line and keeps the real one', () => {
  const plan = planWrites({
    commands: [
      {
        kind: 'createTask',
        ref: '$new1',
        title: 'Pick up the ring',
        due: null,
        isUrgent: false,
        whoRefs: [],
        placeRefs: [],
        projectRef: null,
      },
    ],
    quietCommands: [
      quietCommand({
        targetKind: 'task',
        isGuess: false,
        until: null,
      }) as never,
    ],
    today: DAY,
    existing: new Map(),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: () => 'new-1',
  });
  assert.equal(plan.creates[0].data.privacy, 'private');
  const build = (isQuiet: boolean) =>
    JSON.parse(
      (
        buildExecution(plan, {
          captureId: 'capture-1',
          now: 5000,
          seal: seal as never,
          commands: [],
          inputMode: 'voice',
          isQuiet,
        }).sealed as { ciphertext: string }
      ).ciphertext,
    );
  const held = build(true);
  assert.equal(held.spoken, QUIET_SPOKEN_LINE);
  assert.ok(String(held.heldSpoken).includes('Pick up the ring'));
  const loud = build(false);
  assert.equal(loud.heldSpoken, null);
  assert.ok(String(loud.spoken).includes('Pick up the ring'));
  const settled = settleCapture({
    mode: 'full',
    filed: 1,
    hasMore: false,
    executionId: 'exec-1',
    now: 5000,
    newId: () => 'q',
    opened: { text: 'x' },
    questionState: {},
    executionIds: [],
    line: 'The ring is on your list.',
    isQuiet: true,
  });
  assert.deepEqual((settled.sealed as { spoken?: unknown }).spoken, {
    text: QUIET_SPOKEN_LINE,
    priority: 'reply',
    builtBy: 'code',
    heldText: 'The ring is on your list.',
  });
});

test('a turn is quiet when a command, a touched record, an answer source, a name or the model says so', () => {
  const index = buildQuietIndex([
    { kind: 'project', id: 'p1', name: 'Anniversary trip', isQuiet: true },
    { kind: 'task', id: 't1', name: 'Dentist', isQuiet: false },
  ]);
  const turn = (over: Partial<Parameters<typeof isQuietTurn>[0]> = {}) =>
    isQuietTurn({
      index,
      hasQuietCommand: false,
      touchesQuiet: false,
      keepQuiet: false,
      sourceKeys: [],
      texts: ['Moved the dentist visit.'],
      ...over,
    });
  assert.equal(turn(), false);
  assert.equal(turn({ hasQuietCommand: true }), true);
  assert.equal(turn({ touchesQuiet: true }), true);
  assert.equal(turn({ keepQuiet: true }), true);
  assert.equal(turn({ sourceKeys: ['project:p1'] }), true);
  assert.equal(turn({ sourceKeys: ['task:t1'] }), false);
  assert.equal(turn({ texts: ['Added to Anniversary trip.'] }), true);
  assert.equal(
    isQuietTurn({
      index: buildQuietIndex([], true),
      hasQuietCommand: false,
      touchesQuiet: false,
      keepQuiet: false,
      sourceKeys: [],
      texts: ['Moved the dentist visit.'],
    }),
    true,
  );
});

const quietPlan = (
  children: {
    kind: 'task' | 'note' | 'topic';
    id: string;
    title: string;
    privacy: string | null;
  }[],
  isMore = false,
) =>
  planWrites({
    commands: [],
    quietCommands: [
      quietCommand({
        targetId: 'project-1',
        isNew: false,
        isGuess: false,
        until: null,
      }) as never,
    ],
    today: DAY,
    existingProjects: [
      {
        id: 'project-1',
        name: 'Anniversary',
        emoji: null,
        whoRoles: {},
        roleNotes: {},
        milestoneState: {},
        milestoneTitles: {},
        sealed: { name: 'Anniversary' },
      },
    ],
    projectChildren: new Map([['project-1', { isMore, children }]]),
    existing: new Map(),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: () => 'new-1',
  });

test('keeping a project quiet makes a done task, a linked note and a topic private, and the line says nothing when all of it happened', () => {
  const plan = quietPlan([
    { kind: 'task', id: 'task-done', title: 'Paid deposit', privacy: null },
    { kind: 'note', id: 'note-1', title: 'Ring ideas', privacy: null },
    { kind: 'topic', id: 'topic-1', title: 'Gifts', privacy: null },
    {
      kind: 'task',
      id: 'task-own',
      title: 'Already private',
      privacy: 'private',
    },
  ]);
  assert.deepEqual(
    plan.effectRefs.map((ref) => `${ref.collection}:${ref.docId}`),
    ['projects:project-1', 'tasks:task-done', 'notes:note-1'],
  );
  assert.deepEqual(
    plan.updates.map((entry) => [entry.id, entry.data.privacy]),
    [['task-done', 'private']],
  );
  assert.equal(
    plan.noteUpdates.find((entry) => entry.id === 'note-1')?.data.privacy,
    'private',
  );
  assert.deepEqual(plan.topicPrivacyUpdates, [
    { id: 'topic-1', data: { privacy: 'private' } },
  ]);
  assert.deepEqual(plan.quietLines, ['Kept Anniversary quiet']);
});

test('a project read that stopped at its limit says some things are not private yet', () => {
  const plan = quietPlan(
    [{ kind: 'task', id: 'task-1', title: 'Book', privacy: null }],
    true,
  );
  assert.equal(
    plan.quietLines[1],
    "Some of Anniversary's things aren't private yet",
  );
});

test('a new task kept quiet keeps the health mark code gave it', () => {
  const plan = planWrites({
    commands: [
      {
        kind: 'createTask',
        ref: '$new1',
        title: 'Refill my prescription',
        due: null,
        isUrgent: false,
        whoRefs: [],
        placeRefs: [],
        projectRef: null,
      },
    ] as never,
    quietCommands: [
      quietCommand({
        targetKind: 'task',
        targetId: '$new1',
        isNew: true,
        isGuess: false,
        until: null,
      }) as never,
    ],
    today: DAY,
    existing: new Map(),
    captureId: 'capture-1',
    executionId: 'exec-1',
    now: 5000,
    seal: seal as never,
    newId: () => 'new-1',
  });
  const sealed = JSON.parse(
    (plan.creates[0].data.sealed as { ciphertext: string }).ciphertext,
  ) as Record<string, unknown>;
  assert.equal(sealed.privateMark, 'health');
  assert.equal(sealed.quietMark, 'person');
});

test('a quiet task a tool returns joins the turn quiet set, by its own mark or its project', async () => {
  const doc = (id: string, over: Record<string, unknown>, own: object) => ({
    id,
    data: () => ({
      status: 'open',
      due: null,
      createdAt: 1000,
      privacy: 'ordinary',
      projectId: null,
      ...over,
      sealed: sealForHelm(HELM_KEY, { title: `Ring ${id}`, ...own }),
    }),
  });
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    get: async () => ({
      docs: [
        doc('own', {}, { quietMark: 'person', privateMark: 'person' }),
        doc('child', { projectId: 'p-quiet' }, {}),
        doc('plain', {}, {}),
      ],
    }),
  };
  const index = buildQuietIndex([]);
  const found = (await buildHelmTools({
    uid: 'u1',
    key: HELM_KEY,
    aliases: createAliasBook('t'),
    timeZone: 'UTC',
    firestore: { collection: () => query } as never,
    quiet: {
      today: DAY,
      isUnderQuietProject: (id) => id === 'p-quiet',
      found: index,
    },
  })
    .find((tool) => tool.name === 'search_tasks')
    ?.run({ query: 'ring', includeDone: false } as never)) as {
    tasks: { title: string; isQuiet?: boolean }[];
  };
  assert.deepEqual(
    found.tasks.map((task) => [task.title, task.isQuiet === true]),
    [
      ['Ring own', true],
      ['Ring child', true],
      ['Ring plain', false],
    ],
  );
  const turn = (over: Partial<Parameters<typeof isQuietTurn>[0]>) =>
    isQuietTurn({
      index,
      hasQuietCommand: false,
      touchesQuiet: false,
      keepQuiet: false,
      sourceKeys: [],
      texts: ['Nothing to add.'],
      ...over,
    });
  assert.equal(turn({ sourceKeys: ['task:own'] }), true);
  assert.equal(turn({ sourceKeys: ['task:child'] }), true);
  assert.equal(turn({ sourceKeys: ['task:plain'] }), false);
  assert.equal(turn({ texts: ['Your Ring child is due soon.'] }), true);
});

test('one project that cannot be opened only makes its own children quiet', async () => {
  const project = (id: string, sealed: unknown) => ({
    id,
    get: (field: string) => (field === 'sealed' ? sealed : undefined),
  });
  const query = {
    where: () => query,
    limit: () => query,
    get: async () => ({
      docs: [
        project(
          'good',
          sealForHelm(HELM_KEY, { name: 'Anniversary', quietMark: 'person' }),
        ),
        project('plain', sealForHelm(HELM_KEY, { name: 'Garden' })),
        project('broken', {
          nonce: 'x',
          ciphertext: 'not sealed',
          keyId: 'k',
          keyVersion: 1,
        }),
      ],
    }),
  };
  const read = await readActiveProjects(
    { collection: () => query } as never,
    'apps/helm/users/u1',
    HELM_KEY,
  );
  const quietRead = readQuietProjects(read, DAY);
  assert.deepEqual(quietRead.projects, [{ id: 'good', name: 'Anniversary' }]);
  assert.deepEqual([...quietRead.unreadableIds], ['broken']);
  assert.equal(quietRead.isComplete, true);
  assert.equal(toContextProjects(read, 20, DAY).length, 2);
});

test('turning Private off on a quiet thing is refused, and allowed once quiet is released', () => {
  const kept = quiet(NONE);
  if (kept.kind !== 'applied') throw new Error('expected applied');
  const refused = readSetPrivate({
    current: kept.facts,
    isPrivate: false,
    parents: [],
    today: DAY,
  });
  assert.deepEqual(refused, {
    kind: 'refused',
    line: "It's kept quiet, so it stays private. Turn off Keep it quiet first.",
  });
  const released = quiet(kept.facts, { isQuiet: false });
  if (released.kind !== 'applied') throw new Error('expected applied');
  assert.equal(
    readSetPrivate({
      current: released.facts,
      isPrivate: false,
      parents: [],
      today: DAY,
    }).kind,
    'applied',
  );
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
