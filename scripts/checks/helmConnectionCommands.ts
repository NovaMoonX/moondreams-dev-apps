// The server's link commands: said links are read only for known people from quoted words, written once as an undoable record, updated instead of duplicated, never made for a pet, an organization or a private person in a spoken line; a couple's engaged or married adds a moment; an implied link is asked once as Yes or No and a No is never asked again.
import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  sealForHelm,
  type HelmKey,
} from '../../functions/src/apps/helm/helmKey.ts';
import {
  planAnswerTurn,
  type AskedCapture,
} from '../../functions/src/apps/helm/nomos/answerTurn.ts';
import { planImpliedQuestions } from '../../functions/src/apps/helm/sortHelmCapture.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  buildImpliedQuestion,
  planConnectionAnswer,
  planConnections,
  planResolveConnection,
  readConnectionAnswer,
  withConnectionAnswer,
  type PlanWho,
  type StoredConnection,
} from '../../functions/src/apps/helm/nomos/planConnections.ts';
import {
  impliedConnections,
  toConnectionId,
  type ImpliedPerson,
} from '../../src/apps/helm/engine/connections.ts';
import {
  planUndo,
  type UndoTarget,
} from '../../src/apps/helm/nomos/planUndo.ts';
import type {
  ConnectionSealed,
  OpenExecution,
} from '../../src/apps/helm/types.ts';

const NOW = Date.UTC(2026, 10, 9, 17, 0);
const TODAY = Date.UTC(2026, 10, 9);
const seal = (fields: Record<string, unknown>) => fields as never;

const person = (
  name: string,
  extra: Record<string, unknown> = {},
  kind: PlanWho['kind'] = 'person',
): PlanWho => ({ kind, opened: { name, kin: null, ...extra } });

const WHOS = new Map<string, PlanWho | null>([
  ['dana', person('Dana')],
  ['sam', person('Sam')],
  ['joan', person('Joan')],
  ['miso', person('Miso', {}, 'pet')],
  ['secret', person('Secret', { privateMark: 'health' })],
  ['me', person('Me')],
]);

const run = (
  commands: Parameters<typeof planConnections>[0]['commands'],
  existing: Map<string, StoredConnection | null> = new Map(),
  isUnattended = false,
) =>
  planConnections({
    commands,
    selfWhoId: 'me',
    whos: WHOS,
    existing,
    todayDay: TODAY,
    now: NOW,
    executionId: 'exec-1',
    isUnattended,
    seal,
    room: 3,
  });

const married = (
  extra: Record<string, unknown> = {},
): Parameters<typeof planConnections>[0]['commands'][number] =>
  ({
    kind: 'connect',
    firstWhoId: 'dana',
    secondWhoId: 'sam',
    connectionKind: 'couple',
    relation: null,
    status: 'married',
    since: Date.UTC(2019, 5, 1),
    requestQuote: 'Dana and Sam are married',
    ...extra,
  }) as never;

// The reply keeps a link only between known people (or "me") from quoted words, and never from a question.
const people = createAliasBook('w');
const [dana, sam] = ['dana', 'sam'].map((id) => people.add(id));
const reply = (item: Record<string, unknown>, captureText: string) =>
  normalizeNomosReply(
    {
      commands: [
        {
          kind: 'connect',
          whoAlias: dana,
          otherWhoAlias: sam,
          connectionKind: 'couple',
          connectionRelation: null,
          coupleStatus: 'married',
          dateSpanId: null,
          requestQuote: 'Dana and Sam are married',
          ...item,
        },
      ],
    },
    {
      tasks: [],
      people,
      personNames: new Map([
        ['dana', ['Dana', 'Dee']],
        ['sam', ['Sam']],
      ]),
      reading: { dates: [], people: [], places: [], tags: [], urgent: [] },
      captureText,
      timeZone: 'UTC',
      now: 1,
    } as never,
  ).connectionCommands;
const SAID = 'Dana and Sam are married';
assert.equal(reply({}, SAID).length, 1);
assert.equal(reply({}, SAID)[0].kind, 'connect');
assert.equal(reply({}, `Are ${SAID}?`).length, 0, 'a question links no one');
assert.equal(reply({ requestQuote: 'they wed' }, SAID).length, 0);
assert.equal(reply({ otherWhoAlias: 'w99' }, SAID).length, 0);
assert.equal(reply({ otherWhoAlias: dana }, SAID).length, 0);
assert.equal(
  reply(
    { whoAlias: 'me', requestQuote: 'I am married to Sam' },
    'I am married to Sam',
  )[0].firstWhoId,
  null,
);
assert.equal(
  reply({ connectionKind: 'family', connectionRelation: null }, SAID).length,
  0,
  'a family link needs its word',
);
const mother = reply(
  {
    connectionKind: 'family',
    connectionRelation: 'mother',
    coupleStatus: null,
    requestQuote: 'Dana and Sam are married',
  },
  SAID,
)[0];
assert.equal(mother.kind === 'connect' && mother.relation, 'mother');
assert.equal(
  reply({ kind: 'disconnect', connectionKind: null }, SAID)[0].kind,
  'disconnect',
);
assert.equal(
  reply({ kind: 'updateConnection', coupleStatus: null }, SAID).length,
  0,
  'an update that changes nothing is dropped',
);

// One command stands for a pair whichever way round and whatever kind (the last said wins), and both people are named in the words.
const replyMany = (items: Record<string, unknown>[], captureText: string) =>
  normalizeNomosReply(
    {
      commands: items.map((item) => ({
        kind: 'connect',
        whoAlias: dana,
        otherWhoAlias: sam,
        connectionKind: 'couple',
        connectionRelation: null,
        coupleStatus: 'married',
        dateSpanId: null,
        requestQuote: 'Dana and Sam',
        ...item,
      })),
    },
    {
      tasks: [],
      people,
      personNames: new Map([
        ['dana', ['Dana', 'Dee']],
        ['sam', ['Sam']],
      ]),
      reading: { dates: [], people: [], places: [], tags: [], urgent: [] },
      captureText,
      timeZone: 'UTC',
      now: 1,
    } as never,
  ).connectionCommands;
const twice = replyMany(
  [
    { connectionKind: 'friend', coupleStatus: null },
    { whoAlias: sam, otherWhoAlias: dana },
  ],
  'Dana and Sam were friends, then Sam and Dana married',
);
assert.equal(twice.length, 1, 'a pair is one command, whatever the kind');
assert.equal(
  twice[0].connectionKind,
  'couple',
  'the last command said for the pair wins',
);
assert.equal(
  replyMany([{ requestQuote: 'they are married' }], 'They are married').length,
  0,
  'a quote that names no one links no one',
);
assert.equal(
  replyMany([{ requestQuote: 'got married' }], 'Dana got married').length,
  0,
  'both people must be named',
);
assert.equal(
  replyMany([{ requestQuote: 'Dee and Sam' }], 'Dee and Sam are married')
    .length,
  1,
  'an alias names a person',
);
assert.equal(
  replyMany(
    [{ whoAlias: 'me', requestQuote: 'married Sam' }],
    'Sam married someone',
  ).length,
  0,
  'the owner is named by I, me or my',
);

// connect writes one record with source said, by the assistant, and a line.
const made = run([married()]);
assert.equal(made.creates.length, 1);
assert.equal(made.creates[0].id, toConnectionId('dana', 'sam', 'couple'));
assert.equal(made.creates[0].data.source, 'said');
assert.equal(made.creates[0].data.createdBy, 'nomos');
assert.equal(made.creates[0].data.executionId, 'exec-1');
assert.deepEqual(made.creates[0].data.whoIds, ['dana', 'sam']);
assert.deepEqual(made.lines, ['Dana and Sam are married']);
assert.deepEqual(made.effectRefs, [
  { op: 'create', collection: 'connections', docId: 'dana_sam_couple' },
]);

// A family link is read from each side by the other's gender words.
const joan = run([
  {
    kind: 'connect',
    firstWhoId: 'joan',
    secondWhoId: 'dana',
    connectionKind: 'family',
    relation: 'mother',
    status: null,
    since: null,
    requestQuote: 'Joan is Dana’s mom',
  },
]);
assert.deepEqual(joan.lines, ['Joan is Dana’s mother']);
const sealedJoan = joan.creates[0].data.sealed as unknown as ConnectionSealed;
assert.equal(sealedJoan.fromFirst, 'child', 'dana has no gender words');
assert.equal(sealedJoan.fromSecond, 'mother');

// The same pair and kind is updated, never duplicated; saying it again changes nothing.
const stored = (
  source: StoredConnection['source'],
  status: StoredConnection['words'] extends infer W
    ? W extends { status: infer S }
      ? S
      : never
    : never,
): StoredConnection => ({
  whoIds: ['dana', 'sam'],
  kind: 'couple',
  source,
  createdBy: 'person',
  createdAt: 1,
  words: {
    fromFirst: 'partner',
    fromSecond: 'partner',
    status,
    since: null,
  },
});
const existing = new Map([['dana_sam_couple', stored('page', 'dating')]]);
const updated = run([married()], existing);
assert.equal(updated.creates.length, 0);
assert.equal(updated.updates.length, 1);
assert.equal(updated.updates[0].data.source, 'said');
assert.deepEqual(
  run([married({ since: null, status: 'dating' })], existing).lines,
  [],
  'nothing new is not rewritten',
);
assert.equal(
  run([married({ since: null, status: 'dating' })], existing).notKept.length,
  1,
);

// A refused one is replaced, and Undo can put the refusal back.
const refused = new Map([['dana_sam_couple', stored('refused', null)]]);
const replaced = run([married()], refused);
assert.equal(replaced.updates.length, 1);
assert.equal(replaced.effects[0].previous?.source, 'refused');
assert.equal(replaced.effects[0].written.source, 'said');

// updateConnection finds the pair's one shown link; "got engaged" adds a moment on both people.
const engaged = run(
  [
    {
      kind: 'updateConnection',
      firstWhoId: 'dana',
      secondWhoId: 'sam',
      connectionKind: null,
      relation: null,
      status: 'engaged',
      since: null,
      requestQuote: 'Dana and Sam got engaged',
    },
  ],
  existing,
);
assert.equal(engaged.updates.length, 1);
assert.equal(engaged.keyDates.length, 2);
assert.deepEqual(
  engaged.keyDates.map((date) => [date.keyKind, date.label, date.comesBack]),
  [
    ['custom', 'Got engaged', false],
    ['custom', 'Got engaged', false],
  ],
);
assert.deepEqual(engaged.keyDates[0].date, { month: 11, day: 9, year: 2026 });
assert.deepEqual(
  [...engaged.keyDateRefs.values()].sort(),
  ['dana', 'sam'],
  'both people are named',
);
const wed = run([married()], existing);
assert.deepEqual(wed.keyDates[0].date, { month: 6, day: 1, year: 2019 });
assert.equal(
  run([married({ status: 'dating', since: null })], new Map()).keyDates.length,
  0,
  'dating adds no moment',
);
assert.equal(
  run(
    [married({ since: null })],
    new Map([['dana_sam_couple', stored('page', 'married')]]),
  ).keyDates.length,
  0,
  'already married adds no second moment',
);
const withMe = run([married({ firstWhoId: null })]);
assert.equal(
  withMe.keyDates.some((date) => date.isAboutMe),
  true,
);

// disconnect deletes the shown record.
const removed = run(
  [
    {
      kind: 'disconnect',
      firstWhoId: 'dana',
      secondWhoId: 'sam',
      connectionKind: null,
      requestQuote: 'Dana and Sam broke up',
    },
  ],
  existing,
);
assert.deepEqual(removed.deletes, ['dana_sam_couple']);
assert.deepEqual(removed.lines, ['Removed the link between Dana and Sam']);
assert.equal(
  run([
    {
      kind: 'disconnect',
      firstWhoId: 'dana',
      secondWhoId: 'sam',
      connectionKind: null,
      requestQuote: 'Dana and Sam broke up',
    },
  ]).deletes.length,
  0,
);

// Pets and organizations are never linked.
const pet = run([married({ secondWhoId: 'miso' })]);
assert.equal(pet.creates.length, 0);
assert.equal(pet.notKept.length, 1);
assert.ok(pet.notKept[0].includes('pet or an organization'));

// A private person's name is masked in an unattended turn's line and marks the turn private.
const secret = run([married({ secondWhoId: 'secret' })], new Map(), true);
assert.equal(secret.isPrivate, true);
assert.ok(!JSON.stringify(secret.lines).includes('Secret'));
assert.ok(!JSON.stringify(secret.effects).includes('Secret'));
assert.ok(!JSON.stringify(secret.lines).includes('Secret'));

// Undo: a made link is deleted, a changed one gets its words back, a removed one comes back.
const execution = (
  entries: { ref: unknown; effect: unknown }[],
): OpenExecution =>
  ({
    id: 'exec-1',
    privacy: 'ordinary',
    said: null,
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
    createdAt: NOW - 3_600_000,
    decidedAt: NOW - 3_600_000,
    finishedAt: NOW - 3_600_000,
    summary: 'x',
    effects: entries.map((entry) => entry.effect),
    commands: [],
    notDone: [],
    abilityOffer: null,
    awayZoneOffer: null,
    undoReport: null,
    goneIds: [],
    lines: null,
    spoken: null,
    isUnreadable: false,
  }) as never;
const undo = (
  entries: { ref: unknown; effect: unknown }[],
  targets: [string, UndoTarget][],
) => {
  const result = planUndo({
    original: execution(entries),
    targets: new Map(targets),
    undoExecutionId: 'undo-1',
    now: NOW,
    usedIds: new Set(),
  });
  if (result.kind !== 'write')
    throw new Error(`expected a write, got ${result.reason}`);
  return result;
};
const asEntries = (plan: ReturnType<typeof run>) =>
  plan.effectRefs.map((ref, index) => ({ ref, effect: plan.effects[index] }));
const wordsOf = (words: StoredConnection['words']): ConnectionSealed =>
  words as ConnectionSealed;
const madeUndo = undo(asEntries(made), [
  [
    'dana_sam_couple',
    {
      docId: 'dana_sam_couple',
      data: { lastEditedAt: null },
      opened: wordsOf({
        fromFirst: 'partner',
        fromSecond: 'partner',
        status: 'married',
        since: Date.UTC(2019, 5, 1),
      }),
    },
  ],
]);
assert.deepEqual(madeUndo.deletes, [
  { docId: 'dana_sam_couple', collection: 'connections' },
]);
const changedUndo = undo(asEntries(engaged), [
  [
    'dana_sam_couple',
    {
      docId: 'dana_sam_couple',
      data: { lastEditedAt: NOW - 3_600_000 },
      opened: wordsOf({
        fromFirst: 'partner',
        fromSecond: 'partner',
        status: 'engaged',
        since: null,
      }),
    },
  ],
]);
assert.equal(changedUndo.updates.length, 1);
assert.equal(
  (changedUndo.updates[0].reseal as ConnectionSealed | null)?.status,
  'dating',
);
const removedUndo = undo(asEntries(removed), [
  [
    'dana_sam_couple',
    {
      docId: 'dana_sam_couple',
      data: null,
      opened: null,
      isOwnerHere: true,
    },
  ],
]);
assert.equal(removedUndo.creates.length, 1);
assert.equal(removedUndo.creates[0].collection, 'connections');
assert.deepEqual(removedUndo.creates[0].fields.whoIds, ['dana', 'sam']);
assert.equal(
  (removedUndo.creates[0].seal as ConnectionSealed).status,
  'dating',
);
const goneUndo = planUndo({
  original: execution(asEntries(removed)),
  targets: new Map([
    [
      'dana_sam_couple',
      {
        docId: 'dana_sam_couple',
        data: null,
        opened: null,
        isOwnerHere: false,
      },
    ],
  ]),
  undoExecutionId: 'undo-1',
  now: NOW,
  usedIds: new Set(),
});
assert.equal(goneUndo.kind, 'refused', 'not brought back for someone gone');

// Implied links: the owner's siblings are siblings, a parent's partner is a stepparent, a sibling's partner an in-law; only touched, only people, never a decided pair.
const who = (
  id: string,
  kin: ImpliedPerson['kin'],
  extra: Partial<ImpliedPerson> = {},
): ImpliedPerson => ({
  id,
  kin,
  isPrivate: false,
  isPerson: true,
  ...extra,
});
const family = [
  who('me', null),
  who('maya', { kind: 'sister' }),
  who('eli', { kind: 'brother' }),
  who('mom', { kind: 'mother' }),
  who('sam', null),
];
const siblings = impliedConnections({
  selfId: 'me',
  people: family,
  connections: [],
  touchedIds: ['maya'],
});
assert.deepEqual(
  siblings.map((link) => [
    link.firstId,
    link.secondId,
    link.relationOfFirstToSecond,
  ]),
  [['maya', 'eli', 'sister']],
);
assert.deepEqual(
  impliedConnections({
    selfId: 'me',
    people: family,
    connections: [],
    touchedIds: ['sam'],
  }),
  [],
  'someone untouched implies nothing',
);
const stepparent = impliedConnections({
  selfId: 'me',
  people: family,
  connections: [
    {
      whoIds: ['mom', 'sam'],
      kind: 'couple',
      source: 'said',
      status: 'married',
      isUnreadable: false,
    },
  ],
  touchedIds: ['sam'],
});
assert.deepEqual(
  stepparent.map((link) => [
    link.firstId,
    link.secondId,
    link.relationOfFirstToSecond,
  ]),
  [['sam', 'me', 'stepparent']],
);
assert.equal(
  impliedConnections({
    selfId: 'me',
    people: family,
    connections: [
      {
        whoIds: ['mom', 'sam'],
        kind: 'couple',
        source: 'said',
        status: 'divorced',
        isUnreadable: false,
      },
    ],
    touchedIds: ['sam'],
  }).length,
  0,
  'a past couple implies nothing',
);
const inLaw = impliedConnections({
  selfId: 'me',
  people: family,
  connections: [
    {
      whoIds: ['eli', 'sam'],
      kind: 'couple',
      source: 'said',
      status: null,
      isUnreadable: false,
    },
  ],
  touchedIds: ['sam'],
});
assert.equal(inLaw[0].relationOfFirstToSecond, 'siblingInLaw');
const pets = family.map((entry) =>
  entry.id === 'eli' ? { ...entry, isPerson: false } : entry,
);
assert.equal(
  impliedConnections({
    selfId: 'me',
    people: pets,
    connections: [],
    touchedIds: ['maya'],
  }).length,
  0,
  'a pet is never part of a proposal',
);
const hidden = family.map((entry) =>
  entry.id === 'eli' ? { ...entry, isPrivate: true } : entry,
);
assert.equal(
  impliedConnections({
    selfId: 'me',
    people: hidden,
    connections: [],
    touchedIds: ['maya'],
  }).length,
  0,
  'a private person is never part of a proposal',
);

// The question is one Yes or No holding the pair; Yes confirms it, No refuses it, and a refusal is never proposed again.
const question = buildImpliedQuestion(siblings[0], {
  first: 'Maya',
  second: 'Eli',
  isSecondSelf: false,
});
assert.equal(question.prompt, 'Are Maya and Eli siblings?');
assert.equal(question.shape, 'yesNo');
assert.equal(question.builtBy, 'code');
const owner = new Map<string, PlanWho | null>([
  ['maya', person('Maya', { kin: { kind: 'sister', order: null } })],
  ['eli', person('Eli', { kin: { kind: 'brother', order: null } })],
]);
const answer = (
  optionId: string,
  existingDoc: StoredConnection | null = null,
) => {
  const result = planResolveConnection({
    captureId: 'c1',
    questionId: 'q1',
    optionId,
    by: 'tap',
    now: NOW,
    executionId: 'exec-2',
    capture: {
      status: 'needsYou',
      executionIds: [],
      questionState: {
        q1: {
          kind: 'isConnection',
          shape: 'yesNo',
          askedAt: 1,
          answeredAt: null,
          skippedAt: null,
          leftAt: null,
        },
      },
    },
    opened: {
      questions: { q1: { ...question, options: question.options } },
    },
    whos: owner,
    existing: existingDoc,
    seal,
  });
  assert.equal(result.refused, null);
  if (result.refused !== null) throw new Error('refused');
  return result;
};
const yes = answer('yes');
assert.equal(yes.write?.doc.data.source, 'confirmed');
assert.equal(yes.write?.line, 'Maya is Eli’s sister');
assert.equal(yes.capture.status, 'sorted');
const no = answer('no');
assert.equal(no.write?.doc.data.source, 'refused');
assert.equal(no.write?.doc.op, 'create');
assert.deepEqual(
  (no.write?.doc.data.sealed as unknown as ConnectionSealed).fromFirst,
  'brother',
  'the refusal keeps the relation it refused (eli, the first by id, is the brother)',
);
const refusal = no.write?.doc.data;
assert.equal(
  impliedConnections({
    selfId: 'me',
    people: family,
    connections: [
      {
        whoIds: refusal?.whoIds as [string, string],
        kind: 'family',
        source: 'refused',
        status: null,
        isUnreadable: false,
      },
    ],
    touchedIds: ['maya'],
  }).length,
  0,
  'a No is never asked again',
);
assert.equal(
  impliedConnections({
    selfId: 'me',
    people: family,
    connections: [
      {
        whoIds: ['eli', 'maya'],
        kind: 'family',
        source: 'confirmed',
        status: null,
        isUnreadable: false,
      },
    ],
    touchedIds: ['maya'],
  }).length,
  0,
  'a Yes is not asked again either',
);
assert.equal(
  answer('yes', stored('said', null)).write,
  null,
  'a pair that already has a shown link writes nothing',
);

// The prompt never builds a plural from the word, and a pair of other people reads as a question about one of them.
const others = buildImpliedQuestion(
  {
    firstId: 'sam',
    secondId: 'dana',
    kind: 'family',
    relationOfFirstToSecond: 'brother',
    because: 'siblingsPartner',
  },
  { first: 'Sam', second: 'Dana', isSecondSelf: false },
);
assert.equal(others.prompt, "Is Sam Dana's brother?");
assert.equal(
  buildImpliedQuestion(
    {
      firstId: 'sam',
      secondId: 'me',
      kind: 'family',
      relationOfFirstToSecond: 'stepparent',
      because: 'parentsPartner',
    },
    { first: 'Sam', second: 'Me', isSecondSelf: true },
  ).prompt,
  'Is Sam your stepparent?',
);

// A typed or spoken Yes or No settles the question like the tap does.
const asked: AskedCapture = {
  status: 'needsYou',
  questionState: {
    q1: {
      kind: 'isConnection',
      shape: 'yesNo',
      askedAt: 1,
      answeredAt: null,
      skippedAt: null,
      leftAt: null,
    },
  },
  opened: { questions: { q1: question } },
};
const typed = (words: string, value: unknown = null) =>
  planAnswerTurn({
    asked,
    questionId: 'q1',
    value,
    words,
    by: 'voice',
    turnCaptureId: 'c2',
    now: NOW,
  });
assert.equal(
  typed('yes').kind,
  'apply',
  'a connection question takes an answer',
);
assert.equal(readConnectionAnswer(asked, 'q1', null, 'Yes.')?.optionId, 'yes');
assert.equal(readConnectionAnswer(asked, 'q1', null, 'nope')?.optionId, 'no');
assert.equal(
  readConnectionAnswer(asked, 'q1', { shape: 'yesNo', optionId: 'no' }, 'x')
    ?.optionId,
  'no',
);
assert.equal(
  readConnectionAnswer(asked, 'q1', null, 'maybe so'),
  null,
  'anything but a yes or no settles nothing',
);
assert.equal(readConnectionAnswer(null, 'q1', null, 'yes'), null);
const typedYes = readConnectionAnswer(asked, 'q1', null, 'yes');
const typedWrite = planConnectionAnswer({
  held: typedYes!.held,
  optionId: typedYes!.optionId,
  whos: owner,
  existing: null,
  executionId: 'exec-3',
  now: NOW,
  seal,
});
const merged = withConnectionAnswer(run([]), typedWrite!);
assert.equal(merged.creates[0].data.source, 'confirmed');
assert.equal(merged.effects.length, 1);
assert.deepEqual(merged.linkedWhoIds, ['eli', 'maya']);

// A person who is private now makes the answer's record private; the link is written and the pair is linked either way.
const answerWith = (whos: Map<string, PlanWho | null>) => {
  const result = planResolveConnection({
    captureId: 'c1',
    questionId: 'q1',
    optionId: 'yes',
    by: 'tap',
    now: NOW,
    executionId: 'exec-4',
    capture: {
      status: 'needsYou',
      executionIds: [],
      questionState: asked.questionState,
    },
    opened: asked.opened,
    whos,
    existing: null,
    seal,
  });
  if (result.refused !== null) throw new Error('refused');
  return result;
};
const quietPair = answerWith(owner);
assert.equal(quietPair.execution?.privacy, 'ordinary');
assert.deepEqual(quietPair.execution?.linkedWhoIds, ['eli', 'maya']);
const hiddenPair = answerWith(
  new Map([
    ['maya', person('Maya', { privateMark: 'health' })],
    ['eli', person('Eli', { kin: { kind: 'brother', order: null } })],
  ]),
);
assert.equal(
  hiddenPair.write?.doc.data.source,
  'confirmed',
  'the link is written',
);
assert.equal(hiddenPair.execution?.privacy, 'private');
assert.deepEqual(hiddenPair.execution?.linkedWhoIds, ['eli', 'maya']);

// A link whose words would not open implies nothing.
assert.equal(
  impliedConnections({
    selfId: 'me',
    people: family,
    connections: [
      {
        whoIds: ['mom', 'sam'],
        kind: 'couple',
        source: 'said',
        status: null,
        isUnreadable: true,
      },
    ],
    touchedIds: ['sam'],
  }).length,
  0,
  'an unreadable couple implies nothing',
);

// A turn that only names someone runs no implied reads; one that sets a family word or writes a link does.
const HELM_KEY: HelmKey = {
  keyId: 'k',
  keyVersion: 1,
  key: Buffer.alloc(32, 7),
};
const noReads = {
  get: () => {
    throw new Error('read');
  },
} as never;
const noCollections = {
  collection: () => {
    throw new Error('read');
  },
} as never;
const whoDoc = (kin: unknown) => ({
  kind: 'person',
  lastMentionedAt: 1,
  sealed: sealForHelm(HELM_KEY, { name: 'Sam', aliases: [], kin }),
});
const implied = (
  connectionTouchedIds: string[],
  whoRewrites: { id: string; data: Record<string, unknown> }[],
) =>
  planImpliedQuestions(noReads, noCollections, 'base', HELM_KEY, {
    selfWhoId: 'me',
    connectionTouchedIds,
    whoRewrites,
    settled: new Map(),
    capturesRef: {} as never,
    now: NOW,
    newId: () => 'q',
  });
assert.deepEqual(
  await implied([], [{ id: 'sam', data: { lastMentionedAt: 2 } }]),
  [],
  'a mention only touches nothing',
);
assert.deepEqual(
  await implied([], [{ id: 'sam', data: whoDoc(null) }]),
  [],
  'a new person with no family word reads nothing',
);
await assert.rejects(
  implied([], [{ id: 'sam', data: whoDoc({ kind: 'brother', order: null }) }]),
  /read/,
  'a family word set this turn reads the people',
);
await assert.rejects(implied(['sam'], []), /read/, 'a written link reads them');

console.log('helm connection commands: ok');
