import {
  costMicros as toCostMicros,
  TTS_PRICES,
  type TtsProviderId,
} from '../../functions/src/voice/voiceConfig';
import {
  enableNaturalVoice,
  getNaturalVoiceState,
  synthesizeNaturalVoice,
} from '@/lib/speech/naturalVoice/naturalVoiceEngine';
import { NATURAL_VOICE_SIZE_MB } from '@/lib/speech/naturalVoice/config';
import { toSpokenText } from '@/lib/speech/spokenText';

interface Sample {
  replyId: string;
  file: string | null;
  characters: number;
  firstByteMs: number | null;
  totalMs: number | null;
  audioSeconds: number | null;
  costMicros: number | null;
  error: string | null;
}
interface Voice {
  id: string;
  label: string;
  samples: Sample[];
  abortMs: number | null;
}
interface Provider {
  id: TtsProviderId;
  skipped: string | null;
  voices: Voice[];
}
interface Reply {
  id: string;
  kind: string;
  tone: string;
  text: string;
}
interface Results {
  ranAt: string;
  replies: Reply[];
  providers: Provider[];
}

const NAMES: Record<TtsProviderId, string> = {
  deepgramAura: 'Deepgram Aura-2',
  geminiTts: 'Gemini 3.8 Flash-Lite TTS',
  googleTts: 'Google Cloud TTS Chirp 3 HD',
};

const SHORT_NAMES: Record<TtsProviderId, string> = {
  deepgramAura: 'Deepgram',
  geminiTts: 'Gemini',
  googleTts: 'Google',
};

const KIND_LABELS: Record<string, string> = {
  'got-it': 'Got it',
  answer: 'Short answer',
  general: 'Not from your records',
  caution: 'Health caution',
  question: 'Question',
  summary: 'Long summary',
};

const h = (
  tag: string,
  props: Record<string, string> = {},
  ...children: (Node | string)[]
) => {
  const element = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') element.className = value;
    else element.setAttribute(key, value);
  });
  element.append(...children);
  return element;
};

const millis = (ms: number | null) =>
  ms === null ? 'n/a' : `${Math.round(ms)} ms`;
const seconds = (ms: number | null) =>
  ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`;
const dollars = (micros: number | null) =>
  micros === null ? 'n/a' : `$${(micros / 1_000_000).toFixed(4)}`;

const median = (values: (number | null)[]) => {
  const sorted = values
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length === 0
    ? null
    : sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
};

const summaryTable = (providers: Provider[]) => {
  const rows = providers.flatMap((provider) =>
    provider.skipped !== null
      ? [
          h(
            'tr',
            {},
            h('td', {}, SHORT_NAMES[provider.id]),
            h('td', { colspan: '4' }, provider.skipped),
          ),
        ]
      : provider.voices.map((voice) => {
          const done = voice.samples.filter((sample) => sample.error === null);
          const total = done.reduce(
            (sum, sample) => sum + (sample.costMicros ?? 0),
            0,
          );
          return h(
            'tr',
            {},
            ...[
              `${SHORT_NAMES[provider.id]} · ${voice.label}`,
              millis(median(done.map((sample) => sample.firstByteMs))),
              seconds(median(done.map((sample) => sample.totalMs))),
              millis(voice.abortMs),
              done.length === 0 ? 'n/a' : dollars(total),
            ].map((text) => h('td', {}, text)),
          );
        }),
  );
  return h(
    'div',
    { class: 'scroll' },
    h(
      'table',
      {},
      h(
        'tr',
        {},
        ...['Voice', 'First sound', 'Done', 'Cut off', 'All 12'].map((text) =>
          h('th', {}, text),
        ),
      ),
      ...rows,
    ),
  );
};

const providerRow = (provider: Provider, voice: Voice, sample: Sample) => {
  const figures =
    sample.error !== null
      ? h('p', { class: 'muted error' }, `Failed: ${sample.error}`)
      : h(
          'p',
          { class: 'muted' },
          `first sound ${millis(sample.firstByteMs)} · done ${seconds(sample.totalMs)} · ${dollars(sample.costMicros)}`,
        );
  return h(
    'div',
    { class: 'row' },
    h('strong', {}, `${NAMES[provider.id]} · ${voice.label}`),
    ...(sample.file === null
      ? []
      : [
          h('audio', {
            controls: '',
            preload: 'none',
            src: `/voice-benchmark/${sample.file}`,
          }),
        ]),
    figures,
  );
};

const playPcm = (
  context: AudioContext,
  pcm: Float32Array,
  sampleRate: number,
) => {
  const buffer = context.createBuffer(1, pcm.length, sampleRate);
  buffer.copyToChannel(new Float32Array(pcm), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  return source;
};

const contexts: AudioContext[] = [];
const getContext = () => {
  contexts[0] ??= new AudioContext();
  return contexts[0];
};

const naturalRow = (reply: Reply) => {
  const status = h('p', { class: 'muted' }, 'free, on this device');
  const play = h('button', {}, '');
  const stop = h('button', { hidden: '' }, 'Stop');
  const isOn = () => getNaturalVoiceState().status === 'ready';
  const setLabel = () => {
    play.textContent = isOn()
      ? 'Play'
      : `Turn on the natural voice (${NATURAL_VOICE_SIZE_MB} MB) to compare`;
  };
  setLabel();
  let current: AudioBufferSourceNode | null = null;
  play.addEventListener('click', async () => {
    try {
      if (!isOn()) {
        status.textContent = 'Turning on the natural voice…';
        await enableNaturalVoice();
        setLabel();
        if (!isOn()) {
          status.textContent = 'The natural voice could not start here.';
          return;
        }
      }
      const context = getContext();
      await context.resume();
      const startedAt = performance.now();
      const { pcm, sampleRate } = await synthesizeNaturalVoice(
        toSpokenText(reply.text),
      );
      current = playPcm(context, pcm, sampleRate);
      stop.hidden = false;
      const source = current;
      source.onended = () => {
        stop.hidden = true;
      };
      status.textContent = `first sound ${millis(performance.now() - startedAt)} · free, on this device`;
    } catch (error) {
      status.textContent = `Failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  stop.addEventListener('click', () => {
    const source = current;
    if (source === null) return;
    const stoppedAt = performance.now();
    source.onended = () => {
      stop.hidden = true;
      status.textContent = `stopped in ${millis(performance.now() - stoppedAt)} · free, on this device`;
    };
    source.stop();
  });
  return h(
    'div',
    { class: 'row' },
    h('strong', {}, 'Natural voice (this device)'),
    h('div', {}, play, stop),
    status,
  );
};

const replyCard = (results: Results, reply: Reply) =>
  h(
    'section',
    { class: 'card' },
    h('h2', {}, `${KIND_LABELS[reply.kind] ?? reply.kind} · ${reply.tone}`),
    h('p', { class: 'muted' }, reply.text),
    ...results.providers.flatMap((provider) =>
      provider.voices.flatMap((voice) =>
        voice.samples
          .filter((sample) => sample.replyId === reply.id)
          .map((sample) => providerRow(provider, voice, sample)),
      ),
    ),
    naturalRow(reply),
  );

const priceNote = () =>
  h(
    'p',
    { class: 'muted' },
    (Object.keys(TTS_PRICES) as TtsProviderId[])
      .map((id) => {
        const price = TTS_PRICES[id];
        const sample = toCostMicros(id, { characters: 1000, audioSeconds: 60 });
        return price.per === 'character'
          ? `${NAMES[id]}: ${dollars(sample)} per 1,000 characters`
          : `${NAMES[id]}: about ${dollars(sample)} a minute of audio`;
      })
      .concat(`Prices checked ${TTS_PRICES.googleTts.checkedOn}`)
      .join('. ') + '.',
  );

const render = (app: HTMLElement, results: Results) => {
  const skipped = results.providers.filter(
    (provider) => provider.skipped !== null,
  );
  app.append(
    h('h1', {}, 'Voice benchmark'),
    h(
      'p',
      { class: 'muted' },
      `Run ${new Date(results.ranAt).toLocaleString()}`,
    ),
    h(
      'p',
      {},
      'Listen to a few cards, then tell Claude which voice should be the default.',
    ),
    ...skipped.map((provider) =>
      h('p', { class: 'error' }, provider.skipped ?? ''),
    ),
    h(
      'section',
      { class: 'card' },
      summaryTable(results.providers),
      priceNote(),
    ),
    ...results.replies.map((reply) => replyCard(results, reply)),
  );
};

const app = document.getElementById('app');
if (app !== null) {
  fetch('/voice-benchmark/results.json')
    .then((res) => (res.ok ? (res.json() as Promise<Results>) : null))
    .catch(() => null)
    .then((results) => {
      if (results === null) {
        app.append(h('p', {}, 'No results yet. Run npm run voice:benchmark.'));
        return;
      }
      render(app, results);
    });
}
