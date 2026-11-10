import { getApps, initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { GoogleAuth } from 'google-auth-library';

import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import { createDeepgramAura } from './providers/deepgramAura.js';
import { createGeminiTts } from './providers/geminiTts.js';
import { createGoogleTts } from './providers/googleTts.js';
import { pcmToWav } from './providers/pcm.js';
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
    }
  | { ok: false; status: number; error: string };

const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://apps.moondreams.dev',
  /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
];
const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';
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

  const { appId, text, priority, timeZone } = (body ?? {}) as Record<
    string,
    unknown
  >;
  if (typeof appId !== 'string' || !Object.hasOwn(VOICE_APPS, appId)) {
    return refuse(400, 'app');
  }
  if (typeof text !== 'string' || text.trim() === '')
    return refuse(400, 'text');
  if (text.length > TTS_MAX_CHARS) return refuse(413, 'too-long');
  if (typeof priority !== 'string' || !PRIORITIES.includes(priority)) {
    return refuse(400, 'priority');
  }
  return {
    ok: true,
    appId,
    text,
    priority: priority as SpeechPriority,
    timeZone:
      typeof timeZone === 'string' && timeZone.length <= 64 ? timeZone : 'UTC',
  };
}

const secretReader = createOptionalSecretReader({ fetch: globalThis.fetch });
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const keyState = { isMissingLogged: false };

const SECRET_NAMES = {
  deepgramAura: 'DEEPGRAM_API_KEY',
  geminiTts: 'GEMINI_API_KEY',
} as const;

const getProvider = async (
  id: typeof VOICE_PROVIDER_DEFAULT | keyof typeof SECRET_NAMES,
): Promise<TtsProvider | null> => {
  if (id === 'googleTts') {
    return isEmulator()
      ? null
      : createGoogleTts({
          projectId: process.env.GCLOUD_PROJECT ?? '',
          getAccessToken: async () => {
            const token = await googleAuth.getAccessToken();
            if (!token) throw new Error('No Google access token');
            return token;
          },
        });
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
  return pcmToWav(pcm, TONE_RATE);
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

    const { appId, text, timeZone } = request;
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
    });
    if (held !== null) return fail(429, 'held', { reason: held });

    res.setHeader('Cache-Control', 'no-store');
    if (provider === null) {
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('X-Voice-Provider', 'emulator');
      res.status(200).end(Buffer.from(makeTone()));
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
        voiceId: limits.voices[providerId],
        format: 'mp3',
        signal,
      })
      .catch(async (error: unknown) => {
        await releaseSpeech(firestore, {
          uid,
          now,
          timeZone,
          characters,
          costMicros: cost,
        });
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

    res.status(200);
    res.setHeader('Content-Type', speech.contentType);
    res.setHeader('X-Voice-Provider', providerId);
    const reader = speech.stream.getReader();
    const pump = async (): Promise<void> => {
      const chunk = await reader.read();
      if (chunk.done) return;
      res.write(chunk.value);
      return pump();
    };
    await pump().catch(() =>
      logger.error('voice.speechCut', { event: 'voice.speechCut' }),
    );
    isEnded.value = true;
    res.end();
  },
);
