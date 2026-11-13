import { hkdfSync } from 'node:crypto';

import {
  keyCheckOpens as keyCheckOpensWith,
  makeKeyCheck as makeKeyCheckWith,
  type KeyCheckDoc,
} from '../appKeys/canary.js';
import { masterKeyBytes, type Keyring } from '../appKeys/keyring.js';

/** What a master key's canary seals: a fixed value, so a wrong key or a damaged document is told apart from a healthy one. */
export const KEY_CHECK_VALUE = 'connections-master-key-check-v1';

export const KEY_CHECK_COLLECTION = 'connectionsServer/keyChecks/ids';

export const keyCheckPath = (masterKeyId: string) =>
  `${KEY_CHECK_COLLECTION}/${masterKeyId}`;

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

/** A key for one purpose, derived from a master key so no stored value is ever sealed with the master itself. */
export const deriveSubkey = (
  keyring: Keyring,
  masterKeyId: string,
  purpose: string,
) =>
  Buffer.from(
    hkdfSync(
      'sha256',
      masterKeyBytes(keyring, masterKeyId),
      Buffer.alloc(0),
      purpose,
      32,
    ),
  );
