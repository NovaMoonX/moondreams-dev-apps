import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import {
  createDataKey,
  DEV_KEYRING,
  readKeyring,
  unwrapDataKey,
  wrapDataKey,
  wrappedKeyPath,
  type Keyring,
  type WrappedKey,
} from './planKey.js';

if (getApps().length === 0) {
  initializeApp();
}

export const RUNWAY_MASTER_KEYS = defineSecret('RUNWAY_MASTER_KEYS');

const CANNOT_OPEN = 'Your plan cannot be opened right now.';
const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

function readSecretValue() {
  try {
    return RUNWAY_MASTER_KEYS.value();
  } catch (error) {
    if (!isEmulator()) throw error;
    return '';
  }
}

let cached: { raw: string; keyring: Keyring } | null = null;

/** Validated on an instance's first call and again whenever the secret's text changes. */
function loadKeyring(): Keyring {
  const raw = readSecretValue();
  if (cached && cached.raw === raw) return cached.keyring;
  const keyring = !raw && isEmulator() ? DEV_KEYRING : readKeyring(raw);
  cached = { raw, keyring };
  return keyring;
}

function loadKeyringOrFail(): Keyring {
  try {
    return loadKeyring();
  } catch {
    logger.error('runway.keys.keyringInvalid');
    throw new HttpsError('failed-precondition', CANNOT_OPEN);
  }
}

/** A failed unwrap never falls through to creating a key: the stored one is the plan. */
function unwrapOrFail(keyring: Keyring, uid: string, wrapped: WrappedKey) {
  try {
    return unwrapDataKey(keyring, uid, wrapped);
  } catch {
    logger.error('runway.keys.unwrapFailed', {
      masterKeyId: wrapped.masterKeyId,
    });
    throw new HttpsError('failed-precondition', CANNOT_OPEN);
  }
}

export const getRunwayKey = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    secrets: [RUNWAY_MASTER_KEYS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open your plan.');
    }

    const keyring = loadKeyringOrFail();
    const firestore = getFirestore();
    const ref = firestore.doc(wrappedKeyPath(uid));

    const opened = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const now = Date.now();

      if (!snapshot.exists) {
        const data = createDataKey();
        transaction.create(ref, wrapDataKey(keyring, uid, data, now));
        return { keyId: data.keyId, keyVersion: 1, key: data.key };
      }

      const wrapped = snapshot.data() as WrappedKey;
      const key = unwrapOrFail(keyring, uid, wrapped);
      if (wrapped.masterKeyId !== keyring.current) {
        transaction.set(
          ref,
          wrapDataKey(
            keyring,
            uid,
            { keyId: wrapped.keyId, key },
            now,
            wrapped.createdAt,
          ),
        );
      }
      return { keyId: wrapped.keyId, keyVersion: wrapped.keyVersion, key };
    });

    const result = {
      appId: 'runway',
      keyId: opened.keyId,
      keyVersion: opened.keyVersion,
      key: opened.key.toString('hex'),
    };
    return result;
  },
);
