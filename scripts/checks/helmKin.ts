import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sealForHelm } from '../../functions/src/apps/helm/helmKey.ts';
import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import type {
  CaptureReading,
  MentionRead,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import {
  planWrites,
  type KnownWhoState,
  type PeopleInput,
} from '../../functions/src/apps/helm/nomos/executeCommands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  planResolve,
  type ResolveInput,
} from '../../functions/src/apps/helm/nomos/resolveQuestion.ts';
import {
  KIN_KINDS,
  type KinOrder,
  type WhoKin,
} from '../../src/apps/helm/engine/kinKinds.ts';
import {
  normalizeKin,
  resolveKin,
  type KinBirthday,
} from '../../src/apps/helm/engine/kin.ts';
import { planReopen } from '../../src/apps/helm/nomos/planUndo.ts';
import { matchSpokenAnswer } from '../../src/apps/helm/utils/questionAnswers.ts';
import { toQuestionChoice } from '../../src/apps/helm/utils/questionChoice.ts';
import type { HelmQuestion } from '../../src/apps/helm/types.ts';

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

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const kin = (kind: WhoKin['kind'], order: KinOrder | null = null): WhoKin => ({
  kind,
  order,
});
const who = (
  id: string,
  name: string,
  extra: Partial<KnownWhoState> = {},
): KnownWhoState => ({
  id,
  kind: 'person',
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
const born = (year: number | null, month = 3, day: number | null = 3) =>
  ({ year, month, day }) as KinBirthday;
const toKinWhos = (people: KnownWhoState[]) =>
  people.map((entry) => ({ id: entry.id, kin: entry.kin ?? null }));

const SELF = 'me';
const eli = who('eli', 'Eli', { kin: kin('brother') });
const marcus = who('marcus', 'Marcus', { kin: kin('brother') });

test('only family words on the fixed list are kept, and a said word that is not on it stays a relation', () => {
  ['bro', 'stepbro', 'mom', 'half-brother', 'bestie', '', 'brother!'].forEach(
    (word) => {
      assert.equal(normalizeKin({ kind: word, order: null }), null, word);
    },
  );
  assert.deepEqual(normalizeKin({ kind: 'brother', order: 'younger' }), {
    kind: 'brother',
    order: 'younger',
  });
  assert.deepEqual(normalizeKin({ kind: 'step-daughter', order: 'older' }), {
    kind: 'stepdaughter',
    order: 'older',
  });
  assert.equal(normalizeKin('brother'), null);
  const reply = normalizeNomosReply(
    {
      commands: [],
      mentions: [
        {
          ref: '$w1',
          name: 'Dana',
          kind: 'person',
          relation: 'my half-sister',
          kin: { kind: 'half-sister', order: null },
        },
        {
          ref: '$w2',
          name: 'Eli',
          kind: 'person',
          relation: 'my younger brother',
          kin: { kind: 'brother', order: 'younger' },
        },
      ],
    },
    { reading: READING, aliases: createAliasBook('t') },
  );
  const [dana, eliRead] = reply.mentions;
  assert.equal(dana?.kin ?? null, null);
  assert.equal(dana?.relation, 'my half-sister');
  assert.deepEqual(eliRead?.kin, { kind: 'brother', order: 'younger' });
  assert.equal(eliRead?.relation, 'my younger brother');
});

test('an order is kept only on a kind that can take one', () => {
  KIN_KINDS.forEach((entry) => {
    const read = normalizeKin({ kind: entry.kind, order: 'younger' });
    assert.equal(read?.order, entry.canOrder ? 'younger' : null, entry.kind);
  });
  assert.deepEqual(
    KIN_KINDS.filter((entry) => entry.canOrder).map((entry) => entry.kind),
    [
      'sister',
      'brother',
      'sibling',
      'son',
      'daughter',
      'child',
      'stepsister',
      'stepbrother',
      'stepsibling',
      'stepson',
      'stepdaughter',
      'stepchild',
    ],
  );
});

test("the who page's picker offers only the list", () => {
  const sheet = readFileSync(
    'src/apps/helm/components/who/WhoKinSheet.tsx',
    'utf8',
  );
  assert.ok(sheet.includes('KIN_KINDS'));
  assert.ok(!/<Input\b/.test(sheet));
});

test('a said order beats a contrary derivation', () => {
  const people = [
    who('eli', 'Eli', { kin: kin('brother', 'younger') }),
    who('marcus', 'Marcus', { kin: kin('brother', 'older') }),
  ];
  const birthdays = {
    [SELF]: born(1992),
    eli: born(1980),
    marcus: born(2001),
  };
  assert.deepEqual(
    resolveKin(kin('brother', 'younger'), toKinWhos(people), birthdays, SELF),
    { kind: 'one', id: 'eli' },
  );
});

test('older or younger is derived only when both birthdays have a year', () => {
  const people = [eli, marcus];
  const ask = (
    birthdays: Record<string, KinBirthday | null>,
    order: KinOrder = 'younger',
  ) => resolveKin(kin('brother', order), toKinWhos(people), birthdays, SELF);
  assert.deepEqual(
    ask({ [SELF]: born(1992), eli: born(1995), marcus: born(1988) }),
    { kind: 'one', id: 'eli' },
  );
  assert.deepEqual(
    ask({ [SELF]: born(1992), eli: born(1995), marcus: born(1988) }, 'older'),
    { kind: 'one', id: 'marcus' },
  );
  const missing = ask({
    [SELF]: born(null),
    eli: born(1995),
    marcus: born(1988),
  });
  assert.equal(missing.kind, 'askOrder');
  const noSelf = ask({ eli: born(1995), marcus: born(1988) });
  assert.equal(noSelf.kind, 'askOrder');
  const half = ask({ [SELF]: born(1992), eli: born(1995), marcus: null });
  assert.deepEqual(half, { kind: 'one', id: 'eli' });
});

test('the same birthday is left underived', () => {
  const read = resolveKin(
    kin('brother', 'younger'),
    toKinWhos([eli]),
    { [SELF]: born(1992), eli: born(1992) },
    SELF,
  );
  assert.deepEqual(read, {
    kind: 'askOrder',
    ids: ['eli'],
    shape: 'one',
  });
});

test('oldest or youngest comes from the siblings years alone', () => {
  const people = [eli, marcus];
  assert.deepEqual(
    resolveKin(
      kin('brother', 'youngest'),
      toKinWhos(people),
      { eli: born(1995), marcus: born(1988) },
      SELF,
    ),
    { kind: 'one', id: 'eli' },
  );
  assert.deepEqual(
    resolveKin(
      kin('brother', 'oldest'),
      toKinWhos(people),
      { eli: born(1995), marcus: born(1988) },
      SELF,
    ),
    { kind: 'one', id: 'marcus' },
  );
  const unknown = resolveKin(
    kin('brother', 'oldest'),
    toKinWhos(people),
    { eli: born(1995), marcus: born(null) },
    SELF,
  );
  assert.equal(unknown.kind, 'askOrder');
  assert.equal(unknown.kind === 'askOrder' && unknown.shape, 'extreme');
});

test('a general kind takes its gendered forms, and a plain kind never takes step or in-law forms', () => {
  const people = [
    who('a', 'Ana', { kin: kin('sister') }),
    who('b', 'Ben', { kin: kin('stepbrother') }),
    who('c', 'Cy', { kin: kin('brotherInLaw') }),
  ];
  assert.deepEqual(resolveKin(kin('sibling'), toKinWhos(people), {}, SELF), {
    kind: 'one',
    id: 'a',
  });
  assert.deepEqual(resolveKin(kin('brother'), toKinWhos(people), {}, SELF), {
    kind: 'none',
  });
});

const mention = (extra: Partial<MentionRead>): MentionRead => ({
  ref: '$w1',
  name: 'x',
  kind: 'person',
  relation: null,
  species: null,
  organizationKind: null,
  ...extra,
});

const counter = () => {
  const count = { n: 0 };
  return () => {
    count.n += 1;
    return `new-${count.n}`;
  };
};

const plan = (people: Partial<PeopleInput>) =>
  planWrites({
    commands: normalizeNomosReply(
      {
        commands: [
          {
            kind: 'createTask',
            ref: null,
            taskAlias: null,
            title: 'Buy a card',
            dueSpanId: null,
            isUrgent: null,
            whoRefs: ['$w1'],
          },
        ],
        mentions: (people.mentions ?? []).map((entry) => ({ ...entry })),
      },
      { reading: READING, aliases: createAliasBook('t') },
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
      assistantNames: [],
      dayKey: '2026-11-10',
      capturedAt: 4000,
      selfWhoId: SELF,
      ...people,
    },
  });

const kinMention = (order: KinOrder | null) =>
  mention({
    name: order ? `${order} brother` : 'brother',
    kinRef: kin('brother', order),
  });

const sealedOf = (question: { sealed: unknown }) =>
  question.sealed as {
    prompt: string;
    kind: string;
    options: { id: string; label: string; detail: string | null }[];
    heldCommands: Record<string, unknown>[];
  };

test('one fit is used and named', () => {
  const result = plan({
    mentions: [kinMention('younger')],
    known: [who('eli', 'Eli', { kin: kin('brother', 'younger') })],
  });
  assert.equal(result.questions.length, 0);
  assert.deepEqual(result.creates[0].data.whoIds, ['eli']);
  assert.deepEqual(result.kinLines, ['Added for Eli: Buy a card']);
});

test('two fitting ask which one, naming them', () => {
  const result = plan({
    mentions: [kinMention(null)],
    known: [eli, marcus],
  });
  assert.equal(result.questions.length, 1);
  const question = sealedOf(result.questions[0]);
  assert.equal(question.kind, 'whichKin');
  assert.equal(question.prompt, 'Which brother: Eli or Marcus?');
  assert.deepEqual(
    question.options.map((option) => option.id),
    ['eli', 'marcus', 'none'],
  );
});

test('none of that kind asks who, with Add your brother', () => {
  const result = plan({ mentions: [kinMention(null)], known: [] });
  const question = sealedOf(result.questions[0]);
  assert.equal(question.kind, 'whichKin');
  assert.equal(question.prompt, 'Who is your brother?');
  assert.ok(
    question.options.some((option) => option.label === 'Add your brother'),
  );
});

test('an order that cannot be told is asked once per person and never asks for a birthday', () => {
  const one = plan({ mentions: [kinMention('younger')], known: [eli] });
  const [first] = one.questions;
  const question = sealedOf(first);
  assert.equal(question.kind, 'kinOrder');
  assert.equal(question.prompt, 'Is Eli younger than you?');
  assert.deepEqual(
    question.options.map((option) => option.label),
    ['Yes', 'No'],
  );
  const several = plan({
    mentions: [kinMention('younger')],
    known: [eli, marcus],
  });
  const many = sealedOf(several.questions[0]);
  assert.equal(many.prompt, 'Which of your brothers are younger than you?');
  const extreme = plan({
    mentions: [
      mention({ name: 'youngest brother', kinRef: kin('brother', 'youngest') }),
    ],
    known: [eli, marcus],
  });
  assert.equal(
    sealedOf(extreme.questions[0]).prompt,
    'Which brother is the youngest?',
  );
  [one, several, extreme, plan({ mentions: [kinMention(null)], known: [] })]
    .flatMap((result) => result.questions)
    .forEach((entry) => {
      const text = JSON.stringify(entry.sealed).toLowerCase();
      assert.ok(!text.includes('birthday') && !text.includes('born'));
    });
});

test('a private person resolves the same way', () => {
  const privateEli = who('eli', 'Eli', {
    kin: kin('brother', 'younger'),
    privacyFacts: { privateMark: 'person', isPrivacyCleared: false },
  });
  const result = plan({
    mentions: [kinMention('younger')],
    known: [privateEli],
  });
  assert.deepEqual(result.creates[0].data.whoIds, ['eli']);
});

const resolveInput = (
  question: Record<string, unknown>,
  kind: string,
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
        kind,
        shape: 'pickOne',
        askedAt: 4000,
        answeredAt: null,
        skippedAt: null,
        leftAt: null,
      },
    },
  },
  opened: { text: 'x', questions: { q1: { ...question, answer: null } } },
  tasks: new Map(
    (
      (question.heldCommands as { taskIds: string[] }[] | undefined)?.[0]
        ?.taskIds ?? []
    ).map((id) => [id, { title: 'Buy a card', whoIds: [], placeIds: [] }]),
  ),
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

const bubs = plan({
  mentions: [mention({ name: 'bubs', proposedWhoId: 'eli' })],
  known: [who('eli', 'Eli')],
});
const bubsQuestion = bubs.questions[0];

test('a new nickname asks "Is Bubs Eli?" before anything is saved', () => {
  assert.equal(bubs.questions.length, 1);
  assert.equal(bubs.whoCreates.length, 0);
  const question = sealedOf(bubsQuestion);
  assert.equal(question.kind, 'isThisWho');
  assert.equal(question.prompt, 'Is Bubs Eli?');
  assert.deepEqual(
    question.options.map((option) => option.label),
    ['Yes', 'No', 'Someone new'],
  );
  assert.deepEqual(bubs.creates[0].data.whoIds, []);
});

const openedEli = (extra: Record<string, unknown> = {}) =>
  new Map([
    [
      'eli',
      {
        opened: {
          name: 'Eli',
          aliases: [],
          refusedAliases: null,
          kin: null,
          ...extra,
        },
      },
    ],
  ]);

test('Yes saves the alias and links the held tasks', () => {
  const result = planned(
    resolveInput(
      bubsQuestion.sealed as Record<string, unknown>,
      'isThisWho',
      'eli',
      {
        whos: openedEli(),
      },
    ),
  );
  assert.deepEqual(result.taskUpdates[0].data.whoIds, ['eli']);
  assert.equal(result.whoRewrites?.length, 1);
  const effects = (
    result.execution as { effectRefs: { collection: string }[] }
  ).effectRefs.map((ref) => ref.collection);
  assert.ok(effects.includes('who'));
});

test('No links nothing, remembers the refusal, and the name is never proposed again', () => {
  const result = planned(
    resolveInput(
      bubsQuestion.sealed as Record<string, unknown>,
      'isThisWho',
      'none',
      {
        whos: openedEli(),
      },
    ),
  );
  assert.equal(result.taskUpdates.length, 0);
  assert.equal(result.whoRewrites?.length, 1);
  const again = plan({
    mentions: [mention({ name: 'bubs', proposedWhoId: 'eli' })],
    known: [who('eli', 'Eli', { refusedAliases: ['Bubs'] })],
  });
  assert.equal(again.questions.length, 0);
});

test('Someone new makes the person from the held name', () => {
  const result = planned(
    resolveInput(
      bubsQuestion.sealed as Record<string, unknown>,
      'isThisWho',
      'new',
      {
        whos: openedEli(),
      },
    ),
  );
  assert.equal(result.whoCreate?.id, 'made-1');
  assert.deepEqual(result.taskUpdates[0].data.whoIds, ['made-1']);
});

test('once Yes is saved the nickname finds the person without asking', () => {
  const again = plan({
    mentions: [mention({ name: 'Bubs' })],
    known: [who('eli', 'Eli', { aliases: ['Bubs'] })],
  });
  assert.equal(again.questions.length, 0);
  assert.deepEqual(again.creates[0].data.whoIds, ['eli']);
});

test('the answer to "Is Eli younger than you?" is saved and links the held tasks', () => {
  const asked = plan({ mentions: [kinMention('younger')], known: [eli] });
  const sealed = asked.questions[0].sealed as Record<string, unknown>;
  const withKin = new Map([
    ['eli', { opened: { name: 'Eli', kin: kin('brother') } }],
  ]);
  const yes = planned(
    resolveInput(sealed, 'kinOrder', 'yes', { whos: withKin }),
  );
  assert.deepEqual(yes.taskUpdates[0].data.whoIds, ['eli']);
  assert.equal(yes.whoRewrites?.length, 1);
  const no = planned(resolveInput(sealed, 'kinOrder', 'no', { whos: withKin }));
  assert.equal(no.taskUpdates.length, 0);
  assert.equal(no.whoRewrites?.length, 1);
  const saved = resolveKin(
    kin('brother', 'younger'),
    toKinWhos([who('eli', 'Eli', { kin: kin('brother', 'younger') })]),
    {},
    SELF,
  );
  assert.deepEqual(saved, { kind: 'one', id: 'eli' });
});

test('an answer that is not one of the options is refused', () => {
  const asked = plan({ mentions: [kinMention('younger')], known: [eli] });
  const result = planResolve(
    resolveInput(
      asked.questions[0].sealed as Record<string, unknown>,
      'kinOrder',
      'maybe',
      {
        whos: new Map(),
      },
    ),
  );
  assert.equal(result.refused, 'unknown');
});

const toQuestion = (sealed: unknown): HelmQuestion =>
  ({ ...(sealed as object), builtBy: 'code' }) as HelmQuestion;
const heard = (sealed: unknown, text: string) => {
  const question = toQuestion(sealed);
  const answer = matchSpokenAnswer(text, question, {
    now: 0,
    timeZone: 'UTC',
  });
  return answer?.kind === 'answer'
    ? toQuestionChoice(question, answer.value)
    : null;
};

test('every new question resolves by voice', () => {
  assert.deepEqual(heard(bubsQuestion.sealed, 'yes'), { optionId: 'eli' });
  assert.deepEqual(heard(bubsQuestion.sealed, 'someone new'), {
    optionId: 'new',
  });
  assert.deepEqual(heard(bubsQuestion.sealed, 'no'), { optionId: 'none' });
  const two = plan({ mentions: [kinMention(null)], known: [eli, marcus] });
  assert.deepEqual(heard(two.questions[0].sealed, 'Marcus'), {
    optionId: 'marcus',
  });
  const order = plan({ mentions: [kinMention('younger')], known: [eli] });
  assert.deepEqual(heard(order.questions[0].sealed, 'yes'), {
    optionId: 'yes',
  });
  assert.deepEqual(heard(order.questions[0].sealed, 'no'), { optionId: 'no' });
  const several = plan({
    mentions: [kinMention('younger')],
    known: [eli, marcus],
  });
  const choice = heard(several.questions[0].sealed, 'Eli and Marcus');
  assert.deepEqual(
    choice && 'optionIds' in choice ? [...choice.optionIds].sort() : null,
    ['eli', 'marcus'],
  );
});

test('taking back an answer to a new question reopens it', () => {
  ['isThisWho', 'whichKin', 'kinOrder'].forEach((kind) => {
    const reopened = planReopen(
      { questionRef: { captureId: 'c1', questionId: 'q1' } },
      {
        status: 'sorted',
        questionState: { q1: { kind, answeredAt: 5 } },
      },
    );
    assert.deepEqual(reopened, {
      'questionState.q1.answeredAt': null,
      status: 'needsYou',
    });
  });
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
