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
import { toSpokenText } from '../../src/lib/speech/spokenText.ts';
import { getVoiceQuality, pickVoice } from '../../src/utils/speechUtils.ts';

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

const voice = (
  name: string,
  lang: string,
  isLocal: boolean,
  isDefault = false,
) =>
  ({
    name,
    lang,
    localService: isLocal,
    default: isDefault,
  }) as SpeechSynthesisVoice;
const pick = (voices: SpeechSynthesisVoice[], lang: string) =>
  pickVoice(voices, lang)?.name ?? null;

assert.deepEqual(
  [
    'Microsoft Aria Online (Natural) - English (United States)',
    'Samantha (Enhanced)',
    'Ava (Premium)',
    'Siri Voice 2',
    'Google US English',
    'Microsoft David Desktop',
    'Alex',
    'Fred (compact)',
    'English (America) espeak',
  ].map((name) => getVoiceQuality(voice(name, 'en-US', true))),
  [3, 3, 3, 3, 2, 0, 0, -2, -2],
  'a voice is ranked by what its name says it is',
);
assert.equal(
  pick(
    [
      voice('Microsoft David Desktop', 'en-US', true, true),
      voice(
        'Microsoft Aria Online (Natural) - English (United States)',
        'en-US',
        false,
      ),
    ],
    'en-US',
  ),
  'Microsoft Aria Online (Natural) - English (United States)',
  'a natural voice beats the default one even when it is a network voice',
);
assert.equal(
  pick(
    [
      voice('Google US English', 'en-US', false),
      voice('Samantha (Enhanced)', 'en-US', true),
    ],
    'en-US',
  ),
  'Samantha (Enhanced)',
  'a higher-ranked voice beats a lower one',
);
assert.equal(
  pick([voice('Zira', 'en-US', false), voice('David', 'en-US', true)], 'en-US'),
  'David',
  'at equal rank a voice on the device is chosen over a network voice',
);
assert.equal(
  pick(
    [voice('Alex', 'en-US', true), voice('Daniel', 'en-US', true, true)],
    'en-US',
  ),
  'Daniel',
  'at equal rank and place the browser default is chosen',
);
assert.equal(
  pick(
    [voice('Daniel (Premium)', 'en-GB', true), voice('Alex', 'en-US', true)],
    'en-US',
  ),
  'Alex',
  'the exact language wins before quality',
);
assert.equal(
  pick(
    [voice('Fred (compact)', 'en-GB', true), voice('Amelie', 'fr-FR', true)],
    'en-US',
  ),
  'Fred (compact)',
  'the same language from another region when there is no exact one',
);
assert.equal(
  pick([voice('Amelie', 'fr-FR', true)], 'en-US'),
  null,
  'no voice for the language',
);
assert.equal(pick([], 'en-US'), null, 'no voices at all');
console.log('speechShared: voice ranking checks passed');

const SPOKEN: [string, string][] = [
  ['1/2 tsp salt', 'half a teaspoon of salt'],
  ['Add 1/2 tsp salt.', 'Add half a teaspoon of salt.'],
  ['1/4 cup sugar', 'a quarter cup of sugar'],
  ['3/4 cup milk', 'three quarters of a cup of milk'],
  ['1/3 cup oil', 'a third of a cup of oil'],
  ['1 1/2 tsp vanilla', '1 and a half teaspoons of vanilla'],
  ['1½ tbsp butter', '1 and a half tablespoons of butter'],
  ['add ½ cup of water', 'add half a cup of water'],
  ['1 tbsp honey', '1 tablespoon of honey'],
  ['2 tbsp. butter, melted', '2 tablespoons of butter, melted'],
  ['Stir in 2 tbsp. Then wait.', 'Stir in 2 tablespoons. Then wait.'],
  ['2 tbsp', '2 tablespoons'],
  ['Season with 2 tsp of salt', 'Season with 2 teaspoons of salt'],
  ['2 cups flour', '2 cups of flour'],
  ['2 cups of flour', '2 cups of flour'],
  ['1 cup. Mix well.', '1 cup. Mix well.'],
  ['2 cloves garlic', '2 cloves of garlic'],
  ['8 oz cream cheese', '8 ounces of cream cheese'],
  ['1 lb beef', '1 pound of beef'],
  ['2 lbs potatoes', '2 pounds of potatoes'],
  ['250 g flour', '250 grams of flour'],
  ['1 g yeast', '1 gram of yeast'],
  ['500ml water', '500 milliliters of water'],
  ['2l stock', '2 liters of stock'],
  ['12 fl oz stock', '12 fluid ounces of stock'],
  ['2 eggs', '2 eggs'],
  ['Heat to 350°F', 'Heat to 350 degrees Fahrenheit'],
  [
    'Bake at 350 °F for 25 min.',
    'Bake at 350 degrees Fahrenheit for 25 minutes.',
  ],
  ['bake at 180°C', 'bake at 180 degrees Celsius'],
  ['Preheat to 350 degrees F.', 'Preheat to 350 degrees Fahrenheit.'],
  ['Turn it 45° to the left', 'Turn it 45 degrees to the left'],
  ['350-375°F', '350 to 375 degrees Fahrenheit'],
  [
    'Simmer 10-12 min, then rest 1 hr',
    'Simmer 10 to 12 minutes, then rest 1 hour',
  ],
  ['Rest 5 mins.', 'Rest 5 minutes.'],
  ['Wait 30 sec. Then stir.', 'Wait 30 seconds. Then stir.'],
  ['Wait 2 hrs', 'Wait 2 hours'],
  ['2-3 tbsp oil', '2 to 3 tablespoons of oil'],
  ['1-1/2 cups flour', '1 and a half cups of flour'],
  ['a 9x13 inch pan', 'a 9 by 13 inch pan'],
  ['Mix salt & pepper', 'Mix salt and pepper'],
  ['salt w/ butter', 'salt with butter'],
  ['2% milk', '2 percent milk'],
  ['~5 min', 'about 5 minutes'],
  ['spices, e.g. cumin', 'spices, for example cumin'],
  ['herbs, etc. Then stir.', 'herbs, and so on. Then stir.'],
  ['Step 2 of 3', 'Step 2 of 3'],
  ['Step 2 can wait', 'Step 2 can wait'],
  ['on 1/2/2024', 'on 1/2/2024'],
  ['5/9 of it', '5/9 of it'],
  ['1.5 cups rice', '1.5 cups of rice'],
  ['1 and a half tablespoons of butter', '1 and a half tablespoons of butter'],
  ['Cut into 1/2 inch cubes', 'Cut into half inch cubes'],
];
SPOKEN.forEach(([written, said]) => {
  assert.equal(
    toSpokenText(written),
    said,
    `"${written}" is said as "${said}"`,
  );
  assert.equal(toSpokenText(said), said, `"${said}" is already as it is said`);
});
console.log('speechShared: spoken text checks passed');
