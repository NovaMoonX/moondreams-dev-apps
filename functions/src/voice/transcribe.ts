import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { isRunningInEmulator } from '../emulator.js';
import { createOptionalSecretReader } from '../imageSearch/optionalSecret.js';
import { transcribeDeepgram } from './providers/deepgram.js';
import { reserveTranscribe, settleTranscribe } from './usage.js';
import { VOICE_APPS } from './voiceApps.js';
import {
  STT_MODEL,
  TRANSCRIBE_GRACE_MS,
  TRANSCRIBE_MAX_BYTES,
  TRANSCRIBE_MAX_MS,
  transcribeCostMicros,
} from './voiceConfig.js';

const KEY_NAME = 'DEEPGRAM_API_KEY';

const secretReader = createOptionalSecretReader({ fetch: globalThis.fetch });

export type TranscribeResult =
  | { status: 'ready'; text: string; durationMs: number }
  | {
      status: 'held';
      reason: 'listenLimit' | 'budgetReached' | 'unavailable' | 'tooLong';
    };

const held = (reason: 'unavailable' | 'tooLong'): TranscribeResult => ({
  status: 'held',
  reason,
});

/** Writes out one recording. Its claimed length is reserved against the person's day and the site's day first, then settled at the length the provider measures; a recording that turns out longer than the limit is charged but refused. In the emulator with no key it answers `emulatorText` and charges the claimed length. */
export async function transcribeAudio({
  firestore,
  uid,
  appId,
  timeZone,
  bytes,
  mimeType,
  claimedMs,
  emulatorText,
}: {
  firestore: Firestore;
  uid: string;
  appId: string;
  timeZone: string;
  bytes: Uint8Array;
  mimeType: string;
  claimedMs: number;
  emulatorText: string;
}): Promise<TranscribeResult> {
  const limits = Object.hasOwn(VOICE_APPS, appId) ? VOICE_APPS[appId] : null;
  if (
    limits === null ||
    bytes.byteLength === 0 ||
    bytes.byteLength > TRANSCRIBE_MAX_BYTES ||
    !Number.isFinite(claimedMs) ||
    claimedMs <= 0 ||
    claimedMs > TRANSCRIBE_MAX_MS
  ) {
    return held('tooLong');
  }
  const apiKey = await secretReader(KEY_NAME, AbortSignal.timeout(4_000));
  if (apiKey === null && !isRunningInEmulator()) {
    logger.error('voice.keyMissing', { event: 'voice.keyMissing' });
    return held('unavailable');
  }
  const now = Date.now();
  const reservedMs = Math.ceil(claimedMs);
  const reservedMicros = transcribeCostMicros(reservedMs);
  const reason = await reserveTranscribe(firestore, {
    uid,
    limits,
    now,
    timeZone,
    reserveMs: reservedMs,
    reserveMicros: reservedMicros,
  });
  if (reason !== null) return { status: 'held', reason };

  const settle = (actualMs: number) =>
    settleTranscribe(firestore, {
      uid,
      now,
      timeZone,
      reservedMs,
      reservedMicros,
      actualMs,
      actualMicros: transcribeCostMicros(actualMs),
    });
  if (apiKey === null) {
    await settle(reservedMs);
    return { status: 'ready', text: emulatorText, durationMs: reservedMs };
  }
  try {
    const written = await transcribeDeepgram({
      apiKey,
      bytes,
      mimeType,
      model: STT_MODEL,
      signal: AbortSignal.timeout(60_000),
    });
    await settle(written.durationMs);
    return written.durationMs > TRANSCRIBE_MAX_MS + TRANSCRIBE_GRACE_MS
      ? held('tooLong')
      : { status: 'ready', text: written.text, durationMs: written.durationMs };
  } catch (error) {
    await settle(0);
    const status = Number(/deepgram answered (\d{3})/.exec(String(error))?.[1]);
    logger.error('voice.transcribeFailed', {
      event: 'voice.transcribeFailed',
      status: status || null,
      error: error instanceof Error ? error.name : 'unknown',
    });
    if (status === 401 || status === 403) secretReader.forget(KEY_NAME);
    return held('unavailable');
  }
}
