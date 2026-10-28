import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { loadKeyring, RUNWAY_MASTER_KEYS } from './getRunwayKey.js';
import { keyCheckOpens, type KeyCheckDoc, type Keyring } from './planKey.js';

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

/** Reads the keyring the way the key callable does; the reason tells a version Secret Manager would not give from a keyring that is damaged. */
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
export async function checkRunwayKeys(
  firestore: Firestore,
  load: () => Keyring = loadKeyring,
) {
  const read = readKeyringOrReason(load);
  if ('failure' in read) {
    const result = { checked: 0, failures: [read.failure] };
    return result;
  }
  const { keyring } = read;
  const ids = Object.keys(keyring.keys);

  try {
    const snapshot = await firestore.collection('apps/runway/keyChecks').get();
    const canaries = new Map(
      snapshot.docs.map((doc) => [doc.id, doc.data() as KeyCheckDoc]),
    );
    const failures: KeyFailure[] = [
      ...ids.flatMap((masterKeyId): KeyFailure[] => {
        const canary = canaries.get(masterKeyId);
        if (!canary) return [{ masterKeyId, reason: 'missing-canary' }];
        return keyCheckOpens(keyring, masterKeyId, canary)
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

/** One structured entry per run: `runway.keys.ok` at INFO, `runway.keys.failed` at ERROR. */
export async function runKeyCheck(
  firestore: Firestore,
  load: () => Keyring = loadKeyring,
) {
  const { checked, failures } = await checkRunwayKeys(firestore, load);
  if (failures.length === 0) {
    logger.info('runway.keys.ok', { event: 'runway.keys.ok', checked });
  } else {
    logger.error('runway.keys.failed', {
      event: 'runway.keys.failed',
      checked,
      failures,
    });
  }
  return failures;
}

export const verifyRunwayKeys = onSchedule(
  {
    region: 'us-central1',
    schedule: '17 6 * * *',
    timeZone: 'UTC',
    timeoutSeconds: 60,
    secrets: [RUNWAY_MASTER_KEYS],
  },
  async () => {
    await runKeyCheck(getFirestore());
  },
);
