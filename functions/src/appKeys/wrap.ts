import { createHmac, randomBytes } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';

import { gcmDecrypt, gcmEncrypt } from './gcm.js';
import { KEY_BYTES, masterKeyBytes, type Keyring } from './keyring.js';

/** A stored data key, wrapped under one named master key. The uid is bound in as authenticated data. */
export interface WrappedKey {
  uid: string;
  keyId: string;
  keyVersion: number;
  masterKeyId: string;
  algorithm: 'AES-256-GCM';
  ciphertext: string;
  nonce: string;
  createdAt: number;
  updatedAt: number;
}

/** A new random data key; its id is the prefix and 16 random bytes of hex. */
export function createDataKey(idPrefix: string) {
  const result = {
    keyId: `${idPrefix}-${randomBytes(16).toString('hex')}`,
    key: randomBytes(KEY_BYTES),
  };
  return result;
}

/** A fixed key per uid so a seeded document opens like a real one; never used outside the seed. */
export function deriveSeedDataKey(
  keyring: Keyring,
  uid: string,
  idPrefix: string,
) {
  const master = masterKeyBytes(keyring, keyring.current);
  const key = createHmac('sha256', master).update(`seed:${uid}`).digest();
  return { keyId: `${idPrefix}-seed-${uid}`, key };
}

export function wrapDataKey(
  keyring: Keyring,
  uid: string,
  data: { keyId: string; key: Buffer },
  now: number,
  createdAt = now,
): WrappedKey {
  const { ciphertext, nonce } = gcmEncrypt(
    masterKeyBytes(keyring, keyring.current),
    data.key,
    Buffer.from(uid),
  );
  const result: WrappedKey = {
    uid,
    keyId: data.keyId,
    keyVersion: 1,
    masterKeyId: keyring.current,
    algorithm: 'AES-256-GCM',
    ciphertext,
    nonce,
    createdAt,
    updatedAt: now,
  };
  return result;
}

/** Throws when the named master key is missing or the key no longer opens; callers never replace a key on a throw. */
export function unwrapDataKey(
  keyring: Keyring,
  uid: string,
  wrapped: WrappedKey,
) {
  const key = gcmDecrypt(
    masterKeyBytes(keyring, wrapped.masterKeyId),
    wrapped.ciphertext,
    wrapped.nonce,
    Buffer.from(uid),
  );
  if (key.length !== KEY_BYTES) {
    throw new Error('The unwrapped key is not 32 bytes.');
  }
  return key;
}

/** Reads and unwraps the stored key at a path; throws when there is none. The key stays in the caller's request. */
export async function unwrapStoredKey(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  path: string,
) {
  const snapshot = await firestore.doc(path).get();
  if (!snapshot.exists) {
    throw new Error('There is no stored key yet.');
  }
  const wrapped = snapshot.data() as WrappedKey;
  const result = {
    keyId: wrapped.keyId,
    keyVersion: wrapped.keyVersion,
    key: unwrapDataKey(keyring, uid, wrapped),
  };
  return result;
}
