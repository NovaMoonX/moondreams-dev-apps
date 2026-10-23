import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';

export const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface Keyring {
  current: string;
  keys: Record<string, string>;
}

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

/** Same shape the browser's `@lib/security` produces and opens. */
export interface SealedPayload {
  value: string;
  ciphertext: string;
  nonce: string;
  keyId: string;
  keyVersion: number;
  algorithm: 'AES-256-GCM';
}

/** Emulators only: the keyring used when `functions/.secret.local` has none. */
export const DEV_KEYRING: Keyring = {
  current: 'dev1',
  keys: {
    dev1: '5f2c7a9e1b4d8036c9e5a7f2d1b3c8e04a6f9d2b7c5e1a3f8d4b6c9e2a7f5d31',
  },
};

const isHex32 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);

/** Fails closed: a malformed keyring, a `current` outside `keys` or any key that is not 32 bytes throws. */
export function readKeyring(raw: string | undefined | null): Keyring {
  const parsed = parseJson(raw);
  const keys = parsed?.keys;
  if (
    !parsed ||
    typeof parsed.current !== 'string' ||
    !keys ||
    typeof keys !== 'object' ||
    Array.isArray(keys) ||
    Object.keys(keys).length === 0
  ) {
    throw new Error('The master keyring is malformed.');
  }
  if (!Object.hasOwn(keys, parsed.current)) {
    throw new Error('The master keyring names a current key it does not hold.');
  }
  if (!Object.values(keys).every(isHex32)) {
    throw new Error('Every master key must be 32 bytes of hex.');
  }
  const result: Keyring = {
    current: parsed.current,
    keys: keys as Record<string, string>,
  };
  return result;
}

function parseJson(
  raw: string | undefined | null,
): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const masterKeyBytes = (keyring: Keyring, masterKeyId: string) => {
  if (!Object.hasOwn(keyring.keys, masterKeyId)) {
    throw new Error(
      'The master key this was wrapped with is not in the keyring.',
    );
  }
  return Buffer.from(keyring.keys[masterKeyId], 'hex');
};

function gcmEncrypt(key: Buffer, plain: Buffer, aad: Buffer | null) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  if (aad) cipher.setAAD(aad);
  const body = Buffer.concat([
    cipher.update(plain),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    ciphertext: body.toString('base64'),
    nonce: nonce.toString('base64'),
  };
}

function gcmDecrypt(
  key: Buffer,
  ciphertext: string,
  nonce: string,
  aad: Buffer | null,
) {
  const body = Buffer.from(ciphertext, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(nonce, 'base64'),
  );
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
  const plain = Buffer.concat([
    decipher.update(body.subarray(0, body.length - TAG_BYTES)),
    decipher.final(),
  ]);
  return plain;
}

export function createDataKey() {
  const result = {
    keyId: `runway-key-${randomBytes(16).toString('hex')}`,
    key: randomBytes(KEY_BYTES),
  };
  return result;
}

/** A fixed key per uid so a seeded plan opens like a real one; never used outside the seed. */
export function deriveSeedDataKey(keyring: Keyring, uid: string) {
  const master = masterKeyBytes(keyring, keyring.current);
  const key = createHmac('sha256', master).update(`seed:${uid}`).digest();
  return { keyId: `runway-key-seed-${uid}`, key };
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

/** Seals a JSON object the way the app does, so a function can write a field the app opens. */
export function sealWithKey(
  data: { keyId: string; keyVersion: number; key: Buffer },
  fields: Record<string, unknown>,
  schemaVersion: number,
): SealedPayload {
  const { ciphertext, nonce } = gcmEncrypt(
    data.key,
    Buffer.from(JSON.stringify({ v: schemaVersion, ...fields })),
    null,
  );
  const result: SealedPayload = {
    value: ciphertext,
    ciphertext,
    nonce,
    keyId: data.keyId,
    keyVersion: data.keyVersion,
    algorithm: 'AES-256-GCM',
  };
  return result;
}

export function openWithKey(
  key: Buffer,
  sealed: SealedPayload,
): Record<string, unknown> {
  const plain = gcmDecrypt(key, sealed.value, sealed.nonce, null);
  const result = JSON.parse(plain.toString('utf8')) as Record<string, unknown>;
  return result;
}

export const wrappedKeyPath = (uid: string) =>
  `apps/runway/server/${uid}/keys/data`;

/** The only server code besides `getRunwayKey` that touches a raw plan key; the key stays in this call. */
export async function unwrapPlanKey(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
) {
  const snapshot = await firestore.doc(wrappedKeyPath(uid)).get();
  if (!snapshot.exists) {
    throw new Error('This plan has no key yet.');
  }
  const wrapped = snapshot.data() as WrappedKey;
  const result = {
    keyId: wrapped.keyId,
    keyVersion: wrapped.keyVersion,
    key: unwrapDataKey(keyring, uid, wrapped),
  };
  return result;
}

/** Seals fields for a plan from a function (bank-data import, later issues). */
export async function sealForPlan(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  fields: Record<string, unknown>,
  schemaVersion: number,
) {
  const data = await unwrapPlanKey(firestore, keyring, uid);
  const result = sealWithKey(data, fields, schemaVersion);
  return result;
}

/** What a master key's canary seals: a fixed value, so a wrong key or a damaged document is told apart from a healthy one. */
const KEY_CHECK_VALUE = 'runway-master-key-check-v1';

/** Lets `verifyRunwayKeys` prove a master key still works, without touching any plan. */
export interface KeyCheckDoc {
  masterKeyId: string;
  createdAt: number;
  wrapped: string;
  nonce: string;
  expectedDigest: string;
}

export const keyCheckPath = (masterKeyId: string) =>
  `apps/runway/keyChecks/${masterKeyId}`;

const sha256Hex = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');

export function makeKeyCheck(
  keyring: Keyring,
  masterKeyId: string,
  now: number,
): KeyCheckDoc {
  const plain = Buffer.from(KEY_CHECK_VALUE);
  const { ciphertext, nonce } = gcmEncrypt(
    masterKeyBytes(keyring, masterKeyId),
    plain,
    Buffer.from(masterKeyId),
  );
  const result: KeyCheckDoc = {
    masterKeyId,
    createdAt: now,
    wrapped: ciphertext,
    nonce,
    expectedDigest: sha256Hex(plain),
  };
  return result;
}

/** True only when the keyring's key for this id opens the canary to the fixed value. Never throws. */
export function keyCheckOpens(
  keyring: Keyring,
  masterKeyId: string,
  check: KeyCheckDoc,
) {
  try {
    const plain = gcmDecrypt(
      masterKeyBytes(keyring, masterKeyId),
      check.wrapped,
      check.nonce,
      Buffer.from(masterKeyId),
    );
    const actual = Buffer.from(sha256Hex(plain));
    const expected = Buffer.from(String(check.expectedDigest));
    const result =
      actual.length === expected.length &&
      timingSafeEqual(actual, expected) &&
      plain.toString() === KEY_CHECK_VALUE;
    return result;
  } catch {
    return false;
  }
}
