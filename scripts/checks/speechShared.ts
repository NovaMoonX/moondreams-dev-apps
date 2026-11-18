import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

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
import { isRepeatRequest } from '../../src/lib/speech/repeatRequest.ts';
import { splitSentences } from '../../src/lib/speech/naturalVoice/sentences.ts';
import { soundsLike } from '../../src/lib/speech/soundAlike.ts';
import {
  readWakePhrase,
  toPlainText,
} from '../../src/lib/speech/speechText.ts';
import {
  BARGE_IN_GATE,
  BARGE_SUPPRESS_MS,
  createSpeechGate,
  isBargeSuppressed,
} from '../../src/lib/speech/voice/bargeIn.ts';
import {
  createSpeechCache,
  withSpeechCache,
  type SpeechFetch,
} from '../../src/lib/speech/voice/speechSource.ts';
import {
  hasSameWords,
  isBargeConfirmed,
  readTurnEndDelay,
  TURN_END_COMPLETE_MS,
  TURN_END_UNFINISHED_MS,
} from '../../src/lib/speech/turnEnd.ts';
import { createDeepgramAura } from '../../functions/src/voice/providers/deepgramAura.ts';
import { createGeminiTts } from '../../functions/src/voice/providers/geminiTts.ts';
import {
  createGoogleTts,
  type SynthesisCall,
} from '../../functions/src/voice/providers/googleTts.ts';
import { grantDeepgramToken } from '../../functions/src/voice/providers/deepgram.ts';
import { pcmToWav } from '../../functions/src/voice/providers/pcm.ts';
import type { TtsProvider } from '../../functions/src/voice/providers/types.ts';
import {
  getLocalDayKey,
  planListen,
  planSpeech,
  planTranscribe,
  planTranscribeSettle,
  type ListenUsage,
} from '../../functions/src/voice/usage.ts';
import {
  costMicros,
  listenCostMicros,
  transcribeCostMicros,
  TTS_PRICES,
  VOICE_DAILY_BUDGET_CENTS,
  VOICE_UTTERANCE_MS,
  type TtsProviderId,
} from '../../functions/src/voice/voiceConfig.ts';
import { readSpeechRequest } from '../../functions/src/voice/streamSpeech.ts';
import { toSpokenText } from '../../src/lib/speech/spokenText.ts';
import {
  clearFallback,
  dismissFallback,
  readFallbacks,
  removeFallback,
  reportFallback,
  resetFallbacks,
} from '../../src/lib/fallbacks/fallbacks.ts';
import { createCloudTts } from '../../src/lib/speech/voice/cloudTts.ts';
import {
  createSpeechSource,
  isOtherVoice,
  type SpeechSource,
} from '../../src/lib/speech/voice/speechSource.ts';
import {
  createPcmSink,
  parsePcmFormat,
  toFloatSamples,
  type PcmContext,
  type PcmFormat,
} from '../../src/lib/speech/voice/pcmStream.ts';
import {
  createPlaybackQueue,
  toJoinKey,
} from '../../src/lib/speech/voice/playbackQueue.ts';
import { createDeepgramStt } from '../../src/lib/speech/voice/deepgramStream.ts';
import {
  CLOUD_LISTEN_STAGES,
  type CloudListenCause,
} from '../../src/lib/speech/voice/cloudListenStages.ts';
import {
  createVoiceTokenSource,
  type MintVoiceTokenRequest,
  type MintVoiceTokenResult,
} from '../../src/lib/speech/voice/voiceToken.ts';
import type {
  CloudHeldReason,
  FrameSource,
  TtsAdapter,
} from '../../src/lib/speech/voice/types.ts';
import type { VoiceTokenAnswer } from '../../src/lib/speech/voice/voiceToken.ts';
import {
  pickListener,
  pickSpeaker,
  pickWakeListener,
} from '../../src/lib/speech/voice/voiceRouter.ts';
import {
  isOnDeviceLang,
  ON_DEVICE_FALLBACK_KEYS,
  ON_DEVICE_FILES,
  ON_DEVICE_SIZE_MB,
} from '../../src/lib/speech/onDevice/config.ts';
import { toHeardText } from '../../src/lib/speech/onDevice/onDeviceStt.ts';
import { unloadRecognizer } from '../../src/lib/speech/onDevice/recognizer.ts';
import { removeOnDeviceModel } from '../../src/lib/speech/onDevice/modelStore.ts';
import {
  getNaturalVoiceState,
  NATURAL_VOICE_FALLBACK_KEY,
  recordSlowNaturalReading,
  removeNaturalVoice,
  unloadNaturalVoice,
} from '../../src/lib/speech/naturalVoice/naturalVoiceEngine.ts';
import {
  getVoiceQuality,
  pickVoice,
  speakText,
} from '../../src/utils/speechUtils.ts';

const sharedFiles = [
  ...readdirSync(new URL('../../src/lib/speech/', import.meta.url), {
    recursive: true,
  })
    .map(String)
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => new URL(`../../src/lib/speech/${name}`, import.meta.url)),
  new URL('../../src/hooks/useSpeechCommands.ts', import.meta.url),
  new URL('../../src/hooks/useNaturalVoice.ts', import.meta.url),
  new URL('../../src/hooks/useOnDeviceRecognition.ts', import.meta.url),
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
    sharedPaths.some((path) => path.endsWith('/voice/benchmark.ts')) &&
    sharedPaths.some((path) => path.endsWith('/voice/transcribe.ts')),
  'the voice service, its hook, the providers, the benchmark and the recording reader are among the files scanned',
);
['a recipe', 'Helm', 'the Nomos voice'].forEach((planted) =>
  assert.ok(APP_WORDS.test(planted), `"${planted}" is caught as an app word`),
);
const VOICE_SERVICE_WORDS = new RegExp(
  `${APP_WORDS.source}|\\btasks?\\b|capture`,
  'i',
);
sharedFiles
  .filter((file) => !file.pathname.endsWith('/voiceApps.ts'))
  .forEach((file) => {
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

const loose = (heard: string) => readWakePhrase(heard, [], ['Nomos'])?.rests[0];
['hey no most', 'hey nomas', 'hey gnomos', 'hey no moss', "hey nomo's"].forEach(
  (heard) =>
    assert.equal(loose(heard), '', `"${heard}" sounds like the name and wakes`),
);
['hey no', 'hey mom', 'hey nobody', 'hey norm', 'hey moms', 'no most'].forEach(
  (heard) => assert.equal(loose(heard), undefined, `"${heard}" does not wake`),
);
assert.equal(
  loose('um hey no most what is on today'),
  'what is on today',
  'a loose name keeps what follows it',
);
assert.equal(
  soundsLike('no', 'Nomos'),
  false,
  'under three letters never matches',
);

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

{
  const FRAME_SAMPLES = 480;
  const frameAt = (index: number, make: (sample: number) => number) =>
    Int16Array.from({ length: FRAME_SAMPLES }, (_, offset) =>
      Math.round(make(index * FRAME_SAMPLES + offset) * 32767),
    );
  const tone = (hz: number, amplitude: number) => (sample: number) =>
    amplitude * Math.sin((2 * Math.PI * hz * sample) / 16000);
  const voiced = (amplitude: number) => {
    const parts = [tone(180, 1), tone(540, 0.6), tone(1260, 0.3)];
    return (sample: number) =>
      (amplitude / 1.9) * parts.reduce((sum, part) => sum + part(sample), 0);
  };
  const quiet = () => 0;
  const room = (sample: number) => 0.002 * Math.sin(sample * 12.9898);
  const run = (
    signals: { frames: number; make: (sample: number) => number }[],
  ) => {
    const gate = createSpeechGate();
    const frames = signals.flatMap(({ frames: count, make }) =>
      Array.from({ length: count }, () => make),
    );
    return frames.map((make, index) => gate.push(frameAt(index, make)));
  };

  assert.ok(
    !run([{ frames: 200, make: quiet }]).some((read) => read.isTriggered),
    'silence never triggers the speech gate',
  );
  assert.ok(
    !run([{ frames: 200, make: room }]).some((read) => read.isTriggered),
    'a quiet room never triggers the speech gate',
  );
  const spoken = run([
    { frames: 30, make: room },
    { frames: 7, make: voiced(0.3) },
  ]);
  assert.equal(
    spoken.findIndex((read) => read.isTriggered),
    36,
    '200 ms of voice triggers the speech gate on its seventh frame',
  );
  const trigger = spoken[36];
  assert.equal(
    trigger.preRoll.length,
    10,
    'the pre-roll holds the last 300 ms',
  );
  assert.ok(
    trigger.preRoll
      .slice(-7)
      .every((frame) => frame.some((sample) => Math.abs(sample) > 2000)) &&
      trigger.preRoll
        .slice(0, 3)
        .every((frame) => frame.every((sample) => Math.abs(sample) < 200)),
    'the pre-roll is the quiet before the voice and then the voice itself',
  );
  assert.deepEqual(
    spoken.slice(0, 36).map((read) => read.preRoll.length),
    Array.from({ length: 36 }, () => 0),
    'nothing is handed over before the trigger',
  );
  assert.ok(
    !run([
      { frames: 30, make: room },
      { frames: 1, make: voiced(0.6) },
      { frames: 30, make: room },
      { frames: 1, make: voiced(0.6) },
      { frames: 30, make: room },
    ]).some((read) => read.isTriggered),
    'a click or two loud frames apart is not speech',
  );
  const hum = (amplitude: number) => voiced(amplitude);
  assert.ok(
    !run([{ frames: 400, make: hum(0.2) }]).some((read) => read.isTriggered),
    'a steady hum that was there when the gate opened never triggers it',
  );
  assert.ok(
    !run([
      { frames: 10, make: () => 0 },
      { frames: 400, make: hum(0.2) },
    ]).some((read) => read.isTriggered),
    'a hum that starts after the zeros of a microphone still starting never triggers it',
  );
  assert.ok(
    run([
      { frames: 40, make: () => 0 },
      { frames: 7, make: voiced(0.3) },
    ]).some((read) => read.isTriggered),
    'a voice still triggers it after a long digital silence',
  );
  const swell = (sample: number) =>
    hum(0.01 * 1.004 ** Math.floor(sample / FRAME_SAMPLES))(sample);
  assert.ok(
    !run([{ frames: 600, make: swell }]).some((read) => read.isTriggered),
    'a hum that swells slowly is followed by the noise floor and never triggers it',
  );
  assert.ok(
    !run([
      { frames: 100, make: (sample) => 0.3 * Math.sin(sample * 1.7) },
    ]).some((read) => read.isTriggered),
    'hiss outside the voice band never triggers the speech gate',
  );
  const runAt20 = (
    signals: { frames: number; make: (sample: number) => number }[],
  ) => {
    const gate = createSpeechGate({ frameMs: 20 });
    const frames = signals.flatMap(({ frames: count, make }) =>
      Array.from({ length: count }, () => make),
    );
    return frames.map((make, index) =>
      gate.push(
        Int16Array.from({ length: 320 }, (_, offset) =>
          Math.round(make(index * 320 + offset) * 32767),
        ),
      ),
    );
  };
  const spokenAt20 = runAt20([
    { frames: 45, make: room },
    { frames: 10, make: voiced(0.3) },
  ]);
  assert.equal(
    spokenAt20.findIndex((read) => read.isTriggered),
    54,
    "with the microphone's 20 ms frames, 200 ms of voice triggers the gate on its tenth frame",
  );
  assert.equal(
    spokenAt20[54]?.preRoll.length,
    15,
    'with 20 ms frames the pre-roll holds the last 300 ms',
  );
  assert.ok(
    !runAt20([
      { frames: 15, make: quiet },
      { frames: 600, make: hum(0.2) },
    ]).some((read) => read.isTriggered),
    'with 20 ms frames a hum after a microphone still starting never triggers it',
  );
  const bargeRun = (amplitude: number) => {
    const gate = createSpeechGate({ frameMs: 20, ...BARGE_IN_GATE });
    return Array.from({ length: 80 }, (_, index) =>
      gate.push(
        Int16Array.from({ length: 320 }, (_, offset) =>
          Math.round(
            (index < 30 ? room : voiced(amplitude))(index * 320 + offset) *
              32767,
          ),
        ),
      ),
    ).some((read) => read.isTriggered);
  };
  assert.ok(
    !bargeRun(0.015),
    'a voice only a little above the room does not open the barge-in gate',
  );
  assert.ok(bargeRun(0.3), 'a clear voice over a line opens the barge-in gate');
  console.log('speechShared: speech gate checks passed');
}

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

[
  'repeat that',
  'Repeat',
  'Say that again.',
  'say it again',
  'one more time',
  'come again?',
  'What was that?',
  'what did you say',
  "I didn't catch that",
  "didn't catch that",
  'I missed that',
  'Pardon?',
  'Sorry?',
  'huh?',
  'again?',
  'what?',
  'sorry, could you please say that again',
  'Hey, can you repeat that',
  'would you say it again please',
].forEach((said) =>
  assert.equal(isRepeatRequest(said), true, `"${said}" asks to hear it again`),
);
[
  'what did you say to Mom',
  'repeat the dentist reminder every week',
  'say hi again to Dana',
  'what time is the dentist',
  'remind me again on Friday',
  'sorry I missed that meeting',
  'again and again',
  '',
  '   ',
  'sorry',
].forEach((said) =>
  assert.equal(
    isRepeatRequest(said),
    false,
    `"${said}" is not a request to repeat`,
  ),
);
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

const CLOUD_ON = {
  isOnline: true,
  isCloudAllowed: true,
  isCloudHeld: false,
  hasCloud: true,
  isOnDeviceReady: false,
};
assert.equal(pickListener(CLOUD_ON), 'cloud', 'all on listens in the cloud');
assert.equal(
  pickListener({ ...CLOUD_ON, isOnDeviceReady: true }),
  'cloud',
  'the cloud still listens when allowed, with the model downloaded',
);
(
  [
    { isOnline: false },
    { isCloudAllowed: false },
    { isCloudHeld: true },
    { hasCloud: false },
  ] as const
).forEach((off) => {
  assert.equal(
    pickListener({ ...CLOUD_ON, ...off }),
    'browser',
    `${Object.keys(off)[0]} off listens with the browser`,
  );
  assert.equal(
    pickListener({ ...CLOUD_ON, ...off, isOnDeviceReady: true }),
    'onDevice',
    `${Object.keys(off)[0]} off listens on the device once the model is downloaded`,
  );
});
assert.equal(pickWakeListener({ isOnDeviceReady: true }), 'onDevice');
assert.equal(pickWakeListener({ isOnDeviceReady: false }), 'browser');
assert.ok(isOnDeviceLang('en-GB') && !isOnDeviceLang('fr-FR'));
assert.equal(
  toHeardText(['WHAT DO I HAVE TODAY', '']),
  'What do I have today',
  'the model words read as a sentence',
);
assert.equal(toHeardText(['  ', '']), '', 'silence reads as nothing');
ON_DEVICE_FILES.forEach((file) => {
  const served = readFileSync(
    new URL(`../../public${file.url}`, import.meta.url),
  );
  assert.equal(served.length, file.bytes, `${file.url} has the listed size`);
  assert.equal(
    createHash('sha256').update(served).digest('hex'),
    file.sha256,
    `${file.url} has the listed hash`,
  );
});
assert.ok(
  readFileSync(
    new URL('../../public/speech/asr/NOTICE', import.meta.url),
    'utf8',
  ).length > 0,
  'the recognizer files keep their licences beside them',
);
assert.equal(ON_DEVICE_SIZE_MB, 57, 'the size the row states is the real one');
console.log('speechShared: on-device recognition checks passed');
{
  const hook = readFileSync(
    new URL('../../src/hooks/useVoiceConversation.ts', import.meta.url),
    'utf8',
  );
  const ends = hook.match(/endConversation\(\)/g) ?? [];
  assert.ok(
    ends.length === 5,
    'a conversation ends on an end phrase, a stop, the idle gap, a newly picked voice and the start of a live conversation',
  );
  assert.match(
    hook,
    /const endConversation = \(\) => \{\s*clearLatch\(\);\s*run\.current\.voice = null;/,
    'ending a conversation resets the device stickiness and the latched voice together',
  );
  assert.match(
    hook,
    /const clearLatch = \(\) => \{\s*run\.current\.isDeviceSticky = false;\s*run\.current\.cloudFailures = 0;/,
    'the device latch and its failure count clear together',
  );
  assert.match(
    hook,
    /if \(!wasLive\) endConversation\(\);/,
    'a live conversation starts with the cloud voice tried afresh',
  );
  assert.doesNotMatch(
    hook,
    /choice !== 'cloud'[^]{0,80}isDeviceSticky = true/,
    'a line the router sent to the device (offline, not ready) never latches the device voice',
  );
  assert.match(
    hook,
    /cloudFailures >= CLOUD_FAILURES_MAX/,
    'only repeated cloud failures latch the device voice',
  );
  assert.equal(
    (hook.match(/readVoice\(\)/g) ?? []).length,
    1,
    'the voice is read in one place',
  );
  assert.match(
    hook,
    /run\.current\.voice \?\?= wanted;/,
    'the voice is kept for the conversation',
  );
  assert.match(
    hook,
    /if \(isOtherVoice\(run\.current\.voice, wanted\)\) endConversation\(\);/,
    'a voice or speed picked mid-conversation starts it afresh, so the pick is heard on the next line',
  );
  const aoede = { voiceId: 'Aoede', speed: 1 };
  assert.equal(isOtherVoice(null, aoede), false, 'no voice held yet');
  assert.equal(isOtherVoice(aoede, null), false, 'an app with no saved voice');
  assert.equal(isOtherVoice(aoede, { ...aoede }), false, 'the same pick');
  assert.equal(
    isOtherVoice(aoede, { voiceId: 'Charon', speed: 1 }),
    true,
    'a new voice',
  );
  assert.equal(
    isOtherVoice(aoede, { voiceId: 'Aoede', speed: 1.1 }),
    true,
    'a new speed',
  );
  assert.equal(
    isOtherVoice(aoede, { voiceId: null, speed: null }),
    true,
    'a cleared pick goes back to the default',
  );
  assert.match(
    hook,
    /FIRST_LINE_FIRST_BYTE_MS = 6000/,
    "a conversation's first line waits 6 s for its first byte",
  );
}
{
  const requests: MintVoiceTokenRequest[] = [];
  const state = { isFailing: false, isKeyless: false, thrown: null as unknown };
  const READY: MintVoiceTokenResult = {
    status: 'ready',
    token: 't',
    expiresAt: 1,
    provider: 'deepgram',
    model: 'm',
    mintId: 'mint-1',
  };
  const source = createVoiceTokenSource({
    appId: 'x',
    mint: async (request) => {
      requests.push(request);
      if (state.isFailing) throw state.thrown ?? new Error('offline');
      if (state.isKeyless) {
        return { status: 'held', reason: 'unavailable', detail: 'key-missing' };
      }
      return READY;
    },
  });
  source.reportClosed('a', 1000);
  const first = await source.getToken();
  assert.equal(first.status, 'ready', 'a minted token is ready');
  assert.deepEqual(requests[0].closed, [{ mintId: 'a', ms: 1000 }]);
  await source.getToken();
  assert.deepEqual(requests[1].closed, [], 'a sent report is not sent twice');
  source.reportClosed('b', 2000);
  state.isFailing = true;
  const failed = await source.getToken();
  assert.deepEqual(
    [
      failed.status,
      'reason' in failed && failed.reason,
      'cause' in failed && failed.cause.stage,
    ],
    ['held', 'unavailable', 'token request'],
    'a failed request reads as held unavailable, at the token request stage',
  );
  assert.match(
    'cause' in failed ? failed.cause.detail : '',
    /offline/,
    'a failed request keeps the error it threw',
  );
  state.thrown = Object.assign(new Error('App Check token is invalid'), {
    name: 'FirebaseError',
    code: 'functions/unauthenticated',
  });
  const refused = await source.getToken();
  assert.match(
    'cause' in refused ? refused.cause.detail : '',
    /functions\/unauthenticated FirebaseError: App Check token is invalid \(sign-in or App Check looks involved\)/,
    'a callable error keeps its code and name and says App Check or sign-in looks involved',
  );
  state.thrown = null;
  state.isFailing = false;
  await source.getToken();
  assert.deepEqual(
    requests[4].closed,
    [{ mintId: 'b', ms: 2000 }],
    'a report kept after a failed request is sent with the next one',
  );
  source.reportClosed('c', 3000);
  state.isKeyless = true;
  const keyless = await source.getToken();
  assert.deepEqual(
    'cause' in keyless && [keyless.cause.stage, keyless.cause.detail],
    [
      'token refused by the server',
      'The server answered unavailable: key-missing',
    ],
    "a server's unavailable keeps the why it stated",
  );
  state.isKeyless = false;
  await source.getToken();
  assert.deepEqual(
    requests[6].closed,
    [{ mintId: 'c', ms: 3000 }],
    'a report the server could not count (held unavailable) is sent again',
  );
}
{
  interface FakeClose {
    code: number;
    reason: string;
    wasClean: boolean;
  }
  class FakeSocket {
    static all: FakeSocket[] = [];
    static failWith: Error | null = null;
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: ((event: FakeClose) => void) | null = null;
    onmessage: (() => void) | null = null;
    constructor(
      public url: string,
      public protocols: string[],
    ) {
      if (FakeSocket.failWith) throw FakeSocket.failWith;
      FakeSocket.all.push(this);
    }
    send() {}
    close() {}
  }
  const clock = {
    next: 1,
    timers: new Map<number, { fn: () => void; ms: number }>(),
  };
  const fire = (ms: number) =>
    Array.from(clock.timers.entries())
      .filter(([, timer]) => timer.ms === ms)
      .forEach(([id, timer]) => {
        clock.timers.delete(id);
        timer.fn();
      });
  const fakeWindow = {
    setTimeout: (fn: () => void, ms: number) => {
      clock.next += 1;
      clock.timers.set(clock.next, { fn, ms });
      return clock.next;
    },
    clearTimeout: (id: number) => clock.timers.delete(id),
    setInterval: () => 0,
    clearInterval: () => undefined,
  };
  const fakeDocument = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    visibilityState: 'visible',
  };
  const prior = {
    window: Reflect.get(globalThis, 'window'),
    document: Reflect.get(globalThis, 'document'),
    socket: Reflect.get(globalThis, 'WebSocket'),
    navigator: Reflect.get(globalThis, 'navigator'),
  };
  Object.assign(globalThis, {
    window: fakeWindow,
    document: fakeDocument,
    WebSocket: FakeSocket,
  });
  const setNavigator = (value: unknown) =>
    Reflect.defineProperty(globalThis, 'navigator', {
      value,
      configurable: true,
      writable: true,
    });
  const READY_ANSWER: VoiceTokenAnswer = {
    status: 'ready',
    token: 'secret-token-value',
    expiresAt: 1,
    model: 'm',
    mintId: 'mint-9',
  };
  const microphone = (): FrameSource => ({
    preRoll: [],
    subscribe: () => undefined,
    stop: () => undefined,
  });
  const listen = (
    getToken: () => Promise<VoiceTokenAnswer>,
    { tokenWaitMs = 1500, isOwnMicrophone = false } = {},
  ) => {
    const unavailable: [CloudHeldReason | null, CloudListenCause][] = [];
    const errors: string[] = [];
    const closed: [string, number][] = [];
    const stt = createDeepgramStt({
      lang: 'en',
      getToken,
      tokenWaitMs,
      source: isOwnMicrophone ? null : microphone(),
      onUnavailable: (reason, cause) => unavailable.push([reason, cause]),
      onClosed: (mintId, ms) => closed.push([mintId, ms]),
    });
    const started = stt.start({
      onPartial: () => undefined,
      onFinal: () => undefined,
      onSpeechStart: () => undefined,
      onError: (code) => errors.push(code),
      preRoll: null,
    });
    return { unavailable, errors, closed, started };
  };
  const only = (unavailable: [CloudHeldReason | null, CloudListenCause][]) => {
    assert.equal(unavailable.length, 1, 'one failure is reported once');
    return unavailable[0]!;
  };
  const realConsole = { error: console.error, warn: console.warn };
  console.error = () => undefined;
  console.warn = () => undefined;
  try {
    const thrown = listen(() =>
      Promise.reject(
        Object.assign(new Error('Failed to fetch'), {
          name: 'FirebaseError',
          code: 'functions/unavailable',
        }),
      ),
    );
    await thrown.started;
    const [thrownReason, thrownCause] = only(thrown.unavailable);
    assert.deepEqual(
      [thrownReason, thrownCause.stage, thrownCause.detail],
      [
        null,
        CLOUD_LISTEN_STAGES.tokenRequest,
        'FirebaseError: Failed to fetch',
      ],
      'a token request that throws reports its stage and the raw error',
    );

    const refused = listen(
      createVoiceTokenSource({
        appId: 'x',
        mint: async () => {
          throw Object.assign(new Error('App Check failed'), {
            name: 'FirebaseError',
            code: 'functions/unauthenticated',
          });
        },
      }).getToken,
    );
    await refused.started;
    const [, refusedCause] = only(refused.unavailable);
    assert.deepEqual(
      [
        refusedCause.stage,
        /functions\/unauthenticated FirebaseError: App Check failed/.test(
          refusedCause.detail,
        ),
      ],
      [CLOUD_LISTEN_STAGES.tokenRequest, true],
      "a mint failure's code and message reach the listen's cause",
    );

    const keyless = listen(async () => ({
      status: 'held',
      reason: 'unavailable',
      cause: {
        stage: CLOUD_LISTEN_STAGES.tokenRefused,
        detail: 'The server answered unavailable: provider-status-401',
      },
    }));
    await keyless.started;
    const [keylessReason, keylessCause] = only(keyless.unavailable);
    assert.deepEqual(
      [keylessReason, keylessCause.stage, keylessCause.detail],
      [
        null,
        CLOUD_LISTEN_STAGES.tokenRefused,
        'The server answered unavailable: provider-status-401',
      ],
      'a token held unavailable keeps the server stated why',
    );

    const limited = listen(async () => ({
      status: 'held',
      reason: 'listenLimit',
    }));
    await limited.started;
    const [limitedReason, limitedCause] = only(limited.unavailable);
    assert.deepEqual(
      [limitedReason, limitedCause.stage, limitedCause.detail],
      [
        'listenLimit',
        CLOUD_LISTEN_STAGES.tokenHeld,
        'The server held this listen: listenLimit',
      ],
      'a token held by a limit names the limit',
    );

    const slow = listen(() => new Promise<VoiceTokenAnswer>(() => undefined), {
      tokenWaitMs: 1234,
    });
    fire(1234);
    await slow.started;
    const [, slowCause] = only(slow.unavailable);
    assert.deepEqual(
      [slowCause.stage, slowCause.detail, slowCause.facts],
      [
        CLOUD_LISTEN_STAGES.tokenTimeout,
        'No token within 1234 ms',
        ['Waited: 1234 ms'],
      ],
      'a token that never arrives reports the wait it hit',
    );

    const closed = listen(async () => READY_ANSWER);
    await closed.started;
    FakeSocket.all.at(-1)!.onclose?.({
      code: 1006,
      reason: '',
      wasClean: false,
    });
    const [, closedCause] = only(closed.unavailable);
    assert.deepEqual(
      [closedCause.stage, closedCause.detail, closedCause.facts],
      [
        CLOUD_LISTEN_STAGES.socketClosed,
        'Close code 1006, reason none, not clean',
        ['Close code: 1006', 'Close reason: none', 'Closed cleanly: no'],
      ],
      'a socket closed before it opened reports its close code',
    );

    const errored = listen(async () => READY_ANSWER);
    await errored.started;
    const erroredSocket = FakeSocket.all.at(-1)!;
    erroredSocket.onerror?.();
    assert.equal(
      errored.unavailable.length,
      0,
      'an error event waits for the close that carries the code',
    );
    erroredSocket.onclose?.({ code: 1006, reason: 'bad', wasClean: false });
    const [, erroredCause] = only(errored.unavailable);
    assert.deepEqual(
      [erroredCause.stage, erroredCause.detail],
      [
        CLOUD_LISTEN_STAGES.socketError,
        'Close code 1006, reason "bad", not clean, after an error event',
      ],
      'a socket error before open reports the close code that followed',
    );

    const unopened = listen(async () => READY_ANSWER);
    await unopened.started;
    fire(3000);
    const [, unopenedCause] = only(unopened.unavailable);
    assert.deepEqual(
      [unopenedCause.stage, unopenedCause.detail, unopenedCause.facts],
      [
        CLOUD_LISTEN_STAGES.socketOpenTimeout,
        'Not open after 3000 ms',
        ['Waited: 3000 ms'],
      ],
      'a socket that never opens reports the wait it hit',
    );

    setNavigator({
      mediaDevices: {
        getUserMedia: async () => {
          throw new DOMException('Device in use', 'NotReadableError');
        },
      },
    });
    const busy = listen(async () => READY_ANSWER, { isOwnMicrophone: true });
    await busy.started;
    const [, busyCause] = only(busy.unavailable);
    assert.deepEqual(
      [busyCause.stage, busyCause.detail],
      [CLOUD_LISTEN_STAGES.microphoneOpen, 'NotReadableError: Device in use'],
      'a microphone refused for another reason reports the browser error',
    );

    setNavigator({
      mediaDevices: {
        getUserMedia: async () => ({ getTracks: () => [] }),
      },
    });
    const noCapture = listen(
      () => new Promise<VoiceTokenAnswer>(() => undefined),
      { isOwnMicrophone: true },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    fire(1500);
    await noCapture.started;
    assert.ok(
      noCapture.unavailable.length > 0 &&
        noCapture.unavailable.every(
          ([, cause]) =>
            cause.stage === CLOUD_LISTEN_STAGES.microphoneCapture ||
            cause.stage === CLOUD_LISTEN_STAGES.tokenTimeout,
        ),
      'a microphone capture that does not start reports its own stage',
    );
    assert.ok(
      noCapture.unavailable.some(
        ([, cause]) => cause.stage === CLOUD_LISTEN_STAGES.microphoneCapture,
      ),
      'the capture failure is the first cause',
    );
    FakeSocket.failWith = new SyntaxError(
      "Failed to construct 'WebSocket': The subprotocol 'secret-token-value' is invalid.",
    );
    const unbuilt = listen(async () => READY_ANSWER);
    await unbuilt.started;
    FakeSocket.failWith = null;
    const [, unbuiltCause] = only(unbuilt.unavailable);
    assert.deepEqual(
      [unbuiltCause.stage, unbuiltCause.detail, unbuilt.closed],
      [CLOUD_LISTEN_STAGES.socketConstruct, 'SyntaxError', [['mint-9', 0]]],
      "a socket that cannot be built reports its name only, and the token's mint is released",
    );
    assert.equal(
      JSON.stringify(unbuilt.unavailable).includes('secret-token-value'),
      false,
      'a constructor message that quotes the token never reaches the cause',
    );
    assert.equal(
      JSON.stringify(
        [thrown, refused, keyless, limited, slow, closed, errored].map(
          ({ unavailable }) => unavailable,
        ),
      ).includes('secret-token-value'),
      false,
      'no cause holds the token',
    );
  } finally {
    console.error = realConsole.error;
    console.warn = realConsole.warn;
    Object.entries({
      window: prior.window,
      document: prior.document,
      WebSocket: prior.socket,
    }).forEach(([key, value]) => {
      if (value === undefined) Reflect.deleteProperty(globalThis, key);
      else Reflect.set(globalThis, key, value);
    });
    if (prior.navigator === undefined) {
      Reflect.deleteProperty(globalThis, 'navigator');
    } else setNavigator(prior.navigator);
  }
  console.log('speechShared: cloud listening failure cause checks passed');
}
{
  resetFallbacks();
  // @ts-expect-error a report without its cause does not compile
  reportFallback({
    key: 'no-cause',
    feature: 'f',
    wanted: 'w',
    used: 'u',
    reason: 'r',
  });
  resetFallbacks();
  const warned: string[] = [];
  const realWarn = console.warn;
  console.warn = (message: string) => warned.push(message);
  reportFallback({
    key: 'empty',
    feature: 'f',
    wanted: 'w',
    used: 'u',
    reason: 'r',
    cause: { stage: 'a stage', detail: '' },
  });
  console.warn = realWarn;
  const [shown] = readFallbacks();
  assert.deepEqual(
    [shown?.cause, warned.length],
    [{ stage: 'a stage', detail: '' }, 0],
    'the cause is kept as reported (the empty-detail warning is for local builds only)',
  );
  resetFallbacks();
}
const SPEAKER_ON = {
  isOnline: true,
  priority: 'reply',
  isNaturalVoiceReady: false,
  isCloudAllowed: true,
  isCloudHeld: false,
  hasCloud: true,
  isDeviceSticky: false,
} as const;
assert.equal(
  pickSpeaker(SPEAKER_ON),
  'cloud',
  'a reply with all on is spoken in the cloud',
);
assert.equal(
  pickSpeaker({ ...SPEAKER_ON, priority: 'summary' }),
  'cloud',
  'a summary is spoken in the cloud',
);
assert.equal(
  pickSpeaker({ ...SPEAKER_ON, priority: 'ack', isNaturalVoiceReady: true }),
  'natural',
  'an ack never goes to the cloud',
);
assert.equal(
  pickSpeaker({ ...SPEAKER_ON, priority: 'ack' }),
  'system',
  'an ack goes to the system voice when the natural one is not ready',
);
(
  [
    { isOnline: false },
    { isCloudAllowed: false },
    { isCloudHeld: true },
    { hasCloud: false },
    { isDeviceSticky: true },
  ] as const
).forEach((off) => {
  const key = Object.keys(off)[0];
  assert.equal(
    pickSpeaker({ ...SPEAKER_ON, ...off }),
    'system',
    `${key} off speaks with the system voice`,
  );
  assert.equal(
    pickSpeaker({ ...SPEAKER_ON, ...off, isNaturalVoiceReady: true }),
    'natural',
    `${key} off speaks with the natural voice when it is ready`,
  );
});

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

{
  resetFallbacks();
  const report = (key: string, reason = 'it broke') =>
    reportFallback({
      key,
      feature: 'Speaking',
      wanted: 'your chosen voice',
      used: "this device's voice",
      reason,
      cause: { stage: 'a stage', detail: 'a raw error' },
    });
  report('a');
  report('a', 'it broke again');
  report('b');
  assert.deepEqual(
    readFallbacks()
      .map(({ key, count, reason }) => [key, count, reason])
      .sort(),
    [
      ['a', 2, 'it broke again'],
      ['b', 1, 'it broke'],
    ],
    'the same key is one entry that counts and keeps the latest reason',
  );
  const before = readFallbacks();
  assert.equal(
    readFallbacks(),
    before,
    'the snapshot is stable until a change',
  );
  clearFallback('b');
  assert.deepEqual(
    ['a', 'b'].map(
      (key) =>
        readFallbacks().find((entry) => entry.key === key)?.recoveredAt ===
        null,
    ),
    [true, false],
    'a recovered key stays, marked recovered; the other stays active',
  );
  assert.equal(
    readFallbacks().find(({ key }) => key === 'b')?.reason,
    'it broke',
    'a recovered entry keeps its reason',
  );
  const snapshot = readFallbacks();
  clearFallback('b');
  assert.equal(
    readFallbacks(),
    snapshot,
    'clearing an already recovered key changes nothing',
  );
  report('b');
  assert.equal(
    readFallbacks().find(({ key }) => key === 'b')?.recoveredAt,
    null,
    'a recovered entry that fails again is active again',
  );
  assert.equal(
    readFallbacks().find(({ key }) => key === 'b')?.count,
    2,
    'and keeps counting',
  );
  removeFallback('b');
  assert.deepEqual(
    readFallbacks().map(({ key }) => key),
    ['a'],
    'removing the preferred route deletes the entry',
  );
  clearFallback('zzz');
  removeFallback('zzz');
  dismissFallback('a', 'it broke again');
  assert.equal(readFallbacks().length, 0, 'a dismissed cause is hidden');
  report('a', 'it broke again');
  assert.equal(
    readFallbacks().length,
    0,
    'the same cause again stays hidden for the session',
  );
  report('a', 'something else broke');
  assert.deepEqual(
    readFallbacks().map(({ key, reason }) => [key, reason]),
    [['a', 'something else broke']],
    'a different cause under a dismissed key shows again',
  );
  report('a', 'it broke again');
  assert.equal(
    readFallbacks().length,
    0,
    'a dismissed cause stays dismissed after another cause came and went',
  );
  resetFallbacks();
  reportFallback({
    key: 'f',
    feature: 'Speaking',
    wanted: 'a',
    used: 'b',
    reason: 'first',
    cause: { stage: 's', detail: 'd' },
    facts: ['Error: raw'],
    trace: 'the trace',
  });
  reportFallback({
    key: 'f',
    feature: 'Speaking',
    wanted: 'a',
    used: 'b',
    reason: 'first',
    cause: { stage: 's', detail: 'd' },
  });
  assert.deepEqual(
    [readFallbacks()[0]?.facts, readFallbacks()[0]?.trace],
    [['Error: raw'], 'the trace'],
    'a later report of the same reason with no facts keeps the earlier facts and trace',
  );
  reportFallback({
    key: 'f',
    feature: 'Speaking',
    wanted: 'a',
    used: 'b',
    reason: 'second',
    cause: { stage: 's', detail: 'd' },
  });
  assert.deepEqual(
    [readFallbacks()[0]?.facts, readFallbacks()[0]?.trace],
    [[], null],
    'a different reason does not keep the earlier reason facts or trace',
  );
  reportFallback({
    key: 'f',
    feature: 'Speaking',
    wanted: 'a',
    used: 'b',
    reason: 'third',
    cause: { stage: 's', detail: 'd' },
    facts: ['Error: newer'],
  });
  assert.deepEqual(
    readFallbacks()[0]?.facts,
    ['Error: newer'],
    'a later report with facts replaces them',
  );
  resetFallbacks();
  report('c');
  assert.deepEqual(
    readFallbacks().map(({ key }) => key),
    ['c'],
    'other keys still show',
  );
  resetFallbacks();
  report('a');
  assert.equal(
    readFallbacks().length,
    1,
    'a new session starts with nothing dismissed',
  );
  resetFallbacks();

  const reportKeys = (keys: string[]) =>
    keys.forEach((key) => report(key, 'it failed'));
  const onDeviceKeys = Object.values(ON_DEVICE_FALLBACK_KEYS);
  reportKeys([...onDeviceKeys, 'other']);
  unloadRecognizer();
  assert.deepEqual(
    readFallbacks()
      .map(({ key }) => key)
      .sort(),
    [
      ON_DEVICE_FALLBACK_KEYS.download,
      ON_DEVICE_FALLBACK_KEYS.storage,
      'other',
    ].sort(),
    'freeing the model deletes its model and listen reports only',
  );
  Object.assign(globalThis, {
    caches: {
      delete: async () => true,
      open: async () => ({ delete: async () => true }),
    },
  });
  reportKeys(onDeviceKeys);
  await removeOnDeviceModel();
  assert.deepEqual(
    readFallbacks().map(({ key }) => key),
    ['other'],
    'removing the downloaded model deletes every on-device report',
  );
  resetFallbacks();
  recordSlowNaturalReading();
  recordSlowNaturalReading();
  const slow = readFallbacks().filter(
    ({ key }) => key === NATURAL_VOICE_FALLBACK_KEY,
  );
  assert.deepEqual(
    [slow.length, slow[0]?.count, getNaturalVoiceState().problem],
    [1, 1, 'slow'],
    'the natural voice reports being too slow once, when it is set aside',
  );
  unloadNaturalVoice();
  assert.equal(
    readFallbacks().length,
    0,
    'turning the natural voice off deletes its report',
  );
  recordSlowNaturalReading();
  recordSlowNaturalReading();
  await removeNaturalVoice();
  assert.equal(
    readFallbacks().length,
    0,
    'removing the natural voice deletes its report',
  );
  resetFallbacks();

  const cloudKey = 'speech:cloud-voice';
  const system: TtsAdapter = {
    id: 'system',
    route: 'device',
    isPlayingThroughWebAudio: false,
    speak: async () => undefined,
  };
  const speakOptions = () => ({
    priority: 'reply' as const,
    signal: new AbortController().signal,
    onStart: () => undefined,
    onEnd: () => undefined,
  });
  const played = {
    decode: async () => ({}) as AudioBuffer,
    play: async (
      _audio: AudioBuffer,
      _signal: AbortSignal,
      onStart: () => void,
    ) => onStart(),
    openStream: async () => {
      throw new Error('not a stream');
    },
  };
  const mpeg = (): SpeechFetch => ({
    status: 'ready',
    provider: 'googleTts',
    contentType: 'audio/mpeg',
    body: new ReadableStream<Uint8Array>({
      start: (stream) => {
        stream.enqueue(new Uint8Array([1]));
        stream.close();
      },
    }),
  });
  const fallbacks: string[] = [];
  await createCloudTts({
    source: {
      fetchSpeech: async () => ({ status: 'unavailable', detail: 'HTTP 500' }),
    },
    fallback: system,
    onFallback: () => fallbacks.push('fell'),
  }).speak('Hello', speakOptions());
  const [cloudReport] = readFallbacks();
  assert.equal(
    cloudReport?.key,
    cloudKey,
    'a cloud line that fell back is reported',
  );
  assert.equal(
    cloudReport?.reason,
    "the voice service couldn't be reached",
    'the report says why in plain words',
  );
  assert.deepEqual(
    [cloudReport?.cause, cloudReport?.facts.includes('Stood in: system')],
    [{ stage: 'speech request', detail: 'HTTP 500' }, true],
    'the report keeps the stage, the raw cause and what stood in',
  );
  await createCloudTts({
    source: { fetchSpeech: () => new Promise<never>(() => undefined) },
    fallback: system,
    firstByteMs: 10,
  }).speak('Hello again', speakOptions());
  assert.deepEqual(
    [readFallbacks()[0]?.count, readFallbacks()[0]?.reason],
    [2, "the voice service didn't answer in time"],
    'a second failure updates the same entry',
  );
  await createCloudTts({
    source: {
      fetchSpeech: async () => ({ status: 'held', reason: 'speechLimit' }),
    },
    fallback: system,
  }).speak('Held', speakOptions());
  assert.equal(
    readFallbacks()[0]?.reason,
    "today's cloud voice allowance is used up",
    'a spent allowance is reported as the reason',
  );
  await createCloudTts({
    source: { fetchSpeech: async () => mpeg() },
    fallback: system,
    player: played,
  }).speak('Fine', speakOptions());
  assert.notEqual(
    readFallbacks().find(({ key }) => key === cloudKey)?.recoveredAt ?? null,
    null,
    'a cloud line that plays marks the report recovered and keeps it',
  );
  resetFallbacks();
  await createCloudTts({
    source: {
      fetchSpeech: async () => ({ status: 'unavailable', detail: 'HTTP 500' }),
    },
    fallback: system,
    reportsFallback: false,
  }).speak('Sample', speakOptions());
  await createCloudTts({
    source: { fetchSpeech: async () => mpeg() },
    fallback: system,
    player: played,
    reportsFallback: false,
  }).speak('Sample', speakOptions());
  assert.equal(
    readFallbacks().length,
    0,
    'a line that opts out reports and clears nothing',
  );
  reportFallback({
    key: cloudKey,
    feature: 'Speaking',
    wanted: 'w',
    used: 'u',
    reason: 'r',
    cause: { stage: 's', detail: 'd' },
  });
  await createCloudTts({
    source: { fetchSpeech: async () => mpeg() },
    fallback: system,
    player: played,
    reportsFallback: false,
  }).speak('Sample', speakOptions());
  assert.equal(
    readFallbacks()[0]?.recoveredAt,
    null,
    'a preview that plays leaves the real report alone',
  );
  resetFallbacks();

  const voices = { current: 'cloud' as 'cloud' | 'device' };
  const gate: { release: () => void } = { release: () => undefined };
  const routed = createPlaybackQueue({
    pick: (priority) => ({
      id: priority,
      route: 'cloud',
      isPlayingThroughWebAudio: true,
      get isFallingBack() {
        return voices.current === 'device';
      },
      speak: () => new Promise<void>((resolve) => (gate.release = resolve)),
    }),
  });
  assert.equal(routed.getPlayingVoice(), null, 'nothing plays, no voice');
  void routed.enqueue('Reply', { priority: 'reply', turnKey: 1 });
  assert.deepEqual(
    routed.getPlayingVoice(),
    { priority: 'reply', route: 'cloud' },
    'a cloud line that is sounding is the cloud route',
  );
  voices.current = 'device';
  assert.deepEqual(
    routed.getPlayingVoice(),
    { priority: 'reply', route: 'device' },
    'a cloud line a device voice took over is the device route',
  );
  gate.release();
  await tick();
  routed.clear();
  console.log('speechShared: fallback reporting checks passed');
}

{
  const calls: string[] = [];
  const held: string[] = [];
  const fallback: TtsAdapter = {
    id: 'system',
    route: 'device',
    isPlayingThroughWebAudio: false,
    speak: async (text) => {
      calls.push(text);
    },
  };
  const controller = new AbortController();
  const options = {
    priority: 'reply' as const,
    signal: controller.signal,
    onStart: () => undefined,
    onEnd: () => undefined,
  };
  const fetched: string[] = [];
  const cloudWith = (
    fetchSpeech: SpeechSource['fetchSpeech'],
    firstByteMs = 20,
  ) =>
    createCloudTts({
      source: {
        fetchSpeech: (text, priority, signal) => {
          fetched.push(text);
          return fetchSpeech(text, priority, signal);
        },
      },
      fallback,
      firstByteMs,
      onHeld: (reason) => held.push(reason),
    });
  const heldResult = await cloudWith(async () => ({
    status: 'held',
    reason: 'speechLimit',
  })).speak('Hello there', options);
  assert.equal(heldResult, 'system', 'a held answer is spoken by the fallback');
  assert.deepEqual(held, ['speechLimit'], 'a held answer reports its reason');
  assert.equal(
    await cloudWith(async () => ({
      status: 'unavailable',
      detail: 'HTTP 500',
    })).speak('Two', options),
    'system',
    'an unavailable answer is spoken by the fallback',
  );
  assert.equal(
    await cloudWith(() => new Promise<never>(() => undefined)).speak(
      'Three',
      options,
    ),
    'system',
    'a source that never answers falls back after the first-byte clock',
  );
  const fetchedBefore = fetched.length;
  assert.equal(
    await cloudWith(async () => ({
      status: 'unavailable',
      detail: 'HTTP 500',
    })).speak('word '.repeat(130), options),
    'system',
    'a long text whose cloud voice fails is spoken by the fallback',
  );
  assert.equal(
    fetched.length - fetchedBefore,
    1,
    'a long text is tried in the cloud first, one piece at a time',
  );
  const sentence = 'This is one sentence of a long reply. ';
  const longText = sentence.repeat(40);
  const pieceFetches: string[] = [];
  const pieceStarts: number[] = [];
  const longBy = await createCloudTts({
    source: {
      fetchSpeech: async (piece) => {
        pieceFetches.push(piece);
        return {
          status: 'ready',
          provider: 'googleTts',
          contentType: 'audio/mpeg',
          body: new ReadableStream<Uint8Array>({
            start: (stream) => {
              stream.enqueue(new Uint8Array([1]));
              stream.close();
            },
          }),
        };
      },
    },
    fallback,
    player: {
      decode: async () => ({}) as AudioBuffer,
      play: async (_audio, _signal, onStart, onProgress) => {
        pieceStarts.push(pieceFetches.length);
        onStart();
        onProgress?.(0.5);
      },
      openStream: async () => {
        throw new Error('not a stream');
      },
    },
  }).speak(longText, {
    ...options,
    onStart: () => pieceStarts.push(-1),
  });
  assert.equal(longBy, 'cloud:googleTts', 'a long line is spoken by the cloud');
  assert.ok(
    pieceFetches.length > 1 &&
      pieceFetches.every((piece) => piece.length <= 600),
    'a line over 600 characters is cut into pieces that each fit',
  );
  assert.equal(
    pieceFetches.join(' ').replace(/\s+/g, ' '),
    longText.trim().replace(/\s+/g, ' '),
    'the pieces say every word in order',
  );
  assert.equal(
    pieceStarts.filter((entry) => entry === -1).length,
    1,
    'a line reports its start once, not once per piece',
  );
  const overlapFetches: string[] = [];
  const overlapSignals: AbortSignal[] = [];
  const stopMidLine = new AbortController();
  const overlapping = createCloudTts({
    source: {
      fetchSpeech: async (piece, _priority, fetchSignal) => {
        overlapFetches.push(piece);
        overlapSignals.push(fetchSignal);
        return {
          status: 'ready',
          provider: 'googleTts',
          contentType: 'audio/mpeg',
          body: new ReadableStream<Uint8Array>({
            start: (stream) => {
              stream.enqueue(new Uint8Array([1]));
              stream.close();
            },
          }),
        };
      },
    },
    fallback,
    player: {
      decode: async () => ({}) as AudioBuffer,
      play: (_audio, playSignal, onStart) =>
        new Promise<void>((resolve) => {
          onStart();
          playSignal.addEventListener('abort', () => resolve());
        }),
      openStream: async () => {
        throw new Error('not a stream');
      },
    },
  }).speak(longText, { ...options, signal: stopMidLine.signal });
  await tick();
  assert.equal(
    overlapFetches.length,
    2,
    'the next piece is fetched while the first one plays, with none beyond it',
  );
  assert.equal(overlapSignals[1]!.aborted, false, 'its answer is held');
  stopMidLine.abort();
  await overlapping;
  assert.equal(
    overlapSignals[1]!.aborted,
    true,
    'a held piece is released when the line is stopped',
  );
  const lineProgress: number[] = [];
  await createCloudTts({
    source: {
      fetchSpeech: async () => ({
        status: 'ready',
        provider: 'googleTts',
        contentType: 'audio/mpeg',
        body: new ReadableStream<Uint8Array>({
          start: (stream) => {
            stream.enqueue(new Uint8Array([1]));
            stream.close();
          },
        }),
      }),
    },
    fallback,
    player: {
      decode: async () => ({}) as AudioBuffer,
      play: async (_audio, _signal, onStart, onProgress) => {
        onStart();
        onProgress?.(0.5);
        onProgress?.(1);
      },
      openStream: async () => {
        throw new Error('not a stream');
      },
    },
  }).speak(longText, { ...options, onProgress: (f) => lineProgress.push(f) });
  assert.ok(
    lineProgress.every(
      (value, index) => index === 0 || value >= lineProgress[index - 1]!,
    ) && lineProgress.at(-1)! > 0.9,
    'progress through the pieces of a long line runs forward to the end',
  );
  const attempts: string[] = [];
  const secondBy = await createCloudTts({
    source: {
      fetchSpeech: async (piece) => {
        attempts.push(piece);
        return attempts.length === 1
          ? {
              status: 'ready',
              provider: 'googleTts',
              contentType: 'audio/mpeg',
              body: new ReadableStream<Uint8Array>({
                start: (stream) => {
                  stream.enqueue(new Uint8Array([1]));
                  stream.close();
                },
              }),
            }
          : { status: 'unavailable', detail: 'HTTP 500' };
      },
    },
    fallback,
    player: {
      decode: async () => ({}) as AudioBuffer,
      play: async (_audio, _signal, onStart) => onStart(),
      openStream: async () => {
        throw new Error('not a stream');
      },
    },
  }).speak(longText, options);
  assert.equal(
    attempts.length,
    2,
    'a piece that fails sends the rest to the fallback in one go, not piece by piece',
  );
  assert.equal(
    secondBy,
    'system',
    'the fallback finishes a line whose later piece failed',
  );
  const routeEvents: boolean[] = [];
  const probe = createCloudTts({
    source: {
      fetchSpeech: async () => ({ status: 'unavailable', detail: 'HTTP 500' }),
    },
    fallback: { ...fallback, isPlayingThroughWebAudio: false },
  });
  assert.equal(
    probe.isPlayingThroughWebAudio,
    false,
    'a cloud line is not in the page audio before it makes a sound',
  );
  await probe.speak('Probe', {
    ...options,
    onRouteChange: () => routeEvents.push(probe.isPlayingThroughWebAudio),
  });
  assert.deepEqual(
    [routeEvents, probe.isPlayingThroughWebAudio],
    [[false], false],
    'a line that fell back to the system voice reports it is not in the page audio',
  );
  const callsBefore = calls.length;
  const aborting = new AbortController();
  const pending = cloudWith(
    () => new Promise<never>(() => undefined),
    200,
  ).speak('Four', { ...options, signal: aborting.signal });
  aborting.abort();
  await pending;
  assert.equal(
    calls.length,
    callsBefore,
    'an abort before the first byte plays nothing',
  );
  const startedWith: string[] = [];
  const spokeBy = await createCloudTts({
    source: {
      fetchSpeech: async () => ({
        status: 'ready',
        provider: 'googleTts',
        contentType: 'audio/mpeg',
        body: new ReadableStream<Uint8Array>({
          start: (stream) => {
            stream.enqueue(new Uint8Array([1, 2, 3]));
            stream.close();
          },
        }),
      }),
    },
    fallback,
    player: {
      decode: async (bytes) => {
        startedWith.push(`decoded ${bytes.byteLength}`);
        return {} as AudioBuffer;
      },
      play: async (_audio, _signal, onStart) => onStart(),
      openStream: async () => {
        throw new Error('not a stream');
      },
    },
  }).speak('Five', options);
  assert.equal(
    spokeBy,
    'cloud:googleTts',
    'a played answer reports the cloud and its provider',
  );
  assert.deepEqual(startedWith, ['decoded 3'], 'the whole answer is decoded');
  assert.equal(
    calls.includes('Five'),
    false,
    'a played answer never reaches the fallback',
  );
}

{
  assert.deepEqual(
    parsePcmFormat('audio/L16; rate=24000; channels=1'),
    { sampleRate: 24000 },
    'a raw PCM type gives its rate',
  );
  assert.equal(parsePcmFormat('audio/mpeg'), null, 'mp3 is not PCM');
  assert.equal(
    parsePcmFormat('audio/L16; rate=24000; channels=2'),
    null,
    'stereo is not read as PCM',
  );
  assert.deepEqual(
    Array.from(toFloatSamples(new Uint8Array([0x00, 0x80, 0xff, 0x7f, 0, 0]))),
    [-1, 32767 / 32768, 0],
    'little-endian 16-bit samples become floats',
  );

  const makeContext = () => {
    const starts: { at: number; length: number; stopped: boolean }[] = [];
    const nodes: { onended: (() => void) | null; entry: (typeof starts)[0] }[] =
      [];
    const clock = { now: 1 };
    const context: PcmContext = {
      get currentTime() {
        return clock.now;
      },
      destination: {} as AudioNode,
      createBuffer: (_channels, length, rate) =>
        ({
          duration: length / rate,
          length,
          copyToChannel: () => undefined,
        }) as unknown as AudioBuffer,
      createBufferSource: () => {
        const entry = { at: -1, length: 0, stopped: false };
        const node = {
          buffer: null as AudioBuffer | null,
          onended: null as (() => void) | null,
          connect: () => undefined,
          start: (at: number) => {
            entry.at = at;
            entry.length = node.buffer?.length ?? 0;
            starts.push(entry);
          },
          stop: () => {
            entry.stopped = true;
          },
        };
        nodes.push({
          get onended() {
            return node.onended;
          },
          entry,
        } as (typeof nodes)[0]);
        return node as unknown as AudioBufferSourceNode;
      },
    };
    return { context, starts, nodes, clock };
  };

  const fake = makeContext();
  let startedCount = 0;
  const sink = createPcmSink({
    context: fake.context,
    sampleRate: 24000,
    prebufferSeconds: 0,
    onStart: () => {
      startedCount += 1;
    },
  });
  sink.push(new Uint8Array([1, 0, 2]));
  sink.push(new Uint8Array([0, 3, 0, 4]));
  sink.push(new Uint8Array([0]));
  assert.deepEqual(
    fake.starts.map((entry) => entry.length),
    [1, 2, 1],
    'an odd trailing byte joins the next chunk, so no sample is split',
  );
  assert.equal(startedCount, 1, 'started is reported once, at the first sound');
  assert.ok(
    Math.abs(fake.starts[0]!.at - 1.05) < 1e-9,
    'the first chunk starts one lead after now',
  );
  assert.ok(
    Math.abs(fake.starts[1]!.at - (fake.starts[0]!.at + 1 / 24000)) < 1e-9,
    'each chunk starts where the one before ends',
  );

  const waking = makeContext();
  const wakingSink = createPcmSink({
    context: waking.context,
    sampleRate: 24000,
    prebufferSeconds: 0,
    firstStartAt: 2.5,
    onStart: () => undefined,
  });
  wakingSink.push(new Uint8Array([1, 0]));
  assert.equal(
    waking.starts[0]!.at,
    2.5,
    'the first sound waits for speakers that are still waking',
  );
  fake.clock.now = 5;
  sink.push(new Uint8Array([1, 0]));
  assert.ok(
    Math.abs(fake.starts[3]!.at - 5.05) < 1e-9,
    'after a gap the next chunk starts one lead after now, never in the past',
  );
  let isDone = false;
  void sink.done.then(() => {
    isDone = true;
  });
  sink.end();
  await tick();
  assert.equal(isDone, false, 'done waits for the last sound to end');
  sink.stop();
  await tick();
  assert.equal(isDone, true, 'stop resolves done');
  assert.equal(
    fake.starts.every((entry) => entry.stopped),
    true,
    'stop cuts every scheduled sound',
  );
  sink.push(new Uint8Array([1, 0]));
  assert.equal(fake.starts.length, 4, 'nothing is scheduled after stop');

  {
    const buffered = makeContext();
    let started = 0;
    const held = createPcmSink({
      context: buffered.context,
      sampleRate: 24000,
      onStart: () => {
        started += 1;
      },
    });
    held.push(new Uint8Array(2000));
    held.push(new Uint8Array(2000));
    assert.equal(
      buffered.starts.length + started,
      0,
      'under 200 ms nothing is scheduled and onStart waits',
    );
    held.push(new Uint8Array(2000));
    held.push(new Uint8Array(4000));
    held.push(new Uint8Array(400));
    assert.deepEqual(
      buffered.starts.map((entry) => entry.length),
      [5000, 200],
      'the held samples go out as one buffer once 200 ms is buffered, later chunks as they come',
    );
    assert.equal(started, 1, 'onStart fires once, when the first buffer goes');
    const short = makeContext();
    const brief = createPcmSink({
      context: short.context,
      sampleRate: 24000,
      onStart: () => undefined,
    });
    brief.push(new Uint8Array(200));
    brief.end();
    assert.equal(
      short.starts.length,
      1,
      'a stream that ends under 200 ms plays what it has',
    );
    assert.ok(
      brief.remainingMs() > 0,
      'the sink says how much sound is still to play',
    );
  }

  const calls: string[] = [];
  const fallback: TtsAdapter = {
    id: 'system',
    route: 'device',
    isPlayingThroughWebAudio: false,
    speak: async (text) => {
      calls.push(text);
    },
  };
  const options = (signal = new AbortController().signal) => ({
    priority: 'reply' as const,
    signal,
    onStart: () => undefined,
    onEnd: () => undefined,
  });
  const pcmBody = (chunks: Uint8Array[], isStalled = false) =>
    new ReadableStream<Uint8Array>({
      start: (stream) => {
        chunks.forEach((chunk) => stream.enqueue(chunk));
        if (!isStalled) stream.close();
      },
    });
  const streamed = (body: ReadableStream<Uint8Array>) => ({
    fetchSpeech: async () => ({
      status: 'ready' as const,
      provider: 'googleTts',
      contentType: 'audio/L16; rate=24000; channels=1',
      body,
    }),
  });
  const pushed: number[] = [];
  const player = (events: string[]) => ({
    decode: async () => ({}) as AudioBuffer,
    play: async () => undefined,
    openStream: async (_format: unknown, onStart: () => void) => ({
      push: (bytes: Uint8Array) => {
        if (pushed.length === 0) onStart();
        pushed.push(bytes.length);
      },
      end: () => events.push('end'),
      remainingMs: () => 0,
      getTiming: () => ({ playedMs: 0, scheduledMs: 0, isEnded: true }),
      stop: () => events.push('stop'),
      done: Promise.resolve(),
    }),
  });
  const events: string[] = [];
  assert.equal(
    await createCloudTts({
      source: streamed(
        pcmBody([new Uint8Array([1, 0, 2, 0]), new Uint8Array([3, 0])]),
      ),
      fallback,
      player: player(events),
    }).speak('Six', options()),
    'cloud:googleTts',
    'a PCM answer is played through the stream',
  );
  assert.deepEqual(pushed, [4, 2], 'every chunk reaches the player');
  assert.equal(events[0], 'end', 'the stream is ended when the body ends');
  assert.equal(calls.length, 0, 'a streamed answer never reaches the fallback');

  const emptyBy = await createCloudTts({
    source: streamed(pcmBody([new Uint8Array(0)])),
    fallback,
    player: player([]),
  }).speak('Seven', options());
  assert.equal(
    emptyBy,
    'system',
    'a PCM answer with no audio is spoken by the fallback',
  );

  const shortLine = makeContext();
  const shortBy = await createCloudTts({
    source: streamed(pcmBody([new Uint8Array(4800)])),
    fallback,
    player: {
      ...player([]),
      openStream: async (format: PcmFormat, onStart: () => void) =>
        createPcmSink({
          context: shortLine.context,
          sampleRate: format.sampleRate,
          onStart,
        }),
    },
  }).speak('Short', options());
  assert.equal(
    shortBy,
    'cloud:googleTts',
    'a line shorter than the prebuffer still plays in the cloud voice',
  );
  assert.equal(shortLine.starts.length, 1, 'its held audio is played');

  const stalledBy = await createCloudTts({
    source: streamed(pcmBody([new Uint8Array([1, 0])], true)),
    fallback,
    gapMs: 20,
    player: {
      ...player([]),
      openStream: async () => ({
        push: () => undefined,
        end: () => undefined,
        remainingMs: () => 0,
        getTiming: () => ({ playedMs: 0, scheduledMs: 0, isEnded: true }),
        stop: () => undefined,
        done: Promise.resolve(),
      }),
    },
  }).speak('Eight', options());
  assert.equal(
    stalledBy,
    'system',
    'a stream that gives no sound before the gap clock falls back',
  );
  pushed.length = 0;
  const quietEvents: string[] = [];
  const quietBy = await createCloudTts({
    source: streamed(pcmBody([new Uint8Array([1, 0])], true)),
    fallback,
    gapMs: 20,
    player: player(quietEvents),
  }).speak('Nine', options());
  assert.equal(
    quietBy,
    'cloud:googleTts',
    'a stream that stalls after sound ends the line quietly',
  );
  assert.equal(
    calls.includes('Nine'),
    false,
    'a line that stalled after sound never repeats on the device',
  );
  const outcomes: string[] = [];
  pushed.length = 0;
  await createCloudTts({
    source: streamed(pcmBody([new Uint8Array([1, 0])], true)),
    fallback,
    gapMs: 20,
    player: player([]),
    onCut: () => outcomes.push('cut'),
    onPlayed: () => outcomes.push('played'),
  }).speak('Stalled', options());
  pushed.length = 0;
  await createCloudTts({
    source: streamed(pcmBody([new Uint8Array([1, 0])])),
    fallback,
    player: player([]),
    onCut: () => outcomes.push('cut'),
    onPlayed: () => outcomes.push('played'),
  }).speak('Whole', options());
  assert.deepEqual(
    outcomes,
    ['cut', 'played'],
    'a piece that stalls after sound counts as a cloud failure, and only a whole line counts as played',
  );

  const hungEvents: string[] = [];
  const hungAt = Date.now();
  await createCloudTts({
    source: streamed(pcmBody([new Uint8Array([1, 0])])),
    fallback,
    player: {
      ...player([]),
      openStream: async (_format: unknown, onStart: () => void) => ({
        push: () => onStart(),
        end: () => hungEvents.push('end'),
        remainingMs: () => 100,
        getTiming: () => ({ playedMs: 0, scheduledMs: 100, isEnded: true }),
        stop: () => hungEvents.push('stop'),
        done: new Promise<void>(() => undefined),
      }),
    },
  }).speak('Hung', options());
  assert.ok(
    Date.now() - hungAt < 3000,
    'a sink whose audio never finishes is given up on after what remains plus a second',
  );
  assert.equal(
    hungEvents.at(-1),
    'stop',
    'a line that gave up waiting stops its sink',
  );

  const loud: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => loud.push(String(args[0]));
  const person = new AbortController();
  await createCloudTts({
    source: streamed(pcmBody([new Uint8Array([1, 0])], true)),
    fallback,
    gapMs: 50,
    player: {
      ...player([]),
      openStream: async (_format: unknown, onStart: () => void) => ({
        push: () => {
          onStart();
          person.abort();
        },
        end: () => undefined,
        remainingMs: () => 0,
        getTiming: () => ({ playedMs: 0, scheduledMs: 0, isEnded: true }),
        stop: () => undefined,
        done: Promise.resolve(),
      }),
    },
  }).speak('Stopped', options(person.signal));
  console.error = realError;
  assert.deepEqual(loud, [], "a person's stop is never logged as a failure");

  const fellBack: string[] = [];
  await createCloudTts({
    source: {
      fetchSpeech: async () => ({ status: 'unavailable', detail: 'HTTP 500' }),
    },
    fallback,
    onFallback: () => fellBack.push('fallback'),
  }).speak('Ten', options());
  assert.deepEqual(fellBack, ['fallback'], 'a fallback is reported');

  const sent: Record<string, unknown>[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(new Uint8Array([1, 0]), {
      headers: { 'Content-Type': 'audio/L16; rate=24000; channels=1' },
    });
  }) as typeof fetch;
  try {
    const voice = { voiceId: 'Sulafat', speed: 1.1 };
    const speech = createSpeechSource({
      appId: 'helm',
      url: 'http://localhost/speech',
      getHeaders: async () => ({}),
      readVoice: () => voice,
    });
    const answer = await speech.fetchSpeech(
      'Hi',
      'reply',
      new AbortController().signal,
    );
    voice.voiceId = 'Kore';
    await speech.fetchSpeech('Hi', 'reply', new AbortController().signal);
    await speech.fetchSpeech('Hi', 'reply', new AbortController().signal, {
      voiceId: 'Puck',
      speed: null,
    });
    assert.deepEqual(
      sent.map((body) => [body.voiceId, body.speed]),
      [
        ['Sulafat', 1.1],
        ['Kore', 1.1],
        ['Puck', null],
      ],
      'the voice is read on every request, and a given voice replaces it',
    );
    assert.equal(
      answer.status === 'ready' && answer.contentType,
      'audio/L16; rate=24000; channels=1',
      'the response type is passed on',
    );
    const failedWith = async (response: Response) => {
      globalThis.fetch = (async () => response) as typeof fetch;
      const failed = await createSpeechSource({
        appId: 'helm',
        url: 'http://localhost/speech',
        getHeaders: async () => ({}),
      }).fetchSpeech('Hi', 'reply', new AbortController().signal);
      return failed.status === 'unavailable' ? failed.detail : failed.status;
    };
    assert.deepEqual(
      [
        await failedWith(
          new Response('<html>Bad gateway <b>secret</b></html>', {
            status: 502,
          }),
        ),
        await failedWith(
          new Response(JSON.stringify({ error: 'app-check' }), { status: 401 }),
        ),
        await failedWith(
          new Response(JSON.stringify({ error: 'Token abc: bad' }), {
            status: 401,
          }),
        ),
      ],
      ['HTTP 502', 'HTTP 401: app-check', 'HTTP 401'],
      'a failed response keeps only a short error code, never its body',
    );
  } finally {
    globalThis.fetch = realFetch;
  }
}
console.log('speechShared: cloud voice checks passed');

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

const fakeGoogleCall = () => {
  const events = new EventEmitter();
  const state = { writes: [] as unknown[], isEnded: false, cancels: 0 };
  const call = {
    write: (request: unknown) => state.writes.push(request),
    end: () => {
      state.isEnded = true;
    },
    cancel: () => {
      state.cancels += 1;
    },
    on: (event: string, listener: (...args: unknown[]) => void) =>
      events.on(event, listener),
  } as unknown as SynthesisCall;
  return { call, state, emit: events.emit.bind(events) };
};
const googleFrom = (call: SynthesisCall) =>
  createGoogleTts({
    projectId: 'a-project',
    client: { streamingSynthesize: () => call },
  });
const googleCall = fakeGoogleCall();
const googleSpeech = await googleFrom(googleCall.call).speak({
  ...speakInput,
  speed: 1.1,
});
assert.equal(
  googleSpeech.contentType,
  'audio/L16; rate=24000; channels=1',
  'Google streams raw 24 kHz 16-bit mono PCM',
);
assert.deepEqual(
  [googleCall.state.writes, googleCall.state.isEnded],
  [
    [
      {
        streamingConfig: {
          voice: { languageCode: 'en-US', name: 'voice-a' },
          streamingAudioConfig: {
            audioEncoding: 'PCM',
            sampleRateHertz: 24_000,
            speakingRate: 1.1,
          },
        },
      },
      { input: { text: 'Hello there.' } },
    ],
    true,
  ],
  'Google is sent the voice, rate and PCM encoding, then the text, then the write side ends',
);
const googleReader = googleSpeech.stream.getReader();
googleCall.emit('data', { audioContent: new Uint8Array([1, 2, 3]) });
assert.deepEqual(
  [...((await googleReader.read()).value ?? [])],
  [1, 2],
  'Google audio reaches the stream before the clip is finished, whole samples only',
);
googleCall.emit('data', { audioContent: new Uint8Array([4, 5]) });
assert.deepEqual(
  [...((await googleReader.read()).value ?? [])],
  [3, 4],
  'Google carries an odd byte to the next response',
);
googleCall.emit('end');
assert.ok((await googleReader.read()).done, 'Google ends when the call ends');

const abortedCall = fakeGoogleCall();
const aborter = new AbortController();
const abortedSpeech = await googleFrom(abortedCall.call).speak({
  ...speakInput,
  signal: aborter.signal,
});
aborter.abort();
assert.ok(
  abortedCall.state.cancels === 1 &&
    (await rejects(() => abortedSpeech.stream.getReader().read())),
  'an abort cancels the Google call and fails the stream',
);

const googleStatuses: [number, number][] = [
  [16, 401],
  [7, 403],
  [8, 429],
  [14, 503],
  [3, 400],
  [13, 500],
];
for (const [code, status] of googleStatuses) {
  const failing = fakeGoogleCall();
  const failingRead = (await googleFrom(failing.call).speak(speakInput)).stream
    .getReader()
    .read()
    .then(
      () => null,
      (caught: Error) => caught.message,
    );
  failing.emit('error', { code });
  assert.equal(
    await failingRead,
    `googleTts answered ${status}`,
    `gRPC code ${code} is answered as ${status}`,
  );
}

const unreadBodies = { deepgram: false, gemini: false };
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
assert.deepEqual(
  unreadBodies,
  { deepgram: true, gemini: true },
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
      projectId: 'a-project',
      client: {
        streamingSynthesize: () => {
          const failing = fakeGoogleCall();
          queueMicrotask(() =>
            failing.emit('error', { code: 16, message: apiKey }),
          );
          return failing.call;
        },
      },
    }),
  ],
];
for (const [id, provider] of providers) {
  const error = await provider.speak(speakInput).then(
    (speech) =>
      speech.stream
        .getReader()
        .read()
        .then(
          () => null,
          (caught: Error) => caught,
        ),
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

const grantCalls: { url: string; init: RequestInit }[] = [];
const grantWith = (response: Response) =>
  grantDeepgramToken({
    apiKey: 'dg-secret-key',
    ttlSeconds: 60,
    fetchImpl: (async (url: string, init: RequestInit) => {
      grantCalls.push({ url, init });
      return response;
    }) as unknown as typeof fetch,
  });
assert.deepEqual(
  await grantWith(Response.json({ access_token: 'dg-token', expires_in: 60 })),
  { token: 'dg-token', expiresInSeconds: 60 },
  'a valid grant answers the token and its lifetime',
);
assert.deepEqual(
  [
    grantCalls[0].url,
    grantCalls[0].init.method,
    (grantCalls[0].init.headers as Record<string, string>).Authorization,
    grantCalls[0].init.body,
  ],
  [
    'https://api.deepgram.com/v1/auth/grant',
    'POST',
    'Token dg-secret-key',
    '{"ttl_seconds":60}',
  ],
  'the grant is a POST with the key and the lifetime',
);
await assert.rejects(
  grantWith(Response.json({ expires_in: 60 })),
  'a grant without a token throws',
);
let grantCancelled = false;
const refusedGrant = new Response(
  new ReadableStream({
    cancel() {
      grantCancelled = true;
    },
  }),
  { status: 401 },
);
await assert.rejects(
  grantWith(refusedGrant),
  (error: Error) =>
    error.message === 'deepgram answered 401' &&
    !error.message.includes('dg-secret-key'),
  'a refused grant throws the status alone',
);
assert.ok(grantCancelled, 'a refused grant cancels its body unread');

assert.equal(
  getLocalDayKey(Date.parse('2026-11-10T05:00:00Z'), 'America/Los_Angeles'),
  '2026-11-09',
  "the day key is the day in the person's zone",
);
assert.equal(
  getLocalDayKey(Date.parse('2026-11-10T05:00:00Z'), 'Not/AZone'),
  '2026-11-10',
  'an invalid zone gives the UTC day',
);

const listenLimits = {
  listenMsPerDay: 3_600_000,
  mintsPerDay: 300,
  spokenCharsPerDay: 30_000,
  voices: { googleTts: 'g', deepgramAura: 'd', geminiTts: 'm' },
  voiceNames: ['A'],
  defaultVoice: 'A',
  speedRange: { min: 0.8, max: 1.2 },
};
const worstCase = listenCostMicros(VOICE_UTTERANCE_MS);
const emptyUsage: ListenUsage = {
  listenMs: 0,
  transcribeMs: null,
  mints: 0,
  openMints: {},
};
const plan = (overrides: Partial<Parameters<typeof planListen>[0]> = {}) =>
  planListen({
    usage: emptyUsage,
    budgetMicros: 0,
    limits: listenLimits,
    now: 1,
    closed: [],
    mintId: 'new',
    worstCaseMicros: worstCase,
    ...overrides,
  });
const openUsage: ListenUsage = {
  listenMs: 0,
  transcribeMs: null,
  mints: 1,
  openMints: { a: 1 },
};
assert.equal(
  plan({
    usage: openUsage,
    closed: [{ mintId: 'a', ms: 9_999_999 }],
  }).usage.listenMs,
  VOICE_UTTERANCE_MS,
  'a closed report adds at most one utterance',
);
assert.equal(
  plan({ usage: openUsage, closed: [{ mintId: 'a', ms: -5 }] }).usage.listenMs,
  0,
  'a negative report adds nothing',
);
const replayed = plan({
  usage: { listenMs: 0, transcribeMs: null, mints: 1, openMints: {} },
  closed: [
    { mintId: 'a', ms: 5_000 },
    { mintId: 'zzz', ms: 5_000 },
  ],
});
assert.equal(replayed.usage.listenMs, 0, 'unknown or replayed ids add nothing');
const settledOnce = plan({
  usage: openUsage,
  closed: [
    { mintId: 'a', ms: 5_000 },
    { mintId: 'a', ms: 5_000 },
  ],
});
assert.equal(settledOnce.usage.listenMs, 5_000, 'a report counts once');
assert.deepEqual(
  Object.keys(settledOnce.usage.openMints),
  ['new'],
  'a settled mint is closed and the new one is open',
);
const overdue = plan({ usage: openUsage, now: 1 + 3 * VOICE_UTTERANCE_MS });
assert.equal(
  overdue.usage.listenMs,
  VOICE_UTTERANCE_MS,
  'a stream that never reported counts as a full one once overdue',
);
assert.deepEqual(
  Object.keys(overdue.usage.openMints),
  ['new'],
  'an overdue mint is closed',
);
assert.equal(
  plan({ usage: openUsage, now: 1 + VOICE_UTTERANCE_MS }).usage.listenMs,
  0,
  'a stream still inside its report window is not charged',
);
const fiveMinutes = 300_000;
const transcribePlan = (
  overrides: Partial<Parameters<typeof planTranscribe>[0]> = {},
) =>
  planTranscribe({
    usage: { listenMs: 0, transcribeMs: 0 },
    budgetMicros: 0,
    limits: listenLimits,
    worst: { ms: fiveMinutes, micros: transcribeCostMicros(fiveMinutes) },
    claimed: { ms: fiveMinutes, micros: transcribeCostMicros(fiveMinutes) },
    ...overrides,
  });
assert.equal(
  transcribeCostMicros(60_000),
  4_300,
  'a minute of recording is priced at the pre-recorded rate',
);
const reserved = transcribePlan();
assert.deepEqual(
  [reserved.held, reserved.transcribeMs, reserved.budgetDeltaMicros],
  [null, fiveMinutes, transcribeCostMicros(fiveMinutes)],
  'a recording reserves its worst case',
);
assert.equal(
  transcribePlan({
    usage: { listenMs: 3_600_000 - fiveMinutes, transcribeMs: 0 },
  }).held,
  null,
  'a recording that just fits is let through',
);
assert.equal(
  transcribePlan({
    usage: { listenMs: 3_000_000, transcribeMs: 400_000 },
  }).held,
  'listenLimit',
  'listening and recordings share the day, held when the reserve would pass it',
);
const claimOf = (ms: number) => ({ ms, micros: transcribeCostMicros(ms) });
const fourMinutesLeft = { listenMs: 3_600_000 - 240_000, transcribeMs: 0 };
assert.deepEqual(
  (({ held, reserved }) => [held, reserved.ms])(
    transcribePlan({ usage: fourMinutesLeft, claimed: claimOf(10_000) }),
  ),
  [null, 10_000],
  'a short claim is reserved at its own length when the worst case does not fit',
);
assert.equal(
  transcribePlan({ usage: fourMinutesLeft, claimed: claimOf(270_000) }).held,
  'listenLimit',
  'a claim longer than what is left is still held',
);
assert.deepEqual(
  transcribePlan({
    usage: { listenMs: 3_600_000, transcribeMs: 0 },
  }).budgetDeltaMicros,
  0,
  'a held recording charges nothing',
);
assert.equal(
  transcribePlan({
    budgetMicros: VOICE_DAILY_BUDGET_CENTS * 10_000,
  }).held,
  'budgetReached',
  'the site cap holds a recording',
);
assert.equal(
  plan({ usage: { ...emptyUsage, transcribeMs: 3_600_000 } }).held,
  'listenLimit',
  'minutes of recordings count against streamed listening',
);
const settledShort = planTranscribeSettle({
  usage: { transcribeMs: fiveMinutes },
  reservedMs: fiveMinutes,
  reservedMicros: transcribeCostMicros(fiveMinutes),
  actualMs: 42_000,
  actualMicros: transcribeCostMicros(42_000),
});
assert.equal(
  settledShort.transcribeMs,
  42_000,
  'a short one is charged as long as it was',
);
assert.ok(
  settledShort.budgetDeltaMicros < 0,
  'and the rest of the reserve comes back',
);
const settledLong = planTranscribeSettle({
  usage: { transcribeMs: fiveMinutes },
  reservedMs: fiveMinutes,
  reservedMicros: transcribeCostMicros(fiveMinutes),
  actualMs: fiveMinutes + 6_000,
  actualMicros: transcribeCostMicros(fiveMinutes + 6_000),
});
assert.equal(
  settledLong.transcribeMs,
  fiveMinutes + 6_000,
  'one longer than the reserve is charged in full',
);
assert.ok(settledLong.budgetDeltaMicros > 0, 'and its extra cost is added');
const burst = Array.from({ length: 300 }).reduce<{
  usage: ListenUsage;
  failures: number;
}>(
  (acc, _, index) => {
    const next = plan({ usage: acc.usage, mintId: `m${index}` });
    return {
      usage: next.usage,
      failures: acc.failures + (next.held === null ? 0 : 1),
    };
  },
  { usage: emptyUsage, failures: 0 },
);
assert.equal(burst.failures, 0, 'the first 300 plans all succeed');
assert.equal(
  plan({ usage: burst.usage, mintId: 'm300' }).held,
  'mintLimit',
  'the 301st plan is held at the mint limit',
);
assert.equal(
  plan({ usage: { ...emptyUsage, listenMs: listenLimits.listenMsPerDay } })
    .held,
  'listenLimit',
  'listening at the limit is held',
);
assert.equal(
  plan({
    budgetMicros: VOICE_DAILY_BUDGET_CENTS * 10_000 - worstCase + 1,
  }).held,
  'budgetReached',
  'a budget one worst case short is held',
);
assert.equal(
  plan({ budgetMicros: VOICE_DAILY_BUDGET_CENTS * 10_000 - worstCase }).held,
  null,
  'a budget with room for one worst case is not held',
);
const heldPlan = plan({
  usage: openUsage,
  closed: [{ mintId: 'a', ms: 7_000 }],
  budgetMicros: VOICE_DAILY_BUDGET_CENTS * 10_000,
});
assert.deepEqual(
  [heldPlan.held, heldPlan.usage.listenMs, heldPlan.budgetDeltaMicros],
  ['budgetReached', 7_000, 0],
  'a held plan saves the closed reports and charges nothing',
);
// speaking server
const speechLimits = listenLimits;
const speak = (over: Partial<Parameters<typeof planSpeech>[0]> = {}) =>
  planSpeech({
    usage: { spokenChars: 0 },
    budgetMicros: 0,
    limits: speechLimits,
    characters: 100,
    costMicros: 3_000,
    ...over,
  });
const speakOk = speak({ usage: { spokenChars: 500 } });
assert.deepEqual(
  [speakOk.held, speakOk.spokenChars, speakOk.budgetDeltaMicros],
  [null, 600, 3_000],
  'a line under the limit adds its characters and charges its cost',
);
assert.equal(
  speak({ usage: { spokenChars: 29_900 } }).held,
  null,
  'exactly reaching the daily characters is allowed',
);
assert.equal(
  speak({ usage: { spokenChars: 29_901 } }).held,
  'speechLimit',
  'one character over is held at the speech limit',
);
assert.equal(
  speak({
    budgetMicros: VOICE_DAILY_BUDGET_CENTS * 10_000 - 3_000 + 1,
  }).held,
  'budgetReached',
  'a budget one cost short is held',
);
const speakHeld = speak({ usage: { spokenChars: 29_901 } });
assert.deepEqual(
  [speakHeld.spokenChars, speakHeld.budgetDeltaMicros],
  [29_901, 0],
  'a held line charges nothing',
);
const speechOrigin = 'https://apps.moondreams.dev';
const speechBody = {
  appId: 'helm',
  text: 'Hello there',
  priority: 'reply',
  timeZone: 'Not/AZone',
};
const read = (over: Partial<Parameters<typeof readSpeechRequest>[0]> = {}) =>
  readSpeechRequest({
    method: 'POST',
    origin: speechOrigin,
    body: speechBody,
    allowedOrigins: [speechOrigin],
    ...over,
  });
const readFailure = (result: ReturnType<typeof read>) =>
  result.ok ? null : [result.status, result.error];
assert.deepEqual(
  readFailure(read({ method: 'GET' })),
  [405, 'method'],
  'GET is refused',
);
assert.deepEqual(
  readFailure(read({ origin: 'https://evil.example' })),
  [403, 'origin'],
  'another origin is refused',
);
assert.deepEqual(
  readFailure(read({ origin: undefined })),
  [403, 'origin'],
  'no origin is refused',
);
assert.deepEqual(
  readFailure(read({ body: { ...speechBody, text: 'a'.repeat(601) } })),
  [413, 'too-long'],
  '601 characters are too long',
);
assert.deepEqual(
  readFailure(read({ body: { ...speechBody, text: '   ' } })),
  [400, 'text'],
  'empty text is refused',
);
assert.deepEqual(
  readFailure(read({ body: { ...speechBody, appId: 'nope' } })),
  [400, 'app'],
  'an unknown app is refused',
);
const goodRead = read();
assert.ok(
  goodRead.ok && goodRead.text === 'Hello there' && goodRead.appId === 'helm',
  'a good request passes',
);
const longZone = read({ body: { ...speechBody, timeZone: 'x'.repeat(65) } });
assert.ok(
  longZone.ok && longZone.timeZone === 'UTC',
  'a bad time zone is read as UTC',
);
const voiceRead = (over: Record<string, unknown>) => {
  const result = read({ body: { ...speechBody, ...over } });
  return result.ok ? [result.voiceName, result.speed] : null;
};
assert.deepEqual(
  voiceRead({}),
  ['Aoede', 1],
  'no voice or speed is the app default at normal speed',
);
assert.deepEqual(
  voiceRead({ voiceId: 'Puck', speed: 1.2 }),
  ['Puck', 1.2],
  'a listed voice and a speed at the edge of the range are kept',
);
assert.deepEqual(
  voiceRead({ voiceId: 'Not-A-Voice', speed: 0.8 }),
  ['Aoede', 0.8],
  'an unknown voice falls back to Aoede without refusing the request',
);
assert.deepEqual(
  [1.5, 0.79, 'fast', null, NaN].map((speed) => voiceRead({ speed })?.[1]),
  [1, 1, 1, 1, 1],
  'a speed outside the range or not a number becomes 1',
);
assert.equal(
  voiceRead({ speed: 0.876 })?.[1],
  0.88,
  'a speed is rounded to two decimals',
);
console.log('speechShared: voice provider checks passed');

{
  assert.equal(readTurnEndDelay('Add milk to the list'), TURN_END_COMPLETE_MS);
  assert.equal(readTurnEndDelay('What is on today?'), TURN_END_COMPLETE_MS);
  ['Turn the oven on', 'Put it in', 'Read that'].forEach((text) =>
    assert.equal(
      readTurnEndDelay(text),
      TURN_END_COMPLETE_MS,
      `"${text}" is a finished command`,
    ),
  );
  [
    'Add milk and',
    'Remind me to',
    'I was thinking, um',
    'Add milk,',
    'So ',
  ].forEach((text) =>
    assert.equal(
      readTurnEndDelay(text),
      TURN_END_UNFINISHED_MS,
      `"${text}" sounds unfinished`,
    ),
  );
  assert.ok(
    hasSameWords('Add milk.', 'add  Milk'),
    'punctuation is not a new word',
  );
  assert.ok(
    !hasSameWords('add milk', 'add milk and'),
    'a new word is a change',
  );
  assert.equal(
    isBargeConfirmed('wait stop', 'Here is what is on your list today'),
    true,
    'two words the line lacks confirm a person',
  );
  assert.equal(
    isBargeConfirmed(
      'what is on your list',
      'Here is what is on your list today',
    ),
    false,
    'the line echoing back never confirms',
  );
  assert.equal(
    isBargeConfirmed('stop', 'Here is your list'),
    false,
    'one new word is not enough',
  );
  assert.equal(
    isBargeConfirmed(
      'bake at 350 degrees fahrenheit for 10 to 12 minutes',
      'Bake at 350°F for 10–12 minutes',
    ),
    false,
    'the spoken form of a line echoing back never confirms',
  );
  const fetched = { count: 0 };
  const source: SpeechSource = {
    fetchSpeech: async (): Promise<SpeechFetch> => {
      fetched.count += 1;
      return {
        status: 'ready',
        body: new ReadableStream<Uint8Array>({
          start: (controller) => {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.enqueue(new Uint8Array([3]));
            controller.close();
          },
        }),
        provider: 'p',
        contentType: 'audio/L16',
      };
    },
  };
  const cache = createSpeechCache(2);
  const cached = withSpeechCache(source, cache, 'v');
  const readAll = async (answer: SpeechFetch) => {
    assert.equal(answer.status, 'ready');
    if (answer.status !== 'ready') return [];
    const reader = answer.body.getReader();
    const readFrom = async (read: number[]): Promise<number[]> => {
      const next = await reader.read();
      return next.done ? read : readFrom([...read, ...next.value]);
    };
    return readFrom([]);
  };
  const signal = new AbortController().signal;
  assert.deepEqual(
    await readAll(await cached.fetchSpeech('one', 'reply', signal)),
    [1, 2, 3],
  );
  assert.deepEqual(
    await readAll(await cached.fetchSpeech('one', 'reply', signal)),
    [1, 2, 3],
    'a replay gets the same audio',
  );
  assert.equal(fetched.count, 1, 'a replayed line costs no new request');
  await readAll(await cached.fetchSpeech('two', 'reply', signal));
  await readAll(await cached.fetchSpeech('three', 'reply', signal));
  await readAll(await cached.fetchSpeech('one', 'reply', signal));
  assert.equal(fetched.count, 4, 'the oldest line is dropped past the limit');
  console.log('speechShared: turn end, barge-in and replay checks passed');
}

{
  const clock = { now: 10 };
  const context: PcmContext = {
    get currentTime() {
      return clock.now;
    },
    destination: {} as AudioNode,
    createBuffer: (_channels, length, rate) =>
      ({
        duration: length / rate,
        length,
        copyToChannel: () => undefined,
      }) as unknown as AudioBuffer,
    createBufferSource: () =>
      ({
        buffer: null,
        connect: () => undefined,
        start: () => undefined,
        stop: () => undefined,
      }) as unknown as AudioBufferSourceNode,
  };
  const sink = createPcmSink({
    context,
    sampleRate: 1000,
    prebufferSeconds: 0,
    leadSeconds: 0,
    onStart: () => undefined,
  });
  assert.deepEqual(
    sink.getTiming(),
    { playedMs: 0, scheduledMs: 0, isEnded: false },
    'a sink that has made no sound has played nothing',
  );
  sink.push(new Uint8Array(4000));
  clock.now = 11;
  assert.deepEqual(
    sink.getTiming(),
    { playedMs: 1000, scheduledMs: 2000, isEnded: false },
    'a sink says how much it has played of what it was handed',
  );
  clock.now = 20;
  sink.end();
  assert.deepEqual(
    sink.getTiming(),
    { playedMs: 2000, scheduledMs: 2000, isEnded: true },
    'played never runs past what was scheduled',
  );
  sink.stop();

  const events: string[] = [];
  const reports: number[] = [];
  const adapter = (progress: number[]): TtsAdapter => ({
    id: 'reporter',
    route: 'device',
    isPlayingThroughWebAudio: false,
    speak: async (_text, { onStart, onProgress, onRouteChange }) => {
      onStart();
      onRouteChange?.();
      progress.forEach((value) => onProgress?.(value));
    },
  });
  const progressQueue = createPlaybackQueue({
    pick: () => adapter([0.2, 0.1, 0.6]),
    onRouteChange: () => events.push('route'),
  });
  const spokenLine = await progressQueue.enqueue('Hello there', {
    priority: 'reply',
    turnKey: 1,
    onProgress: (value) => reports.push(value),
  });
  assert.equal(spokenLine.status, 'spoken');
  assert.deepEqual(
    reports,
    [0.2, 0.6, 1],
    "a line's progress only moves forward and ends at 1 once it is spoken",
  );
  assert.deepEqual(
    events,
    ['route', 'route'],
    'the queue passes on that the sound began and that the line changed voice',
  );
  const estimated: number[] = [];
  const silent: TtsAdapter = {
    id: 'silent',
    route: 'device',
    isPlayingThroughWebAudio: false,
    speak: (_text, { onStart, signal }) =>
      new Promise<void>((resolve) => {
        onStart();
        signal.addEventListener('abort', () => resolve());
      }),
  };
  const estimateQueue = createPlaybackQueue({ pick: () => silent });
  const estimating = estimateQueue.enqueue('Fourteen chars', {
    priority: 'reply',
    turnKey: 1,
    onProgress: (value) => estimated.push(value),
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  estimateQueue.clear();
  await estimating;
  assert.ok(
    estimated.length > 0 &&
      estimated.every((value) => value > 0 && value <= 0.96),
    'with no report from the voice, a clock estimate runs short of the end',
  );

  assert.deepEqual(
    [
      toJoinKey({ turnKey: 5, currentKey: 9, isActive: true }),
      toJoinKey({ turnKey: 9, currentKey: 9, isActive: true }),
      toJoinKey({ turnKey: 12, currentKey: 9, isActive: true }),
      toJoinKey({ turnKey: 5, currentKey: 9, isActive: false }),
    ],
    [null, 9, 9, 5],
    'a stale say is dropped while a newer reply plays, one of the turn joins it, and none takes the newest key',
  );
  assert.ok(
    isBargeSuppressed(1000 + BARGE_SUPPRESS_MS, 1000 + BARGE_SUPPRESS_MS - 1) &&
      !isBargeSuppressed(1000 + BARGE_SUPPRESS_MS, 1000 + BARGE_SUPPRESS_MS) &&
      BARGE_SUPPRESS_MS <= 8000,
    'barge suppression after an unconfirmed listen expires after a few seconds',
  );

  const sparse: number[] = [];
  const sparseQueue = createPlaybackQueue({
    pick: () => ({
      id: 'sparse',
      route: 'device',
      isPlayingThroughWebAudio: false,
      speak: (_text, { onStart, onProgress, signal }) =>
        new Promise<void>((resolve) => {
          onStart();
          onProgress?.(0.2);
          signal.addEventListener('abort', () => resolve());
        }),
    }),
  });
  const sparseLine = sparseQueue.enqueue('x'.repeat(140), {
    priority: 'reply',
    turnKey: 1,
    onProgress: (value) => sparse.push(value),
  });
  await new Promise((resolve) => setTimeout(resolve, 700));
  sparseQueue.clear();
  await sparseLine;
  assert.ok(
    sparse[0] === 0.2 &&
      sparse.length > 2 &&
      sparse.every(
        (value, index) => index === 0 || value > sparse[index - 1]!,
      ) &&
      sparse.at(-1)! < 0.96,
    "progress keeps advancing between a voice's sparse reports, never backwards",
  );

  {
    const timers = {
      now: 1_000_000,
      nextId: 1,
      tasks: [] as { id: number; at: number; run: () => void }[],
    };
    const realNow = Date.now;
    Date.now = () => timers.now;
    const advance = (ms: number) => {
      const end = timers.now + ms;
      const step = (): void => {
        const due = timers.tasks
          .filter((task) => task.at <= end)
          .sort((a, b) => a.at - b.at)[0];
        if (due === undefined) {
          timers.now = end;
          return;
        }
        timers.tasks = timers.tasks.filter((task) => task.id !== due.id);
        timers.now = Math.max(timers.now, due.at);
        due.run();
        step();
      };
      step();
    };
    interface FakeUtterance {
      text: string;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
    }
    const fake = {
      speaking: false,
      pending: false,
      queue: [] as FakeUtterance[],
      cancels: 0,
      getVoices: () => [],
      resume: () => undefined,
      speak(utterance: FakeUtterance) {
        this.queue.push(utterance);
        this.speaking = true;
      },
      cancel() {
        this.cancels += 1;
        const dropped = this.queue.splice(0);
        this.speaking = false;
        dropped.forEach((utterance) =>
          utterance.onerror?.({ error: 'canceled' }),
        );
      },
    };
    const priorWindow = Reflect.get(globalThis, 'window');
    const priorUtterance = Reflect.get(globalThis, 'SpeechSynthesisUtterance');
    Object.assign(globalThis, {
      window: {
        speechSynthesis: fake,
        setTimeout: (run: () => void, ms: number) => {
          const id = timers.nextId++;
          timers.tasks.push({ id, at: timers.now + ms, run });
          return id;
        },
        clearTimeout: (id: number) => {
          timers.tasks = timers.tasks.filter((task) => task.id !== id);
        },
      },
      SpeechSynthesisUtterance: class {
        onstart = null;
        onend = null;
        onerror = null;
        onboundary = null;
        lang = '';
        voice = null;
        constructor(public text: string) {}
      },
    });
    try {
      const reading =
        'This sentence is long enough to be a chunk of its own. '.repeat(8);
      const begin = () => {
        fake.queue = [];
        fake.speaking = false;
        const seen = { ended: 0 };
        speakText(reading, {
          lang: 'en-US',
          onEnd: () => {
            seen.ended += 1;
          },
        });
        return seen;
      };
      const failing = begin();
      assert.ok(fake.queue.length >= 2, 'a long reading is queued in chunks');
      const [first, ...later] = fake.queue;
      fake.queue = later;
      first!.onerror?.({ error: 'synthesis-failed' });
      assert.equal(
        failing.ended,
        0,
        'a chunk that errors never reports the line done while later chunks are queued',
      );
      later.at(-1)!.onend?.();
      assert.equal(failing.ended, 1, 'the last chunk ending ends the line');

      const cut = begin();
      fake.queue[0]!.onerror?.({ error: 'canceled' });
      assert.equal(cut.ended, 1, 'a cancelled chunk ends the line');

      const stuck = begin();
      advance(40_000);
      fake.queue[1]!.onstart?.();
      advance(15_000);
      assert.equal(
        stuck.ended,
        0,
        'a reading still speaking past the guard is waited on',
      );
      const cancelsBefore = fake.cancels;
      advance(60_000);
      assert.equal(
        stuck.ended,
        1,
        'a reading stuck speaking is ended within its estimated length',
      );
      assert.ok(fake.cancels > cancelsBefore, 'a stuck reading is cancelled');
    } finally {
      Date.now = realNow;
      Object.assign(globalThis, {
        window: priorWindow,
        SpeechSynthesisUtterance: priorUtterance,
      });
      if (priorWindow === undefined) {
        Reflect.deleteProperty(globalThis, 'window');
      }
      if (priorUtterance === undefined) {
        Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
      }
    }
  }

  const hook = readFileSync(
    new URL('../../src/hooks/useVoiceConversation.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    hook,
    /!isBargeSuppressed\(run\.current\.bargeSuppressedUntil, Date\.now\(\)\) &&\s*\(queueRef\.current\?\.isPlayingThroughWebAudio\(\)/,
    'the barge-in microphone stays shut after a listen over the line came to nothing',
  );
  assert.match(
    hook,
    /joinsLine\s*\?\s*toJoinKey\(\{[^}]*isActive: queueRef\.current\?\.isActive\(\) \?\? false/,
    'a line that joins one already playing waits for it instead of cutting it',
  );
  assert.match(
    hook,
    /if \(turnKey === null\) \{\s*return Promise\.resolve\(\{ status: 'cancelled'/,
    'a joining line from an older turn is dropped',
  );
  console.log('speechShared: line progress and playback route checks passed');
}
