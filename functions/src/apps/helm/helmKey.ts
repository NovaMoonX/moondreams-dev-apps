import type { Firestore } from 'firebase-admin/firestore';

import {
  keyCheckOpens as keyCheckOpensWith,
  makeKeyCheck as makeKeyCheckWith,
  type KeyCheckDoc,
} from '../../appKeys/canary.js';
import type { Keyring } from '../../appKeys/keyring.js';
import {
  openWithKey,
  sealWithKey,
  type SealedPayload,
} from '../../appKeys/seal.js';
import {
  createDataKey as createDataKeyWith,
  deriveSeedDataKey as deriveSeedDataKeyWith,
  unwrapStoredKey,
} from '../../appKeys/wrap.js';

/** The version every payload sealed here carries inside it. */
const SEALED_SCHEMA_VERSION = 1;

const KEY_ID_PREFIX = 'helm-key';

export const createDataKey = () => createDataKeyWith(KEY_ID_PREFIX);

/** A fixed key per uid so a seeded document opens like a real one; never used outside the seed. */
export const deriveSeedDataKey = (keyring: Keyring, uid: string) =>
  deriveSeedDataKeyWith(keyring, uid, KEY_ID_PREFIX);

export const wrappedKeyPath = (uid: string) =>
  `apps/helm/server/${uid}/keys/data`;

/** What a master key's canary seals: a fixed value, so a wrong key or a damaged document is told apart from a healthy one. */
export const KEY_CHECK_VALUE = 'helm-master-key-check-v1';

export const keyCheckPath = (masterKeyId: string) =>
  `apps/helm/keyChecks/${masterKeyId}`;

export const makeKeyCheck = (
  keyring: Keyring,
  masterKeyId: string,
  now: number,
) => makeKeyCheckWith(keyring, masterKeyId, now, KEY_CHECK_VALUE);

export const keyCheckOpens = (
  keyring: Keyring,
  masterKeyId: string,
  check: KeyCheckDoc,
) => keyCheckOpensWith(keyring, masterKeyId, check, KEY_CHECK_VALUE);

export interface HelmKey {
  keyId: string;
  keyVersion: number;
  key: Buffer;
}

/** The only server code besides `getHelmKey` that touches a raw data key; it stays in the calling request. Throws when the person has no key yet or it no longer opens. */
export const unwrapHelmKey = (
  firestore: Firestore,
  keyring: Keyring,
  uid: string,
): Promise<HelmKey> =>
  unwrapStoredKey(firestore, keyring, uid, wrappedKeyPath(uid));

/** Seals fields for a person from a function, in the shape the browser opens. */
export const sealForHelm = (
  key: HelmKey,
  fields: Record<string, unknown>,
): SealedPayload => sealWithKey(key, fields, SEALED_SCHEMA_VERSION);

export const openForHelm = (
  key: HelmKey,
  sealed: SealedPayload,
): Record<string, unknown> => openWithKey(key.key, sealed);
