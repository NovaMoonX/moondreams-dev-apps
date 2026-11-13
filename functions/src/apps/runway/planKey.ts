import type { Firestore } from 'firebase-admin/firestore';

import {
  keyCheckOpens as keyCheckOpensWith,
  makeKeyCheck as makeKeyCheckWith,
  type KeyCheckDoc,
} from '../../appKeys/canary.js';
import type { Keyring } from '../../appKeys/keyring.js';
import { sealWithKey, type SealedPayload } from '../../appKeys/seal.js';
import {
  createDataKey as createDataKeyWith,
  deriveSeedDataKey as deriveSeedDataKeyWith,
  unwrapStoredKey,
} from '../../appKeys/wrap.js';

export { gcmDecrypt, gcmEncrypt } from '../../appKeys/gcm.js';
export {
  DEV_KEYRING,
  KEY_BYTES,
  readKeyring,
  type Keyring,
} from '../../appKeys/keyring.js';
export {
  openWithKey,
  sealWithKey,
  type SealedPayload,
} from '../../appKeys/seal.js';
export {
  unwrapDataKey,
  wrapDataKey,
  type WrappedKey,
} from '../../appKeys/wrap.js';
export type { KeyCheckDoc } from '../../appKeys/canary.js';

const KEY_ID_PREFIX = 'runway-key';

export const createDataKey = () => createDataKeyWith(KEY_ID_PREFIX);

/** A fixed key per uid so a seeded plan opens like a real one; never used outside the seed. */
export const deriveSeedDataKey = (keyring: Keyring, uid: string) =>
  deriveSeedDataKeyWith(keyring, uid, KEY_ID_PREFIX);

export const wrappedKeyPath = (uid: string) =>
  `apps/runway/server/${uid}/keys/data`;

/** The only server code besides `getRunwayKey` that touches a raw plan key; the key stays in this call. */
export const unwrapPlanKey = (
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
) => unwrapStoredKey(firestore, keyring, uid, wrappedKeyPath(uid));

/** Seals fields for a plan from a function (bank-data import, later issues). */
export async function sealForPlan(
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
  fields: Record<string, unknown>,
  schemaVersion: number,
): Promise<SealedPayload> {
  const data = await unwrapPlanKey(firestore, keyring, uid);
  const result = sealWithKey(data, fields, schemaVersion);
  return result;
}

/** What a master key's canary seals: a fixed value, so a wrong key or a damaged document is told apart from a healthy one. */
export const KEY_CHECK_VALUE = 'runway-master-key-check-v1';

export const keyCheckPath = (masterKeyId: string) =>
  `apps/runway/keyChecks/${masterKeyId}`;

export const makeKeyCheck = (
  keyring: Keyring,
  masterKeyId: string,
  now: number,
) => makeKeyCheckWith(keyring, masterKeyId, now, KEY_CHECK_VALUE);

/** True only when the keyring's key for this id opens the canary to the fixed value. Never throws. */
export const keyCheckOpens = (
  keyring: Keyring,
  masterKeyId: string,
  check: KeyCheckDoc,
) => keyCheckOpensWith(keyring, masterKeyId, check, KEY_CHECK_VALUE);
