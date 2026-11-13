// Renders the same replies through each cloud voice, times them and opens a page to listen.
//   npm run voice:benchmark [-- --fixture [--force]] [-- --no-open] [-- --only geminiTts] [-- --runs 3]
//   npm run voice:listen  (every shared Google and Gemini voice reading a few replies once)
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

import { createDeepgramAura } from '../../functions/src/voice/providers/deepgramAura.ts';
import {
  createGeminiTts,
  GEMINI_SAMPLE_RATE,
} from '../../functions/src/voice/providers/geminiTts.ts';
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
const ABORT_AFTER_MS = 300;
/** A request that has not finished by now is a hang, not a slow voice. */
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_WAITS_MS = [20_000, 40_000, 80_000];
const RETRY_STATUSES = new Set([429, 500, 503]);
const DOC_PATH = new URL('../../docs/voice-benchmark.md', import.meta.url);
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

const argValue = (name: string) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};

const isFixture = process.argv.includes('--fixture');
const isOpening = !process.argv.includes('--no-open');
const isForced = process.argv.includes('--force');
const isAllVoices = process.argv.includes('--all-voices');
const askedIds = (argValue('--only') ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id !== '');
const onlyIds = askedIds.filter((id): id is TtsProviderId =>
  PROVIDER_IDS.includes(id as TtsProviderId),
);
const runsArg = argValue('--runs');
const RUNS = runsArg === null ? (isAllVoices ? 1 : 5) : Number(runsArg);
const OUT_DIR = new URL(
  isAllVoices ? '../../voice-benchmark/all-voices/' : '../../voice-benchmark/',
  import.meta.url,
);
const NEXT_DIR = new URL('.next/', OUT_DIR);

const SHARED_VOICES: readonly [string, string][] = [
  ['Achernar', 'soft'],
  ['Achird', 'friendly'],
  ['Algenib', 'gravelly'],
  ['Algieba', 'smooth'],
  ['Alnilam', 'firm'],
  ['Aoede', 'breezy'],
  ['Autonoe', 'bright'],
  ['Callirrhoe', 'easy-going'],
  ['Charon', 'informative'],
  ['Despina', 'smooth'],
  ['Enceladus', 'breathy'],
  ['Erinome', 'clear'],
  ['Fenrir', 'excitable'],
  ['Gacrux', 'mature'],
  ['Iapetus', 'clear'],
  ['Kore', 'firm'],
  ['Laomedeia', 'upbeat'],
  ['Leda', 'youthful'],
  ['Orus', 'firm'],
  ['Pulcherrima', 'forward'],
  ['Puck', 'upbeat'],
  ['Rasalgethi', 'informative'],
  ['Sadachbia', 'lively'],
  ['Sadaltager', 'knowledgeable'],
  ['Schedar', 'even'],
  ['Sulafat', 'warm'],
  ['Umbriel', 'easy-going'],
  ['Vindemiatrix', 'gentle'],
  ['Zephyr', 'bright'],
  ['Zubenelgenubi', 'casual'],
];

const voicesFor = (
  id: TtsProviderId,
): readonly { id: string; label: string }[] =>
  !isAllVoices
    ? TTS_VOICES[id]
    : id === 'deepgramAura'
      ? []
      : SHARED_VOICES.map(([name, feel]) => ({
          id: id === 'googleTts' ? `en-US-Chirp3-HD-${name}` : name,
          label: `${name} (${feel})`,
        }));

const DELIVERY: Record<string, string> = {
  Composed: 'Say this in a calm, even, composed voice',
  Warm: 'Say this in a warm, relaxed, unhurried voice',
};

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
  reply('got-it', 'Composed', 'Got it. Call Dana on Friday.'),
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
const LISTEN_REPLY_IDS = [
  'got-it-composed',
  'got-it-warm',
  'answer-warm',
  'question-warm',
];
const RUN_REPLIES = isAllVoices
  ? REPLIES.filter((item) => LISTEN_REPLY_IDS.includes(item.id))
  : REPLIES;

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
  /** When this provider's readings were made; a run with --only keeps the others' earlier ones. */
  ranAt?: string;
  skipped: string | null;
  voices: VoiceResult[];
}

const inSequence = <T, R>(
  items: readonly T[],
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> =>
  items.reduce(
    async (previous, item, index) => [
      ...(await previous),
      await run(item, index),
    ],
    Promise.resolve([] as R[]),
  );

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

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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

const statusOf = (error: unknown) => {
  const match = /answered (\d+)$/.exec(messageOf(error));
  return match ? Number(match[1]) : null;
};

const speakOnce = async (
  provider: TtsProvider,
  text: string,
  voiceId: string,
  delivery?: string,
  attempt = 0,
): Promise<{ firstByteMs: number; totalMs: number; audio: Uint8Array }> => {
  try {
    return await speakTimed(provider, text, voiceId, delivery);
  } catch (error) {
    const status = statusOf(error);
    const wait = RETRY_WAITS_MS[attempt];
    if (status === null || !RETRY_STATUSES.has(status) || wait === undefined) {
      throw error;
    }
    process.stdout.write(
      `\r\x1b[K  ${provider.id} answered ${status}; waiting ${wait / 1000} s and trying again…`,
    );
    await new Promise((resolve) => setTimeout(resolve, wait));
    return speakOnce(provider, text, voiceId, delivery, attempt + 1);
  }
};

const speakTimed = async (
  provider: TtsProvider,
  text: string,
  voiceId: string,
  delivery?: string,
) => {
  const startedAt = performance.now();
  const { stream } = await provider.speak({
    text,
    voiceId,
    format: 'mp3',
    delivery,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
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

/** Time for the response stream to close after an abort; null when the stream had already ended. */
const probeStreamCut = async (
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
  const first = await reader.read();
  if (first.done) return null;
  const state = { isDone: false };
  const pump = drain(reader)
    .catch(() => undefined)
    .then(() => {
      state.isDone = true;
    });
  await new Promise((resolve) => setTimeout(resolve, ABORT_AFTER_MS));
  if (state.isDone) return null;
  const abortedAt = performance.now();
  controller.abort();
  await pump;
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
  const audioSeconds = isPcm ? audio.length / (GEMINI_SAMPLE_RATE * 2) : null;
  return {
    bytes: isPcm ? pcmToWav(audio, GEMINI_SAMPLE_RATE) : audio,
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
  writeFileSync(new URL(file, NEXT_DIR), made.bytes);
  return { ...made.sample, file };
};

const isAuthFailure = (message: string) => /answered (401|403)$/.test(message);
// Reached only once every retry wait is spent: the quota is gone for today,
// so the provider's other voices would each wait out the same retries.
const isSpentQuota = (message: string) => {
  const status = statusOf(message);
  return status !== null && RETRY_STATUSES.has(status);
};

const runReply = async (
  provider: TtsProvider,
  voice: { id: string },
  item: Reply,
): Promise<Sample> => {
  const text = toSpokenText(item.text);
  const runs = await inSequence(Array.from({ length: RUNS }), () =>
    speakOnce(provider, text, voice.id, DELIVERY[item.tone]),
  );
  const sample = saveSample(
    provider.id,
    voice.id,
    item,
    toSample(provider.id, item, text.length, runs[0], runs[0].audio),
  );
  return {
    ...sample,
    firstByteMs: medianOf(runs.map((result) => result.firstByteMs)),
    totalMs: medianOf(runs.map((result) => result.totalMs)),
  };
};

const runVoice = async (
  provider: TtsProvider,
  voice: { id: string; label: string },
  halt: { error: string | null },
): Promise<VoiceResult> => {
  const noteFailure = (error: unknown) => {
    const message = messageOf(error);
    if (isAuthFailure(message) || isSpentQuota(message)) halt.error = message;
    return message;
  };
  // One untimed call first, so connection and token setup stay out of the medians.
  const voiceError =
    halt.error ??
    (isAllVoices
      ? null
      : await speakOnce(
          provider,
          toSpokenText(RUN_REPLIES[0].text),
          voice.id,
          DELIVERY[RUN_REPLIES[0].tone],
        ).then(() => null, noteFailure));
  const progress = { done: 0 };
  const samples = await inSequence(RUN_REPLIES, async (item) => {
    const blocked = halt.error ?? voiceError;
    const sample =
      blocked !== null
        ? failedSample(item, blocked)
        : await runReply(provider, voice, item).catch((error) =>
            failedSample(item, noteFailure(error)),
          );
    progress.done += 1;
    process.stdout.write(
      `\r\x1b[K  ${provider.id} ${voice.label}: reply ${progress.done} of ${RUN_REPLIES.length}`,
    );
    return sample;
  });
  process.stdout.write('\r\x1b[K');
  const abortMs =
    halt.error !== null || voiceError !== null || isAllVoices
      ? null
      : await probeStreamCut(
          provider,
          toSpokenText(PROBE_REPLY.text),
          voice.id,
        ).catch(() => null);
  const failed = samples.find((sample) => sample.error !== null);
  console.log(`  ${provider.id} ${voice.label}: ${failed?.error ?? 'done'}`);
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
  const count = Math.round(GEMINI_SAMPLE_RATE * seconds);
  const pcm = new Uint8Array(count * 2);
  const view = new DataView(pcm.buffer);
  Array.from({ length: count }).forEach((_, index) =>
    view.setInt16(
      index * 2,
      Math.round(
        Math.sin((2 * Math.PI * hertz * index) / GEMINI_SAMPLE_RATE) * 6000,
      ),
      true,
    ),
  );
  return pcmToWav(pcm, GEMINI_SAMPLE_RATE);
};

const runFixture = (): ProviderResult[] =>
  PROVIDER_IDS.filter((id) => voicesFor(id).length > 0).map(
    (id, providerIndex) => ({
      id,
      skipped: null,
      voices: voicesFor(id).map((voice, voiceIndex) => ({
        id: voice.id,
        label: voice.label,
        abortMs: 40 + providerIndex * 30 + voiceIndex * 5,
        samples: RUN_REPLIES.map((item, replyIndex) => {
          const characters = toSpokenText(item.text).length;
          const firstByteMs =
            200 + providerIndex * 120 + voiceIndex * 15 + replyIndex * 5;
          const audioSeconds = characters / 15;
          const file = `samples/${id}-${voice.id}-${item.id}.wav`;
          writeFileSync(
            new URL(file, NEXT_DIR),
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
    }),
  );

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
    reason:
      voice.samples.find((sample) => sample.error !== null)?.error ?? null,
  };
};

const renderTable = (providers: ProviderResult[]) => {
  const rows = providers.flatMap((provider) =>
    provider.skipped !== null
      ? [`| ${PROVIDER_NAMES[provider.id]} | ${provider.skipped} | | | | | |`]
      : provider.voices.map((voice) => {
          const summary = summarizeVoice(voice);
          return `| ${PROVIDER_NAMES[provider.id]} | ${voice.label}${summary.failed > 0 ? ` (${summary.failed} failed: ${summary.reason})` : ''} | ${millis(summary.firstByte)} | ${seconds(summary.total)} | ${millis(voice.abortMs)} | ${summary.totalMicros === null ? 'n/a' : dollars(summary.totalMicros)} | ${summary.perThousandMicros === null ? 'n/a' : dollars(summary.perThousandMicros)} |`;
        }),
  );
  return [
    `| Provider | Voice | Median first sound | Median done | Stream cut | All ${RUN_REPLIES.length} replies | Per 1,000 characters |`,
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
};

const describeRunDates = (providers: ProviderResult[], ranAt: string) => {
  const byDay = providers.reduce<Record<string, string[]>>((days, provider) => {
    const day = (provider.ranAt ?? ranAt).slice(0, 10);
    return {
      ...days,
      [day]: [...(days[day] ?? []), PROVIDER_NAMES[provider.id]],
    };
  }, {});
  const days = Object.keys(byDay).sort();
  return days.length === 1
    ? `Run on ${days[0]}.`
    : `Run on ${days.map((day) => `${day} (${byDay[day].join(', ')})`).join('; ')}.`;
};

const writeDoc = (providers: ProviderResult[], ranAt: string) => {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const start = '<!-- results:start -->';
  const end = '<!-- results:end -->';
  const from = doc.indexOf(start);
  const to = doc.indexOf(end, from);
  if (from === -1 || to === -1) {
    console.log('docs/voice-benchmark.md has no results block; not updated.');
    return;
  }
  const block = `${start}\n\n${describeRunDates(providers, ranAt)}\n\nGemini is asked for each tone ("${DELIVERY.Composed}", "${DELIVERY.Warm}"); the others take no instructions.\n\n${renderTable(providers)}\n\n${end}`;
  writeFileSync(
    DOC_PATH,
    doc.slice(0, from) + block + doc.slice(to + end.length),
  );
};

const readPrevious = () => {
  try {
    return JSON.parse(
      readFileSync(new URL('results.json', OUT_DIR), 'utf8'),
    ) as {
      ranAt: string;
      isFixture?: boolean;
      replies?: Reply[];
      providers: ProviderResult[];
    };
  } catch {
    return null;
  }
};

/** Keeps a provider's earlier readings (and their audio) when this run leaves it out with --only. */
const carryPrevious = (id: TtsProviderId): ProviderResult | null => {
  const previous = readPrevious();
  const found = previous?.providers.find((provider) => provider.id === id);
  if (!previous || previous.isFixture !== false || !found) return null;
  const sameWords = new Set(
    (previous.replies ?? [])
      .filter((old) =>
        RUN_REPLIES.some(
          (item) => item.id === old.id && item.text === old.text,
        ),
      )
      .map((old) => old.id),
  );
  const voices = found.voices.map((voice) => ({
    ...voice,
    samples: voice.samples.filter((sample) => sameWords.has(sample.replyId)),
  }));
  const dropped =
    found.voices.flatMap((voice) => voice.samples).length -
    voices.flatMap((voice) => voice.samples).length;
  if (dropped > 0) {
    console.log(
      `${PROVIDER_NAMES[id]}: left out ${dropped} earlier readings of replies whose words have changed.`,
    );
  }
  voices
    .flatMap((voice) => voice.samples)
    .flatMap((sample) => (sample.file === null ? [] : [sample.file]))
    .filter((file) => existsSync(new URL(file, OUT_DIR)))
    .forEach((file) =>
      writeFileSync(
        new URL(file, NEXT_DIR),
        readFileSync(new URL(file, OUT_DIR)),
      ),
    );
  return { ...found, voices, ranAt: found.ranAt ?? previous.ranAt };
};

const NOT_RUN = 'Not run this time.';

const runProviders = async (ranAt: string) => {
  const built = (await buildProviders()).filter(
    (entry) => voicesFor(entry.id).length > 0,
  );
  return inSequence(built, async (entry): Promise<ProviderResult> => {
    if (onlyIds.length > 0 && !onlyIds.includes(entry.id)) {
      const carried = carryPrevious(entry.id);
      if (carried !== null) {
        console.log(`${PROVIDER_NAMES[entry.id]}: kept from the earlier run.`);
        return carried;
      }
      return { id: entry.id, ranAt, skipped: NOT_RUN, voices: [] };
    }
    if (entry.provider === null) {
      console.log(entry.skipped);
      return { id: entry.id, ranAt, skipped: entry.skipped, voices: [] };
    }
    const provider = entry.provider;
    console.log(`${PROVIDER_NAMES[entry.id]}:`);
    const halt = { error: null as string | null };
    const voices = await inSequence(voicesFor(entry.id), (voice) =>
      runVoice(provider, voice, halt),
    );
    return { id: entry.id, ranAt, skipped: null, voices };
  });
};

const hasRealRun = () => readPrevious()?.isFixture === false;

const swapIn = () => {
  const previous = new URL('.previous/', OUT_DIR);
  rmSync(previous, { recursive: true, force: true });
  if (existsSync(new URL('results.json', OUT_DIR))) {
    mkdirSync(previous, { recursive: true });
    ['samples', 'results.json']
      .filter((name) => existsSync(new URL(name, OUT_DIR)))
      .forEach((name) =>
        renameSync(new URL(name, OUT_DIR), new URL(name, previous)),
      );
  }
  ['samples', 'results.json'].forEach((name) =>
    renameSync(new URL(name, NEXT_DIR), new URL(name, OUT_DIR)),
  );
  rmSync(NEXT_DIR, { recursive: true, force: true });
  rmSync(previous, { recursive: true, force: true });
};

const main = async () => {
  if (argValue('--only') !== null && onlyIds.length !== askedIds.length) {
    console.log(`--only takes one or more of: ${PROVIDER_IDS.join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  if (!Number.isInteger(RUNS) || RUNS < 1 || RUNS > 20) {
    console.log('--runs takes a whole number from 1 to 20.');
    process.exitCode = 1;
    return;
  }
  if (isFixture && !isForced && hasRealRun()) {
    console.log(
      "There's a real run in voice-benchmark/. Add --force to replace it with made-up numbers.",
    );
    process.exitCode = 1;
    return;
  }
  rmSync(NEXT_DIR, { recursive: true, force: true });
  mkdirSync(new URL('samples/', NEXT_DIR), { recursive: true });
  const ranAt = new Date().toISOString();
  const providers: ProviderResult[] = isFixture
    ? runFixture()
    : await runProviders(ranAt);
  const hasAudio = providers.some((provider) =>
    provider.voices.some((voice) =>
      voice.samples.some((sample) => sample.error === null),
    ),
  );
  if (!hasAudio) {
    console.log(
      'Nothing came back, so voice-benchmark/ and docs/voice-benchmark.md were left as they were.',
    );
    rmSync(NEXT_DIR, { recursive: true, force: true });
    return;
  }
  writeFileSync(
    new URL('results.json', NEXT_DIR),
    JSON.stringify(
      { ranAt, isFixture, replies: RUN_REPLIES, providers },
      null,
      2,
    ),
  );
  swapIn();
  console.log(`Wrote ${new URL('results.json', OUT_DIR).pathname}`);
  const isPartial = providers.some((provider) => provider.skipped === NOT_RUN);
  if (isPartial) {
    console.log(
      'Left docs/voice-benchmark.md as it was: some providers had no earlier run to keep.',
    );
  }
  if (!isFixture && !isAllVoices && !isPartial) writeDoc(providers, ranAt);
  if (!isOpening) return;
  console.log('Opening the benchmark page…');
  spawnSync(
    'npx',
    [
      'vite',
      '--open',
      `/scripts/voice/benchmark.html${isAllVoices ? '?set=all-voices' : ''}`,
    ],
    { stdio: 'inherit' },
  );
};

await main();
