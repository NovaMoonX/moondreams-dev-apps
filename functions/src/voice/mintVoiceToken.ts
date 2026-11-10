import { randomUUID } from 'node:crypto';
import { isRunningInEmulator } from '../emulator.js';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import { grantDeepgramToken } from './providers/deepgram.js';
import { releaseListen, reserveListen, type ClosedListen } from './usage.js';
import { VOICE_APPS } from './voiceApps.js';
import { STT_MODEL, VOICE_TOKEN_TTL_SECONDS } from './voiceConfig.js';

if (getApps().length === 0) {
  initializeApp();
}

export type MintVoiceTokenResult =
  | {
      status: 'ready';
      token: string;
      expiresAt: number;
      provider: 'deepgram';
      model: string;
      mintId: string;
    }
  | {
      status: 'held';
      reason: 'listenLimit' | 'mintLimit' | 'budgetReached' | 'unavailable';
    };

const KEY_NAME = 'DEEPGRAM_API_KEY';
const MAX_CLOSED = 10;
const MINT_ID = /^[A-Za-z0-9_-]{1,64}$/;

const secretReader = createOptionalSecretReader({ fetch: globalThis.fetch });
const keyState = { isMissingLogged: false };

const unavailable = (): MintVoiceTokenResult => ({
  status: 'held',
  reason: 'unavailable',
});

const toClosed = (value: unknown): ClosedListen[] =>
  (Array.isArray(value) ? value : [])
    .flatMap((entry: unknown) => {
      const { mintId, ms } = (entry ?? {}) as {
        mintId?: unknown;
        ms?: unknown;
      };
      return typeof mintId === 'string' &&
        MINT_ID.test(mintId) &&
        typeof ms === 'number' &&
        Number.isFinite(ms)
        ? [{ mintId, ms }]
        : [];
    })
    .slice(0, MAX_CLOSED);

const toStatus = (error: unknown) =>
  Number(/deepgram answered (\d{3})/.exec(String(error))?.[1]) || null;

export const mintVoiceToken = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 10,
    enforceAppCheck: true,
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<MintVoiceTokenResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to use voice.');
    }
    const data = (request.data ?? {}) as {
      appId?: unknown;
      timeZone?: unknown;
      closed?: unknown;
    };
    const limits =
      typeof data.appId === 'string' && Object.hasOwn(VOICE_APPS, data.appId)
        ? VOICE_APPS[data.appId]
        : null;
    if (limits === null) {
      throw new HttpsError('invalid-argument', 'Unknown app.');
    }
    const timeZone =
      typeof data.timeZone === 'string' && data.timeZone.length <= 64
        ? data.timeZone
        : 'UTC';
    const closed = toClosed(data.closed);

    const apiKey = await secretReader(KEY_NAME, AbortSignal.timeout(4_000));
    const isEmulatorStub = apiKey === null && isRunningInEmulator();
    if (apiKey === null && !isEmulatorStub) {
      if (!keyState.isMissingLogged) {
        keyState.isMissingLogged = true;
        logger.error('voice.keyMissing', { event: 'voice.keyMissing' });
      }
      return unavailable();
    }
    keyState.isMissingLogged = false;

    const firestore = getFirestore();
    const now = Date.now();
    const mintId = randomUUID();
    const held = await reserveListen(firestore, {
      uid,
      limits,
      now,
      timeZone,
      closed,
      mintId,
    });
    if (held !== null) return { status: 'held', reason: held };

    if (apiKey === null) {
      return {
        status: 'ready',
        token: 'emulator',
        expiresAt: now + VOICE_TOKEN_TTL_SECONDS * 1000,
        provider: 'deepgram',
        model: STT_MODEL,
        mintId,
      };
    }

    try {
      const granted = await grantDeepgramToken({
        apiKey,
        ttlSeconds: VOICE_TOKEN_TTL_SECONDS,
        signal: AbortSignal.timeout(4_000),
      });
      return {
        status: 'ready',
        token: granted.token,
        expiresAt: now + granted.expiresInSeconds * 1000,
        provider: 'deepgram',
        model: STT_MODEL,
        mintId,
      };
    } catch (error) {
      await releaseListen(firestore, { uid, now, timeZone, mintId });
      const status = toStatus(error);
      logger.error('voice.grantFailed', {
        event: 'voice.grantFailed',
        status,
      });
      if (status === 401 || status === 403) secretReader.forget(KEY_NAME);
      return unavailable();
    }
  },
);
