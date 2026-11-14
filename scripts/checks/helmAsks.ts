import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  checkQuestionAnswer,
  planAnswerTurn,
  type AskedCapture,
} from '../../functions/src/apps/helm/nomos/answerTurn.ts';
import { type CaptureReading } from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  countOpenAsked,
  planAsks,
  settleCapture,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { createFixtureProvider } from '../../functions/src/apps/helm/nomos/fixtureProvider.ts';
import {
  normalizeNomosReply,
  readReplyLine,
} from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  buildSpokenQuestion,
  claimsWork,
} from '../../functions/src/apps/helm/nomos/summaries.ts';

const READING: CaptureReading = {
  people: [],
  places: [],
  documents: [],
  commands: [],
  isUrgent: false,
  dates: [],
  addressedAs: null,
};

const ask = (fields: Record<string, unknown>) => ({
  kind: 'ask',
  shape: 'pickOne',
  prompt: 'Which one?',
  options: [],
  ...fields,
});
const option = (label: string, extra: Record<string, unknown> = {}) => ({
  label,
  detail: null,
  recordAlias: null,
  ...extra,
});
const labels = (...names: string[]) => names.map((name) => option(name));

const read = (
  commands: unknown[],
  records?: Parameters<typeof normalizeNomosReply>[1]['records'],
) =>
  normalizeNomosReply(
    { commands },
    { reading: READING, aliases: createAliasBook('t'), records },
  );

const only = (commands: unknown[]) => {
  const { asks } = read(commands);
  assert.equal(asks.length, 1);
  return asks[0];
};

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

test("an answered question's reply is the model's own line, never first person or a template", () => {
  assert.equal(readReplyLine('  Dropped   it. '), 'Dropped it.');
  assert.equal(
    readReplyLine('Added both to the list.'),
    'Added both to the list.',
  );
  assert.equal(readReplyLine("I've dropped it."), null);
  assert.equal(readReplyLine('Dropped it for me.'), null);
  assert.equal(readReplyLine('Got it: Picked Drop it.'), null);
  assert.equal(readReplyLine(''), null);
  assert.equal(readReplyLine(null), null);
  assert.equal(readReplyLine('word '.repeat(40)), null);
  assert.equal(readReplyLine('Sent it to https://example.com.'), null);
  assert.equal(readReplyLine('Added **both**.'), null);
  assert.equal(readReplyLine('Paid $500 for it.', 'pay the vet'), null);
  assert.equal(
    readReplyLine('Added it for the 3 nights.', 'we stay 3 nights'),
    'Added it for the 3 nights.',
  );
  assert.equal(
    readReplyLine('Added 2 things to the list.'),
    'Added 2 things to the list.',
  );
  assert.equal(readReplyLine('Added it for Nov 21.', 'on saturday'), null);
  assert.equal(claimsWork('Added both to the list.'), true);
  assert.equal(claimsWork('Dropped it.'), false);
  assert.equal(claimsWork('Left it as it is.'), false);
});

test('a seventh pickOne option is cut', () => {
  const question = only([
    ask({ options: labels('a', 'b', 'c', 'd', 'e', 'f', 'g') }),
  ]);
  assert.deepEqual(
    question.options.map((entry) => entry.id),
    ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'],
  );
});

test('a one-option question is refused and the rest of the reply stands', () => {
  const reply = read([
    ask({ options: labels('only') }),
    {
      kind: 'createTask',
      ref: '$new1',
      title: 'Pack bags',
      dueSpanId: null,
      isUrgent: null,
    },
  ]);
  assert.equal(reply.asks.length, 0);
  assert.deepEqual(reply.askDropped, ['ask-invalid']);
  assert.equal(reply.commands.length, 1);
});

test('an 81-character label is cut at a word', () => {
  const long = `${'word '.repeat(16)}tail`;
  assert.ok(long.length > 80);
  const question = only([ask({ options: [option(long), option('short')] })]);
  assert.ok(question.options[0].label.length <= 80);
  assert.ok(!question.options[0].label.endsWith(' '));
  assert.ok(question.options[0].label.endsWith('word'));
});

test("the model's own None of these is dropped and code adds its own", () => {
  const question = only([
    ask({
      shape: 'pickSeveral',
      options: labels('Snow chains', 'none of these', 'Sunscreen'),
    }),
  ]);
  assert.deepEqual(
    question.options.map((entry) => [entry.id, entry.label]),
    [
      ['o1', 'Snow chains'],
      ['o2', 'Sunscreen'],
      ['none', 'None of these'],
    ],
  );
  assert.equal(question.noneOption, true);
});

test('a pickSeveral is cut at 8 and still ends with None of these', () => {
  const question = only([
    ask({
      shape: 'pickSeveral',
      options: labels('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'),
    }),
  ]);
  assert.equal(question.options.length, 9);
  assert.equal(question.options[8].id, 'none');
});

test("yesNo options are code's, whatever the model wrote", () => {
  const question = only([
    ask({ shape: 'yesNo', options: labels('Absolutely', 'Yes') }),
  ]);
  assert.deepEqual(
    question.options.map((entry) => [entry.id, entry.label]),
    [
      ['yes', 'Yes'],
      ['no', 'No'],
    ],
  );
});

test('a duplicate option is folded into the first', () => {
  const question = only([ask({ options: labels('Tahoe', ' tahoe ', 'Reno') })]);
  assert.deepEqual(
    question.options.map((entry) => entry.label),
    ['Tahoe', 'Reno'],
  );
});

test('pickRecord drops an unknown alias, resolves a known one and ends with Someone new', () => {
  const records = {
    get: (alias: string) =>
      alias === 'w1' ? { collection: 'who' as const, id: 'who-1' } : null,
  };
  const { asks } = read(
    [
      ask({
        shape: 'pickRecord',
        recordKinds: ['who', 'project'],
        options: [
          option('Sam Rivera', { recordAlias: 'w1' }),
          option('Ghost', { recordAlias: 'w9' }),
          option('Someone new', { recordAlias: 'w1' }),
        ],
      }),
    ],
    records,
  );
  assert.deepEqual(
    asks[0].options.map((entry) => [
      entry.id,
      entry.label,
      entry.ref?.id ?? null,
    ]),
    [
      ['o1', 'Sam Rivera', 'who-1'],
      ['new', 'Someone new', null],
    ],
  );
  assert.deepEqual(asks[0].recordKinds, ['who']);
});

test('a pickRecord with no record left still stands and offers a new one', () => {
  const question = only([
    ask({
      shape: 'pickRecord',
      recordKinds: ['place'],
      options: [option('Nowhere', { recordAlias: 'p9' })],
    }),
  ]);
  assert.deepEqual(
    question.options.map((entry) => entry.label),
    ['New place'],
  );
});

test('a sixth ask is dropped', () => {
  const reply = read(
    Array.from({ length: 6 }, (_, index) =>
      ask({ prompt: `Question ${index}?`, options: labels('a', 'b') }),
    ),
  );
  assert.equal(reply.asks.length, 5);
  assert.deepEqual(reply.askDropped, ['ask-extra']);
});

test('a money number is forced to cents and whole figures', () => {
  const question = only([
    ask({
      shape: 'number',
      prompt: 'How much?',
      isMoney: true,
      decimals: 2,
      numberMin: 5,
      numberMax: 500,
      unit: 'dollars',
    }),
  ]);
  assert.deepEqual(question.number, {
    min: 500,
    max: 50_000,
    unit: 'dollars',
    isMoney: true,
    decimals: 0,
  });
});

test('a reversed, infinite or huge number range refuses that question', () => {
  [
    { numberMin: 9, numberMax: 2 },
    { numberMin: 0, numberMax: 2e9 },
    { numberMin: 0, numberMax: Number.POSITIVE_INFINITY },
  ].forEach((range) => {
    const reply = read([
      ask({ shape: 'number', prompt: 'How many?', ...range }),
    ]);
    assert.equal(reply.asks.length, 0);
    assert.deepEqual(reply.askDropped, ['ask-invalid']);
  });
});

test('a unit is cut at 20 characters', () => {
  const question = only([
    ask({
      shape: 'number',
      prompt: 'How many?',
      unit: 'a really very long unit name',
    }),
  ]);
  assert.ok((question.number?.unit ?? '').length <= 20);
});

test('the 21st open asked question is refused and the rest are filed', () => {
  const [first, second] = read([
    ask({ prompt: 'One?', options: labels('a', 'b') }),
    ask({ prompt: 'Two?', options: labels('a', 'b') }),
  ]).asks;
  const open = (count: number) =>
    countOpenAsked([
      Object.fromEntries(
        Array.from({ length: count }, (_, index) => [
          `q${index}`,
          {
            kind: 'asked',
            shape: 'pickOne',
            askedAt: 1,
            answeredAt: null,
            skippedAt: index === 0 ? 5 : null,
          },
        ]),
      ),
      undefined,
    ]);
  assert.equal(open(19), 19);
  const ids = () => 'id';
  const atNineteen = planAsks({
    asks: [first, second],
    openAsked: open(19),
    now: 1,
    newId: ids,
  });
  assert.equal(atNineteen.questions.length, 1);
  assert.equal(atNineteen.isDeferred, true);
  const atTwenty = planAsks({
    asks: [first],
    openAsked: open(20),
    now: 1,
    newId: ids,
  });
  assert.equal(atTwenty.questions.length, 0);
  assert.equal(atTwenty.isDeferred, true);
  const roomy = planAsks({ asks: [first], openAsked: 3, now: 1, newId: ids });
  assert.equal(roomy.isDeferred, false);
  assert.equal(roomy.questions[0].state.kind, 'asked');
});

test('an answered question does not count against the cap', () => {
  assert.equal(
    countOpenAsked([
      {
        a: {
          kind: 'asked',
          shape: 'yesNo',
          askedAt: 1,
          answeredAt: 2,
          skippedAt: null,
        },
        b: {
          kind: 'whichPerson',
          shape: 'pickOne',
          askedAt: 1,
          answeredAt: null,
          skippedAt: null,
        },
      },
    ]),
    0,
  );
});

const pickSeveral = {
  kind: 'asked',
  builtBy: 'model',
  shape: 'pickSeveral',
  prompt: 'Which of these should go on the packing list?',
  options: [
    { id: 'o1', label: 'Snow chains' },
    { id: 'o2', label: 'Sunscreen' },
    { id: 'none', label: 'None of these' },
  ],
  allowsSomethingElse: false,
  recordKinds: [],
  dateMode: null,
  number: null,
};

const askedCapture = (overrides: Partial<AskedCapture> = {}): AskedCapture => ({
  status: 'needsYou',
  questionState: {
    q1: {
      kind: 'asked',
      shape: 'pickSeveral',
      askedAt: 1,
      answeredAt: null,
      skippedAt: null,
    },
  },
  opened: { text: 'Help me pack', questions: { q1: pickSeveral } },
  ...overrides,
});

const turn = (asked: AskedCapture | null, value: unknown) =>
  planAnswerTurn({
    asked,
    questionId: 'q1',
    value,
    words: 'Picked Snow chains',
    by: 'tap',
    turnCaptureId: 'turn-2',
    now: 9,
  });

test('a structured answer marks the question answered with its turn id', () => {
  const plan = turn(askedCapture(), {
    shape: 'pickSeveral',
    optionIds: ['o1'],
  });
  assert.equal(plan.kind, 'apply');
  if (plan.kind !== 'apply') return;
  assert.equal(plan.questionState.q1.answeredAt, 9);
  assert.equal(plan.status, 'sorted');
  const answer = (plan.sealed.questions as Record<string, { answer: unknown }>)
    .q1.answer;
  assert.deepEqual(answer, {
    by: 'tap',
    at: 9,
    turnCaptureId: 'turn-2',
    shape: 'pickSeveral',
    optionIds: ['o1'],
  });
});

test('another open question keeps the turn waiting in Needs you', () => {
  const asked = askedCapture();
  asked.questionState.q2 = {
    kind: 'asked',
    shape: 'number',
    askedAt: 1,
    answeredAt: null,
    skippedAt: 4,
  };
  const plan = turn(asked, { shape: 'pickSeveral', optionIds: ['none'] });
  assert.equal(plan.kind === 'apply' && plan.status, 'needsYou');
});

test('an answer to an answered or missing question writes nothing', () => {
  const answered = askedCapture();
  answered.questionState.q1.answeredAt = 3;
  assert.equal(
    turn(answered, { shape: 'pickSeveral', optionIds: ['o1'] }).kind,
    'stale',
  );
  assert.equal(
    turn(null, { shape: 'pickSeveral', optionIds: ['o1'] }).kind,
    'stale',
  );
  const gone = askedCapture({ opened: { text: 'x', questions: {} } });
  assert.equal(
    turn(gone, { shape: 'pickSeveral', optionIds: ['o1'] }).kind,
    'stale',
  );
});

test('a code-built question is never answered by an answer turn', () => {
  const asked = askedCapture();
  (asked.opened.questions as Record<string, unknown>).q1 = {
    ...pickSeveral,
    kind: 'whichPerson',
    builtBy: 'code',
  };
  assert.equal(
    turn(asked, { shape: 'pickSeveral', optionIds: ['o1'] }).kind,
    'stale',
  );
});

test('a bad structured answer falls back to the words', () => {
  [
    { shape: 'pickSeveral', optionIds: ['o9'] },
    { shape: 'pickSeveral', optionIds: [] },
    { shape: 'pickSeveral', optionIds: ['none', 'o1'] },
    { shape: 'pickSeveral', optionIds: ['o1'], otherText: 'fish' },
    { shape: 'yesNo', optionId: 'yes', otherText: null },
    null,
  ].forEach((value) => {
    const plan = turn(askedCapture(), value);
    assert.equal(plan.kind, 'apply');
    if (plan.kind !== 'apply') return;
    const answer = (
      plan.sealed.questions as Record<string, { answer: unknown }>
    ).q1.answer;
    assert.deepEqual(answer, {
      by: 'tap',
      at: 9,
      turnCaptureId: 'turn-2',
      shape: 'freeText',
      text: 'Picked Snow chains',
    });
  });
});

test('a skipped question stays open and nothing runs', () => {
  const asked = askedCapture();
  asked.questionState.q1.skippedAt = 5;
  const settled = settleCapture({
    mode: 'full',
    filed: 0,
    hasMore: false,
    executionId: null,
    now: 9,
    newId: () => 'x',
    opened: { text: 'x' },
    questionState: asked.questionState,
    executionIds: [],
    questions: [],
  });
  assert.equal(asked.questionState.q1.answeredAt, null);
  assert.equal(settled.questionState.q1.answeredAt, null);
});

test('asks alone leave the turn waiting and never as could-not-read', () => {
  const planned = planAsks({
    asks: read([ask({ options: labels('a', 'b') })]).asks,
    openAsked: 0,
    now: 4,
    newId: () => 'q-new',
  });
  const settled = settleCapture({
    mode: 'full',
    filed: 0,
    hasMore: false,
    executionId: null,
    now: 4,
    newId: () => 'x',
    opened: { text: 'x' },
    questionState: {},
    executionIds: [],
    questions: planned.questions,
    hadAsks: true,
  });
  assert.equal(settled.status, 'needsYou');
  assert.deepEqual(Object.keys(settled.questionState), ['q-new']);
  const sealed = settled.sealed.questions as Record<
    string,
    { kind: string; builtBy: string; heldCommands: unknown[]; answer: unknown }
  >;
  assert.equal(sealed['q-new'].kind, 'asked');
  assert.equal(sealed['q-new'].builtBy, 'model');
  assert.deepEqual(sealed['q-new'].heldCommands, []);
  assert.equal(sealed['q-new'].answer, null);
});

test('an answer turn that files nothing settles sorted', () => {
  const settled = settleCapture({
    mode: 'full',
    filed: 0,
    hasMore: false,
    executionId: null,
    now: 4,
    newId: () => 'x',
    opened: { text: 'x' },
    questionState: {},
    executionIds: [],
    isAnswerTurn: true,
    line: 'That was already answered.',
  });
  assert.equal(settled.status, 'sorted');
  assert.deepEqual((settled.sealed as { spoken?: unknown }).spoken, {
    text: 'That was already answered.',
    priority: 'reply',
    builtBy: 'code',
  });
});

const model = (fields: Record<string, unknown>) => ({
  kind: 'asked',
  builtBy: 'model',
  shape: 'pickOne',
  prompt: 'Which?',
  options: [],
  allowsSomethingElse: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  ...fields,
});

test('checkQuestionAnswer judges each shape', () => {
  const one = model({
    options: [
      { id: 'o1', label: 'A' },
      { id: 'o2', label: 'B' },
    ],
    allowsSomethingElse: true,
  });
  assert.ok(
    checkQuestionAnswer(one, {
      shape: 'pickOne',
      optionId: 'o2',
      otherText: null,
    }),
  );
  assert.equal(
    checkQuestionAnswer(one, {
      shape: 'pickOne',
      optionId: 'o3',
      otherText: null,
    }),
    null,
  );
  assert.deepEqual(
    checkQuestionAnswer(one, {
      shape: 'pickOne',
      optionId: 'other',
      otherText: 'Neither',
    }),
    { shape: 'pickOne', optionId: 'other', otherText: 'Neither' },
  );
  assert.equal(
    checkQuestionAnswer(model({ ...one, allowsSomethingElse: false }), {
      shape: 'pickOne',
      optionId: 'other',
      otherText: 'Neither',
    }),
    null,
  );
  const yesNo = model({
    shape: 'yesNo',
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
  });
  assert.ok(
    checkQuestionAnswer(yesNo, {
      shape: 'yesNo',
      optionId: 'no',
      otherText: null,
    }),
  );
  const text = model({ shape: 'freeText' });
  assert.ok(checkQuestionAnswer(text, { shape: 'freeText', text: 'hi' }));
  assert.equal(
    checkQuestionAnswer(text, { shape: 'freeText', text: 'x'.repeat(501) }),
    null,
  );
  assert.equal(
    checkQuestionAnswer(text, { shape: 'freeText', text: '  ' }),
    null,
  );
  const number = model({
    shape: 'number',
    number: { min: 1, max: 30, isMoney: false, decimals: 0 },
  });
  assert.ok(checkQuestionAnswer(number, { shape: 'number', value: 4 }));
  assert.equal(
    checkQuestionAnswer(number, { shape: 'number', value: 31 }),
    null,
  );
  assert.equal(
    checkQuestionAnswer(number, { shape: 'number', value: 2.5 }),
    null,
  );
  const money = model({
    shape: 'number',
    number: { min: null, max: null, isMoney: true, decimals: 0 },
  });
  assert.equal(
    checkQuestionAnswer(money, { shape: 'number', value: 12.5 }),
    null,
  );
  assert.ok(checkQuestionAnswer(money, { shape: 'number', value: 4000 }));
  const when = model({ shape: 'dateTime', dateMode: 'dateTime' });
  const day = 86_400_000 * 20_000;
  assert.ok(
    checkQuestionAnswer(when, { shape: 'dateTime', date: day, time: '15:00' }),
  );
  assert.equal(
    checkQuestionAnswer(when, {
      shape: 'dateTime',
      date: day + 1,
      time: '15:00',
    }),
    null,
  );
  assert.equal(
    checkQuestionAnswer(when, { shape: 'dateTime', date: day, time: '25:00' }),
    null,
  );
  assert.equal(
    checkQuestionAnswer(when, { shape: 'dateTime', date: day, time: null }),
    null,
  );
  assert.ok(
    checkQuestionAnswer(model({ shape: 'dateTime', dateMode: 'time' }), {
      shape: 'dateTime',
      date: null,
      time: '09:30',
    }),
  );
  const record = model({ shape: 'pickRecord', recordKinds: ['who'] });
  assert.ok(
    checkQuestionAnswer(record, {
      shape: 'pickRecord',
      ref: { collection: 'who', id: 'w1' },
      newName: null,
    }),
  );
  assert.equal(
    checkQuestionAnswer(record, {
      shape: 'pickRecord',
      ref: { collection: 'places', id: 'p1' },
      newName: null,
    }),
    null,
  );
  assert.ok(
    checkQuestionAnswer(record, {
      shape: 'pickRecord',
      ref: null,
      newName: 'Jo',
    }),
  );
  assert.equal(
    checkQuestionAnswer(record, {
      shape: 'pickRecord',
      ref: { collection: 'who', id: 'w1' },
      newName: 'Jo',
    }),
    null,
  );
  assert.equal(
    checkQuestionAnswer(record, {
      shape: 'pickRecord',
      ref: null,
      newName: null,
    }),
    null,
  );
});

const spoken = (
  shape: string,
  prompt: string,
  names: string[],
  extra: { id: string; label: string }[] = [],
) =>
  buildSpokenQuestion({
    shape,
    prompt,
    options: [
      ...names.map((label, index) => ({ id: `o${index + 1}`, label })),
      ...extra,
    ],
  });

test('spoken wording follows each shape', () => {
  assert.equal(
    spoken('pickOne', 'Which plan?', ['Cake tasting', 'Venue walk']),
    'Which plan? Cake tasting or Venue walk?',
  );
  assert.equal(
    spoken(
      'pickSeveral',
      'Which of these?',
      ['Cake tasting', 'Venue walk'],
      [{ id: 'none', label: 'None of these' }],
    ),
    'Which of these? Cake tasting, Venue walk, or both?',
  );
  assert.equal(
    spoken('pickSeveral', 'Which of these?', [
      'Cake tasting',
      'Venue walk',
      'Florist call',
    ]),
    'Which of these? Cake tasting, Venue walk or Florist call. You can say more than one.',
  );
  assert.equal(
    spoken('pickOne', 'Which one?', ['a', 'b', 'c', 'd', 'e', 'f']),
    'Which one? a, b, c, or one of 3 more on your screen.',
  );
  assert.equal(
    spoken('pickSeveral', 'Which?', ['a', 'b', 'c', 'd', 'e']),
    'Which? a, b, c, or one of 2 more on your screen. You can say more than one.',
  );
  assert.equal(
    spoken('yesNo', 'Should I add it to Friday?', []),
    'Should I add it to Friday?',
  );
  assert.equal(
    spoken('yesNo', 'Add it to Friday', []),
    'Add it to Friday? Yes or no?',
  );
  assert.equal(
    spoken('freeText', 'What should the note say?', []),
    'What should the note say?',
  );
  assert.equal(spoken('number', 'How many nights?', []), 'How many nights?');
  assert.equal(spoken('dateTime', 'Which day', []), 'Which day?');
  assert.equal(
    spoken(
      'pickRecord',
      'Who is it for?',
      [],
      [{ id: 'new', label: 'Someone new' }],
    ),
    'Who is it for?',
  );
});

const runFixture = async (text: string, message: string) => {
  const loop = await createFixtureProvider(text, READING).runToolLoop({
    role: 'quick',
    system: '',
    messages: [{ role: 'user', content: message }],
    mcpClient: undefined as never,
    terminalTool: undefined as never,
    limits: { maxTurns: 1, maxToolCalls: 1, maxMillis: 1000 },
  } as never);
  return normalizeNomosReply(loop.terminalInput, {
    reading: READING,
    aliases: createAliasBook('t'),
  });
};

const asyncTests: [string, () => Promise<void>][] = [
  [
    'the fixture asks the packing and the nights questions',
    async () => {
      const reply = await runFixture('Help me pack for the Tahoe trip', '');
      assert.deepEqual(
        reply.asks.map((entry) => [entry.shape, entry.prompt]),
        [
          ['pickSeveral', 'Which of these should go on the packing list?'],
          ['number', 'How many nights?'],
        ],
      );
      assert.equal(reply.asks[1].number?.max, 30);
    },
  ],
  [
    'the fixture files a task for each picked packing item and nothing for nights',
    async () => {
      const line =
        'This turn answers your question: Which of these should go on the packing list? · Options: Snow chains, Sunscreen, Board games · Answer: Picked Snow chains and Sunscreen';
      const picked = await runFixture(
        'Picked Snow chains and Sunscreen',
        `<answered_question>${JSON.stringify(line)}</answered_question>`,
      );
      assert.deepEqual(
        picked.commands.map((command) => 'title' in command && command.title),
        ['Pack snow chains', 'Pack sunscreen'],
      );
      const nights = await runFixture(
        '4 nights',
        `<answered_question>${JSON.stringify('This turn answers your question: How many nights? · Answer: 4 nights')}</answered_question>`,
      );
      assert.equal(nights.commands.length, 0);
    },
  ],
];

const failures: string[] = [];
for (const [name, run] of asyncTests) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(
      `FAIL ${name}\n${error instanceof Error ? error.stack : error}`,
    );
  }
}
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
const total = tests.length + asyncTests.length;
console.log(`${total - failures.length}/${total} passed`);
process.exit(failures.length ? 1 : 0);
