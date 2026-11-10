import assert from 'node:assert/strict';

import {
  openForHelm,
  sealForHelm,
} from '../../functions/src/apps/helm/helmKey.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import { type CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  planWrites,
  settleCapture,
  type Effect,
  type EffectRef,
  type KnownWhoState,
  type PeopleInput,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import {
  buildSpokenPick,
  buildWhichIsTrueQuestion,
} from '../../functions/src/apps/helm/nomos/summaries.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planResolve,
  type ResolveFact,
  type ResolveInput,
} from '../../functions/src/apps/helm/nomos/resolveQuestion.ts';
import type { SealedPayload } from '../../functions/src/appKeys/seal.ts';
import { planUndo } from '../../src/apps/helm/nomos/planUndo.ts';
import type { OpenExecution } from '../../src/apps/helm/types.ts';

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
const task = (title: string, extra: Record<string, unknown> = {}) => ({
  kind: 'createTask',
  ref: null,
  taskAlias: null,
  title,
  dueSpanId: null,
  isUrgent: null,
  ...extra,
});
const who = (
  id: string,
  kind: KnownWhoState['kind'],
  name: string,
  extra: Partial<KnownWhoState> = {},
): KnownWhoState => ({
  id,
  kind,
  name,
  aliases: [],
  lastMentionedAt: null,
  tier: 'passing',
  tierSetBy: 'nomos',
  mentionDayKeys: [],
  taskLinkCount: 0,
  yearlyDateCount: 0,
  momentCount: 0,
  hasRole: false,
  ...extra,
});
const mention = (
  ref: string,
  name: string,
  kind: 'person' | 'pet' | 'organization' = 'person',
) => ({
  ref,
  name,
  kind,
  relation: null,
  species: null,
  organizationKind: null,
});
const counter = () => {
  const count = { n: 0 };
  return () => {
    count.n += 1;
    return `new-${count.n}`;
  };
};
const plan = (people: Partial<PeopleInput>, commands: unknown[]) =>
  planWrites({
    commands: normalizeNomosReply(
      {
        commands,
        mentions: people.mentions ?? [],
        places: people.places ?? [],
      },
      {
        reading: READING,
        aliases: createAliasBook('t'),
      },
    ).commands,
    existing: new Map(),
    captureId: 'c1',
    executionId: 'e1',
    now: 5000,
    seal,
    newId: counter(),
    people: {
      mentions: [],
      places: [],
      known: [],
      knownPlaces: [],
      assistantName: null,
      dayKey: '2026-11-10',
      capturedAt: 4000,
      ...people,
    },
  });

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const sams = [
  who('w1', 'person', 'Sam Rivera', { relation: 'work friend' }),
  who('w2', 'person', 'Sam Patel', { relation: 'neighbor' }),
];

test('two Sams make one whichPerson question with both, new and none', () => {
  const result = plan({ mentions: [mention('$w1', 'Sam')], known: sams }, [
    task('Lunch with Sam', { whoRefs: ['$w1'] }),
  ]);
  assert.equal(result.questions.length, 1);
  const [question] = result.questions;
  assert.equal(question.state.kind, 'whichPerson');
  assert.equal(question.state.answeredAt, null);
  const sealed = question.sealed as {
    prompt: string;
    options: { id: string; label: string; detail: string | null }[];
    heldCommands: { kind: string; taskIds: string[] }[];
    aboutRef: { collection: string; id: string };
    builtBy: string;
  };
  assert.equal(sealed.prompt, 'Which Sam?');
  assert.equal(sealed.builtBy, 'code');
  assert.deepEqual(
    sealed.options.map((option) => [option.id, option.label, option.detail]),
    [
      ['w1', 'Sam Rivera', 'Work friend'],
      ['w2', 'Sam Patel', 'Neighbor'],
      ['new', 'Someone new', null],
      ['none', "Don't link anyone", null],
    ],
  );
  const taskId = result.creates[0].id;
  assert.deepEqual(sealed.heldCommands[0].taskIds, [taskId]);
  assert.deepEqual(sealed.aboutRef, { collection: 'tasks', id: taskId });
  assert.deepEqual(result.creates[0].data.whoIds, []);
  assert.equal(result.whoCreates.length, 0);
  assert.equal(question.spoken, 'Which Sam, Sam Rivera or Sam Patel?');
  assert.equal(
    buildSpokenPick('Sam', ['A', 'B', 'C', 'D']),
    'Which Sam, A, B or C?',
  );
  assert.equal(buildSpokenPick('Sam', ['A']), 'Which Sam, A or someone new?');
});

test('a cat and a person named Miso get kind words; more than four are cut', () => {
  const result = plan(
    {
      mentions: [mention('$w1', 'Miso')],
      known: [
        who('w1', 'person', 'Miso Tanaka'),
        who('w2', 'pet', 'Miso', { species: 'cat' }),
      ],
    },
    [task('Feed Miso', { whoRefs: ['$w1'] })],
  );
  const options = (
    result.questions[0].sealed as { options: { detail: string | null }[] }
  ).options;
  assert.deepEqual(
    options.map((option) => option.detail),
    ['Cat', 'Person', null, null],
  );
  const many = plan(
    {
      mentions: [mention('$w1', 'Sam')],
      known: ['a', 'b', 'c', 'd', 'e'].map((x) => who(x, 'person', `Sam ${x}`)),
    },
    [task('Call Sam', { whoRefs: ['$w1'] })],
  );
  assert.equal(
    (many.questions[0].sealed as { options: unknown[] }).options.length,
    6,
    'four candidates, new and none',
  );
});

test('a name no task points at, or a turn that files nothing, asks nothing; one name asks once; at most three ask', () => {
  assert.equal(
    plan({ mentions: [mention('$w1', 'Sam')], known: sams }, [task('Buy milk')])
      .questions.length,
    0,
  );
  assert.equal(
    plan({ mentions: [mention('$w1', 'Sam')], known: sams }, []).questions
      .length,
    0,
  );
  const twice = plan(
    { mentions: [mention('$w1', 'Sam'), mention('$w2', 'sam')], known: sams },
    [
      task('Call Sam', { whoRefs: ['$w1'] }),
      task('Text Sam', { whoRefs: ['$w2'] }),
    ],
  );
  assert.equal(twice.questions.length, 1);
  assert.equal(
    (
      twice.questions[0].sealed as {
        heldCommands: { taskIds: string[] }[];
      }
    ).heldCommands[0].taskIds.length,
    2,
  );
  const known = ['Sam', 'Lee', 'Kim', 'Ana'].flatMap((first) => [
    who(`${first}1`, 'person', `${first} One`),
    who(`${first}2`, 'person', `${first} Two`),
  ]);
  const four = plan(
    {
      mentions: ['Sam', 'Lee', 'Kim', 'Ana'].map((name, index) =>
        mention(`$w${index + 1}`, name),
      ),
      known,
    },
    ['Sam', 'Lee', 'Kim', 'Ana'].map((name, index) =>
      task(`Call ${name}`, { whoRefs: [`$w${index + 1}`] }),
    ),
  );
  assert.equal(four.questions.length, 3);
});

test('an unsure place asks whichPlace with its address', () => {
  const result = plan(
    {
      places: [{ ref: '$p1', name: 'Ferry' }],
      known: [],
      knownPlaces: [
        {
          id: 'p1',
          name: 'Ferry Building',
          aliases: [],
          address: '1 Ferry Plaza',
        },
        { id: 'p2', name: 'Ferry Terminal', aliases: [] },
      ],
    },
    [task('Meet at Ferry', { placeRefs: ['$p1'] })],
  );
  const sealed = result.questions[0].sealed as {
    options: { id: string; label: string; detail: string | null }[];
    heldCommands: { kind: string; place: { name: string } }[];
  };
  assert.equal(result.questions[0].state.kind, 'whichPlace');
  assert.deepEqual(
    sealed.options.map((option) => [option.id, option.label, option.detail]),
    [
      ['p1', 'Ferry Building', '1 Ferry Plaza'],
      ['p2', 'Ferry Terminal', null],
      ['new', 'New place', null],
      ['none', "Don't link a place", null],
    ],
  );
  assert.equal(sealed.heldCommands[0].kind, 'linkPlace');
});

test('a capture with an open question stays needsYou, and answered ones do not', () => {
  const result = plan({ mentions: [mention('$w1', 'Sam')], known: sams }, [
    task('Lunch with Sam', { whoRefs: ['$w1'] }),
  ]);
  const base = {
    mode: 'full' as const,
    filed: 1,
    hasMore: false,
    executionId: 'e1',
    now: 5000,
    newId: () => 'q',
    opened: { text: 'x' },
    executionIds: [],
  };
  const settled = settleCapture({
    ...base,
    questionState: {},
    questions: result.questions,
  });
  assert.equal(settled.status, 'needsYou');
  assert.equal(Object.keys(settled.questionState).length, 1);
  assert.equal(settleCapture({ ...base, questionState: {} }).status, 'sorted');
});

const heldQuestion = (kind: 'whichPerson' | 'whichPlace' = 'whichPerson') => ({
  kind,
  options: [
    { id: 'w1', label: 'Sam Rivera', detail: null, ref: null },
    { id: 'new', label: 'Someone new', detail: null, ref: null },
    { id: 'none', label: "Don't link anyone", detail: null, ref: null },
  ],
  heldCommands:
    kind === 'whichPerson'
      ? [
          {
            kind: 'linkWho',
            taskIds: ['t1', 't2'],
            mention: mention('', 'Sam'),
          },
        ]
      : [{ kind: 'linkPlace', taskIds: ['t1'], place: { name: 'ferry' } }],
  answer: null,
});

const resolveInput = (
  optionId: string,
  extra: Partial<ResolveInput> = {},
): ResolveInput => ({
  captureId: 'c1',
  questionId: 'q1',
  optionId,
  by: 'tap',
  now: 9000,
  timeZone: 'UTC',
  keyDate: null,
  executionId: 'e9',
  capture: {
    status: 'needsYou',
    createdAt: 4000,
    whoIds: [],
    placeIds: [],
    executionIds: ['e1'],
    questionState: {
      q1: {
        kind: 'whichPerson',
        shape: 'pickOne',
        askedAt: 4000,
        answeredAt: null,
        skippedAt: null,
      },
    },
  },
  opened: { text: 'Lunch with Sam', questions: { q1: heldQuestion() } },
  tasks: new Map([
    ['t1', { title: 'Lunch with Sam', whoIds: [], placeIds: [] }],
    ['t2', { title: 'Call Sam', whoIds: ['x'], placeIds: [] }],
  ]),
  facts: new Map(),
  text: null,
  chosen: { tier: 'passing', tierSetBy: 'nomos', lastMentionedAt: null },
  newId: () => 'made-1',
  seal,
  ...extra,
});

const planned = (input: ResolveInput) => {
  const result = planResolve(input);
  assert.equal(result.refused, null);
  return (result as Extract<typeof result, { refused: null }>).plan;
};

test('a pick links each held task, raises a passing tier and answers the question', () => {
  const result = planned(resolveInput('w1'));
  assert.deepEqual(
    result.taskUpdates.map((update) => [update.id, update.data.whoIds]),
    [
      ['t1', ['w1']],
      ['t2', ['x', 'w1']],
    ],
  );
  assert.deepEqual(result.whoUpdate, {
    id: 'w1',
    data: { lastMentionedAt: 4000, tier: 'regular' },
  });
  assert.equal(result.whoCreate, null);
  const execution = result.execution as Record<string, unknown>;
  assert.equal(execution.actor, 'nomos');
  assert.deepEqual(execution.questionRef, {
    captureId: 'c1',
    questionId: 'q1',
  });
  assert.deepEqual(execution.linkedWhoIds, ['w1']);
  assert.equal((execution.effectRefs as unknown[]).length, 2);
  assert.equal(result.capture.status, 'sorted');
  assert.deepEqual(result.capture.whoIds, ['w1']);
  assert.deepEqual(result.capture.executionIds, ['e1', 'e9']);
  assert.equal(
    (result.capture.questionState as Record<string, { answeredAt: number }>).q1
      .answeredAt,
    9000,
  );
  const sealed = result.capture.sealed as {
    questions: Record<string, { answer: { optionId: string; by: string } }>;
  };
  assert.equal(sealed.questions.q1.answer.optionId, 'w1');
  assert.equal(sealed.questions.q1.answer.by, 'tap');
});

test('a tier the person set is never raised, and a task already linked is left alone', () => {
  const result = planned(
    resolveInput('w1', {
      chosen: { tier: 'passing', tierSetBy: 'person', lastMentionedAt: null },
      tasks: new Map([
        ['t1', { title: 'Lunch with Sam', whoIds: ['w1'], placeIds: [] }],
      ]),
    }),
  );
  assert.deepEqual(result.whoUpdate?.data, { lastMentionedAt: 4000 });
  assert.equal(result.taskUpdates.length, 0);
  assert.equal(result.execution, null);
});

test('answering an old question never moves a later mention back', () => {
  const result = planned(
    resolveInput('w1', {
      chosen: { tier: 'regular', tierSetBy: 'nomos', lastMentionedAt: 8000 },
    }),
  );
  assert.equal(result.whoUpdate?.data.lastMentionedAt, 8000);
});

test('new makes the who like a turn does and links it; none links nothing', () => {
  const made = planned(resolveInput('new'));
  assert.equal(made.whoCreate?.id, 'made-1');
  assert.equal(made.whoCreate?.data.tierSetBy, 'nomos');
  assert.equal(made.whoCreate?.data.tier, 'regular');
  assert.equal(made.whoCreate?.data.executionId, 'e9');
  assert.equal(made.whoUpdate, null);
  assert.deepEqual(
    (made.execution?.effectRefs as { op: string; collection: string }[]).map(
      (ref) => `${ref.op}:${ref.collection}`,
    ),
    ['update:tasks', 'update:tasks', 'create:who'],
  );
  assert.deepEqual(made.capture.whoIds, ['made-1']);
  const none = planned(resolveInput('none', { chosen: null }));
  assert.equal(none.execution, null);
  assert.equal(none.taskUpdates.length, 0);
  assert.equal(none.whoCreate, null);
  assert.equal(none.capture.status, 'sorted');
  assert.equal(none.capture.whoIds, undefined);
});

test('a place question links placeIds and makes a place on new', () => {
  const input = resolveInput('p1', {
    opened: {
      questions: {
        q1: {
          ...heldQuestion('whichPlace'),
          options: [{ id: 'p1', label: 'Ferry Building' }],
        },
      },
    },
  });
  const picked = planned(input);
  assert.deepEqual(picked.taskUpdates[0].data.placeIds, ['p1']);
  assert.deepEqual(picked.capture.placeIds, ['p1']);
  const made = planned(
    resolveInput('new', {
      opened: { questions: { q1: heldQuestion('whichPlace') } },
    }),
  );
  assert.equal(made.placeCreate?.data.isHome, false);
  assert.equal(made.whoCreate, null);
});

test('an answered or unknown question or option is refused, a gone person too, a gone task is skipped', () => {
  const answered = resolveInput('w1');
  answered.capture.questionState.q1.answeredAt = 8000;
  assert.equal(planResolve(answered).refused, 'answered');
  assert.equal(
    planResolve({ ...resolveInput('w1'), questionId: 'nope' }).refused,
    'unknown',
  );
  assert.equal(planResolve(resolveInput('w9')).refused, 'unknown');
  assert.equal(
    planResolve(resolveInput('w1', { chosen: null })).refused,
    'gone',
  );
  const skipped = planned(
    resolveInput('w1', {
      tasks: new Map([['t2', { title: 'Call Sam', whoIds: [], placeIds: [] }]]),
    }),
  );
  assert.deepEqual(
    skipped.taskUpdates.map((update) => update.id),
    ['t2'],
  );
});

test('answering one of two questions leaves the capture needing you', () => {
  const input = resolveInput('w1');
  input.capture.questionState.q2 = {
    kind: 'whichPerson',
    shape: 'pickOne',
    askedAt: 4000,
    answeredAt: null,
    skippedAt: null,
  };
  assert.equal(planned(input).capture.status, 'needsYou');
});

test('the last answer on a capture another device re-sorted keeps its status', () => {
  const input = resolveInput('w1');
  input.capture.status = 'interpreting';
  assert.equal(planned(input).capture.status, 'interpreting');
  assert.equal(planned(resolveInput('w1')).capture.status, 'sorted');
});

test('"new" with no held name is refused as unknown', () => {
  const noMention = resolveInput('new');
  const question = heldQuestion();
  question.heldCommands = [{ kind: 'linkWho', taskIds: ['t1'] } as never];
  noMention.opened = { text: 'x', questions: { q1: question } };
  assert.equal(planResolve(noMention).refused, 'unknown');
  const noPlace = resolveInput('new');
  const placeQuestion = heldQuestion('whichPlace');
  placeQuestion.heldCommands = [
    { kind: 'linkPlace', taskIds: ['t1'], place: {} } as never,
  ];
  noPlace.opened = { text: 'x', questions: { q1: placeQuestion } };
  assert.equal(planResolve(noPlace).refused, 'unknown');
});

test('equally close candidates rank the most recently mentioned first', () => {
  const result = plan(
    {
      mentions: [mention('$w1', 'Sam')],
      known: [
        who('w1', 'person', 'Sam Rivera', { lastMentionedAt: 100 }),
        who('w2', 'person', 'Sam Patel', { lastMentionedAt: 900 }),
        who('w3', 'person', 'Sam Lee', { lastMentionedAt: null }),
      ],
    },
    [task('Call Sam', { whoRefs: ['$w1'] })],
  );
  const options = (result.questions[0].sealed as { options: { id: string }[] })
    .options;
  assert.deepEqual(
    options.slice(0, 3).map((option) => option.id),
    ['w2', 'w1', 'w3'],
  );
});

const fact = (extra: Partial<ResolveFact> = {}): ResolveFact => ({
  status: 'confirmed',
  kind: 'world',
  statement: 'Centerpieces are $1,800',
  topic: null,
  createdAt: 1000,
  confirmedAt: 1000,
  supersedesId: null,
  supersededById: null,
  supersededAt: null,
  disputedWithId: 'f-new',
  whoIds: ['who-dana'],
  placeIds: [],
  projectIds: [],
  syncedIds: [],
  subjectIds: ['who-dana'],
  ...extra,
});

const settleInput = (
  optionId: string,
  extra: Partial<ResolveInput> = {},
): ResolveInput => ({
  ...resolveInput(optionId),
  tasks: new Map(),
  opened: {
    text: 'Dana says centerpieces are $2,100 now',
    questions: {
      q1: buildWhichIsTrueQuestion({
        older: {
          id: 'f-old',
          statement: 'Centerpieces are $1,800',
          detail: '',
        },
        newer: {
          id: 'f-new',
          statement: 'Centerpieces are $2,100',
          detail: '',
        },
      }),
    },
  },
  capture: {
    ...resolveInput(optionId).capture,
    questionState: {
      q1: {
        kind: 'whichIsTrue',
        shape: 'pickOne',
        askedAt: 4000,
        answeredAt: null,
        skippedAt: null,
      },
    },
  },
  facts: new Map([
    ['f-old', fact({ disputedWithId: 'f-new' })],
    [
      'f-new',
      fact({
        statement: 'Centerpieces are $2,100',
        createdAt: 4000,
        confirmedAt: 4000,
        disputedWithId: 'f-old',
        whoIds: ['who-dana', 'who-lee'],
        subjectIds: ['who-dana', 'who-lee'],
      }),
    ],
  ]),
  ...extra,
});

const updateOf = (
  result: ReturnType<typeof planned>,
  id: string,
): Record<string, unknown> =>
  result.factUpdates.find((update) => update.id === id)?.data ?? {};

test('picking the newer fact confirms it, supersedes the older and clears both disputes', () => {
  const result = planned(settleInput('f-new'));
  assert.deepEqual(updateOf(result, 'f-new'), {
    disputedWithId: null,
    status: 'confirmed',
    confirmedAt: 4000,
    lastEditedAt: 9000,
    supersedesId: 'f-old',
  });
  assert.deepEqual(updateOf(result, 'f-old'), {
    disputedWithId: null,
    status: 'superseded',
    supersededById: 'f-new',
    supersededAt: 9000,
  });
  assert.equal(result.factCreate, null);
  const execution = result.execution as {
    category: string;
    effectRefs: { op: string; collection: string; docId: string }[];
    sealed: SealedPayload;
  };
  assert.equal(execution.category, 'remember');
  assert.deepEqual(
    execution.effectRefs.map((ref) => [ref.op, ref.collection, ref.docId]),
    [
      ['update', 'facts', 'f-new'],
      ['update', 'facts', 'f-old'],
    ],
  );
  const effects = openForHelm(KEY, execution.sealed).effects as {
    written: Record<string, unknown>;
    previous: Record<string, unknown>;
  }[];
  assert.equal(effects[0].previous.disputedWithId, 'f-old');
  assert.equal(effects[1].previous.status, 'confirmed');
  assert.equal(effects[1].previous.supersededById, null);
  assert.equal(
    openForHelm(KEY, execution.sealed).summary,
    'Kept \u201cCenterpieces are $2,100\u201d',
  );
  assert.equal(result.capture.status, 'sorted');
  assert.equal(
    (result.capture.questionState as Record<string, { answeredAt: number }>).q1
      .answeredAt,
    9000,
  );
});

test('picking the older fact keeps the newer as superseded by it', () => {
  const result = planned(settleInput('f-old'));
  assert.deepEqual(updateOf(result, 'f-old'), {
    disputedWithId: null,
    status: 'confirmed',
    confirmedAt: 1000,
    lastEditedAt: 9000,
  });
  assert.deepEqual(updateOf(result, 'f-new'), {
    disputedWithId: null,
    status: 'superseded',
    supersededById: 'f-old',
    supersededAt: 9000,
  });
});

test('neither with a statement makes a corrected fact that supersedes both', () => {
  const result = planned(
    settleInput('none', { text: 'Centerpieces are $1,950' }),
  );
  assert.equal(result.factCreate?.id, 'made-1');
  const data = result.factCreate?.data as Record<string, unknown>;
  assert.equal(data.status, 'confirmed');
  assert.equal(data.stated, 'personCorrected');
  assert.equal(data.supersedesId, 'f-new');
  assert.equal(data.sourceCaptureId, null);
  assert.deepEqual(data.subjectIds, ['who-dana', 'who-lee']);
  assert.equal(
    openForHelm(KEY, data.sealed as SealedPayload).statement,
    'Centerpieces are $1,950',
  );
  assert.equal(openForHelm(KEY, data.sealed as SealedPayload).quote, null);
  ['f-old', 'f-new'].forEach((id) =>
    assert.deepEqual(updateOf(result, id), {
      disputedWithId: null,
      status: 'superseded',
      supersededById: 'made-1',
      supersededAt: 9000,
    }),
  );
  const execution = result.execution as {
    effectRefs: { op: string; collection: string }[];
  };
  assert.deepEqual(
    execution.effectRefs.map((ref) => [ref.op, ref.collection]),
    [
      ['create', 'facts'],
      ['update', 'facts'],
      ['update', 'facts'],
    ],
  );
  assert.equal(
    planResolve(settleInput('none')).refused,
    'unknown',
    'a statement is needed',
  );
});

test('a settle closes the question, writing nothing else, when a fact is gone or no longer disputed; it refuses an answered question', () => {
  const closes = (input: ReturnType<typeof settleInput>, freed: string[]) => {
    const plan = planned(input);
    assert.equal(plan.isStale, true);
    assert.equal(plan.execution, null);
    assert.deepEqual(
      plan.factUpdates,
      freed.map((id) => ({ id, data: { disputedWithId: null } })),
    );
    assert.equal(plan.factCreate, null);
    const capture = plan.capture as {
      questionState: Record<string, { answeredAt: number | null }>;
      sealed: { questions: Record<string, { answer: unknown }> };
      executionIds: string[];
    };
    assert.equal(capture.questionState.q1.answeredAt, input.now);
    assert.deepEqual(capture.sealed.questions.q1.answer, {
      by: input.by,
      at: input.now,
      turnCaptureId: null,
      shape: 'pickOne',
      optionId: 'none',
      otherText: null,
      isStale: true,
    });
    assert.deepEqual(capture.executionIds, input.capture.executionIds);
  };
  const gone = settleInput('f-new');
  gone.facts = new Map([['f-new', gone.facts.get('f-new') as ResolveFact]]);
  closes(gone, ['f-new']);
  const changed = settleInput('f-new');
  changed.facts.set('f-old', fact({ disputedWithId: null }));
  closes(changed, ['f-new']);
  const moved = settleInput('f-new');
  moved.facts.set('f-old', fact({ disputedWithId: 'f-other' }));
  closes(moved, ['f-new']);
  const elsewhere = settleInput('f-new');
  elsewhere.facts.set('f-old', fact({ disputedWithId: null }));
  elsewhere.facts.set('f-new', fact({ disputedWithId: 'f-other' }));
  closes(elsewhere, []);
  const answered = settleInput('f-new');
  answered.capture.questionState.q1.answeredAt = 5000;
  assert.equal(planResolve(answered).refused, 'answered');
  assert.equal(planResolve(settleInput('f-other')).refused, 'unknown');
});

test('a settle is undone by the planner: both facts go back to disputed and the corrected one goes', () => {
  const picked = planned(settleInput('f-new'));
  const execution = picked.execution as {
    effectRefs: EffectRef[];
    sealed: SealedPayload;
  };
  const effects = openForHelm(KEY, execution.sealed).effects as Effect[];
  const original = {
    id: 'e9',
    captureId: 'c1',
    actor: 'nomos',
    category: 'remember',
    state: 'succeeded',
    effectRefs: execution.effectRefs,
    effects,
    createdAt: 9000,
    undoneByExecutionId: null,
    undoesExecutionId: null,
    isUnreadable: false,
  } as unknown as OpenExecution;
  const written = (id: string, data: Record<string, unknown>) =>
    [id, { docId: id, data, opened: null }] as const;
  const afterPick = new Map([
    written('f-new', {
      ...fact(),
      ...updateOf(picked, 'f-new'),
    }),
    written('f-old', { ...fact(), ...updateOf(picked, 'f-old') }),
  ]);
  const plan = planUndo({
    original,
    targets: afterPick,
    undoExecutionId: 'u1',
    now: 12000,
    usedIds: new Set(),
  });
  assert.equal(plan.kind, 'write');
  if (plan.kind !== 'write') return;
  const byId = new Map(plan.updates.map((update) => [update.docId, update]));
  assert.equal(byId.get('f-new')?.fields.disputedWithId, 'f-old');
  assert.equal(byId.get('f-new')?.fields.supersedesId, null);
  assert.equal(byId.get('f-old')?.fields.disputedWithId, 'f-new');
  assert.equal(byId.get('f-old')?.fields.status, 'confirmed');
  assert.equal(byId.get('f-old')?.fields.supersededById, null);
  assert.equal(plan.deletes.length, 0);

  const corrected = planned(
    settleInput('none', { text: 'Centerpieces are $1,950' }),
  );
  const correctedExecution = corrected.execution as {
    effectRefs: EffectRef[];
    sealed: SealedPayload;
  };
  const afterNone = new Map([
    written('made-1', {
      ...(corrected.factCreate?.data as Record<string, unknown>),
    }),
    written('f-new', { ...fact(), ...updateOf(corrected, 'f-new') }),
    written('f-old', { ...fact(), ...updateOf(corrected, 'f-old') }),
  ]);
  const undone = planUndo({
    original: {
      ...original,
      effectRefs: correctedExecution.effectRefs,
      effects: openForHelm(KEY, correctedExecution.sealed).effects as Effect[],
    },
    targets: afterNone,
    undoExecutionId: 'u2',
    now: 12000,
    usedIds: new Set(),
  });
  assert.equal(undone.kind, 'write');
  if (undone.kind !== 'write') return;
  assert.deepEqual(
    undone.deletes.map((entry) => entry.docId),
    ['made-1'],
  );
  assert.equal(
    undone.updates.find((update) => update.docId === 'f-old')?.fields
      .disputedWithId,
    'f-new',
  );
});

const failures: string[] = [];
for (const [name, run] of tests) {
  try {
    run();
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
