import { createHash, timingSafeEqual } from 'node:crypto';

import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { gcmDecrypt, gcmEncrypt } from './gcm.js';
import { masterKeyBytes, type Keyring } from './keyring.js';

/** Lets a scheduled check prove a master key still works, without touching any person's data. */
export interface KeyCheckDoc {
  masterKeyId: string;
  createdAt: number;
  wrapped: string;
  nonce: string;
  expectedDigest: string;
}

const sha256Hex = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');

/** `checkValue` is the fixed text a keyring's canary seals, so a wrong key or a damaged document is told apart from a healthy one. */
export function makeKeyCheck(
  keyring: Keyring,
  masterKeyId: string,
  now: number,
  checkValue: string,
): KeyCheckDoc {
  const plain = Buffer.from(checkValue);
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

/** True only when the keyring's key for this id opens the canary to `checkValue`. Never throws. */
export function keyCheckOpens(
  keyring: Keyring,
  masterKeyId: string,
  check: KeyCheckDoc,
  checkValue: string,
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
      plain.toString() === checkValue;
    return result;
  } catch {
    return false;
  }
}

export type KeyFailureReason =
  | 'secret-unreadable'
  | 'keyring-invalid'
  | 'missing-id'
  | 'missing-canary'
  | 'unwrap-failed'
  | 'check-error';

export interface KeyFailure {
  masterKeyId: string | null;
  reason: KeyFailureReason;
}

/** Where a keyring's canaries live, the text they seal and the event prefix its log lines carry. */
export interface KeyCheckSpec {
  collectionPath: string;
  checkValue: string;
  eventPrefix: string;
}

/** Reads the keyring as a request would; the reason tells a version Secret Manager would not give from a keyring that is damaged. */
function readKeyringOrReason(
  load: () => Keyring,
): { keyring: Keyring } | { failure: KeyFailure } {
  try {
    return { keyring: load() };
  } catch (error) {
    const isDamaged =
      error instanceof Error && /master key/.test(error.message);
    const failure: KeyFailure = {
      masterKeyId: null,
      reason: isDamaged ? 'keyring-invalid' : 'secret-unreadable',
    };
    return { failure };
  }
}

/** Every id in the keyring must open its canary, and every canary must have its id in the keyring. Ids and reasons only; nothing else leaves. */
export async function checkKeyring(
  firestore: Firestore,
  spec: KeyCheckSpec,
  load: () => Keyring,
) {
  const read = readKeyringOrReason(load);
  if ('failure' in read) {
    const result = { checked: 0, failures: [read.failure] };
    return result;
  }
  const { keyring } = read;
  const ids = Object.keys(keyring.keys);

  try {
    const snapshot = await firestore.collection(spec.collectionPath).get();
    const canaries = new Map(
      snapshot.docs.map((doc) => [doc.id, doc.data() as KeyCheckDoc]),
    );
    const failures: KeyFailure[] = [
      ...ids.flatMap((masterKeyId): KeyFailure[] => {
        const canary = canaries.get(masterKeyId);
        if (!canary) return [{ masterKeyId, reason: 'missing-canary' }];
        return keyCheckOpens(keyring, masterKeyId, canary, spec.checkValue)
          ? []
          : [{ masterKeyId, reason: 'unwrap-failed' }];
      }),
      ...[...canaries.keys()]
        .filter((masterKeyId) => !Object.hasOwn(keyring.keys, masterKeyId))
        .map((masterKeyId): KeyFailure => ({
          masterKeyId,
          reason: 'missing-id',
        })),
    ];
    const result = { checked: ids.length, failures };
    return result;
  } catch {
    const result = {
      checked: 0,
      failures: [{ masterKeyId: null, reason: 'check-error' } as KeyFailure],
    };
    return result;
  }
}

/** One structured entry per run: `<prefix>.ok` at INFO, `<prefix>.failed` at ERROR. */
export async function runKeyringCheck(
  firestore: Firestore,
  spec: KeyCheckSpec,
  load: () => Keyring,
) {
  const { checked, failures } = await checkKeyring(firestore, spec, load);
  if (failures.length === 0) {
    const event = `${spec.eventPrefix}.ok`;
    logger.info(event, { event, checked });
  } else {
    const event = `${spec.eventPrefix}.failed`;
    logger.error(event, { event, checked, failures });
  }
  return failures;
}
