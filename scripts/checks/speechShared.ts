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
import { createDeepgramAura } from '../../functions/src/voice/providers/deepgramAura.ts';
import { createGeminiTts } from '../../functions/src/voice/providers/geminiTts.ts';
import { createGoogleTts } from '../../functions/src/voice/providers/googleTts.ts';
import { pcmToWav } from '../../functions/src/voice/providers/pcm.ts';
import type { TtsProvider } from '../../functions/src/voice/providers/types.ts';
import {
  costMicros,
  TTS_PRICES,
  type TtsProviderId,
} from '../../functions/src/voice/voiceConfig.ts';
import { toSpokenText } from '../../src/lib/speech/spokenText.ts';
import { createPlaybackQueue } from '../../src/lib/speech/voice/playbackQueue.ts';
import type { TtsAdapter } from '../../src/lib/speech/voice/types.ts';
import {
  pickListener,
  pickSpeaker,
} from '../../src/lib/speech/voice/voiceRouter.ts';
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
  new URL('../../src/hooks/useVoiceConversation.ts', import.meta.url),
  new URL('../../src/components/NaturalVoiceOption.tsx', import.meta.url),
  ...['../../functions/src/voice/', '../../scripts/voice/'].flatMap((folder) =>
    readdirSync(new URL(folder, import.meta.url), { recursive: true })
      .map(String)
      .filter((name) => /\.(tsx?|html|sh)$/.test(name))
      .map((name) => new URL(`${folder}${name}`, import.meta.url)),
  ),
];
assert.ok(sharedFiles.length >= 12, 'the shared speech files are all found');
const APP_WORDS =
  /recipe|cook|pinch|\bsteps?\b|ingredient|shopping|\bhelm\b|nomos/i;
const sharedPaths = sharedFiles.map((file) => file.pathname);
assert.ok(
  sharedPaths.some((path) =>
    path.endsWith('/lib/speech/voice/playbackQueue.ts'),
  ) &&
    sharedPaths.some((path) =>
      path.endsWith('/hooks/useVoiceConversation.ts'),
    ) &&
    sharedPaths.some((path) =>
      path.endsWith('/voice/providers/geminiTts.ts'),
    ) &&
    sharedPaths.some((path) => path.endsWith('/voice/benchmark.ts')),
  'the voice service, its hook, the providers and the benchmark are among the files scanned',
);
['a recipe', 'Helm', 'the Nomos voice'].forEach((planted) =>
  assert.ok(APP_WORDS.test(planted), `"${planted}" is caught as an app word`),
);
const VOICE_SERVICE_WORDS = new RegExp(
  `${APP_WORDS.source}|\\btasks?\\b|capture`,
  'i',
);
sharedFiles.forEach((file) => {
  const isVoiceService = /\/(functions\/src|scripts)\/voice\//.test(
    file.pathname,
  );
  const found = readFileSync(file, 'utf8').match(
    isVoiceService ? VOICE_SERVICE_WORDS : APP_WORDS,
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

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

assert.equal(
  pickListener({ isOnline: true }),
  'browser',
  'online listens with the browser',
);
assert.equal(
  pickListener({ isOnline: false }),
  'browser',
  'offline listens with the browser',
);
(
  [
    [{ isOnline: true, priority: 'ack', isNaturalVoiceReady: true }, 'natural'],
    [{ isOnline: true, priority: 'ack', isNaturalVoiceReady: false }, 'system'],
    [
      { isOnline: false, priority: 'reply', isNaturalVoiceReady: true },
      'natural',
    ],
    [
      { isOnline: true, priority: 'summary', isNaturalVoiceReady: false },
      'system',
    ],
    [
      {
        isOnline: true,
        priority: 'reply',
        isNaturalVoiceReady: false,
        isCloudAvailable: true,
      },
      'system',
    ],
  ] as const
).forEach(([input, expected]) =>
  assert.equal(
    pickSpeaker(input),
    expected,
    `${JSON.stringify(input)} speaks with ${expected}`,
  ),
);

const played: string[] = [];
const finishers = new Map<string, () => void>();
const fakeVoice: TtsAdapter = {
  id: 'fake',
  route: 'device',
  isPlayingThroughWebAudio: false,
  speak: (text, { signal, onStart }) =>
    new Promise<void>((resolve) => {
      played.push(`start ${text}`);
      onStart();
      finishers.set(text, () => {
        played.push(`end ${text}`);
        resolve();
      });
      // Ignores the signal on purpose: the queue must free its slot itself.
      signal.addEventListener('abort', () => played.push(`abort ${text}`));
    }),
};
const active: boolean[] = [];
const queue = createPlaybackQueue({
  pick: () => fakeVoice,
  onActiveChange: (isActive) => active.push(isActive),
});

const ack1 = queue.enqueue('ack one', { priority: 'ack', turnKey: 1 });
const reply1 = queue.enqueue('reply one', { priority: 'reply', turnKey: 1 });
const ack1b = queue.enqueue('ack one b', { priority: 'ack', turnKey: 1 });
await tick();
assert.deepEqual(
  played,
  ['start ack one'],
  'a reply waits for the ack that is playing',
);
finishers.get('ack one')?.();
await tick();
assert.deepEqual(
  played.slice(-2),
  ['end ack one', 'start ack one b'],
  'a later ack of the same turn goes before the waiting reply',
);
finishers.get('ack one b')?.();
await tick();
assert.equal(
  played.at(-1),
  'start reply one',
  'the reply plays after the acks',
);
assert.deepEqual(
  (await Promise.all([ack1, ack1b])).map((result) => result.status),
  ['spoken', 'spoken'],
  'a line that played to its end is spoken',
);

const ack2 = queue.enqueue('ack two', { priority: 'ack', turnKey: 2 });
await tick();
assert.deepEqual(
  played.slice(-2),
  ['abort reply one', 'start ack two'],
  'a newer turn cuts the older turn off and starts at once',
);
assert.equal(
  (await reply1).status,
  'cancelled',
  'the cut line says it was cancelled',
);
const lateReply = await queue.enqueue('late reply', {
  priority: 'reply',
  turnKey: 1,
});
assert.equal(
  lateReply.status,
  'cancelled',
  'a line of an older turn is dropped',
);
assert.equal(
  played.includes('start late reply'),
  false,
  'a dropped line never plays',
);

const waitingReply = queue.enqueue('reply two', {
  priority: 'reply',
  turnKey: 2,
});
queue.clear();
await tick();
assert.deepEqual(
  [
    (await ack2).status,
    (await waitingReply).status,
    queue.isActive(),
    active.at(-1),
  ],
  ['cancelled', 'cancelled', false, false],
  'clear stops what plays and drops what waits',
);
console.log('speechShared: voice router and playback queue checks passed');

const apiKey = 'sk-test-key-123';
interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}
const record = (
  answer: () => Response,
): { calls: Call[]; fetchImpl: typeof fetch } => {
  const calls: Call[] = [];
  return {
    calls,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return answer();
    }) as typeof fetch,
  };
};
const readAll = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const chunks: number[] = [];
  const next = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) return;
    chunks.push(...value);
    return next();
  };
  await next();
  return chunks;
};
const speakInput = {
  text: 'Hello there.',
  voiceId: 'voice-a',
  format: 'mp3' as const,
};

const deepgram = record(() => new Response(new Uint8Array([1, 2, 3])));
const deepgramSpeech = await createDeepgramAura({
  apiKey,
  fetchImpl: deepgram.fetchImpl,
}).speak(speakInput);
assert.ok(
  deepgram.calls[0].url.startsWith('https://api.deepgram.com/v1/speak?') &&
    ['model=voice-a', 'encoding=mp3', 'mip_opt_out=true'].every((part) =>
      deepgram.calls[0].url.includes(part),
    ),
  'Deepgram asks for the model, the encoding and the model-improvement opt-out',
);
assert.equal(
  deepgram.calls[0].headers.Authorization,
  `Token ${apiKey}`,
  'Deepgram is sent the key as a Token',
);
assert.deepEqual(
  deepgram.calls[0].body,
  { text: 'Hello there.' },
  'Deepgram is sent the text only',
);
assert.deepEqual(
  await readAll(deepgramSpeech.stream),
  [1, 2, 3],
  'Deepgram audio streams back as it is',
);

const toBase64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
const sse = (...chunks: number[][]) =>
  chunks
    .map(
      (chunk) =>
        `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: toBase64(chunk) } }] } }] })}\n\n`,
    )
    .join('');
const gemini = record(
  () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const text = sse([1, 2], [3, 4, 5, 6]);
          const cut = Math.floor(text.length / 3);
          controller.enqueue(new TextEncoder().encode(text.slice(0, cut)));
          controller.enqueue(new TextEncoder().encode(text.slice(cut)));
          controller.close();
        },
      }),
    ),
);
const geminiSpeech = await createGeminiTts({
  apiKey,
  fetchImpl: gemini.fetchImpl,
}).speak(speakInput);
assert.ok(
  gemini.calls[0].url.includes(
    'gemini-3.8-flash-lite-tts:streamGenerateContent',
  ) && gemini.calls[0].url.endsWith('alt=sse'),
  'Gemini streams server-sent events from its TTS model',
);
assert.equal(
  gemini.calls[0].headers['x-goog-api-key'],
  apiKey,
  'Gemini is sent the key in its own header',
);
assert.deepEqual(
  gemini.calls[0].body,
  {
    contents: [{ parts: [{ text: 'Hello there.' }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'voice-a' } },
      },
    },
  },
  'Gemini asks for audio in the chosen voice',
);
assert.deepEqual(
  await readAll(geminiSpeech.stream),
  [1, 2, 3, 4, 5, 6],
  'Gemini joins the audio of each event, even one split across reads',
);

const encode = (text: string) => new TextEncoder().encode(text);
const geminiFrom = (body: () => ReadableStream<Uint8Array>) =>
  createGeminiTts({
    apiKey,
    fetchImpl: record(() => new Response(body())).fetchImpl,
  });
const textBody = (text: string) => () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encode(text));
      controller.close();
    },
  });
const readChunks = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const next = async (): Promise<number[][]> => {
    const { done, value } = await reader.read();
    return done ? [] : [[...value], ...(await next())];
  };
  return next();
};
const rejects = (run: () => Promise<unknown>) =>
  run().then(
    () => false,
    () => true,
  );
assert.deepEqual(
  await readAll(
    (
      await geminiFrom(
        textBody(sse([1, 2], [3, 4]).replaceAll('\n', '\r\n')),
      ).speak(speakInput)
    ).stream,
  ),
  [1, 2, 3, 4],
  'Gemini reads events whose lines end in CRLF',
);
assert.deepEqual(
  await readAll(
    (
      await geminiFrom(textBody(sse([1, 2], [3, 4]).trimEnd())).speak(
        speakInput,
      )
    ).stream,
  ),
  [1, 2, 3, 4],
  'Gemini keeps a last event that has no trailing newline',
);
assert.deepEqual(
  await readAll(
    (
      await geminiFrom(
        textBody(
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: toBase64([1, 2]) } }, { inlineData: { data: toBase64([3, 4]) } }] } }] })}\n\n`,
        ),
      ).speak(speakInput)
    ).stream,
  ),
  [1, 2, 3, 4],
  'Gemini keeps every audio part of one event',
);
assert.deepEqual(
  await readChunks(
    (await geminiFrom(textBody(sse([1, 2, 3], [4, 5, 6]))).speak(speakInput))
      .stream,
  ),
  [
    [1, 2],
    [3, 4, 5, 6],
  ],
  'Gemini hands on whole 16-bit samples, carrying an odd byte to the next part',
);
const cancelled = { source: false };
const openStream = (
  await geminiFrom(
    () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encode(sse([1, 2])));
        },
        cancel() {
          cancelled.source = true;
        },
      }),
  ).speak(speakInput)
).stream;
const openReader = openStream.getReader();
await openReader.read();
await openReader.cancel();
assert.ok(
  cancelled.source,
  'cancelling the audio stream cancels the provider response',
);
assert.ok(
  await rejects(async () =>
    readAll(
      (
        await geminiFrom(textBody('data: {"candidates":[]}\n\n')).speak(
          speakInput,
        )
      ).stream,
    ),
  ),
  'a 200 answer with no audio is an error, not silence',
);
assert.ok(
  await rejects(async () =>
    readAll(
      (
        await geminiFrom(textBody('data: {"error":{"message":"x"}}\n\n')).speak(
          speakInput,
        )
      ).stream,
    ),
  ),
  'an event carrying an error ends the stream with an error',
);

const google = record(() =>
  Response.json({ audioContent: toBase64([9, 8, 7]) }),
);
const googleSpeech = await createGoogleTts({
  getAccessToken: async () => 'token-1',
  projectId: 'a-project',
  fetchImpl: google.fetchImpl,
}).speak(speakInput);
assert.equal(
  google.calls[0].url,
  'https://texttospeech.googleapis.com/v1/text:synthesize',
  'Google synthesizes through the REST endpoint',
);
assert.deepEqual(
  [
    google.calls[0].headers.Authorization,
    google.calls[0].headers['x-goog-user-project'],
  ],
  ['Bearer token-1', 'a-project'],
  'Google is sent a bearer token and the project to bill',
);
assert.deepEqual(
  google.calls[0].body,
  {
    input: { text: 'Hello there.' },
    voice: { languageCode: 'en-US', name: 'voice-a' },
    audioConfig: { audioEncoding: 'MP3' },
  },
  'Google is sent the text, the voice and the encoding',
);
assert.deepEqual(
  await readAll(googleSpeech.stream),
  [9, 8, 7],
  'Google audio comes back as the bytes of its base64',
);

assert.ok(
  await rejects(() =>
    createGoogleTts({
      getAccessToken: async () => 'token-1',
      projectId: 'a-project',
      fetchImpl: record(() => Response.json({})).fetchImpl,
    }).speak(speakInput),
  ),
  'Google without audio content is an error',
);

const unreadBodies = { deepgram: false, gemini: false, google: false };
const failingBody = (key: keyof typeof unreadBodies) =>
  record(
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encode('bad key'));
          },
          cancel() {
            unreadBodies[key] = true;
          },
        }),
        { status: 500 },
      ),
  ).fetchImpl;
await createDeepgramAura({
  apiKey,
  fetchImpl: failingBody('deepgram'),
})
  .speak(speakInput)
  .catch(() => undefined);
await createGeminiTts({ apiKey, fetchImpl: failingBody('gemini') })
  .speak(speakInput)
  .catch(() => undefined);
await createGoogleTts({
  getAccessToken: async () => 'token-1',
  projectId: 'a-project',
  fetchImpl: failingBody('google'),
})
  .speak(speakInput)
  .catch(() => undefined);
assert.deepEqual(
  unreadBodies,
  { deepgram: true, gemini: true, google: true },
  'a non-ok answer releases its body without reading it',
);

const providers: [TtsProviderId, TtsProvider][] = [
  [
    'deepgramAura',
    createDeepgramAura({
      apiKey,
      fetchImpl: record(
        () => new Response('bad key sk-test-key-123', { status: 401 }),
      ).fetchImpl,
    }),
  ],
  [
    'geminiTts',
    createGeminiTts({
      apiKey,
      fetchImpl: record(
        () => new Response('bad key sk-test-key-123', { status: 401 }),
      ).fetchImpl,
    }),
  ],
  [
    'googleTts',
    createGoogleTts({
      getAccessToken: async () => apiKey,
      projectId: 'a-project',
      fetchImpl: record(
        () => new Response('bad key sk-test-key-123', { status: 401 }),
      ).fetchImpl,
    }),
  ],
];
for (const [id, provider] of providers) {
  const error = await provider.speak(speakInput).then(
    () => null,
    (caught: Error) => caught,
  );
  assert.ok(
    error !== null &&
      error.message.includes(id) &&
      error.message.includes('401') &&
      !error.message.includes(apiKey),
    `${id} names itself and the status, never the key`,
  );
}

const wav = pcmToWav(new Uint8Array([1, 0, 2, 0]), 24_000);
const wavView = new DataView(wav.buffer);
assert.deepEqual(
  [
    new TextDecoder().decode(wav.slice(0, 4)),
    new TextDecoder().decode(wav.slice(8, 12)),
    wavView.getUint32(24, true),
    wavView.getUint16(34, true),
    wavView.getUint32(40, true),
    wav.length,
  ],
  ['RIFF', 'WAVE', 24_000, 16, 4, 48],
  'the PCM is wrapped in a 44-byte RIFF header of 24 kHz, 16-bit mono',
);

assert.equal(
  costMicros('deepgramAura', { characters: 1000, audioSeconds: 99 }),
  TTS_PRICES.deepgramAura.micros * 1000,
  'a per-character price ignores the audio length',
);
assert.equal(
  costMicros('geminiTts', { characters: 1000, audioSeconds: 60 }),
  9000,
  'a minute of Gemini audio costs about $0.009',
);
console.log('speechShared: voice provider checks passed');
