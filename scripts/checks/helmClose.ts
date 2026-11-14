import assert from 'node:assert/strict';

import { createAliasBook } from '../../functions/src/apps/helm/nomos/aliases.ts';
import {
  CLOSE_CONVERSATION_TOOL,
  DELETING_COMMANDS as SERVER_DELETING_COMMANDS,
  isShortEnoughToClose,
  type CaptureReading,
} from '../../functions/src/apps/helm/nomos/commands.ts';
import { normalizeNomosReply } from '../../functions/src/apps/helm/nomos/normalizeNomosReply.ts';
import {
  CLOSING_PHRASES,
  readClosingPhrase,
} from '../../src/lib/speech/closingPhrase.ts';
import { DELETING_COMMANDS } from '../../src/apps/helm/constants.ts';
import {
  readCloseEffects,
  readDeviceTurn,
} from '../../src/apps/helm/utils/closeConversation.ts';
import type { HelmQuestion, OpenCapture } from '../../src/apps/helm/types.ts';

const tests: [string, () => void][] = [];
const test = (name: string, run: () => void) => tests.push([name, run]);

const NOW = Date.UTC(2026, 10, 14, 17, 0);
const ZONE = 'America/Los_Angeles';

const question = (
  shape: HelmQuestion['shape'],
  options: string[] = [],
): HelmQuestion => ({
  kind: 'asked',
  builtBy: 'model',
  shape,
  prompt: 'Which one?',
  options: options.map((label, index) => ({
    id: `o${index}`,
    label,
    detail: null,
    ref: null,
  })),
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  aboutRef: null,
  answer: null,
});

const turn = (
  text: string,
  extra: Partial<Parameters<typeof readDeviceTurn>[0]> = {},
) =>
  readDeviceTurn({
    text,
    isSpoken: true,
    isTalkedOver: false,
    question: null,
    isPending: false,
    hasPage: false,
    extra: [],
    now: NOW,
    timeZone: ZONE,
    ...extra,
  });

const capture = (
  id: string,
  states: Record<string, Record<string, number | null>>,
): OpenCapture =>
  ({
    id,
    questionState: Object.fromEntries(
      Object.entries(states).map(([questionId, state]) => [
        questionId,
        { answeredAt: null, skippedAt: null, leftAt: null, ...state },
      ]),
    ),
  }) as unknown as OpenCapture;

test('every closing phrase is read whole, with fillers and a trailing name', () => {
  const all = [...CLOSING_PHRASES.dismiss, ...CLOSING_PHRASES.finish];
  all.forEach((phrase) => {
    const kind = CLOSING_PHRASES.dismiss.includes(phrase)
      ? 'dismiss'
      : 'finish';
    [phrase, `Oh, ${phrase}.`, `okay ${phrase}!`, `${phrase}, Robin`].forEach(
      (said) => {
        const read = readClosingPhrase(said, { extra: ['Robin'] });
        assert.equal(read?.position, 'whole', said);
        assert.equal(read?.kind, kind, said);
      },
    );
  });
});

test('a phrase inside a request is a request', () => {
  [
    'remind me to cancel the gym',
    'remind me to cancel',
    'stop suggesting that',
    'add thanks to my list',
    'remind me to say thank you to Dana',
    'forget that I like olives',
    'I have nothing to wear Friday',
  ].forEach((said) => assert.equal(readClosingPhrase(said), null, said));
});

test('a phrase after a retraction closes the words before it', () => {
  const read = readClosingPhrase('Add milk. Actually never mind');
  assert.deepEqual(read, {
    kind: 'dismiss',
    position: 'end',
    rest: 'Add milk',
  });
  const finish = readClosingPhrase("Buy stamps, that's all");
  assert.equal(finish?.kind, 'finish');
  assert.equal(finish?.rest, 'Buy stamps');
});

test('a finish phrase closes words only after a break, or when it is that is all', () => {
  [
    'tell Sam thank you',
    'mark the laundry all done',
    'the movie is all done',
    'add milk thank you',
  ].forEach((said) => assert.equal(readClosingPhrase(said), null, said));
  assert.deepEqual(readClosingPhrase("add milk that's all"), {
    kind: 'finish',
    position: 'end',
    rest: 'add milk',
  });
  assert.equal(readClosingPhrase('add milk. thank you')?.rest, 'add milk');
  assert.equal(readClosingPhrase('add milk, thank you')?.rest, 'add milk');
});

test('a name with an accent or an apostrophe is still a name', () => {
  assert.equal(
    readClosingPhrase('thanks, Zoë', { extra: ['Zoe'] })?.position,
    'whole',
  );
  assert.equal(
    readClosingPhrase("thanks, D'Arcy", { extra: ['darcy'] })?.position,
    'whole',
  );
  assert.equal(
    readClosingPhrase('thanks, Zoe', { extra: ['Zoë'] })?.position,
    'whole',
  );
  const read = readClosingPhrase("Café Ünï list. Thank you, D'Arcy", {
    extra: ['darcy'],
  });
  assert.equal(read?.rest, 'Café Ünï list');
});

test('a question answer beats a close, and a close ends an unanswered one', () => {
  const pick = question('pickOne', ['Nothing', 'Dana']);
  assert.equal(turn('nothing', { question: pick }).kind, 'answer');
  assert.equal(turn('Dana', { question: pick }).kind, 'answer');
  assert.equal(
    turn('never mind', { question: pick }).kind,
    'close',
    'no option says never mind',
  );
  const free = question('freeText');
  assert.equal(
    turn('forget it', { question: free }).kind,
    'close',
    'free text never swallows a close',
  );
  assert.equal(turn('the blue one', { question: free }).kind, 'answer');
});

test('a typed text answers only when it is also a closing phrase', () => {
  const yesNo = question('yesNo');
  assert.equal(turn('yes', { question: yesNo, isSpoken: false }).kind, 'send');
  assert.equal(turn('yes', { question: yesNo }).kind, 'answer');
  assert.equal(turn('forget it', { isSpoken: false }).kind, 'close');
});

test('stop is a close, or only quiets a line still waiting for an answer', () => {
  assert.equal(
    turn('stop', { isTalkedOver: true, isPending: true }).kind,
    'stopVoice',
  );
  assert.equal(turn('stop', { isTalkedOver: true }).kind, 'close');
  assert.equal(turn('stop').kind, 'close');
  assert.equal(
    turn('stop', { isTalkedOver: true, isSpoken: false, isPending: true }).kind,
    'close',
  );
});

test('cancel it goes on as a request only with a page and nothing pending', () => {
  ['cancel it', 'cancel that'].forEach((said) => {
    assert.equal(turn(said, { hasPage: true }).kind, 'send');
    assert.equal(turn(said, { hasPage: true, isPending: true }).kind, 'close');
    assert.equal(turn(said).kind, 'close');
  });
  assert.equal(turn('cancel', { hasPage: true }).kind, 'close');
});

test('undo goes first, and only when spoken', () => {
  assert.equal(turn('undo that').kind, 'undo');
  assert.notEqual(turn('undo that', { isSpoken: false }).kind, 'undo');
});

test('a finish phrase after words sends the words and does not reopen listening', () => {
  const result = turn("Add milk, that's all");
  assert.deepEqual(result, { kind: 'send', text: 'Add milk', isFinish: true });
  assert.deepEqual(turn('Add milk'), {
    kind: 'send',
    text: 'Add milk',
    isFinish: false,
  });
});

test('a close drops unsent words, leaves unfiled questions and skips filed ones', () => {
  const unfiled = capture('c1', { q1: {}, q2: { answeredAt: 5 } });
  const filed = capture('c2', {
    q3: {},
    q4: { skippedAt: 7 },
    q5: { leftAt: 9 },
  });
  const effects = readCloseEffects({
    unsentWords: ['call Dana', '  '],
    captures: [unfiled, filed],
    isFiled: (item) => item.id === 'c2',
  });
  assert.deepEqual(effects.dropWords, ['call Dana']);
  assert.deepEqual(effects.left, [{ captureId: 'c1', questionId: 'q1' }]);
  assert.deepEqual(effects.skipped, [{ captureId: 'c2', questionId: 'q3' }]);
  assert.equal(effects.hasDropped, true);
});

test('a close with nothing to drop offers no Undo', () => {
  const effects = readCloseEffects({
    unsentWords: [],
    captures: [capture('c1', { q1: { answeredAt: 1 } })],
    isFiled: () => false,
  });
  assert.deepEqual(effects, {
    dropWords: [],
    left: [],
    skipped: [],
    hasDropped: false,
  });
});

test('every closing phrase only ever leaves or skips questions', () => {
  const all = [...CLOSING_PHRASES.dismiss, ...CLOSING_PHRASES.finish];
  const captures = [capture('c1', { q1: {} }), capture('c2', { q2: {} })];
  all.forEach((phrase) => {
    const effects = readCloseEffects({
      unsentWords: [phrase],
      captures,
      isFiled: (item) => item.id === 'c2',
    });
    assert.deepEqual(Object.keys(effects).sort(), [
      'dropWords',
      'hasDropped',
      'left',
      'skipped',
    ]);
  });
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

const removal = (text: string) => {
  const keyDates = createAliasBook('d');
  const alias = keyDates.add('kd-1');
  return normalizeNomosReply(
    { commands: [{ kind: 'removeKeyDate', keyDateAlias: alias }] },
    {
      reading: READING,
      aliases: createAliasBook('t'),
      keyDates,
      keyDateNames: new Map([['kd-1', ['dana birthday', 'dana']]]),
      captureText: text,
    },
  ).keyDates;
};

test('forget it never removes a key date, naming it still does', () => {
  assert.equal(removal('ugh, forget it').length, 0);
  assert.equal(removal('forget it').length, 0);
  assert.equal(removal('never mind, doesn’t matter').length, 0);
  assert.equal(removal('forget about it, thanks').length, 0);
  assert.equal(removal('forget it, Dana').length, 1);
  assert.equal(removal("forget Dana's birthday").length, 1);
  assert.equal(removal('remove the dana birthday').length, 1);
});

test('the model closes through a tool that carries no command', () => {
  assert.equal(CLOSE_CONVERSATION_TOOL.name, 'closeConversation');
  const properties = (
    CLOSE_CONVERSATION_TOOL.inputSchema as {
      properties: Record<string, unknown>;
    }
  ).properties;
  assert.deepEqual(Object.keys(properties), ['kind']);
  assert.ok(!('commands' in properties));
});

test('a model close is accepted only for a short turn that names nothing', () => {
  const none = {
    people: [],
    places: [],
    documents: [],
    commands: [],
    isUrgent: false,
    dates: [],
    addressedAs: null,
  };
  assert.ok(isShortEnoughToClose('ugh, forget the whole thing', none));
  assert.ok(
    !isShortEnoughToClose(
      'add milk and eggs and bread to the list for the party on Saturday, never mind',
      none,
    ),
  );
  assert.ok(
    !isShortEnoughToClose("ugh, doesn't matter, remind me to call Dana", {
      ...none,
      people: [{ text: 'Dana', start: 35, end: 39 }],
    } as unknown as typeof none),
  );
});

test('the device and the server agree on which commands delete', () => {
  assert.deepEqual([...DELETING_COMMANDS], [...SERVER_DELETING_COMMANDS]);
});

const failures: string[] = [];
tests.forEach(([name, run]) => {
  try {
    run();
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}\n`, error);
  }
});
console.log(`${tests.length - failures.length}/${tests.length} passed`);
process.exit(failures.length ? 1 : 0);
