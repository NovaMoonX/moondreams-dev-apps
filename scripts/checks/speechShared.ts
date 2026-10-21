import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import {
  createListeningState,
  getListeningCue,
  getListeningEffect,
  getWaitEnd,
  recordBusy,
  reduceListening,
  type ListeningPhase,
  type ListeningState,
} from '../../src/lib/speech/listeningMode.ts';
import {
  getNaturalVoiceHost,
  isNaturalVoiceLang,
  NATURAL_VOICE_CONFIG_URL,
  NATURAL_VOICE_MODEL_URL,
} from '../../src/lib/speech/naturalVoice/config.ts';
import { splitSentences } from '../../src/lib/speech/naturalVoice/sentences.ts';
import {
  readWakePhrase,
  toPlainText,
} from '../../src/lib/speech/speechText.ts';

const sharedFiles = [
  ...readdirSync(new URL('../../src/lib/speech/', import.meta.url), {
    recursive: true,
  })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => new URL(`../../src/lib/speech/${name}`, import.meta.url)),
  new URL('../../src/hooks/useSpeechCommands.ts', import.meta.url),
  new URL('../../src/hooks/useNaturalVoice.ts', import.meta.url),
  new URL('../../src/components/NaturalVoiceOption.tsx', import.meta.url),
];
assert.ok(sharedFiles.length >= 12, 'the shared speech files are all found');
sharedFiles.forEach((file) => {
  const found = readFileSync(file, 'utf8').match(
    /recipe|cook|pinch|\bsteps?\b|ingredient|shopping/i,
  );
  assert.equal(
    found,
    null,
    `${file.pathname.split('/').slice(-2).join('/')} carries no one app's words`,
  );
});

const spellings = ['ok computer', 'okay computer', 'hey computer'];
assert.deepEqual(
  readWakePhrase('Hey, Computer! Lights on', spellings)?.rests,
  ['lights on'],
  'any list of spellings wakes, with what follows',
);
assert.deepEqual(
  readWakePhrase(['um okay computer next', 'okay computer'], spellings)?.rests,
  ['next', ''],
  'a filler may come first and each guess keeps its rank',
);
assert.equal(
  readWakePhrase('say hey computer', spellings),
  null,
  'the phrase counts only at the start',
);
assert.equal(
  readWakePhrase('computer', spellings),
  null,
  'a part of the phrase is not the phrase',
);
assert.equal(toPlainText('Chef’s  Knife!'), 'chefs knife', 'plain text');

const lockMs = 15 * 60_000;
const reduce = (
  state: ListeningState,
  ...events: Parameters<typeof reduceListening>[1][]
) =>
  events.reduce(
    (current, event) => reduceListening(current, event, { lockMs }),
    state,
  );

const waiting = reduce(createListeningState('TAP'), {
  type: 'CHOOSE',
  choice: 'WAKE',
  at: 1000,
});
assert.equal(waiting.phase, 'WAITING', 'choosing the phrase from closed waits');
const opened = reduce(waiting, { type: 'WAKE_HEARD' });
assert.deepEqual(
  [opened.phase, opened.epoch],
  ['WINDOW', 1],
  'the phrase opens a window',
);
assert.equal(
  reduce(opened, { type: 'WINDOW_ENDED' }).phase,
  'WAITING',
  'a window that ends goes back to waiting in phrase mode',
);
const locked = reduce(createListeningState('TAP'), {
  type: 'CHOOSE',
  choice: 'LOCK',
  at: 5000,
});
assert.equal(locked.lockEndsAt, 5000 + lockMs, 'the lock runs for lockMs');

const rows: [
  title: string,
  from: ListeningState,
  to: ListeningState,
  effect: 'START' | 'STOP' | null,
  cue: 'start' | null,
][] = [
  [
    'tap opens a window',
    createListeningState('TAP'),
    reduce(createListeningState('TAP'), { type: 'TAP_MIC' }),
    'START',
    'start',
  ],
  [
    'wake starts waiting',
    createListeningState('WAKE'),
    waiting,
    'START',
    'start',
  ],
  ['the phrase opens a window', waiting, opened, null, 'start'],
  [
    'a command extends the window',
    opened,
    reduce(opened, { type: 'COMMAND_HEARD' }),
    null,
    null,
  ],
  [
    'a window ending returns to waiting quietly',
    opened,
    reduce(opened, { type: 'WINDOW_ENDED' }),
    null,
    null,
  ],
  [
    'a tap turns a window off in tap mode, quietly',
    reduce(createListeningState('TAP'), { type: 'TAP_MIC' }),
    createListeningState('TAP'),
    'STOP',
    null,
  ],
  [
    'the wait running out is quiet',
    waiting,
    reduce(waiting, { type: 'WAIT_ENDED' }),
    'STOP',
    null,
  ],
  [
    'the lock running out is quiet',
    locked,
    reduce(locked, { type: 'LOCK_ENDED' }),
    'STOP',
    null,
  ],
  [
    'a refused microphone is silent',
    opened,
    reduce(opened, { type: 'ENGINE_STOPPED', reason: 'denied' }),
    'STOP',
    null,
  ],
  [
    'a broken service is silent',
    waiting,
    reduce(waiting, { type: 'ENGINE_STOPPED', reason: 'unavailable' }),
    'STOP',
    null,
  ],
];
rows.forEach(([title, from, to, effect, cue]) =>
  assert.deepEqual(
    [getListeningEffect(from, to), getListeningCue(from, to)],
    [effect, cue],
    title,
  ),
);
const phases: ListeningPhase[] = ['OFF', 'WAITING', 'WINDOW', 'LOCKED'];
phases.forEach((phase) => {
  const state = { ...createListeningState('TAP'), phase };
  assert.equal(
    getListeningCue(state, state),
    null,
    `no change of phase from ${phase} makes no cue`,
  );
});

const wait = { idleMs: 600_000, maxMs: 3_600_000 };
assert.equal(
  getWaitEnd(0, [], wait),
  600_000,
  'a wait ends after its quiet time',
);
assert.equal(
  getWaitEnd(0, [{ from: 100_000, to: 400_000 }], wait),
  900_000,
  'busy time does not count as quiet',
);
assert.equal(
  getWaitEnd(0, [{ from: 0, to: null }], wait),
  3_600_000,
  'and a wait never outlasts its maximum',
);
const spans = recordBusy(
  [],
  { enteredAt: 0, now: 50, activeCount: 0, lastFinishedAt: 40 },
  { graceMs: 120_000 },
);
assert.deepEqual(
  spans,
  [{ from: 40, to: 120_040 }],
  'a finish adds its grace once',
);
assert.deepEqual(
  recordBusy(
    spans,
    { enteredAt: 0, now: 60, activeCount: 0, lastFinishedAt: 40 },
    { graceMs: 120_000 },
  ),
  spans,
  'and not again',
);

const sentenceCases: [string, string[]][] = [
  ['', []],
  ['   ', []],
  ['Stir well.', ['Stir well.']],
  [
    'Stir the mixture until it thickens. Then take it off the heat and let it cool.',
    [
      'Stir the mixture until it thickens.',
      'Then take it off the heat and let it cool.',
    ],
  ],
  [
    'Add 2.5 cups of water and bring it to a boil slowly.',
    ['Add 2.5 cups of water and bring it to a boil slowly.'],
  ],
  [
    'Ready? Go. Now stir the pot every few seconds until it is smooth.',
    ['Ready? Go. Now stir the pot every few seconds until it is smooth.'],
  ],
  ['No stop at the end of this one', ['No stop at the end of this one']],
  [
    'One sentence. "Quoted line here." And a last longer one to end on.',
    ['One sentence. "Quoted line here."', 'And a last longer one to end on.'],
  ],
];
sentenceCases.forEach(([text, expected]) =>
  assert.deepEqual(splitSentences(text), expected, `sentences of "${text}"`),
);
const longText = Array.from({ length: 80 }, () => 'word').join(' ');
const wrapped = splitSentences(longText, { maxChars: 100 });
assert.ok(
  wrapped.length > 1 && wrapped.every((piece) => piece.length <= 100),
  'a long run is wrapped at spaces',
);
assert.equal(wrapped.join(' '), longText, 'and loses nothing');

assert.ok(isNaturalVoiceLang('en-GB') && isNaturalVoiceLang('en'), 'English');
assert.ok(!isNaturalVoiceLang('fr-FR'), 'only English for now');
assert.ok(
  NATURAL_VOICE_MODEL_URL.endsWith('.onnx') &&
    NATURAL_VOICE_CONFIG_URL === `${NATURAL_VOICE_MODEL_URL}.json`,
  'the voice file and its settings sit side by side',
);
assert.equal(
  getNaturalVoiceHost(),
  'huggingface.co',
  'the host the person is told about is the host the file comes from',
);

console.log('speechShared: all checks passed');
