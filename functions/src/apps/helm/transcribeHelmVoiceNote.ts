import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { gcmDecrypt } from '../../appKeys/gcm.js';
import type { SealedPayload } from '../../appKeys/seal.js';
import {
  transcribeAudio,
  type TranscribeResult,
} from '../../voice/transcribe.js';
import { HELM_MASTER_KEYS } from './getHelmKey.js';
import { openForHelm, sealForHelm, unwrapHelmKey } from './helmKey.js';
import { MAX_TRANSCRIPT_CHARS, MAX_VOICE_NOTE_MS } from './media/mediaCaps.js';
import { mediaObjectPath } from './media/openMedia.js';
import { loadKeyringOrFail } from './sortHelmCapture.js';

if (getApps().length === 0) {
  initializeApp();
}

export type TranscribeHelmVoiceNoteResult =
  | { status: 'ready'; text: string }
  | Extract<TranscribeResult, { status: 'held' }>;

const MEDIA_ID = /^[A-Za-z0-9_-]{1,128}$/;
const EMULATOR_TEXT = "Call the vet about Miso's booster on Friday";

const cannotOpen = () =>
  new HttpsError(
    'failed-precondition',
    "Helm can't open your things right now.",
  );

/** Writes out a recording the person just sent: it must be their own, still received and not yet sent with a turn. The words are sealed on the recording and handed back so the person can fix them before sending. */
export const transcribeHelmVoiceNote = onCall(
  {
    region: 'us-central1',
    maxInstances: 10,
    timeoutSeconds: 90,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request): Promise<TranscribeHelmVoiceNoteResult> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
    }
    const data = (request.data ?? {}) as {
      mediaId?: unknown;
      timeZone?: unknown;
    };
    if (typeof data.mediaId !== 'string' || !MEDIA_ID.test(data.mediaId)) {
      throw new HttpsError('invalid-argument', 'Which recording?');
    }
    const timeZone =
      typeof data.timeZone === 'string' && data.timeZone.length <= 64
        ? data.timeZone
        : 'UTC';
    const firestore = getFirestore();
    const ref = firestore.doc(`apps/helm/users/${uid}/media/${data.mediaId}`);
    const row = (await ref.get()).data();
    if (
      row?.kind !== 'voiceNote' ||
      row.status !== 'received' ||
      row.sourceCaptureId !== null ||
      typeof row.mimeType !== 'string' ||
      typeof row.durationMs !== 'number'
    ) {
      throw new HttpsError(
        'failed-precondition',
        'This recording is not ready.',
      );
    }
    const key = await unwrapHelmKey(firestore, loadKeyringOrFail(), uid).catch(
      () => {
        throw cannotOpen();
      },
    );
    const words = openForHelm(key, row.sealed as SealedPayload);
    if (words.keyId !== key.keyId || typeof words.bytesNonce !== 'string') {
      throw new HttpsError(
        'failed-precondition',
        'This recording is not ready.',
      );
    }
    const bytes = await getStorage()
      .bucket()
      .file(mediaObjectPath(uid, data.mediaId))
      .download()
      .then(([sealed]) =>
        gcmDecrypt(
          key.key,
          sealed.toString('base64'),
          words.bytesNonce as string,
          null,
        ),
      )
      .catch((error: unknown) => {
        logger.warn('helm.voiceNote.readFailed', {
          cause: error instanceof Error ? error.name : 'unknown',
        });
        throw new HttpsError('not-found', 'This recording is gone.');
      });
    const written = await transcribeAudio({
      firestore,
      uid,
      appId: 'helm',
      timeZone,
      bytes,
      mimeType: row.mimeType,
      claimedMs: Math.min(row.durationMs, MAX_VOICE_NOTE_MS),
      emulatorText: EMULATOR_TEXT,
    });
    if (written.status === 'held') return written;
    const text = written.text.slice(0, MAX_TRANSCRIPT_CHARS);
    await ref.update({
      durationMs: Math.round(written.durationMs),
      sealed: sealForHelm(key, { ...words, text }),
    });
    return { status: 'ready', text };
  },
);
