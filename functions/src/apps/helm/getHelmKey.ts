import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import type { Keyring } from '../../appKeys/keyring.js';
import { createKeyringLoader } from '../../appKeys/loadKeyring.js';
import {
  unwrapDataKey,
  wrapDataKey,
  type WrappedKey,
} from '../../appKeys/wrap.js';
import { createDataKey, wrappedKeyPath } from './helmKey.js';

if (getApps().length === 0) {
  initializeApp();
}

export const HELM_MASTER_KEYS = defineSecret('HELM_MASTER_KEYS');

/** Validated on an instance's first call and again whenever the secret's text changes. */
export const loadHelmKeyring = createKeyringLoader(HELM_MASTER_KEYS);

const CANNOT_OPEN = "Helm can't open your things right now.";

function loadKeyringOrFail(): Keyring {
  try {
    return loadHelmKeyring();
  } catch {
    logger.error('helm.keys.keyringInvalid');
    throw new HttpsError('failed-precondition', CANNOT_OPEN);
  }
}

/** A failed unwrap never falls through to creating a key: the stored one is the person's Helm. */
function unwrapOrFail(keyring: Keyring, uid: string, wrapped: WrappedKey) {
  try {
    return unwrapDataKey(keyring, uid, wrapped);
  } catch {
    logger.error('helm.keys.unwrapFailed', {
      masterKeyId: wrapped.masterKeyId,
    });
    throw new HttpsError('failed-precondition', CANNOT_OPEN);
  }
}

export const getHelmKey = onCall(
  {
    region: 'us-central1',
    maxInstances: 5,
    timeoutSeconds: 20,
    enforceAppCheck: true,
    secrets: [HELM_MASTER_KEYS],
    cors: [
      'https://apps.moondreams.dev',
      /^https:\/\/moondreams-dev-apps.*\.web\.app$/,
    ],
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Sign in to open Helm.');
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
      appId: 'helm',
      keyId: opened.keyId,
      keyVersion: opened.keyVersion,
      key: opened.key.toString('hex'),
      dropBoxKey: null,
    };
    return result;
  },
);
