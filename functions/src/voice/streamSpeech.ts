import { getApps, initializeApp } from 'firebase-admin/app';
import { isForcedFixture, isRunningInEmulator } from '../emulator.js';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';

import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import { createDeepgramAura } from './providers/deepgramAura.js';
import { createGeminiTts } from './providers/geminiTts.js';
import { createGoogleTts } from './providers/googleTts.js';
import type { TtsProvider } from './providers/types.js';
import { releaseSpeech, reserveSpeech } from './usage.js';
import { VOICE_APPS } from './voiceApps.js';
import {
  costMicros,
  TTS_MAX_CHARS,
  VOICE_PROVIDER_DEFAULT,
} from './voiceConfig.js';

if (getApps().length === 0) {
  initializeApp();
}

export type SpeechPriority = 'ack' | 'reply' | 'summary';

export type SpeechRequest =
  | {
      ok: true;
      appId: string;
      text: string;
      priority: SpeechPriority;
      timeZone: string;
      voiceName: string;
      speed: number;
    }
  | { ok: false; status: number; error: string };

const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://apps.moondreams.dev',
  /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
];
const isEmulator = isRunningInEmulator;
// The dev server and a phone on the LAN load the page over plain HTTP from any host.
const SERVED_ORIGINS: (string | RegExp)[] = isEmulator()
  ? [...ALLOWED_ORIGINS, /^http:\/\/[^/]+:\d+$/]
  : ALLOWED_ORIGINS;
const PRIORITIES: readonly string[] = ['ack', 'reply', 'summary'];
const PROVIDER_TIMEOUT_MS = 10_000;
const TONE_RATE = 24_000;

const refuse = (status: number, error: string): SpeechRequest => ({
  ok: false,
  status,
  error,
});

/** The method, origin and body checks; the person's tokens are checked by the handler. */
export function readSpeechRequest({
  method,
  origin,
  body,
  allowedOrigins,
}: {
  method: string;
  origin: string | undefined;
  body: unknown;
  allowedOrigins: readonly (string | RegExp)[];
}): SpeechRequest {
  if (method !== 'POST') return refuse(405, 'method');
  const isAllowed =
    origin !== undefined &&
    allowedOrigins.some((entry) =>
      typeof entry === 'string' ? entry === origin : entry.test(origin),
    );
  if (!isAllowed) return refuse(403, 'origin');

  const { appId, text, priority, timeZone, voiceId, speed } = (body ??
    {}) as Record<string, unknown>;
  if (typeof appId !== 'string' || !Object.hasOwn(VOICE_APPS, appId)) {
    return refuse(400, 'app');
  }
  if (typeof text !== 'string' || text.trim() === '')
    return refuse(400, 'text');
  if (text.length > TTS_MAX_CHARS) return refuse(413, 'too-long');
  if (typeof priority !== 'string' || !PRIORITIES.includes(priority)) {
    return refuse(400, 'priority');
  }
  const { voiceNames, defaultVoice, speedRange } = VOICE_APPS[appId];
  return {
    ok: true,
    appId,
    text,
    priority: priority as SpeechPriority,
    timeZone:
      typeof timeZone === 'string' && timeZone.length <= 64 ? timeZone : 'UTC',
    voiceName:
      typeof voiceId === 'string' && voiceNames.includes(voiceId)
        ? voiceId
        : defaultVoice,
    speed:
      typeof speed === 'number' &&
      Number.isFinite(speed) &&
      speed >= speedRange.min &&
      speed <= speedRange.max
        ? Math.round(speed * 100) / 100
        : 1,
  };
}

const secretReader = createOptionalSecretReader({ fetch: globalThis.fetch });
const keyState = { isMissingLogged: false };

const SECRET_NAMES = {
  deepgramAura: 'DEEPGRAM_API_KEY',
  geminiTts: 'GEMINI_API_KEY',
} as const;

// One client keeps its gRPC channel open across requests.
const kept: { googleTts: TtsProvider | null } = { googleTts: null };

const getProvider = async (
  id: typeof VOICE_PROVIDER_DEFAULT | keyof typeof SECRET_NAMES,
): Promise<TtsProvider | null> => {
  if (id === 'googleTts') {
    if (isEmulator()) return null;
    kept.googleTts ??= createGoogleTts({
      projectId: process.env.GCLOUD_PROJECT ?? '',
    });
    return kept.googleTts;
  }
  if (isForcedFixture(id === 'deepgramAura' ? 'deepgram' : 'gemini')) {
    return null;
  }
  const apiKey = await secretReader(
    SECRET_NAMES[id],
    AbortSignal.timeout(4_000),
  );
  if (apiKey === null) return null;
  return id === 'deepgramAura'
    ? createDeepgramAura({ apiKey })
    : createGeminiTts({ apiKey });
};

const TONE_CHUNKS = 4;

const makeTone = () => {
  const count = Math.round(TONE_RATE * 0.6);
  const fade = Math.round(TONE_RATE * 0.05);
  const pcm = new Uint8Array(count * 2);
  const view = new DataView(pcm.buffer);
  Array.from({ length: count }).forEach((_, index) =>
    view.setInt16(
      index * 2,
      Math.round(
        Math.sin((2 * Math.PI * 440 * index) / TONE_RATE) *
          3_000 *
          Math.min(1, index / fade, (count - index) / fade),
      ),
      true,
    ),
  );
  const size = Math.ceil(count / TONE_CHUNKS) * 2;
  return Array.from({ length: TONE_CHUNKS }, (_, index) =>
    pcm.slice(index * size, (index + 1) * size),
  ).filter((chunk) => chunk.length > 0);
};

const toStatus = (error: unknown) =>
  Number(/answered (\d{3})/.exec(String(error))?.[1]) || null;

const bearerOf = (header: string | undefined) =>
  /^Bearer (.+)$/.exec(header ?? '')?.[1] ?? null;

export const streamSpeech = onRequest(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 30,
    cors: SERVED_ORIGINS,
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    const fail = (status: number, error: string, extra = {}) => {
      res.status(status).json({ error, ...extra });
    };

    const request = readSpeechRequest({
      method: req.method,
      origin: req.headers.origin,
      body: req.body,
      allowedOrigins: SERVED_ORIGINS,
    });
    if (!request.ok) return fail(request.status, request.error);

    const idToken = bearerOf(req.headers.authorization);
    const uid = await (idToken === null
      ? Promise.resolve(null)
      : getAuth()
          .verifyIdToken(idToken)
          .then((decoded) => decoded.uid)
          .catch(() => null));
    if (uid === null) return fail(401, 'unauthenticated');

    const appCheckToken = req.header('X-Firebase-AppCheck');
    // The emulator cannot reach App Check, so a present header is taken as is there.
    const isAppCheckOk =
      !!appCheckToken &&
      (isEmulator() ||
        (await getAppCheck()
          .verifyToken(appCheckToken)
          .then(() => true)
          .catch(() => false)));
    if (!isAppCheckOk) return fail(401, 'app-check');

    const { appId, text, timeZone, voiceName, speed } = request;
    const limits = VOICE_APPS[appId];
    const providerId = VOICE_PROVIDER_DEFAULT;
    const provider = await getProvider(providerId);
    if (provider === null && !isEmulator()) {
      if (!keyState.isMissingLogged) {
        keyState.isMissingLogged = true;
        logger.error('voice.speechKeyMissing', {
          event: 'voice.speechKeyMissing',
        });
      }
      return fail(503, 'unavailable');
    }
    keyState.isMissingLogged = false;

    const firestore = getFirestore();
    const now = Date.now();
    const characters = text.length;
    const cost = costMicros(providerId, {
      characters,
      audioSeconds: Math.ceil(characters / 12),
    });
    const held = await reserveSpeech(firestore, {
      uid,
      limits,
      now,
      timeZone,
      characters,
      costMicros: cost,
    }).catch(() => {
      logger.error('voice.reserveFailed', { event: 'voice.reserveFailed' });
      return 'failed' as const;
    });
    if (held === 'failed') return fail(503, 'unavailable');
    if (held !== null) return fail(429, 'held', { reason: held });
    const release = () =>
      releaseSpeech(firestore, {
        uid,
        now,
        timeZone,
        characters,
        costMicros: cost,
      });

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Expose-Headers', 'X-Voice-Provider');
    if (provider === null) {
      res.setHeader('Content-Type', `audio/L16; rate=${TONE_RATE}; channels=1`);
      res.setHeader('X-Voice-Provider', 'emulator');
      res.status(200);
      makeTone().forEach((chunk) => res.write(chunk));
      res.end();
      return;
    }

    const aborter = new AbortController();
    const isEnded = { value: false };
    res.on('close', () => {
      if (!isEnded.value) aborter.abort();
    });
    const signal = AbortSignal.any([
      aborter.signal,
      AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    ]);

    const speech = await provider
      .speak({
        text,
        voiceId:
          providerId === 'googleTts'
            ? `en-US-Chirp3-HD-${voiceName}`
            : limits.voices[providerId],
        format: 'mp3',
        speed,
        signal,
      })
      .catch(async (error: unknown) => {
        await release();
        const status = toStatus(error);
        logger.error('voice.speechFailed', {
          event: 'voice.speechFailed',
          status,
        });
        if ((status === 401 || status === 403) && providerId !== 'googleTts') {
          secretReader.forget(SECRET_NAMES[providerId]);
        }
        return null;
      });
    if (speech === null) return fail(502, 'unavailable');

    const reader = speech.stream.getReader();
    const first = await reader.read().catch(() => null);
    if (first === null || first.done || first.value.length === 0) {
      await release();
      logger.error('voice.speechFailed', {
        event: 'voice.speechFailed',
        status: null,
      });
      return fail(502, 'unavailable');
    }

    logger.info('voice.speechStarted', {
      event: 'voice.speechStarted',
      providerId,
      voiceName,
      speed,
    });
    res.status(200);
    res.setHeader('Content-Type', speech.contentType);
    res.setHeader('X-Voice-Provider', providerId);
    const write = async (bytes: Uint8Array) => {
      if (res.destroyed) throw new Error('The client left');
      if (res.write(bytes)) return;
      await new Promise((resolve) => {
        res.once('drain', resolve);
        res.once('close', resolve);
      });
    };
    const pump = async (): Promise<void> => {
      const chunk = await reader.read();
      if (chunk.done) return;
      await write(chunk.value);
      return pump();
    };
    await write(first.value);
    await pump().catch(() =>
      logger.error('voice.speechCut', { event: 'voice.speechCut' }),
    );
    isEnded.value = true;
    res.end();
  },
);
