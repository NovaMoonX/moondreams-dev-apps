// Renders the same replies through each cloud voice, times them and opens a page to listen.
//   npm run voice:benchmark [-- --fixture] [-- --no-open]
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

import { createDeepgramAura } from '../../functions/src/voice/providers/deepgramAura.ts';
import { createGeminiTts } from '../../functions/src/voice/providers/geminiTts.ts';
import { createGoogleTts } from '../../functions/src/voice/providers/googleTts.ts';
import { pcmToWav } from '../../functions/src/voice/providers/pcm.ts';
import type { TtsProvider } from '../../functions/src/voice/providers/types.ts';
import {
  costMicros,
  TTS_VOICES,
  type TtsProviderId,
} from '../../functions/src/voice/voiceConfig.ts';
import { toSpokenText } from '../../src/lib/speech/spokenText.ts';

const PROJECT = 'moondreams-dev-apps';
const RUNS = 5;
const ABORT_AFTER_MS = 300;
const OUT_DIR = new URL('../../voice-benchmark/', import.meta.url);
const DOC_PATH = new URL('../../docs/voice-benchmark.md', import.meta.url);
const PAGE_URL = 'http://localhost:5173/scripts/voice/benchmark.html';
const PROVIDER_IDS: TtsProviderId[] = [
  'deepgramAura',
  'geminiTts',
  'googleTts',
];
const PROVIDER_NAMES: Record<TtsProviderId, string> = {
  deepgramAura: 'Deepgram Aura-2',
  geminiTts: 'Gemini 3.8 Flash-Lite TTS',
  googleTts: 'Google Cloud TTS Chirp 3 HD',
};
const GEMINI_RATE = 24_000;

const isFixture = process.argv.includes('--fixture');
const isOpening = !process.argv.includes('--no-open');

interface Reply {
  id: string;
  kind: string;
  tone: string;
  text: string;
}

const reply = (kind: string, tone: string, text: string): Reply => ({
  id: `${kind}-${tone}`.toLowerCase(),
  kind,
  tone,
  text,
});

const REPLIES: Reply[] = [
  reply('got-it', 'Composed', 'Got it. Call Dana, Friday.'),
  reply(
    'got-it',
    'Warm',
    "Got it. Call Dana on Friday, and I'll keep it handy.",
  ),
  reply(
    'answer',
    'Composed',
    'Your cake tasting is today at 3:00 PM at Sweet Layer Bakery.',
  ),
  reply(
    'answer',
    'Warm',
    "Your cake tasting is today at 3:00 PM at Sweet Layer Bakery. Hope it's a good one.",
  ),
  reply(
    'general',
    'Composed',
    "This isn't from your records, and it may be out of date. A frosted cake keeps about three days in the fridge.",
  ),
  reply(
    'general',
    'Warm',
    "This isn't from your records, and it may be out of date. A frosted cake usually keeps about three days in the fridge, covered.",
  ),
  reply(
    'caution',
    'Composed',
    "Biscuit's next flea treatment is due Saturday. For anything about the dose, check with the vet first.",
  ),
  reply(
    'caution',
    'Warm',
    "Biscuit's next flea treatment is due Saturday. If you're unsure about the dose, a quick word with the vet first is worth it.",
  ),
  reply('question', 'Composed', 'Do you mean Dana Lee or Dana Ortiz?'),
  reply(
    'question',
    'Warm',
    'Just to be sure, do you mean Dana Lee or Dana Ortiz?',
  ),
  reply(
    'summary',
    'Composed',
    "This week you have four things. Tuesday, the dentist at 9:30 AM. Wednesday, renew the car registration. Thursday, Mia's recital at 6:00 PM at Lincoln Hall. Friday, call Dana about the lease.",
  ),
  reply(
    'summary',
    'Warm',
    "Here's your week. Tuesday, the dentist at 9:30 AM. Wednesday, renew the car registration. Thursday, Mia's recital at 6:00 PM at Lincoln Hall, which should be lovely. Friday, call Dana about the lease. That's everything so far.",
  ),
];
const PROBE_REPLY = REPLIES[10];

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
interface VoiceResult {
  id: string;
  label: string;
  samples: Sample[];
  abortMs: number | null;
}
interface ProviderResult {
  id: TtsProviderId;
  skipped: string | null;
  voices: VoiceResult[];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length === 0
    ? null
    : sorted.length % 2 === 1
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
};
const medianOf = (values: (number | null)[]) =>
  median(values.filter((value): value is number => value !== null));

const readSecret = (name: string) => {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;
  try {
    const value = execFileSync(
      'firebase',
      ['functions:secrets:access', name, '--project', PROJECT],
      { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
    ).trim();
    return value || null;
  } catch {
    return null;
  }
};

const concat = (chunks: Uint8Array[]) => {
  const bytes = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  chunks.reduce((offset, chunk) => {
    bytes.set(chunk, offset);
    return offset + chunk.length;
  }, 0);
  return bytes;
};

const speakOnce = async (
  provider: TtsProvider,
  text: string,
  voiceId: string,
) => {
  const startedAt = performance.now();
  const { stream } = await provider.speak({ text, voiceId, format: 'mp3' });
  const reader = stream.getReader();
  const first = await reader.read();
  const firstByteMs = performance.now() - startedAt;
  const chunks: Uint8Array[] = first.done ? [] : [first.value];
  const readRest = async (): Promise<void> => {
    const next = await reader.read();
    if (next.done) return;
    chunks.push(next.value);
    return readRest();
  };
  await readRest();
  return {
    firstByteMs,
    totalMs: performance.now() - startedAt,
    audio: concat(chunks),
  };
};

const drain = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<void> => {
  const next = await reader.read();
  if (!next.done) return drain(reader);
};

const probeAbort = async (
  provider: TtsProvider,
  text: string,
  voiceId: string,
) => {
  const controller = new AbortController();
  const { stream } = await provider.speak({
    text,
    voiceId,
    format: 'mp3',
    signal: controller.signal,
  });
  const reader = stream.getReader();
  await reader.read();
  await new Promise((resolve) => setTimeout(resolve, ABORT_AFTER_MS));
  const abortedAt = performance.now();
  controller.abort();
  await drain(reader).catch(() => undefined);
  return performance.now() - abortedAt;
};

const toSample = (
  providerId: TtsProviderId,
  reply: Reply,
  characters: number,
  timing: { firstByteMs: number; totalMs: number },
  audio: Uint8Array,
): { sample: Sample; bytes: Uint8Array; extension: string } => {
  const isPcm = providerId === 'geminiTts';
  const audioSeconds = isPcm ? audio.length / (GEMINI_RATE * 2) : null;
  return {
    bytes: isPcm ? pcmToWav(audio, GEMINI_RATE) : audio,
    extension: isPcm ? 'wav' : 'mp3',
    sample: {
      replyId: reply.id,
      file: null,
      characters,
      ...timing,
      audioSeconds,
      costMicros: costMicros(providerId, {
        characters,
        audioSeconds: audioSeconds ?? 0,
      }),
      error: null,
    },
  };
};

const failedSample = (reply: Reply, error: string): Sample => ({
  replyId: reply.id,
  file: null,
  characters: toSpokenText(reply.text).length,
  firstByteMs: null,
  totalMs: null,
  audioSeconds: null,
  costMicros: null,
  error,
});

const saveSample = (
  providerId: TtsProviderId,
  voiceId: string,
  reply: Reply,
  made: { sample: Sample; bytes: Uint8Array; extension: string },
): Sample => {
  const file = `samples/${providerId}-${voiceId}-${reply.id}.${made.extension}`;
  writeFileSync(new URL(file, OUT_DIR), made.bytes);
  return { ...made.sample, file };
};

const tryProbeAbort = async (
  provider: TtsProvider,
  voiceId: string,
  failure: { error: string | null },
) => {
  if (failure.error !== null) return null;
  try {
    return await probeAbort(provider, toSpokenText(PROBE_REPLY.text), voiceId);
  } catch (error) {
    failure.error = error instanceof Error ? error.message : String(error);
    return null;
  }
};

const runVoice = async (
  provider: TtsProvider,
  voice: { id: string; label: string },
  failure: { error: string | null },
): Promise<VoiceResult> => {
  const samples: Sample[] = [];
  for (const item of REPLIES) {
    if (failure.error !== null) {
      samples.push(failedSample(item, failure.error));
      continue;
    }
    const text = toSpokenText(item.text);
    try {
      const runs: Awaited<ReturnType<typeof speakOnce>>[] = [];
      for (let run = 0; run < RUNS; run += 1) {
        runs.push(await speakOnce(provider, text, voice.id));
      }
      const kept = toSample(
        provider.id,
        item,
        text.length,
        runs[0],
        runs[0].audio,
      );
      const sample = saveSample(provider.id, voice.id, item, kept);
      samples.push({
        ...sample,
        firstByteMs: medianOf(runs.map((result) => result.firstByteMs)),
        totalMs: medianOf(runs.map((result) => result.totalMs)),
      });
    } catch (error) {
      failure.error = error instanceof Error ? error.message : String(error);
      samples.push(failedSample(item, failure.error));
    }
  }
  const abortMs = await tryProbeAbort(provider, voice.id, failure);
  console.log(`  ${provider.id} ${voice.label}: ${failure.error ?? 'done'}`);
  return { id: voice.id, label: voice.label, samples, abortMs };
};

const readGoogleAuth = async () => {
  try {
    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    await auth.getClient();
    return auth;
  } catch {
    return null;
  }
};

const buildProviders = async (): Promise<
  { id: TtsProviderId; provider: TtsProvider | null; skipped: string | null }[]
> => {
  const deepgramKey = readSecret('DEEPGRAM_API_KEY');
  const geminiKey = readSecret('GEMINI_API_KEY');
  const googleAuth = await readGoogleAuth();
  return [
    deepgramKey === null
      ? {
          id: 'deepgramAura',
          provider: null,
          skipped:
            'Deepgram voices skipped: run `npm run voice:deepgram-secret` once, then run this again.',
        }
      : {
          id: 'deepgramAura',
          provider: createDeepgramAura({ apiKey: deepgramKey }),
          skipped: null,
        },
    geminiKey === null
      ? {
          id: 'geminiTts',
          provider: null,
          skipped:
            'Gemini voices skipped: run `npm run voice:gemini-secret` once, then run this again.',
        }
      : {
          id: 'geminiTts',
          provider: createGeminiTts({ apiKey: geminiKey }),
          skipped: null,
        },
    googleAuth === null
      ? {
          id: 'googleTts',
          provider: null,
          skipped:
            'Google Cloud voices skipped: run `gcloud auth application-default login` once, then run this again.',
        }
      : {
          id: 'googleTts',
          provider: createGoogleTts({
            projectId: PROJECT,
            getAccessToken: async () => {
              const token = await googleAuth.getAccessToken();
              if (!token) throw new Error('No Google access token');
              return token;
            },
          }),
          skipped: null,
        },
  ];
};

const makeTone = (seconds: number, hertz: number) => {
  const count = Math.round(GEMINI_RATE * seconds);
  const pcm = new Uint8Array(count * 2);
  const view = new DataView(pcm.buffer);
  Array.from({ length: count }).forEach((_, index) =>
    view.setInt16(
      index * 2,
      Math.round(Math.sin((2 * Math.PI * hertz * index) / GEMINI_RATE) * 6000),
      true,
    ),
  );
  return pcmToWav(pcm, GEMINI_RATE);
};

const runFixture = (): ProviderResult[] =>
  PROVIDER_IDS.map((id, providerIndex) => ({
    id,
    skipped: null,
    voices: TTS_VOICES[id].map((voice, voiceIndex) => ({
      id: voice.id,
      label: voice.label,
      abortMs: 40 + providerIndex * 30 + voiceIndex * 5,
      samples: REPLIES.map((item, replyIndex) => {
        const characters = toSpokenText(item.text).length;
        const firstByteMs =
          200 + providerIndex * 120 + voiceIndex * 15 + replyIndex * 5;
        const audioSeconds = characters / 15;
        const file = `samples/${id}-${voice.id}-${item.id}.wav`;
        writeFileSync(
          new URL(file, OUT_DIR),
          makeTone(0.6, 220 + providerIndex * 110 + voiceIndex * 40),
        );
        return {
          replyId: item.id,
          file,
          characters,
          firstByteMs,
          totalMs: firstByteMs + characters * 12,
          audioSeconds,
          costMicros: costMicros(id, { characters, audioSeconds }),
          error: null,
        };
      }),
    })),
  }));

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(4)}`;
const seconds = (ms: number | null) =>
  ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`;
const millis = (ms: number | null) =>
  ms === null ? 'n/a' : `${Math.round(ms)} ms`;

const summarizeVoice = (voice: VoiceResult) => {
  const done = voice.samples.filter((sample) => sample.error === null);
  const totalMicros = done.reduce(
    (sum, sample) => sum + (sample.costMicros ?? 0),
    0,
  );
  const characters = done.reduce((sum, sample) => sum + sample.characters, 0);
  return {
    firstByte: medianOf(done.map((sample) => sample.firstByteMs)),
    total: medianOf(done.map((sample) => sample.totalMs)),
    totalMicros: done.length === 0 ? null : totalMicros,
    perThousandMicros:
      characters === 0 ? null : (totalMicros / characters) * 1000,
    failed: voice.samples.length - done.length,
  };
};

const renderTable = (providers: ProviderResult[]) => {
  const rows = providers.flatMap((provider) =>
    provider.skipped !== null
      ? [`| ${PROVIDER_NAMES[provider.id]} | ${provider.skipped} | | | | | |`]
      : provider.voices.map((voice) => {
          const summary = summarizeVoice(voice);
          return `| ${PROVIDER_NAMES[provider.id]} | ${voice.label}${summary.failed > 0 ? ` (${summary.failed} failed)` : ''} | ${millis(summary.firstByte)} | ${seconds(summary.total)} | ${millis(voice.abortMs)} | ${summary.totalMicros === null ? 'n/a' : dollars(summary.totalMicros)} | ${summary.perThousandMicros === null ? 'n/a' : dollars(summary.perThousandMicros)} |`;
        }),
  );
  return [
    '| Provider | Voice | Median first sound | Median done | Interruption | All 12 replies | Per 1,000 characters |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
};

const writeDoc = (providers: ProviderResult[], ranAt: string) => {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const start = '<!-- results:start -->';
  const end = '<!-- results:end -->';
  const from = doc.indexOf(start);
  const to = doc.indexOf(end);
  if (from === -1 || to === -1) {
    console.log('docs/voice-benchmark.md has no results block; not updated.');
    return;
  }
  const block = `${start}\n\nRun on ${ranAt.slice(0, 10)}.\n\n${renderTable(providers)}\n\n${end}`;
  writeFileSync(
    DOC_PATH,
    doc.slice(0, from) + block + doc.slice(to + end.length),
  );
};

const runProviders = async () => {
  const built = await buildProviders();
  const results: ProviderResult[] = [];
  for (const entry of built) {
    if (entry.provider === null) {
      console.log(entry.skipped);
      results.push({ id: entry.id, skipped: entry.skipped, voices: [] });
      continue;
    }
    console.log(`${PROVIDER_NAMES[entry.id]}:`);
    const failure = { error: null as string | null };
    const voices: VoiceResult[] = [];
    for (const voice of TTS_VOICES[entry.id]) {
      voices.push(await runVoice(entry.provider, voice, failure));
    }
    results.push({ id: entry.id, skipped: null, voices });
  }
  return results;
};

const main = async () => {
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(new URL('samples/', OUT_DIR), { recursive: true });
  const ranAt = new Date().toISOString();
  const providers: ProviderResult[] = isFixture
    ? runFixture()
    : await runProviders();
  writeFileSync(
    new URL('results.json', OUT_DIR),
    JSON.stringify({ ranAt, replies: REPLIES, providers }, null, 2),
  );
  console.log(`Wrote ${new URL('results.json', OUT_DIR).pathname}`);
  if (!isFixture) writeDoc(providers, ranAt);
  if (!isOpening) return;
  console.log(`Opening ${PAGE_URL}`);
  spawnSync('npx', ['vite', '--open', '/scripts/voice/benchmark.html'], {
    stdio: 'inherit',
  });
};

await main();
