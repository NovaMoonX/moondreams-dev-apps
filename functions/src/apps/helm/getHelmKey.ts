import { getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  type DocumentReference,
  type Transaction,
} from 'firebase-admin/firestore';
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
import {
  createDropBoxPair,
  unwrapDropBoxKey,
  wrapDropBoxKey,
  type DropBoxKeyDoc,
} from './dropBox.js';
import { createDataKey, dropBoxKeyPath, wrappedKeyPath } from './helmKey.js';

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
    const dropBoxRef = firestore.doc(dropBoxKeyPath(uid));
    // Made outside the transaction, which may run again, and only when no key is stored yet.
    const hasDropBox = (await dropBoxRef.get()).exists;
    const freshPair = hasDropBox ? null : await createDropBoxPair();

    // A drop-box key that won't open never fails the data key: the public half is still returned and nothing is replaced.
    const settleDropBox = async (
      transaction: Transaction,
      reference: DocumentReference,
      stored: DropBoxKeyDoc | null,
    ) => {
      const now = Date.now();
      if (!stored) {
        const pair = freshPair ?? (await createDropBoxPair());
        transaction.create(reference, wrapDropBoxKey(keyring, uid, pair, now));
        return pair.publicJwk;
      }
      if (stored.masterKeyId !== keyring.current) {
        try {
          const privateKey = unwrapDropBoxKey(keyring, uid, stored);
          transaction.set(
            reference,
            wrapDropBoxKey(
              keyring,
              uid,
              { publicJwk: stored.publicJwk, privateKey },
              stored.createdAt,
            ),
          );
        } catch {
          logger.error('helm.keys.dropBoxUnwrapFailed', {
            masterKeyId: stored.masterKeyId,
          });
        }
      }
      return stored.publicJwk;
    };

    const opened = await firestore.runTransaction(async (transaction) => {
      const [snapshot, dropBoxSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(dropBoxRef),
      ]);
      const now = Date.now();
      const dropBoxKey = await settleDropBox(
        transaction,
        dropBoxRef,
        dropBoxSnapshot.exists
          ? (dropBoxSnapshot.data() as DropBoxKeyDoc)
          : null,
      );

      if (!snapshot.exists) {
        const data = createDataKey();
        transaction.create(ref, wrapDataKey(keyring, uid, data, now));
        return {
          keyId: data.keyId,
          keyVersion: 1,
          key: data.key,
          dropBoxKey,
        };
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
      return {
        keyId: wrapped.keyId,
        keyVersion: wrapped.keyVersion,
        key,
        dropBoxKey,
      };
    });

    const result = {
      appId: 'helm',
      keyId: opened.keyId,
      keyVersion: opened.keyVersion,
      key: opened.key.toString('hex'),
      dropBoxKey: opened.dropBoxKey,
    };
    return result;
  },
);
